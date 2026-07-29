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
import {
	TwitchCreatorProgramPatchRequest,
	TwitchOAuthStartRequest,
	TwitchSettingsPatchRequest,
	TwitchSubscriberPerkCheckRequest,
	type TwitchOAuthIntent,
} from './TwitchModel';
import {readTwitchEventSubHeaders, verifyTwitchEventSubSignature} from './TwitchEventSubVerifier';
import {TwitchService} from './TwitchService';

const twitchService = new TwitchService();

function buildOauthHandoffHtml(payload: {ok: boolean; error?: string; redirectTo: string}): string {
	const serialized = JSON.stringify(payload).replace(/</g, '\\u003c');
	return `<!doctype html>
<html>
<head>
	<meta charset="utf-8">
	<title>Twitch connected</title>
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
			localStorage.setItem('astral.twitch.connect.result', JSON.stringify(payload));
		} catch {}
		try {
			if (window.opener) {
				window.opener.postMessage({type: 'astral:twitch:oauth', ...payload}, '*');
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

function pickIntent(intent: TwitchOAuthIntent | undefined, mode: TwitchOAuthIntent | undefined): TwitchOAuthIntent {
	return intent ?? mode ?? 'viewer';
}

export const TwitchController = (app: HonoApp) => {
	app.get(
		'/users/@me/integrations/twitch',
		RateLimitMiddleware(RateLimitConfigs.TWITCH_CONNECTION_GET),
		LoginRequired,
		DefaultUserOnly,
		async (ctx) => ctx.json(await twitchService.getStatus(ctx.get('user').id)),
	);

	app.post(
		'/users/@me/integrations/twitch/oauth/start',
		RateLimitMiddleware(RateLimitConfigs.TWITCH_CONNECT_START),
		LoginRequired,
		DefaultUserOnly,
		Validator('json', TwitchOAuthStartRequest),
		async (ctx) => {
			const body = ctx.req.valid('json');
			const result = await twitchService.startOAuth({
				cacheService: ctx.get('cacheService'),
				userId: ctx.get('user').id,
				intent: pickIntent(body.intent, body.mode),
				redirectTo: body.redirect_to,
				state: randomString(48),
			});
			return ctx.json(result, result.configured ? 200 : 503);
		},
	);

	app.get('/integrations/twitch/oauth/callback', async (ctx) => {
		const url = new URL(ctx.req.url);
		const code = url.searchParams.get('code');
		const state = url.searchParams.get('state');
		const error = url.searchParams.get('error');

		if (error || !code || !state) {
			return ctx.html(
				buildOauthHandoffHtml({
					ok: false,
					error: error || 'oauth_code_missing',
					redirectTo: Config.twitch.postConnectRedirectUrl,
				}),
			);
		}

		const result = await twitchService.completeOAuth({
			cacheService: ctx.get('cacheService'),
			code,
			state,
		});
		return ctx.html(buildOauthHandoffHtml(result));
	});

	app.patch(
		'/users/@me/integrations/twitch/settings',
		RateLimitMiddleware(RateLimitConfigs.TWITCH_SETTINGS_UPDATE),
		LoginRequired,
		DefaultUserOnly,
		Validator('json', TwitchSettingsPatchRequest),
		async (ctx) => {
			const {settings} = ctx.req.valid('json');
			return ctx.json(await twitchService.updateSettings(ctx.get('user').id, settings));
		},
	);

	app.patch(
		'/users/@me/integrations/twitch/creator-program',
		RateLimitMiddleware(RateLimitConfigs.TWITCH_CREATOR_PROGRAM_UPDATE),
		LoginRequired,
		DefaultUserOnly,
		Validator('json', TwitchCreatorProgramPatchRequest),
		async (ctx) => {
			const {program} = ctx.req.valid('json');
			const result = await twitchService.updateCreatorProgram(ctx.get('user').id, program);
			return ctx.json(result, result.ok ? 200 : 404);
		},
	);

	app.get(
		'/integrations/twitch/creator-programs',
		RateLimitMiddleware(RateLimitConfigs.TWITCH_CREATOR_PROGRAMS_LIST),
		LoginRequired,
		DefaultUserOnly,
		async (ctx) => ctx.json(await twitchService.listCreatorProgramsForUser(ctx.get('user').id)),
	);

	app.post(
		'/users/@me/integrations/twitch/eventsub/sync',
		RateLimitMiddleware(RateLimitConfigs.TWITCH_EVENTSUB_SYNC),
		LoginRequired,
		DefaultUserOnly,
		async (ctx) => {
			const result = await twitchService.syncEventSub(ctx.get('user').id);
			return ctx.json(result, result.ok ? 200 : result.configured ? 400 : 503);
		},
	);

	app.get(
		'/users/@me/integrations/twitch/live-state',
		RateLimitMiddleware(RateLimitConfigs.TWITCH_LIVE_STATE_GET),
		LoginRequired,
		DefaultUserOnly,
		async (ctx) => ctx.json(await twitchService.getLiveState(ctx.get('user').id)),
	);

	app.get(
		'/users/@me/integrations/twitch/subscriber-perks/grants',
		RateLimitMiddleware(RateLimitConfigs.TWITCH_SUBSCRIBER_PERKS_GET),
		LoginRequired,
		DefaultUserOnly,
		async (ctx) => ctx.json(await twitchService.getSubscriberPerkGrants(ctx.get('user').id)),
	);

	app.post(
		'/users/@me/integrations/twitch/subscriber-perks/check',
		RateLimitMiddleware(RateLimitConfigs.TWITCH_SUBSCRIBER_PERKS_CHECK),
		LoginRequired,
		DefaultUserOnly,
		Validator('json', TwitchSubscriberPerkCheckRequest),
		async (ctx) => {
			const {creatorLogin} = ctx.req.valid('json');
			const result = await twitchService.checkSubscriberPerk(ctx.get('user').id, creatorLogin);
			return ctx.json(result, result.eligible ? 200 : 400);
		},
	);

	app.post(
		'/users/@me/integrations/twitch/disconnect',
		RateLimitMiddleware(RateLimitConfigs.TWITCH_DISCONNECT),
		LoginRequired,
		DefaultUserOnly,
		async (ctx) => ctx.json(await twitchService.disconnect(ctx.get('user').id)),
	);

	app.post('/integrations/twitch/eventsub', async (ctx) => {
		const rawBody = await ctx.req.text();
		const headers = readTwitchEventSubHeaders(ctx.req.raw.headers);
		verifyTwitchEventSubSignature(headers, rawBody);
		const result = await twitchService.handleEventSubNotification({
			messageId: headers.messageId,
			messageType: headers.messageType,
			rawBody,
		});
		if (headers.messageType === 'webhook_callback_verification') {
			return ctx.text(result.challenge ?? '');
		}
		return ctx.body(null, 204);
	});
};
