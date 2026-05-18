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

import type {FC, SVGProps} from 'react';
import Config from '~/Config';
import {MODE} from '~/lib/env';
import {Platform} from '~/lib/Platform';

export type TwemojiComponent = FC<SVGProps<SVGSVGElement>>;

const TWEMOJI_CDN = 'https://cdn.jsdelivr.net/gh/jdecked/twemoji@latest/assets/svg';
const APPLE_CDN = 'https://cdn.jsdelivr.net/npm/emoji-datasource-apple@latest/img/apple/64';
const SUPPORTED_EMOJI_FILE_EXTENSIONS = new Set(['svg', 'png', 'webp']);
const codePointCache = new Map<string, string>();
const twemojiUrlCache = new Map<string, string | null>();
const emojiUrlCache = new Map<string, string | null>();

export const emojiStyle = Config.PUBLIC_EMOJI_STYLE;
/*
 * Keep emoji style consistent across desktop and mobile:
 * when the app style is telegram/twemoji/vk we always render CDN emoji,
 * including iOS. Native Apple glyphs are used only for explicit apple style.
 */
export const shouldUseNativeEmoji = Platform.isAppleDevice && emojiStyle === 'apple';

function normalizeCdnBaseUrl(url: string | null | undefined): string {
	const trimmed = url?.trim() ?? '';
	if (!trimmed) return '';
	return trimmed.replace(/\/+$/, '');
}

function getStyleSpecificEmojiCdn(style: typeof emojiStyle): string {
	switch (style) {
		case 'telegram':
			return normalizeCdnBaseUrl(Config.PUBLIC_TELEGRAM_EMOJI_STYLE_CDN) || APPLE_CDN;
		case 'vk':
			return normalizeCdnBaseUrl(Config.PUBLIC_VK_EMOJI_STYLE_CDN);
		case 'apple':
			return APPLE_CDN;
		default:
			return '';
	}
}

function getActiveEmojiCdn(): string {
	const styleSpecific = getStyleSpecificEmojiCdn(emojiStyle);
	if (styleSpecific) return styleSpecific;

	const sharedCustomCdn = normalizeCdnBaseUrl(Config.PUBLIC_EMOJI_STYLE_CDN);
	if (sharedCustomCdn) return sharedCustomCdn;

	return TWEMOJI_CDN;
}

function getActiveEmojiFileExtension(): string {
	const ext = Config.PUBLIC_EMOJI_STYLE_FILE_EXT?.trim().toLowerCase() ?? 'svg';
	if (!SUPPORTED_EMOJI_FILE_EXTENSIONS.has(ext)) {
		return 'svg';
	}

	/*
	 * Telegram/Apple fallback CDNs in this app are PNG-only.
	 * If no custom CDN is configured and ext stayed at the default SVG value,
	 * force PNG so default telegram style resolves to valid assets.
	 */
	if (
		ext === 'svg' &&
		emojiStyle === 'telegram' &&
		!normalizeCdnBaseUrl(Config.PUBLIC_TELEGRAM_EMOJI_STYLE_CDN) &&
		!normalizeCdnBaseUrl(Config.PUBLIC_EMOJI_STYLE_CDN)
	) {
		return 'png';
	}

	return ext;
}

export const convertToCodePoints = (emoji: string, preserveVariationSelector = false): string => {
	const cacheKey = `${preserveVariationSelector ? '1' : '0'}:${emoji}`;
	const cached = codePointCache.get(cacheKey);
	if (cached !== undefined) {
		return cached;
	}

	const containsZWJ = emoji.includes('\u200D');
	const processedEmoji = containsZWJ || preserveVariationSelector ? emoji : emoji.replace(/\uFE0F/g, '');
	const codePoints = Array.from(processedEmoji)
		.map((char) => {
			const hex = char.codePointAt(0)?.toString(16) ?? '';
			if (!hex) return '';
			return preserveVariationSelector ? hex.padStart(4, '0') : hex.replace(/^0+/, '');
		})
		.join('-');

	codePointCache.set(cacheKey, codePoints);
	return codePoints;
};

export const fromHexCodePoint = (hex: string): string => String.fromCodePoint(Number.parseInt(hex, 16));

const cdnRequiresVariationSelector = (cdn: string): boolean =>
	emojiStyle === 'apple' || cdn.includes('emoji-datasource-apple');

export const getTwemojiURL = (codePoints: string): string | null => {
	if (shouldUseNativeEmoji || MODE === 'test' || !codePoints) {
		return null;
	}

	const cached = twemojiUrlCache.get(codePoints);
	if (cached !== undefined) {
		return cached;
	}

	const emojiCdn = getActiveEmojiCdn();
	const emojiFileExtension = getActiveEmojiFileExtension();
	const url = `${emojiCdn}/${codePoints}.${emojiFileExtension}`;
	twemojiUrlCache.set(codePoints, url);
	return url;
};

export const getEmojiURL = (unicode: string): string | null => {
	if (shouldUseNativeEmoji || MODE === 'test' || !unicode) {
		return null;
	}

	const cached = emojiUrlCache.get(unicode);
	if (cached !== undefined) {
		return cached;
	}

	const emojiCdn = getActiveEmojiCdn();
	const codePoints = convertToCodePoints(unicode, cdnRequiresVariationSelector(emojiCdn));
	const url = getTwemojiURL(codePoints);
	emojiUrlCache.set(unicode, url);
	return url;
};

export const getTwemojiSvg = (_codePoints: string): TwemojiComponent | null => null;
export const getEmojiSvg = (_unicode: string): TwemojiComponent | null => null;
