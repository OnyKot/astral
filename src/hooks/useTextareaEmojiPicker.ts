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
	replaceWithSegment: (
		currentText: string,
		start: number,
		end: number,
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
	replaceWithSegment,
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

			let nextCursorPosition: number | null = null;
			const textarea = textareaRef.current;
			const selectionStart = textarea?.selectionStart ?? previousValueRef.current.length;
			const selectionEnd = textarea?.selectionEnd ?? selectionStart;

			if (!isCustomEmoji) {
				const unicodeText = emoji.surrogates ?? '';
				if (!unicodeText) {
					return;
				}

				setValue((prevValue) => {
					const start = Math.max(0, Math.min(prevValue.length, selectionStart));
					const end = Math.max(start, Math.min(prevValue.length, selectionEnd));
					const displayText = getEmojiDisplayText(emoji);
					const {newText} = replaceWithSegment(
						prevValue,
						start,
						end,
						displayText,
						unicodeText,
						'emoji',
						emoji.uniqueName || emoji.name || unicodeText,
					);
					nextCursorPosition = start + displayText.length;
					previousValueRef.current = newText;
					return newText;
				});
				if (!isMobileLayoutEnabled) {
					textareaRef.current?.focus();
				}
				window.requestAnimationFrame(() => {
					const node = textareaRef.current;
					if (!node) {
						return;
					}

					const cursorPosition = nextCursorPosition ?? node.value.length;
					node.setSelectionRange(cursorPosition, cursorPosition);
				});
				return;
			}

			const actualText = EmojiStore.getEmojiMarkdown(emoji);
			const displayText = getEmojiDisplayText(emoji);

			setValue((prevValue) => {
				const start = Math.max(0, Math.min(prevValue.length, selectionStart));
				const end = Math.max(start, Math.min(prevValue.length, selectionEnd));
				const {newText} = replaceWithSegment(
					prevValue,
					start,
					end,
					displayText,
					actualText,
					'emoji',
					emoji.id ?? emoji.uniqueName,
				);

				nextCursorPosition = start + displayText.length;
				previousValueRef.current = newText;
				return newText;
			});
			if (!isMobileLayoutEnabled) {
				textareaRef.current?.focus();
			}
			window.requestAnimationFrame(() => {
				const node = textareaRef.current;
				if (!node) {
					return;
				}

				const cursorPosition = nextCursorPosition ?? node.value.length;
				node.setSelectionRange(cursorPosition, cursorPosition);
			});
		},
		[
			allowUnicodeEmojiSelection,
			replaceWithSegment,
			setValue,
			textareaRef,
			previousValueRef,
			isMobileLayoutEnabled,
		],
	);

	return {
		handleEmojiSelect,
	};
}
