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
import {BatchBuilder, deleteOneOrMany, executeConditional, fetchMany, fetchOne, upsertOne} from '~/database/Cassandra';
import type {
	TwitchChannelEventRow,
	TwitchConnectionByTwitchUserIdRow,
	TwitchConnectionRow,
	TwitchCreatorProgramByStatusRow,
	TwitchCreatorProgramRow,
	TwitchEventSeenRow,
	TwitchEventSubSubscriptionRow,
	TwitchLiveStateRow,
	TwitchSubscriberPerkGrantByViewerRow,
	TwitchSubscriberPerkGrantRow,
} from '~/database/CassandraTypes';
import {
	TwitchChannelEvents,
	TwitchConnections,
	TwitchConnectionsByTwitchUserId,
	TwitchCreatorProgramsByStatus,
	TwitchCreatorPrograms,
	TwitchEventsSeen,
	TwitchEventSubSubscriptions,
	TwitchLiveStates,
	TwitchSubscriberPerkGrants,
	TwitchSubscriberPerkGrantsByViewer,
} from '~/Tables';

const FETCH_CONNECTION_BY_USER_QUERY = TwitchConnections.selectCql({
	where: TwitchConnections.where.eq('user_id'),
	limit: 1,
});

const FETCH_CONNECTION_LOOKUP_BY_TWITCH_ID_QUERY = TwitchConnectionsByTwitchUserId.selectCql({
	where: TwitchConnectionsByTwitchUserId.where.eq('twitch_user_id'),
	limit: 1,
});

const FETCH_CREATOR_PROGRAM_BY_USER_QUERY = TwitchCreatorPrograms.selectCql({
	where: TwitchCreatorPrograms.where.eq('user_id'),
	limit: 1,
});

const FETCH_ENABLED_CREATOR_PROGRAMS_QUERY = TwitchCreatorProgramsByStatus.selectCql({
	where: TwitchCreatorProgramsByStatus.where.eq('status'),
	limit: 100,
});

const FETCH_EVENTSUB_BY_BROADCASTER_QUERY = TwitchEventSubSubscriptions.selectCql({
	where: TwitchEventSubSubscriptions.where.eq('broadcaster_user_id'),
});

const FETCH_LIVE_STATE_QUERY = TwitchLiveStates.selectCql({
	where: TwitchLiveStates.where.eq('broadcaster_user_id'),
	limit: 1,
});

const FETCH_GRANTS_BY_CREATOR_QUERY = TwitchSubscriberPerkGrants.selectCql({
	where: TwitchSubscriberPerkGrants.where.eq('creator_user_id'),
});

const FETCH_GRANTS_BY_VIEWER_QUERY = TwitchSubscriberPerkGrantsByViewer.selectCql({
	where: TwitchSubscriberPerkGrantsByViewer.where.eq('viewer_user_id'),
});

export class TwitchRepository {
	async getConnection(userId: UserID): Promise<TwitchConnectionRow | null> {
		return fetchOne<TwitchConnectionRow>(FETCH_CONNECTION_BY_USER_QUERY, {user_id: userId});
	}

	async getConnectionByTwitchUserId(twitchUserId: string): Promise<TwitchConnectionRow | null> {
		const lookup = await fetchOne<TwitchConnectionByTwitchUserIdRow>(FETCH_CONNECTION_LOOKUP_BY_TWITCH_ID_QUERY, {
			twitch_user_id: twitchUserId,
		});
		if (!lookup) return null;
		return this.getConnection(lookup.user_id);
	}

	async upsertConnection(row: TwitchConnectionRow, previousTwitchUserId?: string | null): Promise<void> {
		const batch = new BatchBuilder();
		if (previousTwitchUserId && previousTwitchUserId !== row.twitch_user_id) {
			batch.addPrepared(TwitchConnectionsByTwitchUserId.deleteByPk({twitch_user_id: previousTwitchUserId}));
		}
		batch.addPrepared(TwitchConnections.upsertAll(row));
		batch.addPrepared(
			TwitchConnectionsByTwitchUserId.upsertAll({
				twitch_user_id: row.twitch_user_id,
				user_id: row.user_id,
			}),
		);
		await batch.execute();
	}

	async deleteConnection(userId: UserID): Promise<void> {
		const connection = await this.getConnection(userId);
		const creatorProgram = await this.getCreatorProgram(userId);
		const batch = new BatchBuilder()
			.addPrepared(TwitchConnections.deleteByPk({user_id: userId}))
			.addPrepared(TwitchCreatorPrograms.deleteByPk({user_id: userId}));
		if (creatorProgram?.enabled) {
			batch.addPrepared(
				TwitchCreatorProgramsByStatus.deleteByPk({
					status: 'enabled',
					updated_at: creatorProgram.updated_at,
					user_id: creatorProgram.user_id,
				}),
			);
		}
		if (connection) {
			batch.addPrepared(TwitchConnectionsByTwitchUserId.deleteByPk({twitch_user_id: connection.twitch_user_id}));
			batch.addPrepared(TwitchEventSubSubscriptions.deletePartition({broadcaster_user_id: connection.twitch_user_id}));
			batch.addPrepared(TwitchLiveStates.deleteByPk({broadcaster_user_id: connection.twitch_user_id}));
			batch.addPrepared(TwitchSubscriberPerkGrants.deletePartition({creator_user_id: userId}));
			batch.addPrepared(TwitchSubscriberPerkGrantsByViewer.deletePartition({viewer_user_id: userId}));
		}
		await batch.execute();
	}

