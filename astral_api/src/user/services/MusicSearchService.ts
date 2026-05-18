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

import {Config} from '../../Config';
import {Logger} from '../../Logger';
import {transliterate as tr} from 'transliteration';

type MusicSearchItem = Record<string, unknown>;

export interface MusicSearchSection {
	items: Array<MusicSearchItem>;
	limit: number;
	offset: number;
	totalNumberOfItems: number;
}

export interface MusicSearchResponse {
	tracks: MusicSearchSection;
	videos: MusicSearchSection;
	artists: MusicSearchSection;
	albums: MusicSearchSection;
	playlists: MusicSearchSection;
	meta: {
		engine: 'typesense' | 'upstream' | 'empty';
		indexed: boolean;
	};
}

type MusicSectionName = keyof Omit<MusicSearchResponse, 'meta'>;
type MusicDocumentKind = 'track' | 'video' | 'artist' | 'album' | 'playlist';

interface TypesenseHitDocument {
	payload_json?: string;
}

const EMPTY_SECTION: MusicSearchSection = {
	items: [],
	limit: 0,
	offset: 0,
	totalNumberOfItems: 0,
};

const SECTION_TO_KIND: Record<MusicSectionName, MusicDocumentKind> = {
	tracks: 'track',
	videos: 'video',
	artists: 'artist',
	albums: 'album',
	playlists: 'playlist',
};

const KEYBOARD_LAYOUT_EN = "`qwertyuiop[]asdfghjkl;'zxcvbnm,./";
const KEYBOARD_LAYOUT_RU = 'ёйцукенгшщзхъфывапролджэячсмитьбю.';

const LATIN_TO_CYRILLIC_MULTI: Array<[string, string]> = [
	['dzh', 'дж'],
	['shch', 'щ'],
	['sch', 'щ'],
	['yo', 'ё'],
	['jo', 'ё'],
	['yu', 'ю'],
	['ju', 'ю'],
	['ya', 'я'],
	['ja', 'я'],
	['ye', 'е'],
	['zh', 'ж'],
	['kh', 'х'],
	['ts', 'ц'],
	['ch', 'ч'],
	['sh', 'ш'],
];

const LATIN_TO_CYRILLIC_SINGLE: Record<string, string> = {
	a: 'а',
	b: 'б',
	c: 'к',
	d: 'д',
	e: 'е',
	f: 'ф',
	g: 'г',
	h: 'х',
	i: 'и',
	j: 'й',
	k: 'к',
	l: 'л',
	m: 'м',
	n: 'н',
	o: 'о',
	p: 'п',
	q: 'к',
	r: 'р',
	s: 'с',
	t: 'т',
	u: 'у',
	v: 'в',
	w: 'в',
	x: 'кс',
	y: 'й',
	z: 'з',
};

const KEYBOARD_SWAP_MAP = new Map<string, string>();
for (let index = 0; index < KEYBOARD_LAYOUT_EN.length; index++) {
	KEYBOARD_SWAP_MAP.set(KEYBOARD_LAYOUT_EN[index], KEYBOARD_LAYOUT_RU[index]);
	KEYBOARD_SWAP_MAP.set(KEYBOARD_LAYOUT_RU[index], KEYBOARD_LAYOUT_EN[index]);
}

function createEmptyResponse(engine: MusicSearchResponse['meta']['engine'] = 'empty'): MusicSearchResponse {
	return {
		tracks: {...EMPTY_SECTION},
		videos: {...EMPTY_SECTION},
		artists: {...EMPTY_SECTION},
		albums: {...EMPTY_SECTION},
		playlists: {...EMPTY_SECTION},
		meta: {
			engine,
			indexed: false,
		},
	};
}

function normalizeQuery(value: unknown): string {
	return String(value || '')
		.normalize('NFKC')
		.replace(/[\u2018-\u201f]/g, "'")
		.replace(/[\u2013\u2014]/g, '-')
		.replace(/\s+/g, ' ')
		.trim()
		.toLowerCase();
}

function normalizeYo(value: string): string {
	return value.replace(/ё/g, 'е');
}

function swapKeyboardLayout(value: string): string {
	let changed = false;
	const output = Array.from(value, (char) => {
		const mapped = KEYBOARD_SWAP_MAP.get(char);
		if (!mapped) return char;
		changed = true;
		return mapped;
	}).join('');
	return changed ? output : value;
}

