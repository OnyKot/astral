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

import {createUserID, type UserID} from '~/BrandedTypes';
import {Config} from '~/Config';
import {Logger} from '~/Logger';
import type {Payment} from '~/Models';
import type {IUserRepository} from '~/user/IUserRepository';

const REFERRAL_PERCENT_STEP = 10;
const REFERRAL_PERCENT_CAP = 50;
const PAYOUT_INTERVAL_DAYS = 7;

export interface ReferralProgramSummary {
	referralCode: string;
	shareUrl: string;
	paidReferralsCount: number;
	rewardPercent: number;
	maxRewardPercent: number;
	totalRewardCents: number;
	payoutIntervalDays: number;
	supportBotUsername: string | null;
}

export class StripeReferralService {
	constructor(private readonly userRepository: IUserRepository) {}

	getReferralCode(userId: UserID): string {
		return userId.toString();
	}

	async resolveReferrerUserId(currentUserId: UserID, referralCode?: string | null): Promise<UserID | null> {
		if (!referralCode) return null;

		try {
			const referrerUserId = createUserID(BigInt(referralCode.trim()));
			if (referrerUserId === currentUserId) {
				return null;
			}

			const referrer = await this.userRepository.findUnique(referrerUserId);
			return referrer ? referrerUserId : null;
		} catch {
			return null;
		}
	}

	async getSummary(userId: UserID): Promise<ReferralProgramSummary> {
		const rewardedPayments = await this.getRewardedReferralPayments(userId);
		const paidReferralsCount = this.countUniqueReferredUsers(rewardedPayments);
		const totalRewardCents = rewardedPayments.reduce((sum, payment) => sum + payment.referralRewardCents, 0);

		return {
			referralCode: this.getReferralCode(userId),
			shareUrl: `${Config.endpoints.webApp}/register?ref=${encodeURIComponent(this.getReferralCode(userId))}`,
			paidReferralsCount,
			rewardPercent: Math.min(paidReferralsCount * REFERRAL_PERCENT_STEP, REFERRAL_PERCENT_CAP),
			maxRewardPercent: REFERRAL_PERCENT_CAP,
			totalRewardCents,
			payoutIntervalDays: PAYOUT_INTERVAL_DAYS,
			supportBotUsername: 'AstraSuport_bot',
		};
	}

	async finalizeReferralReward(payment: Payment): Promise<number> {
		if (!payment.referrerUserId || payment.isGift || payment.status !== 'completed' || payment.amountCents <= 0) {
			return 0;
		}

		if (payment.userId === payment.referrerUserId || payment.referralRewardCents > 0) {
			return payment.referralRewardCents;
		}

		const rewardedPayments = await this.getRewardedReferralPayments(payment.referrerUserId);
		if (this.hasExistingRewardForUser(rewardedPayments, payment.userId)) {
			Logger.info(
				{
					checkoutSessionId: payment.checkoutSessionId,
					referrerUserId: payment.referrerUserId,
					referredUserId: payment.userId,
				},
				'Skipping duplicate referral reward because this referred user already has a rewarded purchase',
			);
			return 0;
		}

		const rewardedReferralCount = this.countUniqueReferredUsers(rewardedPayments);
		const rewardPercent = Math.min((rewardedReferralCount + 1) * REFERRAL_PERCENT_STEP, REFERRAL_PERCENT_CAP);
		const rewardCents = Math.max(0, Math.floor((payment.amountCents * rewardPercent) / 100));

		Logger.info(
			{
				checkoutSessionId: payment.checkoutSessionId,
				referrerUserId: payment.referrerUserId,
				referredUserId: payment.userId,
				rewardPercent,
				rewardCents,
			},
			'Calculated referral payout for completed premium purchase',
		);

		return rewardCents;
	}

	private async getRewardedReferralPayments(referrerUserId: UserID): Promise<Array<Payment>> {
		const payments = await this.userRepository.findPaymentsByReferrerUserId(referrerUserId);
		return payments.filter((payment) => payment.status === 'completed' && !payment.isGift && payment.referralRewardCents > 0);
	}

	private countUniqueReferredUsers(payments: Array<Payment>): number {
		return new Set(payments.map((payment) => payment.userId.toString())).size;
	}

	private hasExistingRewardForUser(payments: Array<Payment>, referredUserId: UserID): boolean {
		return payments.some((payment) => payment.userId.toString() === referredUserId.toString());
	}
}
