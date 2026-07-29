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

import type {ChannelID, GuildID, UserID} from '~/BrandedTypes';
import {ChannelTypes, isGuildRtcChannelType} from '~/Constants';
import type {IChannelRepository} from '~/channel/IChannelRepository';
import {
	FeatureTemporarilyDisabledError,
	MissingAccessError,
	UnclaimedAccountRestrictedError,
	UnknownChannelError,
	UnknownGuildMemberError,
	UnknownUserError,
} from '~/Errors';
import type {IGuildRepository} from '~/guild/IGuildRepository';
import type {LiveKitService} from '~/infrastructure/LiveKitService';
import {getMetricsService} from '~/infrastructure/MetricsService';
import type {TurnService, IceServer} from '~/infrastructure/TurnService';
import type {VoiceRoomStore} from '~/infrastructure/VoiceRoomStore';
import {Logger} from '~/Logger';
import type {IUserRepository} from '~/user/IUserRepository';
import {calculateDistance} from '~/utils/GeoUtils';
import type {VoiceAccessContext, VoiceAvailabilityService} from '~/voice/VoiceAvailabilityService';
import type {VoiceRegionAvailability, VoiceServerRecord} from '~/voice/VoiceModel';
import {generateConnectionId} from '~/words/words';

interface GetVoiceTokenParams {
	guildId?: GuildID;
	channelId: ChannelID;
	userId: UserID;
	connectionId?: string;
	latitude?: string;
	longitude?: string;
	ip?: string;
	canSpeak?: boolean;
	canStream?: boolean;
	canVideo?: boolean;
}

interface VoicePermissions {
	canSpeak: boolean;
	canStream: boolean;
	canVideo: boolean;
}

interface UpdateVoiceStateParams {
	guildId?: GuildID;
	channelId: ChannelID;
	userId: UserID;
	connectionId: string;
	mute?: boolean;
	deaf?: boolean;
}

export class VoiceService {
	/**
	 * In-process lookup: (userId, channelId) → active LiveKit connectionId.
	 * Populated at token-issue time, consulted by updateParticipant /
	 * disconnectParticipant before they fall back to listParticipants.
	 * Static so it survives per-request scoping — voice is a process-
	 * wide concern, and the gateway re-primes this via getVoiceToken
	 * every time a session starts anyway.
	 */
	private static connectionIdCache = new Map<string, {connectionId: string; expiresAt: number}>();

	constructor(
		private liveKitService: LiveKitService,
		private guildRepository: IGuildRepository,
		private userRepository: IUserRepository,
		private channelRepository: IChannelRepository,
		private voiceRoomStore: VoiceRoomStore,
		private voiceAvailabilityService: VoiceAvailabilityService,
		private turnService?: TurnService,
	) {}

	private findClosestRegion(
		latitude: string,
		longitude: string,
		accessibleRegions: Array<{id: string; latitude: number; longitude: number}>,
	): string | null {
		const userLat = parseFloat(latitude);
		const userLon = parseFloat(longitude);

		if (Number.isNaN(userLat) || Number.isNaN(userLon)) {
			return null;
		}

		let closestRegion: string | null = null;
		let minDistance = Number.POSITIVE_INFINITY;

		for (const region of accessibleRegions) {
			const distance = calculateDistance(userLat, userLon, region.latitude, region.longitude);
			if (distance < minDistance) {
				minDistance = distance;
				closestRegion = region.id;
			}
		}

		return closestRegion;
	}

