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
import {deleteOneOrMany, fetchMany, fetchOne, upsertOne} from '~/database/Cassandra';
import type {SteamConnectionBySteamIdRow, SteamConnectionRow} from '~/database/CassandraTypes';
import {SteamConnections, SteamConnectionsBySteamId} from '~/Tables';

const FETCH_BY_USER_QUERY = SteamConnections.selectCql({
	where: SteamConnections.where.eq('user_id'),
	limit: 1,
});

const FETCH_ALL_QUERY = SteamConnections.selectCql();

const FETCH_LOOKUP_BY_STEAM_ID_QUERY = SteamConnectionsBySteamId.selectCql({
	where: SteamConnectionsBySteamId.where.eq('steam_id'),
	limit: 1,
});

export class SteamRepository {
	async getConnection(userId: UserID): Promise<SteamConnectionRow | null> {
		return fetchOne<SteamConnectionRow>(FETCH_BY_USER_QUERY, {user_id: userId});
	}

	async getConnectionBySteamId(steamId: string): Promise<SteamConnectionRow | null> {
		const lookup = await fetchOne<SteamConnectionBySteamIdRow>(FETCH_LOOKUP_BY_STEAM_ID_QUERY, {
			steam_id: steamId,
		});
		if (!lookup) return null;
		return this.getConnection(lookup.user_id);
	}

	/**
	 * Sequential single-row writes — see TelegramRepository for the same
	 * reasoning. BATCH on Scylla was returning sporadic 'no replicas
	 * responded' for our 1-to-1 connection tables under modest load.
	 */
	async upsertConnection(row: SteamConnectionRow, previousSteamId?: string | null): Promise<void> {
		if (previousSteamId && previousSteamId !== row.steam_id) {
			await deleteOneOrMany(SteamConnectionsBySteamId.deleteByPk({steam_id: previousSteamId}));
		}
		await upsertOne(SteamConnections.upsertAll(row));
		await upsertOne(
			SteamConnectionsBySteamId.upsertAll({
				steam_id: row.steam_id,
				user_id: row.user_id,
			}),
		);
	}

	async deleteConnection(userId: UserID): Promise<void> {
		const existing = await this.getConnection(userId);
		await deleteOneOrMany(SteamConnections.deleteByPk({user_id: userId}));
		if (existing) {
			await deleteOneOrMany(SteamConnectionsBySteamId.deleteByPk({steam_id: existing.steam_id}));
		}
	}

	async listAllConnections(): Promise<Array<SteamConnectionRow>> {
		return fetchMany<SteamConnectionRow>(FETCH_ALL_QUERY, {});
	}
}
