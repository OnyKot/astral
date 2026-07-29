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

import {Config} from '~/Config';
import * as metrics from '~/lib/MetricsClient';

export interface CachedImage {
	data: Buffer;
	contentType: string;
}

/**
 * Byte-bounded LRU cache for fully transformed, immutable images (avatars, icons,
 * emojis, stickers, ...). Media keys are content-addressed (snowflake + hash), so a
 * cached entry never goes stale. This is the hot tier in front of the request
 * coalescer + S3: a hit avoids both the MinIO round-trip and the sharp transform,
 * which is the single biggest win for repeated avatar/icon loads and keeps the S3
 * socket pool free for genuinely cold objects.
 *
 * Eviction is strict LRU by insertion/recency order (Map preserves it); entries are
 * dropped oldest-first until the new value fits within the byte budget. Single
 * entries larger than `maxEntryBytes` are never cached so one big image can't evict
 * the entire working set.
 */
export class ImageCache {
	private readonly store = new Map<string, CachedImage>();
	private readonly maxBytes: number;
	private readonly maxEntryBytes: number;
	private currentBytes = 0;

	constructor(maxBytes = Config.IMAGE_CACHE_MAX_BYTES, maxEntryBytes = Config.IMAGE_CACHE_MAX_ENTRY_BYTES) {
		this.maxBytes = maxBytes;
		this.maxEntryBytes = maxEntryBytes;
	}

	get(key: string): CachedImage | undefined {
		const entry = this.store.get(key);
		if (entry === undefined) {
			metrics.counter({name: 'media_proxy.imagecache.miss'});
			return undefined;
		}

		// Refresh recency: re-insert so it becomes the most-recently-used entry.
		this.store.delete(key);
		this.store.set(key, entry);
		metrics.counter({name: 'media_proxy.imagecache.hit'});
		return entry;
	}

	set(key: string, data: Buffer, contentType: string): void {
		const size = data.length;
		if (size <= 0 || size > this.maxEntryBytes) return;

		const existing = this.store.get(key);
		if (existing !== undefined) {
			this.currentBytes -= existing.data.length;
			this.store.delete(key);
		}

		while (this.currentBytes + size > this.maxBytes && this.store.size > 0) {
			const oldestKey = this.store.keys().next().value as string | undefined;
			if (oldestKey === undefined) break;
			const oldest = this.store.get(oldestKey);
			this.store.delete(oldestKey);
			if (oldest !== undefined) this.currentBytes -= oldest.data.length;
			metrics.counter({name: 'media_proxy.imagecache.evict'});
		}

		this.store.set(key, {data, contentType});
		this.currentBytes += size;
		metrics.gauge({name: 'media_proxy.imagecache.bytes', value: this.currentBytes});
		metrics.gauge({name: 'media_proxy.imagecache.entries', value: this.store.size});
	}

	/** Memoize a transformed image: serve from cache or compute, store, and return. */
	async wrap(key: string, compute: () => Promise<CachedImage>): Promise<CachedImage> {
		const hit = this.get(key);
		if (hit !== undefined) return hit;

		const result = await compute();
		this.set(key, result.data, result.contentType);
		return result;
	}
}
