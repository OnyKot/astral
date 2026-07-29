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

import type {UserCacheService} from '~/infrastructure/UserCacheService';
import type {GiftCode} from '~/Models';
import type {RequestCache} from '~/middleware/RequestCacheMiddleware';
import {createStringType, z} from '~/Schema';
import {getCachedUserPartialResponse} from '~/user/UserCacheHelpers';
import {UserPartialResponse} from '~/user/UserModel';

export const WataDeviceDataSchema = z
	.object({
		browserAcceptHeader: z.string().optional(),
		browserColorDepth: z.number().optional(),
		browserJavaEnabled: z.boolean().optional(),
		browserJavaScriptEnabled: z.boolean().optional(),
		browserLanguage: z.string().optional(),
		browserScreenHeight: z.number().optional(),
		browserScreenWidth: z.number().optional(),
		browserTz: z.number().optional(),
		browserUserAgent: z.string().optional(),
	})
	.partial();

export type WataDeviceData = z.infer<typeof WataDeviceDataSchema>;

export const CreateCheckoutSessionRequest = z.object({
	price_id: createStringType(),
	referral_code: createStringType().nullish(),
	device_data: WataDeviceDataSchema.optional(),
});

export type CreateCheckoutSessionRequest = z.infer<typeof CreateCheckoutSessionRequest>;

export const GiftCodeResponse = z.object({
	code: z.string(),
	duration_months: z.number().int(),
	redeemed: z.boolean(),
	created_by: z.lazy(() => UserPartialResponse).nullish(),
	emoji: z.string().nullish(),
	background: z.string().nullish(),
});

export type GiftCodeResponse = z.infer<typeof GiftCodeResponse>;

export const GiftCodeMetadataResponse = z.object({
	code: z.string(),
	duration_months: z.number().int(),
	created_at: z.iso.datetime(),
	created_by: z.lazy(() => UserPartialResponse),
	redeemed_at: z.iso.datetime().nullish(),
	redeemed_by: z.lazy(() => UserPartialResponse).nullish(),
});

export type GiftCodeMetadataResponse = z.infer<typeof GiftCodeMetadataResponse>;

export const GiftCatalogItemResponse = z.object({
	id: z.enum(['gift_1_month', 'gift_1_year', 'gift_visionary']),
	price_id: z.string().nullable(),
	duration_months: z.number().int().nonnegative(),
	premium_type: z.enum(['subscription', 'lifetime']),
	currency: z.enum(['USD', 'EUR', 'RUB']).nullable(),
	available: z.boolean(),
});

export type GiftCatalogItemResponse = z.infer<typeof GiftCatalogItemResponse>;

export const ReferralProgramSummaryResponse = z.object({
	referral_code: z.string(),
	share_url: z.string(),
	paid_referrals_count: z.number().int().nonnegative(),
	reward_percent: z.number().int().nonnegative(),
	max_reward_percent: z.number().int().positive(),
	total_reward_cents: z.number().int().nonnegative(),
	payout_interval_days: z.number().int().positive(),
	support_bot_username: z.string().nullish(),
});

export type ReferralProgramSummaryResponse = z.infer<typeof ReferralProgramSummaryResponse>;

interface MapGiftCodeToResponseParams {
	giftCode: GiftCode;
	userCacheService: UserCacheService;
	requestCache: RequestCache;
	includeCreator?: boolean;
}

interface MapGiftCodeToMetadataResponseParams {
	giftCode: GiftCode;
	userCacheService: UserCacheService;
	requestCache: RequestCache;
}

export const mapGiftCodeToResponse = async ({
	giftCode,
	userCacheService,
	requestCache,
	includeCreator = false,
}: MapGiftCodeToResponseParams): Promise<GiftCodeResponse> => {
	let createdBy = null;
	if (includeCreator) {
		createdBy = await getCachedUserPartialResponse({
			userId: giftCode.createdByUserId,
			userCacheService,
			requestCache,
		});
	}

	return {
		code: giftCode.code,
		duration_months: giftCode.durationMonths,
		redeemed: !!giftCode.redeemedAt,
		created_by: createdBy,
		emoji: giftCode.emoji ?? null,
		background: giftCode.background ?? null,
	};
};

export const mapGiftCodeToMetadataResponse = async ({
	giftCode,
	userCacheService,
	requestCache,
}: MapGiftCodeToMetadataResponseParams): Promise<GiftCodeMetadataResponse> => {
	const [createdBy, redeemedBy] = await Promise.all([
		getCachedUserPartialResponse({
			userId: giftCode.createdByUserId,
			userCacheService,
			requestCache,
		}),
		giftCode.redeemedByUserId
			? getCachedUserPartialResponse({
					userId: giftCode.redeemedByUserId,
					userCacheService,
					requestCache,
				})
			: null,
	]);

	return {
		code: giftCode.code,
		duration_months: giftCode.durationMonths,
		created_at: giftCode.createdAt.toISOString(),
		created_by: createdBy,
		redeemed_at: giftCode.redeemedAt?.toISOString() ?? null,
		redeemed_by: redeemedBy,
	};
};
