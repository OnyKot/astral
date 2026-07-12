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

import {makeAutoObservable, reaction, runInAction} from 'mobx';
import AppStorage from '~/lib/AppStorage';
import {
	type MusicActivity,
	musicActivityToKey,
	normalizeMusicActivity,
} from '~/lib/musicActivity';
import {makePersistent} from '~/lib/MobXPersistence';
import {Routes} from '~/Routes';
import AstralMusicStore from '~/stores/AstralMusicStore';
import RuntimeConfigStore from '~/stores/RuntimeConfigStore';
import {getElectronAPI} from '~/utils/NativeUtils';

export const SPOTIFY_OAUTH_PENDING_KEY = 'spotify.connect.pending';
export const SPOTIFY_OAUTH_RESULT_KEY = 'spotify.connect.result';

type SpotifyAuthResult = {
	code?: string;
	state?: string;
	error?: string;
};

type SpotifyTokenResponse = {
	access_token: string;
	refresh_token?: string;
	expires_in: number;
};

type SpotifyProfileResponse = {
	display_name?: string | null;
	id: string;
};

type SpotifyCurrentlyPlayingResponse = {
	is_playing: boolean;
	progress_ms?: number | null;
	item?: {
		name?: string;
		duration_ms?: number | null;
		album?: {
			name?: string | null;
			images?: Array<{url: string}>;
		};
		external_urls?: {
			spotify?: string;
		};
		artists?: Array<{name?: string | null}>;
	};
};

const SPOTIFY_SCOPE = ['user-read-currently-playing', 'user-read-playback-state', 'user-read-email'].join(' ');
const SPOTIFY_POLL_INTERVAL = 20_000;
const DESKTOP_NOW_PLAYING_POLL_INTERVAL = 8_000;

const safeWindow = (): Window | null => {
	return typeof window === 'undefined' ? null : window;
};

const randomString = (bytes = 32): string => {
	const cryptoApi = safeWindow()?.crypto;
	if (!cryptoApi) {
		return Math.random().toString(36).slice(2) + Date.now().toString(36);
	}

	const buffer = new Uint8Array(bytes);
	cryptoApi.getRandomValues(buffer);
	return Array.from(buffer, (value) => value.toString(16).padStart(2, '0')).join('');
};

const toBase64Url = (buffer: ArrayBuffer): string => {
	const bytes = new Uint8Array(buffer);
	let binary = '';
	for (const byte of bytes) {
		binary += String.fromCharCode(byte);
	}

	return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
};

const createCodeChallenge = async (verifier: string): Promise<string> => {
	const cryptoApi = safeWindow()?.crypto;
	if (!cryptoApi?.subtle) {
		throw new Error('Spotify PKCE is unavailable in this environment.');
	}

	const data = new TextEncoder().encode(verifier);
	const hash = await cryptoApi.subtle.digest('SHA-256', data);
	return toBase64Url(hash);
};

const splitArtists = (input: string): Array<string> => {
	return input
		.split(',')
		.map((artist) => artist.trim())
		.filter((artist) => artist.length > 0);
};

class MusicPresenceStore {
	shareListeningStatus = true;
	showProviderBadge = true;

	spotifyAccessToken: string | null = null;
	spotifyRefreshToken: string | null = null;
	spotifyExpiresAt = 0;
	spotifyDisplayName: string | null = null;
	spotifyLastSyncedAt = 0;
	spotifyTrack: MusicActivity | null = null;
	spotifyStatus: 'disconnected' | 'connecting' | 'connected' | 'error' = 'disconnected';
	spotifyError: string | null = null;
	desktopNowPlaying: MusicActivity | null = null;
	desktopNowPlayingSource: string | null = null;

	yandexShareEnabled = false;
	yandexTrackTitle = '';
	yandexTrackArtists = '';
	yandexTrackAlbum = '';
	yandexTrackUrl = '';
	yandexArtworkUrl = '';

