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

import {isIP} from 'node:net';
import {timingSafeEqual} from 'node:crypto';
import {createMiddleware} from 'hono/factory';
import {HTTPException} from 'hono/http-exception';
import {Config} from '~/Config';
import type {HonoEnv} from '~/lib/MediaTypes';

// Returns true for loopback / private / link-local addresses. The internal
// metadata/thumbnail routes must only be reachable from the API server (which
// sits on the same private Docker network), never from the public internet —
// the bearer secret alone is not enough if it ever leaks.
const isInternalAddress = (ip: string): boolean => {
	let normalized = ip;
	// Unwrap IPv4-mapped IPv6 (::ffff:127.0.0.1) so a loopback/private IPv4
	// peer on a dual-stack socket is still recognized as internal.
	const mapped = ip.match(/^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/i);
	if (mapped) {
		normalized = mapped[1];
	}

	const family = isIP(normalized);
	if (family === 0) return false;
	if (family === 6) {
		return (
			normalized === '::1' ||
			normalized === '::' ||
			normalized.startsWith('fc') ||
			normalized.startsWith('fd') ||
			normalized.startsWith('fe80:')
		);
	}
	const parts = normalized.split('.').map((p) => Number.parseInt(p, 10));
	if (parts.length !== 4 || parts.some(Number.isNaN)) return false;
	const [a, b] = parts;
	return (
		a === 127 || // loopback
		a === 10 || // private 10/8
		(a === 172 && b >= 16 && b <= 31) || // private 172.16/12
		(a === 192 && b === 168) || // private 192.168/16
		a === 0 // unspecified / this network
	);
};

export const InternalNetworkRequired = createMiddleware<HonoEnv>(async (ctx, next) => {
	// First factor: the request must originate from a private/loopback address.
	// @hono/node-server stashes the underlying IncomingMessage on ctx.env.incoming.
	const incoming = (ctx.env as {incoming?: {socket?: {remoteAddress?: string}}}).incoming;
	const remoteAddress = incoming?.socket?.remoteAddress;
	if (!remoteAddress || !isInternalAddress(remoteAddress)) {
		throw new HTTPException(401, {message: 'Unauthorized'});
	}

	// Second factor: a constant-time comparison of the shared bearer secret.
	const authHeader = ctx.req.header('Authorization');
	const expectedAuth = `Bearer ${Config.SECRET_KEY}`;
	if (!authHeader) {
		throw new HTTPException(401, {message: 'Unauthorized'});
	}
	const authBuffer = Buffer.from(authHeader, 'utf8');
	const expectedBuffer = Buffer.from(expectedAuth, 'utf8');
	if (authBuffer.length !== expectedBuffer.length || !timingSafeEqual(authBuffer, expectedBuffer)) {
		throw new HTTPException(401, {message: 'Unauthorized'});
	}
	await next();
});
