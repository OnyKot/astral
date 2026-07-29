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

import type {Task} from 'graphile-worker';
import {Config} from '~/Config';
import {Logger} from '~/Logger';
import {SteamApiClient} from '~/steam/SteamApiClient';
import {rowToConnectionResponse} from '~/steam/SteamModel';
import {SteamRepository} from '~/steam/SteamRepository';
import {getWorkerDependencies} from '../WorkerContext';

const syncSteamPresence: Task = async (_payload, _helpers) => {
	if (!Config.steam.enabled || !Config.steam.apiKey) {
		return;
	}

	const repository = new SteamRepository();
	const rows = await repository.listAllConnections();
	if (rows.length === 0) return;

	const {gatewayService} = getWorkerDependencies();
	const apiClient = new SteamApiClient(Config.steam.apiKey);
	const now = new Date();
	let updated = 0;

	for (const row of rows) {
		try {
			const summary = await apiClient.getPlayerSummary(row.steam_id);
			if (!summary) continue;

			const wasPlayingSame = row.current_game_id !== null && row.current_game_id === (summary.gameid ?? null);
			const newGameId = summary.gameid ?? null;
			const gameChanged = row.current_game_id !== newGameId;

			const updatedRow = {
				...row,
				persona_name: summary.personaname ?? row.persona_name,
				avatar_url: summary.avatarfull ?? summary.avatarmedium ?? summary.avatar ?? row.avatar_url,
				last_logoff_at: summary.lastlogoff ? new Date(summary.lastlogoff * 1000) : row.last_logoff_at,
				updated_at: now,
				current_game_id: newGameId,
				current_game_name: summary.gameextrainfo ?? null,
				current_game_started_at: newGameId
					? wasPlayingSame
						? row.current_game_started_at
						: now
					: null,
				persona_state: summary.personastate ?? null,
				presence_synced_at: now,
			};
			await repository.upsertConnection(updatedRow, row.steam_id);
			updated++;

			// Notify the user's client so it can update its presence with the new game
			if (gameChanged && row.presence_visible) {
				void gatewayService
					.dispatchPresence({
						userId: row.user_id,
						event: 'INTEGRATION_UPDATE',
						data: {type: 'steam', connection: rowToConnectionResponse(updatedRow)},
					})
					.catch((err) => Logger.warn({err}, '[syncSteamPresence] Failed to dispatch INTEGRATION_UPDATE'));
			}
		} catch (error) {
			Logger.warn({error, steamId: row.steam_id}, '[syncSteamPresence] Failed to sync user');
		}
	}

	Logger.debug({total: rows.length, updated}, '[syncSteamPresence] Presence sync complete');
};

export default syncSteamPresence;
