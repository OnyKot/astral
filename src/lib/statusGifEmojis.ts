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

import statusGifEmojiData from '~/data/status-gif-emojis.json';

export const STATUS_GIF_EMOJI_PREFIX = 'ast:';
const STATUS_GIF_EMOJI_ASSET_BASE = '/gif-emojis/gif/';

export interface StatusGifEmoji {
	id: string;
	value: string;
	name: string;
	fileName: string;
	url: string;
}

interface StatusGifEmojiDataItem {
	id: string;
	value: string;
	name: string;
	fileName: string;
}

const buildStatusGifEmojiUrl = (fileName: string): string =>
	`${STATUS_GIF_EMOJI_ASSET_BASE}${fileName.split('/').map(encodeURIComponent).join('/')}`;

export const STATUS_GIF_EMOJIS: ReadonlyArray<StatusGifEmoji> = (statusGifEmojiData as Array<StatusGifEmojiDataItem>).map(
	(emoji) => ({
		...emoji,
		url: buildStatusGifEmojiUrl(emoji.fileName),
	}),
);

const STATUS_GIF_EMOJI_BY_VALUE = new Map(STATUS_GIF_EMOJIS.map((emoji) => [emoji.value, emoji]));

export const getStatusGifEmoji = (value: string | null | undefined): StatusGifEmoji | null => {
	if (!value?.startsWith(STATUS_GIF_EMOJI_PREFIX)) {
		return null;
	}

	return STATUS_GIF_EMOJI_BY_VALUE.get(value) ?? null;
};

export const isStatusGifEmojiName = (value: string | null | undefined): boolean => Boolean(getStatusGifEmoji(value));

export const getStatusGifEmojiDisplayName = (value: string | null | undefined): string => {
	const emoji = getStatusGifEmoji(value);
	return emoji ? `:${emoji.name}:` : (value ?? '');
};
