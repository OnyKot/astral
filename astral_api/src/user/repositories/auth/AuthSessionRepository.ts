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

import {Redis} from 'ioredis';
import type {UserID} from '~/BrandedTypes';
import {Config} from '~/Config';
import {BatchBuilder, Db, executeConditional, fetchMany, fetchOne, upsertOne} from '~/database/Cassandra';
import type {AuthSessionRow} from '~/database/CassandraTypes';
import type {ICacheService} from '~/infrastructure/ICacheService';
import {RedisCacheService} from '~/infrastructure/RedisCacheService';
import {Logger} from '~/Logger';
import {AuthSession} from '~/Models';
import {AuthSessions, AuthSessionsByUserId} from '~/Tables';

/**
 * Lifetime of the cached auth-session entry that `UserMiddleware` reads on every authenticated
 * request. Every revocation path invalidates the entry explicitly (see below), so this TTL only
 * bounds the window in which a *failed* invalidation could still authenticate a revoked token.
 */
export const AUTH_SESSION_CACHE_TTL_SECONDS = 60;

/** The token hash is the primary key of `auth_sessions`, so it is also the cache key. */
export const authSessionCacheKey = (sessionIdHash: Uint8Array): string =>
	`authsession:${Buffer.from(sessionIdHash).toString('base64url')}`;

/*
 * Repositories are constructed per request with no dependencies, so the cache the middleware read
 * and the revocation invalidation below share has to be reachable as module state. It is *handed
 * over* rather than opened here: every process that serves traffic already builds exactly one Redis
 * client with a cache service on top of it (ServiceMiddleware for the API, WorkerDependencies for
 * the worker) and closes that client on shutdown, so opening a second one behind their back leaves
 * a connection nobody owns. The injection goes this way round because a repository cannot import
 * either module — ServiceMiddleware would be an import cycle, and both would drag the whole service
 * graph into every one-shot script that only wants to revoke a session.
 */
let injectedAuthSessionCache: ICacheService | null = null;

/*
 * Fallback for callers with no DI layer to hand anything over: the one-shot scripts that revoke
 * directly (UserDeletionService, AuthPasswordService) and tests. Built only if it is actually used,
 * and it is the only client this module owns — hence the only one closeAuthSessionCache may close.
 */
let ownedAuthSessionRedis: Redis | null = null;
let ownedAuthSessionCache: ICacheService | null = null;

/** Hands the process-wide cache service over, so no second connection is opened for auth sessions. */
export const setAuthSessionCache = (cache: ICacheService): void => {
	injectedAuthSessionCache = cache;
};

export const getAuthSessionCache = (): ICacheService => {
	if (injectedAuthSessionCache != null) return injectedAuthSessionCache;
	if (ownedAuthSessionCache == null) {
		ownedAuthSessionRedis = new Redis(Config.redis.url);
		ownedAuthSessionCache = new RedisCacheService(ownedAuthSessionRedis);
	}
	return ownedAuthSessionCache;
};

/**
 * Releases everything this module holds. An idle ioredis connection keeps the event loop alive, so
 * a script or a test process that touched any revocation path would otherwise never exit. Only the
 * fallback client is closed — the injected cache belongs to the DI layer that closes it — and the
 * injected reference is dropped as well so a cache swapped in by one test cannot outlive it.
 */
export const closeAuthSessionCache = async (): Promise<void> => {
	const redis = ownedAuthSessionRedis;
	injectedAuthSessionCache = null;
	ownedAuthSessionRedis = null;
	ownedAuthSessionCache = null;
	if (redis == null) return;
	try {
		await redis.quit();
	} catch {
		// `quit` rejects when the connection is already broken, and the socket still has to be released.
		redis.disconnect();
	}
};

/*
 * Invalidation lives at the repository, not at AuthSessionService, because two revocation paths
 * bypass the service entirely and call the repository directly: AuthPasswordService's password
 * reset and UserDeletionService. Hooking only the service would leave a stolen token
 * authenticating for the whole TTL after a password reset.
 */
const invalidateAuthSessionCache = async (sessionIdHashes: Array<Buffer>): Promise<void> => {
	if (sessionIdHashes.length === 0) return;
	await Promise.all(
		sessionIdHashes.map(async (sessionIdHash) => {
			try {
				/*
				 * Resolved inside the try on purpose: constructing the fallback client throws on a
				 * malformed redis URL, and the Cassandra rows are already deleted by now — letting that
				 * escape would turn a completed logout into a 500.
				 */
				await getAuthSessionCache().delete(authSessionCacheKey(sessionIdHash));
			} catch (error) {
				/*
				 * The Cassandra rows are already gone at this point, so the session really is
				 * revoked; swallowing keeps a Redis blip from failing an otherwise successful
				 * logout, and the entry expires on its own within AUTH_SESSION_CACHE_TTL_SECONDS.
				 */
				Logger.error({error}, 'Failed to invalidate cached auth session after revocation');
			}
		}),
	);
};

const FETCH_AUTH_SESSIONS_CQL = AuthSessions.selectCql({
	where: AuthSessions.where.in('session_id_hash', 'session_id_hashes'),
});

