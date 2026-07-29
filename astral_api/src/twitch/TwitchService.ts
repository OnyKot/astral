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
import {createUserID} from '~/BrandedTypes';
import {Config} from '~/Config';
import type {ICacheService} from '~/infrastructure/ICacheService';
import {GatewayService} from '~/infrastructure/GatewayService';
import {Logger} from '~/Logger';
import type {
	TwitchConnectionRow,
	TwitchCreatorProgramRow,
	TwitchEventSubSubscriptionRow,
} from '~/database/CassandraTypes';
import {TwitchApiClient, type TwitchTokenResponse, type TwitchUser} from './TwitchApiClient';
import {
	DEFAULT_TWITCH_CREATOR_PROGRAM,
	DEFAULT_TWITCH_STREAM_SETTINGS,
	mapConnectionToResponse,
	mapCreatorProgramListingToResponse,
	mapCreatorProgramSettingsToResponse,
	mapCreatorProgramToResponse,
	mapEventSubSubscriptionToResponse,
	mapLiveStateToResponse,
	mapSubscriberPerkGrantToResponse,
	normalizeTwitchRewardKind,
	normalizeTwitchSubscriptionTier,
	normalizeTwitchCreatorProgram,
	normalizeTwitchStreamSettings,
	serializeJsonObject,
	type TwitchConnectionResponse,
	type TwitchCreatorProgramResponse,
	type TwitchCreatorProgramSettings,
	type TwitchEventSubSubscriptionResponse,
	type TwitchOAuthIntent,
	type TwitchSubscriberPerkGrantResponse,
	type TwitchStreamSettings,
} from './TwitchModel';
import {TwitchRepository} from './TwitchRepository';

const OAUTH_STATE_CACHE_PREFIX = 'twitch:oauth-state:';
const OAUTH_STATE_TTL_SECONDS = 10 * 60;
const TOKEN_REFRESH_MARGIN_MS = 60_000;

const VIEWER_SCOPES = ['user:read:email'] as const;
const CREATOR_SCOPES = ['user:read:email', 'channel:read:subscriptions', 'channel:read:redemptions'] as const;

const EVENTSUB_TARGETS = [
	{type: 'stream.online', version: '1'},
	{type: 'stream.offline', version: '1'},
	{type: 'channel.subscribe', version: '1'},
	{type: 'channel.subscription.gift', version: '1'},
	{type: 'channel.subscription.message', version: '1'},
	{type: 'channel.channel_points_custom_reward_redemption.add', version: '1'},
] as const;

interface CachedOAuthState {
	userId: string;
	intent: TwitchOAuthIntent;
	redirectTo?: string;
	createdAt: number;
}

interface TwitchEventSubPayload {
	challenge?: string;
	subscription?: {
		id?: string;
		status?: string;
		type?: string;
		version?: string;
		condition?: Record<string, string>;
	};
	event?: Record<string, unknown>;
}

function stateCacheKey(state: string): string {
	return `${OAUTH_STATE_CACHE_PREFIX}${state}`;
}

function scopesForIntent(intent: TwitchOAuthIntent): Array<string> {
	return intent === 'creator' ? [...CREATOR_SCOPES] : [...VIEWER_SCOPES];
}

function parseJsonObject<T extends object>(value: string | null | undefined, fallback: T): T {
	if (!value) return fallback;
	try {
		const parsed = JSON.parse(value) as unknown;
		return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? ({...fallback, ...parsed} as T) : fallback;
	} catch {
		return fallback;
	}
}

function sanitizePostConnectRedirect(value: string | null | undefined): string {
	if (!value) return Config.twitch.postConnectRedirectUrl;
	try {
		const target = new URL(value, Config.endpoints.webApp);
		const webApp = new URL(Config.endpoints.webApp);
		if (target.origin !== webApp.origin) return Config.twitch.postConnectRedirectUrl;
		return target.toString();
	} catch {
		return Config.twitch.postConnectRedirectUrl;
	}
}

function tokenExpiresAt(token: TwitchTokenResponse, now: Date): Date | null {
	if (!token.expires_in) return null;
	return new Date(now.getTime() + token.expires_in * 1000);
}

function normalizeTwitchLogin(value: string): string {
	return value.trim().replace(/^@/, '').toLowerCase();
}

