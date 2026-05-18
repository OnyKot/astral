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

const LEGACY_PASSKEY_WEBAPP_URL = 'https://asrtal.ru';

const normalizeHostname = (value: string): string => value.trim().toLowerCase().replace(/\.+$/, '');

export function getLegacyPasskeyWebAppUrl(): string {
	return LEGACY_PASSKEY_WEBAPP_URL;
}

export function shouldUseLegacyPasskeyBridge(): boolean {
	if (typeof window === 'undefined') {
		return false;
	}

	const hostname = normalizeHostname(window.location.hostname);
	if (!hostname) {
		return false;
	}

	if (hostname === 'asrtal.ru' || hostname === 'www.asrtal.ru' || hostname.endsWith('.asrtal.ru')) {
		return false;
	}

	return hostname === 'astraof.com' || hostname === 'www.astraof.com' || hostname.endsWith('.astraof.com');
}
