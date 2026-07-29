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

export abstract class ICacheService {
	abstract get<T>(key: string): Promise<T | null>;
	abstract set<T>(key: string, value: T, ttlSeconds?: number): Promise<void>;
	abstract delete(key: string): Promise<void>;
	abstract getAndDelete<T>(key: string): Promise<T | null>;
	abstract exists(key: string): Promise<boolean>;
	abstract expire(key: string, ttlSeconds: number): Promise<void>;
	abstract ttl(key: string): Promise<number>;
	/**
	 * Atomically increments a counter and, only when the counter is created, arms a `windowMs` expiry.
	 * Returns the post-increment count together with the remaining window in milliseconds, so callers
	 * never have to read-modify-write (which loses increments under concurrent bursts).
	 */
	abstract incrWithWindow(key: string, windowMs: number): Promise<{count: number; pttlMs: number}>;
	abstract mget<T>(keys: Array<string>): Promise<Array<T | null>>;
	abstract mset<T>(entries: Array<{key: string; value: T; ttlSeconds?: number}>): Promise<void>;
	abstract deletePattern(pattern: string): Promise<number>;
	abstract acquireLock(key: string, ttlSeconds: number): Promise<string | null>;
	abstract releaseLock(key: string, token: string): Promise<boolean>;
	abstract getAndRenewTtl<T>(key: string, newTtlSeconds: number): Promise<T | null>;
	abstract publish(channel: string, message: string): Promise<void>;
}
