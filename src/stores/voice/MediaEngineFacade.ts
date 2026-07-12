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

import type {I18n} from '@lingui/core';
import {msg} from '@lingui/core/macro';
import type {Participant, Room, ScreenShareCaptureOptions, TrackPublishOptions} from 'livekit-client';
import {computed, makeObservable, observable} from 'mobx';
import * as SoundActionCreators from '~/actions/SoundActionCreators';
import {screenSharePreviewUploader} from '~/lib/ScreenSharePreviewUploader';
import * as ToastActionCreators from '~/actions/ToastActionCreators';
import {ChannelTypes, ME, type GatewayErrorCode, GatewayErrorCodes} from '~/Constants';
import type {GatewayErrorData} from '~/lib/GatewaySocket';
import {Logger} from '~/lib/Logger';
import {voiceStatsDB} from '~/lib/VoiceStatsDB';
import type {GuildReadyData} from '~/records/GuildRecord';
import AuthenticationStore from '~/stores/AuthenticationStore';
import CallMediaPrefsStore from '~/stores/CallMediaPrefsStore';
import ChannelStore from '~/stores/ChannelStore';
import ConnectionStore from '~/stores/ConnectionStore';
import GuildMemberStore from '~/stores/GuildMemberStore';
import GuildStore from '~/stores/GuildStore';
import IdleStore from '~/stores/IdleStore';
import LocalScreenSharePreviewStore from '~/stores/LocalScreenSharePreviewStore';
import LocalVoiceStateStore from '~/stores/LocalVoiceStateStore';
import MediaPermissionStore from '~/stores/MediaPermissionStore';
import UserStore from '~/stores/UserStore';
import VoiceDevicePermissionStore from '~/stores/voice/VoiceDevicePermissionStore';
import {SoundType} from '~/utils/SoundUtils';
import {isBroadcastVoiceChannel} from '~/utils/channelVoiceMode';
import {
	checkChannelLimit,
	disconnectOtherCurrentUserVoiceConnections,
	sendVoiceStateConnect,
	sendVoiceStateDisconnect,
} from './VoiceChannelConnector';
import type {VoiceServerUpdateData} from './VoiceConnectionManager';
import VoiceConnectionManager from './VoiceConnectionManager';
import VoiceActivityManager from './VoiceActivityManager';
import {clearVoiceSession, consumeResumableVoiceSession, saveVoiceSession, touchVoiceSession} from './VoiceSessionResume';
import VoiceMediaManager from './VoiceMediaManager';
import type {LivekitParticipantSnapshot} from './VoiceParticipantManager';
import VoiceParticipantManager from './VoiceParticipantManager';
import VoicePermissionManager from './VoicePermissionManager';
import {bindRoomEvents} from './VoiceRoomEventBinder';
import type {VoiceState} from './VoiceStateManager';
import VoiceStateManager from './VoiceStateManager';
import {VoiceStateSyncManager, type VoiceStateSyncPayload} from './VoiceStateSyncManager';
import type {LatencyDataPoint, VoiceStats} from './VoiceStatsManager';
import {VoiceStatsManager} from './VoiceStatsManager';
import VoiceSubscriptionManager from './VoiceSubscriptionManager';

const logger = new Logger('MediaEngineFacade');
const AFK_CHECK_INTERVAL_MS = 10000;

class MediaEngineFacade {
	private statsManager: VoiceStatsManager;
	private afkIntervalId: ReturnType<typeof setInterval> | null = null;
	private serverDisconnectTimeoutId: ReturnType<typeof setTimeout> | null = null;
	private voiceStateSync = new VoiceStateSyncManager();
	private pendingSuppressOnConnect: boolean | null = null;
	private pendingSuppressSyncAttempts = 0;
	private preferredBroadcastRole: 'listener' | 'speaker' | null = null;
	private i18n: I18n | null = null;
	private voiceResumeAttempted = false;
	evictingStaleSession = false;

	constructor() {
		this.statsManager = new VoiceStatsManager();
		makeObservable(this, {
			room: computed,
			guildId: computed,
			channelId: computed,
			connectionId: computed,
			connected: computed,
			connecting: computed,
			voiceServerEndpoint: computed,
			participants: computed,
			currentLatency: computed,
			averageLatency: computed,
			latencyHistory: computed,
			voiceStats: computed,
			displayLatency: computed,
			estimatedLatency: computed,
			evictingStaleSession: observable,
		});

		(window as typeof window & {_mediaEngineStore?: MediaEngineFacade})._mediaEngineStore = this;
		VoiceConnectionManager.setAutoReconnectHandler(() => {
			const lastChannel = this.getLastConnectedChannel();
			if (lastChannel) {
				void this.connectToVoiceChannel(lastChannel.guildId, lastChannel.channelId);
			}
		});
		logger.debug('MediaEngineFacade initialized');
	}

	setI18n(i18n: I18n): void {
		this.i18n = i18n;
	}