function transliterateLatinToCyrillic(value: string): string {
	let index = 0;
	let output = '';

	while (index < value.length) {
		const rest = value.slice(index);
		let matched = false;

		for (const [latin, cyrillic] of LATIN_TO_CYRILLIC_MULTI) {
			if (!rest.startsWith(latin)) continue;
			output += cyrillic;
			index += latin.length;
			matched = true;
			break;
		}

		if (matched) continue;

		const char = value[index];
		output += LATIN_TO_CYRILLIC_SINGLE[char] || char;
		index++;
	}

	return output;
}

function buildSearchVariants(value: unknown): Array<string> {
	const normalized = normalizeQuery(value);
	if (!normalized) return [];

	const variants = new Set<string>();
	const add = (candidate: string) => {
		const normalizedCandidate = normalizeQuery(candidate);
		if (!normalizedCandidate) return;
		variants.add(normalizedCandidate);
		variants.add(normalizeYo(normalizedCandidate));
	};

	add(normalized);
	add(swapKeyboardLayout(normalized));
	add(tr(normalized));
	add(transliterateLatinToCyrillic(normalized));

	return Array.from(variants).filter(Boolean);
}

function uniqueStrings(values: Array<string>): Array<string> {
	return Array.from(new Set(values.map((value) => normalizeQuery(value)).filter(Boolean)));
}

function findSearchSection(source: unknown, key: string, visited = new Set<unknown>()): Record<string, unknown> | null {
	if (!source || typeof source !== 'object') return null;

	if (Array.isArray(source)) {
		for (const entry of source) {
			const found = findSearchSection(entry, key, visited);
			if (found) return found;
		}
		return null;
	}

	if (visited.has(source)) return null;
	visited.add(source);

	if ('items' in source && Array.isArray((source as {items?: Array<unknown>}).items)) {
		return source as Record<string, unknown>;
	}

	if (key in source) {
		const found = findSearchSection((source as Record<string, unknown>)[key], key, visited);
		if (found) return found;
	}

	for (const value of Object.values(source as Record<string, unknown>)) {
		const found = findSearchSection(value, key, visited);
		if (found) return found;
	}

	return null;
}

function buildSection(section: Record<string, unknown> | null, provider: string, limit: number): MusicSearchSection {
	const sectionItems = section?.items;
	const items = Array.isArray(sectionItems)
		? sectionItems.slice(0, limit).map((item) => ({...(item as MusicSearchItem), provider}))
		: [];

	return {
		items,
		limit: Math.min(limit, Number(section?.limit) || items.length),
		offset: Number(section?.offset) || 0,
		totalNumberOfItems: Number(section?.totalNumberOfItems) || items.length,
	};
}

function totalItemsCount(response: MusicSearchResponse): number {
	return response.tracks.items.length +
		response.videos.items.length +
		response.artists.items.length +
		response.albums.items.length +
		response.playlists.items.length;
}

function extractArtistNames(item: MusicSearchItem): Array<string> {
	const names = new Set<string>();
	const artist = item.artist;
	if (artist && typeof artist === 'object' && !Array.isArray(artist)) {
		const artistRecord = artist as Record<string, unknown>;
		if (typeof artistRecord.name === 'string') {
			names.add(artistRecord.name);
		}
	}

	const artists = item.artists;
	if (Array.isArray(artists)) {
		for (const artistEntry of artists) {
			if (artistEntry && typeof artistEntry === 'object' && !Array.isArray(artistEntry)) {
				const artistRecord = artistEntry as Record<string, unknown>;
				if (typeof artistRecord.name === 'string') {
					names.add(artistRecord.name);
				}
			}
		}
	}

	return Array.from(names);
}

function buildDocumentId(kind: MusicDocumentKind, provider: string, item: MusicSearchItem): string {
	const entityId =
		typeof item.uuid === 'string'
			? item.uuid
			: typeof item.id === 'string' || typeof item.id === 'number'
				? String(item.id)
				: typeof item.originalId === 'string' || typeof item.originalId === 'number'
					? String(item.originalId)
					: `${kind}:${typeof item.title === 'string' ? item.title : typeof item.name === 'string' ? item.name : 'unknown'}`;

	return `${provider}:${kind}:${entityId}`;
}