function tierRank(value: string): number {
	if (value === '3000') return 3;
	if (value === '2000') return 2;
	return 1;
}

export class TwitchService {
	constructor(
		private readonly repository = new TwitchRepository(),
		private readonly apiClient = new TwitchApiClient(),
		private readonly gatewayService = new GatewayService(),
	) {}

	isConfigured(): boolean {
		return this.apiClient.isConfigured();
	}

	async getStatus(userId: UserID): Promise<{configured: boolean; connection: TwitchConnectionResponse | null}> {
		const connection = await this.repository.getConnection(userId);
		if (!connection) return {configured: this.isConfigured(), connection: null};
		const creatorProgram = await this.getCreatorProgramSettings(connection);
		return {
			configured: this.isConfigured(),
			connection: mapConnectionToResponse(connection, creatorProgram),
		};
	}

	async startOAuth(params: {
		cacheService: ICacheService;
		userId: UserID;
		intent: TwitchOAuthIntent;
		redirectTo?: string;
		state: string;
	}): Promise<{configured: boolean; url: string; state: string; intent: TwitchOAuthIntent; redirectUri: string; scopes: Array<string>}> {
		if (!this.isConfigured()) {
			return {
				configured: false,
				url: '',
				state: params.state,
				intent: params.intent,
				redirectUri: Config.twitch.redirectUri,
				scopes: [],
			};
		}

		const scopes = scopesForIntent(params.intent);
		await params.cacheService.set<CachedOAuthState>(
			stateCacheKey(params.state),
			{
				userId: params.userId.toString(),
				intent: params.intent,
				redirectTo: sanitizePostConnectRedirect(params.redirectTo),
				createdAt: Date.now(),
			},
			OAUTH_STATE_TTL_SECONDS,
		);

		return {
			configured: true,
			url: this.apiClient.buildAuthorizeUrl({state: params.state, intent: params.intent, scopes}),
			state: params.state,
			intent: params.intent,
			redirectUri: Config.twitch.redirectUri,
			scopes,
		};
	}

	async completeOAuth(params: {
		cacheService: ICacheService;
		code: string;
		state: string;
	}): Promise<{ok: boolean; redirectTo: string; error?: string}> {
		const cachedState = await params.cacheService.getAndDelete<CachedOAuthState>(stateCacheKey(params.state));
		if (!cachedState) {
			return {ok: false, redirectTo: Config.twitch.postConnectRedirectUrl, error: 'oauth_state_invalid'};
		}

		try {
			const userId = createUserID(BigInt(cachedState.userId));
			const token = await this.apiClient.exchangeCode(params.code);
			const twitchUser = await this.apiClient.getCurrentUser(token.access_token);
			await this.upsertConnectionFromOAuth({
				userId,
				token,
				twitchUser,
			});

			if (cachedState.intent === 'creator') {
				const connection = await this.repository.getConnection(userId);
				if (connection) {
					await this.enableCreatorProgram(connection);
					if (Config.twitch.autoSyncEventSub && Config.twitch.eventSubSecret) {
						void this.syncEventSub(userId).catch((error) => {
							Logger.warn({error, userId: userId.toString()}, 'Twitch EventSub auto-sync failed');
						});
					}
				}
			}

			return {ok: true, redirectTo: sanitizePostConnectRedirect(cachedState.redirectTo)};
		} catch (error) {
			Logger.warn({error}, 'Twitch OAuth callback failed');
			return {ok: false, redirectTo: sanitizePostConnectRedirect(cachedState.redirectTo), error: 'oauth_callback_failed'};
		}
	}

	async updateSettings(
		userId: UserID,
		settingsPatch: Partial<TwitchStreamSettings>,
	): Promise<{configured: boolean; connection: TwitchConnectionResponse | null}> {
		const connection = await this.repository.getConnection(userId);
		if (!connection) return {configured: this.isConfigured(), connection: null};
		const settings = normalizeTwitchStreamSettings({
			...parseJsonObject(connection.settings_json, DEFAULT_TWITCH_STREAM_SETTINGS),
			...settingsPatch,
		});
		const updatedConnection = {
			...connection,
			settings_json: serializeJsonObject(settings),
			updated_at: new Date(),
		};
		await this.repository.upsertConnection(updatedConnection);
		const creatorProgram = await this.getCreatorProgramSettings(updatedConnection);
		return {
			configured: this.isConfigured(),
			connection: mapConnectionToResponse(updatedConnection, creatorProgram),
		};
	}

