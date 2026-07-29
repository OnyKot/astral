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

import type {ICacheService} from '~/infrastructure/ICacheService';

/**
 * Memoize an admin-endpoint response for `ttlSeconds` in Redis.
 *
 * Motivation: the admin UI polls a handful of endpoints (`/v1/admin/users/me`,
 * `/v1/admin/guilds/discovery/applications`, `/v1/admin/pending-verifications/list`)
 * every ~1.5 s while the dashboard is open. In production we measured 460
 * admin requests over five minutes from a single dashboard, all hitting
 * Cassandra repeatedly for data that changes far more slowly than that.
 *
 * Caching the JSON body for a few seconds keyed by adminId + endpoint
 * collapses these polls down to one DB round-trip per TTL window per admin.
 * Use a short TTL (3-5 s) so the dashboard still feels live.
 *
 * The helper is generic over the response shape and assumes the response is
 * JSON-serializable. Stored value is exactly what the handler returned.
 *
 * Cache invalidation is intentionally not done here: with a 3-5 s TTL the
 * extra latency on a write that should immediately reflect in the UI is
 * imperceptible compared to a manual refresh. If a specific mutation needs
 * to bust the cache eagerly, call `cache.delete(key)` after the write.
 */
export async function cachedAdminResponse<T>(
	cache: ICacheService,
	key: string,
	ttlSeconds: number,
	produce: () => Promise<T>,
): Promise<T> {
	const cached = await cache.get<T>(key);
	if (cached !== null) {
		return cached;
	}
	const fresh = await produce();
	await cache.set(key, fresh, ttlSeconds);
	return fresh;
}

/** Stable key for per-admin response cache. */
export function adminResponseCacheKey(parts: {
	endpoint: string;
	adminUserId: string;
	suffix?: string;
}): string {
	const tail = parts.suffix ? `:${parts.suffix}` : '';
	return `cache:admin-resp:${parts.endpoint}:${parts.adminUserId}${tail}`;
}

export const ADMIN_RESPONSE_CACHE_TTL_SECONDS = 5;