	async getCreatorProgram(userId: UserID): Promise<TwitchCreatorProgramRow | null> {
		return fetchOne<TwitchCreatorProgramRow>(FETCH_CREATOR_PROGRAM_BY_USER_QUERY, {user_id: userId});
	}

	async getCreatorProgramByTwitchUserId(twitchUserId: string): Promise<TwitchCreatorProgramRow | null> {
		const connection = await this.getConnectionByTwitchUserId(twitchUserId);
		if (!connection) return null;
		return this.getCreatorProgram(connection.user_id);
	}

	async upsertCreatorProgram(row: TwitchCreatorProgramRow): Promise<void> {
		await upsertOne(TwitchCreatorPrograms.upsertAll(row));
	}

	async syncCreatorProgramListing(
		row: TwitchCreatorProgramRow,
		connection: TwitchConnectionRow,
		previous?: TwitchCreatorProgramRow | null,
	): Promise<void> {
		const batch = new BatchBuilder();
		if (previous?.enabled) {
			batch.addPrepared(
				TwitchCreatorProgramsByStatus.deleteByPk({
					status: 'enabled',
					updated_at: previous.updated_at,
					user_id: previous.user_id,
				}),
			);
		}
		if (row.enabled) {
			batch.addPrepared(
				TwitchCreatorProgramsByStatus.upsertAll({
					status: 'enabled',
					updated_at: row.updated_at,
					user_id: row.user_id,
					twitch_user_id: row.twitch_user_id,
					broadcaster_login: row.broadcaster_login,
					broadcaster_display_name: row.broadcaster_display_name,
					profile_image_url: connection.profile_image_url,
					subscriber_perks_enabled: row.subscriber_perks_enabled,
					program_json: row.program_json,
				}),
			);
		}
		await batch.execute();
	}

	async listEnabledCreatorPrograms(): Promise<Array<TwitchCreatorProgramByStatusRow>> {
		return fetchMany<TwitchCreatorProgramByStatusRow>(FETCH_ENABLED_CREATOR_PROGRAMS_QUERY, {
			status: 'enabled',
		});
	}

	async listEventSubSubscriptions(broadcasterUserId: string): Promise<Array<TwitchEventSubSubscriptionRow>> {
		return fetchMany<TwitchEventSubSubscriptionRow>(FETCH_EVENTSUB_BY_BROADCASTER_QUERY, {
			broadcaster_user_id: broadcasterUserId,
		});
	}

	async upsertEventSubSubscription(row: TwitchEventSubSubscriptionRow): Promise<void> {
		await upsertOne(TwitchEventSubSubscriptions.upsertAll(row));
	}

	async deleteEventSubSubscription(broadcasterUserId: string, eventType: string): Promise<void> {
		await deleteOneOrMany(
			TwitchEventSubSubscriptions.deleteByPk({
				broadcaster_user_id: broadcasterUserId,
				event_type: eventType,
			}),
		);
	}

	async markEventSeen(row: TwitchEventSeenRow): Promise<boolean> {
		const result = await executeConditional(TwitchEventsSeen.insertIfNotExists(row));
		return result.applied;
	}

	async insertChannelEvent(row: TwitchChannelEventRow): Promise<void> {
		await upsertOne(TwitchChannelEvents.insert(row));
	}

	async getLiveState(broadcasterUserId: string): Promise<TwitchLiveStateRow | null> {
		return fetchOne<TwitchLiveStateRow>(FETCH_LIVE_STATE_QUERY, {broadcaster_user_id: broadcasterUserId});
	}

	async upsertLiveState(row: TwitchLiveStateRow): Promise<void> {
		await upsertOne(TwitchLiveStates.upsertAll(row));
	}

	async upsertSubscriberPerkGrant(row: TwitchSubscriberPerkGrantRow): Promise<void> {
		const batch = new BatchBuilder()
			.addPrepared(TwitchSubscriberPerkGrants.upsertAll(row))
			.addPrepared(TwitchSubscriberPerkGrantsByViewer.upsertAll(row));
		await batch.execute();
	}

	async listSubscriberPerkGrantsForCreator(creatorUserId: UserID): Promise<Array<TwitchSubscriberPerkGrantRow>> {
		return fetchMany<TwitchSubscriberPerkGrantRow>(FETCH_GRANTS_BY_CREATOR_QUERY, {
			creator_user_id: creatorUserId,
		});
	}

	async listSubscriberPerkGrantsForViewer(viewerUserId: UserID): Promise<Array<TwitchSubscriberPerkGrantByViewerRow>> {
		return fetchMany<TwitchSubscriberPerkGrantByViewerRow>(FETCH_GRANTS_BY_VIEWER_QUERY, {
			viewer_user_id: viewerUserId,
		});
	}
}
