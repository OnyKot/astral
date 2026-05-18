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

import {createHash, timingSafeEqual} from 'node:crypto';

export function buildIntellectMoneySha256Hex(parts: Array<string | number | boolean | null | undefined>): string {
	const payload = parts.map((part) => (part == null ? '' : String(part))).join('::');
	return createHash('sha256').update(payload, 'utf8').digest('hex');
}

export function verifyIntellectMoneySha256Hex(
	parts: Array<string | number | boolean | null | undefined>,
	providedSignature: string | null | undefined,
): boolean {
	if (!providedSignature || providedSignature.trim() === '') {
		return false;
	}

	const expected = buildIntellectMoneySha256Hex(parts).toLowerCase();
	const provided = providedSignature.trim().toLowerCase();
	try {
		const expectedBuffer = Buffer.from(expected, 'utf8');
		const providedBuffer = Buffer.from(provided, 'utf8');
		if (expectedBuffer.length !== providedBuffer.length) {
			return false;
		}
		return timingSafeEqual(expectedBuffer, providedBuffer);
	} catch {
		return false;
	}
}