	private spotifyPollIntervalId: number | null = null;
	private spotifySyncInFlight: Promise<void> | null = null;
	private desktopNowPlayingIntervalId: number | null = null;
	private desktopNowPlayingInFlight: Promise<void> | null = null;
	private storageListenerBound = false;
	private messageListenerBound = false;

	constructor() {
		makeAutoObservable<
			this,
			| 'spotifyPollIntervalId'
			| 'spotifySyncInFlight'
			| 'desktopNowPlayingIntervalId'
			| 'desktopNowPlayingInFlight'
			| 'storageListenerBound'
			| 'messageListenerBound'
		>(
			this,
			{
				spotifyPollIntervalId: false,
				spotifySyncInFlight: false,
				desktopNowPlayingIntervalId: false,
				desktopNowPlayingInFlight: false,
				storageListenerBound: false,
				messageListenerBound: false,
			},
			{autoBind: true},
		);

		void this.initPersistence();
		this.bindOAuthListeners();

		reaction(
			() => ({
				enabled: this.shareListeningStatus,
				spotifyConnected: this.isSpotifyConnected,
				token: this.spotifyAccessToken,
				key: musicActivityToKey(this.spotifyTrack),
			}),
			() => {
				if (this.shareListeningStatus && this.isSpotifyConnected && this.spotifyAccessToken) {
					this.startSpotifyPolling();
				} else {
					this.stopSpotifyPolling();
				}
			},
			{fireImmediately: true},
		);

		reaction(
			() => ({
				enabled: this.shareListeningStatus,
				desktopAvailable: this.desktopNowPlayingAvailable,
			}),
			() => {
				if (this.shareListeningStatus && this.desktopNowPlayingAvailable) {
					this.startDesktopNowPlayingPolling();
				} else {
					this.stopDesktopNowPlayingPolling();
				}
			},
			{fireImmediately: true},
		);
	}

	private async initPersistence(): Promise<void> {
		await makePersistent(
			this,
			'MusicPresenceStore',
			[
				'shareListeningStatus',
				'showProviderBadge',
				'spotifyAccessToken',
				'spotifyRefreshToken',
				'spotifyExpiresAt',
				'spotifyDisplayName',
				'yandexShareEnabled',
				'yandexTrackTitle',
				'yandexTrackArtists',
				'yandexTrackAlbum',
				'yandexTrackUrl',
				'yandexArtworkUrl',
			],
			{version: 1},
		);

		if (this.isSpotifyConnected && this.shareListeningStatus) {
			void this.refreshSpotifyPlaybackNow();
		}
		if (this.desktopNowPlayingAvailable && this.shareListeningStatus) {
			void this.refreshDesktopNowPlayingNow();
		}
	}

	private bindOAuthListeners(): void {
		const currentWindow = safeWindow();
		if (!currentWindow) {
			return;
		}

		if (!this.storageListenerBound) {
			currentWindow.addEventListener('storage', this.handleStorageEvent);
			this.storageListenerBound = true;
		}

		if (!this.messageListenerBound) {
			currentWindow.addEventListener('message', this.handleWindowMessage);
			this.messageListenerBound = true;
		}
	}

	private handleStorageEvent = (event: StorageEvent): void => {
		if (event.key !== SPOTIFY_OAUTH_RESULT_KEY || !event.newValue) {
			return;
		}

		this.consumeSpotifyOAuthResult(event.newValue);
	};

	private handleWindowMessage = (event: MessageEvent): void => {
		if (typeof event.data !== 'object' || !event.data) {
			return;
		}

		if (event.data.type !== 'spotify-oauth-result') {
			return;
		}

		this.consumeSpotifyOAuthResult(JSON.stringify(event.data.payload ?? {}));
	};

