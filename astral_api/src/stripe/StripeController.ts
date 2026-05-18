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
import {createUserID} from '~/BrandedTypes';
import {UserPremiumTypes} from '~/Constants';
import {AccessDeniedError, StripeError, StripeWebhookSignatureMissingError} from '~/Errors';
import {DefaultUserOnly, LoginRequired} from '~/middleware/AuthMiddleware';
import {RateLimitMiddleware} from '~/middleware/RateLimitMiddleware';
import {RateLimitConfigs} from '~/RateLimitConfig';
import {createStringType, Int64Type, z} from '~/Schema';
import {
	CreateCheckoutSessionRequest,
	GiftCatalogItemResponse,
	mapGiftCodeToMetadataResponse,
	mapGiftCodeToResponse,
	ReferralProgramSummaryResponse,
} from '~/stripe/StripeModel';
import {Validator} from '~/Validator';

function getStripeService(ctx: Context<HonoEnv>) {
	const service = ctx.get('stripeService');
	if (!service) {
		throw new StripeError('Payment processing is not available');
	}
	return service;
}

export const StripeController = (app: HonoApp) => {
	app.get('/gifts', RateLimitMiddleware(RateLimitConfigs.GIFTS_LIST), async (ctx) => {
		const countryCode = ctx.req.query('country_code');
		const items = getStripeService(ctx).getGiftCatalog(countryCode).map((gift) =>
			GiftCatalogItemResponse.parse({
				id: gift.id,
				price_id: gift.priceId,
				duration_months: gift.durationMonths,
				premium_type: gift.premiumType === UserPremiumTypes.LIFETIME ? 'lifetime' : 'subscription',
				currency: gift.currency ?? null,
				available: gift.available,
			}),
		);
		return ctx.json(items);
	});

	app.post('/stripe/webhook', async (ctx) => {
		const stripeService = getStripeService(ctx);
		const signature = ctx.req.header('stripe-signature');
		if (!signature) {
			throw new StripeWebhookSignatureMissingError();
		}
		const body = await ctx.req.text();
		await stripeService.handleWebhook({body, signature});
		return ctx.json({received: true});
	});

	app.post(
		'/stripe/checkout/subscription',
		RateLimitMiddleware(RateLimitConfigs.STRIPE_CHECKOUT_SUBSCRIPTION),
		LoginRequired,
		DefaultUserOnly,
		Validator('json', CreateCheckoutSessionRequest),
		async (ctx) => {
			const {price_id, referral_code} = ctx.req.valid('json');
			const userId = ctx.get('user').id;

			const wataService = ctx.get('wataService');
			if (wataService && wataService.supportsPriceId(price_id)) {
				const checkoutUrl = await wataService.createCheckoutSession({
					userId,
					priceId: price_id,
					isGift: false,
					referralCode: referral_code ?? null,
				});
				return ctx.json({url: checkoutUrl});
			}

			const checkoutUrl = await getStripeService(ctx).createCheckoutSession({
				userId,
				priceId: price_id,
				isGift: false,
				referralCode: referral_code ?? null,
			});

			return ctx.json({url: checkoutUrl});
		},
	);

	app.post(
		'/stripe/checkout/gift',
		RateLimitMiddleware(RateLimitConfigs.STRIPE_CHECKOUT_GIFT),
		LoginRequired,
		DefaultUserOnly,
		Validator('json', CreateCheckoutSessionRequest),
		async (ctx) => {
			const {price_id, referral_code} = ctx.req.valid('json');
			const userId = ctx.get('user').id;

			const wataService = ctx.get('wataService');
			if (wataService && wataService.supportsPriceId(price_id)) {
				const checkoutUrl = await wataService.createCheckoutSession({
					userId,
					priceId: price_id,
					isGift: true,
					referralCode: referral_code ?? null,
				});
				return ctx.json({url: checkoutUrl});
			}

			const checkoutUrl = await getStripeService(ctx).createCheckoutSession({
				userId,
				priceId: price_id,
				isGift: true,
				referralCode: referral_code ?? null,
			});

			return ctx.json({url: checkoutUrl});
		},
	);

	app.get(
		'/gifts/:code',
		RateLimitMiddleware(RateLimitConfigs.GIFT_CODE_GET),
		Validator('param', z.object({code: createStringType()})),
		async (ctx) => {
			const {code} = ctx.req.valid('param');
			const giftCode = await getStripeService(ctx).getGiftCode(code);
			const response = await mapGiftCodeToResponse({
				giftCode,
				userCacheService: ctx.get('userCacheService'),
				requestCache: ctx.get('requestCache'),
				includeCreator: true,
			});
			return ctx.json(response);
		},
	);

	app.post(
		'/gifts/send',
		RateLimitMiddleware(RateLimitConfigs.GIFT_CODE_REDEEM),
		LoginRequired,
		DefaultUserOnly,
		Validator(
			'json',
			z.object({
				code: createStringType(),
				recipient_user_id: Int64Type,
			}),
		),
		async (ctx) => {
			const {code, recipient_user_id} = ctx.req.valid('json');
			await getStripeService(ctx).sendGiftCode(ctx.get('user').id, createUserID(recipient_user_id), code);
			return ctx.body(null, 204);
		},
	);

	app.post(
		'/gifts/:code/redeem',
		RateLimitMiddleware(RateLimitConfigs.GIFT_CODE_REDEEM),
		LoginRequired,
		DefaultUserOnly,
		Validator('param', z.object({code: createStringType()})),
		async (ctx) => {
			const {code} = ctx.req.valid('param');
			const userId = ctx.get('user').id;
			await getStripeService(ctx).redeemGiftCode(userId, code);
			return ctx.body(null, 204);
		},
	);

	app.get(
		'/gifts/inventory/:user_id',
		RateLimitMiddleware(RateLimitConfigs.GIFTS_LIST),
		LoginRequired,
		DefaultUserOnly,
		Validator('param', z.object({user_id: Int64Type})),
		async (ctx) => {
			const {user_id} = ctx.req.valid('param');
			if (ctx.get('user').id !== createUserID(user_id)) {
				throw new AccessDeniedError();
			}
			const gifts = await getStripeService(ctx).getReceivedGifts(createUserID(user_id));
			const responses = await Promise.all(
				gifts.map((gift) =>
					mapGiftCodeToMetadataResponse({
						giftCode: gift,
						userCacheService: ctx.get('userCacheService'),
						requestCache: ctx.get('requestCache'),
					}),
				),
			);
			return ctx.json(responses);
		},
	);

	app.get(
		'/users/@me/gifts',
		RateLimitMiddleware(RateLimitConfigs.GIFTS_LIST),
		LoginRequired,
		DefaultUserOnly,
		async (ctx) => {
			const userId = ctx.get('user').id;
			const gifts = await getStripeService(ctx).getUserGifts(userId);
			const responses = await Promise.all(
				gifts.map((gift) =>
					mapGiftCodeToMetadataResponse({
						giftCode: gift,
						userCacheService: ctx.get('userCacheService'),
						requestCache: ctx.get('requestCache'),
					}),
				),
			);
			return ctx.json(responses);
		},
	);

	app.get('/premium/visionary/slots', RateLimitMiddleware(RateLimitConfigs.STRIPE_VISIONARY_SLOTS), async (ctx) => {
		const slots = await getStripeService(ctx).getVisionarySlots();
		return ctx.json(slots);
	});

	app.get('/premium/price-ids', RateLimitMiddleware(RateLimitConfigs.STRIPE_PRICE_IDS), async (ctx) => {
		const countryCode = ctx.req.query('country_code');
		const wataService = ctx.get('wataService');
		const stripeService = ctx.get('stripeService');

		const priceIds =
			wataService && (!stripeService || wataService.isCountrySupported(countryCode))
				? wataService.getPriceIds()
				: getStripeService(ctx).getPriceIds(countryCode);

		return ctx.json(priceIds);
	});

	app.post(
		'/premium/referrals/summary',
		RateLimitMiddleware(RateLimitConfigs.STRIPE_PRICE_IDS),
		LoginRequired,
		DefaultUserOnly,
		async (ctx) => {
			const summary = await getStripeService(ctx).getReferralProgramSummary(ctx.get('user').id);
			return ctx.json(
				ReferralProgramSummaryResponse.parse({
					referral_code: summary.referralCode,
					share_url: summary.shareUrl,
					paid_referrals_count: summary.paidReferralsCount,
					reward_percent: summary.rewardPercent,
					max_reward_percent: summary.maxRewardPercent,
					total_reward_cents: summary.totalRewardCents,
					payout_interval_days: summary.payoutIntervalDays,
					support_bot_username: summary.supportBotUsername,
				}),
			);
		},
	);

	app.post(
		'/premium/customer-portal',
		RateLimitMiddleware(RateLimitConfigs.STRIPE_CUSTOMER_PORTAL),
		LoginRequired,
		DefaultUserOnly,
		async (ctx) => {
			const userId = ctx.get('user').id;
			const url = await getStripeService(ctx).createCustomerPortalSession(userId);
			return ctx.json({url});
		},
	);

	app.post(
		'/premium/cancel-subscription',
		RateLimitMiddleware(RateLimitConfigs.STRIPE_SUBSCRIPTION_CANCEL),
		LoginRequired,
		DefaultUserOnly,
		async (ctx) => {
			const userId = ctx.get('user').id;
			await getStripeService(ctx).cancelSubscriptionAtPeriodEnd(userId);
			return ctx.body(null, 204);
		},
	);

	app.post(
		'/premium/reactivate-subscription',
		RateLimitMiddleware(RateLimitConfigs.STRIPE_SUBSCRIPTION_REACTIVATE),
		LoginRequired,
		DefaultUserOnly,
		async (ctx) => {
			const userId = ctx.get('user').id;
			await getStripeService(ctx).reactivateSubscription(userId);
			return ctx.body(null, 204);
		},
	);

	app.post(
		'/premium/visionary/rejoin',
		RateLimitMiddleware(RateLimitConfigs.STRIPE_VISIONARY_REJOIN),
		LoginRequired,
		DefaultUserOnly,
		async (ctx) => {
			const userId = ctx.get('user').id;
			await getStripeService(ctx).rejoinVisionariesGuild(userId);
			return ctx.body(null, 204);
		},
	);

	app.post(
		'/premium/operator/rejoin',
		RateLimitMiddleware(RateLimitConfigs.STRIPE_VISIONARY_REJOIN),
		LoginRequired,
		DefaultUserOnly,
		async (ctx) => {
			const userId = ctx.get('user').id;
			await getStripeService(ctx).rejoinOperatorsGuild(userId);
			return ctx.body(null, 204);
		},
	);
};
