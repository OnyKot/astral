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

export async function fetchReleaseManifest(options: {force?: boolean} = {}): Promise<VersionJsonPayload | null> {
	if (!options.force && cachedManifest && Date.now() - cachedAt < CACHE_TTL_MS) {
		return cachedManifest;
	}

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

export function getCachedReleaseManifest(): VersionJsonPayload | null {
	return cachedManifest;
}

export function clearReleaseManifestCache(): void {
	cachedManifest = null;
	cachedAt = 0;
}
