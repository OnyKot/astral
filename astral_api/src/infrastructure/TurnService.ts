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
import {Config} from '~/Config';
import {getMetricsService} from '~/infrastructure/MetricsService';
import {Logger} from '~/Logger';
import {lookupGeoip} from '~/utils/IpUtils';

export interface IceServer {
	urls: Array<string>;
	username?: string;
	credential?: string;
}

interface CloudflareIceServerResponse {
	urls: Array<string>;
	username?: string;
	credential?: string;
}

interface CloudflareResponse {
	iceServers?: Array<CloudflareIceServerResponse>;
}

interface CacheEntry {
	iceServers: Array<IceServer>;
	expiresAt: number;
}

const CLOUDFLARE_TURN_ENDPOINT = 'https://rtc.live.cloudflare.com/v1/turn/keys';
// Refresh a bit before the real expiry so a reconnecting call never lands
// on credentials that just expired server-side.
const EXPIRY_SAFETY_MARGIN_MS = 60 * 1000;
// Port 53 is blocked by Chrome/Firefox and times out without trickle ICE
// (Cloudflare's own note). Filter it from the URLs we hand the client.
const PORT_53_URL_PATTERN = /:53\b/;

/**
 * Generates short-lived Cloudflare Realtime TURN credentials for voice
 * participants, gated by GeoIP so users in excluded countries (RU by
 * default) keep the default LiveKit ICE path. The Cloudflare API token is
 * a server-side secret and is never exposed to the client.
 *
 * Fail-open: any Cloudflare API or GeoIP error returns null, so voice
 * still works via LiveKit's default ICE — TURN is an enhancement, not a
 * hard dependency.
 */
export class TurnService {
	private readonly cache = new Map<string, CacheEntry>();
	private readonly inFlight = new Map<string, Promise<Array<IceServer> | null>>();

	/**
	 * Returns the `iceServers` payload to attach to a voice token response,
	 * or null when TURN is disabled, the user is in an excluded country, or
	 * credential generation failed. Never throws.
	 */
	async getIceServersForUser(userId: UserID, ip: string | undefined): Promise<Array<IceServer> | null> {
		const {turn} = Config.voice;
		if (!turn.enabled || !turn.keyId || !turn.apiToken) {
			return null;
		}

		// GeoIP gate only matters when there are excluded countries. When
		// the exclusion list is empty (TURN offered to everyone) we skip the
		// lookup entirely, so a missing client IP from the gateway doesn't
		// silently disable TURN for every call.
		if (turn.excludedCountries.length > 0) {
			if (!ip) {
				Logger.warn({context: 'turn', reason: 'ip_missing'}, 'TURN: no client IP, skipping');
				return null;
			}

			try {
				const geoip = await lookupGeoip(ip);
				const countryCode = geoip.countryCode?.toUpperCase();
				if (countryCode && turn.excludedCountries.includes(countryCode)) {
					getMetricsService().counter({
						name: 'turn_credentials_total',
						dimensions: {result: 'excluded', country: countryCode},
					});
					return null;
				}
			} catch (error) {
				Logger.warn({error, ip, context: 'turn'}, 'TURN: GeoIP lookup failed, failing open');
				return null;
			}
		}

		const cacheKey = userId.toString();
		const now = Date.now();
		const cached = this.cache.get(cacheKey);
		if (cached && cached.expiresAt > now) {
			getMetricsService().counter({
				name: 'turn_credentials_total',
				dimensions: {result: 'cache_hit'},
			});
			return cached.iceServers;
		}

		// Coalesce concurrent requests for the same user so a rapid
		// reconnect doesn't fire multiple Cloudflare calls.
		const existing = this.inFlight.get(cacheKey);
		if (existing) {
			return existing;
		}

		const promise = this.generateIceServers(cacheKey);
		this.inFlight.set(cacheKey, promise);
		try {
			return await promise;
		} finally {
			this.inFlight.delete(cacheKey);
		}
	}

	private async generateIceServers(cacheKey: string): Promise<Array<IceServer> | null> {
		const {turn} = Config.voice;
		const url = `${CLOUDFLARE_TURN_ENDPOINT}/${turn.keyId}/credentials/generate-ice-servers`;

		try {
			const response = await fetch(url, {
				method: 'POST',
				headers: {
					Authorization: `Bearer ${turn.apiToken}`,
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({ttl: turn.ttlSeconds}),
			});

			if (!response.ok) {
				const body = await response.text().catch(() => '');
				Logger.warn(
					{status: response.status, body: body.slice(0, 200), context: 'turn'},
					'TURN: Cloudflare API non-2xx, failing open',
				);
				getMetricsService().counter({
					name: 'turn_credentials_total',
					dimensions: {result: 'error', status: String(response.status)},
				});
				return null;
			}

			const data = (await response.json()) as CloudflareResponse;
			const raw = Array.isArray(data.iceServers) ? data.iceServers : [];
			const iceServers = this.sanitizeIceServers(raw);

			if (iceServers.length === 0) {
				Logger.warn({context: 'turn'}, 'TURN: Cloudflare returned no usable iceServers');
				getMetricsService().counter({
					name: 'turn_credentials_total',
					dimensions: {result: 'empty'},
				});
				return null;
			}

			const expiresAt = Date.now() + turn.ttlSeconds * 1000 - EXPIRY_SAFETY_MARGIN_MS;
			this.cache.set(cacheKey, {iceServers, expiresAt});
			getMetricsService().counter({
				name: 'turn_credentials_total',
				dimensions: {result: 'ok'},
			});
			return iceServers;
		} catch (error) {
			Logger.warn({error, context: 'turn'}, 'TURN: Cloudflare request failed, failing open');
			getMetricsService().counter({
				name: 'turn_credentials_total',
				dimensions: {result: 'error', status: 'exception'},
			});
			return null;
		}
	}

	private sanitizeIceServers(raw: Array<CloudflareIceServerResponse>): Array<IceServer> {
		const sanitized: Array<IceServer> = [];
		for (const server of raw) {
			const urls = Array.isArray(server.urls) ? server.urls.filter((url) => !PORT_53_URL_PATTERN.test(url)) : [];
			if (urls.length === 0) {
				continue;
			}
			sanitized.push({
				urls,
				...(server.username ? {username: server.username} : {}),
				...(server.credential ? {credential: server.credential} : {}),
			});
		}
		return sanitized;
	}
}
