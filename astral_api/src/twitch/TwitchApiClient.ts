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

import {Config} from '~/Config';
import {InputValidationError} from '~/Errors';
import {Logger} from '~/Logger';

const TWITCH_IDENTITY_BASE_URL = 'https://id.twitch.tv/oauth2';
const TWITCH_HELIX_BASE_URL = 'https://api.twitch.tv/helix';
const TOKEN_REFRESH_MARGIN_MS = 60_000;

export interface TwitchTokenResponse {
	access_token: string;
	refresh_token?: string;
	expires_in?: number;
	scope?: Array<string>;
	token_type: string;
}

export interface TwitchUser {
	id: string;
	login: string;
	display_name: string;
	profile_image_url?: string;
}

interface TwitchUsersResponse {
	data?: Array<TwitchUser>;
}

interface TwitchEventSubCreateResponse {
	data?: Array<{
		id: string;
		status: string;
		type: string;
		version: string;
		condition: Record<string, string>;
		created_at: string;
	}>;
}

interface TwitchSubscriptionsResponse {
	data?: Array<{
		broadcaster_id: string;
		gifter_id?: string;
		is_gift?: boolean;
		tier: string;
		user_id: string;
	}>;
}

interface AppTokenCache {
	accessToken: string;
	expiresAt: number;
}

function requireTwitchCredentials(): {clientId: string; clientSecret: string} {
	if (!Config.twitch.enabled || !Config.twitch.clientId || !Config.twitch.clientSecret) {
		throw InputValidationError.create('twitch', 'Twitch integration is not configured.');
	}
	return {
		clientId: Config.twitch.clientId,
		clientSecret: Config.twitch.clientSecret,
	};
}

async function readJsonResponse<T>(response: Response): Promise<T> {
	const text = await response.text();
	if (!text) return {} as T;
	try {
		return JSON.parse(text) as T;
	} catch {
		return {message: text} as T;
	}
}

export class TwitchApiClient {
	private appToken: AppTokenCache | null = null;

	isConfigured(): boolean {
		return Boolean(Config.twitch.enabled && Config.twitch.clientId && Config.twitch.clientSecret);
	}

	buildAuthorizeUrl(params: {state: string; intent: 'viewer' | 'creator'; scopes: Array<string>}): string {
		const {clientId} = requireTwitchCredentials();
		const url = new URL(`${TWITCH_IDENTITY_BASE_URL}/authorize`);
		url.searchParams.set('response_type', 'code');
		url.searchParams.set('client_id', clientId);
		url.searchParams.set('redirect_uri', Config.twitch.redirectUri);
		url.searchParams.set('scope', params.scopes.join(' '));
		url.searchParams.set('state', params.state);
		url.searchParams.set('force_verify', params.intent === 'creator' ? 'true' : 'false');
		return url.toString();
	}

	async exchangeCode(code: string): Promise<TwitchTokenResponse> {
		const {clientId, clientSecret} = requireTwitchCredentials();
		const body = new URLSearchParams({
			client_id: clientId,
			client_secret: clientSecret,
			code,
			grant_type: 'authorization_code',
			redirect_uri: Config.twitch.redirectUri,
		});
		return this.postToken(body, 'authorization_code');
	}

	async refreshToken(refreshToken: string): Promise<TwitchTokenResponse> {
		const {clientId, clientSecret} = requireTwitchCredentials();
		const body = new URLSearchParams({
			client_id: clientId,
			client_secret: clientSecret,
			grant_type: 'refresh_token',
			refresh_token: refreshToken,
		});
		return this.postToken(body, 'refresh_token');
	}

	async getAppAccessToken(): Promise<string> {
		const now = Date.now();
		if (this.appToken && this.appToken.expiresAt > now + TOKEN_REFRESH_MARGIN_MS) {
			return this.appToken.accessToken;
		}

		const {clientId, clientSecret} = requireTwitchCredentials();
		const body = new URLSearchParams({
			client_id: clientId,
			client_secret: clientSecret,
			grant_type: 'client_credentials',
		});
		const token = await this.postToken(body, 'client_credentials');
		this.appToken = {
			accessToken: token.access_token,
			expiresAt: now + (token.expires_in ?? 3600) * 1000,
		};
		return token.access_token;
	}

