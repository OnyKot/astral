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

import * as GiftActionCreators from '~/actions/GiftActionCreators';
import * as InviteActionCreators from '~/actions/InviteActionCreators';
import {ME} from '~/Constants';
import {Endpoints} from '~/Endpoints';
import {Routes} from '~/Routes';
import AuthenticationStore from '~/stores/AuthenticationStore';
import RuntimeConfigStore from '~/stores/RuntimeConfigStore';
import http from '~/lib/HttpClient';
import {Logger} from '~/lib/Logger';
import * as RouterUtils from '~/utils/RouterUtils';
import SnowflakeUtil from '~/utils/SnowflakeUtil';
import {isFirstPartyHost} from '~/utils/FirstPartyHosts';
import {APP_PROTOCOL_PREFIX, LEGACY_APP_PROTOCOL_PREFIX, buildAppProtocolUrl} from './appProtocol';
import {getElectronAPI} from './NativeUtils';

type DeepLinkTarget =
	| {type: 'invite'; code: string; preferLogin: boolean}
	| {type: 'gift'; code: string; preferLogin: boolean}
	| {type: 'user'; userId: string; channelId?: string};

export interface UserProfileLinkTarget {
	userId: string;
	channelId?: string;
}

interface UserModalLinkResponse {
	path?: string;
	url?: string;
	channel_id?: string | null;
	guild_id?: string | null;
}

interface UserModalLinkOptions {
	channelId?: string;
	guildId?: string;
	withMutualFriends?: boolean;
	withMutualGuilds?: boolean;
}

const logger = new Logger('DeepLinkUtils');

const parseDeepLink = (rawUrl: string): DeepLinkTarget | null => {
	const tryFromSegments = (segments: Array<string>, search?: string): DeepLinkTarget | null => {
		const compact = segments.filter(Boolean);
		for (let index = 0; index < compact.length; index += 1) {
			const first = compact[index];
			const second = compact[index + 1];
			const third = compact[index + 2];
			const fourth = compact[index + 3];
			const preferLogin = third === 'login' || search?.includes('login=1') || search?.includes('action=login') || false;

			if (first === 'invite' && second) {
				return {type: 'invite', code: second, preferLogin};
			}

			if (first === 'gift' && second) {
				return {type: 'gift', code: second, preferLogin};
			}

			if ((first === 'users' || first === 'user') && second) {
				return {type: 'user', userId: second};
			}

			if (first === 'channel' && second && third === 'user' && fourth) {
				return {type: 'user', userId: fourth, channelId: second};
			}
		}

		return null;
	};

	try {
		const parsed = new URL(rawUrl);
		const pathnameTarget = tryFromSegments(parsed.pathname.split('/'), parsed.search);
		if (pathnameTarget) return pathnameTarget;

		const hostAndPathTarget = tryFromSegments([parsed.host, ...parsed.pathname.split('/')], parsed.search);
		if (hostAndPathTarget) return hostAndPathTarget;

		const target = tryFromSegments([parsed.protocol.replace(':', ''), parsed.host, ...parsed.pathname.split('/')], parsed.search);
		if (target) return target;
	} catch {}

	const escapedPrimary = APP_PROTOCOL_PREFIX.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
	const escapedLegacy = LEGACY_APP_PROTOCOL_PREFIX.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
	const protocolPattern = new RegExp(`^(?:${escapedPrimary}|${escapedLegacy})`);
	const sanitized = rawUrl.replace(protocolPattern, '').replace(/^\/+/, '');
	const [pathPart, searchPart] = sanitized.split('?');
	const target = tryFromSegments(pathPart.split('/'), searchPart ? `?${searchPart}` : undefined);
	return target;
};

export const parseUserProfileLink = (rawUrl: string): UserProfileLinkTarget | null => {
	const parsed = parseDeepLink(rawUrl);
	if (!parsed || parsed.type !== 'user') return null;

	return {
		userId: parsed.userId,
		channelId: parsed.channelId,
	};
};

const buildUserProfileLinkFromPath = (path: string): string => {
	const normalizedPath = `/${path}`.replace(/\/+/g, '/');
	const base = RuntimeConfigStore.webAppBaseUrl?.replace(/\/+$/, '');
	if (!base) {
		return buildAppProtocolUrl(normalizedPath.replace(/^\/+/, ''));
	}

	try {
		const baseUrl = new URL(base);
		const basePath = baseUrl.pathname.replace(/\/+$/, '');
		baseUrl.pathname = `${basePath}${normalizedPath}`.replace(/\/+/g, '/');
		baseUrl.search = '';
		baseUrl.hash = '';
		return baseUrl.toString();
	} catch {
		return `${base}${normalizedPath}`;
	}
};

export const buildUserProfileLink = (userId: string, channelId?: string): string => {
	return buildUserProfileLinkFromPath(
		channelId ? Routes.channelUserProfile(channelId, userId) : Routes.userProfile(userId),
	);
};

export const createUserModalLink = async (userId: string, options: UserModalLinkOptions = {}): Promise<string> => {
	const {channelId, guildId, withMutualFriends = true, withMutualGuilds = true} = options;
	try {
		const response = await http.post<UserModalLinkResponse>(Endpoints.USER_MODAL_LINK, {
			user_id: userId,
			...(channelId ? {channel_id: channelId} : {}),
			...(guildId ? {guild_id: guildId} : {}),
			with_mutual_friends: withMutualFriends,
			with_mutual_guilds: withMutualGuilds,
		});

		const path = typeof response.body.path === 'string' ? response.body.path.trim() : '';
		if (path.length > 0) {
			return buildUserProfileLinkFromPath(path);
		}

		const url = typeof response.body.url === 'string' ? response.body.url.trim() : '';
		if (url.length > 0) {
			return url;
		}
	} catch (error) {
		logger.warn({error, userId, channelId, guildId}, 'Failed to create server-backed user modal link, using fallback');
	}

	return buildUserProfileLink(userId, channelId);
};

