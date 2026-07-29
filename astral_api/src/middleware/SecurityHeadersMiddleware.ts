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
import {Config} from '~/Config';
import type {HonoEnv} from '~/App';

// Security headers are applied AFTER `await next()` rather than before.
// AppErrorHandler / AppNotFoundHandler return a fresh `Response` that does
// not inherit `ctx.header()` values set pre-next(), so setting them up-front
// would silently drop every header on 4xx/5xx/404 responses. Mutating
// `ctx.res.headers` after next() lands the headers on the final response
// regardless of which handler produced it.
export const SecurityHeadersMiddleware = createMiddleware<HonoEnv>(async (ctx, next) => {
	await next();

	const headers = ctx.res.headers;
	headers.set('X-Content-Type-Options', 'nosniff');
	headers.set('X-Frame-Options', 'DENY');
	headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
	headers.set('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
	// The API returns JSON, never HTML, so lock the content type down to nothing.
	// A restrictive CSP is the primary XSS mitigation: even if user content were
	// ever reflected into a response, no script/style/frame source is allowed.
	headers.set('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
	// Block Adobe cross-domain policy files from granting Flash/PDF readers
	// cross-origin access to API responses.
	headers.set('X-Permitted-Cross-Domain-Policies', 'none');

	// HSTS only in production — pinning in dev (often plain HTTP or a
	// self-signed cert) would lock browsers out of the dev endpoint. Include
	// `preload` so the domain can be submitted to the HSTS preload list.
	if (Config.nodeEnv === 'production') {
		headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
	}
});
