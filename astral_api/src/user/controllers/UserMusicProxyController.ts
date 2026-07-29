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

import {Readable} from 'node:stream';
import {bodyLimit} from 'hono/body-limit';
import type {HonoApp} from '../../App';
import {Config} from '../../Config';
import {LoginRequired} from '../../middleware/AuthMiddleware';
import {RateLimitMiddleware} from '../../middleware/RateLimitMiddleware';
import {RateLimitConfigs} from '../../RateLimitConfig';
import {createStringType, z} from '../../Schema';
import * as FetchUtils from '../../utils/FetchUtils';
import {Validator} from '../../Validator';

interface ProxyInstanceEntry {
	url: string;
	version?: string;
}

const MAX_INSTANCES = 8;
const MAX_ALLOWED_DOMAINS = 16;
const PROXY_BODY_LIMIT = 8 * 1024;

// One deadline for the whole handler plus a short per-upstream budget. Without
// them a body listing unreachable instances pinned the request for
// instances x per-hop timeout, and a single blackholed hop was enough to blow
// Caddy's `unhealthy_latency 3s` and take the replica out of rotation.
const PROXY_TOTAL_TIMEOUT_MS = 10_000;

// The per-upstream budget bounds TIME-TO-HEADERS only, and is enforced here
// instead of through FetchUtils' own `timeout`: FetchUtils arms a single
// AbortController for the whole exchange and never disarms it once the headers
// land, so that timeout tears down the body stream as well. Handing it the 2s
// attempt budget silently truncated every response still transferring at 2s --
// `type: 'streaming'` audio above all -- into a 200 with a short body.
const PROXY_HEADERS_TIMEOUT_MS = 2_000;

// FetchUtils' timeout therefore survives only as the ceiling on a stalled body.
// It matches undici's own default `bodyTimeout` (300s) so we never cut a
// transfer earlier than the transport layer would have; making the body
// genuinely untimed needs a timer that stops at headers inside FetchUtils,
// which every other caller shares and which is out of scope for this fix.
const PROXY_BODY_TIMEOUT_MS = 300_000;

const PROXY_METHODS = ['GET', 'HEAD'] as const;
type ProxyMethod = (typeof PROXY_METHODS)[number];

const isProxyMethod = (value: string): value is ProxyMethod =>
	(PROXY_METHODS as ReadonlyArray<string>).includes(value);

// Statuses the Response constructor refuses to pair with a body.
const NULL_BODY_STATUSES: ReadonlyArray<number> = [204, 205];

// An allowlist, not a denylist: everything copied here is served to the browser
// under OUR origin, so a denylist only has to miss one header to hand the
// upstream control over it. `set-cookie` is the sharp one -- a hostile or
// MITM'd instance could set cookies for astraof.com (cookie tossing / session
// fixation) -- with `content-security-policy` and `strict-transport-security`
// next in line, since both rewrite our origin's security posture. Hop-by-hop
// headers (`connection`, `transfer-encoding`, ...) are excluded by
// construction, so the Node adapter keeps control of its own framing.
const FORWARDED_RESPONSE_HEADERS = [
	'content-type',
	'content-length',
	'content-encoding',
	'cache-control',
	'etag',
	'last-modified',
	'accept-ranges',
	'content-range',
];

const proxyInstanceSchema = z.union([
	createStringType(1, 512),
	z.object({url: createStringType(1, 512), version: createStringType(1, 32).optional()}),
]);

// The body used to be read straight out of `ctx.req.json()` with no schema and
// no size limit, so `instances` was unbounded in both length and entry size.
const proxyRequestSchema = z.object({
	path: createStringType(1, 512),
	method: createStringType(1, 16).optional(),
	type: z.enum(['api', 'streaming']).optional(),
	minVersion: createStringType(1, 32).optional(),
	allowedDomains: z.array(createStringType(1, 253)).max(MAX_ALLOWED_DOMAINS).optional(),
	instances: z.array(proxyInstanceSchema).max(MAX_INSTANCES).optional(),
});

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
		// CGNAT (100.64.0.0/10) covers Tailscale and k8s node ranges and was the
		// one range FetchUtils blocks that this list used to miss.
		if (a === 100 && b >= 64 && b <= 127) return true;
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

	// Kept narrower than FetchUtils on purpose: FetchUtils allows http: on port
	// 80 as well (unfurler/oEmbed/ActivityPub need it), which this route must
	// not, so the scheme/port gate stays here and FetchUtils only supplies the
	// resolve-validate-pin half. Applied to the URL the response actually landed
	// on too, so a redirect hop cannot downgrade the leg we serve.
	if (parsed.protocol !== 'https:') return null;
	// Restrict to the default HTTPS port. An explicit :443 is allowed; any
	// other port is rejected so the proxy can't be aimed at an internal
	// service on a high port.
	const port = parsed.port ? Number.parseInt(parsed.port, 10) : 443;
	if (port !== 443) return null;
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

		// `allowedDomains` is caller-supplied and therefore a client preference,
		// never a security control — the reachable host set is the server-side
		// allowlist built from Config.musicSearch.upstreams below.
		if (allowedDomains.length > 0 && !allowedDomains.some((domain) => new URL(instance.url).hostname === domain || new URL(instance.url).hostname.endsWith(`.${domain}`))) {
			return false;
		}

		return true;
	});
}

function toSafeInstances(entries: unknown): Array<ProxyInstanceEntry> {
	return normalizeInstances(entries).flatMap((instance) => {
		const safeUrl = parseSafeInstanceUrl(instance.url);
		return safeUrl ? [{...instance, url: safeUrl}] : [];
	});
}