	private consumeSpotifyOAuthResult(rawValue: string): void {
		AppStorage.removeItem(SPOTIFY_OAUTH_RESULT_KEY);

		let payload: SpotifyAuthResult;
		try {
			payload = JSON.parse(rawValue) as SpotifyAuthResult;
		} catch {
			this.spotifyStatus = 'error';
			this.spotifyError = 'Failed to read Spotify authorization result.';
			return;
		}

		void this.finishSpotifyConnect(payload);
	}

	get spotifyClientId(): string | null {
		return RuntimeConfigStore.spotifyClientId || null;
	}

	get spotifyAvailable(): boolean {
		return Boolean(this.spotifyClientId);
	}

	get desktopNowPlayingAvailable(): boolean {
		const electronApi = getElectronAPI();
		return Boolean(electronApi && electronApi.platform === 'win32' && typeof electronApi.getDesktopNowPlaying === 'function');
	}

	get isSpotifyConnected(): boolean {
		return Boolean(this.spotifyAccessToken && this.spotifyExpiresAt > 0);
	}

	get yandexActivity(): MusicActivity | null {
		if (!this.yandexShareEnabled) {
			return null;
		}

		return normalizeMusicActivity({
			provider: 'yandex_music',
			title: this.yandexTrackTitle,
			artists: splitArtists(this.yandexTrackArtists),
			album: this.yandexTrackAlbum || null,
			trackUrl: this.yandexTrackUrl || null,
			artworkUrl: this.yandexArtworkUrl || null,
			isPlaying: true,
			showProvider: this.showProviderBadge,
			updatedAt: Date.now(),
		});
	}

	get currentActivity(): MusicActivity | null {
		if (!this.shareListeningStatus) {
			return null;
		}

		const astralMusicActivity = AstralMusicStore.currentActivity
			? {
					...AstralMusicStore.currentActivity,
					showProvider: this.showProviderBadge,
					updatedAt: Date.now(),
				}
			: null;

		if (astralMusicActivity) {
			return astralMusicActivity;
		}

		if (this.desktopNowPlaying) {
			return {
				...this.desktopNowPlaying,
				showProvider: this.showProviderBadge,
				updatedAt: Date.now(),
			};
		}

		if (this.spotifyTrack) {
			return {
				...this.spotifyTrack,
				showProvider: this.showProviderBadge,
				updatedAt: Date.now(),
			};
		}

		if (this.yandexActivity) {
			return {
				...this.yandexActivity,
				showProvider: this.showProviderBadge,
				updatedAt: Date.now(),
			};
		}

		return null;
	}

	get hasAnyConfiguredMusicSource(): boolean {
		return Boolean(AstralMusicStore.currentTrack || this.desktopNowPlaying || this.spotifyTrack || this.yandexActivity);
	}

	get spotifyConnectErrorText(): string | null {
		if (!this.spotifyError) {
			return null;
		}

		return this.spotifyError;
	}

	setShareListeningStatus(value: boolean): void {
		this.shareListeningStatus = value;
		if (!value) {
			this.stopSpotifyPolling();
		} else if (this.isSpotifyConnected) {
			void this.refreshSpotifyPlaybackNow();
		}
	}

	setShowProviderBadge(value: boolean): void {
		this.showProviderBadge = value;
		if (this.desktopNowPlaying) {
			this.desktopNowPlaying = {
				...this.desktopNowPlaying,
				showProvider: value,
				updatedAt: Date.now(),
			};
		}
		if (this.spotifyTrack) {
			this.spotifyTrack = {
				...this.spotifyTrack,
				showProvider: value,
				updatedAt: Date.now(),
			};
		}
	}

	updateYandexShare(data: {
		enabled?: boolean;
		title?: string;
		artists?: string;
		album?: string;
		trackUrl?: string;
		artworkUrl?: string;
	}): void {
		if (data.enabled !== undefined) {
			this.yandexShareEnabled = data.enabled;
		}
		if (data.title !== undefined) {
			this.yandexTrackTitle = data.title;
		}
		if (data.artists !== undefined) {
			this.yandexTrackArtists = data.artists;
		}
		if (data.album !== undefined) {
			this.yandexTrackAlbum = data.album;
		}
		if (data.trackUrl !== undefined) {
			this.yandexTrackUrl = data.trackUrl;
		}
		if (data.artworkUrl !== undefined) {
			this.yandexArtworkUrl = data.artworkUrl;
		}
	}