	async disconnect(userId: UserID): Promise<{configured: boolean; connection: null}> {
		await this.repository.deleteConnection(userId);
		return {configured: this.isConfigured(), connection: null};
	}

	async updateCreatorProgram(
		userId: UserID,
		programPatch: Partial<TwitchCreatorProgramSettings>,
	): Promise<{
		ok: boolean;
		connection: TwitchConnectionResponse | null;
		creatorProgram: TwitchCreatorProgramResponse | null;
		needsCreatorScope: boolean;
	}> {
		const connection = await this.repository.getConnection(userId);
		if (!connection) {
			return {ok: false, connection: null, creatorProgram: null, needsCreatorScope: true};
		}

		const existing = await this.repository.getCreatorProgram(userId);
		const program = normalizeTwitchCreatorProgram({
			...parseJsonObject(existing?.program_json, DEFAULT_TWITCH_CREATOR_PROGRAM),
			...programPatch,
		});
		const row = this.buildCreatorProgramRow(connection, program, existing);
		await this.repository.upsertCreatorProgram(row);
		await this.repository.syncCreatorProgramListing(row, connection, existing);
		const subscriptions = await this.repository.listEventSubSubscriptions(connection.twitch_user_id);

		return {
			ok: true,
			connection: mapConnectionToResponse(connection, mapCreatorProgramSettingsToResponse(row, subscriptions)),
			creatorProgram: mapCreatorProgramToResponse(row, connection, subscriptions),
			needsCreatorScope: !connection.scopes.has('channel:read:subscriptions'),
		};
	}

	async listCreatorProgramsForUser(_userId: UserID): Promise<{programs: Array<TwitchCreatorProgramResponse>}> {
		const programs = await this.repository.listEnabledCreatorPrograms();
		return {programs: programs.map((program) => mapCreatorProgramListingToResponse(program))};
	}

