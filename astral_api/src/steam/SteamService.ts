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

import {createUserID, type UserID} from '~/BrandedTypes';
import {Config} from '~/Config';
import type {ICacheService} from '~/infrastructure/ICacheService';
import {Logger} from '~/Logger';
import {SteamApiClient} from '~/steam/SteamApiClient';
import {
	type SteamConnectionResponse,
	type SteamOpenIDStartResponse,
	type SteamStatusResponse,
	rowToConnectionResponse,
} from '~/steam/SteamModel';
import {buildSteamOpenIDStartUrl, verifySteamOpenIDCallback} from '~/steam/SteamOpenIDClient';
import {SteamRepository} from '~/steam/SteamRepository';

const OPENID_STATE_TTL_SECONDS = 600; // 10 minutes — Steam OpenID round-trip should fit easily.
const POST_CONNECT_HOST = (() => {
	try {
		return new URL(Config.steam.postConnectRedirectUrl).host;
	} catch {
		return null;
	}
})();

interface CachedOpenIDState {
	userId: string;
	redirectTo: string;
	createdAt: number;
}

function stateCacheKey(state: string): string {
	return `steam:openid:state:${state}`;
}

function sanitizePostConnectRedirect(input?: string | null): string {
	const fallback = Config.steam.postConnectRedirectUrl;
	if (!input) return fallback;
	try {
		const target = new URL(input);
		if (POST_CONNECT_HOST && target.host !== POST_CONNECT_HOST) return fallback;
		return target.toString();
	} catch {
		return fallback;
	}
}

export class SteamService {
	private readonly repository = new SteamRepository();

	private isConfigured(): boolean {
		return Boolean(Config.steam.enabled && Config.steam.apiKey && Config.steam.realm && Config.steam.returnUrl);
	}

	async getStatus(userId: UserID): Promise<SteamStatusResponse> {
		const row = await this.repository.getConnection(userId);
		return {
			configured: this.isConfigured(),
			connection: row ? rowToConnectionResponse(row) : null,
		};
	}

	async startOpenID(params: {
		cacheService: ICacheService;
		userId: UserID;
		state: string;
		redirectTo?: string;
	}): Promise<SteamOpenIDStartResponse> {
		if (!this.isConfigured()) {
			return {configured: false, url: null, state: null};
		}
		await params.cacheService.set<CachedOpenIDState>(
			stateCacheKey(params.state),
			{
				userId: params.userId.toString(),
				redirectTo: sanitizePostConnectRedirect(params.redirectTo),
				createdAt: Date.now(),
			},
			OPENID_STATE_TTL_SECONDS,
		);

		// Steam ignores the OpenID `state` parameter (it isn't part of OpenID 2.0),
		// so we encode it onto our own return URL as a query string. Steam echoes
		// the entire return_to back, allowing us to recover the cache key.
		const returnUrl = new URL(Config.steam.returnUrl);
		returnUrl.searchParams.set('state', params.state);

		const url = buildSteamOpenIDStartUrl({
			realm: Config.steam.realm,
			returnUrl: returnUrl.toString(),
		});
		return {configured: true, url, state: params.state};
	}

