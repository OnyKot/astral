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

import {createHash} from 'node:crypto';

type TokenPayload = Record<string, unknown>;

function isPrimitive(value: unknown): value is string | number | boolean | null {
	return (
		typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' || value === null
	);
}

export function buildTBankToken(payload: TokenPayload, password: string): string {
	const base: Record<string, string> = {};

	for (const [key, value] of Object.entries(payload)) {
		if (key === 'Token') continue;
		if (!isPrimitive(value)) continue;
		base[key] = value === null ? '' : String(value);
	}

	base.Password = password;

	const concatenated = Object.keys(base)
		.sort((a, b) => a.localeCompare(b))
		.map((key) => base[key])
		.join('');

	return createHash('sha256').update(concatenated, 'utf8').digest('hex');
}

export function verifyTBankToken(payload: TokenPayload, password: string): boolean {
	const providedToken = payload.Token;
	if (typeof providedToken !== 'string' || providedToken.length === 0) {
		return false;
	}

	return buildTBankToken(payload, password) === providedToken;
}