function createTypesenseDocument(kind: MusicDocumentKind, provider: string, item: MusicSearchItem): Record<string, unknown> {
	const title = typeof item.title === 'string' ? item.title : '';
	const name = typeof item.name === 'string' ? item.name : title;
	const artistNames = extractArtistNames(item);
	const albumRecord =
		item.album && typeof item.album === 'object' && !Array.isArray(item.album)
			? (item.album as Record<string, unknown>)
			: null;
	const albumTitle = typeof albumRecord?.title === 'string' ? albumRecord.title : '';

	const searchTerms = uniqueStrings([
		title,
		name,
		albumTitle,
		...artistNames,
		...buildSearchVariants(title),
		...buildSearchVariants(name),
		...buildSearchVariants(albumTitle),
		...artistNames.flatMap((artistName) => buildSearchVariants(artistName)),
	]);

	const popularityRaw =
		typeof item.popularity === 'number'
			? item.popularity
			: typeof item.popularity === 'string'
				? Number.parseInt(item.popularity, 10)
				: 0;

	return {
		id: buildDocumentId(kind, provider, item),
		kind,
		provider,
		entity_id:
			typeof item.uuid === 'string'
				? item.uuid
				: typeof item.id === 'string' || typeof item.id === 'number'
					? String(item.id)
					: '',
		title,
		name,
		primary_artist: artistNames[0] || '',
		artist_names: artistNames,
		album_title: albumTitle,
		search_terms: searchTerms,
		popularity: Number.isFinite(popularityRaw) ? popularityRaw : 0,
		updated_at: Date.now(),
		payload_json: JSON.stringify({...item, provider}),
	};
}

function mergeUniqueItems(items: Array<MusicSearchItem>, limit: number): MusicSearchSection {
	const merged: Array<MusicSearchItem> = [];
	const seen = new Set<string>();

	for (const item of items) {
		const key =
			typeof item.uuid === 'string'
				? item.uuid
				: typeof item.id === 'string' || typeof item.id === 'number'
					? String(item.id)
					: JSON.stringify([item.provider, item.title, item.name]);
		if (seen.has(key)) continue;
		seen.add(key);
		merged.push(item);
		if (merged.length >= limit) break;
	}

	return {
		items: merged,
		limit,
		offset: 0,
		totalNumberOfItems: merged.length,
	};
}

export class MusicSearchService {
	private static instance: MusicSearchService | null = null;
	private ensureCollectionPromise: Promise<void> | null = null;
	private readonly backgroundRefreshes = new Map<string, Promise<void>>();

	static getInstance(): MusicSearchService {
		if (!MusicSearchService.instance) {
			MusicSearchService.instance = new MusicSearchService();
		}
		return MusicSearchService.instance;
	}

	isEnabled(): boolean {
		return Config.musicSearch.enabled;
	}

	isTypesenseEnabled(): boolean {
		return Boolean(Config.musicSearch.typesense.url && Config.musicSearch.typesense.apiKey);
	}

	getDefaultSectionLimit(): number {
		return Config.musicSearch.sectionLimit;
	}

	private getTypesenseBaseUrl(): string {
		const baseUrl = Config.musicSearch.typesense.url;
		if (!baseUrl) {
			throw new Error('music_typesense_url_missing');
		}
		return baseUrl;
	}

	async search(query: string, provider = 'tidal', sectionLimit = this.getDefaultSectionLimit()): Promise<MusicSearchResponse> {
		const normalizedQuery = normalizeQuery(query);
		if (!normalizedQuery) {
			return createEmptyResponse();
		}

		if (this.isTypesenseEnabled()) {
			try {
				const indexedResponse = await this.searchTypesense(normalizedQuery, provider, sectionLimit);
				const indexedItemsCount = totalItemsCount(indexedResponse);
				if (indexedItemsCount > 0) {
					if (indexedItemsCount < Config.musicSearch.minIndexedHits) {
						this.refreshIndexInBackground(normalizedQuery, provider, sectionLimit);
					}
					return indexedResponse;
				}

				const upstreamResponse = await this.searchUpstream(normalizedQuery, provider, sectionLimit);
				if (totalItemsCount(upstreamResponse) > 0) {
					void this.indexResponse(upstreamResponse, provider);
					return upstreamResponse;
				}

				return indexedResponse;
			} catch (error) {
				Logger.warn({error, query: normalizedQuery}, 'Typesense search failed, falling back to upstream music search');
			}
		}

		return this.searchUpstream(normalizedQuery, provider, sectionLimit);
	}

