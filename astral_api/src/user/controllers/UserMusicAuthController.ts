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
import {getCookie, setCookie} from 'hono/cookie';
import type {HonoApp, HonoEnv} from '~/App';
import {
	getMusicSessionCookieService,
	MUSIC_OAUTH_STATE_COOKIE_NAME,
	MUSIC_OAUTH_STATE_TTL_SECONDS,
	MUSIC_SESSION_COOKIE_NAME,
	MUSIC_SESSION_TTL_SECONDS,
} from '~/auth/services/MusicSessionCookieService';
import {Config} from '~/Config';
import {Logger} from '~/Logger';
import {DefaultUserOnly, LoginRequiredAllowSuspicious} from '~/middleware/AuthMiddleware';
import {RateLimitMiddleware} from '~/middleware/RateLimitMiddleware';
import {RateLimitConfigs} from '~/RateLimitConfig';
import {mapUserToPrivateResponse} from '~/user/UserMappers';
import {randomString} from '~/utils/RandomUtils';

const MUSIC_OAUTH_STATE_CACHE_PREFIX = 'astramusic:oauth-state:';
const DEFAULT_POST_LOGIN_PATH = '/account';

const buildMusicAppUrl = (path: string) => new URL(path, Config.musicOauth2.appEndpoint).toString();

const getMusicSessionCookieOptions = (maxAge: number) => ({
	httpOnly: true,
	secure: Config.cookie.secure,
	sameSite: 'Lax' as const,
	path: '/',
	maxAge,
});

const setMusicSessionCookie = async (ctx: Context<HonoEnv>, userId: string, sessionToken: string) => {
	const cookieValue = await getMusicSessionCookieService().createCookieValue({userId, sessionToken});
	setCookie(ctx, MUSIC_SESSION_COOKIE_NAME, cookieValue, getMusicSessionCookieOptions(MUSIC_SESSION_TTL_SECONDS));
};

const clearMusicSessionCookie = (ctx: Context<HonoEnv>) => {
	setCookie(ctx, MUSIC_SESSION_COOKIE_NAME, '', getMusicSessionCookieOptions(0));
};

const setMusicOauthStateCookie = (ctx: Context<HonoEnv>, state: string) => {
	setCookie(ctx, MUSIC_OAUTH_STATE_COOKIE_NAME, state, {
		httpOnly: true,
		secure: Config.cookie.secure,
		sameSite: 'Lax',
		path: '/',
		maxAge: MUSIC_OAUTH_STATE_TTL_SECONDS,
	});
};

const clearMusicOauthStateCookie = (ctx: Context<HonoEnv>) => {
	setCookie(ctx, MUSIC_OAUTH_STATE_COOKIE_NAME, '', {
		httpOnly: true,
		secure: Config.cookie.secure,
		sameSite: 'Lax',
		path: '/',
		maxAge: 0,
	});
};

const getMusicOauthStateCacheKey = (state: string) => `${MUSIC_OAUTH_STATE_CACHE_PREFIX}${state}`;

function sanitizeRedirectPath(value: string | null | undefined): string {
	if (!value) {
		return DEFAULT_POST_LOGIN_PATH;
	}

	try {
		const normalized = new URL(value, Config.musicOauth2.appEndpoint);
		const appOrigin = new URL(Config.musicOauth2.appEndpoint).origin;
		if (normalized.origin !== appOrigin) {
			return DEFAULT_POST_LOGIN_PATH;
		}

		const path = `${normalized.pathname}${normalized.search}${normalized.hash}`;
		if (!path.startsWith('/') || path.startsWith('/api/')) {
			return DEFAULT_POST_LOGIN_PATH;
		}

		if (['/login', '/api/music/auth/callback'].includes(normalized.pathname)) {
			return DEFAULT_POST_LOGIN_PATH;
		}

		return path || DEFAULT_POST_LOGIN_PATH;
	} catch {
		return DEFAULT_POST_LOGIN_PATH;
	}
}

function buildAstralLoginRedirectUrl(state: string): string {
	const clientId = Config.musicOauth2.clientId;
	if (!clientId) {
		throw new Error('music_oauth_client_id_missing');
	}

	const authorizeParams = new URLSearchParams({
		response_type: 'code',
		client_id: clientId,
		redirect_uri: Config.musicOauth2.redirectUri,
		scope: 'identify email',
		state,
	});

	const loginUrl = new URL('/login', Config.endpoints.webApp);
	loginUrl.searchParams.set('redirect_to', `/oauth2/authorize?${authorizeParams.toString()}`);
	return loginUrl.toString();
}

