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

import crypto from 'node:crypto';
import type {Context} from 'hono';
import {getCookie} from 'hono/cookie';
import {createMiddleware} from 'hono/factory';
import type {HonoEnv} from '~/App';
import {
	getMusicSessionCookieService,
	MUSIC_SESSION_COOKIE_NAME,
} from '~/auth/services/MusicSessionCookieService';
import {createUserID} from '~/BrandedTypes';
import {Config} from '~/Config';
import type {AuthSessionRow} from '~/database/CassandraTypes';
import {Logger} from '~/Logger';
import {getMetricsService} from '~/infrastructure/MetricsService';
import {AuthSession, type User} from '~/Models';
import {
	AUTH_SESSION_CACHE_TTL_SECONDS,
	authSessionCacheKey,
	getAuthSessionCache,
	setAuthSessionCache,
} from '~/user/repositories/auth/AuthSessionRepository';
import * as IpUtils from '~/utils/IpUtils';

type TokenType = 'session' | 'bearer' | 'bot';

/**
 * JSON-safe projection of `AuthSessionRow`. Typing the decoded value as `AuthSessionRow` makes the
 * compiler reject this codec the moment a column is added to the row, so a new column can never be
 * silently dropped on a cache hit.
 */
interface CachedAuthSession {
	user_id: string;
	session_id_hash: string;
	created_at: number;
	approx_last_used_at: number;
	client_ip: string;
	client_user_agent: string | null;
	client_is_desktop: boolean | null;
	version: number;
}

const encodeAuthSession = (session: AuthSession): CachedAuthSession => ({
	user_id: session.userId.toString(),
	session_id_hash: Buffer.from(session.sessionIdHash).toString('base64url'),
	created_at: session.createdAt.getTime(),
	approx_last_used_at: session.approximateLastUsedAt.getTime(),
	client_ip: session.clientIp,
	client_user_agent: session.clientUserAgent,
	client_is_desktop: session.clientIsDesktop,
	version: session.version,
});

/**
 * The cache stands in for a Cassandra read that decides *who the caller is*, so an entry is only
 * trusted if this service wrote it. Without the tag, write access to Redis would be enough to mint
 * an authenticated request for any user id by storing an entry under the hash of a chosen token —
 * an escalation Redis does not grant today. Domain-separated so the tag cannot be swapped with a
 * sudo-mode or music-cookie signature made from the same secret.
 */
const AUTH_SESSION_CACHE_MAC_CONTEXT = 'authsession-cache-v1';

interface CachedAuthSessionEntry {
	session: CachedAuthSession;
	mac: string;
}

const signCachedAuthSession = (payload: string): string =>
	crypto
		.createHmac('sha256', Config.auth.sudoModeSecret)
		.update(`${AUTH_SESSION_CACHE_MAC_CONTEXT}:${payload}`)
		.digest('base64url');

const macMatches = (expected: string, actual: string): boolean => {
	const expectedBytes = Buffer.from(expected, 'base64url');
	const actualBytes = Buffer.from(actual, 'base64url');
	if (expectedBytes.length !== actualBytes.length || expectedBytes.length === 0) return false;
	return crypto.timingSafeEqual(expectedBytes, actualBytes);
};

const decodeAuthSession = (cached: CachedAuthSession): AuthSession => {
	const row: AuthSessionRow = {
		user_id: createUserID(BigInt(cached.user_id)),
		session_id_hash: Buffer.from(cached.session_id_hash, 'base64url'),
		created_at: new Date(cached.created_at),
		approx_last_used_at: new Date(cached.approx_last_used_at),
		client_ip: cached.client_ip,
		client_user_agent: cached.client_user_agent,
		client_is_desktop: cached.client_is_desktop,
		version: cached.version,
	};
	return new AuthSession(row);
};

/*
 * Mirrors AuthUtilityService.getTokenIdHash — the middleware needs the key before it has the row,
 * so it cannot ask the repository for it. Writes use the hash the resolved row actually carries
 * (see readAuthSession), so if the two derivations ever diverged the only consequence would be a
 * permanent cache miss, never an entry the revocation paths cannot find.
 */
const hashSessionToken = (token: string): Buffer => crypto.createHash('sha256').update(token).digest();

/**
 * The auth-session row is the highest-frequency read in the service: it gated every authenticated
 * request on an uncached Cassandra round trip. Only positive results are cached — `createAuthSession`
 * relies on `getAuthSessionByToken` seeing an uncached miss on the LWT not-applied path — and the
 * repository drops the entry on every revocation path.
 */
