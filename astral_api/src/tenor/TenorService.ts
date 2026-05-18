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
import {Config} from '~/Config';
import {ASTRAL_USER_AGENT} from '~/Constants';
import type {ICacheService} from '~/infrastructure/ICacheService';
import type {IMediaService} from '~/infrastructure/IMediaService';
import type {ITenorService} from '~/infrastructure/ITenorService';
import {Logger} from '~/Logger';
import type {TenorCategoryTagResponse, TenorGifResponse} from '~/tenor/TenorModel';

const GIPHY_BASE_URL = 'https://api.giphy.com/v1';
const MAX_RETRIES = 3;
const BACKOFF_BASE_DELAY = 1000;
const CACHE_EXPIRATION_TIME = 300 * 1000;

type CacheEntry<T> = {
	data: T;
	timestamp: number;
};

type GiphyMedia = {
	url?: string;
	mp4?: string;
	width?: string;
	height?: string;
};

type GiphyGif = {
	id: string;
	title?: string;
	url?: string;
	bitly_url?: string;
	images?: {
		preview?: GiphyMedia;
		fixed_height?: GiphyMedia;
		original?: GiphyMedia;
		downsized?: GiphyMedia;
	};
};

type GiphySearchResponse = {
	data: Array<GiphyGif>;
};

type GiphySuggestResponse = {
	data: Array<{name: string}>;
};

type GiphyTrendingSearchesResponse = {
	data: Array<string>;
};

const parseDimension = (value?: string, fallback = 0): number => {
	if (!value) return fallback;
	const parsed = Number.parseInt(value, 10);
	return Number.isFinite(parsed) ? parsed : fallback;
};

const toGiphyLang = (locale: string): string => {
	const normalized = locale.replace('_', '-').toLowerCase();
	const [lang] = normalized.split('-');
	return lang || 'en';
};

const getGifProviderApiKey = (): string | undefined =>
	Config.tenor.apiKey || process.env.GIPHY_API_KEY || process.env.TENOR_API_KEY;

export class TenorService implements ITenorService {
	private readonly FEATURED_CACHE_KEY = 'tenor:featured';
	private readonly TRENDING_CACHE_KEY = 'tenor:trending';

	private refreshingKeys: Map<string, boolean> = new Map();

	constructor(
		private cacheService: ICacheService,
		private mediaService: IMediaService,
	) {}

	private createURL({
		endpoint,
		params,
	}: {
		endpoint: string;
		params: Record<string, string | number | undefined>;
	}): URL {
		const url = new URL(`${GIPHY_BASE_URL}/${endpoint}`);
		const defaultParams = {
			api_key: getGifProviderApiKey(),
			...params,
		};

		for (const [key, value] of Object.entries(defaultParams)) {
			if (value !== undefined && value !== '') {
				url.searchParams.append(key, value.toString());
			}
		}

		return url;
	}

	private async fetchGiphyData<T>(url: URL): Promise<T> {
		for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
			try {
				const response = await fetch(url.toString(), {headers: {'User-Agent': ASTRAL_USER_AGENT}});
				if (!response.ok) {
					throw new Error(`Failed to fetch GIPHY data: ${response.statusText}`);
				}
				return response.json() as Promise<T>;
			} catch (error) {
				if (attempt < MAX_RETRIES - 1) {
					const delay = BACKOFF_BASE_DELAY * 2 ** attempt;
					await new Promise((resolve) => setTimeout(resolve, delay));
				} else {
					throw error;
				}
			}
		}

