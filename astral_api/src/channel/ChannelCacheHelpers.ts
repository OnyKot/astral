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

import type {ChannelID} from '~/BrandedTypes';
import type {RequestCache} from '~/middleware/RequestCacheMiddleware';
import type {Channel} from '~/Models';

/**
 * Thin shape we accept — both the aggregate repository and the data
 * repository expose a compatible `findUnique(channelId)`; any object
 * with the right method works.
 */
interface ChannelFinder {
	findUnique(channelId: ChannelID): Promise<Channel | null>;
}

/**
 * Per-request channel lookup with dedup. A single API request often
 * resolves the same channel three or four times across different
 * service layers — auth check, message-mapping, broadcast. Funneling
 * all of those through this helper collapses them to one Cassandra
 * read for the duration of the request.
 *
 * Cache semantics match UserCacheHelpers: negative results (null)
 * are also cached, so a repeated lookup on a deleted channel doesn't
 * cost another roundtrip.
 */
export async function getCachedChannel(
	channelId: ChannelID,
	finder: ChannelFinder,
	requestCache: RequestCache,
): Promise<Channel | null> {
	const cached = requestCache.channels.get(channelId);
	if (cached !== undefined) return cached;

	const channel = await finder.findUnique(channelId);
	requestCache.channels.set(channelId, channel);
	return channel;
}

/**
 * Explicit invalidation after an in-request mutation (edit / delete)
 * so subsequent reads within the same request see the fresh state.
 */
export function invalidateCachedChannel(channelId: ChannelID, requestCache: RequestCache): void {
	requestCache.channels.delete(channelId);
}
