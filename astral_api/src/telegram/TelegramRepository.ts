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
import {deleteOneOrMany, fetchOne, upsertOne} from '~/database/Cassandra';
import type {
	TelegramConnectionByTelegramUserIdRow,
	TelegramConnectionRow,
} from '~/database/CassandraTypes';
import {TelegramConnections, TelegramConnectionsByTelegramUserId} from '~/Tables';

const FETCH_BY_USER_QUERY = TelegramConnections.selectCql({
	where: TelegramConnections.where.eq('user_id'),
	limit: 1,
});

const FETCH_LOOKUP_BY_TG_ID_QUERY = TelegramConnectionsByTelegramUserId.selectCql({
	where: TelegramConnectionsByTelegramUserId.where.eq('telegram_user_id'),
	limit: 1,
});

export class TelegramRepository {
	async getConnection(userId: UserID): Promise<TelegramConnectionRow | null> {
		return fetchOne<TelegramConnectionRow>(FETCH_BY_USER_QUERY, {user_id: userId});
	}

	async getConnectionByTelegramUserId(telegramUserId: bigint): Promise<TelegramConnectionRow | null> {
		const lookup = await fetchOne<TelegramConnectionByTelegramUserIdRow>(FETCH_LOOKUP_BY_TG_ID_QUERY, {
			telegram_user_id: telegramUserId,
		});
		if (!lookup) return null;
		return this.getConnection(lookup.user_id);
	}

	/**
	 * Upsert without LOGGED BATCH — sequential single-row writes.
	 *
	 * Switched away from BatchBuilder because Scylla under modest load
	 * was returning sporadic
	 *   ResponseError: Server failure during write query at consistency
	 *   LOCAL_ONE (1 responses were required but only 0 replicas responded,
	 *   1 failed). writeType: BATCH
	 * which cancelled the entire callback_query handler in the bot.
	 *
	 * The two writes (main row + reverse-lookup row) are not atomic but on
	 * a 1-to-1 mapping the inconsistency window is < 1 RTT and self-heals
	 * on the next link/refresh.
	 */
	async upsertConnection(row: TelegramConnectionRow, previousTelegramUserId?: bigint | null): Promise<void> {
		if (previousTelegramUserId && previousTelegramUserId !== row.telegram_user_id) {
			await deleteOneOrMany(
				TelegramConnectionsByTelegramUserId.deleteByPk({telegram_user_id: previousTelegramUserId}),
			);
		}
		await upsertOne(TelegramConnections.upsertAll(row));
		await upsertOne(
			TelegramConnectionsByTelegramUserId.upsertAll({
				telegram_user_id: row.telegram_user_id,
				user_id: row.user_id,
			}),
		);
	}

	async deleteConnection(userId: UserID): Promise<void> {
		const existing = await this.getConnection(userId);
		await deleteOneOrMany(TelegramConnections.deleteByPk({user_id: userId}));
		if (existing) {
			await deleteOneOrMany(
				TelegramConnectionsByTelegramUserId.deleteByPk({telegram_user_id: existing.telegram_user_id}),
			);
		}
	}
}
