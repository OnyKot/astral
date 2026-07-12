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

import type {Room} from 'livekit-client';
import {Room as LiveKitRoom, RoomEvent} from 'livekit-client';
import {makeAutoObservable, runInAction} from 'mobx';
import type {Subscription} from 'rxjs';
import {timer} from 'rxjs';
import {Logger} from '~/lib/Logger';
import * as ToastActionCreators from '~/actions/ToastActionCreators';
import RuntimeConfigStore from '~/stores/RuntimeConfigStore';
import {normalizeHostname} from '~/utils/FirstPartyHosts';
import {isNativeMobile} from '~/utils/NativeUtils';
import {VoiceConnectionThrottle} from './VoiceConnectionThrottle';
import {VoiceReconnectManager} from './VoiceReconnectManager';

const logger = new Logger('VoiceConnectionManager');

const VOICE_SERVER_TIMEOUT_MS = 18000;
const LEGACY_VOICE_HOST_SUFFIX = '.asrtal.ru';
const CANONICAL_VOICE_HOST_SUFFIX = '.astraof.com';

export interface IceServer {
	urls: Array<string> | string;
	username?: string;
	credential?: string;
}

type NormalizedIceServer = {
	urls: Array<string>;
	username?: string;
	credential?: string;
};

export interface VoiceServerUpdateData {
	token: string;
	endpoint: string;
	connection_id: string;
	guild_id?: string;
	channel_id?: string;
	ice_servers?: Array<IceServer>;
}

export interface VoiceConnectionState {
	room: Room | null;
	guildId: string | null;
	channelId: string | null;
	connecting: boolean;
	connected: boolean;
	reconnecting: boolean;
	voiceServerEndpoint: string | null;
	connectionId: string | null;
}

const sanitizeIceServers = (servers?: Array<IceServer>): Array<NormalizedIceServer> | undefined => {
	if (!Array.isArray(servers)) return undefined;

	const normalized = servers
		.map((server) => {
			const rawUrls = typeof server.urls === 'string' ? [server.urls] : server.urls;
			const urls = Array.isArray(rawUrls)
				? rawUrls.map((url) => (typeof url === 'string' ? url.trim() : '')).filter(Boolean)
				: [];
			if (urls.length === 0) return null;

			return {
				urls,
				...(typeof server.username === 'string' && server.username.length > 0 ? {username: server.username} : {}),
				...(typeof server.credential === 'string' && server.credential.length > 0 ? {credential: server.credential} : {}),
			};
		})
		.filter((server): server is NormalizedIceServer => server !== null);

	return normalized.length > 0 ? normalized : undefined;
};

const initialConnectionState: VoiceConnectionState = {
	room: null,
	guildId: null,
	channelId: null,
	connecting: false,
	connected: false,
	reconnecting: false,
	voiceServerEndpoint: null,
	connectionId: null,
};

class VoiceConnectionManager {
	connectionState: VoiceConnectionState = initialConnectionState;
	private throttle = new VoiceConnectionThrottle();
	private reconnect = new VoiceReconnectManager();
	private autoReconnectHandler: (() => void) | null = null;
	private voiceServerTimeoutSub: Subscription | null = null;
	private isLocalDisconnecting = false;

	constructor() {
		makeAutoObservable(this, {}, {autoBind: true});
	}

	get room(): Room | null {
		return this.connectionState.room;
	}

	get guildId(): string | null {
		return this.connectionState.guildId;
	}

	get channelId(): string | null {
		return this.connectionState.channelId;
	}

	get connected(): boolean {
		return this.connectionState.connected;
	}

	get connecting(): boolean {
		return this.connectionState.connecting;
	}

	get reconnecting(): boolean {
		return this.connectionState.reconnecting;
	}

	get connectionId(): string | null {
		return this.connectionState.connectionId;
	}

	get voiceServerEndpoint(): string | null {
		return this.connectionState.voiceServerEndpoint;
	}

	get shouldAutoReconnect(): boolean {
		return this.reconnect.shouldAutoReconnect;
	}

	get reconnectAttempts(): number {
		return this.reconnect.reconnectAttempts;
	}

	get disconnecting(): boolean {
		return this.isLocalDisconnecting;
	}

	get lastConnectedChannel(): {guildId: string | null; channelId: string} | null {
		return this.reconnect.lastConnectedChannel;
	}

