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

import {createStringType, z} from '~/Schema';
import type {
	TwitchConnectionRow,
	TwitchCreatorProgramByStatusRow,
	TwitchCreatorProgramRow,
	TwitchEventSubSubscriptionRow,
	TwitchLiveStateRow,
	TwitchSubscriberPerkGrantRow,
} from '~/database/CassandraTypes';

export type TwitchOAuthIntent = 'viewer' | 'creator';
export type TwitchSubscriptionTier = '1000' | '2000' | '3000';
export type TwitchCreatorRewardKind = 'badge' | 'role' | 'early_access' | 'cosmetic' | 'custom';

export interface TwitchStreamSettings {
	streamModeEnabled: boolean;
	autoDetectLive: boolean;
	autoAnnounceLive: boolean;
	hideSensitiveOverlay: boolean;
	showTwitchPresence: boolean;
	mirrorScreenShare: boolean;
}

export interface TwitchCreatorProgramSettings {
	enabled: boolean;
	subscriberPerksEnabled: boolean;
	minimumTier: TwitchSubscriptionTier;
	allowGiftedSubscriptions: boolean;
	autoVerifySubscribers: boolean;
	eventSubEnabled: boolean;
	rewardKind: TwitchCreatorRewardKind;
	rewardName: string;
	rewardDescription: string;
	communityName: string;
	announcementChannelId: string;
	eventSubSubscriptions: Array<TwitchEventSubSubscriptionResponse>;
	eventSubLastSyncedAt: number;
	eventSubLastError: string;
	updatedAt: number;
}

export interface TwitchConnectionResponse {
	providerUserId: string;
	login: string;
	displayName: string;
	profileImageUrl: string;
	scopes: Array<string>;
	expiresAt: number;
	connectedAt: number;
	updatedAt: number;
	settings: TwitchStreamSettings;
	creatorProgram?: TwitchCreatorProgramSettings;
}

export interface TwitchCreatorProgramResponse {
	userId: string;
	providerUserId: string;
	login: string;
	displayName: string;
	profileImageUrl: string;
	program: TwitchCreatorProgramSettings;
}

export interface TwitchEventSubSubscriptionResponse {
	id: string;
	type: string;
	version: string;
	status: string;
	condition?: {
		broadcaster_user_id?: string;
	};
	createdAt: number;
	updatedAt: number;
	error?: string;
}

export interface TwitchLiveStateResponse {
	creatorUserId: string;
	twitchUserId: string;
	login: string;
	displayName: string;
	isLive: boolean;
	streamId: string;
	streamType: string;
	startedAt: number;
	endedAt: number;
	updatedAt: number;
}

export interface TwitchSubscriberPerkGrantResponse {
	id: string;
	creatorUserId: string;
	creatorTwitchUserId: string;
	creatorLogin: string;
	creatorDisplayName: string;
	viewerUserId: string;
	viewerTwitchUserId: string;
	viewerLogin: string;
	viewerDisplayName: string;
	active: boolean;
	tier: TwitchSubscriptionTier;
	isGift: boolean;
	rewardKind: TwitchCreatorRewardKind;
	rewardName: string;
	rewardDescription: string;
	source: string;
	createdAt: number;
	grantedAt: number;
	revokedAt: number;
	updatedAt: number;
	lastEventAt: number;
}

export const DEFAULT_TWITCH_STREAM_SETTINGS: TwitchStreamSettings = {
	streamModeEnabled: false,
	autoDetectLive: true,
	autoAnnounceLive: false,
	hideSensitiveOverlay: true,
	showTwitchPresence: true,
	mirrorScreenShare: false,
};

export const DEFAULT_TWITCH_CREATOR_PROGRAM: TwitchCreatorProgramSettings = {
	enabled: false,
	subscriberPerksEnabled: false,
	minimumTier: '1000',
	allowGiftedSubscriptions: true,
	autoVerifySubscribers: true,
	eventSubEnabled: false,
	rewardKind: 'badge',
	rewardName: 'Astral Creator Badge',
	rewardDescription: 'A non-transferable Astral perk for Twitch channel subscribers.',
	communityName: '',
	announcementChannelId: '',
	eventSubSubscriptions: [],
	eventSubLastSyncedAt: 0,
	eventSubLastError: '',
	updatedAt: 0,
};

export const TwitchOAuthStartRequest = z.object({
	intent: z.enum(['viewer', 'creator']).optional(),
	mode: z.enum(['viewer', 'creator']).optional(),
	redirect_to: createStringType(1, 2048).optional(),
});

