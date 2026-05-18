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
import {WataError} from '~/Errors';
import {Logger} from '~/Logger';
import {DefaultUserOnly, LoginRequired} from '~/middleware/AuthMiddleware';
import {RateLimitMiddleware} from '~/middleware/RateLimitMiddleware';
import {RateLimitConfigs} from '~/RateLimitConfig';
import {createStringType, z} from '~/Schema';
import {CreateCheckoutSessionRequest} from '~/stripe/StripeModel';
import {Validator} from '~/Validator';

function getWataService(ctx: Context<HonoEnv>) {
	const service = ctx.get('wataService');
	if (!service) {
		throw new WataError('WATA provider is disabled', 500);
	}
	return service;
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

export const WataController = (app: HonoApp) => {
	app.post(
		'/payments/wata/checkout/subscription',
		RateLimitMiddleware(RateLimitConfigs.STRIPE_CHECKOUT_SUBSCRIPTION),
		LoginRequired,
		DefaultUserOnly,
		Validator('json', CreateCheckoutSessionRequest),
		async (ctx) => {
			const {price_id, referral_code} = ctx.req.valid('json');
			const userId = ctx.get('user').id;
			const url = await getWataService(ctx).createCheckoutSession({
				userId,
				priceId: price_id,
				isGift: false,
				referralCode: referral_code ?? null,
			});
			return ctx.json({url});
		},
	);

	app.post(
		'/payments/wata/checkout/gift',
		RateLimitMiddleware(RateLimitConfigs.STRIPE_CHECKOUT_GIFT),
		LoginRequired,
		DefaultUserOnly,
		Validator('json', CreateCheckoutSessionRequest),
		async (ctx) => {
			const {price_id, referral_code} = ctx.req.valid('json');
			const userId = ctx.get('user').id;
			const url = await getWataService(ctx).createCheckoutSession({
				userId,
				priceId: price_id,
				isGift: true,
				referralCode: referral_code ?? null,
			});
			return ctx.json({url});
		},
	);

	app.post('/payments/wata/notification', async (ctx) => {
		const rawBody = await ctx.req.text();
		Logger.info(
			{
				contentType: ctx.req.header('content-type') ?? null,
				userAgent: ctx.req.header('user-agent') ?? null,
				forwardedFor: ctx.req.header('x-forwarded-for') ?? null,
				signaturePresent: !!ctx.req.header('x-signature'),
				rawBodyLength: rawBody.length,
			},
			'WATA webhook request received by controller',
		);
		const payload = parseNotificationBody(rawBody);
		const signatureHeader = ctx.req.header('x-signature') ?? null;
		await getWataService(ctx).handleNotification(payload, rawBody, signatureHeader);
		return ctx.text('OK');
	});

	app.post(
		'/payments/wata/orders/:orderId/reconcile',
		LoginRequired,
		DefaultUserOnly,
		Validator('param', z.object({orderId: createStringType()})),
		async (ctx) => {
			const {orderId} = ctx.req.valid('param');
			const userId = ctx.get('user').id;
			const status = await getWataService(ctx).reconcileOrderForUser(userId, orderId);
			return ctx.json({status});
		},
	);
};
