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

import {createMiddleware} from 'hono/factory';
import type {HonoEnv} from '~/App';
import type {Channel, Guild} from '~/Models';
import type {UserPartialResponse} from '~/user/UserModel';

/**
 * Soft upper bound for the per-request user cache. A single request
 * normally touches tens to hundreds of users; large admin endpoints
 * (ban list, bulk member fetch) can climb into the thousands. Past
 * 5000 we start evicting the oldest entries — by that point the cache
 * is paying for itself in coalescing, not in memory pressure, and
 * uncapped growth has been seen to drag a single request's resident
 * size into the megabytes on big guilds.
 */
const USER_PARTIALS_MAX = 5000;

/**
 * Per-request channel/guild caches. A single request frequently touches
 * the same channel or guild many times — message history endpoints fan
 * out into auth checks + message mapping + guild features resolution,
 * each of which independently calls channelRepository.findUnique /
 * guildRepository.findUnique. Without dedup, a 50-message page can
 * produce 100+ identical Cassandra reads. These caps are generous
 * relative to realistic per-request cardinality.
 */
const CHANNELS_MAX = 500;
const GUILDS_MAX = 200;

class BoundedLruMap<K, V> extends Map<K, V> {
	constructor(private readonly maxSize: number) {
		super();
	}
	override set(key: K, value: V): this {
		if (this.size >= this.maxSize && !this.has(key)) {
			const oldestKey = this.keys().next().value;
			if (oldestKey !== undefined) this.delete(oldestKey);
		}
		return super.set(key, value);
	}
}

class BoundedUserPartialsMap extends Map<bigint, UserPartialResponse> {
	override set(key: bigint, value: UserPartialResponse): this {
		if (this.size >= USER_PARTIALS_MAX && !this.has(key)) {
			// Drop the oldest entry. Map preserves insertion order in JS.
			const oldestKey = this.keys().next().value;
			if (oldestKey !== undefined) this.delete(oldestKey);
		}
		return super.set(key, value);
	}
}

export interface RequestCache {
	userPartials: Map<bigint, UserPartialResponse>;
	channels: Map<bigint, Channel | null>;
	guilds: Map<bigint, Guild | null>;
	clear(): void;
}

class RequestCacheImpl implements RequestCache {
	userPartials = new BoundedUserPartialsMap();
	channels = new BoundedLruMap<bigint, Channel | null>(CHANNELS_MAX);
	guilds = new BoundedLruMap<bigint, Guild | null>(GUILDS_MAX);

	clear(): void {
		this.userPartials.clear();
		this.channels.clear();
		this.guilds.clear();
	}
}

export const RequestCacheMiddleware = createMiddleware<HonoEnv>(async (ctx, next) => {
	const requestCache: RequestCache = new RequestCacheImpl();
	ctx.set('requestCache', requestCache);
	try {
		await next();
	} finally {
		requestCache.clear();
	}
});

export function createRequestCache(): RequestCache {
	return new RequestCacheImpl();
}