	get room(): Room | null {
		return VoiceConnectionManager.room;
	}
	get guildId(): string | null {
		return VoiceConnectionManager.guildId;
	}
	get channelId(): string | null {
		return VoiceConnectionManager.channelId;
	}
	get connectionId(): string | null {
		return VoiceConnectionManager.connectionId;
	}
	get connected(): boolean {
		return VoiceConnectionManager.connected;
	}
	get connecting(): boolean {
		return VoiceConnectionManager.connecting;
	}
	get voiceServerEndpoint(): string | null {
		return VoiceConnectionManager.voiceServerEndpoint;
	}

	get participants(): Readonly<Record<string, LivekitParticipantSnapshot>> {
		return VoiceParticipantManager.participants;
	}

	get currentLatency(): number | null {
		return this.statsManager.currentLatency;
	}
	get averageLatency(): number | null {
		return this.statsManager.averageLatency;
	}
	get latencyHistory(): Array<LatencyDataPoint> {
		return this.statsManager.latencyHistory;
	}
	get voiceStats(): VoiceStats {
		return this.statsManager.voiceStats;
	}
	get estimatedLatency(): number | null {
		return this.statsManager.estimatedLatency;
	}
	get displayLatency(): number | null {
		return this.statsManager.displayLatency;
	}

	async connectToVoiceChannel(
		guildId: string | null,
		channelId: string,
		options?: {joinAsListener?: boolean; joinAsSpeaker?: boolean},
	): Promise<void> {
		const targetChannel = ChannelStore.getChannel(channelId);
		const targetIsBroadcast = Boolean(
			targetChannel && (isBroadcastVoiceChannel(targetChannel) || options?.joinAsListener === true || options?.joinAsSpeaker === true),
		);

		const currentUserId = AuthenticationStore.currentUserId;
		const isTimedOut =
			guildId && currentUserId ? (GuildMemberStore.getMember(guildId, currentUserId)?.isTimedOut() ?? false) : false;
		if (isTimedOut) {
			if (!this.i18n) {
				throw new Error('MediaEngineFacade: i18n not initialized');
			}
			ToastActionCreators.createToast({
				type: 'error',
				children: this.i18n._(msg`You can't join while you're on timeout.`),
			});
			return;
		}
		const currentUser = UserStore.getCurrentUser();
		const isUnclaimed = !(currentUser?.isClaimed() ?? false);
		if (isUnclaimed) {
			if (!this.i18n) {
				throw new Error('MediaEngineFacade: i18n not initialized');
			}
			if (guildId) {
				const guild = GuildStore.getGuild(guildId);
				const isOwner = guild?.isOwner(currentUserId) ?? false;
				if (!isOwner) {
					ToastActionCreators.createToast({
						type: 'error',
						children: this.i18n._(msg`Claim your account to join voice channels you don't own.`),
					});
					return;
				}
			} else {
				const channel = ChannelStore.getChannel(channelId);
				if (channel?.type === ChannelTypes.DM) {
					ToastActionCreators.createToast({
						type: 'error',
						children: this.i18n._(msg`Claim your account to start or join 1:1 calls.`),
					});
					return;
				}
			}
		}
		if (!ConnectionStore.socket) {
			logger.warn('[connectToVoiceChannel] No socket');
			return;
		}

		if (!checkChannelLimit(guildId, channelId)) return;

		const alreadyInRequestedVoiceChannel =
			(VoiceConnectionManager.connected || VoiceConnectionManager.connecting) &&
			VoiceConnectionManager.channelId === channelId &&
			VoiceConnectionManager.guildId === guildId;

		if (alreadyInRequestedVoiceChannel) {
			disconnectOtherCurrentUserVoiceConnections();
			if (options?.joinAsListener === true || options?.joinAsSpeaker === true) {
				const suppress = options.joinAsListener === true;
				this.preferredBroadcastRole = suppress ? 'listener' : 'speaker';
				if (suppress) {
					LocalVoiceStateStore.updateSelfMute(true);
					void this.setCameraEnabled(false).catch(() => {});
					void this.setScreenShareEnabled(false).catch(() => {});
				}
				this.syncLocalVoiceStateWithServer({
					suppress,
					self_mute: suppress ? true : undefined,
					self_video: suppress ? false : undefined,
					self_stream: suppress ? false : undefined,
				});
			}
			logger.debug('[connectToVoiceChannel] Already in requested voice channel, skipping duplicate join', {
				guildId,
				channelId,
				connectionId: VoiceConnectionManager.connectionId,
			});
			return;
		}

		this.voiceStateSync.reset();
		if (!targetIsBroadcast) {
			this.preferredBroadcastRole = null;
		} else if (options?.joinAsListener === true) {
			this.preferredBroadcastRole = 'listener';
		} else if (options?.joinAsSpeaker === true) {
			this.preferredBroadcastRole = 'speaker';
		}
		disconnectOtherCurrentUserVoiceConnections();
		if (options?.joinAsListener === true) {
			this.pendingSuppressOnConnect = true;
			this.pendingSuppressSyncAttempts = 0;
		} else if (options?.joinAsSpeaker === true) {
			this.pendingSuppressOnConnect = false;
			this.pendingSuppressSyncAttempts = 0;
		} else {
			this.pendingSuppressOnConnect = null;
			this.pendingSuppressSyncAttempts = 0;
		}
		if (options?.joinAsListener === true) {
			LocalVoiceStateStore.updateSelfMute(true);
		}

		if (VoiceConnectionManager.connected || VoiceConnectionManager.connecting) {
			if (VoiceConnectionManager.channelId !== channelId || VoiceConnectionManager.guildId !== guildId) {
				await this.disconnectFromVoiceChannel('user');
			}
		}

		VoiceConnectionManager.startConnection(guildId, channelId);
		sendVoiceStateConnect(guildId, channelId, {
			suppress:
				options?.joinAsListener === true
					? true
					: options?.joinAsSpeaker === true
						? false
						: undefined,
			self_mute: options?.joinAsListener === true ? true : undefined,
		});
	}

