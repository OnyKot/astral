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

import {describe, expect, test} from 'vitest';
import {
	FIRST_PARTY_HOSTS,
	FIRST_PARTY_HOST_SUFFIXES,
	getImplicitlyTrustedDomainPatterns,
	isFirstPartyHost,
} from './FirstPartyHosts';

describe('FirstPartyHosts', () => {
	test('includes the default first-party hosts', () => {
		expect(FIRST_PARTY_HOSTS).toContain('astraof.com');
		expect(FIRST_PARTY_HOSTS).toContain('api.astraof.com');
		expect(FIRST_PARTY_HOSTS).toContain('gateway.astraof.com');
		expect(FIRST_PARTY_HOSTS).toContain('asrtal.ru');
		expect(FIRST_PARTY_HOSTS).toContain('api.asrtal.ru');
		expect(FIRST_PARTY_HOSTS).toContain('gateway.asrtal.ru');
	});

	test('matches configured suffixes for subdomains', () => {
		expect(FIRST_PARTY_HOST_SUFFIXES).toContain('.astraof.com');
		expect(FIRST_PARTY_HOST_SUFFIXES).toContain('.asrtal.ru');
		expect(isFirstPartyHost('cdn.astraof.com')).toBe(true);
		expect(isFirstPartyHost('cdn.asrtal.ru')).toBe(true);
		expect(isFirstPartyHost('self-hosted.example')).toBe(false);
	});

	test('builds trusted domain patterns for the domain store', () => {
		expect(getImplicitlyTrustedDomainPatterns()).toContain('astraof.com');
		expect(getImplicitlyTrustedDomainPatterns()).toContain('*.astraof.com');
		expect(getImplicitlyTrustedDomainPatterns()).toContain('asrtal.ru');
		expect(getImplicitlyTrustedDomainPatterns()).toContain('*.asrtal.ru');
	});
});
