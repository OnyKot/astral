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

import type {ICacheService} from './ICacheService';
import type {BucketConfig, IRateLimitService, RateLimitConfig, RateLimitResult} from './IRateLimitService';

export class RateLimitService implements IRateLimitService {
	private static readonly GLOBAL_WINDOW_MS = 1000;
	/**
	 * Counters are now bare Redis integers instead of a JSON `{attempts, resetTime}` blob; the version
	 * bump keeps keys still in flight under the old format from being misread as counts.
	 */
	private static readonly KEY_PREFIX = 'ratelimit:v2';

	constructor(private cacheService: ICacheService) {}

	private async checkLimitInternal(
		key: string,
		limit: number,
		windowMs: number,
		global?: boolean,
	): Promise<RateLimitResult> {
		const {count, pttlMs} = await this.cacheService.incrWithWindow(key, windowMs);
		// A non-positive PTTL would mean the key lost its expiry, which the script rules out; fall back to
		// the full window so a missing TTL can never be read as "resets immediately".
		const effectiveTtl = pttlMs > 0 ? pttlMs : windowMs;
		const resetTime = new Date(Date.now() + effectiveTtl);

		if (count > limit) {
			const retryAfterDecimal = effectiveTtl / 1000;
			return {
				allowed: false,
				limit,
				remaining: 0,
				resetTime,
				retryAfter: Math.ceil(retryAfterDecimal),
				retryAfterDecimal,
				global,
			};
		}

		return {
			allowed: true,
			limit,
			remaining: limit - count,
			resetTime,
			global,
		};
	}

	async checkLimit(config: RateLimitConfig): Promise<RateLimitResult> {
		const key = `${RateLimitService.KEY_PREFIX}:${config.identifier}`;
		return this.checkLimitInternal(key, config.maxAttempts, config.windowMs);
	}

	async checkBucketLimit(bucket: string, config: BucketConfig): Promise<RateLimitResult> {
		const key = `${RateLimitService.KEY_PREFIX}:bucket:${bucket}`;
		return this.checkLimitInternal(key, config.limit, config.windowMs);
	}

	async checkGlobalLimit(identifier: string, limit: number): Promise<RateLimitResult> {
		const key = `${RateLimitService.KEY_PREFIX}:global:${identifier}`;
		return this.checkLimitInternal(key, limit, RateLimitService.GLOBAL_WINDOW_MS, true);
	}

	async resetLimit(identifier: string): Promise<void> {
		const key = `${RateLimitService.KEY_PREFIX}:${identifier}`;
		await this.cacheService.delete(key);
	}

	async getRemainingAttempts(identifier: string, _windowMs: number): Promise<number> {
		const key = `${RateLimitService.KEY_PREFIX}:${identifier}`;
		// Expiry of the counter is what ends a window, so an absent key already means "no attempts used".
		const count = await this.cacheService.get<number>(key);

		if (typeof count !== 'number' || !Number.isFinite(count)) {
			return 0;
		}

		return Math.max(0, count);
	}

	async getResetTime(identifier: string, _windowMs: number): Promise<Date> {
		const key = `${RateLimitService.KEY_PREFIX}:${identifier}`;
		const ttlSeconds = await this.cacheService.ttl(key);
		const now = new Date();

		// Redis answers -2 for a missing key and -1 for one without an expiry: nothing left to wait for.
		if (ttlSeconds <= 0) {
			return now;
		}

		return new Date(now.getTime() + ttlSeconds * 1000);
	}
}