	async disconnectFromVoiceChannel(reason: 'user' | 'error' | 'server' = 'user'): Promise<void> {
		if (reason !== 'server') {
			this.clearPendingServerDisconnect();
		}
		const {guildId, connectionId, connected, connecting, channelId} = VoiceConnectionManager.connectionState;
		if (!connected && !connecting && !channelId) return;

		// Only a transient 'error' keeps the resume record alive so a reload can
		// rejoin; an explicit user leave or a server-forced disconnect clears it.
		if (reason === 'user' || reason === 'server') {
			clearVoiceSession();
		}

		this.stopTracking();

		if (reason !== 'server' && connectionId) {
			sendVoiceStateDisconnect(guildId, connectionId);
		}

		if (reason === 'user') {
			SoundActionCreators.playSound(SoundType.VoiceDisconnect);
		}

		LocalVoiceStateStore.updateSelfVideo(false);
		LocalVoiceStateStore.updateSelfStream(false);
		VoiceMediaManager.resetStreamTracking();
		VoiceParticipantManager.clear();
		this.voiceStateSync.reset();
		this.preferredBroadcastRole = null;
		this.pendingSuppressOnConnect = null;
		this.pendingSuppressSyncAttempts = 0;
		VoiceConnectionManager.disconnectFromVoiceChannel(reason);
		if (connectionId) {
			CallMediaPrefsStore.clearForCall(connectionId);
			LocalScreenSharePreviewStore.clearForCall(connectionId);
		}
		logger.info('[disconnectFromVoiceChannel] Disconnected', {reason});
	}

	handleVoiceServerUpdate(raw: VoiceServerUpdateData): void {
		this.clearPendingServerDisconnect();
		VoiceConnectionManager.handleVoiceServerUpdate(raw, (room, attemptId, guildId, channelId) => {
			bindRoomEvents(room, attemptId, guildId, channelId, {
				onConnected: async () => this.startTracking(room),
				onDisconnected: () => this.stopTracking(),
				onUnexpectedDisconnect: () => {
					void this.handleUnexpectedLiveKitDisconnect();
				},
				onReconnecting: () => {
					this.statsManager.stopLatencyTracking();
					this.statsManager.stopStatsTracking();
				},
				onReconnected: () => {
					this.statsManager.startLatencyTracking();
					this.statsManager.startStatsTracking();
				},
			});
		});
	}

	private async handleUnexpectedLiveKitDisconnect(): Promise<void> {
		logger.warn('[handleUnexpectedLiveKitDisconnect] LiveKit disconnected unexpectedly');
		await this.disconnectFromVoiceChannel('error');
		VoiceConnectionManager.requestAutoReconnect();
	}

	handleConnectionOpen(guilds: Array<GuildReadyData>): void {
		VoiceStateManager.handleConnectionOpen(guilds);
		this.maybeResumeVoiceSession();
	}

