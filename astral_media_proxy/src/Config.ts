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

import process from 'node:process';
import * as v from 'valibot';

function env(key: string): string {
	return process.env[key] || '';
}

function envInt(key: string, defaultValue: number): number {
	const value = process.env[key];
	if (!value) return defaultValue;
	const parsed = Number.parseInt(value, 10);
	return Number.isNaN(parsed) ? defaultValue : parsed;
}

function envBool(key: string, defaultValue: boolean): boolean {
	const value = process.env[key];
	if (!value) return defaultValue;

	switch (value.toLowerCase()) {
		case '1':
		case 'true':
		case 'yes':
		case 'on':
			return true;
		case '0':
		case 'false':
		case 'no':
		case 'off':
			return false;
		default:
			return defaultValue;
	}
}

const MediaProxyConfigSchema = v.looseObject({
	NODE_ENV: v.optional(v.picklist(['development', 'production']), 'production'),
	PORT: v.number(),
	AWS_ACCESS_KEY_ID: v.pipe(v.string(), v.nonEmpty()),
	AWS_SECRET_ACCESS_KEY: v.pipe(v.string(), v.nonEmpty()),
	AWS_S3_ENDPOINT: v.pipe(v.string(), v.url()),
	AWS_S3_REGION: v.optional(v.pipe(v.string(), v.nonEmpty()), 'ru-1'),
	AWS_S3_BUCKET_CDN: v.pipe(v.string(), v.nonEmpty()),
	AWS_S3_BUCKET_UPLOADS: v.pipe(v.string(), v.nonEmpty()),
	SECRET_KEY: v.pipe(v.string(), v.nonEmpty()),
	REQUIRE_CLOUDFLARE: v.optional(v.boolean(), false),
	STATIC_MODE: v.optional(v.boolean(), false),
	AWS_S3_BUCKET_STATIC: v.optional(v.string()),
	// S3/MinIO connection-pool hardening. The default smithy NodeHttpHandler caps at
	// maxSockets=50 with no request timeout, so a handful of stalled upstream reads
	// pin the whole pool forever and every new request enqueues indefinitely (-> 504s
	// on all media). These bounds recycle stuck sockets and widen the pool.
	S3_MAX_SOCKETS: v.optional(v.number(), 256),
	S3_CONNECTION_TIMEOUT_MS: v.optional(v.number(), 3_000),
	S3_REQUEST_TIMEOUT_MS: v.optional(v.number(), 20_000),
	S3_MAX_ATTEMPTS: v.optional(v.number(), 3),
	// In-process LRU cache for hot, immutable transformed images (avatars/icons/...).
	IMAGE_CACHE_MAX_BYTES: v.optional(v.number(), 256 * 1024 * 1024),
	IMAGE_CACHE_MAX_ENTRY_BYTES: v.optional(v.number(), 5 * 1024 * 1024),
});

export const Config = v.parse(MediaProxyConfigSchema, {
	NODE_ENV: (env('NODE_ENV') || 'production') as 'development' | 'production',
	PORT: envInt('ASTRAL_MEDIA_PROXY_PORT', 8080),
	AWS_ACCESS_KEY_ID: env('AWS_ACCESS_KEY_ID'),
	AWS_SECRET_ACCESS_KEY: env('AWS_SECRET_ACCESS_KEY'),
	AWS_S3_ENDPOINT: env('AWS_S3_ENDPOINT'),
	AWS_S3_REGION: env('AWS_S3_REGION') || 'ru-1',
	AWS_S3_BUCKET_CDN: env('AWS_S3_BUCKET_CDN'),
	AWS_S3_BUCKET_UPLOADS: env('AWS_S3_BUCKET_UPLOADS'),
	SECRET_KEY: env('MEDIA_PROXY_SECRET_KEY'),
	REQUIRE_CLOUDFLARE: envBool('ASTRAL_MEDIA_PROXY_REQUIRE_CLOUDFLARE', false),
	STATIC_MODE: envBool('ASTRAL_MEDIA_PROXY_STATIC_MODE', false),
	AWS_S3_BUCKET_STATIC: env('AWS_S3_BUCKET_STATIC') || undefined,
	S3_MAX_SOCKETS: envInt('ASTRAL_MEDIA_PROXY_S3_MAX_SOCKETS', 256),
	S3_CONNECTION_TIMEOUT_MS: envInt('ASTRAL_MEDIA_PROXY_S3_CONNECTION_TIMEOUT_MS', 3_000),
	S3_REQUEST_TIMEOUT_MS: envInt('ASTRAL_MEDIA_PROXY_S3_REQUEST_TIMEOUT_MS', 20_000),
	S3_MAX_ATTEMPTS: envInt('ASTRAL_MEDIA_PROXY_S3_MAX_ATTEMPTS', 3),
	IMAGE_CACHE_MAX_BYTES: envInt('ASTRAL_MEDIA_PROXY_IMAGE_CACHE_MAX_BYTES', 256 * 1024 * 1024),
	IMAGE_CACHE_MAX_ENTRY_BYTES: envInt('ASTRAL_MEDIA_PROXY_IMAGE_CACHE_MAX_ENTRY_BYTES', 5 * 1024 * 1024),
});
