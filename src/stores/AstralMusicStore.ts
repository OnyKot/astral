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
import Config from '~/Config';
import {Endpoints} from '~/Endpoints';
import http, {HttpError} from '~/lib/HttpClient';
import {
	buildAstralMusicTrackSnapshot,
	createEmptyAstralMusicSearchResponse,
	createEmptyAstralMusicState,
	dedupeAstralMusicTracks,
	type AstralMusicPlaybackState,
	type AstralMusicSearchItem,
	type AstralMusicSearchResponse,
	type AstralMusicState,
	type AstralMusicTrackSnapshot,
	toAstralMusicActivity,
} from '~/lib/astralMusic';
import type {MusicActivity} from '~/lib/musicActivity';
import type {UserPrivate} from '~/records/UserRecord';
import RuntimeConfigStore from '~/stores/RuntimeConfigStore';

type AsyncStatus = 'idle' | 'loading' | 'ready' | 'error';

type MusicSessionResponse = {
	user: UserPrivate;
};

type MusicStateResponse = {
	state: AstralMusicState;
};

type MusicPlaybackResponse = {
	playback: AstralMusicPlaybackState | null;
};

const DEFAULT_LIBRARY_REDIRECT = '/account';
const SEARCH_SECTION_LIMIT = 6;
const HISTORY_LIMIT = 18;
const FAVORITES_LIMIT = 18;

const safeWindow = (): Window | null => {
	return typeof window === 'undefined' ? null : window;
};

class AstralMusicStoreImpl {
	sessionUser: UserPrivate | null = null;
	sessionStatus: AsyncStatus = 'idle';
	sessionError: string | null = null;

	state: AstralMusicState = createEmptyAstralMusicState();
	stateStatus: AsyncStatus = 'idle';

	playback: AstralMusicPlaybackState | null = null;
	playbackStatus: AsyncStatus = 'idle';

	searchStatus: AsyncStatus = 'idle';
	searchQuery = '';
	searchProvider = 'tidal';
	searchResults: AstralMusicSearchResponse = createEmptyAstralMusicSearchResponse();
	searchError: string | null = null;

	private bootstrapped = false;
	private searchRequestId = 0;

	constructor() {
		makeAutoObservable<this, 'bootstrapped' | 'searchRequestId'>(this, {
			bootstrapped: false,
			searchRequestId: false,
		});
	}

	get hasSession(): boolean {
		return Boolean(this.sessionUser);
	}

	get currentActivity(): MusicActivity | null {
		return toAstralMusicActivity(this.playback, true);
	}

	get currentTrack(): AstralMusicTrackSnapshot | null {
		return this.playback?.currentTrack ?? null;
	}

	get favoriteTracks(): Array<AstralMusicTrackSnapshot> {
		return this.state.favorites_tracks;
	}

	get historyTracks(): Array<AstralMusicTrackSnapshot> {
		return this.state.history_tracks;
	}

	get hasSearchResults(): boolean {
		return [
			this.searchResults.tracks.items.length,
			this.searchResults.albums.items.length,
			this.searchResults.artists.items.length,
			this.searchResults.playlists.items.length,
			this.searchResults.videos.items.length,
		].some((count) => count > 0);
	}

	async ensureBootstrapped(): Promise<void> {
		if (this.bootstrapped) {
			return;
		}

		this.bootstrapped = true;

		/*
		 * Wait for RuntimeConfigStore to finish loading instance config
		 * before hitting music endpoints. If the instance doesn't have
		 * music configured (spotifyClientId is null), skip entirely —
		 * the endpoints will 401 and produce noisy browser XHR console
		 * logs that can't be suppressed from application code.
		 */
		try {
			await RuntimeConfigStore.waitForInit();
		} catch {
			// Config load failed — skip music bootstrap
			return;
		}
		if (!RuntimeConfigStore.spotifyClientId) {
			runInAction(() => {
				this.sessionStatus = 'idle';
				this.stateStatus = 'idle';
				this.playbackStatus = 'idle';
			});
			return;
		}

		await this.refreshAll();
	}