	/*
	 * After a page reload, rejoin the voice channel the user was in. Runs once
	 * per page load on the first gateway READY (later reconnects are handled by
	 * the in-page reconnect manager and must not re-trigger this). The persisted
	 * session is consumed (cleared) on read, and only honoured if it is recent.
	 */
	private maybeResumeVoiceSession(): void {
		if (this.voiceResumeAttempted) return;
		this.voiceResumeAttempted = true;

		const session = consumeResumableVoiceSession();
		if (!session) return;

		if (VoiceConnectionManager.connected || VoiceConnectionManager.connecting) return;

		logger.info('[maybeResumeVoiceSession] Rejoining voice after reload', {
			guildId: session.guildId,
			channelId: session.channelId,
		});

		// Defer so the READY handler finishes populating guild/channel stores and
		// we don't reenter connection logic mid-dispatch.
		setTimeout(() => {
			if (VoiceConnectionManager.connected || VoiceConnectionManager.connecting) return;
			if (!ConnectionStore.socket) return;
			const channel = ChannelStore.getChannel(session.channelId);
			if (!channel) {
				logger.info('[maybeResumeVoiceSession] Channel no longer available, skipping resume');
				return;
			}
			void this.connectToVoiceChannel(session.guildId, session.channelId).catch((error) => {
				logger.warn('[maybeResumeVoiceSession] Failed to rejoin voice after reload', {error});
			});
		}, 0);
	}
	handleGuildCreate(guild: GuildReadyData): void {
		VoiceStateManager.handleGuildCreate(guild);
	}
	handleGuildDelete(guildId: string): void {
		VoiceStateManager.handleGuildDelete(guildId);
		if (VoiceConnectionManager.connected && VoiceConnectionManager.guildId === guildId) {
			void this.disconnectFromVoiceChannel('server');
		}
	}
	handleGatewayVoiceStateUpdate(guildId: string | null, voiceState: VoiceState): void {
		VoiceStateManager.handleGatewayVoiceStateUpdate(guildId, voiceState);
		const user = UserStore.getCurrentUser();
		const isLocalConnection =
			!VoiceConnectionManager.connectionId || voiceState.connection_id === VoiceConnectionManager.connectionId;
		const isLocalUser = user && voiceState.user_id === user.id && isLocalConnection;

		if (isLocalUser) {
			const connectedChannel = VoiceConnectionManager.channelId
				? ChannelStore.getChannel(VoiceConnectionManager.channelId)
				: null;
			const isBroadcastConnection = Boolean(
				connectedChannel && (isBroadcastVoiceChannel(connectedChannel) || this.isVoiceChannelStageLike(connectedChannel.id)),
			);
			const desiredSuppressFromPreferredRole =
				isBroadcastConnection && this.preferredBroadcastRole
					? this.preferredBroadcastRole === 'listener'
					: null;

			if (
				this.pendingSuppressOnConnect !== null &&
				voiceState.channel_id &&
				voiceState.connection_id === VoiceConnectionManager.connectionId
			) {
				if (voiceState.suppress === this.pendingSuppressOnConnect) {
					this.pendingSuppressOnConnect = null;
					this.pendingSuppressSyncAttempts = 0;
				} else if (this.pendingSuppressSyncAttempts < 3) {
					this.pendingSuppressSyncAttempts += 1;
					this.syncLocalVoiceStateWithServer({
						suppress: this.pendingSuppressOnConnect,
						self_mute: this.pendingSuppressOnConnect ? true : undefined,
					});
				} else {
					this.pendingSuppressOnConnect = null;
					this.pendingSuppressSyncAttempts = 0;
				}
			}

			if (
				desiredSuppressFromPreferredRole !== null &&
				voiceState.channel_id &&
				voiceState.connection_id === VoiceConnectionManager.connectionId &&
				voiceState.suppress !== desiredSuppressFromPreferredRole &&
				this.pendingSuppressSyncAttempts < 10
			) {
				this.pendingSuppressSyncAttempts += 1;
				this.syncLocalVoiceStateWithServer({
					suppress: desiredSuppressFromPreferredRole,
					self_mute: desiredSuppressFromPreferredRole ? true : undefined,
				});
			} else if (
				desiredSuppressFromPreferredRole !== null &&
				voiceState.channel_id &&
				voiceState.connection_id === VoiceConnectionManager.connectionId &&
				voiceState.suppress === desiredSuppressFromPreferredRole
			) {
				this.pendingSuppressSyncAttempts = 0;
			}

			const serverPayload =
				voiceState.channel_id && voiceState.connection_id
					? {
							guild_id: guildId,
							channel_id: voiceState.channel_id,
							connection_id: voiceState.connection_id,
							self_mute: voiceState.self_mute,
							self_deaf: voiceState.self_deaf,
							self_video: voiceState.self_video,
							self_stream: voiceState.self_stream,
							viewer_stream_key: voiceState.viewer_stream_key ?? null,
							suppress: voiceState.suppress,
						}
					: null;
			this.voiceStateSync.confirmServerState(serverPayload);
			if (voiceState.channel_id === null && (VoiceConnectionManager.connected || VoiceConnectionManager.connecting)) {
				const currentUserId = UserStore.getCurrentUser()?.id ?? null;
				const currentConnectionId = VoiceConnectionManager.connectionId;
				const isCurrentUser = Boolean(currentUserId && voiceState.user_id === currentUserId);
				const isCurrentConnection =
					Boolean(voiceState.connection_id && voiceState.connection_id === currentConnectionId) ||
					(!voiceState.connection_id && !currentConnectionId);

				if (!isCurrentUser || !isCurrentConnection) {
					logger.debug('[handleGatewayVoiceStateUpdate] Ignoring stale voice disconnect', {
						voiceStateConnectionId: voiceState.connection_id,
						currentConnectionId,
						voiceStateUserId: voiceState.user_id,
						currentUserId,
					});
					return;
				}

				if (voiceState.move_channel_id) {
					this.scheduleServerDisconnectIfConnectionStaysStale(voiceState.connection_id);
				} else {
					void this.disconnectFromVoiceChannel('server');
				}
			}
		}
	}
	handleGatewayVoiceStateDelete(guildId: string, userId: string): void {
		VoiceStateManager.handleGatewayVoiceStateDelete(guildId, userId);
	}
	getCurrentUserVoiceState(guildId?: string | null): VoiceState | null {
		return VoiceStateManager.getCurrentUserVoiceState(
			guildId,
			UserStore.getCurrentUser()?.id,
			VoiceConnectionManager.connectionId,
		);
	}
	getVoiceState(guildId: string | null, userId?: string): VoiceState | null {
		return VoiceStateManager.getVoiceState(guildId, userId, UserStore.getCurrentUser()?.id);
	}
	getVoiceStateByConnectionId(connectionId: string): VoiceState | null {
		return VoiceStateManager.getVoiceStateByConnectionId(connectionId);
	}
	getAllVoiceStatesInChannel(guildId: string, channelId: string): Readonly<Record<string, VoiceState>> {
		return VoiceStateManager.getAllVoiceStatesInChannel(guildId, channelId);
	}
	getAllVoiceStates(): Readonly<Record<string, Readonly<Record<string, Readonly<Record<string, VoiceState>>>>>> {
		return VoiceStateManager.getAllVoiceStates();
	}

