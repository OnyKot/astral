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
import type {HonoApp, HonoEnv} from '~/App';
import {TBankError} from '~/Errors';
import {DefaultUserOnly, LoginRequired} from '~/middleware/AuthMiddleware';
import {RateLimitMiddleware} from '~/middleware/RateLimitMiddleware';
import {RateLimitConfigs} from '~/RateLimitConfig';
import {createStringType, z} from '~/Schema';
import {CreateCheckoutSessionRequest} from '~/stripe/StripeModel';
import {Validator} from '~/Validator';

function parseNotificationBody(rawBody: string): Record<string, unknown> {
	if (!rawBody || rawBody.trim() === '') {
		return {};
	}

	try {
		const parsed = JSON.parse(rawBody) as unknown;
		if (parsed && typeof parsed === 'object') {
			return parsed as Record<string, unknown>;
		}
	} catch {}

	return Object.fromEntries(new URLSearchParams(rawBody));
}

function getTBankService(ctx: Context<HonoEnv>) {
	const service = ctx.get('tbankService');
	if (!service) {
		throw new TBankError('T-Bank payment provider is disabled', 500);
	}
	return service;
}

export const TBankController = (app: HonoApp) => {
	app.post(
		'/payments/tbank/checkout/subscription',
		RateLimitMiddleware(RateLimitConfigs.STRIPE_CHECKOUT_SUBSCRIPTION),
		LoginRequired,
		DefaultUserOnly,
		Validator('json', CreateCheckoutSessionRequest),
		async (ctx) => {
			const {price_id} = ctx.req.valid('json');
			const userId = ctx.get('user').id;

			const url = await getTBankService(ctx).createCheckoutSession({
				userId,
				priceId: price_id,
				isGift: false,
			});
			return ctx.json({url});
		},
	);

	app.post(
		'/payments/tbank/checkout/gift',
		RateLimitMiddleware(RateLimitConfigs.STRIPE_CHECKOUT_GIFT),
		LoginRequired,
		DefaultUserOnly,
		Validator('json', CreateCheckoutSessionRequest),
		async (ctx) => {
			const {price_id} = ctx.req.valid('json');
			const userId = ctx.get('user').id;

			const url = await getTBankService(ctx).createCheckoutSession({
				userId,
				priceId: price_id,
				isGift: true,
			});
			return ctx.json({url});
		},
	);

	app.post('/payments/tbank/notification', async (ctx) => {
		const rawBody = await ctx.req.text();
		const payload = parseNotificationBody(rawBody);
		await getTBankService(ctx).handleNotification(payload);
		return ctx.text('OK');
	});

	app.post(
		'/payments/tbank/orders/:orderId/reconcile',
		LoginRequired,
		DefaultUserOnly,
		Validator('param', z.object({orderId: createStringType()})),
		async (ctx) => {
			const {orderId} = ctx.req.valid('param');
			const userId = ctx.get('user').id;
			await getTBankService(ctx).reconcileOrderForUser(userId, orderId);
			return ctx.body(null, 204);
		},
	);
};
