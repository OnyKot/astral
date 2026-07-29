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
import {TelegramBotClient} from '~/telegram/TelegramBotClient';
import {
	TelegramNotificationPreferencesRequest,
	TelegramTwoFactorEnableRequest,
	TelegramVerifyRequest,
} from '~/telegram/TelegramModel';
import {TelegramService} from '~/telegram/TelegramService';
import {TelegramWebhookHandler, type TelegramUpdate} from '~/telegram/TelegramWebhookHandler';

const telegramService = new TelegramService();

export const TelegramController = (app: HonoApp) => {
	app.get(
		'/users/@me/integrations/telegram',
		RateLimitMiddleware(RateLimitConfigs.TELEGRAM_CONNECTION_GET),
		LoginRequired,
		DefaultUserOnly,
		async (ctx) => ctx.json(await telegramService.getStatus(ctx.get('user').id)),
	);

	app.post(
		'/users/@me/integrations/telegram/verify',
		RateLimitMiddleware(RateLimitConfigs.TELEGRAM_CONNECT_VERIFY),
		LoginRequired,
		DefaultUserOnly,
		Validator('json', TelegramVerifyRequest),
		async (ctx) => {
			const body = ctx.req.valid('json');
			const result = await telegramService.verifyAndConnect({
				userId: ctx.get('user').id,
				payload: body,
			});
			if (!result.ok) return ctx.json(result, 400);
			return ctx.json(result);
		},
	);

	app.patch(
		'/users/@me/integrations/telegram/preferences',
		RateLimitMiddleware(RateLimitConfigs.TELEGRAM_PREFERENCES_UPDATE),
		LoginRequired,
		DefaultUserOnly,
		Validator('json', TelegramNotificationPreferencesRequest),
		async (ctx) => {
			const body = ctx.req.valid('json');
			const result = await telegramService.updatePreferences(ctx.get('user').id, body);
			return ctx.json(result, result.ok ? 200 : 404);
		},
	);

	app.delete(
		'/users/@me/integrations/telegram',
		RateLimitMiddleware(RateLimitConfigs.TELEGRAM_DISCONNECT),
		LoginRequired,
		DefaultUserOnly,
		async (ctx) => ctx.json(await telegramService.disconnect(ctx.get('user').id)),
	);

	app.post(
		'/users/@me/integrations/telegram/2fa/setup',
		RateLimitMiddleware(RateLimitConfigs.TELEGRAM_CONNECT_VERIFY),
		LoginRequired,
		DefaultUserOnly,
		async (ctx) => {
			const result = await telegramService.setupTwoFactor({
				userId: ctx.get('user').id,
				cacheService: ctx.get('cacheService'),
			});
			return ctx.json(result, result.ok ? 200 : 400);
		},
	);

	app.post(
		'/users/@me/integrations/telegram/2fa/enable',
		RateLimitMiddleware(RateLimitConfigs.TELEGRAM_CONNECT_VERIFY),
		LoginRequired,
		DefaultUserOnly,
		Validator('json', TelegramTwoFactorEnableRequest),
		async (ctx) => {
			const body = ctx.req.valid('json');
			const result = await telegramService.enableTwoFactor({
				userId: ctx.get('user').id,
				cacheService: ctx.get('cacheService'),
				code: body.code,
			});
			return ctx.json(result, result.ok ? 200 : 400);
		},
	);

	app.post(
		'/users/@me/integrations/telegram/2fa/disable',
		RateLimitMiddleware(RateLimitConfigs.TELEGRAM_DISCONNECT),
		LoginRequired,
		DefaultUserOnly,
		async (ctx) => {
			const result = await telegramService.disableTwoFactor(ctx.get('user').id);
			return ctx.json(result, result.ok ? 200 : 404);
		},
	);

	// Telegram Bot webhook — public endpoint, secured by:
	//   1. Header X-Telegram-Bot-Api-Secret-Token compared to TELEGRAM_WEBHOOK_SECRET
	//      (Telegram sets this when we call setWebhook with `secret_token` param)
	//   2. The handler ignores anything that doesn't look like a real Update
	app.post('/integrations/telegram/webhook', async (ctx) => {
		const expectedSecret = Config.telegram.webhookSecret;
		if (!expectedSecret) {
			return ctx.json({ok: false, error: 'webhook_not_configured'}, 503);
		}
		const incomingSecret = ctx.req.header('x-telegram-bot-api-secret-token') ?? '';
		if (incomingSecret !== expectedSecret) {
			return ctx.json({ok: false}, 401);
		}
		const botToken = Config.telegram.botToken;
		if (!botToken) return ctx.json({ok: false}, 503);

		let update: TelegramUpdate;
		try {
			update = (await ctx.req.json()) as TelegramUpdate;
		} catch {
			return ctx.json({ok: false}, 400);
		}
		const handler = new TelegramWebhookHandler(new TelegramBotClient(botToken));
		// Fire-and-forget: respond 200 to Telegram quickly, do work in background.
		// Telegram retries on non-2xx, but we never want to retry a partial commit.
		void handler.handle(update).catch(() => {/* logged inside */});
		return ctx.json({ok: true});
	});
};
