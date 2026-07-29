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

import {z} from '~/Schema';
import type {TelegramConnectionRow} from '~/database/CassandraTypes';

/**
 * Payload returned by Telegram Login Widget after the user authorizes.
 * The user is redirected back with these fields as query params, plus a
 * `hash` field containing HMAC-SHA256 of the rest signed with the bot token.
 *
 * Reference: https://core.telegram.org/widgets/login#receiving-authorization-data
 */
export const TelegramLoginPayload = z.object({
	id: z.coerce.number().int().positive(),
	first_name: z.string(),
	last_name: z.string().optional(),
	username: z.string().optional(),
	photo_url: z.string().optional(),
	auth_date: z.coerce.number().int().positive(),
	hash: z.string().min(64).max(64),
});
export type TelegramLoginPayload = z.infer<typeof TelegramLoginPayload>;

export const TelegramVerifyRequest = TelegramLoginPayload.extend({
	redirect_to: z.string().url().optional(),
});
export type TelegramVerifyRequest = z.infer<typeof TelegramVerifyRequest>;

export const TelegramNotificationPreferences = z.object({
	dms: z.boolean().optional(),
	mentions: z.boolean().optional(),
	calls: z.boolean().optional(),
	friend_requests: z.boolean().optional(),
	billing: z.boolean().optional(),
	announcements: z.boolean().optional(),
});
export type TelegramNotificationPreferences = z.infer<typeof TelegramNotificationPreferences>;

export const TelegramNotificationPreferencesRequest = z.object({
	notifications_enabled: z.boolean().optional(),
	preferences: TelegramNotificationPreferences.optional(),
});
export type TelegramNotificationPreferencesRequest = z.infer<typeof TelegramNotificationPreferencesRequest>;

export interface TelegramConnectionResponse {
	telegramUserId: string;
	username: string | null;
	firstName: string | null;
	lastName: string | null;
	photoUrl: string | null;
	languageCode: string | null;
	isPremium: boolean | null;
	authDate: number;
	notificationsEnabled: boolean;
	preferences: TelegramNotificationPreferences;
	connectedAt: number;
	updatedAt: number;
	twoFactorEnabled: boolean;
}

export const TelegramTwoFactorEnableRequest = z.object({
	code: z.string().regex(/^\d{6}$/, 'Code must be 6 digits'),
});
export type TelegramTwoFactorEnableRequest = z.infer<typeof TelegramTwoFactorEnableRequest>;

export interface TelegramStatusResponse {
	configured: boolean;
	botUsername: string | null;
	connection: TelegramConnectionResponse | null;
}

export const DEFAULT_TELEGRAM_PREFERENCES: TelegramNotificationPreferences = {
	dms: true,
	mentions: true,
	calls: true,
	friend_requests: true,
	billing: true,
	announcements: false,
};

export function rowToConnectionResponse(row: TelegramConnectionRow): TelegramConnectionResponse {
	let preferences: TelegramNotificationPreferences = DEFAULT_TELEGRAM_PREFERENCES;
	if (row.notification_preferences_json) {
		try {
			const parsed = TelegramNotificationPreferences.parse(JSON.parse(row.notification_preferences_json));
			preferences = {...DEFAULT_TELEGRAM_PREFERENCES, ...parsed};
		} catch {
			/* fall back to defaults */
		}
	}
	return {
		telegramUserId: row.telegram_user_id.toString(),
		username: row.username,
		firstName: row.first_name,
		lastName: row.last_name,
		photoUrl: row.photo_url,
		languageCode: row.language_code,
		isPremium: row.is_premium,
		authDate: row.auth_date.getTime(),
		notificationsEnabled: row.notifications_enabled,
		preferences,
		connectedAt: row.connected_at.getTime(),
		updatedAt: row.updated_at.getTime(),
		twoFactorEnabled: row.telegram_2fa_enabled === true,
	};
}
