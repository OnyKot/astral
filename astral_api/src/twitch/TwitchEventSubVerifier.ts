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
import {Config} from '~/Config';
import {AccessDeniedError, InputValidationError} from '~/Errors';

const MAX_EVENTSUB_CLOCK_SKEW_MS = 10 * 60 * 1000;

export interface TwitchEventSubHeaders {
	messageId: string;
	messageTimestamp: string;
	messageType: string;
	signature: string;
	subscriptionType?: string;
}

export function readTwitchEventSubHeaders(headers: Headers): TwitchEventSubHeaders {
	const messageId = headers.get('twitch-eventsub-message-id') ?? '';
	const messageTimestamp = headers.get('twitch-eventsub-message-timestamp') ?? '';
	const messageType = headers.get('twitch-eventsub-message-type') ?? '';
	const signature = headers.get('twitch-eventsub-message-signature') ?? '';
	const subscriptionType = headers.get('twitch-eventsub-subscription-type') ?? undefined;
	if (!messageId || !messageTimestamp || !messageType || !signature) {
		throw InputValidationError.create('twitch', 'Missing Twitch EventSub headers.');
	}
	return {messageId, messageTimestamp, messageType, signature, subscriptionType};
}

export function verifyTwitchEventSubSignature(headers: TwitchEventSubHeaders, rawBody: string): void {
	const secret = Config.twitch.eventSubSecret;
	if (!secret) {
		throw new AccessDeniedError();
	}

	const timestamp = Date.parse(headers.messageTimestamp);
	if (!Number.isFinite(timestamp) || Math.abs(Date.now() - timestamp) > MAX_EVENTSUB_CLOCK_SKEW_MS) {
		throw new AccessDeniedError();
	}

	const expected = `sha256=${createHmac('sha256', secret)
		.update(headers.messageId + headers.messageTimestamp + rawBody, 'utf8')
		.digest('hex')}`;

	const expectedBuffer = Buffer.from(expected, 'utf8');
	const providedBuffer = Buffer.from(headers.signature, 'utf8');
	if (expectedBuffer.length !== providedBuffer.length || !timingSafeEqual(expectedBuffer, providedBuffer)) {
		throw new AccessDeniedError();
	}
}
