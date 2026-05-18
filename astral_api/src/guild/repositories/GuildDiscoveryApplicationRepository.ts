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
import {Db, deleteOneOrMany, fetchMany, fetchOne, upsertOne} from '~/database/Cassandra';
import type {
	GuildDiscoveryApplicationRow,
	GuildDiscoveryApplicationStatus,
} from '~/database/types/GuildTypes';
import {GuildDiscoveryApplications} from '~/Tables';

const FETCH_BY_GUILD_ID_QUERY = GuildDiscoveryApplications.selectCql({
	where: GuildDiscoveryApplications.where.eq('guild_id'),
	limit: 1,
});

const FETCH_BY_STATUS_QUERY = GuildDiscoveryApplications.selectCql({
	where: GuildDiscoveryApplications.where.eq('status'),
});

const FETCH_ALL_QUERY = GuildDiscoveryApplications.selectCql({});

export class GuildDiscoveryApplicationRepository {
	async findByGuildId(guildId: GuildID): Promise<GuildDiscoveryApplicationRow | null> {
		return await fetchOne<GuildDiscoveryApplicationRow>(FETCH_BY_GUILD_ID_QUERY, {
			guild_id: guildId,
		});
	}

	async upsert(row: GuildDiscoveryApplicationRow): Promise<GuildDiscoveryApplicationRow> {
		await upsertOne(GuildDiscoveryApplications.insert(row));
		return row;
	}

	async listByStatus(status: GuildDiscoveryApplicationStatus): Promise<Array<GuildDiscoveryApplicationRow>> {
		return await fetchMany<GuildDiscoveryApplicationRow>(FETCH_BY_STATUS_QUERY, {status});
	}

	async listAll(): Promise<Array<GuildDiscoveryApplicationRow>> {
		return await fetchMany<GuildDiscoveryApplicationRow>(FETCH_ALL_QUERY, {});
	}

	async setStatus(params: {
		guildId: GuildID;
		status: GuildDiscoveryApplicationStatus;
		reviewerId: UserID | null;
		reviewedAt: Date | null;
		reviewNote: string | null;
	}): Promise<void> {
		const {guildId, status, reviewerId, reviewedAt, reviewNote} = params;
		await upsertOne(
			GuildDiscoveryApplications.patchByPk(
				{guild_id: guildId},
				{
					status: Db.set(status),
					reviewed_by: reviewerId === null ? Db.clear() : Db.set(reviewerId),
					reviewed_at: reviewedAt === null ? Db.clear() : Db.set(reviewedAt),
					review_note: reviewNote === null ? Db.clear() : Db.set(reviewNote),
				},
			),
		);
	}

	async delete(guildId: GuildID): Promise<void> {
		await deleteOneOrMany(GuildDiscoveryApplications.deleteByPk({guild_id: guildId}));
	}
}
