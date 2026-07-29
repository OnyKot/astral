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

const STEAM_OPENID_ENDPOINT = 'https://steamcommunity.com/openid/login';
const STEAM_CLAIMED_ID_PREFIX = 'https://steamcommunity.com/openid/id/';

export interface SteamOpenIDStartParams {
	realm: string;
	returnUrl: string;
}

/**
 * Build the URL we redirect the user to so they can authenticate with Steam.
 *
 * Steam still uses OpenID 2.0 (not OAuth) — the user is sent to
 * https://steamcommunity.com/openid/login with a fixed set of params,
 * and Steam later redirects the user back to `returnUrl` carrying
 * `openid.claimed_id=https://steamcommunity.com/openid/id/<steamID64>`
 * plus signature parameters that we then verify server-side.
 */
export function buildSteamOpenIDStartUrl(params: SteamOpenIDStartParams): string {
	const u = new URL(STEAM_OPENID_ENDPOINT);
	u.searchParams.set('openid.ns', 'http://specs.openid.net/auth/2.0');
	u.searchParams.set('openid.mode', 'checkid_setup');
	u.searchParams.set('openid.return_to', params.returnUrl);
	u.searchParams.set('openid.realm', params.realm);
	u.searchParams.set('openid.identity', 'http://specs.openid.net/auth/2.0/identifier_select');
	u.searchParams.set('openid.claimed_id', 'http://specs.openid.net/auth/2.0/identifier_select');
	return u.toString();
}

/**
 * Verify an OpenID 2.0 callback response from Steam.
 *
 * Returns the resolved 64-bit Steam id on success, or null on any failure
 * (signature mismatch, malformed claimed_id, network error, etc.).
 *
 * The verification protocol is RFC 8252 / OpenID 2.0 §11:
 *   - Replay every openid.* parameter from the user's callback back to
 *     Steam, replacing only `openid.mode` with `check_authentication`.
 *   - Steam responds with `is_valid:true` if the assertion is genuine.
 */
export async function verifySteamOpenIDCallback(query: URLSearchParams): Promise<string | null> {
	const claimedId = query.get('openid.claimed_id') ?? '';
	if (!claimedId.startsWith(STEAM_CLAIMED_ID_PREFIX)) {
		Logger.warn({claimedId}, '[Steam] OpenID callback: invalid claimed_id prefix');
		return null;
	}
	const steamId = claimedId.slice(STEAM_CLAIMED_ID_PREFIX.length);
	if (!/^\d{17}$/.test(steamId)) {
		Logger.warn({steamId}, '[Steam] OpenID callback: claimed_id is not a 64-bit numeric Steam id');
		return null;
	}

	const verifyParams = new URLSearchParams();
	for (const [k, v] of query.entries()) {
		if (k.startsWith('openid.')) verifyParams.set(k, v);
	}
	verifyParams.set('openid.mode', 'check_authentication');

	let response: Response;
	try {
		response = await fetch(STEAM_OPENID_ENDPOINT, {
			method: 'POST',
			headers: {'Content-Type': 'application/x-www-form-urlencoded'},
			body: verifyParams.toString(),
		});
	} catch (error) {
		Logger.warn({error}, '[Steam] OpenID verify network error');
		return null;
	}
	if (!response.ok) {
		Logger.warn({status: response.status}, '[Steam] OpenID verify non-2xx');
		return null;
	}
	const body = await response.text();
	const isValid = /is_valid\s*:\s*true/i.test(body);
	if (!isValid) {
		Logger.warn({body}, '[Steam] OpenID verify rejected assertion');
		return null;
	}
	return steamId;
}
