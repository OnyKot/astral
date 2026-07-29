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
import {APIErrorCodes} from '~/Constants';
import type {PremiumWaitlistPlan, PremiumWaitlistRow} from '~/database/types/PremiumWaitlistTypes';
import {BadRequestError} from '~/errors/BadRequestError';
import {BillingOnlineError} from '~/errors/BillingOnlineError';
import {PremiumWaitlistNotFoundError} from '~/errors/PremiumWaitlistNotFoundError';
import {isBillingOnline} from '~/payments/BillingUtils';
import type {PremiumWaitlistRepository} from '~/user/repositories/PremiumWaitlistRepository';

const MAX_COMMENT = 500;
const PLANS = new Set<PremiumWaitlistPlan>(['monthly', 'yearly', 'visionary']);

export class PremiumWaitlistService {
	constructor(private readonly repo: PremiumWaitlistRepository) {}

	async join(
		userId: UserID,
		input: {plan: string; comment?: string | null},
	): Promise<PremiumWaitlistRow> {
		if (isBillingOnline()) throw new BillingOnlineError();
		if (!PLANS.has(input.plan as PremiumWaitlistPlan)) {
			throw new BadRequestError({
				code: APIErrorCodes.INVALID_FORM_BODY,
				message: 'Invalid plan',
			});
		}
		const commentRaw = input.comment?.trim() ?? '';
		if (commentRaw.length > MAX_COMMENT) {
			throw new BadRequestError({
				code: APIErrorCodes.INVALID_FORM_BODY,
				message: 'Comment must be at most 500 characters',
			});
		}
		const comment = commentRaw.length === 0 ? null : commentRaw;
		const existing = await this.repo.findByUserId(userId);
		const now = new Date();
		const row: PremiumWaitlistRow = {
			user_id: userId,
			plan: input.plan as PremiumWaitlistPlan,
			comment,
			created_at: existing?.created_at ?? now,
			updated_at: now,
		};
		return await this.repo.upsert(row);
	}

	async get(userId: UserID): Promise<PremiumWaitlistRow> {
		const row = await this.repo.findByUserId(userId);
		if (!row) throw new PremiumWaitlistNotFoundError();
		return row;
	}

	async list(limit = 500): Promise<Array<PremiumWaitlistRow>> {
		const rows = await this.repo.listAll();
		return rows
			.slice()
			.sort((a, b) => b.updated_at.getTime() - a.updated_at.getTime())
			.slice(0, limit);
	}
}
