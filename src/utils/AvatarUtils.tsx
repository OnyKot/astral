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

import type {UserRecord} from '~/records/UserRecord';
import DeveloperOptionsStore from '~/stores/DeveloperOptionsStore';
import {buildMediaProxyURL} from '~/utils/MediaProxyUtils';
import {mediaUrl} from '~/utils/UrlUtils';

const DEFAULT_AVATAR_PRIMARY_COLORS = [0x4641d9, 0xf0b100, 0x00bba7, 0x2b7fff, 0xad46ff, 0x6a7282];
const DEFAULT_AVATAR_PALETTE = [
	{background: '#4641d9', accent: '#7772ff'},
	{background: '#b77905', accent: '#f0b100'},
	{background: '#008c80', accent: '#00bba7'},
	{background: '#1f66d8', accent: '#2b7fff'},
	{background: '#8737d9', accent: '#ad46ff'},
	{background: '#4f5968', accent: '#7c8797'},
] as const;
const DEFAULT_AVATAR_COUNT = DEFAULT_AVATAR_PRIMARY_COLORS.length;

const escapeSvgText = (value: string): string =>
	value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const getDefaultAvatarInitial = (user?: Partial<Pick<UserRecord, 'username' | 'globalName'>>): string => {
	const label = user?.globalName || user?.username || '';
	const firstCodePoint = Array.from(label.trim())[0];
	return firstCodePoint ? firstCodePoint.toLocaleUpperCase() : '?';
};

// Local deterministic default avatar: no network request, just a clean first-letter mark.
export const getDefaultAvatarURLByIndex = (index: number, initial?: string): string => {
	const palette =
		DEFAULT_AVATAR_PALETTE[
			((index % DEFAULT_AVATAR_PALETTE.length) + DEFAULT_AVATAR_PALETTE.length) %
				DEFAULT_AVATAR_PALETTE.length
		];
	const label = escapeSvgText((initial || String.fromCharCode(65 + (index % 26))).slice(0, 2));
	const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160"><rect width="160" height="160" rx="80" fill="${palette.background}"/><circle cx="44" cy="34" r="54" fill="${palette.accent}" opacity=".45"/><circle cx="126" cy="128" r="62" fill="#000" opacity=".12"/><text x="80" y="92" text-anchor="middle" dominant-baseline="middle" font-family="Inter, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif" font-size="70" font-weight="760" fill="#fff">${label}</text></svg>`;
	return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
};
const getDefaultAvatarIndex = (id: string) => {
	try {
		return Number(BigInt(id) % BigInt(DEFAULT_AVATAR_COUNT));
	} catch {
		return Array.from(id).reduce((acc, char) => acc + char.charCodeAt(0), 0) % DEFAULT_AVATAR_COUNT;
	}
};

export const getDefaultAvatarPrimaryColor = (id: string) => DEFAULT_AVATAR_PRIMARY_COLORS[getDefaultAvatarIndex(id)];

type AvatarOptions = Pick<UserRecord, 'id' | 'avatar'> & Partial<Pick<UserRecord, 'username' | 'globalName'>>;
type BannerOptions = Pick<UserRecord, 'id' | 'banner'>;

interface IconOptions {
	id: string;
	icon: string | null;
}

const getMediaURL = ({
	path,
	id,
	hash,
	size,
	format,
}: {
	path: string;
	id: string;
	hash: string;
	size?: number;
	format: string;
}) => {
	if (DeveloperOptionsStore.forceRenderPlaceholders) {
		return '';
	}

	const basePath = `${path}/${id}/${hash}.${format}`;
	return size ? mediaUrl(`${basePath}?size=${size}`) : mediaUrl(basePath);
};

const getGuildMemberMediaURL = ({
	path,
	guildId,
	userId,
	hash,
	size,
	format,
}: {
	path: string;
	guildId: string;
	userId: string;
	hash: string;
	size?: number;
	format: string;
}) => {
	if (DeveloperOptionsStore.forceRenderPlaceholders) {
		return '';
	}

	const basePath = `guilds/${guildId}/users/${userId}/${path}/${hash}.${format}`;
	return size ? mediaUrl(`${basePath}?size=${size}`) : mediaUrl(basePath);
};

const parseAvatar = (avatar: string) => {
	const animated = avatar.startsWith('a_');
	const hash = animated ? avatar.slice(2) : avatar;
	return {
		animated,
		hash,
	};
};

export const getUserAvatarURL = (user: AvatarOptions, animated = false) => {
	const {id, avatar} = user;
	if (!avatar) {
		return getDefaultAvatarURLByIndex(getDefaultAvatarIndex(id), getDefaultAvatarInitial(user));
	}

	const parsedAvatar = parseAvatar(avatar);
	const shouldAnimate = parsedAvatar.animated ? animated : false;

	return getMediaURL({
		path: 'avatars',
		id,
		hash: parsedAvatar.hash,
		size: 160,
		format: shouldAnimate ? 'gif' : 'webp',
	});
};

export const getUserAvatarURLWithProxy = (
	user: AvatarOptions,
	mediaProxyEndpoint: string,
	animated = false,
) => {
	const {id, avatar} = user;
	if (!avatar) {
		return getDefaultAvatarURLByIndex(getDefaultAvatarIndex(id), getDefaultAvatarInitial(user));
	}

	if (DeveloperOptionsStore.forceRenderPlaceholders) {
		return '';
	}

	const parsedAvatar = parseAvatar(avatar);
	const shouldAnimate = parsedAvatar.animated ? animated : false;
	const format = shouldAnimate ? 'gif' : 'webp';

	return buildMediaProxyURL(`${mediaProxyEndpoint}/avatars/${id}/${parsedAvatar.hash}.${format}?size=160`);
};

