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
import {AdminACLs} from '~/Constants';
import type {PremiumWaitlistRow} from '~/database/types/PremiumWaitlistTypes';
import {requireAdminACL} from '~/middleware/AdminMiddleware';
import {RateLimitMiddleware} from '~/middleware/RateLimitMiddleware';
import {AdminRateLimitConfigs} from '~/rate_limit_configs/AdminRateLimitConfig';
import {z} from '~/Schema';
import {Validator} from '~/Validator';

const serializePremiumWaitlistEntry = (row: PremiumWaitlistRow) => ({
	user_id: row.user_id.toString(),
	plan: row.plan,
	comment: row.comment,
	created_at: row.created_at.toISOString(),
	updated_at: row.updated_at.toISOString(),
});

export const PremiumWaitlistAdminController = (app: HonoApp) => {
	app.get(
		'/admin/premium/waitlist',
		RateLimitMiddleware(AdminRateLimitConfigs.ADMIN_LOOKUP),
		requireAdminACL(AdminACLs.PREMIUM_WAITLIST_VIEW),
		Validator(
			'query',
			z.object({
				limit: z.coerce.number().int().min(1).max(2000).optional(),
			}),
		),
		async (ctx) => {
			const {limit} = ctx.req.valid('query');
			const rows = await ctx.get('premiumWaitlistService').list(limit);
			return ctx.json({
				entries: rows.map(serializePremiumWaitlistEntry),
			});
		},
	);
};
