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
import {requireAdminACL} from '~/middleware/AdminMiddleware';
import {RateLimitMiddleware} from '~/middleware/RateLimitMiddleware';
import {RateLimitConfigs} from '~/RateLimitConfig';
import {
	advanceReleaseWave,
	fullReleaseRollout,
	getOpsSnapshot,
	runOpsSmokeChecks,
	writeReleaseVersionJson,
} from '../services/AdminOpsService';

export const OpsAdminController = (app: HonoApp) => {
	app.get(
		'/admin/ops/snapshot',
		RateLimitMiddleware(RateLimitConfigs.ADMIN_LOOKUP),
		requireAdminACL(AdminACLs.METRICS_VIEW),
		async (ctx) => ctx.json(await getOpsSnapshot()),
	);

	app.post(
		'/admin/ops/smoke',
		RateLimitMiddleware(RateLimitConfigs.ADMIN_LOOKUP),
		requireAdminACL(AdminACLs.METRICS_VIEW),
		async (ctx) => ctx.json(await runOpsSmokeChecks()),
	);

	app.post(
		'/admin/ops/release/advance',
		RateLimitMiddleware(RateLimitConfigs.ADMIN_GATEWAY_RELOAD),
		requireAdminACL(AdminACLs.METRICS_VIEW),
		async (ctx) => {
			try {
				return ctx.json(await advanceReleaseWave());
			} catch (error) {
				return ctx.json(
					{
						ok: false,
						error: error instanceof Error ? error.message : String(error),
					},
					500,
				);
			}
		},
	);

	app.post(
		'/admin/ops/release/full',
		RateLimitMiddleware(RateLimitConfigs.ADMIN_GATEWAY_RELOAD),
		requireAdminACL(AdminACLs.METRICS_VIEW),
		async (ctx) => {
			try {
				return ctx.json(await fullReleaseRollout());
			} catch (error) {
				return ctx.json(
					{
						ok: false,
						error: error instanceof Error ? error.message : String(error),
					},
					500,
				);
			}
		},
	);

	app.post(
		'/admin/ops/release/write-version',
		RateLimitMiddleware(RateLimitConfigs.ADMIN_GATEWAY_RELOAD),
		requireAdminACL(AdminACLs.METRICS_VIEW),
		async (ctx) => {
			try {
				return ctx.json(await writeReleaseVersionJson());
			} catch (error) {
				return ctx.json(
					{
						ok: false,
						error: error instanceof Error ? error.message : String(error),
					},
					500,
				);
			}
		},
	);
};