	clearYandexShare(): void {
		this.yandexShareEnabled = false;
		this.yandexTrackTitle = '';
		this.yandexTrackArtists = '';
		this.yandexTrackAlbum = '';
		this.yandexTrackUrl = '';
		this.yandexArtworkUrl = '';
	}

	async startSpotifyConnect(): Promise<void> {
		const clientId = this.spotifyClientId;
		if (!clientId) {
			runInAction(() => {
				this.spotifyStatus = 'error';
				this.spotifyError = 'Spotify is not configured for this Astral instance yet.';
			});
			return;
		}

		const verifier = randomString(64);
		const state = randomString(24);
		const challenge = await createCodeChallenge(verifier);
		const redirectUri = this.getSpotifyRedirectUri();

		AppStorage.setJSON(SPOTIFY_OAUTH_PENDING_KEY, {
			state,
			verifier,
			redirectUri,
			createdAt: Date.now(),
		});

		const authUrl = new URL('https://accounts.spotify.com/authorize');
		authUrl.searchParams.set('client_id', clientId);
		authUrl.searchParams.set('response_type', 'code');
		authUrl.searchParams.set('redirect_uri', redirectUri);
		authUrl.searchParams.set('code_challenge_method', 'S256');
		authUrl.searchParams.set('code_challenge', challenge);
		authUrl.searchParams.set('state', state);
		authUrl.searchParams.set('scope', SPOTIFY_SCOPE);

		runInAction(() => {
			this.spotifyStatus = 'connecting';
			this.spotifyError = null;
		});

		const popup = safeWindow()?.open(
			authUrl.toString(),
			'astral-spotify-connect',
			'popup=yes,width=540,height=720,menubar=no,toolbar=no,status=no',
		);

		if (!popup) {
			safeWindow()?.location.assign(authUrl.toString());
			return;
		}

		popup.focus();
	}

	async finishSpotifyConnect(result: SpotifyAuthResult): Promise<void> {
		if (result.error) {
			const error = result.error;
			runInAction(() => {
				this.spotifyStatus = 'error';
				this.spotifyError = error;
			});
			return;
		}

		const pending = AppStorage.getJSON<{
			state: string;
			verifier: string;
			redirectUri: string;
			createdAt: number;
		}>(SPOTIFY_OAUTH_PENDING_KEY);

		AppStorage.removeItem(SPOTIFY_OAUTH_PENDING_KEY);

		if (!pending || !result.code || !result.state || pending.state !== result.state) {
			runInAction(() => {
				this.spotifyStatus = 'error';
				this.spotifyError = 'Spotify authorization could not be verified.';
			});
			return;
		}

		const clientId = this.spotifyClientId;
		if (!clientId) {
			runInAction(() => {
				this.spotifyStatus = 'error';
				this.spotifyError = 'Spotify client configuration is missing.';
			});
			return;
		}

		try {
			const body = new URLSearchParams({
				client_id: clientId,
				grant_type: 'authorization_code',
				code: result.code,
				redirect_uri: pending.redirectUri,
				code_verifier: pending.verifier,
			});

			const response = await fetch('https://accounts.spotify.com/api/token', {
				method: 'POST',
				headers: {'Content-Type': 'application/x-www-form-urlencoded'},
				body,
			});

			if (!response.ok) {
				throw new Error(`Spotify token exchange failed (${response.status}).`);
			}

			const data = (await response.json()) as SpotifyTokenResponse;

			runInAction(() => {
				this.spotifyAccessToken = data.access_token;
				this.spotifyRefreshToken = data.refresh_token ?? this.spotifyRefreshToken;
				this.spotifyExpiresAt = Date.now() + data.expires_in * 1000;
				this.spotifyStatus = 'connected';
				this.spotifyError = null;
			});

			await this.fetchSpotifyProfile();
			await this.refreshSpotifyPlaybackNow();
		} catch (error) {
			runInAction(() => {
				this.spotifyStatus = 'error';
				this.spotifyError = error instanceof Error ? error.message : 'Spotify connection failed.';
			});
		}
	}