export const getWebhookAvatarURL = ({id, avatar}: {id: string; avatar: string | null}, animated = false) => {
	if (!avatar) {
		return getDefaultAvatarURLByIndex(getDefaultAvatarIndex(id));
	}

	const parsedAvatar = parseAvatar(avatar);
	const shouldAnimate = parsedAvatar.animated ? animated : false;

	return getMediaURL({
		path: 'avatars',
		id,
		hash: parsedAvatar.hash,
		size: 160,
		format: shouldAnimate ? 'gif' : 'webp',
	});
};

export const getUserBannerURL = ({id, banner}: BannerOptions, animated = false, size = 1024) => {
	if (!banner) {
		return null;
	}

	const parsedBanner = parseAvatar(banner);
	const shouldAnimate = parsedBanner.animated ? animated : false;

	return getMediaURL({
		path: 'banners',
		id,
		hash: parsedBanner.hash,
		size,
		format: shouldAnimate ? 'gif' : 'webp',
	});
};

export const getGuildIconURL = ({id, icon}: IconOptions, animated = false) => {
	if (!icon) {
		return null;
	}

	const parsedIcon = parseAvatar(icon);
	const shouldAnimate = parsedIcon.animated ? animated : false;

	return getMediaURL({
		path: 'icons',
		id,
		hash: parsedIcon.hash,
		size: 160,
		format: shouldAnimate ? 'gif' : 'webp',
	});
};

export const getGuildBannerURL = ({id, banner}: {id: string; banner: string | null}, animated = false) => {
	if (!banner) {
		return null;
	}

	const parsedBanner = parseAvatar(banner);
	const shouldAnimate = parsedBanner.animated ? animated : false;

	return getMediaURL({
		path: 'banners',
		id,
		hash: parsedBanner.hash,
		size: 1024,
		format: shouldAnimate ? 'gif' : 'webp',
	});
};

export const getGuildSplashURL = ({id, splash}: {id: string; splash: string | null}, size = 1024) => {
	if (!splash) {
		return null;
	}

	const parsedSplash = parseAvatar(splash);

	return getMediaURL({
		path: 'splashes',
		id,
		hash: parsedSplash.hash,
		size,
		format: 'webp',
	});
};

export const getGuildEmbedSplashURL = ({id, embedSplash}: {id: string; embedSplash: string | null}, size = 1024) => {
	if (!embedSplash) {
		return null;
	}

	const parsedEmbedSplash = parseAvatar(embedSplash);

	return getMediaURL({
		path: 'embed-splashes',
		id,
		hash: parsedEmbedSplash.hash,
		size,
		format: 'webp',
	});
};

export const getChannelIconURL = ({id, icon}: IconOptions, size?: number) => {
	if (!icon) {
		return null;
	}

	const parsedIcon = parseAvatar(icon);

	return getMediaURL({
		path: 'icons',
		id,
		hash: parsedIcon.hash,
		size: size || 160,
		format: 'webp',
	});
};

export const getGuildMemberAvatarURL = ({
	guildId,
	userId,
	avatar,
	animated = false,
}: {
	guildId: string;
	userId: string;
	avatar: string | null;
	animated?: boolean;
}) => {
	if (!avatar) {
		return null;
	}

	const parsedAvatar = parseAvatar(avatar);
	const shouldAnimate = parsedAvatar.animated ? animated : false;

	return getGuildMemberMediaURL({
		path: 'avatars',
		guildId,
		userId,
		hash: parsedAvatar.hash,
		size: 160,
		format: shouldAnimate ? 'gif' : 'webp',
	});
};

export const getGuildMemberBannerURL = ({
	guildId,
	userId,
	banner,
	animated = false,
	size = 1024,
}: {
	guildId: string;
	userId: string;
	banner: string | null;
	animated?: boolean;
	size?: number;
}) => {
	if (!banner) {
		return null;
	}

	const parsedBanner = parseAvatar(banner);
	const shouldAnimate = parsedBanner.animated ? animated : false;

	return getGuildMemberMediaURL({
		path: 'banners',
		guildId,
		userId,
		hash: parsedBanner.hash,
		size,
		format: shouldAnimate ? 'gif' : 'webp',
	});
};

export const getEmojiURL = ({id, animated}: {id: string; animated?: boolean}) => {
	if (DeveloperOptionsStore.forceRenderPlaceholders) {
		return '';
	}
	return mediaUrl(`emojis/${id}.${animated ? 'gif' : 'webp'}`);
};

type StickerSize = 160 | 320;

export const getStickerURL = ({id, animated, size = 320}: {id: string; animated?: boolean; size?: StickerSize}) => {
	if (DeveloperOptionsStore.forceRenderPlaceholders) {
		return '';
	}

	const safeSize: StickerSize = size === 320 ? 320 : 160;
	const ext = animated ? 'gif' : 'webp';

	return mediaUrl(`stickers/${id}.${ext}?size=${safeSize}`);
};

export const fileToBase64 = (file: File) =>
	new Promise<string>((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => resolve(reader.result as string);
		reader.onerror = reject;
		reader.readAsDataURL(file);
	});
