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

import {AccessToken, RoomServiceClient, TrackSource, TrackType} from 'livekit-server-sdk';
import type {ChannelID, GuildID, UserID} from '~/BrandedTypes';
import {Config} from '~/Config';
import {Logger} from '~/Logger';
import type {VoiceRegionMetadata, VoiceServerRecord} from '~/voice/VoiceModel';
import type {VoiceTopology} from '~/voice/VoiceTopology';
import {ILiveKitService} from './ILiveKitService';

interface CreateTokenParams {
	userId: UserID;
	guildId?: GuildID;
	channelId: ChannelID;
	connectionId: string;
	regionId: string;
	serverId: string;
	mute?: boolean;
	deaf?: boolean;
	canSpeak?: boolean;
	canStream?: boolean;
	canVideo?: boolean;
}

interface UpdateParticipantParams {
	userId: UserID;
	guildId?: GuildID;
	channelId: ChannelID;
	connectionId: string;
	regionId: string;
	serverId: string;
	mute?: boolean;
	deaf?: boolean;
}

interface DisconnectParticipantParams {
	userId: UserID;
	guildId?: GuildID;
	channelId: ChannelID;
	connectionId: string;
	regionId: string;
	serverId: string;
}

interface UpdateParticipantPermissionsParams {
	userId: UserID;
	guildId?: GuildID;
	channelId: ChannelID;
	connectionId: string;
	regionId: string;
	serverId: string;
	canSpeak: boolean;
	canStream: boolean;
	canVideo: boolean;
}

interface ServerClientConfig {
	endpoint: string;
	apiKey: string;
	apiSecret: string;
	roomServiceClient: RoomServiceClient;
}

const LEGACY_VOICE_HOST_SUFFIX = '.asrtal.ru';

export class LiveKitService extends ILiveKitService {
	private serverClients: Map<string, Map<string, ServerClientConfig>> = new Map();
	private topology: VoiceTopology;
	private static readonly DEFAULT_PUBLISH_SOURCES = [
		TrackSource.CAMERA,
		TrackSource.MICROPHONE,
		TrackSource.SCREEN_SHARE,
		TrackSource.SCREEN_SHARE_AUDIO,
	];

	constructor(topology: VoiceTopology) {
		super();

		if (!Config.voice.enabled) {
			throw new Error('Voice is not enabled. Set VOICE_ENABLED=true to use voice features.');
		}

		this.topology = topology;
		this.refreshServerClients();
		this.topology.registerSubscriber(() => {
			try {
				this.refreshServerClients();
			} catch (error) {
				Logger.error({error}, 'Failed to refresh LiveKit server clients after topology update');
			}
		});
	}

	async createToken(params: CreateTokenParams): Promise<{token: string; endpoint: string}> {
		const {
			userId,
			guildId,
			channelId,
			connectionId,
			regionId,
			serverId,
			deaf = false,
			canSpeak = true,
			canStream = true,
			canVideo = true,
		} = params;
		const server = this.resolveServerClient(regionId, serverId);
		const roomName = this.getRoomName(guildId, channelId);
		const participantIdentity = this.getParticipantIdentity(userId, connectionId);

		const metadata: Record<string, string> = {
			user_id: userId.toString(),
			channel_id: channelId.toString(),
			connection_id: connectionId,
			region_id: regionId,
			server_id: serverId,
		};

		if (guildId !== undefined) {
			metadata.guild_id = guildId.toString();
		} else {
			metadata.dm_call = 'true';
		}

		const canPublishSources = LiveKitService.computePublishSources({canSpeak, canStream, canVideo});

		const accessToken = new AccessToken(server.apiKey, server.apiSecret, {
			identity: participantIdentity,
			metadata: JSON.stringify(metadata),
		});

		accessToken.addGrant({
			roomJoin: true,
			room: roomName,
			canPublish: !deaf && canPublishSources.length > 0,
			canSubscribe: !deaf,
			canPublishSources,
		});

		const token = await accessToken.toJwt();
		return {token, endpoint: server.endpoint};
	}