	disconnectSpotify(): void {
		this.spotifyAccessToken = null;
		this.spotifyRefreshToken = null;
		this.spotifyExpiresAt = 0;
		this.spotifyDisplayName = null;
		this.spotifyTrack = null;
		this.spotifyStatus = 'disconnected';
		this.spotifyError = null;
		this.stopSpotifyPolling();
	}

	private getSpotifyRedirectUri(): string {
		const baseUrl = RuntimeConfigStore.webAppBaseUrl || safeWindow()?.location.origin || '';
		const redirectUrl = new URL(Routes.SPOTIFY_CONNECT_CALLBACK, `${baseUrl}/`);

		// Spotify no longer accepts localhost aliases for redirect URIs.
		if (redirectUrl.hostname === 'localhost') {
			redirectUrl.hostname = '127.0.0.1';
		}

		return redirectUrl.toString();
	}

	private async fetchSpotifyProfile(): Promise<void> {
		const accessToken = await this.ensureSpotifyAccessToken();
		if (!accessToken) {
			return;
		}

		const response = await fetch('https://api.spotify.com/v1/me', {
			headers: {Authorization: `Bearer ${accessToken}`},
		});

		if (!response.ok) {
			return;
		}

		const profile = (await response.json()) as SpotifyProfileResponse;
		runInAction(() => {
			this.spotifyDisplayName = profile.display_name || profile.id || 'Spotify';
		});
	}

	private async ensureSpotifyAccessToken(): Promise<string | null> {
		if (!this.spotifyAccessToken) {
			return null;
		}

		if (Date.now() < this.spotifyExpiresAt - 60_000) {
			return this.spotifyAccessToken;
		}

		if (!this.spotifyRefreshToken || !this.spotifyClientId) {
			return this.spotifyAccessToken;
		}

		const body = new URLSearchParams({
			client_id: this.spotifyClientId,
			grant_type: 'refresh_token',
			refresh_token: this.spotifyRefreshToken,
		});

		const response = await fetch('https://accounts.spotify.com/api/token', {
			method: 'POST',
			headers: {'Content-Type': 'application/x-www-form-urlencoded'},
			body,
		});

		if (!response.ok) {
			throw new Error(`Spotify token refresh failed (${response.status}).`);
		}

		const data = (await response.json()) as SpotifyTokenResponse;

		runInAction(() => {
			this.spotifyAccessToken = data.access_token;
			this.spotifyRefreshToken = data.refresh_token ?? this.spotifyRefreshToken;
			this.spotifyExpiresAt = Date.now() + data.expires_in * 1000;
		});

		return this.spotifyAccessToken;
	}

	async refreshSpotifyPlaybackNow(): Promise<void> {
		if (!this.isSpotifyConnected || this.spotifySyncInFlight) {
			return;
		}

		this.spotifySyncInFlight = this.fetchSpotifyPlayback()
			.catch((error) => {
				runInAction(() => {
					this.spotifyStatus = 'error';
					this.spotifyError = error instanceof Error ? error.message : 'Spotify sync failed.';
				});
			})
			.finally(() => {
				this.spotifySyncInFlight = null;
			});

		await this.spotifySyncInFlight;
	}

