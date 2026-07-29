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

import type {Context} from 'hono';

export const parseRange = (rangeHeader: string | null, fileSize: number) => {
	if (!rangeHeader) return null;
	const matches = rangeHeader.match(/bytes=(\d*)-(\d*)/);
	if (!matches) return null;

	const start = matches[1] ? Number.parseInt(matches[1], 10) : 0;
	const end = matches[2] ? Number.parseInt(matches[2], 10) : fileSize - 1;

	return start >= fileSize || end >= fileSize || start > end ? null : {start, end};
};

export const setHeaders = (
	ctx: Context,
	size: number,
	contentType: string,
	range: {start: number; end: number} | null,
	lastModified?: Date,
) => {
	const isStreamableMedia = contentType.startsWith('video/') || contentType.startsWith('audio/');

	const headers = {
		'Accept-Ranges': 'bytes',
		'Access-Control-Allow-Origin': '*',
		// Media keys are content-addressed (snowflake + hash), so responses are
		// immutable. `immutable` stops browsers/edge from revalidating, and
		// `stale-while-revalidate` lets caches keep serving during a brief upstream
		// hiccup instead of surfacing the error to the user.
		'Cache-Control': isStreamableMedia
			? 'public, max-age=31536000, no-transform, immutable'
			: 'public, max-age=31536000, immutable, stale-while-revalidate=86400',
		'Content-Type': contentType,
		Date: new Date().toUTCString(),
		Expires: new Date(Date.now() + 31536000000).toUTCString(),
		'Last-Modified': lastModified?.toUTCString() ?? new Date().toUTCString(),
		Vary: 'Accept-Encoding, Range',
		// Defense-in-depth: even if a misconfigured upload stored an HTML/SVG
		// payload, nosniff stops legacy browsers from sniffing and executing it.
		'X-Content-Type-Options': 'nosniff',
	};

	Object.entries(headers).forEach(([k, v]) => {
		ctx.header(k, v);
	});

	if (range) {
		const length = range.end - range.start + 1;
		ctx.status(206);
		ctx.header('Content-Length', length.toString());
		ctx.header('Content-Range', `bytes ${range.start}-${range.end}/${size}`);
	} else {
		ctx.header('Content-Length', size.toString());
	}
};
