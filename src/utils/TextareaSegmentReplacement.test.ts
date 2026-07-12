import {describe, expect, it} from 'vitest';
import {TextareaSegmentManager} from './TextareaSegmentManager';

describe('TextareaSegmentManager replacements', () => {
	it('replaces selected text and shifts following segments once', () => {
		const manager = new TextareaSegmentManager();
		manager.insertSegment('hello world', 6, '@User', '<@1>', 'user', '1');

		const result = manager.replaceText('hello @Userworld', 0, 5, 'hi');

		expect(result.newText).toBe('hi @Userworld');
		expect(result.newSegments).toEqual([
			expect.objectContaining({id: '1', start: 3, end: 8}),
		]);
	});

	it('replaces a selection with an emoji segment at the caret', () => {
		const manager = new TextareaSegmentManager();

		const result = manager.replaceWithSegment(
			'hello world',
			6,
			11,
			'\uFFFC',
			'<:wave:42>',
			'emoji',
			'42',
		);

		expect(result.newText).toBe('hello \uFFFC');
		expect(result.newSegments).toEqual([
			{
				type: 'emoji',
				id: '42',
				displayText: '\uFFFC',
				actualText: '<:wave:42>',
				start: 6,
				end: 7,
			},
		]);
	});

	it('keeps unicode emoji visually fixed while restoring the real surrogate for submission', () => {
		const manager = new TextareaSegmentManager();

		const result = manager.replaceWithSegment('text', 4, 4, '\uFFFC', '🙂', 'emoji', 'slight_smile');

		expect(result.newText).toBe('text\uFFFC');
		expect(manager.displayToActual(result.newText)).toBe('text🙂');
		expect(result.newSegments[0]).toMatchObject({
			type: 'emoji',
			displayText: '\uFFFC',
			actualText: '🙂',
			start: 4,
			end: 5,
		});
	});

	it('drops a segment intersected by replacement while preserving later segments', () => {
		const manager = new TextareaSegmentManager();
		manager.insertSegment('', 0, '@First', '<@1>', 'user', '1');
		manager.insertSegment('@First and ', 11, '@Second', '<@2>', 'user', '2');

		const result = manager.replaceWithSegment(
			'@First and @Second',
			0,
			6,
			'\uFFFC',
			'<:ok:9>',
			'emoji',
			'9',
		);

		expect(result.newText).toBe('\uFFFC and @Second');
		expect(result.newSegments).toEqual(
			expect.arrayContaining([
				expect.objectContaining({id: '2', start: 6, end: 13}),
				expect.objectContaining({id: '9', start: 0, end: 1}),
			]),
		);
		expect(result.newSegments.some((segment) => segment.id === '1')).toBe(false);
	});
});