	setAutoReconnectHandler(handler: () => void): void {
		this.autoReconnectHandler = handler;
	}

	requestAutoReconnect(): void {
		if (!this.autoReconnectHandler) {
			return;
		}

		this.scheduleReconnect(() => {
			this.autoReconnectHandler?.();
		});
	}

	startConnection(guildId: string | null, channelId: string): void {
		if (this.throttle.shouldThrottle()) {
			logger.warn('Connection throttled');
			ToastActionCreators.createToast({
				type: 'info',
				children: 'Please wait before reconnecting to voice',
			});
			return;
		}

		this.throttle.recordConnectRequest();
		this.throttle.incrementAttemptId();

		runInAction(() => {
			this.connectionState = {
				...this.connectionState,
				channelId,
				guildId,
				connecting: true,
				connected: false,
				reconnecting: false,
				connectionId: this.connectionState.connectionId,
			};
		});

		this.throttle.setInFlightConnect(true);
		this.scheduleVoiceServerTimeout(guildId, channelId);
		this.reconnect.setLastConnectedChannel(guildId, channelId);

		logger.info('Connection started', {guildId, channelId});
	}

	handleVoiceServerUpdate(
		raw: VoiceServerUpdateData,
		onRoomCreated: (room: Room, attemptId: number, guildId: string | null, channelId: string) => void,
	): void {
		const guildId = raw.guild_id ?? null;
		const incomingChannelId = raw.channel_id ?? null;
		const endpoint = this.normalizeVoiceServerEndpoint(raw.endpoint ?? null);
		const token = raw.token ?? null;
		const connectionId = raw.connection_id ?? null;

		const {guildId: expectedGuildId, channelId, connected, room: existingRoom} = this.connectionState;
		const targetChannelId = incomingChannelId ?? channelId;
		const attemptId = this.throttle.connectAttemptId;

		logger.debug('handleVoiceServerUpdate called', {
			incomingGuildId: guildId,
			incomingChannelId,
			expectedGuildId,
			channelId,
			rawEndpoint: raw.endpoint ?? null,
			endpoint,
			hasToken: !!token,
			connectionId,
			attemptId,
		});

		if (expectedGuildId !== guildId || targetChannelId == null) {
			logger.warn('Ignoring VOICE_SERVER_UPDATE: guild or channel mismatch', {
				expectedGuildId,
				incomingGuildId: guildId,
				channelId: targetChannelId,
			});
			return;
		}

		if (!this.throttle.isLatestAttempt(attemptId)) {
			logger.warn('Ignoring VOICE_SERVER_UPDATE: not latest attempt', {attemptId});
			return;
		}

		this.clearVoiceServerTimeout();

		if (connected && existingRoom) {
			existingRoom.removeAllListeners();
			if (existingRoom.state === 'connected') {
				existingRoom.disconnect();
			}
		}

		runInAction(() => {
			this.connectionState = {
				...this.connectionState,
				connecting: true,
				connected: false,
				reconnecting: false,
				guildId,
				channelId: targetChannelId,
				voiceServerEndpoint: endpoint,
				connectionId: connectionId ?? this.connectionState.connectionId,
			};
		});

		this.throttle.setInFlightConnect(true);

		// Tune LiveKit Room for stability:
		//   - adaptiveStream / dynacast: bandwidth-aware video (default).
		//   - disconnectOnPageLeave: fires a clean disconnect when the user
		//     navigates away or closes the tab. Without this the server
		//     holds the session for ~60s and the user can't rejoin cleanly
		//     on reload — a common cause of "stuck in voice channel" bugs.
		//   - publishDefaults: explicit simulcast + DTX + RED so calls
		//     survive flaky networks (simulcast lets LiveKit drop layers
		//     per-subscriber, DTX suppresses silence frames, RED protects
		//     audio against packet loss).
		const room = new LiveKitRoom({
			adaptiveStream: true,
			dynacast: true,
			disconnectOnPageLeave: !isNativeMobile(),
			publishDefaults: {
				simulcast: true,
				dtx: true,
				red: true,
			},
		});

		onRoomCreated(room, attemptId, guildId, targetChannelId);

		if (!endpoint || !token) {
			logger.error('Missing endpoint or token', {endpoint, hasToken: !!token});
			runInAction(() => {
				this.connectionState = {
					...this.connectionState,
					connecting: false,
					reconnecting: false,
				};
			});
			this.throttle.setInFlightConnect(false);
			return;
		}

		logger.info('Attempting to connect to LiveKit', {endpoint, guildId, channelId});

		// Hard timeout on .connect(): if LiveKit server is unreachable or ICE
		// is stuck in the middle, the promise can hang indefinitely. Race it
		// against a 20s timeout so the reconnect manager can kick in instead.
		const CONNECT_TIMEOUT_MS = 20000;
		// Backend-provided TURN/STUN relays. We sanitize before passing them to
		// WebRTC so a malformed payload cannot crash voice join on mobile.
		const iceServers = sanitizeIceServers(raw.ice_servers);
		const connectPromise = room.connect(endpoint, token, {
			autoSubscribe: false,
			// Accept slightly slow ICE before giving up. LiveKit default is
			// 15s; we bump it to 30s for tough networks (mobile LTE / VPN).
			peerConnectionTimeout: 30000,
			...(iceServers ? {rtcConfig: {iceServers}} : {}),
		});

		let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
		const timeoutPromise = new Promise<never>((_, reject) => {
			timeoutHandle = setTimeout(() => {
				reject(new Error(`LiveKit connect timed out after ${CONNECT_TIMEOUT_MS}ms`));
			}, CONNECT_TIMEOUT_MS);
		});

		Promise.race([connectPromise, timeoutPromise])
			.then(() => {
				if (timeoutHandle !== null) clearTimeout(timeoutHandle);
				logger.info('LiveKit connection succeeded');
				if (!this.throttle.isLatestAttempt(attemptId)) {
					logger.warn('Connection succeeded but attempt is stale, disconnecting');
					try {
						room.removeAllListeners();
						room.disconnect();
					} catch {}
					return;
				}
				logger.info('Initializing voice connection');
				runInAction(() => {
					this.connectionState = {
						...this.connectionState,
						room,
					};
				});
			})
			.catch((error: unknown) => {
				if (timeoutHandle !== null) clearTimeout(timeoutHandle);
				// Classify the failure so we can distinguish "retry makes
				// sense" (network, ICE) from "retry is useless" (auth, token).
				const message = error instanceof Error ? error.message : String(error);
				const code = error && typeof error === 'object' && 'code' in error ? (error as {code?: unknown}).code : undefined;
				const isTimeout = message.includes('timed out') || code === 'SignalTimeout';
				const isAuth = message.toLowerCase().includes('token') || code === 'InvalidToken';
				logger.error('LiveKit connection failed', {message, code, isTimeout, isAuth, endpoint});

				// Still try to tear down the half-open room so we don't leak
				// a zombie WebRTC peer connection on the next attempt.
				try {
					room.removeAllListeners();
					room.disconnect();
				} catch {}

				if (this.throttle.isLatestAttempt(attemptId)) {
					runInAction(() => {
						this.connectionState = {
							...this.connectionState,
							connecting: false,
							reconnecting: false,
						};
					});
					this.throttle.setInFlightConnect(false);
					this.reconnect.setReconnectState('error');
					this.requestAutoReconnect();
				}
			});
	}

