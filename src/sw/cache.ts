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

/// <reference lib="webworker" />

/*
 * Multi-layer service-worker cache.
 *
 *   L0  app shell      — index.html precached, navigations served network-first
 *                        with an offline fallback to the cached shell.
 *   L0  static assets  — hashed, content-addressed bundles under /assets/ are
 *                        immutable, so cache-first. Versioned buckets are wiped
 *                        on activate when the build SHA changes.
 *   L1  media          — avatars / emoji / stickers / attachments from
 *                        first-party hosts, cache-first with a TTL and an LRU
 *                        size cap. The bucket is content-addressed and survives
 *                        deploys (URLs already carry a content hash).
 *
 * API, gateway and error-reporting traffic is never intercepted.
 */

// Injected at build time via esbuild `define` (see scripts/build/utils/service-worker.ts).
declare const __BUILD_SHA__: string;
declare const __MEDIA_HOST_SUFFIXES__: string;

const VERSION = typeof __BUILD_SHA__ === 'string' && __BUILD_SHA__ ? __BUILD_SHA__ : 'dev';

const SHELL_CACHE = `astral-shell-${VERSION}`;
const STATIC_CACHE = `astral-static-${VERSION}`;
const MEDIA_CACHE = 'astral-media-v1';

const CACHE_PREFIX = 'astral-';
const EXPECTED_CACHES = new Set([SHELL_CACHE, STATIC_CACHE, MEDIA_CACHE]);

const SHELL_URL = '/';

const MEDIA_MAX_ENTRIES = 600;
const MEDIA_MAX_AGE_MS = 1000 * 60 * 60 * 24 * 14; // 14 days
const CACHED_AT_HEADER = 'x-sw-cached-at';

const MEDIA_HOST_SUFFIXES = (typeof __MEDIA_HOST_SUFFIXES__ === 'string' ? __MEDIA_HOST_SUFFIXES__ : '')
	.split(',')
	.map((entry) => entry.trim())
	.filter((entry) => entry.length > 0);

// Hashed bundles emitted by rspack live under /assets/<contenthash>.<ext>.
const STATIC_ASSET_RE = /\/assets\/[^/]+\.(?:js|css|wasm|woff2?|ttf|otf|png|jpe?g|webp|gif|svg|avif|ico)$/i;
const MEDIA_EXT_RE = /\.(?:png|jpe?g|webp|gif|svg|avif|apng|bmp|ico|mp4|webm|mov|m4a|mp3|ogg|opus|wav|flac)$/i;

function isFirstPartyMediaHost(hostname: string): boolean {
	return MEDIA_HOST_SUFFIXES.some((suffix) =>
		suffix.startsWith('.') ? hostname === suffix.slice(1) || hostname.endsWith(suffix) : hostname === suffix,
	);
}

function hasMediaProxyParams(url: URL): boolean {
	return (
		url.searchParams.has('format') ||
		url.searchParams.has('width') ||
		url.searchParams.has('height') ||
		url.searchParams.has('quality') ||
		url.searchParams.has('animated')
	);
}

function isStaticAsset(url: URL): boolean {
	return STATIC_ASSET_RE.test(url.pathname);
}

function isMedia(url: URL): boolean {
	if (!isFirstPartyMediaHost(url.hostname)) return false;
	if (url.pathname.startsWith('/api') || url.pathname.startsWith('/gateway')) return false;
	return MEDIA_EXT_RE.test(url.pathname) || hasMediaProxyParams(url);
}

function isCacheable(response: Response | undefined): response is Response {
	return Boolean(response) && (response!.ok || response!.type === 'opaque');
}

function withTimestamp(response: Response): Response {
	// Opaque responses expose no headers and cannot be reconstructed, so they
	// are stored as-is and rely on the LRU cap + version bumps for freshness.
	if (response.type === 'opaque' || response.type === 'opaqueredirect') {
		return response;
	}
	try {
		const headers = new Headers(response.headers);
		headers.set(CACHED_AT_HEADER, Date.now().toString());
		return new Response(response.body, {
			status: response.status,
			statusText: response.statusText,
			headers,
		});
	} catch {
		return response;
	}
}

