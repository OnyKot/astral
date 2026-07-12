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
 * but WITHOUT ANY WARRANTY; without even implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with Astral. If not, see <https://www.gnu.org/licenses/>.
 */

/*
 * Spring result cache.
 *
 * A given (from, to, config) always produces the same sampled curve, and the
 * app uses only a handful of distinct spring configs (the SPRINGS presets plus
 * a few inline ones). Caching avoids re-running the RK4 integration on every
 * mount of every animated element — which matters for the voice status view
 * that mounts 40+ animated elements at once.
 *
 * The cache is keyed by a signature string and lives at module scope. It is
 * unbounded in principle but in practice holds ~20-30 entries; that's fine.
 */

import type {SpringConfig, SpringResult} from './solver';

export interface SpringCacheKey {
	from: number;
	to: number;
	config: SpringConfig;
}

function signature(key: SpringCacheKey): string {
	const c = key.config;
	return [
		key.from,
		key.to,
		c.stiffness,
		c.damping,
		c.mass,
		c.velocity ?? 0,
		c.restDelta ?? 0.001,
		c.restSpeed ?? 0.001,
		c.fps ?? 120,
	].join(':');
}

const cache = new Map<string, SpringResult>();

export function getCachedSpring(key: SpringCacheKey, solve: (k: SpringCacheKey) => SpringResult): SpringResult {
	const sig = signature(key);
	const existing = cache.get(sig);
	if (existing) return existing;
	const result = solve(key);
	cache.set(sig, result);
	return result;
}

/** Test hook: clear the cache between unit tests. */
export function clearSpringCache(): void {
	cache.clear();
}

/** Test hook: inspect cache size. */
export function springCacheSize(): number {
	return cache.size;
}
