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

import {normalizeMusicActivity, type MusicActivity} from '~/lib/musicActivity';

export type AstralMusicSearchItem = Record<string, unknown> & {
	provider?: string;
};

export interface AstralMusicSearchSection {
	items: Array<AstralMusicSearchItem>;
	limit: number;
	offset: number;
	totalNumberOfItems: number;
}

export interface AstralMusicSearchResponse {
	tracks: AstralMusicSearchSection;
	videos: AstralMusicSearchSection;
	artists: AstralMusicSearchSection;
	albums: AstralMusicSearchSection;
	playlists: AstralMusicSearchSection;
	meta: {
		engine: 'typesense' | 'upstream' | 'empty';
		indexed: boolean;
	};
}

export interface AstralMusicTrackSnapshot {
	title: string;
	artists: Array<string>;
	album: string | null;
	artworkUrl: string | null;
	trackUrl: string | null;
	provider: string;
	source: string;
}

export interface AstralMusicPlaybackState {
	currentTrack: AstralMusicTrackSnapshot;
	position: number;
	duration: number;
	paused: boolean;
	updatedAt: number;
	deviceId: string;
	deviceName: string;
	source: string;
}

export interface AstralMusicState {
	favorites_tracks: Array<AstralMusicTrackSnapshot>;
	favorites_albums: Array<AstralMusicSearchItem>;
	favorites_artists: Array<AstralMusicSearchItem>;
	favorites_playlists: Array<AstralMusicSearchItem>;
	favorites_mixes: Array<AstralMusicSearchItem>;
	history_tracks: Array<AstralMusicTrackSnapshot>;
	user_playlists: Array<AstralMusicSearchItem>;
	user_folders: Array<AstralMusicSearchItem>;
	profile: Record<string, unknown> | null;
}

const EMPTY_SECTION: AstralMusicSearchSection = {
	items: [],
	limit: 0,
	offset: 0,
	totalNumberOfItems: 0,
};

const asRecord = (value: unknown): Record<string, unknown> | null => {
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		return null;
	}

	return value as Record<string, unknown>;
};

const asString = (value: unknown): string => {
	return typeof value === 'string' ? value.trim() : '';
};

const asStringList = (value: unknown): Array<string> => {
	if (!Array.isArray(value)) {
		return [];
	}

	return value.map((entry) => asString(entry)).filter(Boolean);
};

const firstString = (...values: Array<unknown>): string => {
	for (const value of values) {
		const normalized = asString(value);
		if (normalized) {
			return normalized;
		}
	}

	return '';
};

const firstNestedString = (value: unknown, keys: Array<string>): string => {
	const record = asRecord(value);
	if (!record) {
		return '';
	}

	for (const key of keys) {
		const normalized = asString(record[key]);
		if (normalized) {
			return normalized;
		}
	}

	return '';
};

export const createEmptyAstralMusicSearchResponse = (): AstralMusicSearchResponse => ({
	tracks: {...EMPTY_SECTION},
	videos: {...EMPTY_SECTION},
	artists: {...EMPTY_SECTION},
	albums: {...EMPTY_SECTION},
	playlists: {...EMPTY_SECTION},
	meta: {
		engine: 'empty',
		indexed: false,
	},
});

export const createEmptyAstralMusicState = (): AstralMusicState => ({
	favorites_tracks: [],
	favorites_albums: [],
	favorites_artists: [],
	favorites_playlists: [],
	favorites_mixes: [],
	history_tracks: [],
	user_playlists: [],
	user_folders: [],
	profile: null,
});

export const extractAstralMusicArtists = (item: AstralMusicSearchItem | AstralMusicTrackSnapshot): Array<string> => {
	const itemRecord = item as Record<string, unknown>;
	const directArtists = asStringList(itemRecord.artists);
	if (directArtists.length > 0) {
		return directArtists;
	}

	const artistNames = asStringList(itemRecord.artist_names);
	if (artistNames.length > 0) {
		return artistNames;
	}

	const nestedArtist = firstNestedString(itemRecord.artist, ['name', 'title']);
	if (nestedArtist) {
		return [nestedArtist];
	}

	const nestedArtists = Array.isArray(itemRecord.artists)
		? itemRecord.artists
				.map((entry) => firstNestedString(entry, ['name', 'title']))
				.filter(Boolean)
		: [];

	if (nestedArtists.length > 0) {
		return nestedArtists;
	}

	const primaryArtist = firstString(itemRecord.primary_artist, itemRecord.author, itemRecord.subtitle);
	return primaryArtist ? [primaryArtist] : [];
};

