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

import {sanitizeTextareaDisplayValue} from '~/utils/TextareaEmojiDisplayUtils';
import type {MentionSegment, TextareaSegmentManager} from '~/utils/TextareaSegmentManager';
import {UNICODE_EMOJI_SURROGATE_RE} from '~/utils/UnicodeEmojiMatching';

interface EmojiDeletionResult {
	value: string;
	cursorPosition: number;
}

interface EmojiRange {
	start: number;
	end: number;
}

function findEmojiSegmentRange(
	segments: Array<MentionSegment>,
	cursorPosition: number,
	direction: 'Backspace' | 'Delete',
): EmojiRange | null {
	const emojiSegments = segments.filter((segment) => segment.type === 'emoji');
	if (direction === 'Backspace') {
		for (let index = emojiSegments.length - 1; index >= 0; index--) {
			const segment = emojiSegments[index]!;
			if (segment.start < cursorPosition && cursorPosition <= segment.end) {
				return {start: segment.start, end: segment.end};
			}
		}
		return null;
	}

	for (const segment of emojiSegments) {
		if (segment.start <= cursorPosition && cursorPosition < segment.end) {
			return {start: segment.start, end: segment.end};
		}
	}

	return null;
}

function findUnicodeEmojiRange(
	value: string,
	cursorPosition: number,
	direction: 'Backspace' | 'Delete',
): EmojiRange | null {
	if (!UNICODE_EMOJI_SURROGATE_RE) {
		return null;
	}

	UNICODE_EMOJI_SURROGATE_RE.lastIndex = 0;
	let match: RegExpExecArray | null;
	let backwardCandidate: EmojiRange | null = null;

	while ((match = UNICODE_EMOJI_SURROGATE_RE.exec(value)) !== null) {
		const start = match.index;
		const end = start + match[0].length;

		if (direction === 'Backspace') {
			if (start < cursorPosition && cursorPosition <= end) {
				backwardCandidate = {start, end};
			} else if (end > cursorPosition) {
				break;
			}
			continue;
		}

		if (start <= cursorPosition && cursorPosition < end) {
			return {start, end};
		}
		if (start > cursorPosition) {
			break;
		}
	}

	return backwardCandidate;
}

export function deleteEmojiAtCaret(
	value: string,
	selectionStart: number,
	selectionEnd: number,
	key: 'Backspace' | 'Delete',
	segmentManager: TextareaSegmentManager,
): EmojiDeletionResult | null {
	if (selectionStart !== selectionEnd) {
		return null;
	}

	const range =
		findEmojiSegmentRange(segmentManager.getSegments(), selectionStart, key) ??
		findUnicodeEmojiRange(value, selectionStart, key);

	if (!range || range.start >= range.end) {
		return null;
	}

	segmentManager.updateSegmentsForTextChange(range.start, range.end, 0);
	const nextValue = value.slice(0, range.start) + value.slice(range.end);
	const sanitized = sanitizeTextareaDisplayValue(nextValue, range.start, segmentManager);

	return {
		value: sanitized.value,
		cursorPosition: sanitized.cursorPosition,
	};
}