	async getVoiceToken(params: GetVoiceTokenParams): Promise<{
		token: string;
		endpoint: string;
		connectionId: string;
		iceServers?: Array<IceServer>;
	}> {
		const {guildId, channelId, userId, connectionId: providedConnectionId, ip} = params;

		const user = await this.userRepository.findUnique(userId);
		if (!user) {
			getMetricsService().counter({
				name: 'voice_token_issued_total',
				dimensions: {result: 'fail', reason: 'unknown_user'},
			});
			throw new UnknownUserError();
		}

		const channel = await this.channelRepository.findUnique(channelId);
		if (!channel) {
			getMetricsService().counter({
				name: 'voice_token_issued_total',
				dimensions: {result: 'fail', reason: 'unknown_channel'},
			});
			throw new UnknownChannelError();
		}

		// Auth: private 1:1 and group DMs must only issue tokens to their
		// own recipients. Without this check any authenticated user could
		// request a token for someone else's DM channel by id — the gateway
		// historically relied on its own permission check before calling
		// RPC, but that's a trust boundary we shouldn't assume.
		if (channel.type === ChannelTypes.DM || channel.type === ChannelTypes.GROUP_DM) {
			if (!channel.recipientIds.has(userId)) {
				Logger.warn(
					{userId: userId.toString(), channelId: channelId.toString(), channelType: channel.type},
					'voice_get_token: non-recipient attempted to join DM',
				);
				getMetricsService().counter({
					name: 'voice_token_issued_total',
					dimensions: {result: 'fail', reason: 'dm_forbidden'},
				});
				throw new MissingAccessError();
			}
		}

		const isUnclaimed = user.isUnclaimedAccount();
		if (isUnclaimed) {
			if (channel.type === ChannelTypes.DM) {
				throw new UnclaimedAccountRestrictedError('join 1:1 voice calls');
			}

			if (isGuildRtcChannelType(channel.type)) {
				const guild = guildId ? await this.guildRepository.findUnique(guildId) : null;
				const isOwner = guild?.ownerId === userId;
				if (!isOwner) {
					throw new UnclaimedAccountRestrictedError('join voice channels you do not own');
				}
			}
		}

		let mute = false;
		let deaf = false;

		let guildFeatures: Set<string> | undefined;

		const voicePermissions: VoicePermissions = {
			canSpeak: params.canSpeak ?? true,
			canStream: params.canStream ?? true,
			canVideo: params.canVideo ?? true,
		};

		if (guildId !== undefined) {
			const member = await this.guildRepository.getMember(guildId, userId);
			if (!member) {
				throw new UnknownGuildMemberError();
			}
			mute = member.isMute;
			deaf = member.isDeaf;

			const guild = await this.guildRepository.findUnique(guildId);
			if (guild) {
				guildFeatures = guild.features;
			}
		}

		const context: VoiceAccessContext = {
			requestingUserId: userId,
			guildId,
			guildFeatures,
		};

		const availableRegions = this.voiceAvailabilityService.getAvailableRegions(context);
		const accessibleRegions = availableRegions.filter((region) => region.isAccessible);
		const defaultRegionId = this.liveKitService.getDefaultRegionId();
		const regionPreference = this.determineRegionPreference({
			channelRtcRegion: channel.rtcRegion,
			accessibleRegions,
			availableRegions,
			defaultRegionId,
		});

		let regionId: string | null = null;
		let serverId: string | null = null;
		let serverEndpoint: string | null = null;

		const pinnedServer = await this.voiceRoomStore.getPinnedRoomServer(guildId, channelId);
		const resolvedPinnedServer = await this.resolvePinnedServer({
			pinnedServer,
			guildId,
			channelId,
			context,
		});

		if (resolvedPinnedServer) {
			regionId = resolvedPinnedServer.regionId;
			serverId = resolvedPinnedServer.serverId;
			serverEndpoint = resolvedPinnedServer.endpoint;
		}

		if (!serverId) {
			const coordinates =
				regionPreference.mode === 'automatic' && params.latitude && params.longitude
					? {latitude: params.latitude, longitude: params.longitude}
					: null;
			regionId = this.chooseRegionId({
				preferredRegionId: regionPreference.regionId,
				accessibleRegions,
				availableRegions,
				coordinates,
			});

			if (!regionId) {
				throw new FeatureTemporarilyDisabledError();
			}

			const serverSelection = this.selectServerForRegion({
				regionId,
				context,
				accessibleRegions,
			});

			if (!serverSelection) {
				throw new FeatureTemporarilyDisabledError();
			}

			regionId = serverSelection.regionId;
			serverId = serverSelection.server.serverId;
			serverEndpoint = serverSelection.server.endpoint;

			await this.voiceRoomStore.pinRoomServer(guildId, channelId, regionId, serverId, serverEndpoint);
		}

		if (!serverId || !regionId || !serverEndpoint) {
			throw new FeatureTemporarilyDisabledError();
		}

		const serverRecord = this.liveKitService.getServer(regionId, serverId);
		if (!serverRecord) {
			throw new FeatureTemporarilyDisabledError();
		}

		const connectionId = providedConnectionId || generateConnectionId();

		// Kick any stale sessions this user still has in the target room
		// before we mint a fresh token. Happens on reconnect, tab-switch,
		// or quick channel-switch where the previous identity hasn't yet
		// timed out on the LiveKit side (DTLS keepalive is ~30–60 s). This
		// is what "призраки при переключении войса" boiled down to — the
		// participant list held the old connection id alongside the new
		// one until the old one eventually expired.
		try {
			const evicted = await this.liveKitService.evictStaleUserSessions({
				userId,
				guildId,
				channelId,
				regionId,
				serverId,
			});
			if (evicted > 0) {
				getMetricsService().counter({
					name: 'voice_ghosts_evicted_total',
					dimensions: {channel_type: String(channel.type)},
					value: evicted,
				});
			}
		} catch (error) {
			// Non-fatal — a failed eviction means the user may briefly see
			// themselves twice, but the fresh token still works.
			Logger.warn(
				{error, userId: userId.toString(), channelId: channelId.toString()},
				'voice_get_token: stale-session eviction failed (continuing)',
			);
		}

		const {token, endpoint} = await this.liveKitService.createToken({
			userId,
			guildId,
			channelId,
			connectionId,
			regionId,
			serverId,
			mute,
			deaf,
			canSpeak: voicePermissions.canSpeak,
			canStream: voicePermissions.canStream,
			canVideo: voicePermissions.canVideo,
		});

		// Prime the cache so subsequent updateParticipant calls skip the
		// listParticipants roundtrip on mute/deaf toggles.
		this.rememberConnectionId(userId, channelId, connectionId);

		getMetricsService().counter({
			name: 'voice_token_issued_total',
			dimensions: {result: 'ok', channel_type: String(channel.type), region: regionId},
		});

		Logger.info(
			{
				userId: userId.toString(),
				channelId: channelId.toString(),
				guildId: guildId?.toString(),
				regionId,
				serverId,
				channelType: channel.type,
				connectionId,
			},
			'voice_get_token: issued token',
		);

		if (mute || deaf) {
			this.liveKitService
				.updateParticipant({
					userId,
					guildId,
					channelId,
					connectionId,
					regionId,
					serverId,
					mute,
					deaf,
				})
				.catch((error) => {
					Logger.error(
						{error, userId: userId.toString(), channelId: channelId.toString()},
						'voice: failed to update LiveKit participant after token creation',
					);
				});
		}

		// Cloudflare TURN relay for users behind restrictive NATs/firewalls.
		// Gated by GeoIP on the server (excluded countries, e.g. RU, get no
		// iceServers). Fail-open: if TURN is disabled or credential
		// generation fails, iceServers is simply omitted and the client
		// falls back to LiveKit's default ICE. Run it after the token is
		// minted so a TURN failure never blocks the call.
		let iceServers: Array<IceServer> | undefined;
		if (this.turnService) {
			try {
				const servers = await this.turnService.getIceServersForUser(userId, ip);
				if (servers && servers.length > 0) {
					iceServers = servers;
				}
			} catch (error) {
				Logger.warn(
					{error, userId: userId.toString(), context: 'turn'},
					'voice_get_token: TURN credential generation failed (continuing without relay)',
				);
			}
		}

		return {token, endpoint, connectionId, ...(iceServers ? {iceServers} : {})};
	}

