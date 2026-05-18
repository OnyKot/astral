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

import {createServer} from 'node:http';
import {performance} from 'node:perf_hooks';

function ensureEnv(name: string, value: string): void {
	if (!process.env[name]) {
		process.env[name] = value;
	}
}

ensureEnv('NODE_ENV', 'development');
ensureEnv('PORT', '3000');
ensureEnv('DATABASE_URL', 'postgresql://test:test@localhost:5432/test');
ensureEnv('CASSANDRA_HOSTS', 'localhost');
ensureEnv('CASSANDRA_KEYSPACE', 'Astral');
ensureEnv('CASSANDRA_LOCAL_DC', 'datacenter1');
ensureEnv('REDIS_URL', 'redis://localhost:6379');
ensureEnv('ASTRAL_GATEWAY_RPC_HOST', 'localhost');
ensureEnv('ASTRAL_GATEWAY_RPC_PORT', '9082');
ensureEnv('GATEWAY_RPC_SECRET', 'test-rpc-secret');
ensureEnv('ASTRAL_API_PUBLIC_ENDPOINT', 'https://api.test');
ensureEnv('ASTRAL_API_CLIENT_ENDPOINT', 'https://api-client.test');
ensureEnv('ASTRAL_APP_ENDPOINT', 'https://app.test');
ensureEnv('ASTRAL_GATEWAY_ENDPOINT', 'https://gateway.test');
ensureEnv('ASTRAL_MEDIA_ENDPOINT', 'https://media.test');
ensureEnv('ASTRAL_CDN_ENDPOINT', 'https://cdn.test');
ensureEnv('ASTRAL_MARKETING_ENDPOINT', 'https://marketing.test');
ensureEnv('ASTRAL_PATH_MARKETING', '/marketing');
ensureEnv('ASTRAL_ADMIN_ENDPOINT', 'https://admin.test');
ensureEnv('ASTRAL_PATH_ADMIN', '/admin');
ensureEnv('ASTRAL_INVITE_ENDPOINT', 'https://invite.test');
ensureEnv('ASTRAL_GIFT_ENDPOINT', 'https://gift.test');
ensureEnv('MEDIA_PROXY_HOST', 'localhost:8082');
ensureEnv('MEDIA_PROXY_ENDPOINT', 'http://localhost:8082');
ensureEnv('MEDIA_PROXY_SECRET_KEY', 'test-media-secret');
ensureEnv('AWS_ACCESS_KEY_ID', 'test-access-key');
ensureEnv('AWS_SECRET_ACCESS_KEY', 'test-secret-key');
ensureEnv('AWS_S3_ENDPOINT', 'http://localhost:9000');
ensureEnv('AWS_S3_BUCKET_CDN', 'test-cdn');
ensureEnv('AWS_S3_BUCKET_UPLOADS', 'test-uploads');
ensureEnv('AWS_S3_BUCKET_REPORTS', 'test-reports');
ensureEnv('AWS_S3_BUCKET_HARVESTS', 'test-harvests');
ensureEnv('AWS_S3_BUCKET_DOWNLOADS', 'test-downloads');
ensureEnv('CASSANDRA_USERNAME', 'test-cassandra-user');
ensureEnv('CASSANDRA_PASSWORD', 'test-cassandra-pass');
ensureEnv('EMAIL_ENABLED', 'false');
ensureEnv('SMS_ENABLED', 'false');
ensureEnv('CAPTCHA_ENABLED', 'false');
ensureEnv('VOICE_ENABLED', 'false');
ensureEnv('SEARCH_ENABLED', 'false');
ensureEnv('STRIPE_ENABLED', 'false');
ensureEnv('CLOUDFLARE_PURGE_ENABLED', 'false');
ensureEnv('CLAMAV_ENABLED', 'false');
ensureEnv('ASTRAL_APP_HOST', 'localhost:3000');
ensureEnv('ASTRAL_APP_PROTOCOL', 'http');
ensureEnv('SUDO_MODE_SECRET', 'test-sudo-secret');
ensureEnv('MUSIC_SEARCH_ENABLED', 'true');
ensureEnv('MUSIC_TYPESENSE_URL', 'http://127.0.0.1:8108');
ensureEnv('MUSIC_TYPESENSE_API_KEY', 'astramusic-search-dev-key');
ensureEnv('MUSIC_TYPESENSE_COLLECTION', `astramusic_smoke_${Date.now()}`);
ensureEnv('MUSIC_SEARCH_MIN_INDEXED_HITS', '1');
ensureEnv('MUSIC_SEARCH_SECTION_LIMIT', '6');