function isExpired(response: Response): boolean {
	const stamp = response.headers.get(CACHED_AT_HEADER);
	if (!stamp) return false;
	const cachedAt = Number(stamp);
	if (!Number.isFinite(cachedAt)) return false;
	return Date.now() - cachedAt > MEDIA_MAX_AGE_MS;
}

let trimmingMedia = false;

async function trimMediaCache(cache: Cache): Promise<void> {
	if (trimmingMedia) return;
	trimmingMedia = true;
	try {
		const keys = await cache.keys();
		const overflow = keys.length - MEDIA_MAX_ENTRIES;
		for (let i = 0; i < overflow; i++) {
			await cache.delete(keys[i]);
		}
	} catch {
		// Cache eviction is best-effort.
	} finally {
		trimmingMedia = false;
	}
}

async function cacheFirst(request: Request, cacheName: string): Promise<Response> {
	const cache = await caches.open(cacheName);
	const cached = await cache.match(request);
	if (cached) return cached;

	const response = await fetch(request);
	if (isCacheable(response)) {
		void cache.put(request, response.clone()).catch(() => undefined);
	}
	return response;
}

async function networkFirstNavigation(request: Request): Promise<Response> {
	const cache = await caches.open(SHELL_CACHE);
	try {
		const response = await fetch(request);
		if (response && response.ok) {
			void cache.put(SHELL_URL, response.clone()).catch(() => undefined);
		}
		return response;
	} catch (error) {
		const cached = (await cache.match(SHELL_URL)) ?? (await cache.match(request));
		if (cached) return cached;
		throw error;
	}
}

async function mediaCacheFirst(request: Request): Promise<Response> {
	const cache = await caches.open(MEDIA_CACHE);
	const cached = await cache.match(request);
	if (cached && !isExpired(cached)) {
		return cached;
	}

	try {
		const response = await fetch(request);
		if (isCacheable(response)) {
			const toStore = withTimestamp(response.clone());
			void cache
				.put(request, toStore)
				.then(() => trimMediaCache(cache))
				.catch(() => undefined);
		}
		return response;
	} catch (error) {
		if (cached) return cached; // serve stale media when offline
		throw error;
	}
}

export async function handleInstall(): Promise<void> {
	try {
		const cache = await caches.open(SHELL_CACHE);
		await cache.add(SHELL_URL);
	} catch {
		// A missing shell at install time must not block activation.
	}
}

export async function handleActivate(): Promise<void> {
	try {
		const names = await caches.keys();
		await Promise.all(
			names
				.filter((name) => name.startsWith(CACHE_PREFIX) && !EXPECTED_CACHES.has(name))
				.map((name) => caches.delete(name)),
		);
	} catch {
		// Best-effort cleanup of stale versioned buckets.
	}
}

export function handleFetch(event: FetchEvent): void {
	const request = event.request;
	if (request.method !== 'GET') return;
	// Let the network handle byte-range requests (audio/video seeking).
	if (request.headers.has('range')) return;

	let url: URL;
	try {
		url = new URL(request.url);
	} catch {
		return;
	}
	if (url.protocol !== 'http:' && url.protocol !== 'https:') return;

	// Never intercept dynamic API / gateway / telemetry traffic.
	if (
		url.pathname.startsWith('/api') ||
		url.pathname.startsWith('/gateway') ||
		url.pathname.includes('error-reporting')
	) {
		return;
	}

	if (request.mode === 'navigate') {
		event.respondWith(networkFirstNavigation(request));
		return;
	}

	if (isStaticAsset(url)) {
		event.respondWith(cacheFirst(request, STATIC_CACHE));
		return;
	}

	if (isMedia(url)) {
		event.respondWith(mediaCacheFirst(request));
		return;
	}

	// Everything else falls through to the network untouched.
}
