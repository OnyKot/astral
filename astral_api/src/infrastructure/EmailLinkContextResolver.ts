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
import type {EmailLinkContext} from '~/infrastructure/IEmailService';
import {getKnownAppOrigins, isMusicAppOrigin} from '~/utils/AppOriginUtils';

function normalizeOrigin(value: string | undefined | null): string {
	if (!value) return '';

	try {
		return new URL(value).origin.replace(/\/+$/, '').toLowerCase();
	} catch {
		return value.trim().replace(/\/+$/, '').toLowerCase();
	}
}

function getOriginFromHeaderValue(value: string | null | undefined): string {
	if (!value) return '';

	try {
		return new URL(value).origin;
	} catch {
		return value;
	}
}

export function resolveEmailLinkContextFromRequest(request: Request | undefined | null): EmailLinkContext {
	const knownOrigins = new Set(getKnownAppOrigins().map((origin) => normalizeOrigin(origin)));
	const candidates = [
		getOriginFromHeaderValue(request?.headers.get('origin')),
		getOriginFromHeaderValue(request?.headers.get('referer')),
	];

	for (const candidate of candidates) {
		const normalized = normalizeOrigin(candidate);
		if (!normalized || !knownOrigins.has(normalized)) {
			continue;
		}

		return {
			appBaseUrl: normalized,
			brand: isMusicAppOrigin(normalized) ? 'music' : 'astral',
		};
	}

	const fallbackOrigin = normalizeOrigin(Config.endpoints.webApp) || Config.endpoints.webApp;
	return {
		appBaseUrl: fallbackOrigin,
		brand: isMusicAppOrigin(fallbackOrigin) ? 'music' : 'astral',
	};
}
