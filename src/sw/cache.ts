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
 *   L0  app shell        — index.html precached, navigations served network-first with
 *                          an offline fallback to the cached shell. `/` is *not*
 *                          content-addressed, so its bucket stays keyed by build SHA.
 *   L0  immutable assets — `/assets/<contenthash>.<ext>` bundles (rspack's production
 *                          output) are content-addressed: a changed chunk arrives under
 *                          a new filename, so the cache is keyed by URL alone and
 *                          survives deploys. Bounded by an LRU: a last-used index, an
 *                          entry cap and a max age, so chunks belonging to builds nobody
 *                          loads any more are pruned instead of accumulating.
 *   L0  volatile assets  — `/assets/<name>.<ext>` with no digest in the filename. That
 *                          is what the rspack dev server emits, and the dev server is
 *                          what production currently serves (hence the
 *                          `Cache-Control: no-cache` Caddy sends for `/assets/*.js|css`).
 *                          Those names are reused across builds, so they must never be
 *                          cache-first forever: they live in a build-SHA-scoped bucket
 *                          and are served stale-while-revalidate, i.e. instantly from
 *                          cache but never stale for more than a single load.
 *   L1  media            — avatars / emoji / stickers / attachments from first-party
 *                          hosts, cache-first with a TTL and an LRU size cap. The bucket
 *                          is content-addressed and survives deploys (URLs already carry
 *                          a content hash).
 *
 * API, gateway and error-reporting traffic is never intercepted; neither is anything
 * outside `/assets/` (`/version.json` and `sw.js` itself included), so those keep going
 * to the network under the server's own cache headers.
 */

// Injected at build time via esbuild `define` (see scripts/build/utils/service-worker.ts).
declare const __BUILD_SHA__: string;
declare const __MEDIA_HOST_SUFFIXES__: string;

const VERSION = typeof __BUILD_SHA__ === 'string' && __BUILD_SHA__ ? __BUILD_SHA__ : 'dev';

const SHELL_CACHE = `astral-shell-${VERSION}`;
// Only holds bundles whose filename carries no content hash, so it must be wiped per build.
const VERSIONED_STATIC_CACHE = `astral-static-${VERSION}`;
// Content-addressed bundles: the filename is the version, so the bucket never is.
const IMMUTABLE_CACHE = 'astral-immutable-v1';
const IMMUTABLE_INDEX_CACHE = 'astral-immutable-index-v1';
const MEDIA_CACHE = 'astral-media-v1';

const CACHE_PREFIX = 'astral-';
const EXPECTED_CACHES = new Set([
	SHELL_CACHE,
	VERSIONED_STATIC_CACHE,
	IMMUTABLE_CACHE,
	IMMUTABLE_INDEX_CACHE,
	MEDIA_CACHE,
]);

const SHELL_URL = '/';

const MEDIA_MAX_ENTRIES = 600;
const MEDIA_MAX_AGE_MS = 1000 * 60 * 60 * 24 * 14; // 14 days
const CACHED_AT_HEADER = 'x-sw-cached-at';

// A build emits ~130 distinct asset URLs, so the cap leaves room for the current build
// plus roughly one previous one; the age sweep is what actually reclaims dead builds.
const IMMUTABLE_MAX_ENTRIES = 300;
const IMMUTABLE_MAX_AGE_MS = 1000 * 60 * 60 * 24 * 30; // 30 days
// Refreshing the last-used stamp on every hit would mean a disk write per subresource per
// page load; day granularity is plenty against a 30-day expiry.
const IMMUTABLE_TOUCH_INTERVAL_MS = 1000 * 60 * 60 * 24;
const IMMUTABLE_PRUNE_EVERY_WRITES = 32;
const USED_AT_HEADER = 'x-sw-used-at';

const MEDIA_HOST_SUFFIXES = (typeof __MEDIA_HOST_SUFFIXES__ === 'string' ? __MEDIA_HOST_SUFFIXES__ : '')
	.split(',')
	.map((entry) => entry.trim())
	.filter((entry) => entry.length > 0);

