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
import {buildTBankToken, verifyTBankToken} from './TBankToken';

describe('TBankToken', () => {
	it('builds deterministic token from primitive top-level fields', () => {
		const payload = {
			TerminalKey: 'T',
			Amount: 49000,
			OrderId: '123',
			Description: 'Test',
			DATA: {user_id: '1'},
		};

		const token = buildTBankToken(payload, 'p');

		expect(token).toBe('64f62a0b70a451e97ec4c3a8e98f6874014019263270341cff8798e162511b91');
	});

	it('verifies token and rejects invalid signatures', () => {
		const payload = {
			TerminalKey: 'T',
			Amount: 49000,
			OrderId: '123',
			Token: '64e9a5bd38db07bb9d74796bf7578164f8cee6552e588bf43420b9a1fd8d9945',
		};

		expect(verifyTBankToken(payload, 'p')).toBe(true);
		expect(verifyTBankToken({...payload, Token: 'bad'}, 'p')).toBe(false);
		expect(verifyTBankToken({...payload, Token: ''}, 'p')).toBe(false);
	});
});
