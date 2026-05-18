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
import {IntellectMoneyError} from '~/Errors';
import {DefaultUserOnly, LoginRequired} from '~/middleware/AuthMiddleware';
import {RateLimitMiddleware} from '~/middleware/RateLimitMiddleware';
import {RateLimitConfigs} from '~/RateLimitConfig';
import {createStringType, z} from '~/Schema';
import {CreateCheckoutSessionRequest} from '~/stripe/StripeModel';
import {Validator} from '~/Validator';

function getIntellectMoneyService(ctx: Context<HonoEnv>) {
	const service = ctx.get('intellectmoneyService');
	if (!service) {
		throw new IntellectMoneyError('IntellectMoney provider is disabled', 500);
	}
	return service;
}

function getIntellectMoneySignatureHeader(ctx: Context<HonoEnv>): string | null {
	return (
		ctx.req.header('x-signature') ??
		ctx.req.header('x-sign') ??
		ctx.req.header('signature') ??
		ctx.req.header('sign') ??
		null
	);
}

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

export const IntellectMoneyController = (app: HonoApp) => {
	app.post(
		'/payments/intellectmoney/checkout/subscription',
		RateLimitMiddleware(RateLimitConfigs.STRIPE_CHECKOUT_SUBSCRIPTION),
		LoginRequired,
		DefaultUserOnly,
		Validator('json', CreateCheckoutSessionRequest),
		async (ctx) => {
			const {price_id} = ctx.req.valid('json');
			const userId = ctx.get('user').id;
			const url = await getIntellectMoneyService(ctx).createCheckoutSession({
				userId,
				priceId: price_id,
				isGift: false,
			});
			return ctx.json({url});
		},
	);

	app.post(
		'/payments/intellectmoney/checkout/gift',
		RateLimitMiddleware(RateLimitConfigs.STRIPE_CHECKOUT_GIFT),
		LoginRequired,
		DefaultUserOnly,
		Validator('json', CreateCheckoutSessionRequest),
		async (ctx) => {
			const {price_id} = ctx.req.valid('json');
			const userId = ctx.get('user').id;
			const url = await getIntellectMoneyService(ctx).createCheckoutSession({
				userId,
				priceId: price_id,
				isGift: true,
			});
			return ctx.json({url});
		},
	);

	app.post('/payments/intellectmoney/notification', async (ctx) => {
		const rawBody = await ctx.req.text();
		const payload = parseNotificationBody(rawBody);
		const signatureHeader = getIntellectMoneySignatureHeader(ctx);
		await getIntellectMoneyService(ctx).handleNotification(payload, rawBody, signatureHeader);
		return ctx.text('OK');
	});

	app.post(
		'/payments/intellectmoney/orders/:orderId/reconcile',
		LoginRequired,
		DefaultUserOnly,
		Validator('param', z.object({orderId: createStringType()})),
		async (ctx) => {
			const {orderId} = ctx.req.valid('param');
			const userId = ctx.get('user').id;
			await getIntellectMoneyService(ctx).reconcileOrderForUser(userId, orderId);
			return ctx.body(null, 204);
		},
	);
};
