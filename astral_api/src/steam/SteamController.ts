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

import type {HonoApp} from '~/App';
import {Config} from '~/Config';
import {DefaultUserOnly, LoginRequired} from '~/middleware/AuthMiddleware';
import {RateLimitMiddleware} from '~/middleware/RateLimitMiddleware';
import {RateLimitConfigs} from '~/RateLimitConfig';
import {Validator} from '~/Validator';
import {randomString} from '~/utils/RandomUtils';
import {SteamOpenIDStartRequest, SteamPresencePrivacyRequest} from '~/steam/SteamModel';
import {SteamService} from '~/steam/SteamService';

const steamService = new SteamService();

function buildOpenIDHandoffHtml(payload: {ok: boolean; error?: string; redirectTo: string}): string {
	const serialized = JSON.stringify(payload).replace(/</g, '\\u003c');
	return `<!doctype html>
<html>
<head>
	<meta charset="utf-8">
	<title>Steam connected</title>
	<style>
		body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #0d0e13; color: #fff; font: 15px system-ui, sans-serif; }
		a { color: #a78bfa; }
	</style>
</head>
<body>
	<div>Returning to Astral...</div>
	<script>
		const payload = ${serialized};
		try {
			localStorage.setItem('astral.steam.connect.result', JSON.stringify(payload));
		} catch {}
		try {
			if (window.opener) {
				window.opener.postMessage({type: 'astral:steam:openid', ...payload}, '*');
				window.close();
			} else {
				window.location.replace(payload.redirectTo);
			}
		} catch {
			window.location.replace(payload.redirectTo);
		}
	</script>
	<noscript><a href="${payload.redirectTo}">Return to Astral</a></noscript>
</body>
</html>`;
}

export const SteamController = (app: HonoApp) => {
	app.get(
		'/users/@me/integrations/steam',
		RateLimitMiddleware(RateLimitConfigs.STEAM_CONNECTION_GET),
		LoginRequired,
		DefaultUserOnly,
		async (ctx) => ctx.json(await steamService.getStatus(ctx.get('user').id)),
	);

	app.post(
		'/users/@me/integrations/steam/openid/start',
		RateLimitMiddleware(RateLimitConfigs.STEAM_OPENID_START),
		LoginRequired,
		DefaultUserOnly,
		Validator('json', SteamOpenIDStartRequest),
		async (ctx) => {
			const body = ctx.req.valid('json');
			const result = await steamService.startOpenID({
				cacheService: ctx.get('cacheService'),
				userId: ctx.get('user').id,
				redirectTo: body.redirect_to,
				state: randomString(48),
			});
			return ctx.json(result, result.configured ? 200 : 503);
		},
	);

	app.get('/integrations/steam/openid/callback', async (ctx) => {
		const url = new URL(ctx.req.url);
		const result = await steamService.completeOpenID({
			cacheService: ctx.get('cacheService'),
			query: url.searchParams,
		});
		return ctx.html(
			buildOpenIDHandoffHtml({
				ok: result.ok,
				error: result.error,
				redirectTo: result.redirectTo || Config.steam.postConnectRedirectUrl,
			}),
		);
	});

	app.delete(
		'/users/@me/integrations/steam',
		RateLimitMiddleware(RateLimitConfigs.STEAM_DISCONNECT),
		LoginRequired,
		DefaultUserOnly,
		async (ctx) => ctx.json(await steamService.disconnect(ctx.get('user').id)),
	);

	app.post(
		'/users/@me/integrations/steam/refresh',
		RateLimitMiddleware(RateLimitConfigs.STEAM_REFRESH),
		LoginRequired,
		DefaultUserOnly,
		async (ctx) => {
			const refreshed = await steamService.refreshFromSteam(ctx.get('user').id);
			return ctx.json({connection: refreshed});
		},
	);

	app.patch(
		'/users/@me/integrations/steam/presence/privacy',
		RateLimitMiddleware(RateLimitConfigs.STEAM_PRESENCE_PRIVACY),
		LoginRequired,
		DefaultUserOnly,
		Validator('json', SteamPresencePrivacyRequest),
		async (ctx) => {
			const body = ctx.req.valid('json');
			const updated = await steamService.setPresenceVisibility(ctx.get('user').id, body.visible);
			return ctx.json({connection: updated}, updated ? 200 : 404);
		},
	);
};
