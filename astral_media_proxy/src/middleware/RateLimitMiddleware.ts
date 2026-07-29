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
import type {HonoEnv} from '~/lib/MediaTypes';

// The public image/sticker/attachment routes are unauthenticated GETs, so a
// hostile client can hammer them to exhaust the S3 socket pool or burn FFmpeg
// CPU. Cloudflare/Caddy already rate-limits at the edge, but this is a
// defense-in-depth cap for when the edge is bypassed (direct origin hits) or
// misconfigured. In-memory per-process: good enough for a single-instance proxy
// behind a load balancer that hashes by IP; not a distributed limiter.
interface RateLimitOptions {
	windowMs: number;
	maxRequests: number;
}

interface Bucket {
	hits: Array<number>;
}

function getClientIp(ctx: Parameters<Parameters<typeof createMiddleware<HonoEnv>>[0]>[0]): string {
	// Cloudflare sets CF-Connecting-IP to the true client IP. Caddy forwards
	// X-Forwarded-For. Fall back to the raw socket address if neither is present
	// (direct local access).
	const cfIp = ctx.req.header('cf-connecting-ip');
	if (cfIp) return cfIp.trim();

	const forwardedFor = ctx.req.header('x-forwarded-for');
	if (forwardedFor) {
		const first = forwardedFor.split(',')[0]?.trim();
		if (first) return first;
	}

	// @hono/node-server stashes the underlying IncomingMessage on ctx.env.incoming.
	const incoming = (ctx.env as {incoming?: {socket?: {remoteAddress?: string}}}).incoming;
	return incoming?.socket?.remoteAddress ?? 'unknown';
}

export function createRateLimitMiddleware(options: RateLimitOptions) {
	const buckets = new Map<string, Bucket>();
	const {windowMs, maxRequests} = options;

	// Reap stale buckets periodically so a long-lived process does not leak
	// memory for every distinct IP that ever touched it.
	const reaper = setInterval(
		() => {
			const cutoff = Date.now() - windowMs;
			for (const [key, bucket] of buckets) {
				bucket.hits = bucket.hits.filter((t) => t > cutoff);
				if (bucket.hits.length === 0) {
					buckets.delete(key);
				}
			}
		},
		// Sweep at the window interval; setInterval keeps the event loop alive,
		// which is fine for a long-running server.
		Math.max(windowMs, 60_000),
	);
	reaper.unref?.();

	return createMiddleware<HonoEnv>(async (ctx, next) => {
		const ip = getClientIp(ctx);
		const now = Date.now();
		const cutoff = now - windowMs;

		let bucket = buckets.get(ip);
		if (!bucket) {
			bucket = {hits: []};
			buckets.set(ip, bucket);
		}

		bucket.hits = bucket.hits.filter((t) => t > cutoff);

		if (bucket.hits.length >= maxRequests) {
			ctx.header('Retry-After', String(Math.ceil(windowMs / 1000)));
			return ctx.text('Too Many Requests', {status: 429});
		}

		bucket.hits.push(now);
		return next();
	});
}
