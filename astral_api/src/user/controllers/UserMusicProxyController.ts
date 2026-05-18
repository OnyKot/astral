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

import type {HonoApp} from '../../App';
import {LoginRequired} from '../../middleware/AuthMiddleware';
import {RateLimitMiddleware} from '../../middleware/RateLimitMiddleware';
import {RateLimitConfigs} from '../../RateLimitConfig';

interface ProxyInstanceEntry {
	url: string;
	version?: string;
}

interface ProxyRequestBody {
	path?: string;
	method?: string;
	type?: 'api' | 'streaming';
	minVersion?: string;
	allowedDomains?: Array<string>;
	instances?: Array<string | ProxyInstanceEntry>;
}

function sanitizePath(value: unknown): string | null {
	const path = String(value || '').trim();
	if (!path || !path.startsWith('/')) return null;
	if (path.includes('://')) return null;
	return path;
}

function normalizeInstances(entries: unknown): Array<ProxyInstanceEntry> {
	if (!Array.isArray(entries)) return [];

	return entries
		.map((entry) => {
			if (typeof entry === 'string') {
				return {url: entry.trim()};
			}

			if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
				return null;
			}

			return {
				url: String((entry as ProxyInstanceEntry).url || '').trim(),
				version:
					typeof (entry as ProxyInstanceEntry).version === 'string'
						? (entry as ProxyInstanceEntry).version
						: undefined,
			};
		})
		.filter((entry): entry is ProxyInstanceEntry => Boolean(entry?.url));
}


function isBlockedHostname(hostname: string): boolean {
	const normalized = hostname.toLowerCase();
	if (normalized === 'localhost' || normalized === '::1') return true;
	if (/^\d+\.\d+\.\d+\.\d+$/.test(normalized)) {
		const octets = normalized.split('.').map((octet) => Number.parseInt(octet, 10));
		const [a, b] = octets;
		if (a === 10 || a === 127 || a === 0) return true;
		if (a === 169 && b === 254) return true;
		if (a === 172 && b >= 16 && b <= 31) return true;
		if (a === 192 && b === 168) return true;
		if (a >= 224) return true;
	}

	if (normalized.includes(':')) {
		if (normalized === '::1') return true;
		if (normalized.startsWith('fc') || normalized.startsWith('fd')) return true;
		if (normalized.startsWith('fe8') || normalized.startsWith('fe9') || normalized.startsWith('fea') || normalized.startsWith('feb')) {
			return true;
		}
	}

	return false;
}

function parseSafeInstanceUrl(rawUrl: string): string | null {
	let parsed: URL;
	try {
		parsed = new URL(rawUrl);
	} catch {
		return null;
	}

	if (parsed.protocol !== 'https:') return null;
	if (!parsed.hostname || isBlockedHostname(parsed.hostname)) return null;
	return parsed.origin + parsed.pathname.replace(/\/+$/, '');
}
function filterInstances(
	instances: Array<ProxyInstanceEntry>,
	minVersion: string | undefined,
	allowedDomains: Array<string>,
): Array<ProxyInstanceEntry> {
	return instances.filter((instance) => {
		if (minVersion) {
			if (!instance.version) return false;
			if (Number.parseFloat(instance.version) < Number.parseFloat(minVersion)) {
				return false;
			}
		}

		if (allowedDomains.length > 0 && !allowedDomains.some((domain) => new URL(instance.url).hostname === domain || new URL(instance.url).hostname.endsWith(`.${domain}`))) {
			return false;
		}

		return true;
	});
}

async function cloneErrorResponse(response: Response): Promise<{status: number; body: string}> {
	return {
		status: response.status,
		body: await response.text().catch(() => ''),
	};
}

export const UserMusicProxyController = (app: HonoApp) => {
	app.post('/music/proxy', RateLimitMiddleware(RateLimitConfigs.DEFAULT), LoginRequired, async (ctx) => {
		const body = (await ctx.req.json().catch(() => ({}))) as ProxyRequestBody;
		const relativePath = sanitizePath(body.path);
		if (!relativePath) {
			return ctx.json({error: 'music_proxy_invalid_path'}, 400);
		}

		const upstreamMethod = String(body.method || 'GET').trim().toUpperCase();
		if (!['GET', 'HEAD'].includes(upstreamMethod)) {
			return ctx.json({error: 'music_proxy_invalid_method'}, 400);
		}

		const allowedDomains = Array.isArray(body.allowedDomains)
			? body.allowedDomains.map((domain) => String(domain || '').trim().toLowerCase()).filter(Boolean)
			: [];
		const safeInstances = normalizeInstances(body.instances).flatMap((instance) => {
			const safeUrl = parseSafeInstanceUrl(instance.url);
			return safeUrl ? [{...instance, url: safeUrl}] : [];
		});
		const filteredInstances = filterInstances(safeInstances, body.minVersion, allowedDomains);

		if (filteredInstances.length === 0) {
			return ctx.json({error: 'music_proxy_no_instances'}, 400);
		}

		let lastFailure: {status: number; body: string} | null = null;

		for (const instance of filteredInstances) {
			const baseUrl = instance.url.replace(/\/+$/, '');
			const targetUrl = `${baseUrl}${relativePath}`;

			try {
				const response = await fetch(targetUrl, {
					method: upstreamMethod,
					headers: {
						Accept: ctx.req.header('accept') || 'application/json, text/plain, */*',
					},
					signal: AbortSignal.timeout(6000),
				});

				if (response.status === 429 || response.status >= 500) {
					lastFailure = await cloneErrorResponse(response);
					continue;
				}

				if (response.status === 401) {
					const payload = await response
						.clone()
						.json()
						.catch(() => null as {subStatus?: number} | null);
					if (payload?.subStatus === 11002) {
						lastFailure = await cloneErrorResponse(response);
						continue;
					}
				}

				if (!response.ok) {
					lastFailure = await cloneErrorResponse(response);
					continue;
				}

				const headers = new Headers(response.headers);
				headers.delete('access-control-allow-origin');
				return new Response(response.body, {
					status: response.status,
					headers,
				});
			} catch (error) {
				lastFailure = {
					status: 502,
					body: error instanceof Error ? error.message : 'music_proxy_request_failed',
				};
			}
		}

		return ctx.json(
			{
				error: 'music_proxy_failed',
				status: lastFailure?.status || 502,
				message: lastFailure?.body || 'music_proxy_failed',
			},
			{status: 502},
		);
	});
};
