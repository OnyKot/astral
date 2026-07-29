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

import {Config} from '~/Config';

const LEGACY_APP_ORIGINS = ['https://asrtal.ru'];
const STATIC_APP_ORIGINS = ['https://music.astraof.com'];
const SERVER_TO_SERVER_WEBHOOK_PATHS = new Set([
	'/payments/cloudpayments/notification',
	'/payments/intellectmoney/notification',
	'/payments/tbank/notification',
	'/payments/wata/notification',
	'/stripe/webhook',
	'/integrations/twitch/eventsub',
	'/integrations/telegram/webhook',
	'/integrations/steam/openid/callback',
	'/webhooks/livekit',
	'/webhooks/sendgrid',
	'/v1/payments/cloudpayments/notification',
	'/v1/payments/intellectmoney/notification',
	'/v1/payments/tbank/notification',
	'/v1/payments/wata/notification',
	'/v1/stripe/webhook',
	'/v1/integrations/twitch/eventsub',
	'/v1/integrations/telegram/webhook',
	'/v1/integrations/steam/openid/callback',
	'/v1/webhooks/livekit',
	'/v1/webhooks/sendgrid',
]);

/*
 * Public Discord-style webhook execute endpoints. These are unauthenticated
 * by design — the secret token lives in the URL — so they're called from
 * arbitrary external clients (curl, n8n, GitHub Actions, Make.com, …) that
 * don't (and shouldn't) send an Authorization header. Variants:
 *   POST /webhooks/{id}/{token}
 *   POST /webhooks/{id}/{token}/github
 *   POST /webhooks/{id}/{token}/slack
 *   PATCH /webhooks/{id}/{token}
 *   DELETE /webhooks/{id}/{token}
 *   GET /webhooks/{id}/{token}            (also without auth)
 * with an optional /v1 prefix. The {id} segment is a snowflake (digits)
 * and the {token} is at least 16 url-safe chars; we keep the regex loose
 * but anchored so we don't accidentally match unrelated /webhooks/* routes
 * such as /webhooks/livekit (which is in the explicit set above).
 */
const PUBLIC_WEBHOOK_EXECUTE_PATTERN = /^(?:\/v1)?\/webhooks\/\d+\/[A-Za-z0-9._~-]{8,}(?:\/(?:github|slack))?\/?$/;

function normalizeOrigin(value: string | undefined | null): string {
	if (!value) return '';

	try {
		return new URL(value).origin.toLowerCase();
	} catch {
		return value.trim().toLowerCase();
	}
}

function normalizeHost(value: string | undefined | null): string {
	return value?.trim().toLowerCase() || '';
}

function parseOriginList(value: string | undefined | null): Array<string> {
	if (!value) return [];

	return value
		.split(/[,\s]+/)
		.map((entry) => normalizeOrigin(entry))
		.filter(Boolean);
}

const MUSIC_APP_ORIGINS = Array.from(
	new Set([...STATIC_APP_ORIGINS, ...parseOriginList(process.env.ASTRAL_MUSIC_APP_ORIGINS)].map(normalizeOrigin).filter(Boolean)),
);
const MUSIC_APP_ORIGIN_SET = new Set(MUSIC_APP_ORIGINS);
const APP_ORIGINS = Array.from(
	new Set(
		[Config.endpoints.webApp, ...LEGACY_APP_ORIGINS, ...STATIC_APP_ORIGINS, ...parseOriginList(process.env.ASTRAL_ALLOWED_APP_ORIGINS)]
			.map(normalizeOrigin)
			.filter(Boolean),
	),
);
const APP_HOSTS = new Set(
	APP_ORIGINS.map((origin) => {
		try {
			return new URL(origin).host.toLowerCase();
		} catch {
			return '';
		}
	}).filter(Boolean),
);

export function getKnownAppOrigins(): Array<string> {
	return APP_ORIGINS;
}

export function isMusicAppOrigin(origin: string | undefined | null): boolean {
	return MUSIC_APP_ORIGIN_SET.has(normalizeOrigin(origin));
}

export function isKnownAppOrigin(origin: string | undefined | null): boolean {
	return APP_ORIGINS.includes(normalizeOrigin(origin));
}

export function isKnownAppHost(host: string | undefined | null): boolean {
	return APP_HOSTS.has(normalizeHost(host));
}

export function isServerToServerWebhookPath(path: string | undefined | null): boolean {
	const normalizedPath = path?.trim() || '';
	if (SERVER_TO_SERVER_WEBHOOK_PATHS.has(normalizedPath)) return true;
	if (PUBLIC_WEBHOOK_EXECUTE_PATTERN.test(normalizedPath)) return true;
	return false;
}
