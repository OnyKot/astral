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

import type {UserID} from '~/BrandedTypes';
import {SYSTEM_USER_ID} from '~/constants/Core';
import type {IEmailService} from '~/infrastructure/IEmailService';
import type {IUserRepository} from '~/user/IUserRepository';
import type {BulkSendEmailBroadcastRequest} from '../models';
import type {AdminAuditService} from './AdminAuditService';

interface AdminBulkEmailServiceDeps {
	userRepository: IUserRepository;
	emailService: IEmailService;
	auditService: AdminAuditService;
}

interface BulkOperationError {
	id: string;
	error: string;
}

export class AdminBulkEmailService {
	constructor(private readonly deps: AdminBulkEmailServiceDeps) {}

	async sendEmailBroadcast(data: BulkSendEmailBroadcastRequest, adminUserId: UserID, auditLogReason: string | null) {
		const failed: Array<BulkOperationError> = [];
		let successfulCount = 0;
		let lastUserId: UserID | undefined;
		let processedCount = 0;

		for (;;) {
			const batch = await this.deps.userRepository.listAllUsersPaginated(250, lastUserId);
			if (batch.length === 0) break;

			lastUserId = batch[batch.length - 1]?.id;

			for (const user of batch) {
				if (!user.email || !user.emailVerified || user.emailBounced || user.isBot || user.isSystem) {
					continue;
				}

				processedCount += 1;
				const sent = await this.deps.emailService.sendAdminBroadcastEmail(
					user.email,
					user.globalName ?? user.username,
					data.subject,
					data.body,
					user.locale,
					{
						broadcastKey: data.broadcast_key ?? null,
						category: data.category ?? null,
						attachTrackingHeaders: data.attach_tracking_headers,
					},
				);

				if (sent) {
					successfulCount += 1;
				} else {
					failed.push({
						id: user.id.toString(),
						error: user.email,
					});
				}
			}
		}

		await this.deps.auditService.createAuditLog({
			adminUserId,
			targetType: 'system',
			targetId: BigInt(SYSTEM_USER_ID),
			action: 'bulk_send_email_broadcast',
			auditLogReason,
			metadata: new Map([
				['subject', data.subject],
				['broadcast_key', data.broadcast_key ?? ''],
				['category', data.category ?? ''],
				['attach_tracking_headers', data.attach_tracking_headers ? 'true' : 'false'],
				['processed_count', processedCount.toString(10)],
				['successful_count', successfulCount.toString(10)],
				['failed_count', failed.length.toString(10)],
			]),
		});

		return {
			successful: [],
			failed,
			successful_count: successfulCount,
			failed_count: failed.length,
		};
	}
}