	async getCurrentUser(accessToken: string): Promise<TwitchUser> {
		const response = await this.helix<TwitchUsersResponse>('/users', accessToken);
		const [user] = response.data ?? [];
		if (!user) throw InputValidationError.create('twitch', 'Twitch did not return a user profile.');
		return user;
	}

	async getUserByLogin(login: string): Promise<TwitchUser | null> {
		const appToken = await this.getAppAccessToken();
		const query = new URLSearchParams({login});
		const response = await this.helix<TwitchUsersResponse>(`/users?${query.toString()}`, appToken);
		return response.data?.[0] ?? null;
	}

	async createEventSubSubscription(params: {
		eventType: string;
		version: string;
		condition: Record<string, string>;
	}): Promise<{id: string; status: string; type: string; version: string; condition: Record<string, string>; createdAt: Date}> {
		const appToken = await this.getAppAccessToken();
		const payload = {
			type: params.eventType,
			version: params.version,
			condition: params.condition,
			transport: {
				method: 'webhook',
				callback: Config.twitch.eventSubCallbackUrl,
				secret: Config.twitch.eventSubSecret,
			},
		};
		const response = await this.helix<TwitchEventSubCreateResponse>('/eventsub/subscriptions', appToken, {
			method: 'POST',
			body: JSON.stringify(payload),
		});
		const [subscription] = response.data ?? [];
		if (!subscription) {
			throw InputValidationError.create('twitch', 'Twitch EventSub did not return a subscription.');
		}
		return {
			id: subscription.id,
			status: subscription.status,
			type: subscription.type,
			version: subscription.version,
			condition: subscription.condition,
			createdAt: new Date(subscription.created_at),
		};
	}

	async getBroadcasterSubscription(
		creatorAccessToken: string,
		broadcasterUserId: string,
		viewerUserId: string,
	): Promise<{tier: string; isGift: boolean} | null> {
		const query = new URLSearchParams({
			broadcaster_id: broadcasterUserId,
			user_id: viewerUserId,
		});
		const response = await this.helix<TwitchSubscriptionsResponse>(`/subscriptions?${query.toString()}`, creatorAccessToken);
		const [subscription] = response.data ?? [];
		if (!subscription) return null;
		return {
			tier: subscription.tier,
			isGift: Boolean(subscription.is_gift || subscription.gifter_id),
		};
	}

	private async postToken(body: URLSearchParams, grantType: string): Promise<TwitchTokenResponse> {
		const response = await fetch(`${TWITCH_IDENTITY_BASE_URL}/token`, {
			method: 'POST',
			headers: {
				Accept: 'application/json',
				'Content-Type': 'application/x-www-form-urlencoded',
			},
			body,
		});
		const json = await readJsonResponse<TwitchTokenResponse & {message?: string}>(response);
		if (!response.ok || !json.access_token) {
			Logger.warn({grantType, status: response.status, body: json}, 'Twitch token request failed');
			throw InputValidationError.create('twitch', 'Twitch authorization failed.');
		}
		return json;
	}

	private async helix<T>(path: string, accessToken: string, init: RequestInit = {}): Promise<T> {
		const {clientId} = requireTwitchCredentials();
		const response = await fetch(`${TWITCH_HELIX_BASE_URL}${path}`, {
			...init,
			headers: {
				Accept: 'application/json',
				Authorization: `Bearer ${accessToken}`,
				'Client-Id': clientId,
				...(init.body ? {'Content-Type': 'application/json'} : {}),
				...(init.headers ?? {}),
			},
		});
		const json = await readJsonResponse<T & {message?: string; error?: string}>(response);
		if (!response.ok) {
			Logger.warn({path, status: response.status, body: json}, 'Twitch Helix request failed');
			throw InputValidationError.create('twitch', 'Twitch API request failed.');
		}
		return json;
	}
}