	async syncEventSub(userId: UserID): Promise<{
		ok: boolean;
		configured: boolean;
		callbackUrl: string;
		records: Array<TwitchEventSubSubscriptionResponse>;
		errors: Array<{type: string; error: string}>;
		connection: TwitchConnectionResponse | null;
		creatorProgram: TwitchCreatorProgramResponse | null;
		error?: string;
	}> {
		if (!this.isConfigured() || !Config.twitch.eventSubSecret) {
			return {
				ok: false,
				configured: false,
				callbackUrl: Config.twitch.eventSubCallbackUrl,
				records: [],
				errors: [],
				connection: null,
				creatorProgram: null,
				error: 'Twitch EventSub is not configured on this server.',
			};
		}

		const connection = await this.ensureFreshConnectionToken(userId);
		if (!connection) {
			return {
				ok: false,
				configured: true,
				callbackUrl: Config.twitch.eventSubCallbackUrl,
				records: [],
				errors: [],
				connection: null,
				creatorProgram: null,
				error: 'Connect Twitch before syncing EventSub.',
			};
		}

		const existingProgram = await this.repository.getCreatorProgram(userId);
		if (!existingProgram?.enabled) {
			return {
				ok: false,
				configured: true,
				callbackUrl: Config.twitch.eventSubCallbackUrl,
				records: [],
				errors: [],
				connection: mapConnectionToResponse(connection),
				creatorProgram: null,
				error: 'Enable the streamer program before syncing EventSub.',
			};
		}

		const now = new Date();
		const rows: Array<TwitchEventSubSubscriptionRow> = [];
		const errors: Array<{type: string; error: string}> = [];
		for (const target of EVENTSUB_TARGETS) {
			const condition = {broadcaster_user_id: connection.twitch_user_id};
			try {
				const created = await this.apiClient.createEventSubSubscription({
					eventType: target.type,
					version: target.version,
					condition,
				});
				const row: TwitchEventSubSubscriptionRow = {
					broadcaster_user_id: connection.twitch_user_id,
					event_type: target.type,
					subscription_id: created.id,
					status: created.status,
					version: created.version,
					condition_json: serializeJsonObject(created.condition),
					last_synced_at: now,
				};
				await this.repository.upsertEventSubSubscription(row);
				rows.push(row);
			} catch (error) {
				const message = error instanceof Error ? error.message : 'Sync failed';
				errors.push({type: target.type, error: message});
				const row: TwitchEventSubSubscriptionRow = {
					broadcaster_user_id: connection.twitch_user_id,
					event_type: target.type,
					subscription_id: null,
					status: 'error',
					version: target.version,
					condition_json: serializeJsonObject(condition),
					last_synced_at: now,
				};
				await this.repository.upsertEventSubSubscription(row);
				rows.push(row);
			}
		}

		const baseProgram = normalizeTwitchCreatorProgram(parseJsonObject(existingProgram.program_json, DEFAULT_TWITCH_CREATOR_PROGRAM), {
			enabled: existingProgram.enabled,
			subscriberPerksEnabled: existingProgram.subscriber_perks_enabled,
			eventSubSubscriptions: rows.map((row) => mapEventSubSubscriptionToResponse(row)),
			updatedAt: now.getTime(),
		});
		const updatedProgram = {
			...baseProgram,
			eventSubEnabled: rows.some((row) => ['enabled', 'webhook_callback_verification_pending'].includes(row.status)),
			eventSubLastSyncedAt: now.getTime(),
			eventSubLastError: errors.map((entry) => `${entry.type}: ${entry.error}`).join('\n'),
		};
		const updatedRow = this.buildCreatorProgramRow(connection, updatedProgram, existingProgram, errors.length ? 'error' : 'enabled');
		await this.repository.upsertCreatorProgram(updatedRow);
		await this.repository.syncCreatorProgramListing(updatedRow, connection, existingProgram);
		const subscriptions = await this.repository.listEventSubSubscriptions(connection.twitch_user_id);

		return {
			ok: errors.length === 0,
			configured: true,
			callbackUrl: Config.twitch.eventSubCallbackUrl,
			records: subscriptions.map((row) => mapEventSubSubscriptionToResponse(row)),
			errors,
			connection: mapConnectionToResponse(connection, mapCreatorProgramSettingsToResponse(updatedRow, subscriptions)),
			creatorProgram: mapCreatorProgramToResponse(updatedRow, connection, subscriptions),
		};
	}

	async getLiveState(userId: UserID): Promise<{liveState: ReturnType<typeof mapLiveStateToResponse>}> {
		const connection = await this.repository.getConnection(userId);
		if (!connection) return {liveState: null};
		return {liveState: mapLiveStateToResponse(await this.repository.getLiveState(connection.twitch_user_id))};
	}

	async getSubscriberPerkGrants(userId: UserID): Promise<{
		grants: Array<TwitchSubscriberPerkGrantResponse>;
		viewerGrants: Array<TwitchSubscriberPerkGrantResponse>;
	}> {
		const [creatorGrants, viewerGrants] = await Promise.all([
			this.repository.listSubscriberPerkGrantsForCreator(userId),
			this.repository.listSubscriberPerkGrantsForViewer(userId),
		]);
		return {
			grants: creatorGrants.map((grant) => mapSubscriberPerkGrantToResponse(grant)),
			viewerGrants: viewerGrants.map((grant) => mapSubscriberPerkGrantToResponse(grant)),
		};
	}

