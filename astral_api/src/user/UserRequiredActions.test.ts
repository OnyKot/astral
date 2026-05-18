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

import {afterEach, describe, expect, it} from 'vitest';
import {Config} from '~/Config';
import {SuspiciousActivityFlags} from '~/Constants';
import {getEffectiveRequiredActionFlags, getRequiredActionNames} from './UserRequiredActions';

const originalSmsEnabled = Config.sms.enabled;

const createUser = (overrides: Partial<Parameters<typeof getEffectiveRequiredActionFlags>[0]> = {}) => ({
	phone: '+79991234567',
	isBot: false,
	isSystem: false,
	suspiciousActivityFlags: 0,
	...overrides,
});

afterEach(() => {
	Config.sms.enabled = originalSmsEnabled;
});

describe('UserRequiredActions', () => {
	it('does not synthesize phone verification when sms is disabled', () => {
		Config.sms.enabled = false;

		expect(getEffectiveRequiredActionFlags(createUser({phone: null}))).toBe(0);
		expect(getRequiredActionNames(createUser({phone: null}))).toBeNull();
	});

	it('does not synthesize phone verification for regular users without a phone when sms is enabled', () => {
		Config.sms.enabled = true;

		expect(getEffectiveRequiredActionFlags(createUser({phone: null}))).toBe(0);
		expect(getRequiredActionNames(createUser({phone: null}))).toBeNull();
	});

	it('preserves existing flags for bot or system users', () => {
		Config.sms.enabled = true;

		expect(
			getEffectiveRequiredActionFlags(
				createUser({phone: null, isBot: true, suspiciousActivityFlags: SuspiciousActivityFlags.REQUIRE_VERIFIED_PHONE}),
			),
		).toBe(SuspiciousActivityFlags.REQUIRE_VERIFIED_PHONE);
		expect(
			getEffectiveRequiredActionFlags(
				createUser({
					phone: null,
					isSystem: true,
					suspiciousActivityFlags: SuspiciousActivityFlags.REQUIRE_REVERIFIED_PHONE,
				}),
			),
		).toBe(SuspiciousActivityFlags.REQUIRE_REVERIFIED_PHONE);
	});

	it('removes phone-only required action flags from regular users while preserving non-phone flags', () => {
		Config.sms.enabled = true;

		const flags = getEffectiveRequiredActionFlags(
			createUser({
				phone: null,
				suspiciousActivityFlags:
					SuspiciousActivityFlags.REQUIRE_REVERIFIED_EMAIL |
					SuspiciousActivityFlags.REQUIRE_VERIFIED_PHONE |
					SuspiciousActivityFlags.REQUIRE_REVERIFIED_EMAIL_OR_VERIFIED_PHONE,
			}),
		);

		expect(flags).toBe(SuspiciousActivityFlags.REQUIRE_REVERIFIED_EMAIL);
		expect(getRequiredActionNames(createUser({phone: null, suspiciousActivityFlags: flags}))).toEqual(['REQUIRE_REVERIFIED_EMAIL']);
	});
});