export const TwitchSettingsPatchRequest = z.object({
	settings: z
		.object({
			streamModeEnabled: z.boolean().optional(),
			autoDetectLive: z.boolean().optional(),
			autoAnnounceLive: z.boolean().optional(),
			hideSensitiveOverlay: z.boolean().optional(),
			showTwitchPresence: z.boolean().optional(),
			mirrorScreenShare: z.boolean().optional(),
		})
		.optional()
		.default({}),
});

export const TwitchCreatorProgramSettingsRequest = z.object({
	enabled: z.boolean().optional(),
	subscriberPerksEnabled: z.boolean().optional(),
	minimumTier: z.enum(['1000', '2000', '3000']).optional(),
	allowGiftedSubscriptions: z.boolean().optional(),
	autoVerifySubscribers: z.boolean().optional(),
	eventSubEnabled: z.boolean().optional(),
	rewardKind: z.enum(['badge', 'role', 'early_access', 'cosmetic', 'custom']).optional(),
	rewardName: createStringType(1, 80).optional(),
	rewardDescription: createStringType(0, 240).optional(),
	communityName: createStringType(0, 80).optional(),
	announcementChannelId: createStringType(0, 64).optional(),
});

export const TwitchCreatorProgramPatchRequest = z.object({
	program: TwitchCreatorProgramSettingsRequest,
});

export const TwitchSubscriberPerkCheckRequest = z.object({
	creatorLogin: createStringType(1, 80),
});

function safeParseJsonObject(value: string | null | undefined): Record<string, unknown> {
	if (!value) return {};
	try {
		const parsed = JSON.parse(value) as unknown;
		return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
	} catch {
		return {};
	}
}

function toTimestamp(value: Date | null | undefined): number {
	return value ? value.getTime() : 0;
}

export function normalizeTwitchStreamSettings(value: unknown): TwitchStreamSettings {
	const input = value && typeof value === 'object' ? (value as Partial<TwitchStreamSettings>) : {};
	return {
		...DEFAULT_TWITCH_STREAM_SETTINGS,
		...input,
	};
}

export function normalizeTwitchCreatorProgram(
	value: unknown,
	options: {
		enabled?: boolean;
		subscriberPerksEnabled?: boolean;
		eventSubSubscriptions?: Array<TwitchEventSubSubscriptionResponse>;
		updatedAt?: number;
	} = {},
): TwitchCreatorProgramSettings {
	const input = value && typeof value === 'object' ? (value as Partial<TwitchCreatorProgramSettings>) : {};
	const eventSubSubscriptions = options.eventSubSubscriptions ?? input.eventSubSubscriptions ?? [];
	return {
		...DEFAULT_TWITCH_CREATOR_PROGRAM,
		...input,
		enabled: options.enabled ?? input.enabled ?? DEFAULT_TWITCH_CREATOR_PROGRAM.enabled,
		subscriberPerksEnabled:
			options.subscriberPerksEnabled ??
			input.subscriberPerksEnabled ??
			DEFAULT_TWITCH_CREATOR_PROGRAM.subscriberPerksEnabled,
		eventSubEnabled:
			input.eventSubEnabled ??
			eventSubSubscriptions.some((subscription) => ['enabled', 'webhook_callback_verification_pending'].includes(subscription.status)),
		eventSubSubscriptions,
		updatedAt: options.updatedAt ?? input.updatedAt ?? DEFAULT_TWITCH_CREATOR_PROGRAM.updatedAt,
	};
}

export function mapEventSubSubscriptionToResponse(
	row: TwitchEventSubSubscriptionRow,
	error?: string,
): TwitchEventSubSubscriptionResponse {
	const condition = safeParseJsonObject(row.condition_json);
	return {
		id: row.subscription_id ?? '',
		type: row.event_type,
		version: row.version,
		status: row.status,
		condition: Object.keys(condition).length > 0 ? (condition as TwitchEventSubSubscriptionResponse['condition']) : undefined,
		createdAt: toTimestamp(row.last_synced_at),
		updatedAt: toTimestamp(row.last_synced_at),
		error,
	};
}

export function mapCreatorProgramSettingsToResponse(
	row: TwitchCreatorProgramRow | null,
	subscriptions: Array<TwitchEventSubSubscriptionRow> = [],
): TwitchCreatorProgramSettings {
	const subscriptionResponses = subscriptions.map((subscription) => mapEventSubSubscriptionToResponse(subscription));
	const lastSyncedAt = Math.max(0, ...subscriptions.map((subscription) => toTimestamp(subscription.last_synced_at)));
	return {
		...normalizeTwitchCreatorProgram(safeParseJsonObject(row?.program_json), {
			enabled: row?.enabled,
			subscriberPerksEnabled: row?.subscriber_perks_enabled,
			eventSubSubscriptions: subscriptionResponses,
			updatedAt: toTimestamp(row?.updated_at),
		}),
		eventSubLastSyncedAt: lastSyncedAt,
	};
}