	private static computePublishSources(permissions: {
		canSpeak: boolean;
		canStream: boolean;
		canVideo: boolean;
	}): Array<TrackSource> {
		const sources: Array<TrackSource> = [];

		if (permissions.canSpeak) {
			sources.push(TrackSource.MICROPHONE);
		}

		if (permissions.canVideo) {
			sources.push(TrackSource.CAMERA);
		}

		if (permissions.canStream) {
			sources.push(TrackSource.SCREEN_SHARE);
			sources.push(TrackSource.SCREEN_SHARE_AUDIO);
		}

		return sources;
	}

	async updateParticipant(params: UpdateParticipantParams): Promise<void> {
		const {userId, guildId, channelId, connectionId, regionId, serverId, mute, deaf} = params;
		const roomName = this.getRoomName(guildId, channelId);
		const participantIdentity = this.getParticipantIdentity(userId, connectionId);
		const server = this.resolveServerClient(regionId, serverId);

		try {
			const participants = await server.roomServiceClient.listParticipants(roomName);
			const participant = participants.find((p) => p.identity === participantIdentity);

			if (!participant) {
				throw new Error(`LiveKit participant not found: ${participantIdentity}`);
			}

			if (mute !== undefined && participant.tracks) {
				for (const track of participant.tracks) {
					if (track.type === TrackType.AUDIO) {
						await server.roomServiceClient.mutePublishedTrack(roomName, participantIdentity, track.sid!, mute);
					}
				}
			}

			if (deaf !== undefined) {
				await server.roomServiceClient.updateParticipant(roomName, participantIdentity, undefined, {
					canPublish: !deaf,
					canSubscribe: !deaf,
					canPublishSources: LiveKitService.DEFAULT_PUBLISH_SOURCES,
				});
			}
		} catch (error) {
			Logger.error({error}, 'Error updating LiveKit participant');
			throw error;
		}
	}

	async updateParticipantPermissions(params: UpdateParticipantPermissionsParams): Promise<void> {
		const {userId, guildId, channelId, connectionId, regionId, serverId, canSpeak, canStream, canVideo} = params;
		const roomName = this.getRoomName(guildId, channelId);
		const participantIdentity = this.getParticipantIdentity(userId, connectionId);
		const server = this.resolveServerClient(regionId, serverId);

		try {
			const participants = await server.roomServiceClient.listParticipants(roomName);
			const participant = participants.find((p) => p.identity === participantIdentity);

			if (!participant) {
				Logger.warn({participantIdentity, roomName}, 'Participant not found for permission update');
				return;
			}

			const canPublishSources = LiveKitService.computePublishSources({canSpeak, canStream, canVideo});

			await server.roomServiceClient.updateParticipant(roomName, participantIdentity, undefined, {
				canPublish: canPublishSources.length > 0,
				canPublishSources,
			});

			if (!canStream && participant.tracks) {
				for (const track of participant.tracks) {
					if (track.source === TrackSource.SCREEN_SHARE || track.source === TrackSource.SCREEN_SHARE_AUDIO) {
						await server.roomServiceClient.mutePublishedTrack(roomName, participantIdentity, track.sid!, true);
					}
				}
			}

			if (!canSpeak && participant.tracks) {
				for (const track of participant.tracks) {
					if (track.source === TrackSource.MICROPHONE) {
						await server.roomServiceClient.mutePublishedTrack(roomName, participantIdentity, track.sid!, true);
					}
				}
			}

			if (!canVideo && participant.tracks) {
				for (const track of participant.tracks) {
					if (track.source === TrackSource.CAMERA) {
						await server.roomServiceClient.mutePublishedTrack(roomName, participantIdentity, track.sid!, true);
					}
				}
			}

			Logger.info({participantIdentity, roomName, canSpeak, canStream, canVideo}, 'Updated participant permissions');
		} catch (error) {
			Logger.error({error}, 'Error updating LiveKit participant permissions');
		}
	}