const navigateForTarget = (target: DeepLinkTarget) => {
	const isAuthenticated = AuthenticationStore.isAuthenticated;

	if (target.type === 'gift' && RuntimeConfigStore.isSelfHosted()) {
		return;
	}

	if (isAuthenticated) {
		if (target.type === 'invite') {
			void InviteActionCreators.openAcceptModal(target.code);
			RouterUtils.transitionTo(Routes.ME);
		} else {
			if (target.type === 'gift') {
				void GiftActionCreators.openAcceptModal(target.code);
				RouterUtils.transitionTo(Routes.ME);
			} else if (target.type === 'user') {
				RouterUtils.transitionTo(
					target.channelId ? Routes.channelUserProfile(target.channelId, target.userId) : Routes.userProfile(target.userId),
				);
			}
		}
		return;
	}

	if (target.type === 'user') {
		RouterUtils.transitionTo(Routes.LOGIN);
		return;
	}

	if (target.type === 'invite') {
		const dest = target.preferLogin ? Routes.inviteLogin(target.code) : Routes.inviteRegister(target.code);
		RouterUtils.transitionTo(dest);
		return;
	}

	const dest = target.preferLogin ? Routes.giftLogin(target.code) : Routes.giftRegister(target.code);
	RouterUtils.transitionTo(dest);
};

export const handleDeepLinkUrl = (rawUrl: string): boolean => {
	const target = parseDeepLink(rawUrl);
	if (!target) return false;
	navigateForTarget(target);
	return true;
};

export const handleRpcNavigation = (path: string): void => {
	RouterUtils.transitionTo(path);
};

let listenerStarted = false;

export const startDeepLinkHandling = async (): Promise<void> => {
	if (listenerStarted) return;

	const electronApi = getElectronAPI();
	if (electronApi) {
		listenerStarted = true;

		try {
			const initialUrl = await electronApi.getInitialDeepLink();
			if (initialUrl) {
				handleDeepLinkUrl(initialUrl);
			}
		} catch (error) {
			console.error('[DeepLink] Failed to get initial deep link', error);
		}

		electronApi.onDeepLink((url) => {
			try {
				handleDeepLinkUrl(url);
			} catch (error) {
				console.error('[DeepLink] Failed to handle URL', url, error);
			}
		});

		if (typeof electronApi.onRpcNavigate === 'function') {
			electronApi.onRpcNavigate((path) => {
				try {
					handleRpcNavigation(path);
				} catch (error) {
					console.error('[DeepLink] Failed to handle RPC navigation', path, error);
				}
			});
		} else {
			console.warn('[DeepLink] onRpcNavigate not available on this host version');
		}

		return;
	}
};

export const isInternalChannelHost = (host: string): boolean => {
	if (!host) return false;
	if (typeof location !== 'undefined' && host === location.host) {
		return true;
	}
	if (RuntimeConfigStore.marketingHost && host === RuntimeConfigStore.marketingHost) {
		return true;
	}
	return isFirstPartyHost(host);
};

export function parseChannelUrl(url: string): string | null {
	try {
		const parsed = new URL(url);
		const isInternal = isInternalChannelHost(parsed.host) && parsed.pathname.startsWith('/channels/');

		if (!isInternal) return null;

		const normalizedPath = parsed.pathname;
		const segments = normalizedPath.split('/').filter(Boolean);

		if (segments[0] !== 'channels') return null;

		const [, scope, channelId, messageId] = segments;
		const segmentCount = segments.length;
		const isSnowflake = (value?: string) => SnowflakeUtil.isProbablyAValidSnowflake(value ?? null);
		const isDmScope = scope === ME;

		let isValid = false;

		if (isDmScope) {
			if (segmentCount === 2) {
				isValid = true;
			} else if (segmentCount === 3 && isSnowflake(channelId)) {
				isValid = true;
			} else if (segmentCount === 4 && isSnowflake(channelId) && isSnowflake(messageId)) {
				isValid = true;
			}
		} else {
			if (segmentCount === 3 && isSnowflake(scope) && isSnowflake(channelId)) {
				isValid = true;
			} else if (segmentCount === 4 && isSnowflake(scope) && isSnowflake(channelId) && isSnowflake(messageId)) {
				isValid = true;
			}
		}

		if (isValid) {
			return normalizedPath;
		}
	} catch {
		return null;
	}

	return null;
}

export interface ChannelJumpLink {
	scope: string;
	channelId: string;
}

export interface MessageJumpLink extends ChannelJumpLink {
	messageId: string;
}

const getChannelSegments = (url: string): Array<string> | null => {
	const channelPath = parseChannelUrl(url);
	if (!channelPath) return null;
	return channelPath.split('/').filter(Boolean);
};

export function parseChannelJumpLink(url: string): ChannelJumpLink | null {
	const segments = getChannelSegments(url);
	if (!segments || segments.length < 3) return null;

	const [, scope, channelId] = segments;
	if (!scope || !channelId) return null;

	return {
		scope,
		channelId,
	};
}

export function parseMessageJumpLink(url: string): MessageJumpLink | null {
	const segments = getChannelSegments(url);
	if (!segments || segments.length !== 4) return null;

	const [, scope, channelId, messageId] = segments;
	if (!messageId || !SnowflakeUtil.isProbablyAValidSnowflake(messageId)) {
		return null;
	}

	return {
		scope,
		channelId,
		messageId,
	};
}