	isUserInAnyVoiceChannel(userId: string): boolean {
		return VoiceStateManager.isUserInAnyVoiceChannel(userId);
	}

	syncLocalVoiceStateWithServer(partial?: {
		self_video?: boolean;
		self_stream?: boolean;
		self_mute?: boolean;
		self_deaf?: boolean;
		viewer_stream_key?: string | null;
		suppress?: boolean;
	}): void {
		LocalVoiceStateStore.ensurePermissionMute();
		const {guildId, channelId, connectionId} = VoiceConnectionManager.connectionState;
		if (!channelId || !connectionId) return;

		const devicePermission = VoiceDevicePermissionStore.getState().permissionStatus;
		const micGranted = MediaPermissionStore.isMicrophoneGranted() || devicePermission === 'granted';
		const channel = ChannelStore.getChannel(channelId);
		const forcedSuppressFromPreferredRole =
			channel && this.isVoiceChannelStageLike(channelId) && this.preferredBroadcastRole
				? this.preferredBroadcastRole === 'listener'
				: null;
		const suppress =
			forcedSuppressFromPreferredRole ?? partial?.suppress ?? this.getVoiceStateByConnectionId(connectionId)?.suppress;
		const selfMuteValue =
			suppress === true
				? true
				: micGranted && partial?.self_mute !== undefined
					? partial.self_mute
					: micGranted
						? LocalVoiceStateStore.getSelfMute()
						: true;
		const selfVideoValue = suppress === true ? false : (partial?.self_video ?? LocalVoiceStateStore.getSelfVideo());
		const selfStreamValue = suppress === true ? false : (partial?.self_stream ?? LocalVoiceStateStore.getSelfStream());

		const payload: VoiceStateSyncPayload = {
			guild_id: guildId,
			channel_id: channelId,
			connection_id: connectionId,
			self_mute: selfMuteValue,
			self_deaf: partial?.self_deaf ?? LocalVoiceStateStore.getSelfDeaf(),
			self_video: selfVideoValue,
			self_stream: selfStreamValue,
			viewer_stream_key: partial?.viewer_stream_key ?? LocalVoiceStateStore.getViewerStreamKey(),
			suppress,
		};

		if (!micGranted && !LocalVoiceStateStore.getSelfMute()) {
			LocalVoiceStateStore.updateSelfMute(true);
		}
		if (suppress === true) {
			if (!LocalVoiceStateStore.getSelfMute()) {
				LocalVoiceStateStore.updateSelfMute(true);
			}
			if (LocalVoiceStateStore.getSelfVideo()) {
				LocalVoiceStateStore.updateSelfVideo(false);
			}
			if (LocalVoiceStateStore.getSelfStream()) {
				LocalVoiceStateStore.updateSelfStream(false);
			}
		}

		this.voiceStateSync.requestState(payload);
	}

	getParticipantByUserIdAndConnectionId(
		userId: string,
		connectionId: string | null,
	): LivekitParticipantSnapshot | undefined {
		return VoiceParticipantManager.getParticipantByUserIdAndConnectionId(userId, connectionId);
	}
	upsertParticipant(participant: Participant): void {
		VoiceParticipantManager.upsertParticipant(participant);
	}