	async disconnectParticipant(params: DisconnectParticipantParams): Promise<void> {
		const {userId, guildId, channelId, connectionId, regionId, serverId} = params;
		const roomName = this.getRoomName(guildId, channelId);
		const participantIdentity = this.getParticipantIdentity(userId, connectionId);
		const server = this.resolveServerClient(regionId, serverId);

		try {
			await server.roomServiceClient.removeParticipant(roomName, participantIdentity);
		} catch (error) {
			if (error instanceof Error && 'status' in error && (error as {status: number}).status === 404) {
				Logger.debug({participantIdentity, roomName}, 'LiveKit participant already disconnected');
				return;
			}
			Logger.error({error}, 'Error disconnecting LiveKit participant');
		}
	}

	/**
	 * Evicts every participant whose identity starts with `user_${userId}_`
	 * from the target room — regardless of connection id. Called right
	 * before `createToken()` so a stale session from a previous reconnect,
	 * tab close, or channel-switch doesn't linger as a ghost tile next to
	 * the fresh session. LiveKit only times out dead DTLS after ~30–60 s,
	 * which is what the "призраки при переключении войса" reports boiled
	 * down to. Returns the number of evicted sessions (for logging).
	 */
	async evictStaleUserSessions(params: {
		userId: UserID;
		guildId?: GuildID;
		channelId: ChannelID;
		regionId: string;
		serverId: string;
	}): Promise<number> {
		const {userId, guildId, channelId, regionId, serverId} = params;
		const roomName = this.getRoomName(guildId, channelId);
		const identityPrefix = `user_${userId}_`;
		const server = this.resolveServerClient(regionId, serverId);

		let participants: Array<{identity: string}>;
		try {
			const raw = await server.roomServiceClient.listParticipants(roomName);
			participants = raw.map((p) => ({identity: p.identity}));
		} catch (error) {
			if (error instanceof Error && 'status' in error && (error as {status: number}).status === 404) {
				return 0; // room doesn't exist yet — nothing to clean
			}
			Logger.warn({error, roomName, userId: userId.toString()}, 'evictStaleUserSessions: listParticipants failed');
			return 0;
		}

		const stale = participants.filter((p) => p.identity.startsWith(identityPrefix));
		if (stale.length === 0) return 0;

		let evicted = 0;
		await Promise.all(
			stale.map(async (p) => {
				try {
					await server.roomServiceClient.removeParticipant(roomName, p.identity);
					evicted += 1;
				} catch (error) {
					// 404 is fine — participant already gone between list and remove
					if (error instanceof Error && 'status' in error && (error as {status: number}).status === 404) {
						return;
					}
					Logger.warn(
						{error, identity: p.identity, roomName},
						'evictStaleUserSessions: removeParticipant failed',
					);
				}
			}),
		);

		if (evicted > 0) {
			Logger.info(
				{userId: userId.toString(), roomName, evicted},
				'evictStaleUserSessions: cleared ghost sessions before new token',
			);
		}
		return evicted;
	}

	async listParticipants(params: {
		guildId?: GuildID;
		channelId: ChannelID;
		regionId: string;
		serverId: string;
		throwOnError?: boolean;
	}): Promise<Array<{identity: string}>> {
		const {guildId, channelId, regionId, serverId, throwOnError = false} = params;
		const roomName = this.getRoomName(guildId, channelId);
		const server = this.resolveServerClient(regionId, serverId);

		try {
			const participants = await server.roomServiceClient.listParticipants(roomName);
			return participants.map((participant) => ({
				identity: participant.identity,
			}));
		} catch (error) {
			Logger.error({error}, 'Error listing LiveKit participants');
			if (throwOnError) {
				throw error;
			}
			return [];
		}
	}

