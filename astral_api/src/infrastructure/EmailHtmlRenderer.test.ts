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

import {describe, expect, it} from 'vitest';
import {renderEmailHtml} from './EmailHtmlRenderer';

describe('EmailHtmlRenderer', () => {
	it('renders a landing-style CTA for action emails', () => {
		const html = renderEmailHtml({
			templateKey: 'emailVerification',
			subject: 'Verify your Astral email address',
			textBody:
				'Hello Ice,\n\nPlease verify your email address for your Astral account by clicking the link below:\n\nhttps://asrtal.ru/verify#token=abc123\n\nThis link will expire in 24 hours.\n\n- Astral Team',
			appBaseUrl: 'https://asrtal.ru',
			marketingBaseUrl: 'https://asrtal.ru',
		});

		expect(html).toContain('Astral System Mail');
		expect(html).toContain('Verify Email');
		expect(html).toContain('https://asrtal.ru/verify#token=abc123');
		expect(html).toContain('Hello Ice');
		expect(html).not.toContain('- Astral Team');
	});

	it('renders verification codes as highlighted cards', () => {
		const html = renderEmailHtml({
			templateKey: 'emailChangeNew',
			subject: 'Verify your new Astral email',
			textBody:
				'Hello Ice,\n\nEnter this code in the app to verify your new Astral email:\n\nV77C-H9KY\n\nThis code expires at Friday, March 12.',
			appBaseUrl: 'https://asrtal.ru',
			marketingBaseUrl: 'https://asrtal.ru',
		});

		expect(html).toContain('Verification code');
		expect(html).toContain('V77C-H9KY');
		expect(html).toContain("font-family:'SFMono-Regular'");
	});

	it('renders list and key-value sections cleanly', () => {
		const html = renderEmailHtml({
			templateKey: 'ipAuthorization',
			subject: 'Authorize login from new IP address',
			textBody:
				'Hello Ice,\n\nIP Address: 192.168.1.1\nLocation: Moscow, RU\n\nIf this was you, please authorize this IP address by clicking the link below:\n\nhttps://asrtal.ru/authorize-ip#token=xyz\n\n- Astral Team',
			appBaseUrl: 'https://asrtal.ru',
			marketingBaseUrl: 'https://asrtal.ru',
		});

		expect(html).toContain('IP Address:');
		expect(html).toContain('Moscow, RU');
		expect(html).toContain('Authorize Login');
		expect(html).toContain('Helpful links');
	});

	it('renders AstraMusic-branded wrappers for music emails', () => {
		const html = renderEmailHtml({
			templateKey: 'passwordReset',
			subject: 'Reset your password • AstraMusic',
			textBody:
				'Hello Ice,\n\nPlease use the link below to reset access to your account.\n\nhttps://music.astraof.com/reset#token=abc123\n\n- Astral Team',
			appBaseUrl: 'https://music.astraof.com',
			marketingBaseUrl: 'https://astraof.com',
			brand: 'music',
		});

		expect(html).toContain('AstraMusic Mail');
		expect(html).toContain('Open AstraMusic');
		expect(html).toContain('https://music.astraof.com/home');
		expect(html).toContain('https://music.astraof.com/reset#token=abc123');
	});
});