	async checkSubscriberPerk(
		viewerUserId: UserID,
		creatorLoginInput: string,
	): Promise<{
		eligible: boolean;
		reason: string;
		tier?: string;
		isGift?: boolean;
		minimumTier?: string;
		needsCreatorScope?: boolean;
		missingScope?: string;
		creator?: TwitchCreatorProgramResponse;
		reward?: TwitchCreatorProgramSettings;
	}> {
		const viewerConnection = await this.repository.getConnection(viewerUserId);
		if (!viewerConnection) {
			return {eligible: false, reason: 'Connect Twitch before checking subscriber perks.'};
		}

		const twitchCreator = await this.apiClient.getUserByLogin(normalizeTwitchLogin(creatorLoginInput));
		if (!twitchCreator) return {eligible: false, reason: 'Twitch creator was not found.'};

		const creatorConnection = await this.repository.getConnectionByTwitchUserId(twitchCreator.id);
		if (!creatorConnection) return {eligible: false, reason: 'This Twitch creator is not connected to Astral.'};

		const creatorProgramRow = await this.repository.getCreatorProgram(creatorConnection.user_id);
		if (!creatorProgramRow?.enabled || !creatorProgramRow.subscriber_perks_enabled) {
			return {eligible: false, reason: 'This creator has not enabled Astral subscriber perks.'};
		}

		const subscriptions = await this.repository.listEventSubSubscriptions(creatorConnection.twitch_user_id);
		const creatorProgram = mapCreatorProgramToResponse(creatorProgramRow, creatorConnection, subscriptions);
		if (!creatorConnection.scopes.has('channel:read:subscriptions')) {
			return {
				eligible: false,
				reason: 'The creator needs to upgrade Twitch permissions.',
				needsCreatorScope: true,
				missingScope: 'channel:read:subscriptions',
				creator: creatorProgram,
				reward: creatorProgram.program,
			};
		}

		const freshCreatorConnection = await this.ensureFreshConnectionToken(creatorConnection.user_id);
		if (!freshCreatorConnection) return {eligible: false, reason: 'Creator Twitch connection is unavailable.'};

		const subscription = await this.apiClient.getBroadcasterSubscription(
			freshCreatorConnection.access_token,
			creatorConnection.twitch_user_id,
			viewerConnection.twitch_user_id,
		);
		if (!subscription) {
			return {
				eligible: false,
				reason: 'No active Twitch subscription was found for this creator.',
				minimumTier: creatorProgram.program.minimumTier,
				creator: creatorProgram,
				reward: creatorProgram.program,
			};
		}
		if (subscription.isGift && !creatorProgram.program.allowGiftedSubscriptions) {
			return {
				eligible: false,
				reason: 'Gifted subscriptions do not unlock this creator perk.',
				tier: subscription.tier,
				isGift: true,
				minimumTier: creatorProgram.program.minimumTier,
				creator: creatorProgram,
				reward: creatorProgram.program,
			};
		}
		if (tierRank(subscription.tier) < tierRank(creatorProgram.program.minimumTier)) {
			return {
				eligible: false,
				reason: 'Your Twitch subscription tier is below the creator requirement.',
				tier: subscription.tier,
				isGift: subscription.isGift,
				minimumTier: creatorProgram.program.minimumTier,
				creator: creatorProgram,
				reward: creatorProgram.program,
			};
		}

		await this.upsertSubscriberPerkGrantFromCheck({
			creatorConnection: freshCreatorConnection,
			viewerConnection,
			creatorProgram: creatorProgram.program,
			tier: subscription.tier,
			isGift: subscription.isGift,
		});

		return {
			eligible: true,
			reason: 'Subscriber perk unlocked.',
			tier: subscription.tier,
			isGift: subscription.isGift,
			minimumTier: creatorProgram.program.minimumTier,
			creator: creatorProgram,
			reward: creatorProgram.program,
		};
	}

	async handleEventSubNotification(params: {
		messageId: string;
		messageType: string;
		rawBody: string;
	}): Promise<{challenge?: string}> {
		const payload = JSON.parse(params.rawBody) as TwitchEventSubPayload;
		if (params.messageType === 'webhook_callback_verification') {
			return {challenge: payload.challenge ?? ''};
		}

		const eventType = payload.subscription?.type ?? 'unknown';
		const broadcasterUserId =
			payload.subscription?.condition?.broadcaster_user_id ??
			(typeof payload.event?.broadcaster_user_id === 'string' ? payload.event.broadcaster_user_id : null);
		const now = new Date();

		if (params.messageType === 'revocation') {
			if (broadcasterUserId) {
				await this.repository.upsertEventSubSubscription({
					broadcaster_user_id: broadcasterUserId,
					event_type: eventType,
					subscription_id: payload.subscription?.id ?? null,
					status: payload.subscription?.status ?? 'revoked',
					version: payload.subscription?.version ?? '1',
					condition_json: serializeJsonObject(payload.subscription?.condition ?? {}),
					last_synced_at: now,
				});
			}
			return {};
		}

		if (params.messageType !== 'notification') return {};
		const applied = await this.repository.markEventSeen({
			message_id: params.messageId,
			event_type: eventType,
			broadcaster_user_id: broadcasterUserId,
			received_at: now,
		});
		if (!applied || !broadcasterUserId) return {};

		await this.repository.insertChannelEvent({
			broadcaster_user_id: broadcasterUserId,
			event_timestamp: now,
			message_id: params.messageId,
			event_type: eventType,
			payload_json: params.rawBody,
		});

		if (eventType === 'stream.online' || eventType === 'stream.offline') {
			await this.updateLiveStateFromEvent(broadcasterUserId, eventType, payload.event ?? {}, now);
		}
		return {};
	}