	async completeOpenID(params: {
		cacheService: ICacheService;
		query: URLSearchParams;
	}): Promise<{ok: boolean; redirectTo: string; error?: string}> {
		const state = params.query.get('state') ?? '';
		const cached = state ? await params.cacheService.getAndDelete<CachedOpenIDState>(stateCacheKey(state)) : null;
		if (!cached) {
			return {ok: false, redirectTo: Config.steam.postConnectRedirectUrl, error: 'openid_state_invalid'};
		}

		const steamId = await verifySteamOpenIDCallback(params.query);
		if (!steamId) {
			return {ok: false, redirectTo: sanitizePostConnectRedirect(cached.redirectTo), error: 'openid_verification_failed'};
		}

		const apiKey = Config.steam.apiKey;
		if (!apiKey) {
			return {ok: false, redirectTo: sanitizePostConnectRedirect(cached.redirectTo), error: 'steam_api_key_missing'};
		}

		try {
			const userId = createUserID(BigInt(cached.userId));
			const apiClient = new SteamApiClient(apiKey);
			const summary = await apiClient.getPlayerSummary(steamId);

			// Refuse to relink someone else's account
			const existingForSteamId = await this.repository.getConnectionBySteamId(steamId);
			if (existingForSteamId && existingForSteamId.user_id !== userId) {
				return {
					ok: false,
					redirectTo: sanitizePostConnectRedirect(cached.redirectTo),
					error: 'steam_account_already_linked',
				};
			}

			const previous = await this.repository.getConnection(userId);
			const now = new Date();
			await this.repository.upsertConnection(
				{
					user_id: userId,
					steam_id: steamId,
					persona_name: summary?.personaname ?? steamId,
					profile_url: summary?.profileurl ?? null,
					avatar_url: summary?.avatarfull ?? summary?.avatarmedium ?? summary?.avatar ?? null,
					visibility: summary?.communityvisibilitystate ?? null,
					real_name: summary?.realname ?? null,
					primary_clan_id: summary?.primaryclanid ?? null,
					country_code: summary?.loccountrycode ?? null,
					last_logoff_at: summary?.lastlogoff ? new Date(summary.lastlogoff * 1000) : null,
					connected_at: previous?.connected_at ?? now,
					updated_at: now,
					current_game_id: summary?.gameid ?? null,
					current_game_name: summary?.gameextrainfo ?? null,
					current_game_started_at: summary?.gameid ? now : null,
					persona_state: summary?.personastate ?? null,
					presence_synced_at: now,
					presence_visible: previous?.presence_visible ?? true,
				},
				previous?.steam_id ?? null,
			);

			return {ok: true, redirectTo: sanitizePostConnectRedirect(cached.redirectTo)};
		} catch (error) {
			Logger.warn({error, steamId}, '[Steam] OpenID completion failed');
			return {
				ok: false,
				redirectTo: sanitizePostConnectRedirect(cached.redirectTo),
				error: 'openid_callback_failed',
			};
		}
	}

	async disconnect(userId: UserID): Promise<{ok: boolean}> {
		await this.repository.deleteConnection(userId);
		return {ok: true};
	}

	async refreshFromSteam(userId: UserID): Promise<SteamConnectionResponse | null> {
		const row = await this.repository.getConnection(userId);
		if (!row) return null;
		const apiKey = Config.steam.apiKey;
		if (!apiKey) return rowToConnectionResponse(row);
		const apiClient = new SteamApiClient(apiKey);
		const summary = await apiClient.getPlayerSummary(row.steam_id);
		if (!summary) return rowToConnectionResponse(row);
		const now = new Date();
		// Detect game-start transition: if user wasn't playing before, capture
		// the started_at; if same game continues, keep the original started_at.
		const wasPlayingSame =
			row.current_game_id !== null && row.current_game_id === (summary.gameid ?? null);
		const updated = {
			...row,
			persona_name: summary.personaname ?? row.persona_name,
			profile_url: summary.profileurl ?? row.profile_url,
			avatar_url: summary.avatarfull ?? summary.avatarmedium ?? summary.avatar ?? row.avatar_url,
			visibility: summary.communityvisibilitystate ?? row.visibility,
			real_name: summary.realname ?? row.real_name,
			primary_clan_id: summary.primaryclanid ?? row.primary_clan_id,
			country_code: summary.loccountrycode ?? row.country_code,
			last_logoff_at: summary.lastlogoff ? new Date(summary.lastlogoff * 1000) : row.last_logoff_at,
			updated_at: now,
			current_game_id: summary.gameid ?? null,
			current_game_name: summary.gameextrainfo ?? null,
			current_game_started_at: summary.gameid
				? wasPlayingSame
					? row.current_game_started_at
					: now
				: null,
			persona_state: summary.personastate ?? null,
			presence_synced_at: now,
		};
		await this.repository.upsertConnection(updated, row.steam_id);
		return rowToConnectionResponse(updated);
	}

	async setPresenceVisibility(userId: UserID, visible: boolean): Promise<SteamConnectionResponse | null> {
		const row = await this.repository.getConnection(userId);
		if (!row) return null;
		const updated = {...row, presence_visible: visible, updated_at: new Date()};
		await this.repository.upsertConnection(updated, row.steam_id);
		return rowToConnectionResponse(updated);
	}
}
