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

import type {Emoji} from '~/stores/EmojiStore';
import type {TextareaSegmentManager} from '~/utils/TextareaSegmentManager';

export const CUSTOM_EMOJI_DISPLAY_PLACEHOLDER = '\uFFFC';
export const EMOJI_DISPLAY_PLACEHOLDER = '\uFFFC';

export function getEmojiDisplayText(emoji: Emoji): string {
	return EMOJI_DISPLAY_PLACEHOLDER;
}

function isTextareaSegmentManager(value: unknown): value is TextareaSegmentManager {
	return (
		typeof value === 'object' &&
		value !== null &&
		'getSegments' in value &&
		typeof (value as TextareaSegmentManager).getSegments === 'function' &&
		'setSegments' in value &&
		typeof (value as TextareaSegmentManager).setSegments === 'function'
	);
}

export function sanitizeTextareaDisplayValue(
	displayValue: string,
	cursorPosition: number,
	segmentManager: unknown,
): {value: string; cursorPosition: number; changed: boolean} {
	if (!isTextareaSegmentManager(segmentManager)) {
		return {value: displayValue, cursorPosition, changed: false};
	}

	let nextValue = displayValue;
	let nextCursorPosition = cursorPosition;
	let valueChanged = false;
	const segments = [...segmentManager.getSegments()].sort((a, b) => a.start - b.start);

	/*
	 * Guard against orphan placeholders (U+FFFC) that can appear during
	 * rapid delete/edit operations when a segment is partially removed.
	 * We drop placeholders that are no longer covered by an emoji segment.
	 */
	if (nextValue.includes(EMOJI_DISPLAY_PLACEHOLDER)) {
		for (let index = 0; index < nextValue.length; index++) {
			if (nextValue[index] !== EMOJI_DISPLAY_PLACEHOLDER) {
				continue;
			}

			const coveredByEmojiSegment = segments.some(
				(segment) => segment.type === 'emoji' && segment.start <= index && segment.end > index,
			);
			if (coveredByEmojiSegment) {
				continue;
			}

			nextValue = nextValue.slice(0, index) + nextValue.slice(index + 1);
			valueChanged = true;
			if (nextCursorPosition > index) {
				nextCursorPosition -= 1;
			}

			for (let i = 0; i < segments.length; i++) {
				const segment = segments[i]!;
				if (segment.start > index) {
					segments[i] = {
						...segment,
						start: segment.start - 1,
						end: segment.end - 1,
					};
				}
			}

			index -= 1;
		}
	}

	segments.sort((a, b) => a.start - b.start);
	segmentManager.setSegments(segments);

	return {
		value: nextValue,
		cursorPosition: Math.max(0, Math.min(nextCursorPosition, nextValue.length)),
		changed: valueChanged,
	};
}