	private async getCreatorProgramSettings(connection: TwitchConnectionRow): Promise<TwitchCreatorProgramSettings | undefined> {
		const creatorProgram = await this.repository.getCreatorProgram(connection.user_id);
		if (!creatorProgram) return undefined;
		const subscriptions = await this.repository.listEventSubSubscriptions(connection.twitch_user_id);
		return mapCreatorProgramSettingsToResponse(creatorProgram, subscriptions);
	}

	private async upsertConnectionFromOAuth({
		userId,
		token,
		twitchUser,
	}: {
		userId: UserID;
		token: TwitchTokenResponse;
		twitchUser: TwitchUser;
	}): Promise<void> {
		const now = new Date();
		const previous = await this.repository.getConnection(userId);
		const connection: TwitchConnectionRow = {
			user_id: userId,
			twitch_user_id: twitchUser.id,
			login: twitchUser.login,
			display_name: twitchUser.display_name || twitchUser.login,
			profile_image_url: twitchUser.profile_image_url ?? null,
			access_token: token.access_token,
			refresh_token: token.refresh_token ?? previous?.refresh_token ?? '',
			scopes: new Set(token.scope ?? [...(previous?.scopes ?? new Set<string>())]),
			settings_json: previous?.settings_json ?? serializeJsonObject(DEFAULT_TWITCH_STREAM_SETTINGS),
			token_expires_at: tokenExpiresAt(token, now),
			connected_at: previous?.connected_at ?? now,
			updated_at: now,
		};
		await this.repository.upsertConnection(connection, previous?.twitch_user_id ?? null);

		const creatorProgram = await this.repository.getCreatorProgram(userId);
		if (creatorProgram?.enabled) {
			const updatedProgramRow = this.buildCreatorProgramRow(
				connection,
				parseJsonObject(creatorProgram.program_json, DEFAULT_TWITCH_CREATOR_PROGRAM),
				creatorProgram,
				creatorProgram.eventsub_status,
			);
			await this.repository.upsertCreatorProgram(updatedProgramRow);
			await this.repository.syncCreatorProgramListing(updatedProgramRow, connection, creatorProgram);
		}
	}

	private async ensureFreshConnectionToken(userId: UserID): Promise<TwitchConnectionRow | null> {
		const connection = await this.repository.getConnection(userId);
		if (!connection) return null;
		if (!connection.token_expires_at || connection.token_expires_at.getTime() > Date.now() + TOKEN_REFRESH_MARGIN_MS) {
			return connection;
		}
		if (!connection.refresh_token) return connection;

		const token = await this.apiClient.refreshToken(connection.refresh_token);
		const updated: TwitchConnectionRow = {
			...connection,
			access_token: token.access_token,
			refresh_token: token.refresh_token ?? connection.refresh_token,
			scopes: new Set(token.scope ?? [...connection.scopes]),
			token_expires_at: tokenExpiresAt(token, new Date()),
			updated_at: new Date(),
		};
		await this.repository.upsertConnection(updated);
		return updated;
	}

	private buildCreatorProgramRow(
		connection: TwitchConnectionRow,
		program: TwitchCreatorProgramSettings,
		existing?: TwitchCreatorProgramRow | null,
		eventSubStatus?: string,
	): TwitchCreatorProgramRow {
		return {
			user_id: connection.user_id,
			twitch_user_id: connection.twitch_user_id,
			broadcaster_login: connection.login,
			broadcaster_display_name: connection.display_name,
			enabled: program.enabled,
			subscriber_perks_enabled: program.subscriberPerksEnabled,
			channel_points_enabled: existing?.channel_points_enabled ?? false,
			eventsub_status: eventSubStatus ?? existing?.eventsub_status ?? 'not_synced',
			program_json: serializeJsonObject(program),
			updated_at: new Date(),
		};
	}

