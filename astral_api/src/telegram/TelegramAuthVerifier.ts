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

import {createHash, createHmac, timingSafeEqual} from 'node:crypto';
import {Logger} from '~/Logger';
import type {TelegramLoginPayload} from '~/telegram/TelegramModel';

/**
 * Verify a Telegram Login Widget payload as described at
 * https://core.telegram.org/widgets/login#checking-authorization
 *
 *   data_check_string = sorted("\n", "<key>=<value>") for every payload field
 *                        EXCEPT the "hash" field
 *   secret_key        = SHA-256(bot_token)
 *   expected_hash     = HMAC-SHA256(secret_key, data_check_string)
 *
 * If `expected_hash` matches the `hash` field (timing-safe), and `auth_date`
 * is within `maxAgeSeconds` of now, the assertion is genuine.
 *
 * The verifier intentionally takes the **raw** payload (string-keyed object),
 * not the typed object, because Telegram's signature is over the raw fields
 * the widget actually sent — including any new fields Telegram may add later
 * (e.g. is_premium, language_code) that we want to round-trip through.
 */
export function verifyTelegramLoginPayload(params: {
	rawPayload: Record<string, string | number | undefined>;
	botToken: string;
	maxAgeSeconds: number;
}): boolean {
	const {rawPayload, botToken, maxAgeSeconds} = params;
	const hashFromTelegram = String(rawPayload.hash ?? '');
	if (hashFromTelegram.length !== 64) return false;

	const dataCheckLines: Array<string> = [];
	for (const key of Object.keys(rawPayload).sort()) {
		if (key === 'hash') continue;
		const value = rawPayload[key];
		if (value === undefined || value === null) continue;
		dataCheckLines.push(`${key}=${value}`);
	}
	const dataCheckString = dataCheckLines.join('\n');

	const secretKey = createHash('sha256').update(botToken).digest();
	const computed = createHmac('sha256', secretKey).update(dataCheckString).digest();
	const expected = Buffer.from(hashFromTelegram, 'hex');
	if (expected.length !== computed.length) return false;
	if (!timingSafeEqual(expected, computed)) {
		Logger.warn({}, '[Telegram] Login Widget HMAC mismatch');
		return false;
	}

	const authDate = Number(rawPayload.auth_date ?? 0);
	if (!Number.isFinite(authDate) || authDate <= 0) return false;
	const ageSec = Math.floor(Date.now() / 1000) - authDate;
	if (ageSec < 0 || ageSec > maxAgeSeconds) {
		Logger.warn({ageSec, maxAgeSeconds}, '[Telegram] Login Widget assertion expired');
		return false;
	}
	return true;
}

export function extractRawPayload(payload: TelegramLoginPayload): Record<string, string | number> {
	const raw: Record<string, string | number> = {
		id: payload.id,
		first_name: payload.first_name,
		auth_date: payload.auth_date,
		hash: payload.hash,
	};
	if (payload.last_name !== undefined) raw.last_name = payload.last_name;
	if (payload.username !== undefined) raw.username = payload.username;
	if (payload.photo_url !== undefined) raw.photo_url = payload.photo_url;
	return raw;
}
