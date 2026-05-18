import {describe, expect, it} from 'vitest';
import {EMOJI_DISPLAY_PLACEHOLDER} from './TextareaEmojiDisplayUtils';
import {deleteEmojiAtCaret} from './TextareaEmojiEditingUtils';
import {TextareaSegmentManager} from './TextareaSegmentManager';

describe('TextareaEmojiEditingUtils', () => {
	it('deletes a custom emoji segment with a single backspace', () => {
		const manager = new TextareaSegmentManager();
		const value = `A${EMOJI_DISPLAY_PLACEHOLDER}B`;

		manager.insertSegment('A', 1, EMOJI_DISPLAY_PLACEHOLDER, '<:wave:1>', 'emoji', '1');

		const result = deleteEmojiAtCaret(value, 2, 2, 'Backspace', manager);

		expect(result).toEqual({
			value: 'AB',
			cursorPosition: 1,
		});
		expect(manager.getSegments()).toHaveLength(0);
	});

	it('deletes a unicode emoji with a single backspace', () => {
		const manager = new TextareaSegmentManager();
		const value = 'A🙂B';
		const cursorPosition = 'A🙂'.length;

		const result = deleteEmojiAtCaret(value, cursorPosition, cursorPosition, 'Backspace', manager);

		expect(result).toEqual({
			value: 'AB',
			cursorPosition: 1,
		});
	});

	it('deletes a unicode emoji with a single delete', () => {
		const manager = new TextareaSegmentManager();
		const value = 'A🙂B';

		const result = deleteEmojiAtCaret(value, 1, 1, 'Delete', manager);

		expect(result).toEqual({
			value: 'AB',
			cursorPosition: 1,
		});
	});

	it('does not intercept normal character deletion', () => {
		const manager = new TextareaSegmentManager();

		expect(deleteEmojiAtCaret('ABC', 2, 2, 'Backspace', manager)).toBeNull();
		expect(deleteEmojiAtCaret('ABC', 1, 1, 'Delete', manager)).toBeNull();
	});
});
