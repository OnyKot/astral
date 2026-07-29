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

import {Logger} from '~/Logger';
import type {SteamPlayerSummary} from '~/steam/SteamModel';

const STEAM_API_BASE = 'https://api.steampowered.com';

interface PlayerSummariesResponse {
	response?: {
		players?: Array<SteamPlayerSummary>;
	};
}

export class SteamApiClient {
	constructor(private readonly apiKey: string) {}

	/**
	 * Fetch a public profile summary for a single SteamID64.
	 *
	 * Uses the unauthenticated, server-key-signed Steam Web API endpoint
	 * `ISteamUser/GetPlayerSummaries/v2/`. Returns null on any error so the
	 * caller can proceed with a minimal connection record (Steam profile
	 * may be private; we still want the link to succeed).
	 */
	async getPlayerSummary(steamId: string): Promise<SteamPlayerSummary | null> {
		const url = new URL(`${STEAM_API_BASE}/ISteamUser/GetPlayerSummaries/v2/`);
		url.searchParams.set('key', this.apiKey);
		url.searchParams.set('steamids', steamId);
		try {
			const response = await fetch(url.toString(), {method: 'GET'});
			if (!response.ok) {
				Logger.warn({status: response.status, steamId}, '[Steam] GetPlayerSummaries non-2xx');
				return null;
			}
			const json = (await response.json()) as PlayerSummariesResponse;
			const players = json.response?.players ?? [];
			return players.find((p) => p.steamid === steamId) ?? null;
		} catch (error) {
			Logger.warn({error, steamId}, '[Steam] GetPlayerSummaries failed');
			return null;
		}
	}
}