	private normalizeVoiceServerEndpoint(endpoint: string | null): string | null {
		if (!endpoint || typeof window === 'undefined') {
			return endpoint;
		}

		try {
			const parsed = new URL(endpoint);
			const currentLocation = window.location;
			const isLocalHost = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';
			const hasPort = parsed.port.length > 0;
			const currentPort = currentLocation.port;
			const normalizedHost = normalizeHostname(parsed.hostname);
			const currentHost = normalizeHostname(currentLocation.hostname);
			const currentHostIsLoopback =
				currentHost === 'localhost' || currentHost === '127.0.0.1' || currentHost === '::1';

			if (normalizedHost === 'asrtal.ru' || normalizedHost.endsWith(LEGACY_VOICE_HOST_SUFFIX)) {
				const configuredWebAppEndpoint = RuntimeConfigStore.webAppEndpoint;
				const canonicalBase = configuredWebAppEndpoint ? new URL(configuredWebAppEndpoint) : null;
				const canonicalHost = canonicalBase
					? normalizeHostname(canonicalBase.hostname)
					: normalizeHostname(currentLocation.hostname);

				if (canonicalHost && canonicalHost !== 'localhost' && canonicalHost !== '127.0.0.1') {
					parsed.hostname =
						canonicalHost === 'astraof.com' || canonicalHost.endsWith(CANONICAL_VOICE_HOST_SUFFIX)
							? canonicalHost
							: normalizedHost.replace(LEGACY_VOICE_HOST_SUFFIX, CANONICAL_VOICE_HOST_SUFFIX);

					if (!parsed.port && canonicalBase?.port) {
						parsed.port = canonicalBase.port;
					}

					const normalized = parsed.toString();
					logger.info('Rewrote legacy voice endpoint to canonical host', {
						endpoint,
						normalized,
					});
					return normalized;
				}
			}

			if (isLocalHost && !currentHostIsLoopback) {
				parsed.hostname = currentLocation.hostname;

				if (!hasPort && currentPort) {
					parsed.port = currentPort;
				}

				parsed.protocol = currentLocation.protocol === 'https:' ? 'wss:' : 'ws:';
				const normalized = parsed.toString();
				logger.info('Rewrote local voice endpoint to current origin host', {
					endpoint,
					normalized,
				});
				return normalized;
			}

			if (isLocalHost && !hasPort && currentPort) {
				parsed.port = currentPort;
				const normalized = parsed.toString();
				logger.info('Normalized local voice endpoint with current origin port', {
					endpoint,
					normalized,
				});
				return normalized;
			}
		} catch (error) {
			logger.warn('Failed to parse voice endpoint', {endpoint, error});
		}

		return endpoint;
	}

