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

import Config from '~/Config';

const DEFAULT_FIRST_PARTY_HOSTS = [
	'astraof.com',
	'api.astraof.com',
	'gateway.astraof.com',
	'asrtal.ru',
	'api.asrtal.ru',
	'gateway.asrtal.ru',
];
const DEFAULT_FIRST_PARTY_HOST_SUFFIXES = ['.astraof.com', '.asrtal.ru'];

const splitList = (value: string | undefined): Array<string> =>
	(value ?? '')
		.split(',')
		.map((item) => item.trim())
		.filter(Boolean);

export const normalizeHostname = (hostname: string): string => hostname.trim().toLowerCase().replace(/\.+$/, '');

const normalizeSuffix = (suffix: string): string => {
	const normalized = normalizeHostname(suffix).replace(/^\.+/, '');
	return normalized ? `.${normalized}` : '';
};

const unique = (values: Array<string>): Array<string> => Array.from(new Set(values));

export const FIRST_PARTY_HOSTS = Object.freeze(
	unique([...DEFAULT_FIRST_PARTY_HOSTS, ...splitList(Config.PUBLIC_FIRST_PARTY_HOSTS)].map(normalizeHostname)),
);

export const FIRST_PARTY_HOST_SUFFIXES = Object.freeze(
	unique([...DEFAULT_FIRST_PARTY_HOST_SUFFIXES, ...splitList(Config.PUBLIC_FIRST_PARTY_HOST_SUFFIXES)].map(normalizeSuffix))
		.filter(Boolean),
);

export function isFirstPartyHost(hostname: string): boolean {
	const normalized = normalizeHostname(hostname);
	return FIRST_PARTY_HOSTS.includes(normalized) || FIRST_PARTY_HOST_SUFFIXES.some((suffix) => normalized.endsWith(suffix));
}

export function getImplicitlyTrustedDomainPatterns(): Array<string> {
	return unique([...FIRST_PARTY_HOSTS, ...FIRST_PARTY_HOST_SUFFIXES.map((suffix) => `*${suffix}`)]);
}
