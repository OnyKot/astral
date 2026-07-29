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

import {timingSafeEqual} from 'node:crypto';
import {createMiddleware} from 'hono/factory';
import type {HonoApp, HonoEnv} from '~/App';
import {Config} from '~/Config';
import {UnauthorizedError} from '~/Errors';
import {Logger} from '~/Logger';
import {RpcRequest} from '~/rpc/RpcModel';
import {getIncomingRemoteAddress, isPrivateIp} from '~/utils/IpUtils';
import {Validator} from '~/Validator';

const InternalNetworkRequired = createMiddleware<HonoEnv>(async (ctx, next) => {
	// The bearer secret alone is not enough if it leaks — gateway must reach
	// this route from the private Docker network, not the public internet.
	const remoteAddress = getIncomingRemoteAddress(ctx);
	if (!remoteAddress || !isPrivateIp(remoteAddress)) {
		Logger.warn({path: ctx.req.path, remoteAddress}, 'Rejected RPC request from non-internal network');
		throw new UnauthorizedError();
	}

	const authHeader = ctx.req.header('Authorization');
	const expectedAuth = `Bearer ${Config.gateway.rpcSecret}`;
	if (!authHeader) {
		throw new UnauthorizedError();
	}
	const authBuffer = Buffer.from(authHeader, 'utf8');
	const expectedBuffer = Buffer.from(expectedAuth, 'utf8');
	if (authBuffer.length !== expectedBuffer.length || !timingSafeEqual(authBuffer, expectedBuffer)) {
		throw new UnauthorizedError();
	}
	await next();
});

export const RpcController = (app: HonoApp) => {
	app.post('/_rpc', InternalNetworkRequired, Validator('json', RpcRequest), async (ctx) => {
		return ctx.json(
			await ctx
				.get('rpcService')
				.handleRpcRequest({request: ctx.req.valid('json'), requestCache: ctx.get('requestCache')}),
		);
	});
};