	private determineRegionPreference({
		channelRtcRegion,
		accessibleRegions,
		availableRegions,
		defaultRegionId,
	}: {
		channelRtcRegion: string | null;
		accessibleRegions: Array<VoiceRegionAvailability>;
		availableRegions: Array<VoiceRegionAvailability>;
		defaultRegionId: string | null;
	}): {regionId: string | null; mode: 'explicit' | 'automatic'} {
		const accessibleRegionIds = new Set(accessibleRegions.map((region) => region.id));

		if (channelRtcRegion) {
			if (accessibleRegionIds.has(channelRtcRegion)) {
				return {regionId: channelRtcRegion, mode: 'explicit'};
			}
			return {regionId: null, mode: 'automatic'};
		}

		if (defaultRegionId && accessibleRegionIds.has(defaultRegionId)) {
			return {regionId: defaultRegionId, mode: 'automatic'};
		}

		const fallbackRegion = accessibleRegions[0] ?? availableRegions[0] ?? null;
		return {regionId: fallbackRegion ? fallbackRegion.id : null, mode: 'automatic'};
	}

	private chooseRegionId({
		preferredRegionId,
		accessibleRegions,
		availableRegions,
		coordinates,
	}: {
		preferredRegionId: string | null;
		accessibleRegions: Array<VoiceRegionAvailability>;
		availableRegions: Array<VoiceRegionAvailability>;
		coordinates: {latitude: string; longitude: string} | null;
	}): string | null {
		if (coordinates && accessibleRegions.length > 0) {
			const closestRegionId = this.findClosestRegion(coordinates.latitude, coordinates.longitude, accessibleRegions);
			if (closestRegionId) {
				return closestRegionId;
			}
		}

		if (preferredRegionId) {
			return preferredRegionId;
		}

		const accessibleFallback = accessibleRegions[0];
		if (accessibleFallback) {
			return accessibleFallback.id;
		}

		return availableRegions[0]?.id ?? null;
	}