	async refreshAll(): Promise<void> {
		await Promise.allSettled([this.refreshSession(), this.refreshState(), this.refreshPlayback()]);
	}

	async refreshSession(): Promise<void> {
		runInAction(() => {
			this.sessionStatus = 'loading';
			this.sessionError = null;
		});

		try {
			const response = await http.get<MusicSessionResponse>({
				url: Endpoints.MUSIC_AUTH_SESSION,
				rejectWithError: false,
			});

			runInAction(() => {
				if (response.ok) {
					this.sessionUser = response.body.user;
					this.sessionStatus = 'ready';
					this.sessionError = null;
					return;
				}

				this.sessionUser = null;
				this.sessionStatus = response.status === 401 ? 'idle' : 'error';
				this.sessionError = response.status === 401 ? null : 'Не удалось подключиться к Astral Music.';
			});
		} catch (error) {
			runInAction(() => {
				this.sessionUser = null;
				this.sessionStatus = 'error';
				this.sessionError = error instanceof Error ? error.message : 'Не удалось подключиться к Astral Music.';
			});
		}
	}

	async refreshState(): Promise<void> {
		runInAction(() => {
			this.stateStatus = 'loading';
		});

		try {
			const response = await http.get<MusicStateResponse>({
				url: Endpoints.USER_MUSIC_STATE,
				rejectWithError: false,
			});

			runInAction(() => {
				if (response.ok) {
					this.state = response.body.state ?? createEmptyAstralMusicState();
					this.stateStatus = 'ready';
					return;
				}

				this.state = createEmptyAstralMusicState();
				this.stateStatus = response.status === 401 ? 'idle' : 'error';
			});
		} catch {
			runInAction(() => {
				this.state = createEmptyAstralMusicState();
				this.stateStatus = 'error';
			});
		}
	}

	async refreshPlayback(): Promise<void> {
		runInAction(() => {
			this.playbackStatus = 'loading';
		});

		try {
			const response = await http.get<MusicPlaybackResponse>({
				url: Endpoints.USER_MUSIC_PLAYBACK,
				rejectWithError: false,
			});

			runInAction(() => {
				if (response.ok) {
					this.playback = response.body.playback;
					this.playbackStatus = 'ready';
					return;
				}

				this.playback = null;
				this.playbackStatus = response.status === 401 ? 'idle' : 'error';
			});
		} catch {
			runInAction(() => {
				this.playback = null;
				this.playbackStatus = 'error';
			});
		}
	}

	async search(query: string, provider = this.searchProvider): Promise<void> {
		this.searchQuery = query;
		this.searchProvider = provider;

		const normalizedQuery = query.trim();
		const requestId = ++this.searchRequestId;

		if (!normalizedQuery) {
			runInAction(() => {
				this.searchStatus = 'idle';
				this.searchError = null;
				this.searchResults = createEmptyAstralMusicSearchResponse();
			});
			return;
		}

		runInAction(() => {
			this.searchStatus = 'loading';
			this.searchError = null;
		});

		try {
			const response = await http.get<AstralMusicSearchResponse>({
				url: Endpoints.MUSIC_SEARCH,
				query: {
					q: normalizedQuery,
					provider,
					section_limit: SEARCH_SECTION_LIMIT,
				},
				rejectWithError: false,
			});

			if (requestId !== this.searchRequestId) {
				return;
			}

			runInAction(() => {
				if (response.ok) {
					this.searchResults = response.body;
					this.searchStatus = 'ready';
					this.searchError = null;
					return;
				}

				this.searchResults = createEmptyAstralMusicSearchResponse();
				this.searchStatus = 'error';
				this.searchError = 'Поиск по музыке сейчас недоступен.';
			});
		} catch (error) {
			if (requestId !== this.searchRequestId) {
				return;
			}

			runInAction(() => {
				this.searchResults = createEmptyAstralMusicSearchResponse();
				this.searchStatus = 'error';
				this.searchError = error instanceof Error ? error.message : 'Поиск по музыке сейчас недоступен.';
			});
		}
	}