	markConnected(): void {
		runInAction(() => {
			this.connectionState = {
				...this.connectionState,
				connected: true,
				connecting: false,
				reconnecting: false,
			};
		});
		this.throttle.setInFlightConnect(false);
		this.reconnect.resetOnConnection();
		logger.info('Connection established');
	}

	markDisconnected(reason: 'user' | 'error' | 'server' = 'user'): void {
		runInAction(() => {
			this.connectionState = {
				...initialConnectionState,
				connectionId: reason === 'user' ? null : this.connectionState.connectionId,
			};
		});
		this.throttle.setInFlightConnect(false);
		this.reconnect.setReconnectState(reason);
		logger.info('Connection terminated', {reason});
	}

	markReconnecting(): void {
		runInAction(() => {
			this.connectionState = {
				...this.connectionState,
				connecting: true,
				connected: false,
				reconnecting: true,
			};
		});
		logger.info('Connection reconnecting');
	}

	markReconnected(): void {
		runInAction(() => {
			this.connectionState = {
				...this.connectionState,
				connecting: false,
				connected: true,
				reconnecting: false,
			};
		});
		this.reconnect.resetOnConnection();
		logger.info('Connection reconnected');
	}

	disconnectFromVoiceChannel(reason: 'user' | 'error' | 'server' = 'user'): void {
		const {room} = this.connectionState;

		this.isLocalDisconnecting = reason === 'user';

		this.clearVoiceServerTimeout();

		if (room) {
			room.removeAllListeners();
			room.disconnect();
		}

		runInAction(() => {
			this.connectionState = {
				...initialConnectionState,
				connectionId: reason === 'user' ? null : this.connectionState.connectionId,
			};
		});

		this.reconnect.setReconnectState(reason);

		this.isLocalDisconnecting = false;
		logger.info('Disconnected from voice channel', {reason});
	}

	scheduleReconnect(callback: () => void): boolean {
		return this.reconnect.scheduleReconnect(callback);
	}

	markReconnectionAttempted(): void {
		this.reconnect.markAttempted();
	}

	resetReconnectState(): void {
		this.reconnect.reset();
	}

	updateChannelId(channelId: string): void {
		runInAction(() => {
			this.connectionState = {
				...this.connectionState,
				channelId,
				connected: false,
				connecting: true,
				reconnecting: false,
				room: null,
			};
		});
		logger.info('Channel updated', {channelId});
	}

	createGuardedHandler<T extends ReadonlyArray<unknown>>(
		attemptId: number,
		handler: (...args: T) => void,
	): (...args: T) => void {
		return (...args: T) => {
			if (!this.throttle.isLatestAttempt(attemptId)) {
				return;
			}
			handler(...args);
		};
	}

