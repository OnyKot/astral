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

import {createStringType} from '~/Schema';

const isLoopbackHost = (hostname: string) => {
	const lowercaseHost = hostname.toLowerCase();
	return (
		lowercaseHost === 'localhost' ||
		lowercaseHost === '127.0.0.1' ||
		lowercaseHost === '[::1]' ||
		lowercaseHost.endsWith('.localhost')
	);
};

const isValidRedirectURI = (value: string, allowAnyHttp: boolean) => {
	try {
		const url = new URL(value);
		if (url.protocol !== 'http:' && url.protocol !== 'https:') {
			return false;
		}

		if (!allowAnyHttp && url.protocol === 'http:' && !isLoopbackHost(url.hostname)) {
			return false;
		}

		return !!url.host;
	} catch {
		return false;
	}
};

const createRedirectURIType = (allowAnyHttp: boolean, message: string) =>
	createStringType(1).refine((value) => isValidRedirectURI(value, allowAnyHttp), message);

export const OAuth2RedirectURICreateType = createRedirectURIType(
	false,
	'Redirect URIs must use HTTPS, or HTTP for localhost only',
);
// Updates must follow the same rule as creates: HTTPS, or HTTP for loopback
// only. Previously this accepted any HTTP URI, so a developer could weaken an
// app's redirect URIs to http://attacker.com/callback — enabling
// authorization-code interception on non-HTTPS clients.
export const OAuth2RedirectURIUpdateType = createRedirectURIType(
	false,
	'Redirect URIs must use HTTPS, or HTTP for localhost only',
);
