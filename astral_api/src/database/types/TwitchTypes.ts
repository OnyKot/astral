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

type Nullish<T> = T | null;

export interface TwitchConnectionRow {
	user_id: UserID;
	twitch_user_id: string;
	login: string;
	display_name: string;
	profile_image_url: Nullish<string>;
	access_token: string;
	refresh_token: string;
	scopes: Set<string>;
	settings_json: Nullish<string>;
	token_expires_at: Nullish<Date>;
	connected_at: Date;
	updated_at: Date;
}

export interface TwitchConnectionByTwitchUserIdRow {
	twitch_user_id: string;
	user_id: UserID;
}

export interface TwitchCreatorProgramRow {
	user_id: UserID;
	twitch_user_id: string;
	broadcaster_login: string;
	broadcaster_display_name: string;
	enabled: boolean;
	subscriber_perks_enabled: boolean;
	channel_points_enabled: boolean;
	eventsub_status: string;
	program_json: Nullish<string>;
	updated_at: Date;
}

export interface TwitchCreatorProgramByStatusRow {
	status: string;
	updated_at: Date;
	user_id: UserID;
	twitch_user_id: string;
	broadcaster_login: string;
	broadcaster_display_name: string;
	profile_image_url: Nullish<string>;
	subscriber_perks_enabled: boolean;
	program_json: Nullish<string>;
}

export interface TwitchEventSubSubscriptionRow {
	broadcaster_user_id: string;
	event_type: string;
	subscription_id: Nullish<string>;
	status: string;
	version: string;
	condition_json: string;
	last_synced_at: Date;
}

export interface TwitchEventSeenRow {
	message_id: string;
	event_type: string;
	broadcaster_user_id: Nullish<string>;
	received_at: Date;
}

export interface TwitchChannelEventRow {
	broadcaster_user_id: string;
	event_timestamp: Date;
	message_id: string;
	event_type: string;
	payload_json: string;
}

export interface TwitchLiveStateRow {
	broadcaster_user_id: string;
	creator_user_id: UserID;
	login: string;
	display_name: string;
	is_live: boolean;
	stream_id: Nullish<string>;
	stream_type: Nullish<string>;
	started_at: Nullish<Date>;
	ended_at: Nullish<Date>;
	updated_at: Date;
}

export interface TwitchSubscriberPerkGrantRow {
	creator_user_id: UserID;
	viewer_user_id: UserID;
	id: string;
	creator_twitch_user_id: string;
	creator_login: string;
	creator_display_name: string;
	viewer_twitch_user_id: string;
	viewer_login: string;
	viewer_display_name: string;
	active: boolean;
	tier: string;
	is_gift: boolean;
	reward_kind: string;
	reward_name: string;
	reward_description: string;
	source: string;
	created_at: Date;
	granted_at: Date;
	revoked_at: Nullish<Date>;
	updated_at: Date;
	last_event_at: Date;
}

export interface TwitchSubscriberPerkGrantByViewerRow extends TwitchSubscriberPerkGrantRow {
	viewer_user_id: UserID;
	creator_user_id: UserID;
}

export const TWITCH_CONNECTION_COLUMNS = [
	'user_id',
	'twitch_user_id',
	'login',
	'display_name',
	'profile_image_url',
	'access_token',
	'refresh_token',
	'scopes',
	'settings_json',
	'token_expires_at',
	'connected_at',
	'updated_at',
] as const satisfies ReadonlyArray<keyof TwitchConnectionRow>;

export const TWITCH_CONNECTION_BY_TWITCH_USER_ID_COLUMNS = ['twitch_user_id', 'user_id'] as const satisfies ReadonlyArray<
	keyof TwitchConnectionByTwitchUserIdRow
>;

export const TWITCH_CREATOR_PROGRAM_COLUMNS = [
	'user_id',
	'twitch_user_id',
	'broadcaster_login',
	'broadcaster_display_name',
	'enabled',
	'subscriber_perks_enabled',
	'channel_points_enabled',
	'eventsub_status',
	'program_json',
	'updated_at',
] as const satisfies ReadonlyArray<keyof TwitchCreatorProgramRow>;

export const TWITCH_CREATOR_PROGRAM_BY_STATUS_COLUMNS = [
	'status',
	'updated_at',
	'user_id',
	'twitch_user_id',
	'broadcaster_login',
	'broadcaster_display_name',
	'profile_image_url',
	'subscriber_perks_enabled',
	'program_json',
] as const satisfies ReadonlyArray<keyof TwitchCreatorProgramByStatusRow>;

export const TWITCH_EVENTSUB_SUBSCRIPTION_COLUMNS = [
	'broadcaster_user_id',
	'event_type',
	'subscription_id',
	'status',
	'version',
	'condition_json',
	'last_synced_at',
] as const satisfies ReadonlyArray<keyof TwitchEventSubSubscriptionRow>;

export const TWITCH_EVENT_SEEN_COLUMNS = [
	'message_id',
	'event_type',
	'broadcaster_user_id',
	'received_at',
] as const satisfies ReadonlyArray<keyof TwitchEventSeenRow>;

export const TWITCH_CHANNEL_EVENT_COLUMNS = [
	'broadcaster_user_id',
	'event_timestamp',
	'message_id',
	'event_type',
	'payload_json',
] as const satisfies ReadonlyArray<keyof TwitchChannelEventRow>;

export const TWITCH_LIVE_STATE_COLUMNS = [
	'broadcaster_user_id',
	'creator_user_id',
	'login',
	'display_name',
	'is_live',
	'stream_id',
	'stream_type',
	'started_at',
	'ended_at',
	'updated_at',
] as const satisfies ReadonlyArray<keyof TwitchLiveStateRow>;

export const TWITCH_SUBSCRIBER_PERK_GRANT_COLUMNS = [
	'creator_user_id',
	'viewer_user_id',
	'id',
	'creator_twitch_user_id',
	'creator_login',
	'creator_display_name',
	'viewer_twitch_user_id',
	'viewer_login',
	'viewer_display_name',
	'active',
	'tier',
	'is_gift',
	'reward_kind',
	'reward_name',
	'reward_description',
	'source',
	'created_at',
	'granted_at',
	'revoked_at',
	'updated_at',
	'last_event_at',
] as const satisfies ReadonlyArray<keyof TwitchSubscriberPerkGrantRow>;

export const TWITCH_SUBSCRIBER_PERK_GRANT_BY_VIEWER_COLUMNS =
	TWITCH_SUBSCRIBER_PERK_GRANT_COLUMNS satisfies ReadonlyArray<keyof TwitchSubscriberPerkGrantByViewerRow>;