	bindConnectionEvents(
		room: Room,
		attemptId: number,
		handlers: {
			onConnected: () => void;
			onDisconnected: (reason?: unknown) => void;
			onReconnecting: () => void;
			onReconnected: () => void;
		},
	): void {
		room.on(
			RoomEvent.Connected,
			this.createGuardedHandler(attemptId, () => {
				logger.info('Room event: Connected');
				handlers.onConnected();
			}),
		);
		room.on(
			RoomEvent.Disconnected,
			this.createGuardedHandler(attemptId, (reason?: unknown) => {
				// Log WHY the room dropped so we can tell network vs kick vs
				// server shutdown apart. Without this, every drop looks the
				// same in the console and we can't diagnose flaky calls.
				logger.warn('Room event: Disconnected', {reason});
				handlers.onDisconnected(reason);
			}),
		);
		room.on(
			RoomEvent.Reconnecting,
			this.createGuardedHandler(attemptId, () => {
				logger.info('Room event: Reconnecting');
				handlers.onReconnecting();
			}),
		);
		room.on(
			RoomEvent.Reconnected,
			this.createGuardedHandler(attemptId, () => {
				logger.info('Room event: Reconnected');
				handlers.onReconnected();
			}),
		);
		// MediaDevicesError and SignalConnected/ConnectionStateChanged were
		// previously unbound — so mic permission failures and signaling-level
		// network errors just vanished into unhandled promise rejections.
		// Log them here so they show up in observability and so we have a
		// hook to surface a toast to the user later.
		room.on(
			RoomEvent.MediaDevicesError,
			this.createGuardedHandler(attemptId, (error: unknown) => {
				const message = error instanceof Error ? error.message : String(error);
				logger.error('Room event: MediaDevicesError', {message});
			}),
		);
		room.on(
			RoomEvent.ConnectionStateChanged,
			this.createGuardedHandler(attemptId, (state: unknown) => {
				logger.debug('Room event: ConnectionStateChanged', {state});
			}),
		);
	}

	resetConnectionState(): void {
		runInAction(() => {
			this.connectionState = initialConnectionState;
		});
		this.isLocalDisconnecting = false;
		this.throttle.setInFlightConnect(false);
	}

	clearInFlightConnect(): void {
		this.throttle.setInFlightConnect(false);
	}

	abortConnection(): void {
		this.clearVoiceServerTimeout();

		const {room} = this.connectionState;
		if (room) {
			try {
				room.removeAllListeners();
				room.disconnect();
			} catch {}
		}

		runInAction(() => {
			this.connectionState = {
				...initialConnectionState,
				connectionId: null,
			};
		});

		this.isLocalDisconnecting = false;
		this.throttle.setInFlightConnect(false);
		logger.info('Connection aborted due to gateway error');
	}

	private scheduleVoiceServerTimeout(guildId: string | null, channelId: string): void {
		this.clearVoiceServerTimeout();
		this.voiceServerTimeoutSub = timer(VOICE_SERVER_TIMEOUT_MS).subscribe(() => {
			runInAction(() => {
				if (
					this.connectionState.guildId === guildId &&
					this.connectionState.channelId === channelId &&
					!this.connectionState.connected
				) {
					logger.warn('Voice server timeout', {guildId, channelId});
					this.connectionState = {
						...this.connectionState,
						connecting: false,
						connected: false,
						reconnecting: false,
					};
					this.throttle.setInFlightConnect(false);
					this.reconnect.setReconnectState('error');
					this.requestAutoReconnect();
				}
			});
		});
	}

	private clearVoiceServerTimeout(): void {
		this.voiceServerTimeoutSub?.unsubscribe();
		this.voiceServerTimeoutSub = null;
	}

	cleanup(): void {
		const {room} = this.connectionState;

		this.clearVoiceServerTimeout();

		if (room) {
			room.removeAllListeners();
			room.disconnect();
		}

		runInAction(() => {
			this.connectionState = initialConnectionState;
		});

		this.isLocalDisconnecting = false;
		this.throttle.reset();
		this.reconnect.cleanup();

		logger.info('Cleanup complete');
	}
}

export default new VoiceConnectionManager();
