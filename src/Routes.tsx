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

import {marketingUrl} from '~/utils/UrlUtils';

export const Routes = {
	HOME: '/',
	LOGIN: '/login',
	REGISTER: '/register',
	FORGOT_PASSWORD: '/forgot',
	RESET_PASSWORD: '/reset',
	VERIFY_EMAIL: '/verify',
	// AI workspace landing — referenced from the (still WIP) AiWorkspacePage.
	AI_ASSISTANT: '/ai',
	AUTHORIZE_IP: '/authorize-ip',
	EMAIL_REVERT: '/wasntme',
	PENDING_VERIFICATION: '/pending',
	OAUTH_AUTHORIZE: '/oauth2/authorize',
	SPOTIFY_CONNECT_CALLBACK: '/music/spotify/callback',

	INVITE_REGISTER: '/invite/:code',
	INVITE_LOGIN: '/invite/:code/login',
	GIFT_REGISTER: '/gift/:code',
	GIFT_LOGIN: '/gift/:code/login',
	THEME_REGISTER: '/theme/:themeId',
	THEME_LOGIN: '/theme/:themeId/login',

	ME: '/channels/@me',
	FAVORITES: '/channels/@favorites',
	BOOKMARKS: '/bookmarks',
	MENTIONS: '/mentions',
	DISCOVERY: '/discover',
	NOTIFICATIONS: '/notifications',
	YOU: '/you',
	REPORT: '/report',
	PREMIUM_CALLBACK: '/premium-callback',

	terms: () => marketingUrl('terms'),
	privacy: () => marketingUrl('privacy'),
	guidelines: () => marketingUrl('guidelines'),
	careers: () => marketingUrl('careers'),
	partners: () => marketingUrl('partners'),
	bugs: () => marketingUrl('bugs'),
	plutonium: () => marketingUrl('plutonium'),
	plutoniumVisionary: () => marketingUrl('plutonium#visionary'),
	help: () => marketingUrl('help'),
	download: () => marketingUrl('download'),

	dmChannel: (channelId: string) => `/channels/@me/${channelId}`,
	favoritesChannel: (channelId: string) => `/channels/@favorites/${channelId}`,
	guildChannel: (guildId: string, channelId?: string) =>
		channelId ? `/channels/${guildId}/${channelId}` : `/channels/${guildId}`,
	channelMessage: (guildId: string, channelId: string, messageId: string) =>
		`${Routes.guildChannel(guildId, channelId)}/${messageId}`,
	dmChannelMessage: (channelId: string, messageId: string) => `${Routes.dmChannel(channelId)}/${messageId}`,
	favoritesChannelMessage: (channelId: string, messageId: string) =>
		`${Routes.favoritesChannel(channelId)}/${messageId}`,
	inviteRegister: (code: string) => `/invite/${code}`,
	inviteLogin: (code: string) => `/invite/${code}/login`,
	giftRegister: (code: string) => `/gift/${code}`,
	giftLogin: (code: string) => `/gift/${code}/login`,
	theme: (themeId: string) => `/theme/${themeId}`,
	themeRegister: (themeId: string) => `/theme/${themeId}`,
	themeLogin: (themeId: string) => `/theme/${themeId}/login`,

	isSpecialPage: (pathname: string) =>
		pathname === Routes.BOOKMARKS ||
		pathname === Routes.MENTIONS ||
		pathname === Routes.DISCOVERY ||
		pathname === Routes.NOTIFICATIONS ||
		pathname === Routes.YOU,

	isDMRoute: (pathname: string) => pathname.startsWith('/channels/@me'),
	isFavoritesRoute: (pathname: string) => pathname.startsWith('/channels/@favorites'),
	isChannelRoute: (pathname: string) => pathname.startsWith('/channels/'),
	isGuildChannelRoute: (pathname: string) =>
		pathname.startsWith('/channels/') &&
		!pathname.startsWith('/channels/@me') &&
		!pathname.startsWith('/channels/@favorites'),
	isMobileBottomNavRoute: (pathname: string) =>
		pathname === Routes.ME ||
		pathname === Routes.dmChannel('@friends') ||
		Routes.isFavoritesRoute(pathname) ||
		pathname === Routes.DISCOVERY ||
		pathname === Routes.NOTIFICATIONS ||
		pathname === Routes.YOU ||
		(Routes.isGuildChannelRoute(pathname) && pathname.split('/').length === 3),
} as const;