	async setCameraEnabled(enabled: boolean, options?: {deviceId?: string; sendUpdate?: boolean}): Promise<void> {
		if (enabled && this.isCurrentUserStageListener()) {
			return;
		}
		await VoiceMediaManager.setCameraEnabled(enabled, options);
	}
	async setScreenShareEnabled(
		enabled: boolean,
		options?: ScreenShareCaptureOptions & {sendUpdate?: boolean},
		publishOptions?: TrackPublishOptions,
	): Promise<void> {
		if (enabled && this.isCurrentUserStageListener()) {
			return;
		}
		await VoiceMediaManager.setScreenShareEnabled(enabled, options, publishOptions);

		// Start/stop preview uploader
		if (enabled) {
			const room = this.room;
			const channelId = this.channelId;
			const streamKey = LocalVoiceStateStore.getViewerStreamKey();
			if (room && channelId && streamKey) {
				screenSharePreviewUploader.start(streamKey, channelId, room);
			}
		} else {
			screenSharePreviewUploader.stop();
		}
	}
	applyLocalAudioPreferencesForUser(userId: string): void {
		VoiceMediaManager.applyLocalAudioPreferencesForUser(userId, this.room);
	}
	applyAllLocalAudioPreferences(): void {
		VoiceMediaManager.applyAllLocalAudioPreferences(this.room);
	}
	async applyLiveMicrophoneSettings(): Promise<void> {
		await VoiceMediaManager.applyLiveMicrophoneSettings(this.room);
	}
	setLocalVideoDisabled(identity: string, disabled: boolean): void {
		VoiceMediaManager.setLocalVideoDisabled(identity, disabled, this.room, this.connectionId);
	}
	applyPushToTalkHold(held: boolean): void {
		VoiceMediaManager.applyPushToTalkHold(held, this.room, () => this.getCurrentUserVoiceState());
	}
	handlePushToTalkModeChange(): void {
		VoiceMediaManager.handlePushToTalkModeChange(this.room, () => this.getCurrentUserVoiceState());
		VoiceActivityManager.refresh();
	}
	getMuteReason(voiceState: VoiceState | null): 'guild' | 'push_to_talk' | 'self' | null {
		return VoiceMediaManager.getMuteReason(voiceState);
	}

	setPreferredBroadcastRole(role: 'listener' | 'speaker' | null): void {
		this.preferredBroadcastRole = role;
	}

	isVoiceChannelStageLike(channelId?: string | null): boolean {
		const targetChannelId = channelId ?? VoiceConnectionManager.channelId;
		if (!targetChannelId) return false;

		const channel = ChannelStore.getChannel(targetChannelId);
		if (!channel || !this.isGuildRtcChannel(channel)) {
			return false;
		}

		if (channel && isBroadcastVoiceChannel(channel)) {
			return true;
		}

		const isCurrentConnection = VoiceConnectionManager.channelId === targetChannelId;
		if (isCurrentConnection && (this.preferredBroadcastRole !== null || this.pendingSuppressOnConnect !== null)) {
			return true;
		}

		const connectionId = isCurrentConnection ? VoiceConnectionManager.connectionId : null;
		if (connectionId) {
			const voiceState = VoiceStateManager.getVoiceStateByConnectionId(connectionId);
			if (voiceState?.suppress === true) {
				return true;
			}
		}

		const guildKey = channel.guildId ?? ME;
		const states = VoiceStateManager.getAllVoiceStatesInChannel(guildKey, targetChannelId);
		return Object.values(states).some((state) => state?.suppress === true);
	}

	async toggleCameraFromKeybind(): Promise<void> {
		if (this.isCurrentUserInBroadcastListenerMode()) {
			return;
		}
		await VoiceMediaManager.toggleCameraFromKeybind();
	}
	async toggleScreenShareFromKeybind(): Promise<void> {
		if (this.isCurrentUserInBroadcastListenerMode()) {
			return;
		}
		await VoiceMediaManager.toggleScreenShareFromKeybind();
	}

	isCurrentUserInBroadcastListenerMode(): boolean {
		const channelId = VoiceConnectionManager.channelId;
		if (!channelId) return false;
		const channel = ChannelStore.getChannel(channelId);
		if (!channel || !this.isGuildRtcChannel(channel)) {
			return false;
		}

		if (this.preferredBroadcastRole === 'listener') {
			return true;
		}

		const connectionId = VoiceConnectionManager.connectionId;
		if (!connectionId) {
			return this.pendingSuppressOnConnect === true;
		}

		const voiceState = VoiceStateManager.getVoiceStateByConnectionId(connectionId);
		if (voiceState?.suppress === true) {
			return true;
		}

		return this.pendingSuppressOnConnect === true;
	}

	private isGuildRtcChannel(channel: {guildId?: string; type: number}): boolean {
		if (!channel.guildId) return false;
		return channel.type === ChannelTypes.GUILD_VOICE || channel.type === ChannelTypes.GUILD_STAGE;
	}

