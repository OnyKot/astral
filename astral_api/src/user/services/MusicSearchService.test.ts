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

import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

const configMock = vi.hoisted(() => ({
	Config: {
		musicSearch: {
			enabled: true,
			upstreams: ['https://upstream.example'],
			cacheTtlSeconds: 300,
			sectionLimit: 12,
			minIndexedHits: 8,
			upstreamTimeoutMs: 4500,
			typesense: {
				url: 'http://127.0.0.1:8108',
				apiKey: 'test-typesense-key',
				collection: 'astramusic_music_catalog',
				timeoutMs: 1800,
			},
		},
	},
}));

vi.mock('~/Config', () => configMock);
vi.mock('~/Logger', () => ({
	Logger: {
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
		debug: vi.fn(),
	},
}));

function jsonResponse(body: unknown, status = 200): Response {
	return {
		ok: status >= 200 && status < 300,
		status,
		async json() {
			return body;
		},
		async text() {
			return typeof body === 'string' ? body : JSON.stringify(body);
		},
	} as Response;
}

function buildTrack(id: string, title: string) {
	return {
		id,
		title,
		artists: [{name: 'Кино'}],
		provider: 'tidal',
	};
}

function buildEmptySearchPayload() {
	return {
		tracks: {items: [], limit: 0, offset: 0, totalNumberOfItems: 0},
		videos: {items: [], limit: 0, offset: 0, totalNumberOfItems: 0},
		artists: {items: [], limit: 0, offset: 0, totalNumberOfItems: 0},
		albums: {items: [], limit: 0, offset: 0, totalNumberOfItems: 0},
		playlists: {items: [], limit: 0, offset: 0, totalNumberOfItems: 0},
	};
}

async function flushAsyncWork() {
	await new Promise((resolve) => setTimeout(resolve, 25));
}

describe('MusicSearchService', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.resetModules();
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('uses Typesense multi_search for indexed hits', async () => {
		configMock.Config.musicSearch.minIndexedHits = 1;
		const fetchMock = vi.fn(async (input: string | URL, init?: RequestInit) => {
			const url = String(input);

			if (url.includes('/collections/astramusic_music_catalog')) {
				return jsonResponse({name: 'astramusic_music_catalog'});
			}

			if (url.includes('/multi_search')) {
				return jsonResponse({
					results: [
						{
							hits: [{document: {payload_json: JSON.stringify(buildTrack('1', 'Группа крови'))}}],
						},
						{hits: []},
						{hits: []},
						{hits: []},
						{hits: []},
					],
				});
			}

			throw new Error(`Unexpected fetch: ${url} ${String(init?.method || 'GET')}`);
		});

		vi.stubGlobal('fetch', fetchMock);
		const {MusicSearchService} = await import('./MusicSearchService');
		const result = await MusicSearchService.getInstance().search('Кино', 'tidal', 6);

		expect(result.meta.engine).toBe('typesense');
		expect(result.meta.indexed).toBe(true);
		expect(result.tracks.items).toHaveLength(1);
		expect(result.tracks.items[0]).toMatchObject({title: 'Группа крови'});
		expect(fetchMock).toHaveBeenCalledWith(
			expect.stringContaining('/multi_search'),
			expect.objectContaining({
				method: 'POST',
			}),
		);
		expect(fetchMock).not.toHaveBeenCalledWith(
			expect.stringContaining('/documents/search'),
			expect.anything(),
		);
	});

	it('refreshes index in background when Typesense returns partial hits', async () => {
		configMock.Config.musicSearch.minIndexedHits = 8;
		const fetchMock = vi.fn(async (input: string | URL) => {
			const url = String(input);

			if (url.includes('/collections/astramusic_music_catalog')) {
				return jsonResponse({name: 'astramusic_music_catalog'});
			}

			if (url.includes('/multi_search')) {
				return jsonResponse({
					results: [
						{
							hits: [{document: {payload_json: JSON.stringify(buildTrack('1', 'Звезда по имени Солнце'))}}],
						},
						{hits: []},
						{hits: []},
						{hits: []},
						{hits: []},
					],
				});
			}

			if (url.includes('https://upstream.example/search/?q=')) {
				return jsonResponse({
					...buildEmptySearchPayload(),
					tracks: {
						items: [buildTrack('2', 'Пачка сигарет')],
						limit: 1,
						offset: 0,
						totalNumberOfItems: 1,
					},
				});
			}

			if (url.includes('/documents/import')) {
				return jsonResponse([{success: true}]);
			}

			throw new Error(`Unexpected fetch: ${url}`);
		});

		vi.stubGlobal('fetch', fetchMock);
		const {MusicSearchService} = await import('./MusicSearchService');
		const result = await MusicSearchService.getInstance().search('Кино', 'tidal', 6);

		expect(result.meta.engine).toBe('typesense');
		expect(result.tracks.items).toHaveLength(1);
		await flushAsyncWork();
		expect(
			fetchMock.mock.calls.some(([url]) => String(url).includes('https://upstream.example/search/?q='))
		).toBe(true);
		expect(
			fetchMock.mock.calls.some(([url]) => String(url).includes('/documents/import?action=upsert&dirty_values=coerce_or_drop'))
		).toBe(true);
	});

	it('falls back to upstream and indexes response when Typesense has no hits', async () => {
		configMock.Config.musicSearch.minIndexedHits = 8;
		const fetchMock = vi.fn(async (input: string | URL) => {
			const url = String(input);

			if (url.includes('/collections/astramusic_music_catalog')) {
				return jsonResponse({name: 'astramusic_music_catalog'});
			}

			if (url.includes('/multi_search')) {
				return jsonResponse({
					results: [{hits: []}, {hits: []}, {hits: []}, {hits: []}, {hits: []}],
				});
			}

			if (url.includes('https://upstream.example/search/?q=')) {
				return jsonResponse({
					...buildEmptySearchPayload(),
					artists: {
						items: [{id: '10', name: 'Молчат Дома', provider: 'tidal'}],
						limit: 1,
						offset: 0,
						totalNumberOfItems: 1,
					},
				});
			}

			if (url.includes('/documents/import')) {
				return jsonResponse([{success: true}]);
			}

			throw new Error(`Unexpected fetch: ${url}`);
		});

		vi.stubGlobal('fetch', fetchMock);
		const {MusicSearchService} = await import('./MusicSearchService');
		const result = await MusicSearchService.getInstance().search('Молчат Дома', 'tidal', 6);

		expect(result.meta.engine).toBe('upstream');
		expect(result.meta.indexed).toBe(true);
		expect(result.artists.items).toHaveLength(1);
		expect(result.artists.items[0]).toMatchObject({name: 'Молчат Дома'});
		await flushAsyncWork();
		expect(
			fetchMock.mock.calls.some(([url]) => String(url).includes('/documents/import?action=upsert&dirty_values=coerce_or_drop'))
		).toBe(true);
	});
});
