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

import type {UserID} from '~/BrandedTypes';

type Nullish<T> = T | null;

export interface TelegramConnectionRow {
	user_id: UserID;
	telegram_user_id: bigint;
	username: Nullish<string>;
	first_name: Nullish<string>;
	last_name: Nullish<string>;
	photo_url: Nullish<string>;
	language_code: Nullish<string>;
	is_premium: Nullish<boolean>;
	auth_date: Date;
	notifications_enabled: boolean;
	notification_preferences_json: Nullish<string>;
	connected_at: Date;
	updated_at: Date;
	telegram_2fa_enabled: Nullish<boolean>;
}

export interface TelegramConnectionByTelegramUserIdRow {
	telegram_user_id: bigint;
	user_id: UserID;
}

export const TELEGRAM_CONNECTION_COLUMNS = [
	'user_id',
	'telegram_user_id',
	'username',
	'first_name',
	'last_name',
	'photo_url',
	'language_code',
	'is_premium',
	'auth_date',
	'notifications_enabled',
	'notification_preferences_json',
	'connected_at',
	'updated_at',
	'telegram_2fa_enabled',
] as const satisfies ReadonlyArray<keyof TelegramConnectionRow>;

export const TELEGRAM_CONNECTION_BY_TELEGRAM_USER_ID_COLUMNS = ['telegram_user_id', 'user_id'] as const satisfies ReadonlyArray<
	keyof TelegramConnectionByTelegramUserIdRow
>;
