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

import {buildIntellectMoneySha256Hex, verifyIntellectMoneySha256Hex} from './IntellectMoneySignature';
import {describe, expect, it} from 'vitest';

describe('IntellectMoneySignature', () => {
	it('builds deterministic sha256 signature', () => {
		const signature = buildIntellectMoneySha256Hex(['1', '2', 'abc']);
		expect(signature).toBe('770f3521ff5b56e7412436ec76a6b0208f2487419104ffb5659f4fa96f1c6c0a');
	});

	it('verifies signature with timing safe comparison', () => {
		const parts = ['eshop', 'order', '490.00', 'SUCCESS', 'secret'];
		const signature = buildIntellectMoneySha256Hex(parts);
		expect(verifyIntellectMoneySha256Hex(parts, signature)).toBe(true);
		expect(verifyIntellectMoneySha256Hex(parts, 'bad')).toBe(false);
		expect(verifyIntellectMoneySha256Hex(parts, '')).toBe(false);
	});
});