function buildLoginErrorRedirect(code: string): string {
	return buildMusicAppUrl(`/login?oauth_error=${encodeURIComponent(code)}`);
}

export const UserMusicAuthController = (app: HonoApp) => {
	app.get('/music/auth/start', RateLimitMiddleware(RateLimitConfigs.OAUTH_AUTHORIZE), async (ctx) => {
		const redirectTo = sanitizeRedirectPath(new URL(ctx.req.url).searchParams.get('redirect_to'));

		if (ctx.get('user')) {
			return ctx.redirect(buildMusicAppUrl(redirectTo));
		}

		if (!Config.musicOauth2.clientId || !Config.musicOauth2.clientSecret) {
			Logger.error('Music OAuth2 is not configured');
			return ctx.redirect(buildLoginErrorRedirect('oauth_not_configured'));
		}

		const state = randomString(64);
		await ctx.get('cacheService').set(getMusicOauthStateCacheKey(state), {redirectTo}, MUSIC_OAUTH_STATE_TTL_SECONDS);
		setMusicOauthStateCookie(ctx, state);

		return ctx.redirect(buildAstralLoginRedirectUrl(state));
	});

	app.get('/music/auth/callback', RateLimitMiddleware(RateLimitConfigs.OAUTH_TOKEN), async (ctx) => {
		const url = new URL(ctx.req.url);
		const code = url.searchParams.get('code');
		const state = url.searchParams.get('state');
		const oauthError = url.searchParams.get('error');

		if (oauthError) {
			clearMusicOauthStateCookie(ctx);
			return ctx.redirect(buildLoginErrorRedirect(oauthError));
		}

		if (!code || !state) {
			clearMusicOauthStateCookie(ctx);
			return ctx.redirect(buildLoginErrorRedirect('oauth_code_missing'));
		}

		const storedState = getCookie(ctx, MUSIC_OAUTH_STATE_COOKIE_NAME);
		const stateCacheKey = getMusicOauthStateCacheKey(state);
		const cachedState = await ctx.get('cacheService').get<{redirectTo?: string}>(stateCacheKey);

		clearMusicOauthStateCookie(ctx);
		await ctx.get('cacheService').delete(stateCacheKey);

		if (!storedState || storedState !== state || !cachedState) {
			return ctx.redirect(buildLoginErrorRedirect('oauth_state_invalid'));
		}

		try {
			const tokenResponse = await ctx.get('oauth2Service').tokenExchange({
				grantType: 'authorization_code',
				code,
				redirectUri: Config.musicOauth2.redirectUri,
				clientId: Config.musicOauth2.clientId,
				clientSecret: Config.musicOauth2.clientSecret,
			});

			const tokenData = await ctx.get('oauth2TokenRepository').getAccessToken(tokenResponse.access_token);
			const userId = tokenData?.userId ?? null;

			if (!userId) {
				throw new Error('oauth_user_missing');
			}

			const user = await ctx.get('userService').findUnique(userId);
			if (!user) {
				throw new Error('oauth_user_not_found');
			}

			const [sessionToken] = await ctx.get('authService').createAuthSession({
				user,
				request: ctx.req.raw,
			});

			await setMusicSessionCookie(ctx, user.id.toString(), sessionToken);

			return ctx.redirect(buildMusicAppUrl(sanitizeRedirectPath(cachedState.redirectTo)));
		} catch (error) {
			Logger.error({error}, 'Music OAuth callback failed');
			clearMusicSessionCookie(ctx);
			return ctx.redirect(buildLoginErrorRedirect('oauth_callback_failed'));
		}
	});

	app.get(
		'/music/auth/session',
		RateLimitMiddleware(RateLimitConfigs.USER_SETTINGS_GET),
		LoginRequiredAllowSuspicious,
		DefaultUserOnly,
		async (ctx) => {
			return ctx.json({user: mapUserToPrivateResponse(ctx.get('user'))});
		},
	);

	app.post('/music/auth/logout', RateLimitMiddleware(RateLimitConfigs.AUTH_LOGOUT), async (ctx) => {
		const token = ctx.get('authToken');
		if (token) {
			try {
				await ctx.get('authService').revokeToken(token);
			} catch (error) {
				Logger.warn({error}, 'Failed to revoke music session token during logout');
			}
		}

		clearMusicSessionCookie(ctx);
		clearMusicOauthStateCookie(ctx);
		return ctx.json({ok: true});
	});
};
