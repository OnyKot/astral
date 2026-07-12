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

export type TwemojiComponent = FC<SVGProps<SVGSVGElement>>;

const TWEMOJI_CDN = 'https://cdn.jsdelivr.net/gh/jdecked/twemoji@latest/assets/svg';
const APPLE_CDN = 'https://cdn.jsdelivr.net/npm/emoji-datasource-apple@latest/img/apple/64';
const SUPPORTED_EMOJI_FILE_EXTENSIONS = new Set(['svg', 'png', 'webp']);
const codePointCache = new Map<string, string>();
const twemojiUrlCache = new Map<string, string | null>();
const emojiUrlCache = new Map<string, string | null>();
const emojiVisualScaleCache = new Map<string, number>();
const MAX_VISUAL_SCALE_CACHE = 1200;
const VISUAL_SAMPLE_SIZE = 48;
const VISUAL_TARGET_COVERAGE = 0.82;
const VISUAL_MAX_SCALE = 1.18;
let visualSampleCanvas: HTMLCanvasElement | null = null;

export const emojiStyle = Config.PUBLIC_EMOJI_STYLE;
// Keep chat emoji assets identical across Windows, macOS, iOS, and Android.
export const shouldUseNativeEmoji = false;

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

function cacheEmojiVisualScale(url: string, scale: number): void {
	emojiVisualScaleCache.set(url, scale);
	if (emojiVisualScaleCache.size <= MAX_VISUAL_SCALE_CACHE) return;

	const firstKey = emojiVisualScaleCache.keys().next().value;
	if (typeof firstKey === 'string') {
		emojiVisualScaleCache.delete(firstKey);
	}
}

export const applyEmojiVisualNormalization = (image: HTMLImageElement): void => {
	const url = image.currentSrc || image.src;
	if (!url || !image.complete || image.naturalWidth === 0 || image.naturalHeight === 0) return;

	const cachedScale = emojiVisualScaleCache.get(url);
	if (cachedScale !== undefined) {
		image.style.setProperty('--emoji-visual-scale', String(cachedScale));
		return;
	}

	try {
		const canvas = visualSampleCanvas ?? document.createElement('canvas');
		visualSampleCanvas = canvas;
		canvas.width = VISUAL_SAMPLE_SIZE;
		canvas.height = VISUAL_SAMPLE_SIZE;

		const context = canvas.getContext('2d', {willReadFrequently: true});
		if (!context) return;

		context.clearRect(0, 0, VISUAL_SAMPLE_SIZE, VISUAL_SAMPLE_SIZE);
		context.drawImage(image, 0, 0, VISUAL_SAMPLE_SIZE, VISUAL_SAMPLE_SIZE);
		const pixels = context.getImageData(0, 0, VISUAL_SAMPLE_SIZE, VISUAL_SAMPLE_SIZE).data;

		let minX = VISUAL_SAMPLE_SIZE;
		let minY = VISUAL_SAMPLE_SIZE;
		let maxX = -1;
		let maxY = -1;

		for (let y = 0; y < VISUAL_SAMPLE_SIZE; y += 1) {
			for (let x = 0; x < VISUAL_SAMPLE_SIZE; x += 1) {
				const alpha = pixels[(y * VISUAL_SAMPLE_SIZE + x) * 4 + 3];
				if (alpha < 12) continue;
				minX = Math.min(minX, x);
				minY = Math.min(minY, y);
				maxX = Math.max(maxX, x);
				maxY = Math.max(maxY, y);
			}
		}

		if (maxX < minX || maxY < minY) return;

		const visibleWidth = maxX - minX + 1;
		const visibleHeight = maxY - minY + 1;
		const coverage = Math.max(visibleWidth, visibleHeight) / VISUAL_SAMPLE_SIZE;
		const scale = Math.round(Math.min(VISUAL_MAX_SCALE, Math.max(1, VISUAL_TARGET_COVERAGE / coverage)) * 1000) / 1000;

		cacheEmojiVisualScale(url, scale);
		image.style.setProperty('--emoji-visual-scale', String(scale));
	} catch {
		cacheEmojiVisualScale(url, 1);
	}
};
