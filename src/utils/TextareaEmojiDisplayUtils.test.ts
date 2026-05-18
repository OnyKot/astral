import {describe, expect, it} from 'vitest';
import {EMOJI_DISPLAY_PLACEHOLDER, sanitizeTextareaDisplayValue} from './TextareaEmojiDisplayUtils';
import {TextareaSegmentManager} from './TextareaSegmentManager';

describe('TextareaEmojiDisplayUtils', () => {
	it('keeps plain shortcode text unchanged', () => {
		const manager = new TextareaSegmentManager();
		const result = sanitizeTextareaDisplayValue(':smile:', 7, manager);

		expect(result).toEqual({
			value: ':smile:',
			cursorPosition: 7,
			changed: false,
		});
	});

	it('keeps unicode emoji in the display value and preserves the final cursor position', () => {
		const manager = new TextareaSegmentManager();
		const value = 'ab🙂cd';
		const result = sanitizeTextareaDisplayValue(value, value.length, manager);

		expect(result).toEqual({
			value,
			cursorPosition: value.length,
			changed: false,
		});
	});

	it('removes orphan emoji placeholders that are not backed by segments', () => {
		const manager = new TextareaSegmentManager();
		const value = `a${EMOJI_DISPLAY_PLACEHOLDER}b`;
		const result = sanitizeTextareaDisplayValue(value, value.length, manager);

		expect(result).toEqual({
			value: 'ab',
			cursorPosition: 2,
			changed: true,
		});
	});
});
