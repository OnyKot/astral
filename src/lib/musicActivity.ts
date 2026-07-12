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

export type MusicProvider = 'spotify' | 'yandex_music' | 'astral_now_playing' | 'steam' | (string & {});

export interface MusicActivity {
	provider: MusicProvider;
	title: string;
	artists: Array<string>;
	album?: string | null;
	artworkUrl?: string | null;
	trackUrl?: string | null;
	isPlaying: boolean;
	showProvider?: boolean;
	progressMs?: number | null;
	durationMs?: number | null;
	updatedAt: number;
}

export interface GatewayMusicActivityPayload {
	provider: MusicProvider;
	title: string;
	artists: Array<string>;
	album?: string | null;
	artwork_url?: string | null;
	track_url?: string | null;
	is_playing?: boolean;
	show_provider?: boolean;
	progress_ms?: number | null;
	duration_ms?: number | null;
	updated_at?: number | null;
}

export const isSteamProvider = (provider: string | null | undefined): boolean => {
	if (!provider) return false;
	return provider.trim().toLowerCase().includes('steam');
};

export const isTwitchProvider = (provider: string | null | undefined): boolean => {
	if (!provider) return false;
	return provider.trim().toLowerCase().includes('twitch');
};

const normalizeArtists = (artists: Array<string>): Array<string> => {
	return artists.map((artist) => artist.trim()).filter((artist) => artist.length > 0);
};

export const normalizeMusicActivity = (activity: MusicActivity | null | undefined): MusicActivity | null => {
	if (!activity) {
		return null;
	}

	const title = activity.title.trim();
	const artists = normalizeArtists(activity.artists);
	const providerAllowsNoArtists = isSteamProvider(activity.provider) || isTwitchProvider(activity.provider);

	if (!title || (!providerAllowsNoArtists && artists.length === 0)) {
		return null;
	}

	return {
		...activity,
		title,
		artists,
		album: activity.album?.trim() || null,
		artworkUrl: activity.artworkUrl?.trim() || null,
		trackUrl: activity.trackUrl?.trim() || null,
		progressMs: activity.progressMs ?? null,
		durationMs: activity.durationMs ?? null,
		showProvider: activity.showProvider ?? true,
		updatedAt: activity.updatedAt || Date.now(),
	};
};

export const toGatewayMusicActivity = (
	activity: MusicActivity | null | undefined,
): GatewayMusicActivityPayload | null => {
	const normalized = normalizeMusicActivity(activity);
	if (!normalized) {
		return null;
	}

	return {
		provider: normalized.provider,
		title: normalized.title,
		artists: normalized.artists,
		album: normalized.album ?? null,
		artwork_url: normalized.artworkUrl ?? null,
		track_url: normalized.trackUrl ?? null,
		is_playing: normalized.isPlaying,
		show_provider: normalized.showProvider ?? true,
		progress_ms: normalized.progressMs ?? null,
		duration_ms: normalized.durationMs ?? null,
		updated_at: normalized.updatedAt,
	};
};

export const fromGatewayMusicActivity = (
	payload: GatewayMusicActivityPayload | null | undefined,
): MusicActivity | null => {
	if (!payload || typeof payload !== 'object') {
		return null;
	}

	return normalizeMusicActivity({
		provider: payload.provider,
		title: payload.title,
		artists: Array.isArray(payload.artists) ? payload.artists : [],
		album: payload.album ?? null,
		artworkUrl: payload.artwork_url ?? null,
		trackUrl: payload.track_url ?? null,
		isPlaying: payload.is_playing ?? true,
		showProvider: payload.show_provider ?? true,
		progressMs: payload.progress_ms ?? null,
		durationMs: payload.duration_ms ?? null,
		updatedAt: payload.updated_at ?? Date.now(),
	});
};

export const musicActivityToKey = (activity: MusicActivity | null | undefined): string => {
	const normalized = normalizeMusicActivity(activity);
	if (!normalized) {
		return 'none';
	}

	return [
		normalized.provider,
		normalized.title,
		normalized.artists.join(','),
		normalized.album ?? '',
		normalized.artworkUrl ?? '',
		normalized.trackUrl ?? '',
		normalized.isPlaying ? '1' : '0',
		normalized.showProvider ? '1' : '0',
	].join('|');
};

export const formatMusicArtists = (artists: Array<string>): string => {
	return normalizeArtists(artists).join(', ');
};

export const isTwitchLiveActivity = (activity: MusicActivity | null | undefined): boolean => {
	if (!activity) return false;
	if (!isTwitchProvider(activity.provider)) return false;
	return activity.isPlaying !== false;
};