	private async resolvePinnedServer({
		pinnedServer,
		guildId,
		channelId,
		context,
	}: {
		pinnedServer: Awaited<ReturnType<VoiceRoomStore['getPinnedRoomServer']>>;
		guildId?: GuildID;
		channelId: ChannelID;
		context: VoiceAccessContext;
	}): Promise<{regionId: string; serverId: string; endpoint: string} | null> {
		if (!pinnedServer) {
			return null;
		}

		const serverRecord = this.liveKitService.getServer(pinnedServer.regionId, pinnedServer.serverId);
		if (serverRecord && this.voiceAvailabilityService.isServerAccessible(serverRecord, context)) {
			return {
				regionId: pinnedServer.regionId,
				serverId: pinnedServer.serverId,
				endpoint: serverRecord.endpoint,
			};
		}

		await this.voiceRoomStore.deleteRoomServer(guildId, channelId);
		return null;
	}

	private selectServerForRegion({
		regionId,
		context,
		accessibleRegions,
	}: {
		regionId: string;
		context: VoiceAccessContext;
		accessibleRegions: Array<VoiceRegionAvailability>;
	}): {
		regionId: string;
		server: VoiceServerRecord;
	} | null {
		const initialServer = this.voiceAvailabilityService.selectServer(regionId, context);
		if (initialServer) {
			return {regionId, server: initialServer};
		}

		const fallbackRegion = accessibleRegions.find((region) => region.id !== regionId);
		if (fallbackRegion) {
			const fallbackServer = this.voiceAvailabilityService.selectServer(fallbackRegion.id, context);
			if (fallbackServer) {
				return {
					regionId: fallbackRegion.id,
					server: fallbackServer,
				};
			}
		}

		return null;
	}

	async updateVoiceState(params: UpdateVoiceStateParams): Promise<void> {
		const {guildId, channelId, userId, connectionId, mute, deaf} = params;

		const pinnedServer = await this.voiceRoomStore.getPinnedRoomServer(guildId, channelId);
		if (!pinnedServer) {
			return;
		}

		await this.liveKitService.updateParticipant({
			userId,
			guildId,
			channelId,
			connectionId,
			regionId: pinnedServer.regionId,
			serverId: pinnedServer.serverId,
			mute,
			deaf,
		});
	}