export const extractAstralMusicArtworkUrl = (item: AstralMusicSearchItem | AstralMusicTrackSnapshot): string | null => {
	const itemRecord = item as Record<string, unknown>;
	const directArtwork = firstString(
		itemRecord.artworkUrl,
		itemRecord.artwork_url,
		itemRecord.coverUrl,
		itemRecord.cover_url,
		itemRecord.imageUrl,
		itemRecord.image_url,
		itemRecord.thumbnailUrl,
		itemRecord.thumbnail_url,
		itemRecord.posterUrl,
		itemRecord.poster_url,
		itemRecord.photoUrl,
		itemRecord.photo_url,
		itemRecord.avatarUrl,
		itemRecord.avatar_url,
		itemRecord.picture,
		itemRecord.picture_medium,
		itemRecord.picture_xl,
		itemRecord.picture_big,
		itemRecord.cover,
		itemRecord.image,
		itemRecord.thumbnail,
	);

	if (directArtwork) {
		return directArtwork;
	}

	const imageFromAlbum = firstNestedString(item.album, [
		'artworkUrl',
		'artwork_url',
		'coverUrl',
		'cover_url',
		'imageUrl',
		'image_url',
		'thumbnailUrl',
		'thumbnail_url',
		'cover',
		'image',
		'thumbnail',
	]);

	return imageFromAlbum || null;
};

export const extractAstralMusicTrackUrl = (item: AstralMusicSearchItem | AstralMusicTrackSnapshot): string | null => {
	const itemRecord = item as Record<string, unknown>;
	const directUrl = firstString(
		itemRecord.trackUrl,
		itemRecord.track_url,
		itemRecord.url,
		itemRecord.link,
		itemRecord.shareUrl,
		itemRecord.share_url,
		itemRecord.externalUrl,
	);
	if (directUrl) {
		return directUrl;
	}

	const externalUrls = asRecord(itemRecord.external_urls);
	const spotifyUrl = externalUrls ? firstString(externalUrls.spotify, externalUrls.url) : '';
	return spotifyUrl || null;
};

export const extractAstralMusicAlbumTitle = (item: AstralMusicSearchItem | AstralMusicTrackSnapshot): string | null => {
	const itemRecord = item as Record<string, unknown>;
	const directAlbum = firstString(itemRecord.album, itemRecord.album_title, itemRecord.releaseTitle, itemRecord.release_title);
	if (directAlbum) {
		return directAlbum;
	}

	const nestedAlbum = firstNestedString(itemRecord.album, ['title', 'name']);
	return nestedAlbum || null;
};

export const buildAstralMusicTrackSnapshot = (
	item: AstralMusicSearchItem | AstralMusicTrackSnapshot,
	source = 'Astral Music',
): AstralMusicTrackSnapshot | null => {
	const itemRecord = item as Record<string, unknown>;
	const title = firstString(itemRecord.title, itemRecord.name);
	const artists = extractAstralMusicArtists(item);
	if (!title || artists.length === 0) {
		return null;
	}

	return {
		title,
		artists,
		album: extractAstralMusicAlbumTitle(item),
		artworkUrl: extractAstralMusicArtworkUrl(item),
		trackUrl: extractAstralMusicTrackUrl(item),
		provider: firstString(itemRecord.provider, itemRecord.source_provider) || 'astral_music',
		source,
	};
};

export const dedupeAstralMusicTracks = (
	tracks: Array<AstralMusicTrackSnapshot>,
	limit: number,
): Array<AstralMusicTrackSnapshot> => {
	const seen = new Set<string>();
	const output: Array<AstralMusicTrackSnapshot> = [];

	for (const track of tracks) {
		const key = [track.trackUrl ?? '', track.title, track.artists.join(','), track.album ?? ''].join('|');
		if (seen.has(key)) {
			continue;
		}

		seen.add(key);
		output.push(track);

		if (output.length >= limit) {
			break;
		}
	}

	return output;
};

export const toAstralMusicActivity = (
	playback: AstralMusicPlaybackState | null,
	showProvider = true,
): MusicActivity | null => {
	if (!playback?.currentTrack) {
		return null;
	}

	return normalizeMusicActivity({
		provider: 'astral_now_playing',
		title: playback.currentTrack.title,
		artists: playback.currentTrack.artists,
		album: playback.currentTrack.album,
		artworkUrl: playback.currentTrack.artworkUrl,
		trackUrl: playback.currentTrack.trackUrl,
		isPlaying: !playback.paused,
		showProvider,
		progressMs: playback.position,
		durationMs: playback.duration,
		updatedAt: playback.updatedAt || Date.now(),
	});
};
