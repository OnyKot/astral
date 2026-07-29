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

import type {UserID} from '~/BrandedTypes';
import {UserFlags} from '~/Constants';
import {UnknownUserError} from '~/Errors';
import type {ICacheService} from '~/infrastructure/ICacheService';
import {InMemoryCoalescer} from '~/infrastructure/InMemoryCoalescer';
import type {RequestCache} from '~/middleware/RequestCacheMiddleware';
import type {IUserRepository} from '~/user/IUserRepository';
import type {UserPartialResponse} from '~/user/UserModel';
import {mapUserToPartialResponse} from '~/user/UserModel';

/**
 * In-process negative cache for "user does not exist" lookups.
 *
 * Upstream we used to re-query the repo every single time a deleted user
 * id showed up in a cached relationship / channel history row, producing
 * a steady stream of `Skipping message with missing user` / `Skipping
 * relationship with missing user` warns (seen in prod once a minute for
 * the same handful of ids). 60 s TTL is long enough to suppress that
 * spam but short enough that a freshly-undeleted user comes back fast.
 */
const NEGATIVE_TTL_MS = 60_000;
const negativeCache = new Map<string, number>();

function isKnownMissing(userId: UserID): boolean {
	const expires = negativeCache.get(userId.toString());
	if (!expires) return false;
	if (expires <= Date.now()) {
		negativeCache.delete(userId.toString());
		return false;
	}
	return true;
}

function markMissing(userId: UserID): void {
	negativeCache.set(userId.toString(), Date.now() + NEGATIVE_TTL_MS);
	// Bounded — drop the oldest half if we accumulate weirdly many ids.
	if (negativeCache.size > 10_000) {
		const cutoff = Date.now();
		for (const [k, exp] of negativeCache) {
			if (exp <= cutoff) negativeCache.delete(k);
		}
	}
}

function forgetMissing(userId: UserID): void {
	negativeCache.delete(userId.toString());
}

/**
 * Process-wide, deliberately NOT an instance field: `ServiceMiddleware`
 * constructs a fresh `UserCacheService` for every request, so a per-instance
 * coalescer only ever deduped fetches inside one request and gave zero
 * stampede protection where it matters — a cold `user:partial:*` key on a busy
 * channel used to send one repo read per concurrent request. The key space
 * (`user:partial:<id>`) is global and the repositories are interchangeable, so
 * sharing across requests is safe.
 */
const partialCoalescer = new InMemoryCoalescer();

export class UserCacheService {
	constructor(
		public readonly cacheService: ICacheService,
		private userRepository: IUserRepository,
	) {}

	async getUserPartialResponse(userId: UserID, requestCache: RequestCache): Promise<UserPartialResponse> {
		const cached = requestCache.userPartials.get(userId);
		if (cached) {
			return cached;
		}

		if (isKnownMissing(userId)) {
			throw new UnknownUserError();
		}

		const cacheKey = `user:partial:${userId}`;
		const redisCached = await this.cacheService.getAndRenewTtl<UserPartialResponse>(cacheKey, 300);

		if (redisCached) {
			requestCache.userPartials.set(userId, redisCached);
			return redisCached;
		}

		return this.fetchAndCachePartial(userId, requestCache);
	}

	/**
	 * Repo-backed load + cache write shared by the single and batched read
	 * paths. Coalesces concurrent fetches for the same id and records the
	 * negative-cache mark on `UnknownUserError` so both paths behave the same.
	 */
	private async fetchAndCachePartial(userId: UserID, requestCache: RequestCache): Promise<UserPartialResponse> {
		const cacheKey = `user:partial:${userId}`;
		try {
			const userPartialResponse = await partialCoalescer.coalesce(cacheKey, async () => {
				const user = await this.userRepository.findUnique(userId);
				if (!user) {
					throw new UnknownUserError();
				}
				if (user.flags & UserFlags.DELETED) {
					throw new UnknownUserError();
				}
				return mapUserToPartialResponse(user);
			});

			// Cache population is not something the caller waits on: the value it
			// needs is already in hand, and the SET is handed to Redis at the same
			// moment either way (so an invalidation issued right after this call
			// still lands after the SET). Matches `mapUserToPartialResponseWithCache`.
			Promise.resolve(this.cacheService.set(cacheKey, userPartialResponse, 300)).catch(() => {});
			requestCache.userPartials.set(userId, userPartialResponse);
			return userPartialResponse;
		} catch (error) {
			if (error instanceof UnknownUserError) {
				markMissing(userId);
			}
			throw error;
		}
	}

	async invalidateUserCache(userId: UserID): Promise<void> {
		const cacheKey = `user:partial:${userId}`;
		await this.cacheService.delete(cacheKey);
		// If a user is explicitly invalidated (create, undelete, profile
		// edit), wipe the negative-cache entry so the next read hits the
		// repo instead of short-circuiting on a stale "missing" mark.
		forgetMissing(userId);
	}

	async getUserPartialResponses(
		userIds: Array<UserID>,
		requestCache: RequestCache,
	): Promise<Map<UserID, UserPartialResponse>> {
		const results = new Map<UserID, UserPartialResponse>();

		// Dedupe ids up front and resolve everything we can without touching
		// Redis: the per-request cache and the in-process negative cache. The
		// remaining ids are fetched from Redis in a single `mget` instead of
		// one round-trip per id (previously this fanned out N `getAndRenewTtl`
		// calls, which dominated latency on READY / message-history fan-out).
		const pending = new Map<string, UserID>();
		for (const userId of userIds) {
			const key = userId.toString();
			if (results.has(userId) || pending.has(key)) {
				continue;
			}
			const cached = requestCache.userPartials.get(userId);
			if (cached) {
				results.set(userId, cached);
				continue;
			}
			if (isKnownMissing(userId)) {
				continue;
			}
			pending.set(key, userId);
		}

		if (pending.size === 0) {
			return results;
		}

		// Per-user error isolation: a single missing id (e.g. a deleted account
		// still referenced by a cached member list) becomes a missing key in the
		// returned map rather than rejecting the whole batch. Every call site is
		// already defensive about absent entries.
		const pendingIds = [...pending.values()];
		const cacheKeys = pendingIds.map((userId) => `user:partial:${userId}`);
		const redisValues = await this.cacheService.mget<UserPartialResponse>(cacheKeys);

		const misses: Array<UserID> = [];
		const renewals: Array<string> = [];
		for (let index = 0; index < pendingIds.length; index += 1) {
			const userId = pendingIds[index]!;
			const value = redisValues[index];
			if (value) {
				requestCache.userPartials.set(userId, value);
				results.set(userId, value);
				renewals.push(cacheKeys[index]!);
			} else {
				misses.push(userId);
			}
		}

		// Sliding-window renewal is EXPIRE, not a rewrite: `mset` re-serialized and
		// re-sent every payload we had just read (and would resurrect a key another
		// request had concurrently invalidated). The commands are issued in one tick
		// so ioredis writes them together, and nobody waits on the result.
		if (renewals.length > 0) {
			Promise.all(renewals.map((key) => this.cacheService.expire(key, 300))).catch(() => {});
		}

		if (misses.length > 0) {
			await Promise.all(
				misses.map(async (userId) => {
					try {
						const userResponse = await this.fetchAndCachePartial(userId, requestCache);
						results.set(userId, userResponse);
					} catch {
						// swallow — caller handles the missing entry
					}
				}),
			);
		}

		return results;
	}
}