	/**
	 * Defense-in-depth for private DMs. getVoiceToken also does this, but
	 * the mute/disconnect RPCs are invoked by the gateway without a
	 * channel-level permission check — so we keep the guard here too.
	 * Throws MissingAccessError if the target user is not a recipient of
	 * a DM / group-DM; no-op for guild voice (where channel-level perms
	 * are enforced upstream).
	 */
	private async assertDmAccess(channelId: ChannelID, userId: UserID): Promise<void> {
		const channel = await this.channelRepository.findUnique(channelId);
		if (!channel) return; // methods early-return on missing pinned server anyway
		if (channel.type !== ChannelTypes.DM && channel.type !== ChannelTypes.GROUP_DM) return;
		if (channel.recipientIds.has(userId)) return;
		Logger.warn(
			{userId: userId.toString(), channelId: channelId.toString(), channelType: channel.type},
			'voice: non-recipient DM mutation attempted',
		);
		throw new MissingAccessError();
	}

	/**
	 * Fast path for mute/deaf/permission toggles — getVoiceToken stores
	 * the connection id for each (userId, channelId) pair at issue time,
	 * so we don't need to roundtrip through LiveKit's listParticipants
	 * on every Ctrl+M the user presses. Cache is invalidated on token
	 * eviction and has a 10-minute TTL as a safety valve in case a leave
	 * event is ever lost.
	 */
	private cachedConnectionKey(userId: UserID, channelId: ChannelID): string {
		return `${userId}:${channelId}`;
	}

	private rememberConnectionId(userId: UserID, channelId: ChannelID, connectionId: string): void {
		VoiceService.connectionIdCache.set(this.cachedConnectionKey(userId, channelId), {
			connectionId,
			expiresAt: Date.now() + 10 * 60 * 1000,
		});
	}

	private recallConnectionId(userId: UserID, channelId: ChannelID): string | null {
		const key = this.cachedConnectionKey(userId, channelId);
		const entry = VoiceService.connectionIdCache.get(key);
		if (!entry) return null;
		if (entry.expiresAt <= Date.now()) {
			VoiceService.connectionIdCache.delete(key);
			return null;
		}
		return entry.connectionId;
	}

	private forgetConnectionId(userId: UserID, channelId: ChannelID): void {
		VoiceService.connectionIdCache.delete(this.cachedConnectionKey(userId, channelId));
	}

	async updateParticipant(params: {
		guildId?: GuildID;
		channelId: ChannelID;
		userId: UserID;
		mute: boolean;
		deaf: boolean;
	}): Promise<void> {
		const {guildId, channelId, userId, mute, deaf} = params;

		await this.assertDmAccess(channelId, userId);

		const pinnedServer = await this.voiceRoomStore.getPinnedRoomServer(guildId, channelId);
		if (!pinnedServer) {
			return;
		}

		// Fast path: we remembered the connection id when we issued the
		// token. Avoids a full roomServiceClient.listParticipants RPC on
		// every mute/deaf toggle — real win when a user spams Ctrl+M.
		const cachedConnectionId = this.recallConnectionId(userId, channelId);
		if (cachedConnectionId) {
			try {
				await this.liveKitService.updateParticipant({
					userId,
					guildId,
					channelId,
					connectionId: cachedConnectionId,
					regionId: pinnedServer.regionId,
					serverId: pinnedServer.serverId,
					mute,
					deaf,
				});
				getMetricsService().counter({
					name: 'voice_update_participant_total',
					dimensions: {path: 'cached'},
				});
				return;
			} catch (error) {
				// Drop the cache on miss — the connection id is stale
				// (user reconnected via a different flow) — fall through
				// to the list-participants path to find the fresh one.
				this.forgetConnectionId(userId, channelId);
				Logger.warn(
					{error, userId: userId.toString(), channelId: channelId.toString()},
					'voice: cached connection id stale, falling back to listParticipants',
				);
			}
		}

		const participants = await this.liveKitService.listParticipants({
			guildId,
			channelId,
			regionId: pinnedServer.regionId,
			serverId: pinnedServer.serverId,
		});

		for (const participant of participants) {
			const parts = participant.identity.split('_');
			if (parts.length >= 2 && parts[0] === 'user') {
				const participantUserIdStr = parts[1];
				if (participantUserIdStr === userId.toString()) {
					const connectionId = parts.slice(2).join('_');
					try {
						await this.liveKitService.updateParticipant({
							userId,
							guildId,
							channelId,
							connectionId,
							regionId: pinnedServer.regionId,
							serverId: pinnedServer.serverId,
							mute,
							deaf,
						});
						// Re-prime cache for subsequent toggles.
						this.rememberConnectionId(userId, channelId, connectionId);
						getMetricsService().counter({
							name: 'voice_update_participant_total',
							dimensions: {path: 'listed'},
						});
					} catch (error) {
						Logger.error(
							{error, identity: participant.identity, userId: userId.toString()},
							'voice: failed to update participant mute/deaf',
						);
					}
				}
			}
		}
	}

