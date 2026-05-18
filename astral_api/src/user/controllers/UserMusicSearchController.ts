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

import type {HonoApp} from '../../App';
import {Config} from '../../Config';
import {RateLimitMiddleware} from '../../middleware/RateLimitMiddleware';
import {RateLimitConfigs} from '../../RateLimitConfig';
import {MusicSearchService} from '../services/MusicSearchService';

const MUSIC_SEARCH_CACHE_PREFIX = 'astramusic:search:v1:';

function sanitizeQuery(value: string | null): string {
	return String(value || '').trim().slice(0, 160);
}

function sanitizeProvider(value: string | null): string {
	return String(value || 'tidal').trim().toLowerCase() || 'tidal';
}

function sanitizeSectionLimit(value: string | null): number {
	const parsed = Number.parseInt(String(value || ''), 10);
	if (!Number.isFinite(parsed) || parsed <= 0) {
		return Config.musicSearch.sectionLimit;
	}
	return Math.max(1, Math.min(parsed, 24));
}

export const UserMusicSearchController = (app: HonoApp) => {
	app.get('/music/search', RateLimitMiddleware(RateLimitConfigs.SEARCH_MESSAGES), async (ctx) => {
		if (!Config.musicSearch.enabled) {
			return ctx.json({error: 'music_search_disabled'}, 404);
		}

		const url = new URL(ctx.req.url);
		const query = sanitizeQuery(url.searchParams.get('q'));
		const provider = sanitizeProvider(url.searchParams.get('provider'));
		const sectionLimit = sanitizeSectionLimit(url.searchParams.get('section_limit'));

		if (!query) {
			return ctx.json(await MusicSearchService.getInstance().search('', provider, sectionLimit));
		}

		const cacheKey = `${MUSIC_SEARCH_CACHE_PREFIX}${provider}:${sectionLimit}:${query.toLowerCase()}`;
		const cached = await ctx.get('cacheService').get(cacheKey);
		if (cached) {
			return ctx.json(cached);
		}

		try {
			const result = await MusicSearchService.getInstance().search(query, provider, sectionLimit);
			await ctx.get('cacheService').set(cacheKey, result, Config.musicSearch.cacheTtlSeconds);
			return ctx.json(result);
		} catch (error) {
			return ctx.json(
				{
					error: 'music_search_failed',
					message: error instanceof Error ? error.message : 'music_search_failed',
				},
				502,
			);
		}
	});
};
