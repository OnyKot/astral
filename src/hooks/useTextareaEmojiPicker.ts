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

import React from 'react';
import MobileLayoutStore from '~/stores/MobileLayoutStore';
import EmojiStore, {type Emoji} from '~/stores/EmojiStore';
import {getEmojiDisplayText} from '~/utils/TextareaEmojiDisplayUtils';
import type {MentionSegment} from '~/utils/TextareaSegmentManager';

interface UseTextareaEmojiPickerReturn {
	handleEmojiSelect: (emoji: Emoji, shiftKey?: boolean) => void;
}

interface UseTextareaEmojiPickerParams {
	setValue: React.Dispatch<React.SetStateAction<string>>;
	textareaRef: React.RefObject<HTMLTextAreaElement | null>;
	insertSegment: (
		currentText: string,
		insertPosition: number,
		displayText: string,
		actualText: string,
		type: MentionSegment['type'],
		id: string,
	) => {newText: string};
	previousValueRef: React.MutableRefObject<string>;
	channelId?: string;
	allowUnicodeEmojiSelection?: boolean;
}

export function useTextareaEmojiPicker({
	setValue,
	textareaRef,
	insertSegment,
	previousValueRef,
	allowUnicodeEmojiSelection = true,
}: UseTextareaEmojiPickerParams): UseTextareaEmojiPickerReturn {
	const isMobileLayoutEnabled = MobileLayoutStore.isEnabled();

	const handleEmojiSelect = React.useCallback(
		(emoji: Emoji, shiftKey?: boolean) => {
			const isCustomEmoji = emoji.guildId != null || emoji.id != null;
			if (!allowUnicodeEmojiSelection && !isCustomEmoji) {
				return;
			}

			if (!isCustomEmoji) {
				const unicodeText = emoji.surrogates ?? '';
				if (!unicodeText) {
					return;
				}

				setValue((prevValue) => {
					const needsSpace = prevValue.length > 0 && !prevValue.endsWith(' ');
					const prefix = prevValue.length === 0 ? '' : needsSpace ? ' ' : '';
					const newText = `${prevValue}${prefix}${unicodeText}`;
					previousValueRef.current = newText;
					return newText;
				});
				if (!isMobileLayoutEnabled) {
					textareaRef.current?.focus();
				}
				return;
			}

			const actualText = EmojiStore.getEmojiMarkdown(emoji);
			const displayText = getEmojiDisplayText(emoji);

			setValue((prevValue) => {
				const needsSpace = prevValue.length > 0 && !prevValue.endsWith(' ');
				const prefix = prevValue.length === 0 ? '' : needsSpace ? ' ' : '';
				const insertPosition = prevValue.length + prefix.length;

				const {newText} = insertSegment(
					prevValue + prefix,
					insertPosition,
					displayText,
					actualText,
					'emoji',
					emoji.id ?? emoji.uniqueName,
				);

				previousValueRef.current = newText;
				return newText;
			});
			if (!isMobileLayoutEnabled) {
				textareaRef.current?.focus();
			}
		},
		[allowUnicodeEmojiSelection, insertSegment, setValue, textareaRef, previousValueRef, isMobileLayoutEnabled],
	);

	return {
		handleEmojiSelect,
	};
}
