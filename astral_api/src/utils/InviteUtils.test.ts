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

import {describe, expect, it, vi} from 'vitest';
import {findInvite, findInvites} from './InviteUtils';

vi.mock('~/Config', () => ({
	Config: {
		hosts: {
			invite: 'asrtal.ru',
			gift: 'asrtal.ru',
			marketing: 'marketing.asrtal.ru',
			unfurlIgnored: [],
		},
		endpoints: {
			webApp: 'https://asrtal.ru',
		},
	},
}));

describe('InviteUtils', () => {
	describe('findInvites', () => {
		it('should return empty array for null or empty content', () => {
			expect(findInvites(null)).toEqual([]);
			expect(findInvites('')).toEqual([]);
			expect(findInvites('   ')).toEqual([]);
		});

		it('should find invite codes from asrtal.ru URLs (direct, no /invite/)', () => {
			const content = 'Check out this guild: https://asrtal.ru/abc123';
			const result = findInvites(content);

			expect(result).toEqual(['abc123']);
		});

		it('should find invite codes from asrtal.ru/invite/ URLs', () => {
			const content = 'Join us: https://asrtal.ru/invite/test123';
			const result = findInvites(content);

			expect(result).toHaveLength(1);
			expect(result[0]).toBe('test123');
		});

		it('should NOT match asrtal.ru/invite/ URLs', () => {
			const content = 'Invalid: https://asrtal.ru/invite/shouldnotwork';
			const result = findInvites(content);

			expect(result).toEqual([]);
		});

		it('should handle URLs without protocol', () => {
			const content = 'Join us: asrtal.ru/test123';
			const result = findInvites(content);

			expect(result).toHaveLength(1);
			expect(result[0]).toBe('test123');
		});

		it('should handle URLs with hash fragment', () => {
			const content = 'Come join: https://asrtal.ru/#/invite/hash456';
			const result = findInvites(content);

			expect(result).toHaveLength(1);
			expect(result[0]).toBe('hash456');
		});

		it('should find multiple unique invite codes from different hosts', () => {
			const content = `
				First: https://asrtal.ru/invite1
				Second: https://asrtal.ru/invite/invite2
				Third: https://asrtal.ru/#/invite/invite3
			`;
			const result = findInvites(content);

			expect(result).toHaveLength(3);
			expect(result).toEqual(['invite1', 'invite2', 'invite3']);
		});

		it('should deduplicate identical invite codes', () => {
			const content = `
				https://asrtal.ru/duplicate
				asrtal.ru/duplicate
				Another mention: https://asrtal.ru/duplicate
			`;
			const result = findInvites(content);

			expect(result).toHaveLength(1);
			expect(result[0]).toBe('duplicate');
		});

		it('should deduplicate codes across different hosts', () => {
			const content = `
				https://asrtal.ru/samecode
				https://asrtal.ru/invite/samecode
			`;
			const result = findInvites(content);

			expect(result).toHaveLength(1);
			expect(result[0]).toBe('samecode');
		});

		it('should limit to maximum 10 invites', () => {
			let content = '';
			for (let i = 1; i <= 15; i++) {
				content += `https://asrtal.ru/code${i.toString().padStart(2, '0')} `;
			}

			const result = findInvites(content);
			expect(result).toHaveLength(10);
		});

		it('should handle invite codes with valid characters', () => {
			const validCodes = ['abc123', 'TEST-CODE', 'mix3d-Ch4rs', 'AB', 'a'.repeat(32)];

			validCodes.forEach((code) => {
				const content = `https://asrtal.ru/${code}`;
				const result = findInvites(content);

				expect(result).toHaveLength(1);
				expect(result[0]).toBe(code);
			});
		});

		it('should ignore invite codes that are too short', () => {
			const code = 'a';
			const content = `https://asrtal.ru/${code}`;
			const result = findInvites(content);

			expect(result).toHaveLength(0);
		});

		it('should ignore invite codes that are too long', () => {
			const code = 'a'.repeat(33);
			const content = `https://asrtal.ru/${code}`;
			const result = findInvites(content);

			expect(result).toHaveLength(0);
		});

		it('should handle mixed case URLs', () => {
			const content = 'Join: https://asrtal.ru/MixedCase123';
			const result = findInvites(content);

			expect(result).toHaveLength(1);
			expect(result[0]).toBe('MixedCase123');
		});

		it('should handle URLs with extra text around them', () => {
			const content = 'Before text https://asrtal.ru/surrounded123 after text';
			const result = findInvites(content);

			expect(result).toHaveLength(1);
			expect(result[0]).toBe('surrounded123');
		});

		it('should handle asrtal.ru URLs with and without protocol', () => {
			const content = `
				https://asrtal.ru/invite/withprotocol
				asrtal.ru/invite/withoutprotocol
			`;
			const result = findInvites(content);

			expect(result).toHaveLength(2);
			expect(result).toEqual(['withprotocol', 'withoutprotocol']);
		});

		it('should handle mixed asrtal.ru and asrtal.ru URLs', () => {
			const content = `
				Direct: asrtal.ru/direct123
				Web app: asrtal.ru/invite/local456
				Another direct: https://asrtal.ru/direct789
			`;
			const result = findInvites(content);

			expect(result).toHaveLength(3);
			expect(result).toEqual(['direct123', 'local456', 'direct789']);
		});

		it('should handle canary domain', () => {
			const content = `
				Canary: https://asrtal.ru/invite/canary123
				Stable: https://asrtal.ru/invite/stable456
			`;
			const result = findInvites(content);

			expect(result).toHaveLength(1);
			expect(result).toEqual(['stable456']);
		});

		it('should NOT match marketing site invite URLs', () => {
			const content = 'Invalid: https://asrtal.ru/invite/shouldnotwork';
			const result = findInvites(content);

			expect(result).toEqual([]);
		});
	});

	describe('findInvite', () => {
		it('should return null for null or empty content', () => {
			expect(findInvite(null)).toBeNull();
			expect(findInvite('')).toBeNull();
			expect(findInvite('   ')).toBeNull();
		});

		it('should find first invite code from asrtal.ru', () => {
			const content = 'Check out: https://asrtal.ru/first123';
			const result = findInvite(content);

			expect(result).toBe('first123');
		});

		it('should find first invite code from asrtal.ru', () => {
			const content = 'Check out: https://asrtal.ru/invite/first123';
			const result = findInvite(content);

			expect(result).toBe('first123');
		});

		it('should return first invite when multiple exist', () => {
			const content = `
				First: https://asrtal.ru/first456
				Second: asrtal.ru/invite/second789
			`;
			const result = findInvite(content);

			expect(result).toBe('first456');
		});

		it('should handle URLs without protocol', () => {
			const content = 'Join: asrtal.ru/noprotocol';
			const result = findInvite(content);

			expect(result).toBe('noprotocol');
		});

		it('should handle URLs with hash fragment', () => {
			const content = 'Visit: https://asrtal.ru/#/invite/hashcode';
			const result = findInvite(content);

			expect(result).toBe('hashcode');
		});

		it('should return null when no valid invite found', () => {
			const invalidContents = [
				'No invites here',
				'https://other-site.com/invite/code123',
				'https://asrtal.ru/invite/shouldnotmatch',
				'https://asrtal.ru/a',
				'https://asrtal.ru/invite/marketing',
			];

			invalidContents.forEach((content) => {
				expect(findInvite(content)).toBeNull();
			});
		});

		it('should handle case insensitive matching', () => {
			const content = 'Visit: HTTPS://ASTRAL.GG/CaseTest';
			const result = findInvite(content);

			expect(result).toBe('CaseTest');
		});

		it('should handle complex content with multiple URLs', () => {
			const content = `
				Visit our website at https://asrtal.ru
				Join our guild: https://asrtal.ru/complex123
				Learn more at https://asrtal.ru/about
			`;
			const result = findInvite(content);

			expect(result).toBe('complex123');
		});
	});

	describe('edge cases', () => {
		it('should handle content with special regex characters', () => {
			const content = 'Check this (important): https://asrtal.ru/special123 [link]';
			const result = findInvites(content);

			expect(result).toHaveLength(1);
			expect(result[0]).toBe('special123');
		});

		it('should handle very long content without crashing', () => {
			const longContent = `${'a'.repeat(10000)}https://asrtal.ru/buried123${'b'.repeat(10000)}`;
			const result = findInvites(longContent);

			expect(result).toEqual([]);
		});

		it('should handle malformed URLs gracefully', () => {
			const content = `
				https://asrtal.ru/good123
				https://asrtal.ru/
				https://asrtal.ru
				asrtal.ru/another456
				asrtal.ru/invite/valid789
			`;
			const result = findInvites(content);

			expect(result).toHaveLength(3);
			expect(result).toEqual(['good123', 'another456', 'valid789']);
		});

		it('should reset regex state between calls', () => {
			const content1 = 'https://asrtal.ru/first123';
			const content2 = 'https://asrtal.ru/invite/second456';

			const result1 = findInvite(content1);
			const result2 = findInvite(content2);

			expect(result1).toBe('first123');
			expect(result2).toBe('second456');
		});

		it('should handle codes at exact length boundaries', () => {
			const minCode = 'ab';
			const maxCode = 'a'.repeat(32);

			const contentMin = `https://asrtal.ru/${minCode}`;
			const contentMax = `https://asrtal.ru/${maxCode}`;

			expect(findInvite(contentMin)).toBe(minCode);
			expect(findInvite(contentMax)).toBe(maxCode);
		});

		it('should distinguish between marketing and web app domains', () => {
			const content = `
				Marketing: https://asrtal.ru/invite/marketing123
				Web app: https://asrtal.ru/invite/webapp456
				Shortlink: https://asrtal.ru/shortlink789
			`;
			const result = findInvites(content);

			expect(result).toHaveLength(2);
			expect(result).toEqual(['webapp456', 'shortlink789']);
		});
	});
});