	private startTracking(roomOverride?: Room | null): void {
		const room = roomOverride ?? VoiceConnectionManager.room;
		if (!room) {
			logger.warn('[startTracking] No room available');
			return;
		}

		this.statsManager.setRoom(room);
		this.statsManager.startLatencyTracking();
		this.statsManager.startStatsTracking();
		VoiceSubscriptionManager.setRoom(room);
		VoicePermissionManager.initializeSubscriptions(room);
		this.startAfkTracking();
		VoiceActivityManager.refresh();
		const connectedChannelId = VoiceConnectionManager.channelId;
		if (connectedChannelId) {
			saveVoiceSession({guildId: VoiceConnectionManager.guildId, channelId: connectedChannelId});
		}
		logger.info('[startTracking] All tracking started');
	}

	private stopTracking(): void {
		this.statsManager.stopLatencyTracking();
		this.statsManager.stopStatsTracking();
		VoiceSubscriptionManager.cleanup();
		this.stopAfkTracking();
		VoiceActivityManager.stop();
		screenSharePreviewUploader.stop();
		logger.info('[stopTracking] All tracking stopped');
	}

	private scheduleServerDisconnectIfConnectionStaysStale(connectionId: string | undefined): void {
		this.clearPendingServerDisconnect();

		this.serverDisconnectTimeoutId = setTimeout(() => {
			this.serverDisconnectTimeoutId = null;
			if (
				connectionId &&
				VoiceConnectionManager.connectionId !== connectionId
			) {
				return;
			}
			if (VoiceConnectionManager.connected || VoiceConnectionManager.connecting) {
				void this.disconnectFromVoiceChannel('server');
			}
		}, 5000);
	}

	private clearPendingServerDisconnect(): void {
		if (this.serverDisconnectTimeoutId !== null) {
			clearTimeout(this.serverDisconnectTimeoutId);
			this.serverDisconnectTimeoutId = null;
		}
	}

	private startAfkTracking(): void {
		this.stopAfkTracking();
		this.afkIntervalId = setInterval(() => {
			if (!VoiceConnectionManager.connected || !VoiceConnectionManager.channelId) return;
			// Heartbeat so an ongoing call remains resumable across a page reload.
			touchVoiceSession();
			if (!VoiceConnectionManager.guildId) return;
			if (!IdleStore.isIdle()) return;
			const idleSince = IdleStore.getIdleSince();
			if (!idleSince) return;
			const guild = GuildStore.getGuild(VoiceConnectionManager.guildId);
			if (!guild?.afkChannelId || !guild.afkTimeout) return;
			if (VoiceConnectionManager.channelId === guild.afkChannelId) return;
			if (Math.floor((Date.now() - idleSince) / 1000) >= guild.afkTimeout) {
				void this.moveToAfkChannel();
			}
		}, AFK_CHECK_INTERVAL_MS);
	}

	private stopAfkTracking(): void {
		if (this.afkIntervalId !== null) {
			clearInterval(this.afkIntervalId);
			this.afkIntervalId = null;
		}
	}

	async moveToAfkChannel(): Promise<void> {
		const {guildId, channelId, connected} = VoiceConnectionManager.connectionState;
		if (!connected || !guildId || !channelId) return;
		const guild = GuildStore.getGuild(guildId);
		if (!guild?.afkChannelId || channelId === guild.afkChannelId) return;
		SoundActionCreators.playSound(SoundType.UserMove);
		await this.connectToVoiceChannel(guildId, guild.afkChannelId);
	}

	getLastConnectedChannel(): {guildId: string | null; channelId: string} | null {
		return VoiceConnectionManager.lastConnectedChannel;
	}
	getShouldReconnect(): boolean {
		return VoiceConnectionManager.shouldAutoReconnect;
	}
	get reconnectAttempts(): number {
		return VoiceConnectionManager.reconnectAttempts;
	}
	get reconnecting(): boolean {
		return VoiceConnectionManager.reconnecting;
	}
	markReconnectionAttempted(): void {
		VoiceConnectionManager.markReconnectionAttempted();
	}

	handleLogout(): void {
		clearVoiceSession();
		this.clearPendingServerDisconnect();
		this.stopTracking();
		VoiceConnectionManager.cleanup();
		VoiceStateManager.clearAllVoiceStates();
		VoiceParticipantManager.clear();
		VoicePermissionManager.reset();
		VoiceMediaManager.resetStreamTracking();
		LocalVoiceStateStore.updateSelfVideo(false);
		LocalVoiceStateStore.updateSelfStream(false);
		this.voiceStateSync.reset();
		this.preferredBroadcastRole = null;
		this.pendingSuppressOnConnect = null;
		this.pendingSuppressSyncAttempts = 0;
		voiceStatsDB.clear().catch(() => {});
		logger.info('[handleLogout] Cleanup complete');
	}

