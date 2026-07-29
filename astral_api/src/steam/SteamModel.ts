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
import type {SteamConnectionRow} from '~/database/CassandraTypes';

export const SteamOpenIDStartRequest = z.object({
	redirect_to: z.string().url().optional(),
});
export type SteamOpenIDStartRequest = z.infer<typeof SteamOpenIDStartRequest>;

export interface SteamConnectionResponse {
	steamId: string;
	personaName: string;
	profileUrl: string | null;
	avatarUrl: string | null;
	visibility: number | null;
	realName: string | null;
	primaryClanId: string | null;
	countryCode: string | null;
	lastLogoffAt: number | null;
	connectedAt: number;
	updatedAt: number;
	currentGameId: string | null;
	currentGameName: string | null;
	currentGameStartedAt: number | null;
	personaState: number | null;
	presenceSyncedAt: number | null;
	presenceVisible: boolean;
}

export interface SteamStatusResponse {
	configured: boolean;
	connection: SteamConnectionResponse | null;
}

export interface SteamOpenIDStartResponse {
	configured: boolean;
	url: string | null;
	state: string | null;
}

export interface SteamPlayerSummary {
	steamid: string;
	personaname: string;
	profileurl?: string;
	avatar?: string;
	avatarmedium?: string;
	avatarfull?: string;
	communityvisibilitystate?: number;
	personastate?: number;
	realname?: string;
	primaryclanid?: string;
	loccountrycode?: string;
	lastlogoff?: number;
	timecreated?: number;
	gameid?: string;
	gameextrainfo?: string;
	gameserverip?: string;
}

export const SteamPresencePrivacyRequest = z.object({
	visible: z.boolean(),
});
export type SteamPresencePrivacyRequest = z.infer<typeof SteamPresencePrivacyRequest>;

export function rowToConnectionResponse(row: SteamConnectionRow): SteamConnectionResponse {
	return {
		steamId: row.steam_id,
		personaName: row.persona_name,
		profileUrl: row.profile_url,
		avatarUrl: row.avatar_url,
		visibility: row.visibility,
		realName: row.real_name,
		primaryClanId: row.primary_clan_id,
		countryCode: row.country_code,
		lastLogoffAt: row.last_logoff_at ? row.last_logoff_at.getTime() : null,
		connectedAt: row.connected_at.getTime(),
		updatedAt: row.updated_at.getTime(),
		currentGameId: row.current_game_id,
		currentGameName: row.current_game_name,
		currentGameStartedAt: row.current_game_started_at ? row.current_game_started_at.getTime() : null,
		personaState: row.persona_state,
		presenceSyncedAt: row.presence_synced_at ? row.presence_synced_at.getTime() : null,
		presenceVisible: row.presence_visible !== false, // default to true (opt-out)
	};
}
