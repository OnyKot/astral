/*
 * Copyright (C) 2026 Astral Contributors
 *
 * This file is part of Astral.
 *
 * Astral is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * Astral is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with Astral. If not, see <https://www.gnu.org/licenses/>.
 */

import type {VerifyEmailRequest} from '~/auth/AuthModel';
import {createEmailVerificationToken} from '~/BrandedTypes';
import {SuspiciousActivityFlags, UserFlags} from '~/Constants';
import {InputValidationError, RateLimitError} from '~/Errors';
import {resolveEmailLinkContextFromRequest} from '~/infrastructure/EmailLinkContextResolver';
import type {IEmailService} from '~/infrastructure/IEmailService';
import type {IGatewayService} from '~/infrastructure/IGatewayService';
import type {IRateLimitService} from '~/infrastructure/IRateLimitService';
import {Logger} from '~/Logger';
import {getUserSearchService} from '~/Meilisearch';
import type {User} from '~/Models';
import type {IUserRepository} from '~/user/IUserRepository';
import {mapUserToPrivateResponse} from '~/user/UserModel';

const EMAIL_CLEARABLE_SUSPICIOUS_ACTIVITY_FLAGS =
	SuspiciousActivityFlags.REQUIRE_VERIFIED_EMAIL |
	SuspiciousActivityFlags.REQUIRE_REVERIFIED_EMAIL |
	SuspiciousActivityFlags.REQUIRE_VERIFIED_EMAIL_OR_VERIFIED_PHONE |
	SuspiciousActivityFlags.REQUIRE_REVERIFIED_EMAIL_OR_VERIFIED_PHONE |
	SuspiciousActivityFlags.REQUIRE_VERIFIED_EMAIL_OR_REVERIFIED_PHONE |
	SuspiciousActivityFlags.REQUIRE_REVERIFIED_EMAIL_OR_REVERIFIED_PHONE;

const normalizeEmail = (email: string | null | undefined): string | null => {
	const normalized = email?.trim().toLowerCase();
	return normalized && normalized.length > 0 ? normalized : null;
};

export class AuthEmailService {
	constructor(
		private repository: IUserRepository,
		private emailService: IEmailService,
		private gatewayService: IGatewayService,
		private rateLimitService: IRateLimitService,
		private assertNonBotUser: (user: User) => void,
		private generateSecureToken: () => Promise<string>,
	) {}

	async verifyEmail(data: VerifyEmailRequest): Promise<boolean> {
		const tokenData = await this.repository.getEmailVerificationToken(data.token);
		if (!tokenData) {
			return false;
		}

		const user = await this.repository.findUnique(tokenData.userId);
		if (!user) {
			await this.repository.deleteEmailVerificationToken(data.token);
			return false;
		}

		this.assertNonBotUser(user);

		if (user.flags & UserFlags.DELETED) {
			await this.repository.deleteEmailVerificationToken(data.token);
			return false;
		}

		const tokenEmail = normalizeEmail(tokenData.email);
		const userEmail = normalizeEmail(user.email);
		if (!tokenEmail || !userEmail || tokenEmail !== userEmail) {
			Logger.warn(
				{userId: user.id, tokenEmail: tokenData.email, currentEmail: user.email},
				'Refusing stale email verification token',
			);
			await this.repository.deleteEmailVerificationToken(data.token);
			return false;
		}

		const updates: {email_verified: boolean; email_bounced?: boolean; suspicious_activity_flags?: number} = {
			email_verified: true,
			email_bounced: false,
		};

		if (user.suspiciousActivityFlags !== null && user.suspiciousActivityFlags !== 0) {
			const newFlags = user.suspiciousActivityFlags & ~EMAIL_CLEARABLE_SUSPICIOUS_ACTIVITY_FLAGS;
			if (newFlags !== user.suspiciousActivityFlags) {
				updates.suspicious_activity_flags = newFlags;
			}
		}

		const updatedUser = await this.repository.patchUpsert(user.id, updates);
		await this.repository.deleteEmailVerificationToken(data.token);

		const userSearchService = getUserSearchService();
		if (userSearchService && updatedUser) {
			await userSearchService.updateUser(updatedUser).catch((error) => {
				Logger.error({userId: user.id, error}, 'Failed to update user in search');
			});
		}

		await this.gatewayService.dispatchPresence({
			userId: user.id,
			event: 'USER_UPDATE',
			data: mapUserToPrivateResponse(updatedUser!),
		});

		return true;
	}

	async resendVerificationEmail(user: User, request: Request): Promise<void> {
		this.assertNonBotUser(user);

		const allowReverification =
			user.suspiciousActivityFlags !== null &&
			((user.suspiciousActivityFlags & SuspiciousActivityFlags.REQUIRE_REVERIFIED_EMAIL) !== 0 ||
				(user.suspiciousActivityFlags & SuspiciousActivityFlags.REQUIRE_REVERIFIED_EMAIL_OR_VERIFIED_PHONE) !== 0 ||
				(user.suspiciousActivityFlags & SuspiciousActivityFlags.REQUIRE_VERIFIED_EMAIL_OR_REVERIFIED_PHONE) !== 0 ||
				(user.suspiciousActivityFlags & SuspiciousActivityFlags.REQUIRE_REVERIFIED_EMAIL_OR_REVERIFIED_PHONE) !== 0);

		if (user.emailVerified && !allowReverification) {
			return;
		}

		const recipientEmail = normalizeEmail(user.email);
		if (!recipientEmail) {
			throw InputValidationError.create('email', 'Email is required.');
		}
		if (user.emailBounced) {
			throw InputValidationError.create('email', 'Email address cannot receive verification messages.');
		}

		const rateLimits = await Promise.all([
			this.rateLimitService.checkLimit({
				identifier: `email_verification:${recipientEmail}`,
				maxAttempts: 3,
				windowMs: 15 * 60 * 1000,
			}),
			this.rateLimitService.checkLimit({
				identifier: `email_verification:user:${user.id}`,
				maxAttempts: 3,
				windowMs: 15 * 60 * 1000,
			}),
		]);

		const blocked = rateLimits.find((limit) => !limit.allowed);
		if (blocked) {
			const retryAfter =
				blocked.retryAfter ?? Math.max(0, Math.ceil((blocked.resetTime.getTime() - Date.now()) / 1000));
			throw new RateLimitError({
				message: 'Too many verification email requests. Please try again later.',
				retryAfter,
				limit: 3,
				resetTime: blocked.resetTime,
			});
		}

		const emailVerifyToken = createEmailVerificationToken(await this.generateSecureToken());
		await this.repository.createEmailVerificationToken({
			token_: emailVerifyToken,
			user_id: user.id,
			email: recipientEmail,
		});

		await this.emailService.sendEmailVerification(
			recipientEmail,
			user.username,
			emailVerifyToken,
			user.locale,
			resolveEmailLinkContextFromRequest(request),
		);
	}
}