	getDefaultRegionId(): string | null {
		return this.topology.getDefaultRegionId();
	}

	getRegionMetadata(): Array<VoiceRegionMetadata> {
		return this.topology.getRegionMetadataList();
	}

	getServer(regionId: string, serverId: string): VoiceServerRecord | null {
		const server = this.topology.getServer(regionId, serverId);
		if (!server) {
			return null;
		}

		return {
			...server,
			endpoint: this.normalizeServerEndpoint(server.endpoint),
		};
	}

	private getRoomName(guildId: GuildID | undefined, channelId: ChannelID): string {
		if (guildId === undefined) {
			return `dm_channel_${channelId}`;
		}
		return `guild_${guildId}_channel_${channelId}`;
	}

	private getParticipantIdentity(userId: UserID, connectionId: string): string {
		return `user_${userId}_${connectionId}`;
	}

	private resolveServerClient(regionId: string, serverId: string): ServerClientConfig {
		const region = this.serverClients.get(regionId);
		if (!region) {
			throw new Error(`Unknown LiveKit region: ${regionId}`);
		}

		const server = region.get(serverId);
		if (!server) {
			throw new Error(`Unknown LiveKit server: ${regionId}/${serverId}`);
		}

		return server;
	}

	private refreshServerClients(): void {
		const newMap: Map<string, Map<string, ServerClientConfig>> = new Map();
		const regions = this.topology.getAllRegions();

		for (const region of regions) {
			const servers = this.topology.getServersForRegion(region.id);
			const serverMap: Map<string, ServerClientConfig> = new Map();

			for (const server of servers) {
				const endpoint = this.normalizeServerEndpoint(server.endpoint);
				const internalEndpoint = this.resolveInternalEndpoint(endpoint);
				serverMap.set(server.serverId, {
					endpoint,
					apiKey: server.apiKey,
					apiSecret: server.apiSecret,
					roomServiceClient: new RoomServiceClient(internalEndpoint, server.apiKey, server.apiSecret),
				});
			}

			newMap.set(region.id, serverMap);
		}

		this.serverClients = newMap;
	}

	private normalizeServerEndpoint(endpoint: string): string {
		if (!Config.voice.url) {
			return endpoint;
		}

		try {
			const parsed = new URL(endpoint);
			const canonical = new URL(Config.voice.url);
			const hostname = parsed.hostname.trim().toLowerCase().replace(/\.+$/, '');

			if (hostname === 'asrtal.ru' || hostname.endsWith(LEGACY_VOICE_HOST_SUFFIX)) {
				parsed.protocol = canonical.protocol;
				parsed.hostname = canonical.hostname;
				parsed.port = canonical.port;
				parsed.pathname = canonical.pathname;
				parsed.search = canonical.search;
				parsed.hash = canonical.hash;
				return parsed.toString();
			}
		} catch (error) {
			Logger.warn({error, endpoint}, 'Failed to normalize LiveKit server endpoint');
		}

		return endpoint;
	}

	private resolveInternalEndpoint(publicEndpoint: string): string {
		const configured = Config.voice.internalUrl?.trim();
		if (configured) {
			return configured;
		}

		try {
			const parsed = new URL(publicEndpoint);
			if (parsed.protocol === 'wss:') {
				parsed.protocol = 'https:';
			} else if (parsed.protocol === 'ws:') {
				parsed.protocol = 'http:';
			}

			// The LiveKit server SDK calls Twirp endpoints from the origin
			// root (`/twirp/...`). Public browser endpoints may include a
			// reverse-proxy path such as `/livekit`, so keep RPCs on the
			// origin unless an explicit internal endpoint is configured.
			parsed.pathname = '';
			parsed.search = '';
			parsed.hash = '';
			return parsed.toString();
		} catch (error) {
			Logger.warn({error, publicEndpoint}, 'Failed to resolve LiveKit internal endpoint');
			return publicEndpoint;
		}
	}
}
