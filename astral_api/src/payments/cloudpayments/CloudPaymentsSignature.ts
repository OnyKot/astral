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

import {createHmac, timingSafeEqual} from 'node:crypto';

export function buildCloudPaymentsBodyHmacBase64(rawBody: string, apiSecret: string): string {
	return createHmac('sha256', apiSecret).update(rawBody, 'utf8').digest('base64');
}

export function verifyCloudPaymentsBodyHmacBase64(rawBody: string, signatureBase64: string, apiSecret: string): boolean {
	if (!signatureBase64 || !apiSecret) {
		return false;
	}

	const expected = buildCloudPaymentsBodyHmacBase64(rawBody, apiSecret);
	try {
		const providedBuffer = Buffer.from(signatureBase64, 'utf8');
		const expectedBuffer = Buffer.from(expected, 'utf8');
		if (providedBuffer.length !== expectedBuffer.length) {
			return false;
		}
		return timingSafeEqual(providedBuffer, expectedBuffer);
	} catch {
		return false;
	}
}

