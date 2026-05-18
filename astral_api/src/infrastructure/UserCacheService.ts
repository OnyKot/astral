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

export class UserCacheService {
	private coalescer = new InMemoryCoalescer();

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

		try {
			const userPartialResponse = await this.coalescer.coalesce(cacheKey, async () => {
				const user = await this.userRepository.findUnique(userId);
				if (!user) {
					throw new UnknownUserError();
				}
				if (user.flags & UserFlags.DELETED) {
					throw new UnknownUserError();
				}
				return mapUserToPartialResponse(user);
			});

			await this.cacheService.set(cacheKey, userPartialResponse, 300);
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

		// Per-user error isolation. Previously one UnknownUserError in a
		// batch of 100 (e.g. deleted account that's still in a cached
		// member list) rejected the whole Promise.all and propagated up,
		// killing whichever mapper called this (guild members, emoji
		// author list, message author fan-out). Caller-side now sees a
		// partial map: missing ids become missing keys in the Map, which
		// every existing call site was already defensive about anyway —
		// except the `!`-assertion lookups that we're patching in
		// GuildModel alongside this change.
		const promises = userIds.map(async (userId) => {
			try {
				const userResponse = await this.getUserPartialResponse(userId, requestCache);
				results.set(userId, userResponse);
			} catch {
				// swallow — caller handles the missing entry
			}
		});

		await Promise.all(promises);
		return results;
	}
}