	private refreshIndexInBackground(query: string, provider: string, sectionLimit: number): void {
		if (!this.isTypesenseEnabled()) return;

		const key = `${provider}:${sectionLimit}:${query}`;
		if (this.backgroundRefreshes.has(key)) return;

		const task = (async () => {
			try {
				const upstreamResponse = await this.searchUpstream(query, provider, sectionLimit);
				if (totalItemsCount(upstreamResponse) > 0) {
					await this.indexResponse(upstreamResponse, provider);
				}
			} catch (error) {
				Logger.debug({error, provider, query}, 'Background music search refresh failed');
			} finally {
				this.backgroundRefreshes.delete(key);
			}
		})();

		this.backgroundRefreshes.set(key, task);
	}

	private async searchUpstream(query: string, provider: string, sectionLimit: number): Promise<MusicSearchResponse> {
		for (const upstream of Config.musicSearch.upstreams) {
			const baseUrl = String(upstream || '').trim().replace(/\/+$/, '');
			if (!baseUrl) continue;

			try {
				const response = await fetch(`${baseUrl}/search/?q=${encodeURIComponent(query)}`, {
					signal: AbortSignal.timeout(Config.musicSearch.upstreamTimeoutMs),
				});

				if (!response.ok) {
					if (response.status === 429 || response.status >= 500) {
						continue;
					}
					throw new Error(`music_upstream_search_failed_${response.status}`);
				}

				const data = (await response.json()) as Record<string, unknown>;
				return {
					tracks: buildSection(findSearchSection(data, 'tracks'), provider, sectionLimit),
					videos: buildSection(findSearchSection(data, 'videos'), provider, sectionLimit),
					artists: buildSection(findSearchSection(data, 'artists'), provider, sectionLimit),
					albums: buildSection(findSearchSection(data, 'albums'), provider, sectionLimit),
					playlists: buildSection(findSearchSection(data, 'playlists'), provider, sectionLimit),
					meta: {
						engine: 'upstream',
						indexed: this.isTypesenseEnabled(),
					},
				};
			} catch (error) {
				Logger.debug({error, upstream: baseUrl, query}, 'Music upstream search instance failed');
			}
		}

		return createEmptyResponse('upstream');
	}

	private async searchTypesense(query: string, provider: string, sectionLimit: number): Promise<MusicSearchResponse> {
		await this.ensureCollection();
		const sectionEntries = await this.searchTypesenseSections(query, provider, sectionLimit);

		const response = createEmptyResponse('typesense');
		for (const [sectionName, section] of sectionEntries) {
			response[sectionName] = section;
		}
		response.meta.indexed = true;
		return response;
	}

	private async searchTypesenseSections(
		query: string,
		provider: string,
		sectionLimit: number,
	): Promise<Array<readonly [MusicSectionName, MusicSearchSection]>> {
		const baseUrl = this.getTypesenseBaseUrl();
		const url = new URL('/multi_search', baseUrl);
		const searches = (Object.entries(SECTION_TO_KIND) as Array<[MusicSectionName, MusicDocumentKind]>).map(
			([, kind]) => ({
				collection: Config.musicSearch.typesense.collection,
				q: query,
				query_by: 'title,name,primary_artist,artist_names,album_title,search_terms',
				filter_by: `kind:=${kind} && provider:=${provider}`,
				per_page: sectionLimit,
				prefix: true,
				drop_tokens_threshold: 1,
				prioritize_token_position: true,
				sort_by: '_text_match:desc,popularity:desc,updated_at:desc',
				include_fields: 'payload_json',
			}),
		);

		const data = (await this.fetchTypesenseJson(url.toString(), {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({searches}),
		})) as {
			results?: Array<{
				hits?: Array<{document?: TypesenseHitDocument}>;
			}>;
		};

		return (Object.entries(SECTION_TO_KIND) as Array<[MusicSectionName, MusicDocumentKind]>).map(([sectionName], index) => {
			const items = (data.results?.[index]?.hits || [])
				.map((hit) => {
					try {
						return hit.document?.payload_json ? (JSON.parse(hit.document.payload_json) as MusicSearchItem) : null;
					} catch {
						return null;
					}
				})
				.filter((item): item is MusicSearchItem => Boolean(item));

			return [sectionName, mergeUniqueItems(items, sectionLimit)] as const;
		});
	}