	private async fetchSpotifyPlayback(): Promise<void> {
		const accessToken = await this.ensureSpotifyAccessToken();
		if (!accessToken) {
			return;
		}

		const response = await fetch('https://api.spotify.com/v1/me/player/currently-playing', {
			headers: {Authorization: `Bearer ${accessToken}`},
		});

		if (response.status === 204) {
			runInAction(() => {
				this.spotifyTrack = null;
				this.spotifyStatus = 'connected';
				this.spotifyLastSyncedAt = Date.now();
			});
			return;
		}

		if (!response.ok) {
			throw new Error(`Spotify playback sync failed (${response.status}).`);
		}

		const payload = (await response.json()) as SpotifyCurrentlyPlayingResponse;
		const item = payload.item;

		runInAction(() => {
			this.spotifyTrack = normalizeMusicActivity(
				item?.name
					? {
							provider: 'spotify',
							title: item.name,
							artists: (item.artists ?? []).map((artist) => artist.name ?? '').filter(Boolean),
							album: item.album?.name ?? null,
							artworkUrl: item.album?.images?.[0]?.url ?? null,
							trackUrl: item.external_urls?.spotify ?? null,
							isPlaying: payload.is_playing,
							showProvider: this.showProviderBadge,
							progressMs: payload.progress_ms ?? null,
							durationMs: item.duration_ms ?? null,
							updatedAt: Date.now(),
						}
					: null,
			);
			this.spotifyStatus = 'connected';
			this.spotifyError = null;
			this.spotifyLastSyncedAt = Date.now();
		});
	}

	private startSpotifyPolling(): void {
		if (this.spotifyPollIntervalId != null) {
			return;
		}

		void this.refreshSpotifyPlaybackNow();
		this.spotifyPollIntervalId = window.setInterval(() => {
			void this.refreshSpotifyPlaybackNow();
		}, SPOTIFY_POLL_INTERVAL);
	}

	private stopSpotifyPolling(): void {
		if (this.spotifyPollIntervalId == null) {
			return;
		}

		window.clearInterval(this.spotifyPollIntervalId);
		this.spotifyPollIntervalId = null;
	}

	async refreshDesktopNowPlayingNow(): Promise<void> {
		if (!this.desktopNowPlayingAvailable || this.desktopNowPlayingInFlight) {
			return;
		}

		const electronApi = getElectronAPI();
		if (!electronApi) {
			return;
		}

		this.desktopNowPlayingInFlight = electronApi
			.getDesktopNowPlaying()
			.then((snapshot) => {
				runInAction(() => {
					this.desktopNowPlaying = normalizeMusicActivity(
						snapshot
							? {
									provider: 'astral_now_playing',
									title: snapshot.title,
									artists: snapshot.artists,
									album: snapshot.album,
									artworkUrl: snapshot.artworkUrl,
									isPlaying: snapshot.isPlaying,
									showProvider: this.showProviderBadge,
									progressMs: snapshot.progressMs,
									durationMs: snapshot.durationMs,
									updatedAt: Date.now(),
								}
							: null,
					);
					this.desktopNowPlayingSource = snapshot?.sourceLabel ?? null;
				});
			})
			.catch((error) => {
				console.warn('Failed to refresh desktop now playing:', error);
			})
			.finally(() => {
				this.desktopNowPlayingInFlight = null;
			});

		await this.desktopNowPlayingInFlight;
	}

	private startDesktopNowPlayingPolling(): void {
		if (this.desktopNowPlayingIntervalId != null) {
			return;
		}

		void this.refreshDesktopNowPlayingNow();
		this.desktopNowPlayingIntervalId = window.setInterval(() => {
			void this.refreshDesktopNowPlayingNow();
		}, DESKTOP_NOW_PLAYING_POLL_INTERVAL);
	}

	private stopDesktopNowPlayingPolling(): void {
		if (this.desktopNowPlayingIntervalId == null) {
			return;
		}

		window.clearInterval(this.desktopNowPlayingIntervalId);
		this.desktopNowPlayingIntervalId = null;
	}
}

export default new MusicPresenceStore();