const FETCH_AUTH_SESSION_BY_TOKEN_CQL = AuthSessions.selectCql({
	where: AuthSessions.where.eq('session_id_hash'),
	limit: 1,
});

const FETCH_AUTH_SESSION_HASHES_BY_USER_ID_CQL = AuthSessionsByUserId.selectCql({
	columns: ['session_id_hash'],
	where: AuthSessionsByUserId.where.eq('user_id'),
});

export class AuthSessionRepository {
	async createAuthSession(sessionData: AuthSessionRow): Promise<AuthSession> {
		const sessionResult = await executeConditional(AuthSessions.insertIfNotExists(sessionData));

		if (!sessionResult.applied) {
			const existingSession = await this.getAuthSessionByToken(sessionData.session_id_hash);
			if (!existingSession) {
				Logger.error(
					{sessionIdHash: sessionData.session_id_hash},
					'Failed to create or retrieve existing auth session',
				);
				throw new Error('Failed to create or retrieve existing auth session');
			}

			await this.ensureAuthSessionByUserIdIndex(sessionData.user_id, sessionData.session_id_hash);

			Logger.debug(
				{sessionIdHash: sessionData.session_id_hash},
				'Auth session already exists, returning existing session',
			);
			return existingSession;
		}

		await this.ensureAuthSessionByUserIdIndex(sessionData.user_id, sessionData.session_id_hash);

		return new AuthSession(sessionData);
	}

	private async ensureAuthSessionByUserIdIndex(userId: UserID, sessionIdHash: Buffer): Promise<void> {
		try {
			await upsertOne(
				AuthSessionsByUserId.insert({
					user_id: userId,
					session_id_hash: sessionIdHash,
				}),
			);
		} catch (error) {
			Logger.error({sessionIdHash, error}, 'Failed to create AuthSessionsByUserId entry');
		}
	}

	async getAuthSessionByToken(sessionIdHash: Buffer): Promise<AuthSession | null> {
		const session = await fetchOne<AuthSessionRow>(FETCH_AUTH_SESSION_BY_TOKEN_CQL, {session_id_hash: sessionIdHash});
		return session ? new AuthSession(session) : null;
	}

	async listAuthSessions(userId: UserID): Promise<Array<AuthSession>> {
		const sessionHashes = await fetchMany<{session_id_hash: Buffer}>(FETCH_AUTH_SESSION_HASHES_BY_USER_ID_CQL, {
			user_id: userId,
		});
		if (sessionHashes.length === 0) return [];
		const sessions = await fetchMany<AuthSessionRow>(FETCH_AUTH_SESSIONS_CQL, {
			session_id_hashes: sessionHashes.map((s) => s.session_id_hash),
		});
		return sessions.map((session) => new AuthSession(session));
	}

	async updateAuthSessionLastUsed(sessionIdHash: Buffer): Promise<void> {
		await upsertOne(
			AuthSessions.patchByPk(
				{session_id_hash: sessionIdHash},
				{
					approx_last_used_at: Db.set(new Date()),
				},
			),
		);
	}

	async deleteAuthSessions(userId: UserID, sessionIdHashes: Array<Buffer>): Promise<void> {
		// Ownership guard: the AuthSessions table is keyed by session_id_hash
		// alone, so deleting by hash without checking user_id would let a caller
		// revoke another user's session if they ever obtained that hash (BOLA).
		// Fetch each session first and only delete the ones that belong to the
		// caller; hashes that don't match an owned session are silently skipped
		// so a single bad hash can't block logout of the caller's real sessions
		// and doesn't leak whether a foreign hash exists.
		const ownedHashes: Array<Buffer> = [];
		for (const sessionIdHash of sessionIdHashes) {
			const session = await this.getAuthSessionByToken(sessionIdHash);
			if (session && session.userId === userId) {
				ownedHashes.push(sessionIdHash);
			}
		}
		if (ownedHashes.length === 0) return;

		const batch = new BatchBuilder();
		for (const sessionIdHash of ownedHashes) {
			batch.addPrepared(AuthSessions.deleteByPk({session_id_hash: sessionIdHash}));
			batch.addPrepared(AuthSessionsByUserId.deleteByPk({user_id: userId, session_id_hash: sessionIdHash}));
		}
		await batch.execute();

		// Only the hashes that were actually deleted: invalidating a hash the caller does not own
		// would let it log another user out.
		await invalidateAuthSessionCache(ownedHashes);
	}

	async deleteAllAuthSessions(userId: UserID): Promise<void> {
		const sessions = await fetchMany<{session_id_hash: Buffer}>(FETCH_AUTH_SESSION_HASHES_BY_USER_ID_CQL, {
			user_id: userId,
		});

		const batch = new BatchBuilder();
		for (const session of sessions) {
			batch.addPrepared(
				AuthSessions.deleteByPk({
					session_id_hash: session.session_id_hash,
				}),
			);
			batch.addPrepared(
				AuthSessionsByUserId.deleteByPk({
					user_id: userId,
					session_id_hash: session.session_id_hash,
				}),
			);
		}

		if (batch) {
			await batch.execute();
		}

		await invalidateAuthSessionCache(sessions.map((session) => session.session_id_hash));
	}
}
