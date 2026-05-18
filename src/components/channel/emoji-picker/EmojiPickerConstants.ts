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

import * as EmojiUtils from '~/utils/EmojiUtils';

export const EMOJI_CLAP = EmojiUtils.fromHexCodePoint('1f44f');
export const EMOJI_SPRITE_SIZE = 32;
export const EMOJI_ROW_HEIGHT = 48;
export const CATEGORY_HEADER_HEIGHT = 32;
export const EMOJIS_PER_ROW = 9;
export const OVERSCAN_ROWS = 5;

interface SpriteSheetOptions {
	retina?: boolean;
}

interface SpriteSheetVariant {
	standard: string;
	retina: string;
}

const SPRITE_BASE = 'https://astraof.com/emoji';

const buildSpriteSheetVariant = (name: string): SpriteSheetVariant => ({
	standard: `${SPRITE_BASE}/${name}.png`,
	retina: `${SPRITE_BASE}/${name}@2x.png`,
});

const SPRITE_SHEET_RESOURCES: Record<string, SpriteSheetVariant> = {
	default: buildSpriteSheetVariant('spritesheet-emoji'),
	'1f3fb': buildSpriteSheetVariant('spritesheet-1f3fb'),
	'1f3fc': buildSpriteSheetVariant('spritesheet-1f3fc'),
	'1f3fd': buildSpriteSheetVariant('spritesheet-1f3fd'),
	'1f3fe': buildSpriteSheetVariant('spritesheet-1f3fe'),
	'1f3ff': buildSpriteSheetVariant('spritesheet-1f3ff'),
};

const preloadedSpriteSheetPaths = new Set<string>();

const getSpriteSheetKey = (skinTone?: string): string => {
	if (!skinTone) {
		return 'default';
	}
	const codepoint = EmojiUtils.convertToCodePoints(skinTone);
	return SPRITE_SHEET_RESOURCES[codepoint] ? codepoint : 'default';
};

export const getSpriteSheetPath = (skinTone?: string, options?: SpriteSheetOptions): string => {
	const key = getSpriteSheetKey(skinTone);
	const sheet = SPRITE_SHEET_RESOURCES[key];
	return options?.retina ? sheet.retina : sheet.standard;
};

let supportsImageSetCache: boolean | null = null;

const supportsImageSet = (): boolean => {
	if (supportsImageSetCache !== null) {
		return supportsImageSetCache;
	}

	if (typeof window === 'undefined' || !window.CSS?.supports) {
		return false;
	}

	supportsImageSetCache = window.CSS.supports(
		'background-image',
		"image-set(url('data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEA') 1x)",
	);
	return supportsImageSetCache;
};

export const getSpriteSheetBackground = (skinTone?: string): string => {
	const basePath = getSpriteSheetPath(skinTone);

	if (supportsImageSet()) {
		const retinaPath = getSpriteSheetPath(skinTone, {retina: true});
		return `image-set(url(${basePath}) 1x, url(${retinaPath}) 2x)`;
	}

	return `url(${basePath})`;
};

const shouldUseRetinaSpriteSheet = (): boolean =>
	typeof window !== 'undefined' && window.devicePixelRatio >= 1.5;

const preloadSpriteSheetPath = (path: string): void => {
	if (typeof Image === 'undefined' || preloadedSpriteSheetPaths.has(path)) {
		return;
	}

	preloadedSpriteSheetPaths.add(path);
	const image = new Image();
	image.decoding = 'async';
	image.src = path;
};

export const preloadEmojiSpriteSheets = (skinTone?: string): void => {
	const options = {retina: shouldUseRetinaSpriteSheet()};
	preloadSpriteSheetPath(getSpriteSheetPath('', options));
	if (skinTone) {
		preloadSpriteSheetPath(getSpriteSheetPath(skinTone, options));
	}
};