	async savePlaybackFromItem(item: AstralMusicSearchItem | AstralMusicTrackSnapshot, source = 'Astral Music'): Promise<void> {
		const track = buildAstralMusicTrackSnapshot(item, source);
		if (!track) {
			return;
		}

		const playback: AstralMusicPlaybackState = {
			currentTrack: track,
			position: 0,
			duration: 0,
			paused: false,
			updatedAt: Date.now(),
			deviceId: 'astral-messenger',
			deviceName: 'Astral Messenger',
			source,
		};

		await this.savePlayback(playback);
		await this.saveState({
			...this.state,
			history_tracks: dedupeAstralMusicTracks([track, ...this.state.history_tracks], HISTORY_LIMIT),
		});
	}

	async clearPlayback(): Promise<void> {
		await this.savePlayback(null);
	}

	async toggleFavorite(trackLike: AstralMusicSearchItem | AstralMusicTrackSnapshot): Promise<void> {
		const track = buildAstralMusicTrackSnapshot(trackLike, 'Astral Music');
		if (!track) {
			return;
		}

		const exists = this.state.favorites_tracks.some((entry) => this.isSameTrack(entry, track));
		const favorites = exists
			? this.state.favorites_tracks.filter((entry) => !this.isSameTrack(entry, track))
			: dedupeAstralMusicTracks([track, ...this.state.favorites_tracks], FAVORITES_LIMIT);

		await this.saveState({
			...this.state,
			favorites_tracks: favorites,
		});
	}

	async logoutMusicSession(): Promise<void> {
		try {
			await http.post({
				url: Endpoints.MUSIC_AUTH_LOGOUT,
				rejectWithError: false,
			});
		} finally {
			runInAction(() => {
				this.sessionUser = null;
				this.playback = null;
				this.state = createEmptyAstralMusicState();
				this.sessionStatus = 'idle';
			});
		}
	}

	openMusicApp(path = DEFAULT_LIBRARY_REDIRECT): void {
		const currentWindow = safeWindow();
		if (!currentWindow) {
			return;
		}

		currentWindow.open(this.buildMusicStartUrl(path), '_blank', 'noopener,noreferrer');
	}

	private buildMusicStartUrl(path: string): string {
		const apiBase = RuntimeConfigStore.apiEndpoint || Config.PUBLIC_BOOTSTRAP_API_ENDPOINT;
		const apiUrl = new URL(`${apiBase.replace(/\/$/, '')}/v${Config.PUBLIC_API_VERSION}${Endpoints.MUSIC_AUTH_START}`, safeWindow()?.location.origin);
		apiUrl.searchParams.set('redirect_to', path.startsWith('/') ? path : `/${path}`);
		return apiUrl.toString();
	}

	private async savePlayback(playback: AstralMusicPlaybackState | null): Promise<void> {
		const response = await http.post<MusicPlaybackResponse>({
			url: Endpoints.USER_MUSIC_PLAYBACK,
			body: {playback},
		});

		runInAction(() => {
			this.playback = response.body.playback;
			this.playbackStatus = 'ready';
		});
	}

	private async saveState(state: AstralMusicState): Promise<void> {
		const response = await http.post<MusicStateResponse>({
			url: Endpoints.USER_MUSIC_STATE,
			body: {state},
		});

		runInAction(() => {
			this.state = response.body.state ?? createEmptyAstralMusicState();
			this.stateStatus = 'ready';
		});
	}

	private isSameTrack(left: AstralMusicTrackSnapshot, right: AstralMusicTrackSnapshot): boolean {
		return [left.trackUrl ?? '', left.title, left.artists.join(','), left.album ?? ''].join('|') ===
			[right.trackUrl ?? '', right.title, right.artists.join(','), right.album ?? ''].join('|');
	}
}

const AstralMusicStore = new AstralMusicStoreImpl();

void AstralMusicStore.ensureBootstrapped().catch((error: unknown) => {
	if (error instanceof HttpError && error.status === 401) {
		return;
	}

	console.warn('Failed to bootstrap Astral Music store', error);
});

export default AstralMusicStore;
