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

import {jwtVerify, SignJWT} from 'jose';
import {Config} from '~/Config';

export const MUSIC_SESSION_COOKIE_NAME = 'session.gleam';
export const MUSIC_OAUTH_STATE_COOKIE_NAME = 'astramusic.oauth_state';
export const MUSIC_SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;
export const MUSIC_OAUTH_STATE_TTL_SECONDS = 15 * 60;

interface MusicSessionPayload {
	type: 'music_session';
	userId: string;
	sessionToken: string;
}

export class MusicSessionCookieService {
	private readonly secret: Uint8Array;

	constructor() {
		this.secret = new TextEncoder().encode(Config.auth.sudoModeSecret);
	}

	async createCookieValue(params: {userId: string; sessionToken: string}): Promise<string> {
		const now = Math.floor(Date.now() / 1000);

		return new SignJWT({
			type: 'music_session',
			userId: params.userId,
			sessionToken: params.sessionToken,
		} satisfies MusicSessionPayload)
			.setProtectedHeader({alg: 'HS256'})
			.setSubject(params.userId)
			.setIssuedAt(now)
			.setExpirationTime(now + MUSIC_SESSION_TTL_SECONDS)
			.sign(this.secret);
	}

	async verifyCookieValue(token: string): Promise<MusicSessionPayload | null> {
		try {
			const {payload} = await jwtVerify(token, this.secret, {
				algorithms: ['HS256'],
			});

			if (payload.type !== 'music_session') {
				return null;
			}

			if (typeof payload.sub !== 'string' || typeof payload.userId !== 'string' || typeof payload.sessionToken !== 'string') {
				return null;
			}

			if (payload.sub !== payload.userId) {
				return null;
			}

			return {
				type: 'music_session',
				userId: payload.userId,
				sessionToken: payload.sessionToken,
			};
		} catch {
			return null;
		}
	}
}

let musicSessionCookieServiceInstance: MusicSessionCookieService | null = null;

export function getMusicSessionCookieService(): MusicSessionCookieService {
	if (!musicSessionCookieServiceInstance) {
		musicSessionCookieServiceInstance = new MusicSessionCookieService();
	}

	return musicSessionCookieServiceInstance;
}
