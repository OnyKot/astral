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

import crypto from 'node:crypto';

const BASE64_URL_REGEX = /=*$/;

const decodeComponent = (component: string) => decodeURIComponent(component);

const createSignature = (inputString: string, mediaProxySecretKey: string): string => {
	const hmac = crypto.createHmac('sha256', mediaProxySecretKey);
	hmac.update(inputString);
	return hmac.digest('base64url').replace(BASE64_URL_REGEX, '');
};

export const verifySignature = (
	proxyUrlPath: string,
	providedSignature: string,
	mediaProxySecretKey: string,
): boolean => {
	const expectedSignature = createSignature(proxyUrlPath, mediaProxySecretKey);
	const expectedBuffer = Buffer.from(expectedSignature);
	const providedBuffer = Buffer.from(providedSignature);
	// timingSafeEqual throws RangeError on length mismatch, which would leak
	// whether the length is correct via a 500 vs 401 and skip the constant-time
	// path. Compare lengths first and return false on mismatch.
	if (expectedBuffer.length !== providedBuffer.length) {
		return false;
	}
	return crypto.timingSafeEqual(expectedBuffer, providedBuffer);
};

export const reconstructOriginalURL = (proxyUrlPath: string): string => {
	const parts = proxyUrlPath.split('/');
	let currentIndex = 0;
	let query = '';
	if (parts[currentIndex].includes('%3D')) {
		query = decodeComponent(parts[currentIndex]);
		currentIndex += 1;
	}
	const protocol = parts[currentIndex++];
	if (!protocol) throw new Error('Protocol is missing in the proxy URL path.');
	// Defense-in-depth: reject any scheme other than http/https at the
	// reconstruction site, before assertSafeDestination sees it. The signing
	// service should never sign a non-http(s) path, but a single allowlist here
	// prevents a future signing bug from turning the proxy into a file:/gopher:
	// fetcher.
	const decodedProtocol = decodeComponent(protocol).toLowerCase();
	// The path segment is written without a trailing colon (".../https/host/..."), which is what
	// buildMediaProxyURL has always emitted. Comparing against "https:" therefore rejected every
	// real request, so normalise first and allowlist the bare scheme.
	const scheme = decodedProtocol.endsWith(':') ? decodedProtocol.slice(0, -1) : decodedProtocol;
	if (scheme !== 'http' && scheme !== 'https') {
		throw new Error(`Unsupported protocol in proxy URL path: ${decodedProtocol}`);
	}
	const hostPart = parts[currentIndex++];
	if (!hostPart) throw new Error('Hostname is missing in the proxy URL path.');
	const [encodedHostname, encodedPort] = hostPart.split(':');
	const hostname = decodeComponent(encodedHostname);
	const port = encodedPort ? decodeComponent(encodedPort) : '';
	const encodedPath = parts.slice(currentIndex).join('/');
	const path = decodeComponent(encodedPath);
	return `${scheme}://${hostname}${port ? `:${port}` : ''}/${path}${query ? `?${query}` : ''}`;
};