	handleGatewayError(error: GatewayErrorData): void {
		const voiceErrorCodes = new Set<GatewayErrorCode>([
			GatewayErrorCodes.VOICE_CONNECTION_NOT_FOUND,
			GatewayErrorCodes.VOICE_CHANNEL_NOT_FOUND,
			GatewayErrorCodes.VOICE_INVALID_CHANNEL_TYPE,
			GatewayErrorCodes.VOICE_MEMBER_NOT_FOUND,
			GatewayErrorCodes.VOICE_MEMBER_TIMED_OUT,
			GatewayErrorCodes.VOICE_USER_NOT_IN_VOICE,
			GatewayErrorCodes.VOICE_GUILD_NOT_FOUND,
			GatewayErrorCodes.VOICE_PERMISSION_DENIED,
			GatewayErrorCodes.VOICE_CHANNEL_FULL,
			GatewayErrorCodes.VOICE_MISSING_CONNECTION_ID,
			GatewayErrorCodes.VOICE_TOKEN_FAILED,
			GatewayErrorCodes.VOICE_UNCLAIMED_ACCOUNT,
		]);

		if (!voiceErrorCodes.has(error.code)) {
			return;
		}

		logger.warn(`Voice-related gateway error: [${error.code}] ${error.message}`);

		if (error.code === GatewayErrorCodes.VOICE_CONNECTION_NOT_FOUND) {
			if (VoiceConnectionManager.connecting) {
				logger.info('[handleGatewayError] Connection not found while connecting, aborting');
				VoiceConnectionManager.abortConnection();
			}
		} else if (
			error.code === GatewayErrorCodes.VOICE_PERMISSION_DENIED ||
			error.code === GatewayErrorCodes.VOICE_CHANNEL_FULL ||
			error.code === GatewayErrorCodes.VOICE_MEMBER_TIMED_OUT ||
			error.code === GatewayErrorCodes.VOICE_UNCLAIMED_ACCOUNT
		) {
			if (VoiceConnectionManager.connecting && !VoiceConnectionManager.connected) {
				logger.info('[handleGatewayError] Permission denied, channel full, or timeout while connecting, aborting');
				VoiceConnectionManager.abortConnection();
			}
			if (this.i18n) {
				const messages: Partial<Record<GatewayErrorCode, string>> = {
					[GatewayErrorCodes.VOICE_MEMBER_TIMED_OUT]: this.i18n._(msg`You can't join while you're on timeout.`),
					[GatewayErrorCodes.VOICE_UNCLAIMED_ACCOUNT]: this.i18n._(msg`Claim your account to join this voice channel.`),
					[GatewayErrorCodes.VOICE_PERMISSION_DENIED]: this.i18n._(msg`You don't have permission to join this voice channel.`),
					[GatewayErrorCodes.VOICE_CHANNEL_FULL]: this.i18n._(msg`This voice channel is full.`),
				};
				const message = messages[error.code];
				if (message) {
					ToastActionCreators.createToast({type: 'error', children: message});
				}
			}
		} else if (error.code === GatewayErrorCodes.VOICE_TOKEN_FAILED) {
			if (VoiceConnectionManager.connecting) {
				logger.info('[handleGatewayError] Token failed while connecting, aborting');
				VoiceConnectionManager.abortConnection();
			}
			if (this.i18n) {
				ToastActionCreators.createToast({
					type: 'error',
					children: this.i18n._(msg`Failed to connect to voice. Please try again.`),
				});
			}
		}
	}

	cleanup(): void {
		this.clearPendingServerDisconnect();
		this.stopTracking();
		this.statsManager.cleanup();
		VoiceSubscriptionManager.cleanup();
		VoicePermissionManager.reset();
		VoiceMediaManager.resetStreamTracking();
		VoiceConnectionManager.cleanup();
		VoiceStateManager.clearAllVoiceStates();
		VoiceParticipantManager.clear();
		this.voiceStateSync.reset();
		this.preferredBroadcastRole = null;
		this.pendingSuppressOnConnect = null;
		this.pendingSuppressSyncAttempts = 0;
	}

	private isCurrentUserStageListener(): boolean {
		return this.isCurrentUserInBroadcastListenerMode();
	}

	reset(): void {
		this.clearPendingServerDisconnect();
		this.statsManager.reset();
		VoiceConnectionManager.resetConnectionState();
		VoiceConnectionManager.resetReconnectState();
		VoicePermissionManager.reset();
		VoiceMediaManager.resetStreamTracking();
		VoiceParticipantManager.clear();
		this.voiceStateSync.reset();
		this.preferredBroadcastRole = null;
		this.pendingSuppressOnConnect = null;
		this.pendingSuppressSyncAttempts = 0;
	}
}

export type {LivekitParticipantSnapshot, VoiceStats, VoiceState, LatencyDataPoint};

const instance = new MediaEngineFacade();
(window as typeof window & {_mediaEngineFacade?: MediaEngineFacade})._mediaEngineFacade = instance;
export default instance;
