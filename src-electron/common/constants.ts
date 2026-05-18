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

import {
	BUILD_CANARY_APP_URL,
	BUILD_DESKTOP_UPDATE_ORIGINS,
	BUILD_STABLE_APP_URL,
	BUILD_TRUSTED_APP_URLS,
} from './build-config.js';

export const APP_PROTOCOL = 'astral';
export const LEGACY_APP_PROTOCOL = 'astral';

const unique = <T>(values: Array<T>): Array<T> => Array.from(new Set(values));

const normalizeUrl = (value: string): string => {
	const parsed = new URL(value);
	parsed.hash = '';
	return parsed.toString().replace(/\/+$/, '');
};

const normalizeOrigin = (value: string): string => new URL(value).origin;

export const STABLE_APP_URL = normalizeUrl(BUILD_STABLE_APP_URL);
export const CANARY_APP_URL = normalizeUrl(BUILD_CANARY_APP_URL);

export const TRUSTED_APP_URLS = Object.freeze(
	unique([STABLE_APP_URL, CANARY_APP_URL, ...BUILD_TRUSTED_APP_URLS.map(normalizeUrl)]),
);
export const TRUSTED_APP_ORIGINS = new Set(TRUSTED_APP_URLS.map(normalizeOrigin));
export const DESKTOP_UPDATE_ORIGINS = Object.freeze(unique(BUILD_DESKTOP_UPDATE_ORIGINS.map(normalizeOrigin)));

export const DEFAULT_WINDOW_WIDTH = 1280;
export const DEFAULT_WINDOW_HEIGHT = 800;
export const MIN_WINDOW_WIDTH = 800;
export const MIN_WINDOW_HEIGHT = 600;