	async disconnectParticipant(params: {
		guildId?: GuildID;
		channelId: ChannelID;
		userId: UserID;
		connectionId: string;
	}): Promise<void> {
		const {guildId, channelId, userId, connectionId} = params;

		await this.assertDmAccess(channelId, userId);

		const pinnedServer = await this.voiceRoomStore.getPinnedRoomServer(guildId, channelId);
		if (!pinnedServer) {
			return;
		}

		await this.liveKitService.disconnectParticipant({
			userId,
			guildId,
			channelId,
			connectionId,
			regionId: pinnedServer.regionId,
			serverId: pinnedServer.serverId,
		});
		this.forgetConnectionId(userId, channelId);
	}

	async updateParticipantPermissions(params: {
		guildId?: GuildID;
		channelId: ChannelID;
		userId: UserID;
		connectionId: string;
		canSpeak: boolean;
		canStream: boolean;
		canVideo: boolean;
	}): Promise<void> {
		const {guildId, channelId, userId, connectionId, canSpeak, canStream, canVideo} = params;

		await this.assertDmAccess(channelId, userId);

		const pinnedServer = await this.voiceRoomStore.getPinnedRoomServer(guildId, channelId);
		if (!pinnedServer) {
			return;
		}

		await this.liveKitService.updateParticipantPermissions({
			userId,
			guildId,
			channelId,
			connectionId,
			regionId: pinnedServer.regionId,
			serverId: pinnedServer.serverId,
			canSpeak,
			canStream,
			canVideo,
		});
	}

	async disconnectChannel(params: {
		guildId?: GuildID;
		channelId: ChannelID;
	}): Promise<{success: boolean; disconnectedCount: number; message?: string}> {
		const {guildId, channelId} = params;

		const pinnedServer = await this.voiceRoomStore.getPinnedRoomServer(guildId, channelId);
		if (!pinnedServer) {
			return {
				success: false,
				disconnectedCount: 0,
				message: 'No active voice session found for this channel',
			};
		}

		try {
			const participants = await this.liveKitService.listParticipants({
				guildId,
				channelId,
				regionId: pinnedServer.regionId,
				serverId: pinnedServer.serverId,
			});

			let disconnectedCount = 0;

			for (const participant of participants) {
				try {
					const identityMatch = participant.identity.match(/^user_(\d+)_(.+)$/);
					if (identityMatch) {
						const [, userIdStr, connectionId] = identityMatch;
						const userId = BigInt(userIdStr) as UserID;

						await this.liveKitService.disconnectParticipant({
							userId,
							guildId,
							channelId,
							connectionId,
							regionId: pinnedServer.regionId,
							serverId: pinnedServer.serverId,
						});

						disconnectedCount++;
					}
				} catch (error) {
					Logger.error(
						{error, identity: participant.identity, channelId: channelId.toString()},
						'voice: failed to disconnect participant during channel clear',
					);
				}
			}

			return {
				success: true,
				disconnectedCount,
				message: `Successfully disconnected ${disconnectedCount} participant(s)`,
			};
		} catch (error) {
			Logger.error(
				{error, channelId: channelId.toString()},
				'voice: error disconnecting channel participants',
			);
			return {
				success: false,
				disconnectedCount: 0,
				message: 'Failed to retrieve participants from voice room',
			};
		}
	}
}
