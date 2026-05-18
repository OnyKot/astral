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

import type {GuildID} from '~/BrandedTypes';
import type {RequestCache} from '~/middleware/RequestCacheMiddleware';
import type {Guild} from '~/Models';

interface GuildFinder {
	findUnique(guildId: GuildID): Promise<Guild | null>;
}

/**
 * Per-request guild lookup with dedup. Parallel to getCachedChannel —
 * guild features/permissions/verification lookups converge from many
 * services onto guildRepository.findUnique; this collapses the repeat
 * reads within a single request to one Cassandra hit.
 */
export async function getCachedGuild(
	guildId: GuildID,
	finder: GuildFinder,
	requestCache: RequestCache,
): Promise<Guild | null> {
	const cached = requestCache.guilds.get(guildId);
	if (cached !== undefined) return cached;

	const guild = await finder.findUnique(guildId);
	requestCache.guilds.set(guildId, guild);
	return guild;
}

export function invalidateCachedGuild(guildId: GuildID, requestCache: RequestCache): void {
	requestCache.guilds.delete(guildId);
}
