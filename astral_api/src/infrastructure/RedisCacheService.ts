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

import type {Redis} from 'ioredis';
import {ICacheService} from './ICacheService';

/**
 * `defineCommand` attaches scripts straight onto the client instance, where the `Redis` type cannot
 * see them, so calls to our own scripts go through this narrowed view.
 */
type RedisWithScripts = Redis & {
	incrWithWindow(key: string, windowMs: string): Promise<[number, number]>;
};

export class RedisCacheService extends ICacheService {
	/**
	 * The expiry is armed only when the counter is created, so a burst of concurrent callers can
	 * neither lose increments nor keep pushing the window forward and stay limited forever.
	 */
	private static readonly INCR_WINDOW = `
		local n = redis.call('INCR', KEYS[1])
		if n == 1 then
			redis.call('PEXPIRE', KEYS[1], ARGV[1])
		end
		return {n, redis.call('PTTL', KEYS[1])}
	`;

	private redis: Redis;

	constructor(redis: Redis) {
		super();
		this.redis = redis;
		// Registering the script makes ioredis dispatch it with EVALSHA and only fall back to EVAL when
		// the server has dropped it from its script cache, instead of shipping the body on every call.
		this.redis.defineCommand('incrWithWindow', {numberOfKeys: 1, lua: RedisCacheService.INCR_WINDOW});
	}

	async get<T>(key: string): Promise<T | null> {
		const value = await this.redis.get(key);
		if (value == null) return null;

		try {
			return JSON.parse(value);
		} catch {
			return null;
		}
	}

	async set<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
		const serializedValue = JSON.stringify(value);

		if (ttlSeconds) {
			await this.redis.setex(key, ttlSeconds, serializedValue);
		} else {
			await this.redis.set(key, serializedValue);
		}
	}

	async delete(key: string): Promise<void> {
		await this.redis.del(key);
	}

	async getAndDelete<T>(key: string): Promise<T | null> {
		const pipeline = this.redis.multi();
		pipeline.get(key);
		pipeline.del(key);

		const results = await pipeline.exec();
		if (!results || results.length === 0) {
			return null;
		}

		const [getResult] = results;
		if (!getResult || getResult[1] == null) {
			return null;
		}

		try {
			return JSON.parse(getResult[1] as string);
		} catch {
			return null;
		}
	}

	async exists(key: string): Promise<boolean> {
		const result = await this.redis.exists(key);
		return result === 1;
	}

	async expire(key: string, ttlSeconds: number): Promise<void> {
		await this.redis.expire(key, ttlSeconds);
	}

	async ttl(key: string): Promise<number> {
		return await this.redis.ttl(key);
	}

	async mget<T>(keys: Array<string>): Promise<Array<T | null>> {
		if (keys.length === 0) return [];

		const values = await this.redis.mget(...keys);
		return values.map((value) => {
			if (value == null) return null;
			try {
				return JSON.parse(value);
			} catch {
				return null;
			}
		});
	}

	async mset<T>(entries: Array<{key: string; value: T; ttlSeconds?: number}>): Promise<void> {
		if (entries.length === 0) return;

		const withoutTtl: Array<{key: string; value: T}> = [];
		const withTtl: Array<{key: string; value: T; ttlSeconds: number}> = [];

		for (const entry of entries) {
			if (entry.ttlSeconds) {
				withTtl.push({
					key: entry.key,
					value: entry.value,
					ttlSeconds: entry.ttlSeconds,
				});
			} else {
				withoutTtl.push({
					key: entry.key,
					value: entry.value,
				});
			}
		}

		const pipeline = this.redis.pipeline();

		if (withoutTtl.length > 0) {
			const flatArgs: Array<string> = [];
			for (const entry of withoutTtl) {
				flatArgs.push(entry.key, JSON.stringify(entry.value));
			}
			pipeline.mset(...flatArgs);
		}

		for (const entry of withTtl) {
			pipeline.setex(entry.key, entry.ttlSeconds, JSON.stringify(entry.value));
		}

		await pipeline.exec();
	}

	async deletePattern(pattern: string): Promise<number> {
		const redisPattern = pattern.replace(/\*/g, '*');
		let cursor = '0';
		let deleted = 0;
		const batchSize = 500;

		do {
			const [nextCursor, keys] = await this.redis.scan(cursor, 'MATCH', redisPattern, 'COUNT', batchSize);
			cursor = nextCursor;

			for (let index = 0; index < keys.length; index += batchSize) {
				const batch = keys.slice(index, index + batchSize);
				if (batch.length === 0) continue;

				deleted += batch.length;
				if (typeof this.redis.unlink === 'function') {
					await this.redis.unlink(...batch);
				} else {
					await this.redis.del(...batch);
				}
			}
		} while (cursor !== '0');

		return deleted;
	}

	async acquireLock(key: string, ttlSeconds: number): Promise<string | null> {
		const token = Math.random().toString(36).substring(2, 15);
		const lockKey = `lock:${key}`;

		const result = await this.redis.set(lockKey, token, 'EX', ttlSeconds, 'NX');
		return result === 'OK' ? token : null;
	}

	async releaseLock(key: string, token: string): Promise<boolean> {
		const lockKey = `lock:${key}`;

		const luaScript = `
			if redis.call("GET", KEYS[1]) == ARGV[1] then
				return redis.call("DEL", KEYS[1])
			else
				return 0
			end
		`;

		const result = (await this.redis.eval(luaScript, 1, lockKey, token)) as number;
		return result === 1;
	}

	async incrWithWindow(key: string, windowMs: number): Promise<{count: number; pttlMs: number}> {
		// PEXPIRE refuses non-integers and treats anything <= 0 as "delete now", which would leave the
		// counter without a window and effectively disable the limit.
		const pexpireMs = Math.max(1, Math.ceil(windowMs));
		const [count, pttlMs] = await (this.redis as RedisWithScripts).incrWithWindow(key, String(pexpireMs));
		return {count, pttlMs};
	}

	async getAndRenewTtl<T>(key: string, newTtlSeconds: number): Promise<T | null> {
		const pipeline = this.redis.pipeline();
		pipeline.get(key);
		pipeline.expire(key, newTtlSeconds);

		const results = await pipeline.exec();
		if (!results) return null;

		const [getResult] = results;
		if (!getResult || getResult[1] == null) return null;

		try {
			return JSON.parse(getResult[1] as string);
		} catch {
			return null;
		}
	}

	async publish(channel: string, message: string): Promise<void> {
		await this.redis.publish(channel, message);
	}
}
