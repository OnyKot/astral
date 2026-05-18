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

export const APP_PROTOCOL = 'astral';
export const LEGACY_APP_PROTOCOL = 'astral';
export const APP_PROTOCOL_PREFIX = `${APP_PROTOCOL}://`;
export const LEGACY_APP_PROTOCOL_PREFIX = `${LEGACY_APP_PROTOCOL}://`;

export function hasAppProtocolPrefix(text: string): boolean {
	return text.startsWith(APP_PROTOCOL_PREFIX) || text.startsWith(LEGACY_APP_PROTOCOL_PREFIX);
}

export function buildAppProtocolUrl(path: string): string {
	const cleaned = path.replace(/^\/+/, '');
	return `${APP_PROTOCOL_PREFIX}${cleaned}`;
}
