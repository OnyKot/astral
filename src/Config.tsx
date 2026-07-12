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

import * as v from 'valibot';

const envSchema = v.object({
	PUBLIC_BUILD_SHA: v.optional(v.string(), 'dev'),
	PUBLIC_BUILD_NUMBER: v.optional(v.pipe(v.string(), v.transform(Number), v.number()), '0'),
	PUBLIC_BUILD_TIMESTAMP: v.optional(
		v.pipe(v.string(), v.transform(Number), v.number()),
		`${Math.floor(Date.now() / 1000)}`,
	),
	PUBLIC_PROJECT_ENV: v.optional(v.picklist(['stable', 'canary', 'development']), 'development'),
	PUBLIC_SENTRY_DSN: v.optional(v.nullable(v.string()), null),
	PUBLIC_SENTRY_PROJECT_ID: v.optional(v.nullable(v.string()), null),
	PUBLIC_SENTRY_PUBLIC_KEY: v.optional(v.nullable(v.string()), null),
	PUBLIC_SENTRY_PROXY_PATH: v.optional(v.string(), '/error-reporting-proxy'),
	PUBLIC_API_VERSION: v.optional(v.pipe(v.string(), v.transform(Number), v.number()), '1'),
	PUBLIC_BOOTSTRAP_API_ENDPOINT: v.optional(v.string(), '/api'),
	PUBLIC_BOOTSTRAP_API_PUBLIC_ENDPOINT: v.optional(v.string()),
	PUBLIC_EMOJI_STYLE: v.optional(v.picklist(['twemoji', 'telegram', 'apple', 'vk']), 'telegram'),
	PUBLIC_EMOJI_STYLE_CDN: v.optional(v.string(), ''),
	PUBLIC_TELEGRAM_EMOJI_STYLE_CDN: v.optional(v.string(), ''),
	PUBLIC_VK_EMOJI_STYLE_CDN: v.optional(v.string(), ''),
	PUBLIC_EMOJI_STYLE_FILE_EXT: v.optional(v.picklist(['svg', 'png', 'webp']), 'svg'),
	PUBLIC_FIRST_PARTY_HOSTS: v.optional(
		v.string(),
		'astraof.com,api.astraof.com,gateway.astraof.com,asrtal.ru,api.asrtal.ru,gateway.asrtal.ru,localhost,127.0.0.1',
	),
	PUBLIC_FIRST_PARTY_HOST_SUFFIXES: v.optional(v.string(), '.astraof.com,.asrtal.ru'),
});

// Each field must read import.meta.env.* directly so rspack DefinePlugin can inline values.
const env = v.parse(envSchema, {
	PUBLIC_BUILD_SHA: import.meta.env.PUBLIC_BUILD_SHA,
	PUBLIC_BUILD_NUMBER: import.meta.env.PUBLIC_BUILD_NUMBER,
	PUBLIC_BUILD_TIMESTAMP: import.meta.env.PUBLIC_BUILD_TIMESTAMP,
	PUBLIC_PROJECT_ENV: import.meta.env.PUBLIC_PROJECT_ENV,
	PUBLIC_SENTRY_DSN: import.meta.env.PUBLIC_SENTRY_DSN,
	PUBLIC_SENTRY_PROJECT_ID: import.meta.env.PUBLIC_SENTRY_PROJECT_ID,
	PUBLIC_SENTRY_PUBLIC_KEY: import.meta.env.PUBLIC_SENTRY_PUBLIC_KEY,
	PUBLIC_SENTRY_PROXY_PATH: import.meta.env.PUBLIC_SENTRY_PROXY_PATH,
	PUBLIC_API_VERSION: import.meta.env.PUBLIC_API_VERSION,
	PUBLIC_BOOTSTRAP_API_ENDPOINT: import.meta.env.PUBLIC_BOOTSTRAP_API_ENDPOINT,
	PUBLIC_BOOTSTRAP_API_PUBLIC_ENDPOINT: import.meta.env.PUBLIC_BOOTSTRAP_API_PUBLIC_ENDPOINT,
	PUBLIC_EMOJI_STYLE: import.meta.env.PUBLIC_EMOJI_STYLE,
	PUBLIC_EMOJI_STYLE_CDN: import.meta.env.PUBLIC_EMOJI_STYLE_CDN,
	PUBLIC_TELEGRAM_EMOJI_STYLE_CDN: import.meta.env.PUBLIC_TELEGRAM_EMOJI_STYLE_CDN,
	PUBLIC_VK_EMOJI_STYLE_CDN: import.meta.env.PUBLIC_VK_EMOJI_STYLE_CDN,
	PUBLIC_EMOJI_STYLE_FILE_EXT: import.meta.env.PUBLIC_EMOJI_STYLE_FILE_EXT,
	PUBLIC_FIRST_PARTY_HOSTS: import.meta.env.PUBLIC_FIRST_PARTY_HOSTS,
	PUBLIC_FIRST_PARTY_HOST_SUFFIXES: import.meta.env.PUBLIC_FIRST_PARTY_HOST_SUFFIXES,
});

export default {
	PUBLIC_BUILD_SHA: env.PUBLIC_BUILD_SHA,
	PUBLIC_BUILD_NUMBER: env.PUBLIC_BUILD_NUMBER,
	PUBLIC_BUILD_TIMESTAMP: env.PUBLIC_BUILD_TIMESTAMP,
	PUBLIC_PROJECT_ENV: env.PUBLIC_PROJECT_ENV,
	PUBLIC_SENTRY_DSN: env.PUBLIC_SENTRY_DSN,
	PUBLIC_SENTRY_PROJECT_ID: env.PUBLIC_SENTRY_PROJECT_ID,
	PUBLIC_SENTRY_PUBLIC_KEY: env.PUBLIC_SENTRY_PUBLIC_KEY,
	PUBLIC_SENTRY_PROXY_PATH: env.PUBLIC_SENTRY_PROXY_PATH,
	PUBLIC_API_VERSION: env.PUBLIC_API_VERSION,
	PUBLIC_BOOTSTRAP_API_ENDPOINT: env.PUBLIC_BOOTSTRAP_API_ENDPOINT,
	PUBLIC_BOOTSTRAP_API_PUBLIC_ENDPOINT: env.PUBLIC_BOOTSTRAP_API_PUBLIC_ENDPOINT ?? env.PUBLIC_BOOTSTRAP_API_ENDPOINT,
	PUBLIC_EMOJI_STYLE: env.PUBLIC_EMOJI_STYLE,
	PUBLIC_EMOJI_STYLE_CDN: env.PUBLIC_EMOJI_STYLE_CDN,
	PUBLIC_TELEGRAM_EMOJI_STYLE_CDN: env.PUBLIC_TELEGRAM_EMOJI_STYLE_CDN,
	PUBLIC_VK_EMOJI_STYLE_CDN: env.PUBLIC_VK_EMOJI_STYLE_CDN,
	PUBLIC_EMOJI_STYLE_FILE_EXT: env.PUBLIC_EMOJI_STYLE_FILE_EXT,
	PUBLIC_FIRST_PARTY_HOSTS: env.PUBLIC_FIRST_PARTY_HOSTS,
	PUBLIC_FIRST_PARTY_HOST_SUFFIXES: env.PUBLIC_FIRST_PARTY_HOST_SUFFIXES,
};
