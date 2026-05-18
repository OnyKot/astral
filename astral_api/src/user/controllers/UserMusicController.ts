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

import type {Context} from 'hono';
import type {HonoApp, HonoEnv} from '~/App';
import {DefaultUserOnly, LoginRequired} from '~/middleware/AuthMiddleware';
import {RateLimitMiddleware} from '~/middleware/RateLimitMiddleware';
import {RateLimitConfigs} from '~/RateLimitConfig';

const MUSIC_STATE_CACHE_PREFIX = 'astramusic:music-state:';
const MUSIC_PLAYBACK_CACHE_PREFIX = 'astramusic:music-playback:';
const MUSIC_STATE_TTL_SECONDS = 60 * 60 * 24 * 90;
const MUSIC_PLAYBACK_TTL_SECONDS = 60 * 60 * 24 * 30;
const MUSIC_STATE_MAX_BYTES = 5 * 1024 * 1024;
const MUSIC_PLAYBACK_MAX_BYTES = 256 * 1024;
const MUSIC_STATE_ARRAY_KEYS = [
	'favorites_tracks',
	'favorites_albums',
	'favorites_artists',
	'favorites_playlists',
	'favorites_mixes',
	'history_tracks',
	'user_playlists',
	'user_folders',
] as const;

const createEmptyMusicState = () => ({
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

const sanitizeString = (value: unknown, maxLength: number): string => String(value || '').trim().slice(0, maxLength);

const clampNumber = (value: unknown, fallback: number, max: number): number => {
	const numericValue = Number(value);
	if (!Number.isFinite(numericValue)) {
		return fallback;
	}
	return Math.max(0, Math.min(numericValue, max));
};

const cloneJsonWithLimit = <T>(value: T, maxBytes: number, errorCode: string): T => {
	const json = JSON.stringify(value ?? null);
	if (Buffer.byteLength(json, 'utf8') > maxBytes) {
		throw new Error(errorCode);
	}
	return JSON.parse(json) as T;
};

const sanitizeMusicState = (payload: unknown) => {
	const raw = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {};
	const state = createEmptyMusicState() as Record<string, unknown>;

	for (const key of MUSIC_STATE_ARRAY_KEYS) {
		const value = raw[key];
		if (Array.isArray(value)) {
			state[key] = value;
			continue;
		}
		if (value && typeof value === 'object') {
			state[key] = Object.values(value);
		}
	}

	if (raw.profile && typeof raw.profile === 'object' && !Array.isArray(raw.profile)) {
		state.profile = raw.profile;
	}

	return cloneJsonWithLimit(state, MUSIC_STATE_MAX_BYTES, 'music_state_too_large');
};

const sanitizeMusicPlaybackState = (payload: unknown) => {
	if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
		return null;
	}

	const raw = payload as Record<string, unknown>;
	if (!raw.currentTrack || typeof raw.currentTrack !== 'object' || Array.isArray(raw.currentTrack)) {
		return null;
	}

	const currentTrack = cloneJsonWithLimit(raw.currentTrack, MUSIC_PLAYBACK_MAX_BYTES, 'music_playback_too_large');
	const normalizedPlayback = {
		currentTrack,
		position: clampNumber(raw.position, 0, 60 * 60 * 24),
		duration: clampNumber(raw.duration, 0, 60 * 60 * 24),
		paused: raw.paused !== false,
		updatedAt: clampNumber(raw.updatedAt, Date.now(), Number.MAX_SAFE_INTEGER),
		deviceId: sanitizeString(raw.deviceId, 128),
		deviceName: sanitizeString(raw.deviceName ?? raw.device, 128),
		source: sanitizeString(raw.source, 64),
	};

	return cloneJsonWithLimit(normalizedPlayback, MUSIC_PLAYBACK_MAX_BYTES, 'music_playback_too_large');
};

const createCacheKey = (prefix: string, userId: unknown) => `${prefix}${String(userId)}`;

export const UserMusicController = (app: HonoApp) => {
	const getState = async (ctx: Context<HonoEnv>) => {
		const cacheKey = createCacheKey(MUSIC_STATE_CACHE_PREFIX, ctx.get('user').id);
		const state = await ctx.get('cacheService').get<unknown>(cacheKey);
		return ctx.json({state: sanitizeMusicState(state)});
	};

	const saveState = async (ctx: Context<HonoEnv>) => {
		const body = await ctx.req.json().catch(() => ({}));
		const state = sanitizeMusicState(body?.state);
		const cacheKey = createCacheKey(MUSIC_STATE_CACHE_PREFIX, ctx.get('user').id);
		await ctx.get('cacheService').set(cacheKey, state, MUSIC_STATE_TTL_SECONDS);
		return ctx.json({ok: true, state});
	};

	const getPlayback = async (ctx: Context<HonoEnv>) => {
		const cacheKey = createCacheKey(MUSIC_PLAYBACK_CACHE_PREFIX, ctx.get('user').id);
		const playback = await ctx.get('cacheService').get<unknown>(cacheKey);
		return ctx.json({playback: sanitizeMusicPlaybackState(playback)});
	};

	const savePlayback = async (ctx: Context<HonoEnv>) => {
		const body = await ctx.req.json().catch(() => ({}));
		const playback = sanitizeMusicPlaybackState(body?.playback);
		const cacheKey = createCacheKey(MUSIC_PLAYBACK_CACHE_PREFIX, ctx.get('user').id);

		if (playback === null) {
			await ctx.get('cacheService').delete(cacheKey);
			return ctx.json({ok: true, playback: null});
		}

		await ctx.get('cacheService').set(cacheKey, playback, MUSIC_PLAYBACK_TTL_SECONDS);
		return ctx.json({ok: true, playback});
	};

	app.get('/music/state', RateLimitMiddleware(RateLimitConfigs.USER_SETTINGS_GET), LoginRequired, DefaultUserOnly, getState);
	app.post(
		'/music/state/save',
		RateLimitMiddleware(RateLimitConfigs.USER_SETTINGS_UPDATE),
		LoginRequired,
		DefaultUserOnly,
		saveState,
	);

	app.get(
		'/users/@me/music/state',
		RateLimitMiddleware(RateLimitConfigs.USER_SETTINGS_GET),
		LoginRequired,
		DefaultUserOnly,
		getState,
	);
	app.post(
		'/users/@me/music/state',
		RateLimitMiddleware(RateLimitConfigs.USER_SETTINGS_UPDATE),
		LoginRequired,
		DefaultUserOnly,
		saveState,
	);

	app.get(
		'/music/playback',
		RateLimitMiddleware(RateLimitConfigs.USER_SETTINGS_GET),
		LoginRequired,
		DefaultUserOnly,
		getPlayback,
	);
	app.post(
		'/music/playback/save',
		RateLimitMiddleware(RateLimitConfigs.USER_SETTINGS_UPDATE),
		LoginRequired,
		DefaultUserOnly,
		savePlayback,
	);

	app.get(
		'/users/@me/music/playback',
		RateLimitMiddleware(RateLimitConfigs.USER_SETTINGS_GET),
		LoginRequired,
		DefaultUserOnly,
		getPlayback,
	);
	app.post(
		'/users/@me/music/playback',
		RateLimitMiddleware(RateLimitConfigs.USER_SETTINGS_UPDATE),
		LoginRequired,
		DefaultUserOnly,
		savePlayback,
	);
};