const UPSTREAM_PORT = 48781;
ensureEnv('MUSIC_SEARCH_UPSTREAMS', `http://127.0.0.1:${UPSTREAM_PORT}`);

const samplePayload = {
	tracks: {
		items: [
			{
				id: 'track-1',
				title: 'Группа крови',
				artists: [{name: 'Кино'}],
			},
			{
				id: 'track-2',
				title: 'Пачка сигарет',
				artists: [{name: 'Кино'}],
			},
		],
		limit: 2,
		offset: 0,
		totalNumberOfItems: 2,
	},
	videos: {items: [], limit: 0, offset: 0, totalNumberOfItems: 0},
	artists: {
		items: [{id: 'artist-1', name: 'Кино'}],
		limit: 1,
		offset: 0,
		totalNumberOfItems: 1,
	},
	albums: {
		items: [{id: 'album-1', title: 'Группа крови', artists: [{name: 'Кино'}]}],
		limit: 1,
		offset: 0,
		totalNumberOfItems: 1,
	},
	playlists: {items: [], limit: 0, offset: 0, totalNumberOfItems: 0},
};

async function resetCollection(): Promise<void> {
	const collection = process.env.MUSIC_TYPESENSE_COLLECTION as string;
	const baseUrl = process.env.MUSIC_TYPESENSE_URL as string;
	const apiKey = process.env.MUSIC_TYPESENSE_API_KEY as string;
	const response = await fetch(`${baseUrl}/collections/${encodeURIComponent(collection)}`, {
		method: 'DELETE',
		headers: {
			'X-TYPESENSE-API-KEY': apiKey,
		},
	});

	if (response.ok || response.status === 404) return;

	throw new Error(`typesense_reset_failed_${response.status}:${await response.text()}`);
}

async function measure<T>(fn: () => Promise<T>): Promise<{durationMs: number; result: T}> {
	const started = performance.now();
	const result = await fn();
	return {
		durationMs: Number((performance.now() - started).toFixed(1)),
		result,
	};
}

async function main(): Promise<void> {
	const upstreamServer = createServer((req, res) => {
		if (req.url?.startsWith('/search/?q=')) {
			res.writeHead(200, {'Content-Type': 'application/json'});
			res.end(JSON.stringify(samplePayload));
			return;
		}

		res.writeHead(404, {'Content-Type': 'application/json'});
		res.end(JSON.stringify({error: 'not_found'}));
	});

	await new Promise<void>((resolve) => {
		upstreamServer.listen(UPSTREAM_PORT, '127.0.0.1', resolve);
	});

	try {
		await resetCollection();

		const {MusicSearchService} = await import('../user/services/MusicSearchService');
		const service = MusicSearchService.getInstance();

		const cold = await measure(() => service.search('Кино', 'tidal', 6));
		await new Promise((resolve) => setTimeout(resolve, 150));
		const warm = await measure(() => service.search('Кино', 'tidal', 6));

		const summary = {
			collection: process.env.MUSIC_TYPESENSE_COLLECTION,
			coldMs: cold.durationMs,
			warmMs: warm.durationMs,
			coldEngine: cold.result.meta.engine,
			warmEngine: warm.result.meta.engine,
			warmTracks: warm.result.tracks.items.length,
			warmArtists: warm.result.artists.items.length,
		};

		console.log(JSON.stringify(summary, null, 2));
	} finally {
		upstreamServer.close();
	}
}

main().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
