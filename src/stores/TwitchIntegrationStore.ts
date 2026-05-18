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

import {makeAutoObservable, runInAction} from 'mobx';
import {Endpoints} from '~/Endpoints';
import http from '~/lib/HttpClient';
import {Logger} from '~/lib/Logger';
import {makePersistent} from '~/lib/MobXPersistence';

export const TWITCH_OAUTH_RESULT_KEY = 'astral.twitch.connect.result';

export interface TwitchStreamSettings {
	streamModeEnabled: boolean;
	autoDetectLive: boolean;
	autoAnnounceLive: boolean;
	hideSensitiveOverlay: boolean;
	showTwitchPresence: boolean;
	mirrorScreenShare: boolean;
}

export type TwitchSubscriptionTier = '1000' | '2000' | '3000';
export type TwitchCreatorRewardKind = 'badge' | 'role' | 'early_access' | 'cosmetic' | 'custom';

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
	eventSubSubscriptions: Array<TwitchEventSubSubscription>;
	eventSubLastSyncedAt: number;
	eventSubLastError: string;
	updatedAt: number;
}

export interface TwitchEventSubSubscription {
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

export interface TwitchLiveState {
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

export interface TwitchSubscriberPerkGrant {
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

export interface TwitchConnection {
	providerUserId: string;
	login: string;
	displayName: string;
	profileImageUrl: string;
	scopes: Array<string>;
	expiresAt: number;
	connectedAt: number;
	updatedAt: number;
	settings?: Partial<TwitchStreamSettings>;
	creatorProgram?: Partial<TwitchCreatorProgramSettings>;
}

export interface TwitchCreatorProgram {
	userId: string;
	providerUserId: string;
	login: string;
	displayName: string;
	profileImageUrl: string;
	program: TwitchCreatorProgramSettings;
}

export interface TwitchSubscriberPerkCheckResult {
	eligible: boolean;
	reason: string;
	tier?: TwitchSubscriptionTier;
	isGift?: boolean;
	minimumTier?: TwitchSubscriptionTier;
	needsCreatorScope?: boolean;
	missingScope?: string;
	creator?: TwitchCreatorProgram;
	reward?: TwitchCreatorProgramSettings;
}

type AsyncStatus = 'idle' | 'loading' | 'ready' | 'error';

interface TwitchStatusResponse {
	configured: boolean;
	connection: TwitchConnection | null;
}

interface TwitchCreatorProgramResponse {
	ok: boolean;
	connection: TwitchConnection | null;
	creatorProgram: TwitchCreatorProgram | null;
	needsCreatorScope: boolean;
}

interface TwitchCreatorProgramsResponse {
	programs: Array<TwitchCreatorProgram>;
}

interface TwitchEventSubSyncResponse {
	ok: boolean;
	configured?: boolean;
	callbackUrl?: string;
	records?: Array<TwitchEventSubSubscription>;
	errors?: Array<{type: string; error: string}>;
	connection?: TwitchConnection | null;
	creatorProgram?: TwitchCreatorProgram | null;
	error?: string;
}

interface TwitchSubscriberPerkGrantsResponse {
	grants: Array<TwitchSubscriberPerkGrant>;
	viewerGrants: Array<TwitchSubscriberPerkGrant>;
}

interface TwitchLiveStateResponse {
	liveState: TwitchLiveState | null;
}

interface TwitchOAuthStartResponse {
	configured: boolean;
	url: string;
	state: string;
	intent?: 'viewer' | 'creator';
	redirectUri: string;
	scopes: Array<string>;
}

const DEFAULT_STREAM_SETTINGS: TwitchStreamSettings = {
	streamModeEnabled: false,
	autoDetectLive: true,
	autoAnnounceLive: false,
	hideSensitiveOverlay: true,
	showTwitchPresence: true,
	mirrorScreenShare: false,
};

const DEFAULT_CREATOR_PROGRAM: TwitchCreatorProgramSettings = {
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

const safeWindow = (): Window | null => (typeof window === 'undefined' ? null : window);

function normalizeSettings(settings?: Partial<TwitchStreamSettings> | null): TwitchStreamSettings {
	return {
		...DEFAULT_STREAM_SETTINGS,
		...(settings ?? {}),
	};
}

function normalizeCreatorProgram(program?: Partial<TwitchCreatorProgramSettings> | null): TwitchCreatorProgramSettings {
	return {
		...DEFAULT_CREATOR_PROGRAM,
		...(program ?? {}),
	};
}

class TwitchIntegrationStore {
	configured = false;
	status: AsyncStatus = 'idle';
	creatorProgramStatus: AsyncStatus = 'idle';
	eventSubStatus: AsyncStatus = 'idle';
	subscriberCheckStatus: AsyncStatus = 'idle';
	error: string | null = null;
	creatorProgramError: string | null = null;
	eventSubError: string | null = null;
	subscriberCheckError: string | null = null;
	connection: TwitchConnection | null = null;
	settings: TwitchStreamSettings = {...DEFAULT_STREAM_SETTINGS};
	creatorProgram: TwitchCreatorProgramSettings = {...DEFAULT_CREATOR_PROGRAM};
	creatorPrograms: Array<TwitchCreatorProgram> = [];
	creatorGrants: Array<TwitchSubscriberPerkGrant> = [];
	viewerGrants: Array<TwitchSubscriberPerkGrant> = [];
	liveState: TwitchLiveState | null = null;
	subscriberCheckResult: TwitchSubscriberPerkCheckResult | null = null;

	private readonly logger = new Logger('TwitchIntegrationStore');
	private bootstrapped = false;
	private oauthListenersBound = false;
	private restoreStreamModeAfterScreenShare = false;

	constructor() {
		makeAutoObservable<this, 'logger' | 'bootstrapped' | 'oauthListenersBound' | 'restoreStreamModeAfterScreenShare'>(
			this,
			{
				logger: false,
				bootstrapped: false,
				oauthListenersBound: false,
				restoreStreamModeAfterScreenShare: false,
			},
			{autoBind: true},
		);

		void this.initPersistence();
		this.bindOAuthListeners();
	}

	get isConnected(): boolean {
		return Boolean(this.connection);
	}

	get displayName(): string {
		return this.connection?.displayName || this.connection?.login || 'Twitch';
	}

	get streamModeEnabled(): boolean {
		return this.settings.streamModeEnabled;
	}

	get hasCreatorSubscriptionScope(): boolean {
		return Boolean(this.connection?.scopes?.includes('channel:read:subscriptions'));
	}

	get eventSubReady(): boolean {
		return this.creatorProgram.eventSubSubscriptions.some((subscription) =>
			['enabled', 'webhook_callback_verification_pending', 'already_exists'].includes(subscription.status),
		);
	}

	private async initPersistence(): Promise<void> {
		await makePersistent(this, 'TwitchIntegrationStore', ['settings'], {version: 1});
	}

	private bindOAuthListeners(): void {
		const currentWindow = safeWindow();
		if (!currentWindow || this.oauthListenersBound) return;

		currentWindow.addEventListener('storage', this.handleStorageEvent);
		currentWindow.addEventListener('message', this.handleWindowMessage);
		this.oauthListenersBound = true;

		try {
			const pendingResult = currentWindow.localStorage.getItem(TWITCH_OAUTH_RESULT_KEY);
			if (pendingResult) {
				this.consumeOAuthResult(pendingResult);
			}
		} catch {
			// Storage may be unavailable in embedded browsers.
		}
	}

	private handleStorageEvent(event: StorageEvent): void {
		if (event.key !== TWITCH_OAUTH_RESULT_KEY || !event.newValue) return;
		this.consumeOAuthResult(event.newValue);
	}

	private handleWindowMessage(event: MessageEvent): void {
		if (typeof event.data !== 'object' || !event.data) return;
		if ((event.data as {type?: string}).type !== 'astral:twitch:oauth') return;
		void this.refresh();
	}

	private consumeOAuthResult(raw: string): void {
		try {
			const payload = JSON.parse(raw) as {ok?: boolean; error?: string};
			const currentWindow = safeWindow();
			currentWindow?.localStorage.removeItem(TWITCH_OAUTH_RESULT_KEY);

			if (payload.ok) {
				void this.refresh();
				return;
			}

			runInAction(() => {
				this.error = payload.error || 'Twitch authorization failed.';
				this.status = 'error';
			});
		} catch {
			// Ignore malformed OAuth handoff payloads.
		}
	}

	async ensureBootstrapped(): Promise<void> {
		if (this.bootstrapped) return;
		this.bootstrapped = true;
		await this.refresh();
		await Promise.allSettled([
			this.refreshCreatorPrograms(),
			this.refreshLiveState(),
			this.refreshSubscriberPerkGrants(),
		]);
	}

	async refresh(): Promise<void> {
		runInAction(() => {
			this.status = 'loading';
			this.error = null;
		});

		try {
			const response = await http.get<TwitchStatusResponse>({
				url: Endpoints.TWITCH_CONNECTION,
				rejectWithError: false,
			});

			runInAction(() => {
				if (!response.ok) {
					this.status = 'error';
					this.error = response.status === 404 ? 'Twitch integration endpoint is unavailable.' : 'Failed to load Twitch status.';
					return;
				}

				this.configured = Boolean(response.body.configured);
				this.connection = response.body.connection ?? null;
				if (response.body.connection?.settings) {
					this.settings = normalizeSettings(response.body.connection.settings);
				}
				if (response.body.connection?.creatorProgram) {
					this.creatorProgram = normalizeCreatorProgram(response.body.connection.creatorProgram);
				}
				this.status = 'ready';
				this.error = null;
			});
		} catch (error) {
			this.logger.error('Failed to refresh Twitch integration', error);
			runInAction(() => {
				this.status = 'error';
				this.error = error instanceof Error ? error.message : 'Failed to load Twitch status.';
			});
		}
	}

	async syncEventSub(): Promise<void> {
		runInAction(() => {
			this.eventSubStatus = 'loading';
			this.eventSubError = null;
		});

		try {
			const response = await http.post<TwitchEventSubSyncResponse>({
				url: Endpoints.TWITCH_EVENTSUB_SYNC,
				body: {},
				rejectWithError: false,
			});

			runInAction(() => {
				if (!response.ok) {
					this.eventSubStatus = 'error';
					this.configured = response.body?.configured ?? this.configured;
					this.eventSubError = response.body?.error || 'Failed to sync Twitch EventSub.';
					return;
				}

				if (response.body.connection) {
					this.connection = response.body.connection;
				}
				if (response.body.creatorProgram?.program) {
					this.creatorProgram = normalizeCreatorProgram(response.body.creatorProgram.program);
				} else if (response.body.records) {
					this.creatorProgram = normalizeCreatorProgram({
						...this.creatorProgram,
						eventSubSubscriptions: response.body.records,
						eventSubLastSyncedAt: Date.now(),
						eventSubLastError: response.body.errors?.map((entry) => `${entry.type}: ${entry.error}`).join('\n') ?? '',
					});
				}

				this.eventSubStatus = response.body.errors?.length ? 'error' : 'ready';
				this.eventSubError = response.body.errors?.length
					? response.body.errors.map((entry) => `${entry.type}: ${entry.error}`).join('\n')
					: null;
			});

			await this.refreshLiveState();
			await this.refreshSubscriberPerkGrants();
		} catch (error) {
			this.logger.error('Failed to sync Twitch EventSub', error);
			runInAction(() => {
				this.eventSubStatus = 'error';
				this.eventSubError = error instanceof Error ? error.message : 'Failed to sync Twitch EventSub.';
			});
		}
	}

	async refreshLiveState(): Promise<void> {
		try {
			const response = await http.get<TwitchLiveStateResponse>({
				url: Endpoints.TWITCH_LIVE_STATE,
				rejectWithError: false,
			});

			runInAction(() => {
				if (response.ok) {
					this.liveState = response.body.liveState ?? null;
				}
			});
		} catch (error) {
			this.logger.warn('Failed to refresh Twitch live state', error);
		}
	}

	async refreshSubscriberPerkGrants(): Promise<void> {
		try {
			const response = await http.get<TwitchSubscriberPerkGrantsResponse>({
				url: Endpoints.TWITCH_SUBSCRIBER_PERK_GRANTS,
				rejectWithError: false,
			});

			runInAction(() => {
				if (response.ok) {
					this.creatorGrants = response.body.grants ?? [];
					this.viewerGrants = response.body.viewerGrants ?? [];
				}
			});
		} catch (error) {
			this.logger.warn('Failed to refresh Twitch subscriber perk grants', error);
		}
	}

	async startOAuth(intent: 'viewer' | 'creator' = 'viewer'): Promise<void> {
		runInAction(() => {
			this.status = 'loading';
			this.error = null;
		});

		try {
			const response = await http.post<TwitchOAuthStartResponse>({
				url: Endpoints.TWITCH_CONNECT_START,
				body: {intent},
				rejectWithError: false,
			});

			if (!response.ok || !response.body.url) {
				runInAction(() => {
					this.configured = Boolean((response.body as Partial<TwitchOAuthStartResponse> | undefined)?.configured);
					this.status = 'error';
					this.error = response.status === 503 ? 'Twitch app is not configured on this server.' : 'Failed to start Twitch OAuth.';
				});
				return;
			}

			runInAction(() => {
				this.configured = true;
				this.status = 'ready';
			});

			const currentWindow = safeWindow();
			currentWindow?.open(response.body.url, 'astral-twitch-connect', 'width=560,height=740');
		} catch (error) {
			this.logger.error('Failed to start Twitch OAuth', error);
			runInAction(() => {
				this.status = 'error';
				this.error = error instanceof Error ? error.message : 'Failed to start Twitch OAuth.';
			});
		}
	}

	async refreshCreatorPrograms(): Promise<void> {
		try {
			const response = await http.get<TwitchCreatorProgramsResponse>({
				url: Endpoints.TWITCH_CREATOR_PROGRAMS,
				rejectWithError: false,
			});

			runInAction(() => {
				if (response.ok) {
					this.creatorPrograms = response.body.programs ?? [];
				}
			});
		} catch (error) {
			this.logger.warn('Failed to refresh Twitch creator programs', error);
		}
	}

	async disconnect(): Promise<void> {
		runInAction(() => {
			this.status = 'loading';
			this.error = null;
		});

		try {
			const response = await http.post<TwitchStatusResponse>({
				url: Endpoints.TWITCH_DISCONNECT,
				body: {},
				rejectWithError: false,
			});

			runInAction(() => {
				this.connection = null;
				if (response.ok) this.configured = Boolean(response.body.configured);
				this.status = response.ok ? 'ready' : 'error';
				this.error = response.ok ? null : 'Failed to disconnect Twitch.';
			});
		} catch (error) {
			this.logger.error('Failed to disconnect Twitch', error);
			runInAction(() => {
				this.status = 'error';
				this.error = error instanceof Error ? error.message : 'Failed to disconnect Twitch.';
			});
		}
	}

	updateSettings(settings: Partial<TwitchStreamSettings>): void {
		this.settings = normalizeSettings({...this.settings, ...settings});
		void this.persistSettings();
	}

	handleScreenShareMirror(enabled: boolean): void {
		if (!this.settings.mirrorScreenShare) return;

		if (enabled) {
			this.restoreStreamModeAfterScreenShare = !this.settings.streamModeEnabled;
			if (this.restoreStreamModeAfterScreenShare) {
				this.settings = normalizeSettings({...this.settings, streamModeEnabled: true});
			}
			return;
		}

		if (this.restoreStreamModeAfterScreenShare) {
			this.settings = normalizeSettings({...this.settings, streamModeEnabled: false});
		}
		this.restoreStreamModeAfterScreenShare = false;
	}

	async updateCreatorProgram(program: Partial<TwitchCreatorProgramSettings>): Promise<void> {
		this.creatorProgram = normalizeCreatorProgram({...this.creatorProgram, ...program});
		runInAction(() => {
			this.creatorProgramStatus = 'loading';
			this.creatorProgramError = null;
		});

		try {
			const response = await http.patch<TwitchCreatorProgramResponse>({
				url: Endpoints.TWITCH_CREATOR_PROGRAM,
				body: {program: this.creatorProgram},
				rejectWithError: false,
			});

			runInAction(() => {
				if (!response.ok) {
					this.creatorProgramStatus = 'error';
					this.creatorProgramError = response.status === 404
						? 'Connect Twitch before enabling a creator program.'
						: 'Failed to save creator program.';
					return;
				}

				this.connection = response.body.connection;
				if (response.body.creatorProgram?.program) {
					this.creatorProgram = normalizeCreatorProgram(response.body.creatorProgram.program);
				}
				this.creatorProgramStatus = 'ready';
				this.creatorProgramError = null;
			});
			await this.refreshCreatorPrograms();
		} catch (error) {
			this.logger.error('Failed to update Twitch creator program', error);
			runInAction(() => {
				this.creatorProgramStatus = 'error';
				this.creatorProgramError = error instanceof Error ? error.message : 'Failed to save creator program.';
			});
		}
	}

	async checkSubscriberPerk(creatorLogin: string): Promise<void> {
		runInAction(() => {
			this.subscriberCheckStatus = 'loading';
			this.subscriberCheckError = null;
			this.subscriberCheckResult = null;
		});

		try {
			const response = await http.post<TwitchSubscriberPerkCheckResult>({
				url: Endpoints.TWITCH_SUBSCRIBER_PERK_CHECK,
				body: {creatorLogin},
				rejectWithError: false,
			});

			runInAction(() => {
				this.subscriberCheckResult = response.body;
				this.subscriberCheckStatus = response.ok ? 'ready' : 'error';
				this.subscriberCheckError = response.ok ? null : response.body?.reason || 'Subscriber perk check failed.';
			});
			if (response.ok && response.body?.eligible) {
				await this.refreshSubscriberPerkGrants();
			}
		} catch (error) {
			this.logger.error('Failed to check Twitch subscriber perk', error);
			runInAction(() => {
				this.subscriberCheckStatus = 'error';
				this.subscriberCheckError = error instanceof Error ? error.message : 'Subscriber perk check failed.';
			});
		}
	}

	private async persistSettings(): Promise<void> {
		if (!this.connection) return;

		try {
			const response = await http.patch<TwitchStatusResponse>({
				url: Endpoints.TWITCH_SETTINGS,
				body: {settings: this.settings},
				rejectWithError: false,
			});

			runInAction(() => {
				if (response.ok && response.body.connection) {
					this.connection = response.body.connection;
				}
			});
		} catch (error) {
			this.logger.warn('Failed to persist Twitch settings', error);
		}
	}
}

export default new TwitchIntegrationStore();