// Bundles emitted by rspack live under /assets/<name>.<ext>.
const STATIC_ASSET_RE = /\/assets\/[^/]+\.(?:js|css|wasm|woff2?|ttf|otf|png|jpe?g|webp|gif|svg|avif|ico)$/i;
const MEDIA_EXT_RE = /\.(?:png|jpe?g|webp|gif|svg|avif|apng|bmp|ico|mp4|webm|mov|m4a|mp3|ogg|opus|wav|flac)$/i;

// A digest-looking filename token: 8+ hex characters including at least one digit. The
// digit requirement is what stops ordinary words from matching — dev-server chunk names
// are module paths (`src_components_voice_VoiceCallView_tsx.js`) and a word spelled with
// only a-f letters would otherwise pass for a hash. A real digest missing digits entirely
// is astronomically unlikely, and the fallback is merely the version-scoped bucket.
const CONTENT_HASH_TOKEN_RE = /^(?=[0-9a-f]*[0-9])[0-9a-f]{8,}$/i;

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

/*
 * Whether the URL alone is safe to use as a permanent cache key. rspack's production
 * output is `assets/[contenthash:16].<ext>`, so the whole basename is a digest; the dev
 * server emits `assets/[name].<ext>` and reuses that name across builds, which is exactly
 * the deployment production runs today — those must not be pinned to a URL key.
 */
