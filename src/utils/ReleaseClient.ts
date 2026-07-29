/*
 * Copyright (C) 2026 Astral Contributors
 *
 * Fetches the unified release manifest served as /version.json.
 */

import {parseVersionJsonPayload, type VersionJsonPayload} from '~/utils/RolloutUtils';

const VERSION_ENDPOINT = '/version.json';
const CACHE_TTL_MS = 60_000;

let cachedManifest: VersionJsonPayload | null = null;
let cachedAt = 0;
let inFlightRequest: Promise<VersionJsonPayload | null> | null = null;

async function requestReleaseManifest(): Promise<VersionJsonPayload | null> {
	try {
		const response = await fetch(VERSION_ENDPOINT, {
			cache: 'no-store',
			headers: {'Cache-Control': 'no-cache'},
		});
		if (!response.ok) {
			return cachedManifest;
		}

		const payload = parseVersionJsonPayload(await response.json());
		if (payload) {
			cachedManifest = payload;
			cachedAt = Date.now();
		}
		return payload;
	} catch {
		return cachedManifest;
	}
}

export async function fetchReleaseManifest(options: {force?: boolean} = {}): Promise<VersionJsonPayload | null> {
	if (!options.force && cachedManifest && Date.now() - cachedAt < CACHE_TTL_MS) {
		return cachedManifest;
	}

	// /version.json is uncacheable by construction (`no-store` here, plus
	// `Cache-Control: no-cache` at the edge), and boot fires several independent
	// checks against it: the web/android/desktop update gates and UpdaterStore's
	// own check, which passes `force`. The TTL cache is always cold at that point,
	// so without in-flight dedup each of those costs a separate full round trip.
	// `force` callers join an in-flight request on purpose — it was started after
	// the last cache clear, so its response is as fresh as a new one would be.
	if (!inFlightRequest) {
		const request: Promise<VersionJsonPayload | null> = requestReleaseManifest().finally(() => {
			// Only release the slot if it is still ours: clearReleaseManifestCache may
			// have dropped us while a newer request already took ownership.
			if (inFlightRequest === request) {
				inFlightRequest = null;
			}
		});
		inFlightRequest = request;
	}

	return inFlightRequest;
}

export function getCachedReleaseManifest(): VersionJsonPayload | null {
	return cachedManifest;
}

export function clearReleaseManifestCache(): void {
	cachedManifest = null;
	cachedAt = 0;
	// Callers clear the cache precisely because they need a response that
	// reflects the world after the clear, so drop the join point too rather than
	// letting them adopt a request that started before it.
	inFlightRequest = null;
}
