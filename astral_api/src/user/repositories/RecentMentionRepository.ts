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

import {createMessageID, type MessageID, type UserID} from '~/BrandedTypes';
import {BatchBuilder, fetchMany, fetchOne, prepared} from '~/database/Cassandra';
import type {RecentMentionRow} from '~/database/CassandraTypes';
import {RecentMention} from '~/Models';
import {RecentMentions, RecentMentionsByGuild} from '~/Tables';
import * as SnowflakeUtils from '~/utils/SnowflakeUtils';

const FETCH_RECENT_MENTION_CQL = RecentMentions.selectCql({
	where: [RecentMentions.where.eq('user_id'), RecentMentions.where.eq('message_id')],
	limit: 1,
});

const createFetchRecentMentionsQuery = (limit: number) =>
	RecentMentions.selectCql({
		where: [RecentMentions.where.eq('user_id'), RecentMentions.where.lt('message_id', 'before_message_id')],
		limit,
	});

/*
 * An @everyone mention resolves to the whole guild membership, so createRecentMentions can be
 * handed thousands of rows. It used to build ONE cross-partition LOGGED batch of 2xN statements:
 * `recent_mentions` is keyed by ((user_id), message_id), so every statement lands in a different
 * partition and the coordinator has to persist the entire batch into the batchlog and replay it
 * before anything is acknowledged. That pins the shared Cassandra for every other request and blows
 * past batch-size thresholds outright.
 */
const MENTION_BATCH_SIZE = 25;
const MENTION_BATCH_CONCURRENCY = 8;

export class RecentMentionRepository {
	async getRecentMention(userId: UserID, messageId: MessageID): Promise<RecentMention | null> {
		const mention = await fetchOne<RecentMentionRow>(FETCH_RECENT_MENTION_CQL, {
			user_id: userId,
			message_id: messageId,
		});
		return mention ? new RecentMention(mention) : null;
	}

	async listRecentMentions(
		userId: UserID,
		includeEveryone: boolean = true,
		includeRole: boolean = true,
		includeGuilds: boolean = true,
		limit: number = 25,
		before?: MessageID,
	): Promise<Array<RecentMention>> {
		// Page until we collect `limit` matches. Filters stay in-app because
		// is_everyone/is_role/guild_id are not secondary-indexed; a single
		// over-fetch of limit*2 often underfills when filters are strict.
		const pageSize = Math.max(limit * 2, 50);
		const query = createFetchRecentMentionsQuery(pageSize);
		let cursor = before || createMessageID(SnowflakeUtils.getSnowflake());
		const filteredMentions: Array<RecentMentionRow> = [];
		const maxPages = 8;

		for (let page = 0; page < maxPages && filteredMentions.length < limit; page++) {
			const pageRows = await fetchMany<RecentMentionRow>(query, {
				user_id: userId,
				before_message_id: cursor,
			});
			if (pageRows.length === 0) {
				break;
			}

			for (const mention of pageRows) {
				if (!includeEveryone && mention.is_everyone) continue;
				if (!includeRole && mention.is_role) continue;
				if (!includeGuilds && mention.guild_id != null) continue;
				filteredMentions.push(mention);
				if (filteredMentions.length >= limit) {
					break;
				}
			}

			cursor = pageRows[pageRows.length - 1].message_id;
			if (pageRows.length < pageSize) {
				break;
			}
		}

		return filteredMentions.slice(0, limit).map((mention) => new RecentMention(mention));
	}

	async createRecentMention(mention: RecentMentionRow): Promise<RecentMention> {
		const batch = new BatchBuilder();
		batch.addPrepared(RecentMentions.upsertAll(mention));
		batch.addPrepared(
			RecentMentionsByGuild.insert({
				user_id: mention.user_id,
				guild_id: mention.guild_id,
				message_id: mention.message_id,
				channel_id: mention.channel_id,
				is_everyone: mention.is_everyone,
				is_role: mention.is_role,
			}),
		);
		await batch.execute();
		return new RecentMention(mention);
	}

	async createRecentMentions(mentions: Array<RecentMentionRow>): Promise<void> {
		if (mentions.length === 0) {
			return;
		}

		const chunks: Array<Array<RecentMentionRow>> = [];
		for (let index = 0; index < mentions.length; index += MENTION_BATCH_SIZE) {
			chunks.push(mentions.slice(index, index + MENTION_BATCH_SIZE));
		}

		let nextChunk = 0;
		const workers = Array.from({length: Math.min(MENTION_BATCH_CONCURRENCY, chunks.length)}, async () => {
			while (nextChunk < chunks.length) {
				const chunk = chunks[nextChunk++];
				const batch = new BatchBuilder();
				for (const mention of chunk) {
					batch.addPrepared(RecentMentions.upsertAll(mention));
					batch.addPrepared(
						RecentMentionsByGuild.insert({
							user_id: mention.user_id,
							guild_id: mention.guild_id,
							message_id: mention.message_id,
							channel_id: mention.channel_id,
							is_everyone: mention.is_everyone,
							is_role: mention.is_role,
						}),
					);
				}
				/*
				 * UNLOGGED: the batchlog bought no atomicity anyone relies on here. Both tables carry
				 * default_time_to_live = 604800 and `recent_mentions_by_guild` is only ever filtered
				 * in-app, so a partial write self-heals; the caller is the `handleMentions` worker
				 * task, whose retry re-issues the same idempotent upserts by primary key.
				 */
				await batch.execute(false);
			}
		});

		await Promise.all(workers);
	}

	async deleteRecentMention(mention: RecentMention): Promise<void> {
		const batch = new BatchBuilder();
		batch.addPrepared(RecentMentions.deleteByPk({user_id: mention.userId, message_id: mention.messageId}));
		batch.addPrepared(
			RecentMentionsByGuild.deleteByPk({
				user_id: mention.userId,
				guild_id: mention.guildId,
				message_id: mention.messageId,
			}),
		);
		await batch.execute();
	}

	async deleteAllRecentMentions(userId: UserID): Promise<void> {
		const pageSize = 100;
		const pageQuery = RecentMentions.selectCql({
			columns: ['guild_id', 'message_id'],
			where: [RecentMentions.where.eq('user_id'), RecentMentions.where.lt('message_id', 'before_message_id')],
			limit: pageSize,
		});
		let cursor = createMessageID(SnowflakeUtils.getSnowflake());

		for (;;) {
			const mentions = await fetchMany<{guild_id: bigint; message_id: MessageID}>(pageQuery, {
				user_id: userId,
				before_message_id: cursor,
			});
			if (mentions.length === 0) {
				break;
			}

			const batch = new BatchBuilder();
			for (const mention of mentions) {
				batch.addPrepared(
					RecentMentionsByGuild.deleteByPk({
						guild_id: mention.guild_id,
						user_id: userId,
						message_id: mention.message_id,
					}),
				);
				batch.addPrepared(
					RecentMentions.deleteByPk({
						user_id: userId,
						message_id: mention.message_id,
					}),
				);
			}
			await batch.execute();

			cursor = mentions[mentions.length - 1].message_id;
			if (mentions.length < pageSize) {
				break;
			}
		}

		// Final partition wipe for any races / leftovers.
		await new BatchBuilder()
			.addPrepared(
				prepared(RecentMentions.deleteCql({where: RecentMentions.where.eq('user_id')}), {user_id: userId}),
			)
			.execute();
	}
}
