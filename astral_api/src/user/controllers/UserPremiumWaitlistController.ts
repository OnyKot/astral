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

import type {HonoApp} from '~/App';
import type {PremiumWaitlistRow} from '~/database/types/PremiumWaitlistTypes';
import {DefaultUserOnly, LoginRequired} from '~/middleware/AuthMiddleware';
import {RateLimitMiddleware} from '~/middleware/RateLimitMiddleware';
import {RateLimitConfigs} from '~/RateLimitConfig';
import {z} from '~/Schema';
import {Validator} from '~/Validator';

const PremiumWaitlistJoinRequest = z.object({
	plan: z.enum(['monthly', 'yearly', 'visionary']),
	comment: z.string().max(500).nullable().optional(),
});

const serializePremiumWaitlistEntry = (row: PremiumWaitlistRow) => ({
	user_id: row.user_id.toString(),
	plan: row.plan,
	comment: row.comment,
	created_at: row.created_at.toISOString(),
	updated_at: row.updated_at.toISOString(),
});

export const UserPremiumWaitlistController = (app: HonoApp) => {
	app.get(
		'/users/@me/premium/waitlist',
		RateLimitMiddleware(RateLimitConfigs.DEFAULT),
		LoginRequired,
		DefaultUserOnly,
		async (ctx) => {
			const row = await ctx.get('premiumWaitlistService').get(ctx.get('user').id);
			return ctx.json(serializePremiumWaitlistEntry(row));
		},
	);

	app.post(
		'/users/@me/premium/waitlist',
		RateLimitMiddleware(RateLimitConfigs.DEFAULT),
		LoginRequired,
		DefaultUserOnly,
		Validator('json', PremiumWaitlistJoinRequest),
		async (ctx) => {
			const body = ctx.req.valid('json');
			const row = await ctx.get('premiumWaitlistService').join(ctx.get('user').id, body);
			return ctx.json(serializePremiumWaitlistEntry(row));
		},
	);
};