	private async indexResponse(response: MusicSearchResponse, provider: string): Promise<void> {
		if (!this.isTypesenseEnabled()) return;

		const documents = (Object.entries(SECTION_TO_KIND) as Array<[MusicSectionName, MusicDocumentKind]>)
			.flatMap(([sectionName, kind]) => response[sectionName].items.map((item) => createTypesenseDocument(kind, provider, item)))
			.filter((document) => Array.isArray(document.search_terms) && document.search_terms.length > 0);

		if (documents.length === 0) return;

		await this.ensureCollection();

		const ndjson = documents.map((document) => JSON.stringify(document)).join('\n');
		const baseUrl = this.getTypesenseBaseUrl();
		const url = new URL(
			`/collections/${encodeURIComponent(Config.musicSearch.typesense.collection)}/documents/import`,
			baseUrl,
		);
		url.searchParams.set('action', 'upsert');
		url.searchParams.set('dirty_values', 'coerce_or_drop');

		const responseImport = await fetch(url.toString(), {
			method: 'POST',
			headers: this.getTypesenseHeaders({
				'Content-Type': 'text/plain',
			}),
			body: ndjson,
			signal: AbortSignal.timeout(Config.musicSearch.typesense.timeoutMs),
		});

		if (!responseImport.ok) {
			const body = await responseImport.text().catch(() => '');
			throw new Error(`music_typesense_import_failed_${responseImport.status}:${body}`);
		}
	}

	private async ensureCollection(): Promise<void> {
		if (this.ensureCollectionPromise) {
			return this.ensureCollectionPromise;
		}

		this.ensureCollectionPromise = this.ensureCollectionInternal().catch((error) => {
			this.ensureCollectionPromise = null;
			throw error;
		});

		return this.ensureCollectionPromise;
	}

	private async ensureCollectionInternal(): Promise<void> {
		const collectionName = Config.musicSearch.typesense.collection;
		const baseUrl = this.getTypesenseBaseUrl();
		const collectionUrl = new URL(`/collections/${encodeURIComponent(collectionName)}`, baseUrl);
		const response = await fetch(collectionUrl.toString(), {
			headers: this.getTypesenseHeaders(),
			signal: AbortSignal.timeout(Config.musicSearch.typesense.timeoutMs),
		});

		if (response.ok) return;
		if (response.status !== 404) {
			const body = await response.text().catch(() => '');
			throw new Error(`music_typesense_collection_probe_failed_${response.status}:${body}`);
		}

		const createResponse = await fetch(new URL('/collections', baseUrl).toString(), {
			method: 'POST',
			headers: this.getTypesenseHeaders({
				'Content-Type': 'application/json',
			}),
			body: JSON.stringify({
				name: collectionName,
				fields: [
					{name: 'kind', type: 'string', facet: true},
					{name: 'provider', type: 'string', facet: true},
					{name: 'entity_id', type: 'string'},
					{name: 'title', type: 'string', optional: true},
					{name: 'name', type: 'string', optional: true},
					{name: 'primary_artist', type: 'string', optional: true},
					{name: 'artist_names', type: 'string[]', optional: true},
					{name: 'album_title', type: 'string', optional: true},
					{name: 'search_terms', type: 'string[]', optional: true},
					{name: 'popularity', type: 'int32', optional: true, sort: true},
					{name: 'updated_at', type: 'int64', sort: true},
				],
				default_sorting_field: 'updated_at',
			}),
			signal: AbortSignal.timeout(Config.musicSearch.typesense.timeoutMs),
		});

		if (createResponse.ok || createResponse.status === 409) return;

		const body = await createResponse.text().catch(() => '');
		throw new Error(`music_typesense_collection_create_failed_${createResponse.status}:${body}`);
	}

	private async fetchTypesenseJson(
		url: string,
		options: {
			method?: string;
			headers?: Record<string, string>;
			body?: string;
		} = {},
	): Promise<unknown> {
		const response = await fetch(url, {
			method: options.method || 'GET',
			headers: this.getTypesenseHeaders(options.headers),
			body: options.body,
			signal: AbortSignal.timeout(Config.musicSearch.typesense.timeoutMs),
		});

		if (!response.ok) {
			const body = await response.text().catch(() => '');
			throw new Error(`music_typesense_request_failed_${response.status}:${body}`);
		}

		return response.json();
	}

	private getTypesenseHeaders(headers: Record<string, string> = {}): Record<string, string> {
		if (!Config.musicSearch.typesense.apiKey) {
			throw new Error('music_typesense_api_key_missing');
		}

		return {
			'X-TYPESENSE-API-KEY': Config.musicSearch.typesense.apiKey,
			...headers,
		};
	}
}
