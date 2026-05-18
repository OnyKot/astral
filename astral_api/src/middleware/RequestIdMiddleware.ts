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

import {randomUUID} from 'node:crypto';
import {createMiddleware} from 'hono/factory';
import type {HonoEnv} from '~/App';

export const RequestIdMiddleware = createMiddleware<HonoEnv>(async (ctx, next) => {
	const requestId = ctx.req.header('x-request-id')?.trim() || randomUUID();
	ctx.set('requestId', requestId);
	ctx.header('X-Request-Id', requestId);
	await next();
});
