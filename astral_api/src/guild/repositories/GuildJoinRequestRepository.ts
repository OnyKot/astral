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

import type {GuildID, UserID} from '~/BrandedTypes';
import {Db, fetchMany, fetchOne, upsertOne} from '~/database/Cassandra';
import type {GuildJoinRequestRow, GuildJoinRequestStatus} from '~/database/types/GuildTypes';
import {GuildJoinRequests} from '~/Tables';

const FETCH_BY_GUILD_USER_QUERY = GuildJoinRequests.selectCql({
	where: [GuildJoinRequests.where.eq('guild_id'), GuildJoinRequests.where.eq('user_id')],
	limit: 1,
});

const FETCH_BY_GUILD_QUERY = GuildJoinRequests.selectCql({
	where: GuildJoinRequests.where.eq('guild_id'),
});

export class GuildJoinRequestRepository {
	async findByGuildAndUser(guildId: GuildID, userId: UserID): Promise<GuildJoinRequestRow | null> {
		return await fetchOne<GuildJoinRequestRow>(FETCH_BY_GUILD_USER_QUERY, {
			guild_id: guildId,
			user_id: userId,
		});
	}

	async upsert(row: GuildJoinRequestRow): Promise<GuildJoinRequestRow> {
		await upsertOne(GuildJoinRequests.insert(row));
		return row;
	}

	async listByGuild(guildId: GuildID, status?: GuildJoinRequestStatus): Promise<Array<GuildJoinRequestRow>> {
		const rows = await fetchMany<GuildJoinRequestRow>(FETCH_BY_GUILD_QUERY, {guild_id: guildId});
		const filtered = status ? rows.filter((row) => row.status === status) : rows;
		filtered.sort((a, b) => b.requested_at.getTime() - a.requested_at.getTime());
		return filtered;
	}

	async setStatus(params: {
		guildId: GuildID;
		userId: UserID;
		status: GuildJoinRequestStatus;
		reviewerId: UserID | null;
		reviewedAt: Date | null;
		reviewNote: string | null;
	}): Promise<void> {
		const {guildId, userId, status, reviewerId, reviewedAt, reviewNote} = params;
		await upsertOne(
			GuildJoinRequests.patchByPk(
				{guild_id: guildId, user_id: userId},
				{
					status: Db.set(status),
					reviewed_by: reviewerId === null ? Db.clear() : Db.set(reviewerId),
					reviewed_at: reviewedAt === null ? Db.clear() : Db.set(reviewedAt),
					review_note: reviewNote === null ? Db.clear() : Db.set(reviewNote),
				},
			),
		);
	}
}