function buildProxyResponseHeaders(upstreamHeaders: Headers): Headers {
	const headers = new Headers();
	for (const name of FORWARDED_RESPONSE_HEADERS) {
		const value = upstreamHeaders.get(name);
		if (value !== null) {
			headers.set(name, value);
		}
	}

	// Stated rather than left implied: `set-cookie` must never reach the browser
	// under our origin, so it stays dropped even if the allowlist above grows.
	headers.delete('set-cookie');
	return headers;
}

export const UserMusicProxyController = (app: HonoApp) => {
	app.post(
		'/music/proxy',
		RateLimitMiddleware(RateLimitConfigs.DEFAULT),
		LoginRequired,
		bodyLimit({maxSize: PROXY_BODY_LIMIT}),
		Validator('json', proxyRequestSchema),
		async (ctx) => {
			const body = ctx.req.valid('json');
			const relativePath = sanitizePath(body.path);
			if (!relativePath) {
				return ctx.json({error: 'music_proxy_invalid_path'}, 400);
			}

			const upstreamMethod = (body.method ?? 'GET').trim().toUpperCase();
			if (!isProxyMethod(upstreamMethod)) {
				return ctx.json({error: 'music_proxy_invalid_method'}, 400);
			}

			const allowedDomains = (body.allowedDomains ?? []).map((domain) => domain.trim().toLowerCase()).filter(Boolean);

			// The set of hosts this route can reach is server-side. Honouring
			// arbitrary `instances` turned an authenticated endpoint into an open
			// HTTPS relay that laundered the caller's IP behind ours; the body may
			// now only reorder / narrow the configured upstreams.
			const configuredInstances = toSafeInstances(Config.musicSearch.upstreams);
			const allowedHosts = new Set(configuredInstances.map((instance) => new URL(instance.url).hostname));
			const requestedInstances = toSafeInstances(body.instances).filter((instance) =>
				allowedHosts.has(new URL(instance.url).hostname),
			);

			const safeInstances = requestedInstances.length > 0 ? requestedInstances : configuredInstances;
			const filteredInstances = filterInstances(safeInstances, body.minVersion, allowedDomains);

			if (filteredInstances.length === 0) {
				return ctx.json({error: 'music_proxy_no_instances'}, 400);
			}

			let lastFailure: {status: number; body: string} | null = null;

			// A hand-rolled controller rather than AbortSignal.timeout because this
			// one has to be disarmed: on the streaming path the handler returns
			// while the upstream body is still transferring, and a timer left armed
			// would abort a response the client is already reading.
			const deadlineController = new AbortController();
			const deadlineTimer = setTimeout(() => deadlineController.abort('music_proxy_deadline'), PROXY_TOTAL_TIMEOUT_MS);
			const deadline = deadlineController.signal;

			try {
				for (const instance of filteredInstances) {
					if (deadline.aborted) break;

					const baseUrl = instance.url.replace(/\/+$/, '');
					const targetUrl = `${baseUrl}${relativePath}`;

					// Aborts the attempt if the headers do not arrive in time; cleared
					// the moment they do, so the budget never reaches the body.
					const attemptController = new AbortController();
					let headersTimer: ReturnType<typeof setTimeout> | undefined = setTimeout(
						() => attemptController.abort('music_proxy_headers_timeout'),
						PROXY_HEADERS_TIMEOUT_MS,
					);

					try {
						// FetchUtils.sendRequest is the audited outbound guard: it
						// resolves the host, rejects private/blocked answers, and pins
						// the address it validated for the actual connect, then applies
						// the same check to every redirect hop. The old code resolved
						// the host and then let native fetch() resolve it again, which
						// left a DNS-rebinding (TOCTOU) window wide open.
						const response = await FetchUtils.sendRequest({
							url: targetUrl,
							method: upstreamMethod,
							headers: {Accept: ctx.req.header('accept') || 'application/json, text/plain, */*'},
							signal: AbortSignal.any([deadline, attemptController.signal]),
							timeout: PROXY_BODY_TIMEOUT_MS,
						});

						clearTimeout(headersTimer);
						headersTimer = undefined;

						// FetchUtils follows redirects itself and its hop check accepts
						// http: on port 80 (the unfurler needs that); this route must
						// not serve a plaintext hop from our origin, so the URL the
						// response actually landed on is re-checked against the same
						// https-only gate the configured instances go through.
						if (!parseSafeInstanceUrl(response.url)) {
							response.stream.destroy();
							lastFailure = {status: 502, body: 'music_proxy_insecure_redirect'};
							continue;
						}

						// Every non-2xx falls through to the next instance, exactly as
						// before: the old 429/5xx, 401-subStatus and generic !ok
						// branches all ended in `lastFailure = ...; continue`. The body
						// has to be drained here anyway to release the socket.
						if (response.status < 200 || response.status >= 300) {
							lastFailure = {status: response.status, body: await FetchUtils.streamToString(response.stream)};
							continue;
						}

						// undici always hands back a body stream, unlike fetch() which
						// gives null for a null-body status, and Response rejects a body
						// on 204/205 — so drain and pass null for those.
						if (NULL_BODY_STATUSES.includes(response.status)) {
							await FetchUtils.streamToString(response.stream);
							return new Response(null, {
								status: response.status,
								headers: buildProxyResponseHeaders(response.headers),
							});
						}

						return new Response(Readable.toWeb(response.stream) as BodyInit, {
							status: response.status,
							headers: buildProxyResponseHeaders(response.headers),
						});
					} catch {
						// Fixed string on purpose: the upstream connect/TLS/DNS error
						// text is an internal-network oracle once it reaches the caller.
						lastFailure = {status: 502, body: 'music_proxy_request_failed'};
					} finally {
						clearTimeout(headersTimer);
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
			} finally {
				clearTimeout(deadlineTimer);
			}
		},
	);
};