function isContentAddressed(url: URL): boolean {
	const filename = url.pathname.slice(url.pathname.lastIndexOf('/') + 1);
	const dot = filename.lastIndexOf('.');
	const base = dot > 0 ? filename.slice(0, dot) : filename;
	return base.split(/[._-]/).some((token) => CONTENT_HASH_TOKEN_RE.test(token));
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

// Keeps the worker alive for background cache work without failing the response when the
// event has already gone inactive.
function keepAlive(event: FetchEvent, work: Promise<unknown>): void {
	const settled = work.catch(() => undefined);
	try {
		event.waitUntil(settled);
	} catch {
		// The work still runs, it just loses its lifetime extension.
	}
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

// A zero-byte body: the stamp lives entirely in the header, so a bookkeeping row costs
// nothing beyond its key.
function usedAtResponse(timestamp: number): Response {
	return new Response('', {headers: {[USED_AT_HEADER]: timestamp.toString()}});
}

function readUsedAt(response: Response | undefined): number | null {
	const raw = response?.headers.get(USED_AT_HEADER);
	if (!raw) return null;
	const parsed = Number(raw);
	return Number.isFinite(parsed) ? parsed : null;
}

/*
 * LRU bookkeeping lives in its own bucket of zero-byte entries rather than being stamped
 * onto the bundles themselves: the cached bytes are then handed back exactly as the
 * network produced them (no Response rewriting on the hot path), and opaque cross-origin
 * responses — which cannot carry a custom header at all — are still tracked.
 */
async function touchImmutableEntry(url: string): Promise<void> {
	try {
		const index = await caches.open(IMMUTABLE_INDEX_CACHE);
		const now = Date.now();
		const usedAt = readUsedAt(await index.match(url));
		if (usedAt !== null && now - usedAt < IMMUTABLE_TOUCH_INTERVAL_MS) return;
		await index.put(url, usedAtResponse(now));
	} catch {
		// Bookkeeping is best-effort; a lost write only makes an entry look older.
	}
}

let pruningImmutable = false;
let immutableWritesSincePrune = 0;

/*
 * Drops content-addressed entries that are no longer referenced. There is no precache
 * manifest to diff against (`scripts/build/utils/service-worker.ts` defines `__WB_MANIFEST`
 * as an empty list and nothing precaches bundles), so "no longer referenced" is derived
 * from use: a chunk the current build still loads gets touched on every page load, one
 * belonging to a retired build never is and ages out. The entry cap is the hard bound.
 */
async function pruneImmutableCache(force: boolean): Promise<void> {
	if (pruningImmutable) return;
	pruningImmutable = true;
	try {
		immutableWritesSincePrune = 0;
		const cache = await caches.open(IMMUTABLE_CACHE);
		const keys = await cache.keys();
		// Outside of an activate, skip the age sweep while the cache is comfortably small.
		if (!force && keys.length <= IMMUTABLE_MAX_ENTRIES) return;

		const index = await caches.open(IMMUTABLE_INDEX_CACHE);
		const stamped = await Promise.all(
			keys.map(async (request) => ({request, usedAt: readUsedAt(await index.match(request.url))})),
		);

		const now = Date.now();
		const live = new Set<string>();
		const doomed: Array<Request> = [];
		const survivors: Array<{request: Request; usedAt: number; needsStamp: boolean}> = [];
		for (const {request, usedAt} of stamped) {
			live.add(request.url);
			// A missing stamp means an upgrade from an older worker or a lost write, not a
			// cold entry: start its clock now instead of evicting something possibly hot.
			if (usedAt !== null && now - usedAt > IMMUTABLE_MAX_AGE_MS) {
				doomed.push(request);
			} else {
				survivors.push({request, usedAt: usedAt ?? now, needsStamp: usedAt === null});
			}
		}

		survivors.sort((a, b) => a.usedAt - b.usedAt);
		const overflow = survivors.length - IMMUTABLE_MAX_ENTRIES;
		for (let i = 0; i < overflow; i++) {
			doomed.push(survivors[i].request);
		}

		const pending: Array<Promise<unknown>> = [];
		for (const request of doomed) {
			pending.push(cache.delete(request).catch(() => undefined));
			pending.push(index.delete(request.url).catch(() => undefined));
		}
		for (let i = Math.max(overflow, 0); i < survivors.length; i++) {
			if (survivors[i].needsStamp) {
				pending.push(index.put(survivors[i].request.url, usedAtResponse(now)).catch(() => undefined));
			}
		}
		// Bookkeeping rows whose asset is gone (quota eviction, a manual cache clear).
		for (const row of await index.keys()) {
			if (!live.has(row.url)) {
				pending.push(index.delete(row).catch(() => undefined));
			}
		}
		await Promise.all(pending);
	} catch {
		// Pruning is best-effort.
	} finally {
		pruningImmutable = false;
	}
}

async function immutableCacheFirst(event: FetchEvent, request: Request): Promise<Response> {
	const cache = await caches.open(IMMUTABLE_CACHE);
	const cached = await cache.match(request);
	if (cached) {
		keepAlive(event, touchImmutableEntry(request.url));
		return cached;
	}

	const response = await fetch(request);
	if (isCacheable(response)) {
		const copy = response.clone();
		keepAlive(
			event,
			(async () => {
				await cache.put(request, copy);
				await touchImmutableEntry(request.url);
				immutableWritesSincePrune += 1;
				if (immutableWritesSincePrune >= IMMUTABLE_PRUNE_EVERY_WRITES) {
					await pruneImmutableCache(false);
				}
			})(),
		);
	}
	return response;
}

async function staleWhileRevalidate(event: FetchEvent, request: Request, cacheName: string): Promise<Response> {
	const cache = await caches.open(cacheName);
	const cached = await cache.match(request);
	const network = fetch(request).then(async (response) => {
		if (!isCacheable(response)) return response;
		const copy = response.clone();
		if (!cached) {
			// First load of this asset: hand it over immediately, store in the background.
			void cache.put(request, copy).catch(() => undefined);
			return response;
		}
		// The caller already has the cached copy, so the refresh is what `keepAlive` below
		// has to see through to completion — otherwise the stale copy would never be replaced.
		await cache.put(request, copy);
		return response;
	});

	if (cached) {
		keepAlive(event, network);
		return cached;
	}
	return network;
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
	// A new build activating is precisely when chunks stop being referenced: the new shell
	// asks for different filenames and the retired ones are never touched again.
	await pruneImmutableCache(true);
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
		if (isContentAddressed(url)) {
			// The filename is the content hash, so the URL is a permanent key: a changed
			// chunk shows up as a different URL and the old one simply ages out.
			event.respondWith(immutableCacheFirst(event, request));
		} else {
			// Reused-across-builds filename: keep it scoped to the build and revalidate in
			// the background, so it can never be pinned to one stale copy.
			event.respondWith(staleWhileRevalidate(event, request, VERSIONED_STATIC_CACHE));
		}
		return;
	}

	if (isMedia(url)) {
		event.respondWith(mediaCacheFirst(request));
		return;
	}

	// Everything else falls through to the network untouched.
}
