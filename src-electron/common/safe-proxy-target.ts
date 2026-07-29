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

import {lookup as defaultLookup} from 'node:dns/promises';
import type {LookupAllOptions} from 'node:dns';
import {isIP} from 'node:net';

const ALLOWED_PORTS = new Set([80, 443]);

const isDisallowedProxyAddress = (ip: string): boolean => {
	if (ip === '::1' || ip === '::') return true;
	if (ip.startsWith('fc') || ip.startsWith('fd')) return true;
	if (ip.startsWith('fe80:')) return true;

	const mappedIpv4 = ip.match(/^(?:::ffff:|::ffff:0:|64:ff9b::)(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/i);
	if (mappedIpv4) {
		return isDisallowedProxyAddress(mappedIpv4[1]);
	}

	const parts = ip.split('.').map((part) => Number.parseInt(part, 10));
	if (parts.length !== 4 || parts.some(Number.isNaN)) return false;

	const [a, b] = parts;
	return (
		a === 0 ||
		a === 10 ||
		a === 127 ||
		(a === 100 && b >= 64 && b <= 127) ||
		(a === 169 && b === 254) ||
		(a === 172 && b >= 16 && b <= 31) ||
		(a === 192 && b === 168) ||
		a === 224 ||
		a === 240 ||
		(a === 255 && b === 255 && parts[2] === 255 && parts[3] === 255)
	);
};

const resolveSafeAddress = async (hostname: string): Promise<string> => {
	const directIpVersion = isIP(hostname);
	if (directIpVersion) {
		if (isDisallowedProxyAddress(hostname)) {
			throw new Error('Unsafe URL destination');
		}
		return hostname;
	}

	const resolved = await defaultLookup(hostname, {all: true, verbatim: true} as LookupAllOptions);
	const safe = resolved.find(({address}) => !isDisallowedProxyAddress(address));
	if (!safe) {
		throw new Error('Unsafe URL destination');
	}
	return safe.address;
};

export const assertSafeProxyTarget = async (urlString: string): Promise<void> => {
	const parsedUrl = new URL(urlString);
	if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
		throw new Error('Unsupported protocol');
	}

	const hostname = parsedUrl.hostname;
	if (hostname === 'localhost') {
		throw new Error('Unsafe URL destination');
	}

	const port = parsedUrl.port ? Number.parseInt(parsedUrl.port, 10) : parsedUrl.protocol === 'https:' ? 443 : 80;
	if (!ALLOWED_PORTS.has(port)) {
		throw new Error('Unsafe URL destination');
	}

	await resolveSafeAddress(hostname);
};

export const isValidProxyTargetUrl = (raw: string | null): raw is string => {
	if (!raw) return false;
	try {
		const parsed = new URL(raw);
		return parsed.protocol === 'https:' || parsed.protocol === 'http:';
	} catch {
		return false;
	}
};
