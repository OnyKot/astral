import type {UserID} from '~/BrandedTypes';
import {deleteOneOrMany, fetchOne, upsertOne} from '~/database/Cassandra';
import type {RiotConnectionByPuuidRow, RiotConnectionRow} from '~/database/CassandraTypes';
import {RiotConnections, RiotConnectionsByPuuid} from '~/Tables';

const FETCH_BY_USER = RiotConnections.selectCql({where: RiotConnections.where.eq('user_id'), limit: 1});
const FETCH_BY_PUUID = RiotConnectionsByPuuid.selectCql({where: RiotConnectionsByPuuid.where.eq('puuid'), limit: 1});

export class RiotRepository {
	async getConnection(userId: UserID): Promise<RiotConnectionRow | null> {
		return fetchOne<RiotConnectionRow>(FETCH_BY_USER, {user_id: userId});
	}

	async getConnectionByPuuid(puuid: string): Promise<RiotConnectionRow | null> {
		const lookup = await fetchOne<RiotConnectionByPuuidRow>(FETCH_BY_PUUID, {puuid});
		if (!lookup) return null;
		return this.getConnection(lookup.user_id);
	}

	async upsertConnection(row: RiotConnectionRow, previousPuuid?: string | null): Promise<void> {
		if (previousPuuid && previousPuuid !== row.puuid) {
			await deleteOneOrMany(RiotConnectionsByPuuid.deleteByPk({puuid: previousPuuid}));
		}
		await upsertOne(RiotConnections.upsertAll(row));
		await upsertOne(RiotConnectionsByPuuid.upsertAll({puuid: row.puuid, user_id: row.user_id}));
	}

	async deleteConnection(userId: UserID): Promise<void> {
		const existing = await this.getConnection(userId);
		await deleteOneOrMany(RiotConnections.deleteByPk({user_id: userId}));
		if (existing) {
			await deleteOneOrMany(RiotConnectionsByPuuid.deleteByPk({puuid: existing.puuid}));
		}
	}
}