export function mapConnectionToResponse(
	row: TwitchConnectionRow,
	creatorProgram?: TwitchCreatorProgramSettings,
): TwitchConnectionResponse {
	return {
		providerUserId: row.twitch_user_id,
		login: row.login,
		displayName: row.display_name,
		profileImageUrl: row.profile_image_url ?? '',
		scopes: [...(row.scopes ?? new Set<string>())],
		expiresAt: toTimestamp(row.token_expires_at),
		connectedAt: toTimestamp(row.connected_at),
		updatedAt: toTimestamp(row.updated_at),
		settings: normalizeTwitchStreamSettings(safeParseJsonObject(row.settings_json)),
		creatorProgram,
	};
}

export function mapCreatorProgramToResponse(
	row: TwitchCreatorProgramRow,
	connection: TwitchConnectionRow | null,
	subscriptions: Array<TwitchEventSubSubscriptionRow> = [],
): TwitchCreatorProgramResponse {
	return {
		userId: row.user_id.toString(),
		providerUserId: row.twitch_user_id,
		login: row.broadcaster_login,
		displayName: row.broadcaster_display_name,
		profileImageUrl: connection?.profile_image_url ?? '',
		program: mapCreatorProgramSettingsToResponse(row, subscriptions),
	};
}

export function mapCreatorProgramListingToResponse(row: TwitchCreatorProgramByStatusRow): TwitchCreatorProgramResponse {
	return {
		userId: row.user_id.toString(),
		providerUserId: row.twitch_user_id,
		login: row.broadcaster_login,
		displayName: row.broadcaster_display_name,
		profileImageUrl: row.profile_image_url ?? '',
		program: normalizeTwitchCreatorProgram(safeParseJsonObject(row.program_json), {
			enabled: row.status === 'enabled',
			subscriberPerksEnabled: row.subscriber_perks_enabled,
			updatedAt: toTimestamp(row.updated_at),
		}),
	};
}

export function mapLiveStateToResponse(row: TwitchLiveStateRow | null): TwitchLiveStateResponse | null {
	if (!row) return null;
	return {
		creatorUserId: row.creator_user_id.toString(),
		twitchUserId: row.broadcaster_user_id,
		login: row.login,
		displayName: row.display_name,
		isLive: row.is_live,
		streamId: row.stream_id ?? '',
		streamType: row.stream_type ?? '',
		startedAt: toTimestamp(row.started_at),
		endedAt: toTimestamp(row.ended_at),
		updatedAt: toTimestamp(row.updated_at),
	};
}

export function normalizeTwitchSubscriptionTier(value: string): TwitchSubscriptionTier {
	if (value === '3000' || value === '2000') return value;
	return '1000';
}

export function normalizeTwitchRewardKind(value: string): TwitchCreatorRewardKind {
	if (value === 'role' || value === 'early_access' || value === 'cosmetic' || value === 'custom') return value;
	return 'badge';
}

export function mapSubscriberPerkGrantToResponse(row: TwitchSubscriberPerkGrantRow): TwitchSubscriberPerkGrantResponse {
	return {
		id: row.id,
		creatorUserId: row.creator_user_id.toString(),
		creatorTwitchUserId: row.creator_twitch_user_id,
		creatorLogin: row.creator_login,
		creatorDisplayName: row.creator_display_name,
		viewerUserId: row.viewer_user_id.toString(),
		viewerTwitchUserId: row.viewer_twitch_user_id,
		viewerLogin: row.viewer_login,
		viewerDisplayName: row.viewer_display_name,
		active: row.active,
		tier: normalizeTwitchSubscriptionTier(row.tier),
		isGift: row.is_gift,
		rewardKind: normalizeTwitchRewardKind(row.reward_kind),
		rewardName: row.reward_name,
		rewardDescription: row.reward_description,
		source: row.source,
		createdAt: toTimestamp(row.created_at),
		grantedAt: toTimestamp(row.granted_at),
		revokedAt: toTimestamp(row.revoked_at),
		updatedAt: toTimestamp(row.updated_at),
		lastEventAt: toTimestamp(row.last_event_at),
	};
}

export function serializeJsonObject(value: unknown): string {
	return JSON.stringify(value && typeof value === 'object' ? value : {});
}
