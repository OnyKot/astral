/*
 * Copyright (C) 2026 Astral Contributors
 *
 * Regression: guests must reach marketing without login redirect.
 */

import {describe, expect, test} from 'vitest';
import {Routes} from '~/Routes';
import {isPublicUnauthenticatedPath} from './constants';

describe('router constants (regression)', () => {
	test('home and marketing are public for unauthenticated visitors', () => {
		expect(isPublicUnauthenticatedPath(Routes.HOME)).toBe(true);
		expect(isPublicUnauthenticatedPath(Routes.MARKETING)).toBe(true);
		expect(isPublicUnauthenticatedPath('/marketing/terms')).toBe(true);
		expect(isPublicUnauthenticatedPath('/marketing/privacy')).toBe(true);
		expect(isPublicUnauthenticatedPath('/download')).toBe(true);
		expect(isPublicUnauthenticatedPath('/terms')).toBe(true);
		expect(isPublicUnauthenticatedPath('/help/articles/getting-started')).toBe(true);
	});

	test('app routes still require auth redirect', () => {
		expect(isPublicUnauthenticatedPath(Routes.LOGIN)).toBe(false);
		expect(isPublicUnauthenticatedPath('/channels/@me')).toBe(false);
	});
});