async function readAuthSession(ctx: Context<HonoEnv>, token: string): Promise<AuthSession | null> {
	const sessionIdHash = hashSessionToken(token);
	const cacheKey = authSessionCacheKey(sessionIdHash);
	const cache = getAuthSessionCache();

	try {
		const cached = await cache.get<CachedAuthSessionEntry>(cacheKey);
		if (cached?.session != null && macMatches(signCachedAuthSession(JSON.stringify(cached.session)), cached.mac)) {
			const session = decodeAuthSession(cached.session);
			/*
			 * Only ever hand back a session whose stored hash is the one we looked up, so a
			 * corrupted or mismatched entry can never authenticate a different token than the
			 * `WHERE session_id_hash = ?` read it replaces.
			 */
			if (session.sessionIdHash.equals(sessionIdHash)) {
				getMetricsService().counter({name: 'auth.session.cache', dimensions: {result: 'hit'}});
				return session;
			}
		}
	} catch (error) {
		// Any cache trouble degrades to the Cassandra read rather than failing the request.
		Logger.warn({error}, 'Auth session cache read failed');
	}

	getMetricsService().counter({name: 'auth.session.cache', dimensions: {result: 'miss'}});
	const authSession = await ctx.get('authService').getAuthSessionByToken(token);
	if (!authSession) return null;

	/*
	 * A row that carries only `session_id_hash` is not a session. `updateAuthSessionLastUsed` below is
	 * a plain Cassandra UPDATE, so it can recreate a bare row for a hash whose session was revoked
	 * between the read and the write; treating such a row as absent gives that request the same 401 it
	 * would have got had the row stayed deleted, instead of a user lookup on a null id.
	 */
	if (typeof authSession.userId !== 'bigint') return null;

	// Fire-and-forget so the miss path does not pay a second round trip, and keyed off the row's
	// own hash so the key always matches the one the repository invalidates.
	const writeKey = authSessionCacheKey(authSession.sessionIdHash);
	const session = encodeAuthSession(authSession);
	const entry: CachedAuthSessionEntry = {session, mac: signCachedAuthSession(JSON.stringify(session))};
	void cache.set(writeKey, entry, AUTH_SESSION_CACHE_TTL_SECONDS).catch((error: unknown) => {
		Logger.warn({error}, 'Auth session cache write failed');
	});
	return authSession;
}

/**
 * The gateway signs every internal RPC with `Authorization: Bearer <GATEWAY_RPC_SECRET>` (see
 * `astral_gateway/src/gateway/rpc_client.erl`), and `/_rpc` is registered after this middleware, so
 * without this check every gateway RPC makes the API spend a guaranteed-miss Cassandra read looking
 * the shared secret up in the OAuth access-token table. Recognising it here only skips that read:
 * `/_rpc` still authorizes itself in `RpcController` (same secret, plus a private-network check),
 * and no user or bearer context is set for the credential either way.
 */
const isGatewayRpcSecret = (token: string): boolean => {
	const provided = Buffer.from(token, 'utf8');
	const expected = Buffer.from(Config.gateway.rpcSecret, 'utf8');
	// Constant-time, so this branch cannot be turned into an oracle that recovers the secret.
	return provided.length === expected.length && crypto.timingSafeEqual(provided, expected);
};

interface ParsedAuthHeader {
	token: string;
	type: TokenType;
}

function parseAuthHeader(authHeader?: string | null): ParsedAuthHeader | null {
	if (!authHeader) return null;

	const normalized = authHeader.trim();
	if (!normalized) return null;

	if (normalized.startsWith('Bearer ')) {
		const token = normalized.slice('Bearer '.length);
		if (token.length === 0 || token !== token.trim()) return null;
		return {
			token,
			type: 'bearer',
		};
	}

	if (normalized.startsWith('Bot ')) {
		const token = normalized.slice('Bot '.length);
		if (token.length === 0 || token !== token.trim()) return null;
		return {
			token,
			type: 'bot',
		};
	}

	if (normalized.includes(' ')) return null;
	return {
		token: normalized,
		type: 'session',
	};
}

function setUserInContext(ctx: Context<HonoEnv>, user: User, trackActivity: boolean): void {
	ctx.set('user', user);
	if (trackActivity) {
		const now = new Date();
		const userRepository = ctx.get('userRepository');
		const redisActivityTracker = ctx.get('redisActivityTracker');
		/*
		 * Fire-and-forget activity tracking. Previously the Promise.all
		 * had no .catch(), so any DB/Redis error became an unhandled
		 * rejection that could crash the process (before we added the
		 * global uncaughtException handler). Now caught + logged.
		 */
		void Promise.all([
			userRepository.updateLastActiveAt({
				userId: user.id,
				lastActiveAt: now,
				lastActiveIp: IpUtils.requireClientIp(ctx.req.raw),
			}),
			redisActivityTracker.updateActivity(user.id, now),
		]).catch((error) => {
			Logger.warn({error, userId: user.id.toString()}, 'Activity tracking failed (non-fatal)');
		});
	}
}