	private async enableCreatorProgram(connection: TwitchConnectionRow): Promise<void> {
		const existing = await this.repository.getCreatorProgram(connection.user_id);
		const program = normalizeTwitchCreatorProgram(parseJsonObject(existing?.program_json, DEFAULT_TWITCH_CREATOR_PROGRAM), {
			enabled: true,
			subscriberPerksEnabled: existing?.subscriber_perks_enabled ?? true,
			updatedAt: Date.now(),
		});
		const row = this.buildCreatorProgramRow(connection, program, existing);
		await this.repository.upsertCreatorProgram(row);
		await this.repository.syncCreatorProgramListing(row, connection, existing);
	}

	private async upsertSubscriberPerkGrantFromCheck({
		creatorConnection,
		viewerConnection,
		creatorProgram,
		tier,
		isGift,
	}: {
		creatorConnection: TwitchConnectionRow;
		viewerConnection: TwitchConnectionRow;
		creatorProgram: TwitchCreatorProgramSettings;
		tier: string;
		isGift: boolean;
	}): Promise<void> {
		const now = new Date();
		const existing = await this.repository
			.listSubscriberPerkGrantsForViewer(viewerConnection.user_id)
			.then((grants) => grants.find((grant) => grant.creator_user_id === creatorConnection.user_id));
		await this.repository.upsertSubscriberPerkGrant({
			creator_user_id: creatorConnection.user_id,
			viewer_user_id: viewerConnection.user_id,
			id: `${creatorConnection.user_id.toString()}:${viewerConnection.user_id.toString()}`,
			creator_twitch_user_id: creatorConnection.twitch_user_id,
			creator_login: creatorConnection.login,
			creator_display_name: creatorConnection.display_name,
			viewer_twitch_user_id: viewerConnection.twitch_user_id,
			viewer_login: viewerConnection.login,
			viewer_display_name: viewerConnection.display_name,
			active: true,
			tier: normalizeTwitchSubscriptionTier(tier),
			is_gift: isGift,
			reward_kind: normalizeTwitchRewardKind(creatorProgram.rewardKind),
			reward_name: creatorProgram.rewardName,
			reward_description: creatorProgram.rewardDescription,
			source: 'manual_check',
			created_at: existing?.created_at ?? now,
			granted_at: existing?.granted_at ?? now,
			revoked_at: null,
			updated_at: now,
			last_event_at: now,
		});
	}

	private async updateLiveStateFromEvent(
		broadcasterUserId: string,
		eventType: string,
		event: Record<string, unknown>,
		now: Date,
	): Promise<void> {
		const connection = await this.repository.getConnectionByTwitchUserId(broadcasterUserId);
		if (!connection) return;
		const isLive = eventType === 'stream.online';
		const previous = await this.repository.getLiveState(broadcasterUserId);
		await this.repository.upsertLiveState({
			broadcaster_user_id: broadcasterUserId,
			creator_user_id: connection.user_id,
			login: typeof event.broadcaster_user_login === 'string' ? event.broadcaster_user_login : connection.login,
			display_name:
				typeof event.broadcaster_user_name === 'string' ? event.broadcaster_user_name : connection.display_name,
			is_live: isLive,
			stream_id: isLive && typeof event.id === 'string' ? event.id : previous?.stream_id ?? null,
			stream_type: isLive && typeof event.type === 'string' ? event.type : previous?.stream_type ?? null,
			started_at:
				isLive && typeof event.started_at === 'string'
					? new Date(event.started_at)
					: isLive
						? now
						: previous?.started_at ?? null,
			ended_at: isLive ? null : now,
			updated_at: now,
		});

		// Notify the user's client so it can update its presence with the new live state
		const liveStateChanged = (previous?.is_live ?? false) !== isLive;
		if (liveStateChanged) {
			void this.gatewayService
				.dispatchPresence({
					userId: connection.user_id,
					event: 'INTEGRATION_UPDATE',
					data: {type: 'twitch', isLive},
				})
				.catch((err) => Logger.warn({err}, '[TwitchService] Failed to dispatch INTEGRATION_UPDATE'));
		}
	}
}
