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

export interface SteamConnectionRow {
	user_id: UserID;
	steam_id: string;
	persona_name: string;
	profile_url: Nullish<string>;
	avatar_url: Nullish<string>;
	visibility: Nullish<number>;
	real_name: Nullish<string>;
	primary_clan_id: Nullish<string>;
	country_code: Nullish<string>;
	last_logoff_at: Nullish<Date>;
	connected_at: Date;
	updated_at: Date;
	current_game_id: Nullish<string>;
	current_game_name: Nullish<string>;
	current_game_started_at: Nullish<Date>;
	persona_state: Nullish<number>;
	presence_synced_at: Nullish<Date>;
	presence_visible: Nullish<boolean>;
}

export interface SteamConnectionBySteamIdRow {
	steam_id: string;
	user_id: UserID;
}

export const STEAM_CONNECTION_COLUMNS = [
	'user_id',
	'steam_id',
	'persona_name',
	'profile_url',
	'avatar_url',
	'visibility',
	'real_name',
	'primary_clan_id',
	'country_code',
	'last_logoff_at',
	'connected_at',
	'updated_at',
	'current_game_id',
	'current_game_name',
	'current_game_started_at',
	'persona_state',
	'presence_synced_at',
	'presence_visible',
] as const satisfies ReadonlyArray<keyof SteamConnectionRow>;

export const STEAM_CONNECTION_BY_STEAM_ID_COLUMNS = ['steam_id', 'user_id'] as const satisfies ReadonlyArray<
	keyof SteamConnectionBySteamIdRow
>;