export const UserMiddleware = createMiddleware<HonoEnv>(async (ctx, next) => {
	/*
	 * ServiceMiddleware owns the one Redis client of this process and runs before this middleware, so
	 * hand its cache to the auth-session module instead of letting that module open a connection of
	 * its own — for the read below and for the revocation paths inside the repository alike. Doing it
	 * here (idempotent pointer assignment) rather than once at import time keeps the repository free
	 * of any dependency on the service layer.
	 */
	const diCacheService = ctx.get('cacheService');
	if (diCacheService) setAuthSessionCache(diCacheService);

	const rawAuthHeader = ctx.req.header('Authorization');
	const parsedFromHeader = parseAuthHeader(rawAuthHeader);
	let parsed = parsedFromHeader;
	let authViaCookie = false;

	ctx.set('oauthBearerToken', undefined);
	ctx.set('oauthBearerScopes', undefined);
	ctx.set('oauthBearerUserId', undefined);
	ctx.set('oauthBearerApplicationId', undefined);
	ctx.set('authToken', undefined);
	ctx.set('authViaCookie', false);

	if (!parsed) {
		const sessionCookie = getCookie(ctx, MUSIC_SESSION_COOKIE_NAME);
		if (sessionCookie) {
			const musicSession = await getMusicSessionCookieService().verifyCookieValue(sessionCookie);
			if (musicSession?.sessionToken) {
				parsed = {
					token: musicSession.sessionToken,
					type: 'session',
				};
				authViaCookie = true;
			}
		}
	}

	if (!parsed) {
		return next();
	}

	const {token, type} = parsed;
	ctx.set('authToken', token);
	ctx.set('authViaCookie', authViaCookie);

	if (type === 'session') {
		const authService = ctx.get('authService');
		const authSession = await readAuthSession(ctx, token);
		if (authSession) {
			/*
			 * `updateUserActivity` used to be fired here as well, but it wrote `users.last_active_at`
			 * and `users.last_active_ip` with the same values as `setUserInContext`'s
			 * `updateLastActiveAt` below — two identical UPDATEs of the same row on every authenticated
			 * request. The surviving one is the write inside `setUserInContext`, because it shares its
			 * timestamp with the Redis activity tracker and is already wrapped in a `.catch()`.
			 */
			void authService.updateAuthSessionLastUsed(authSession.sessionIdHash).catch((error: unknown) => {
				// Fire-and-forget: a failed activity timestamp must never reject into the request path.
				Logger.warn({error}, 'Auth session last-used update failed (non-fatal)');
			});

			const user = await ctx.get('userService').findUniqueAssert(authSession.userId);

			ctx.set('authSession', authSession);
			ctx.set('authTokenType', 'session');
			setUserInContext(ctx, user, true);
		} else {
			getMetricsService().counter({
				name: 'auth.token.invalid',
				dimensions: {type: 'session'},
			});
		}
		await next();
		return;
	}

	if (type === 'bearer') {
		// Internal gateway RPC, not an OAuth token — skip the lookup that could only ever miss.
		if (isGatewayRpcSecret(token)) {
			await next();
			return;
		}

		const accessToken = await ctx.get('oauth2TokenRepository').getAccessToken(token);
		const userId = accessToken?.userId ?? null;
		if (accessToken) {
			ctx.set('oauthBearerToken', token);
			ctx.set('oauthBearerScopes', accessToken.scope);
			ctx.set('oauthBearerUserId', accessToken.userId ?? undefined);
			ctx.set('oauthBearerApplicationId', accessToken.applicationId);
		} else {
			getMetricsService().counter({
				name: 'auth.token.invalid',
				dimensions: {type: 'bearer'},
			});
		}
		if (userId) {
			const user = await ctx.get('userService').findUnique(userId);
			if (user) {
				ctx.set('authTokenType', 'bearer');
				setUserInContext(ctx, user, false);
			}
		}
		await next();
		return;
	}

	if (type === 'bot') {
		const botAuthService = ctx.get('botAuthService');
		const botUserId = await botAuthService.validateBotToken(token);
		if (botUserId) {
			const botUser = await ctx.get('userService').findUnique(botUserId);
			if (botUser) {
				ctx.set('authTokenType', 'bot');
				setUserInContext(ctx, botUser, false);
			}
		} else {
			getMetricsService().counter({
				name: 'auth.token.invalid',
				dimensions: {type: 'bot'},
			});
		}
		await next();
		return;
	}

	await next();
});