		throw new Error('Exceeded maximum retries');
	}

	private transformGif(input: GiphyGif): TenorGifResponse | null {
		const preview = input.images?.preview;
		const fixedHeight = input.images?.fixed_height;
		const original = input.images?.original;
		const downsized = input.images?.downsized;

		const src =
			preview?.mp4 ??
			fixedHeight?.mp4 ??
			original?.mp4 ??
			preview?.url ??
			fixedHeight?.url ??
			downsized?.url ??
			original?.url;

		if (!src) {
			return null;
		}

		const width =
			parseDimension(preview?.width) ||
			parseDimension(fixedHeight?.width) ||
			parseDimension(downsized?.width) ||
			parseDimension(original?.width, 320);
		const height =
			parseDimension(preview?.height) ||
			parseDimension(fixedHeight?.height) ||
			parseDimension(downsized?.height) ||
			parseDimension(original?.height, 240);

		return {
			id: input.id,
			title: input.title || 'GIF',
			url: input.url || input.bitly_url || '',
			src,
			proxy_src: this.mediaService.getExternalMediaProxyURL(src),
			width,
			height,
		};
	}

	private async fetchAndTransformGifs(url: URL): Promise<Array<TenorGifResponse>> {
		const {data} = await this.fetchGiphyData<GiphySearchResponse>(url);
		return data.map((gif) => this.transformGif(gif)).filter((gif): gif is TenorGifResponse => gif !== null);
	}

	private async getCache<T>(key: string): Promise<{data: T; isStale: boolean} | null> {
		const cached = await this.cacheService.get<CacheEntry<T>>(key);
		if (!cached) return null;

		const age = Date.now() - cached.timestamp;
		const isStale = age > CACHE_EXPIRATION_TIME;
		return {data: cached.data, isStale};
	}

	private async setCache<T>(key: string, data: T): Promise<void> {
		const cacheEntry: CacheEntry<T> = {
			data,
			timestamp: Date.now(),
		};
		await this.cacheService.set(key, cacheEntry);
	}

	private triggerBackgroundRefresh<T>(key: string, refreshFn: () => Promise<T>): void {
		if (this.refreshingKeys.get(key)) {
			return;
		}

		this.refreshingKeys.set(key, true);

		setImmediate(async () => {
			try {
				const freshData = await refreshFn();
				await this.setCache(key, freshData);
			} catch (error) {
				Logger.debug({key, error}, `Background refresh failed for key ${key}`);
			} finally {
				this.refreshingKeys.delete(key);
			}
		});
	}

	async search(params: {q: string; locale: string; ctx: Context}): Promise<Array<TenorGifResponse>> {
		void params.ctx;
		const url = this.createURL({
			endpoint: 'gifs/search',
			params: {
				q: params.q,
				lang: toGiphyLang(params.locale),
				limit: 50,
				rating: 'pg-13',
			},
		});
		return this.fetchAndTransformGifs(url);
	}

	async registerShare(_params: {id: string; q: string; locale: string; ctx: Context}): Promise<void> {
		// GIPHY does not require an equivalent share registration endpoint.
	}

	async getFeatured(params: {locale: string; ctx: Context}): Promise<{
		gifs: Array<TenorGifResponse>;
		categories: Array<TenorCategoryTagResponse>;
	}> {
		const cached = await this.getCache<{
			gifs: Array<TenorGifResponse>;
			categories: Array<TenorCategoryTagResponse>;
		}>(this.FEATURED_CACHE_KEY);

		if (cached) {
			if (cached.isStale) {
				this.triggerBackgroundRefresh(this.FEATURED_CACHE_KEY, () => this.fetchFeaturedData(params));
			}
			return cached.data;
		}

		const data = await this.fetchFeaturedData(params);
		await this.setCache(this.FEATURED_CACHE_KEY, data);
		return data;
	}

	private async fetchFeaturedData(params: {locale: string; ctx: Context}): Promise<{
		gifs: Array<TenorGifResponse>;
		categories: Array<TenorCategoryTagResponse>;
	}> {
		const [gifs, categories] = await Promise.all([this.getFeaturedGifs(params), this.getFeaturedCategories(params)]);
		return {gifs, categories};
	}

	async getTrendingGifs(params: {locale: string; ctx: Context}): Promise<Array<TenorGifResponse>> {
		const cached = await this.getCache<Array<TenorGifResponse>>(this.TRENDING_CACHE_KEY);

		if (cached) {
			if (cached.isStale) {
				this.triggerBackgroundRefresh(this.TRENDING_CACHE_KEY, () => this.fetchTrendingGifs(params));
			}
			return cached.data;
		}

		const gifs = await this.fetchTrendingGifs(params);
		await this.setCache(this.TRENDING_CACHE_KEY, gifs);
		return gifs;
	}

	private async fetchTrendingGifs(params: {locale: string; ctx: Context}): Promise<Array<TenorGifResponse>> {
		void params.ctx;
		const url = this.createURL({
			endpoint: 'gifs/trending',
			params: {
				limit: 50,
				rating: 'pg-13',
				lang: toGiphyLang(params.locale),
			},
		});
		return this.fetchAndTransformGifs(url);
	}

	async suggest(params: {q: string; locale: string; ctx: Context}): Promise<Array<string>> {
		void params.ctx;
		const url = this.createURL({
			endpoint: 'gifs/search/tags',
			params: {
				q: params.q,
				lang: toGiphyLang(params.locale),
				limit: 20,
			},
		});

		const {data} = await this.fetchGiphyData<GiphySuggestResponse>(url);
		return data.map((entry) => entry.name).filter((name) => name.length > 0);
	}

	private async getFeaturedGifs(params: {locale: string; ctx: Context}): Promise<Array<TenorGifResponse>> {
		void params.ctx;
		const url = this.createURL({
			endpoint: 'gifs/trending',
			params: {
				limit: 24,
				rating: 'pg-13',
				lang: toGiphyLang(params.locale),
			},
		});
		return this.fetchAndTransformGifs(url);
	}

	private async getFeaturedCategories(params: {
		locale: string;
		ctx: Context;
	}): Promise<Array<TenorCategoryTagResponse>> {
		const [searches, gifs] = await Promise.all([
			this.fetchGiphyData<GiphyTrendingSearchesResponse>(
				this.createURL({
					endpoint: 'trending/searches',
					params: {},
				}),
			),
			this.getFeaturedGifs(params),
		]);

		if (gifs.length === 0) {
			return [];
		}

		return searches.data
			.filter((term) => term.trim().length > 0)
			.slice(0, 24)
			.map((term, index) => {
				const gif = gifs[index % gifs.length];
				return {
					name: term,
					src: gif.src,
					proxy_src: gif.proxy_src,
				};
			});
	}
}
