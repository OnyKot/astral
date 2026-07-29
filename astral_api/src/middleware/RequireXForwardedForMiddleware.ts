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

import {createMiddleware} from 'hono/factory';
import {HTTPException} from 'hono/http-exception';
import type {HonoEnv} from '~/App';
import {Logger} from '~/Logger';
import {getIncomingRemoteAddress, isPrivateIp} from '~/utils/IpUtils';

interface RequireXForwardedForOptions {
	exemptPaths?: Array<string>;
}

const defaultExemptPaths: Array<string> = [
	'/_health',
	'/status/summary',
	'/v1/status/summary',
	'/_rpc',
	'/webhooks/livekit',
	'/test',
	'/oauth2/token',
	'/oauth2/token/revoke',
	'/oauth2/token/introspect',
	'/users/@me',
	'/payments/cloudpayments/notification',
	'/v1/payments/cloudpayments/notification',
	'/payments/intellectmoney/notification',
	'/v1/payments/intellectmoney/notification',
	'/payments/tbank/notification',
	'/v1/payments/tbank/notification',
	'/payments/wata/notification',
	'/v1/payments/wata/notification',
];

export const RequireXForwardedForMiddleware = ({exemptPaths = defaultExemptPaths}: RequireXForwardedForOptions = {}) =>
	createMiddleware<HonoEnv>(async (ctx, next) => {
		const path = ctx.req.path;
		if (exemptPaths.some((prefix) => path === prefix || path.startsWith(prefix))) {
			await next();
			return;
		}

		// Trust the request's source only when it is a private/loopback address
		// — i.e. the connection originated inside the Docker network (gateway ->
		// api, media -> api). The Host header is client-controlled and must not
		// be used as a trust signal: an external attacker who reaches the API
		// port directly could otherwise spoof `Host: api` to bypass the
		// X-Forwarded-For requirement.
		const remoteAddress = getIncomingRemoteAddress(ctx);
		if (remoteAddress && isPrivateIp(remoteAddress)) {
			await next();
			return;
		}

		const headerValue = ctx.req.header('x-forwarded-for');
		if (!headerValue || headerValue.trim() === '') {
			Logger.warn({path, remoteAddress}, 'Rejected request without X-Forwarded-For header');
			throw new HTTPException(403, {message: 'Forbidden'});
		}

		await next();
	});
