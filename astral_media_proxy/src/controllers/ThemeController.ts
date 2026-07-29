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

import {PassThrough} from 'node:stream';
import type {Context} from 'hono';
import {Config} from '~/Config';
import {toBodyData, toWebReadableStream} from '~/lib/BinaryUtils';
import type {HonoEnv} from '~/lib/MediaTypes';
import {headS3Object, readS3Object} from '~/lib/S3Utils';

const THEME_ID_PATTERN = /^[a-f0-9]{16}$/;

export async function handleThemeHeadRequest(ctx: Context<HonoEnv>): Promise<Response> {
	const filename = ctx.req.param('id.css');
	const themeId = filename?.replace(/\.css$/, '');

	if (!themeId || !THEME_ID_PATTERN.test(themeId)) {
		return ctx.text('Not found', {status: 404});
	}

	const {contentLength, lastModified} = await headS3Object(Config.AWS_S3_BUCKET_CDN, `themes/${themeId}.css`);

	ctx.header('Content-Type', 'text/css; charset=utf-8');
	ctx.header('Cache-Control', 'public, max-age=31536000, immutable');
	ctx.header('Access-Control-Allow-Origin', '*');
	// Themes are user-uploaded CSS served cross-origin. nosniff stops a browser
	// from interpreting a mis-stored payload as a different (executable) type.
	ctx.header('X-Content-Type-Options', 'nosniff');
	ctx.header('Content-Length', contentLength.toString());

	if (lastModified) {
		ctx.header('Last-Modified', lastModified.toUTCString());
	}

	return ctx.body(null);
}

export async function handleThemeRequest(ctx: Context<HonoEnv>): Promise<Response> {
	const filename = ctx.req.param('id.css');
	const themeId = filename?.replace(/\.css$/, '');

	if (!themeId || !THEME_ID_PATTERN.test(themeId)) {
		return ctx.text('Not found', {status: 404});
	}

	const {data, lastModified} = await readS3Object(Config.AWS_S3_BUCKET_CDN, `themes/${themeId}.css`);

	ctx.header('Content-Type', 'text/css; charset=utf-8');
	ctx.header('Cache-Control', 'public, max-age=31536000, immutable');
	ctx.header('Access-Control-Allow-Origin', '*');
	ctx.header('X-Content-Type-Options', 'nosniff');

	if (lastModified) {
		ctx.header('Last-Modified', new Date(lastModified).toUTCString());
	}

	if (data instanceof PassThrough) {
		return ctx.body(toWebReadableStream(data));
	} else {
		ctx.header('Content-Length', data.length.toString());
		return ctx.body(toBodyData(data));
	}
}
