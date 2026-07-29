/*
 * Copyright (C) 2026 Astral Contributors
 */

import crypto from 'node:crypto';
import {describe, expect, it} from 'vitest';
import {reconstructOriginalURL, verifySignature} from './MediaProxyUtils';

describe('MediaProxyUtils (astral_media_proxy)', () => {
	const secret = 'test-media-proxy-secret-32-chars!!';

	it('verifySignature accepts valid HMAC', () => {
		const path = 'https/example.com/image.png';
		const hmac = crypto.createHmac('sha256', secret).update(path).digest('base64url').replace(/=*$/g, '');

		expect(verifySignature(path, hmac, secret)).toBe(true);
	});

	it('verifySignature rejects tampered signature', () => {
		const path = 'https/example.com/image.png';
		expect(verifySignature(path, 'bad-signature', secret)).toBe(false);
	});

	it('reconstructOriginalURL rebuilds https URL from proxy path', () => {
		const original = reconstructOriginalURL('https%3A/example.com/folder/photo.jpg');
		expect(original).toBe('https://example.com/folder/photo.jpg');
	});

	it('reconstructOriginalURL rejects non-http schemes', () => {
		expect(() => reconstructOriginalURL('file%3A/etc/passwd')).toThrow(/Unsupported protocol/);
	});

	it('reconstructOriginalURL handles query prefix segment', () => {
		const original = reconstructOriginalURL('size%3Dlarge/https%3A/example.com/img.jpg');
		expect(original).toBe('https://example.com/img.jpg?size=large');
	});

	// buildMediaProxyURL emits the scheme without a trailing colon. Every test above encodes one,
	// which is why the "https:"-only allowlist shipped in 0aa02b71 passed CI while rejecting 100%
	// of production traffic. These two cover the shape the client actually sends.
	it('reconstructOriginalURL accepts a bare scheme segment', () => {
		const original = reconstructOriginalURL('https/example.com/folder/photo.jpg');
		expect(original).toBe('https://example.com/folder/photo.jpg');
	});

	it('reconstructOriginalURL accepts a bare scheme after a query segment', () => {
		const original = reconstructOriginalURL(
			'cid%3Dabc%26rid%3Dgiphy-preview.mp4/https/media4.giphy.com/media/x/giphy-preview.mp4',
		);
		expect(original).toBe('https://media4.giphy.com/media/x/giphy-preview.mp4?cid=abc&rid=giphy-preview.mp4');
	});

	it('reconstructOriginalURL still rejects a bare non-http scheme', () => {
		expect(() => reconstructOriginalURL('file/etc/passwd')).toThrow(/Unsupported protocol/);
	});
});
