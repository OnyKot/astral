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

import type {RouteRateLimitConfig} from '~/middleware/RateLimitMiddleware';

export const IntegrationRateLimitConfigs = {
	TENOR_SEARCH: {
		bucket: 'tenor:search',
		config: {limit: 40, windowMs: 10000},
	} as RouteRateLimitConfig,

	TENOR_FEATURED: {
		bucket: 'tenor:featured',
		config: {limit: 40, windowMs: 10000},
	} as RouteRateLimitConfig,

	TENOR_TRENDING: {
		bucket: 'tenor:trending',
		config: {limit: 40, windowMs: 10000},
	} as RouteRateLimitConfig,

	TENOR_SUGGEST: {
		bucket: 'tenor:suggest',
		config: {limit: 40, windowMs: 10000},
	} as RouteRateLimitConfig,

	TENOR_REGISTER_SHARE: {
		bucket: 'tenor:register_share',
		config: {limit: 60, windowMs: 10000},
	} as RouteRateLimitConfig,

	STRIPE_VISIONARY_SLOTS: {
		bucket: 'stripe:visionary:slots',
		config: {limit: 20, windowMs: 10000},
	} as RouteRateLimitConfig,

	STRIPE_PRICE_IDS: {
		bucket: 'stripe:price:ids',
		config: {limit: 40, windowMs: 10000},
	} as RouteRateLimitConfig,

	STRIPE_CHECKOUT_SUBSCRIPTION: {
		bucket: 'stripe:checkout:subscription',
		config: {limit: 3, windowMs: 60000},
	} as RouteRateLimitConfig,

	STRIPE_CHECKOUT_GIFT: {
		bucket: 'stripe:checkout:gift',
		config: {limit: 3, windowMs: 60000},
	} as RouteRateLimitConfig,

	STRIPE_CUSTOMER_PORTAL: {
		bucket: 'stripe:customer_portal',
		config: {limit: 5, windowMs: 60000},
	} as RouteRateLimitConfig,

	STRIPE_SUBSCRIPTION_CANCEL: {
		bucket: 'stripe:subscription:cancel',
		config: {limit: 5, windowMs: 60000},
	} as RouteRateLimitConfig,

	STRIPE_SUBSCRIPTION_REACTIVATE: {
		bucket: 'stripe:subscription:reactivate',
		config: {limit: 5, windowMs: 60000},
	} as RouteRateLimitConfig,

	STRIPE_VISIONARY_REJOIN: {
		bucket: 'stripe:visionary:rejoin',
		config: {limit: 5, windowMs: 60000},
	} as RouteRateLimitConfig,

	GIFT_CODE_GET: {
		bucket: 'gift:get',
		config: {limit: 60, windowMs: 10000},
	} as RouteRateLimitConfig,

	GIFT_CODE_REDEEM: {
		bucket: 'gift:redeem',
		config: {limit: 10, windowMs: 60000},
	} as RouteRateLimitConfig,

	GIFTS_LIST: {
		bucket: 'gifts:list',
		config: {limit: 40, windowMs: 10000},
	} as RouteRateLimitConfig,

	TWITCH_CONNECTION_GET: {
		bucket: 'twitch:connection:get',
		config: {limit: 60, windowMs: 10000},
	} as RouteRateLimitConfig,

	TWITCH_CONNECT_START: {
		bucket: 'twitch:oauth:start',
		config: {limit: 10, windowMs: 60000},
	} as RouteRateLimitConfig,

	STEAM_CONNECTION_GET: {
		bucket: 'steam:connection:get',
		config: {limit: 60, windowMs: 10000},
	} as RouteRateLimitConfig,

	STEAM_OPENID_START: {
		bucket: 'steam:openid:start',
		config: {limit: 10, windowMs: 60000},
	} as RouteRateLimitConfig,

	STEAM_DISCONNECT: {
		bucket: 'steam:disconnect',
		config: {limit: 10, windowMs: 60000},
	} as RouteRateLimitConfig,

	STEAM_REFRESH: {
		bucket: 'steam:refresh',
		config: {limit: 10, windowMs: 60000},
	} as RouteRateLimitConfig,

	STEAM_PRESENCE_PRIVACY: {
		bucket: 'steam:presence:privacy',
		config: {limit: 30, windowMs: 60000},
	} as RouteRateLimitConfig,

	TELEGRAM_CONNECTION_GET: {
		bucket: 'telegram:connection:get',
		config: {limit: 60, windowMs: 10000},
	} as RouteRateLimitConfig,

	TELEGRAM_CONNECT_VERIFY: {
		bucket: 'telegram:connect:verify',
		config: {limit: 10, windowMs: 60000},
	} as RouteRateLimitConfig,

	TELEGRAM_PREFERENCES_UPDATE: {
		bucket: 'telegram:preferences:update',
		config: {limit: 30, windowMs: 60000},
	} as RouteRateLimitConfig,

	TELEGRAM_DISCONNECT: {
		bucket: 'telegram:disconnect',
		config: {limit: 10, windowMs: 60000},
	} as RouteRateLimitConfig,

	TWITCH_SETTINGS_UPDATE: {
		bucket: 'twitch:settings:update',
		config: {limit: 30, windowMs: 60000},
	} as RouteRateLimitConfig,

	TWITCH_CREATOR_PROGRAM_UPDATE: {
		bucket: 'twitch:creator_program:update',
		config: {limit: 30, windowMs: 60000},
	} as RouteRateLimitConfig,

	TWITCH_CREATOR_PROGRAMS_LIST: {
		bucket: 'twitch:creator_programs:list',
		config: {limit: 40, windowMs: 10000},
	} as RouteRateLimitConfig,

	TWITCH_EVENTSUB_SYNC: {
		bucket: 'twitch:eventsub:sync',
		config: {limit: 5, windowMs: 60000},
	} as RouteRateLimitConfig,

	TWITCH_LIVE_STATE_GET: {
		bucket: 'twitch:live_state:get',
		config: {limit: 60, windowMs: 10000},
	} as RouteRateLimitConfig,

	TWITCH_SUBSCRIBER_PERKS_GET: {
		bucket: 'twitch:subscriber_perks:get',
		config: {limit: 40, windowMs: 10000},
	} as RouteRateLimitConfig,

	TWITCH_SUBSCRIBER_PERKS_CHECK: {
		bucket: 'twitch:subscriber_perks:check',
		config: {limit: 20, windowMs: 60000},
	} as RouteRateLimitConfig,

	TWITCH_DISCONNECT: {
		bucket: 'twitch:disconnect',
		config: {limit: 10, windowMs: 60000},
	} as RouteRateLimitConfig,

	RIOT_GET: {
		bucket: 'riot:get',
		config: {limit: 60, windowMs: 10000},
	} as RouteRateLimitConfig,

	RIOT_CONNECT: {
		bucket: 'riot:connect',
		config: {limit: 5, windowMs: 60000},
	} as RouteRateLimitConfig,
} as const;
