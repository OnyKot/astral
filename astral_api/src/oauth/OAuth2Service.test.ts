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

import {createHash} from 'node:crypto';
import {describe, expect, it} from 'vitest';
import {createApplicationID, createUserID} from '~/BrandedTypes';
import type {
	ApplicationRow,
	OAuth2AccessTokenRow,
	OAuth2AuthorizationCodeRow,
	OAuth2RefreshTokenRow,
} from '~/database/types/OAuth2Types';
import {InvalidGrantError} from '~/Errors';
import {Application} from '~/models/Application';
import {OAuth2AccessToken} from '~/models/OAuth2AccessToken';
import {OAuth2AuthorizationCode} from '~/models/OAuth2AuthorizationCode';
import {OAuth2RefreshToken} from '~/models/OAuth2RefreshToken';
import type {IApplicationRepository} from '~/oauth/repositories/IApplicationRepository';
import type {IOAuth2TokenRepository} from '~/oauth/repositories/IOAuth2TokenRepository';
import {OAuth2Service} from './OAuth2Service';

const createPkceChallenge = (verifier: string): string =>
	createHash('sha256').update(verifier, 'utf8').digest('base64url');

class InMemoryApplicationRepository implements IApplicationRepository {
	constructor(private readonly applications: Map<bigint, Application>) {}

	async getApplication(applicationId: ReturnType<typeof createApplicationID>): Promise<Application | null> {
		return this.applications.get(applicationId as bigint) ?? null;
	}

	async listApplicationsByOwner(_ownerUserId: ReturnType<typeof createUserID>): Promise<Array<Application>> {
		return [];
	}

	async upsertApplication(_data: ApplicationRow): Promise<Application> {
		throw new Error('Not implemented in test');
	}

	async deleteApplication(_applicationId: ReturnType<typeof createApplicationID>): Promise<void> {}
}

class InMemoryOAuth2TokenRepository implements IOAuth2TokenRepository {
	private authorizationCodes = new Map<string, OAuth2AuthorizationCodeRow>();
	private accessTokens = new Map<string, OAuth2AccessTokenRow>();
	private refreshTokens = new Map<string, OAuth2RefreshTokenRow>();

	async createAuthorizationCode(data: OAuth2AuthorizationCodeRow): Promise<OAuth2AuthorizationCode> {
		this.authorizationCodes.set(data.code, data);
		return new OAuth2AuthorizationCode(data);
	}

	async getAuthorizationCode(code: string): Promise<OAuth2AuthorizationCode | null> {
		const row = this.authorizationCodes.get(code);
		return row ? new OAuth2AuthorizationCode(row) : null;
	}

	async deleteAuthorizationCode(code: string): Promise<void> {
		this.authorizationCodes.delete(code);
	}

	async createAccessToken(data: OAuth2AccessTokenRow): Promise<OAuth2AccessToken> {
		this.accessTokens.set(data.token_, data);
		return new OAuth2AccessToken(data);
	}

	async getAccessToken(token: string): Promise<OAuth2AccessToken | null> {
		const row = this.accessTokens.get(token);
		return row ? new OAuth2AccessToken(row) : null;
	}

	async deleteAccessToken(token: string, _applicationId: ReturnType<typeof createApplicationID>, _userId: ReturnType<typeof createUserID> | null): Promise<void> {
		this.accessTokens.delete(token);
	}

	async deleteAllAccessTokensForUser(_userId: ReturnType<typeof createUserID>): Promise<void> {}

	async createRefreshToken(data: OAuth2RefreshTokenRow): Promise<OAuth2RefreshToken> {
		this.refreshTokens.set(data.token_, data);
		return new OAuth2RefreshToken(data);
	}

	async getRefreshToken(token: string): Promise<OAuth2RefreshToken | null> {
		const row = this.refreshTokens.get(token);
		return row ? new OAuth2RefreshToken(row) : null;
	}

	async deleteRefreshToken(token: string, _applicationId: ReturnType<typeof createApplicationID>, _userId: ReturnType<typeof createUserID>): Promise<void> {
		this.refreshTokens.delete(token);
	}

	async deleteAllRefreshTokensForUser(_userId: ReturnType<typeof createUserID>): Promise<void> {}

	async listRefreshTokensForUser(_userId: ReturnType<typeof createUserID>): Promise<Array<OAuth2RefreshToken>> {
		return Array.from(this.refreshTokens.values()).map((row) => new OAuth2RefreshToken(row));
	}

	async deleteAllTokensForUserAndApplication(
		_userId: ReturnType<typeof createUserID>,
		_applicationId: ReturnType<typeof createApplicationID>,
	): Promise<void> {}
}

const createTestContext = () => {
	const applicationId = createApplicationID(1001n);
	const secondApplicationId = createApplicationID(1002n);
	const userId = createUserID(2001n);

	const createApplication = (id: ReturnType<typeof createApplicationID>, name: string): Application => {
		const row: ApplicationRow = {
			application_id: id,
			owner_user_id: userId,
			name,
			bot_user_id: null,
			bot_is_public: false,
			oauth2_redirect_uris: new Set(['https://example.com/callback']),
			client_secret_hash: null,
			bot_token_hash: null,
			bot_token_preview: null,
			bot_token_created_at: null,
			client_secret_created_at: null,
			version: 1,
		};
		return new Application(row);
	};

	const applicationRepository = new InMemoryApplicationRepository(
		new Map([
			[applicationId as bigint, createApplication(applicationId, 'PKCE Test App')],
			[secondApplicationId as bigint, createApplication(secondApplicationId, 'Other PKCE App')],
		]),
	);

	const tokenRepository = new InMemoryOAuth2TokenRepository();
	const service = new OAuth2Service({
		userRepository: {
			findUnique: async () => null,
		} as any,
		applicationRepository,
		oauth2TokenRepository: tokenRepository,
	});

	return {
		applicationId,
		secondApplicationId,
		userId,
		service,
	};
};

const issueAuthorizationCode = async (service: OAuth2Service, clientId: string, verifier: string) => {
	const redirectTo = await service.authorizeAndConsent({
		clientId,
		redirectUri: 'https://example.com/callback',
		scope: 'identify email',
		state: 'pkce-state',
		codeChallenge: createPkceChallenge(verifier),
		codeChallengeMethod: 'S256',
		responseType: 'code',
		userId: createUserID(2001n),
	});

	return new URL(redirectTo.redirectTo).searchParams.get('code')!;
};

describe('OAuth2Service PKCE enforcement', () => {
	it('rejects authorization-code exchange when PKCE verifier is missing', async () => {
		const {applicationId, service} = createTestContext();
		const code = await issueAuthorizationCode(service, applicationId.toString(), 'wKwK_j0LtPrNQDPWFoHlGVLMqclyoWc1fL7CnkApFQQ');

		await expect(
			service.tokenExchange({
				grantType: 'authorization_code',
				clientId: applicationId.toString(),
				clientSecret: 'test-secret',
				code,
				redirectUri: 'https://example.com/callback',
			}),
		).rejects.toBeInstanceOf(InvalidGrantError);
	});

	it('rejects authorization-code exchange when PKCE verifier is incorrect', async () => {
		const {applicationId, service} = createTestContext();
		const code = await issueAuthorizationCode(service, applicationId.toString(), 'wKwK_j0LtPrNQDPWFoHlGVLMqclyoWc1fL7CnkApFQQ');

		await expect(
			service.tokenExchange({
				grantType: 'authorization_code',
				clientId: applicationId.toString(),
				clientSecret: 'test-secret',
				code,
				redirectUri: 'https://example.com/callback',
				codeVerifier: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
			}),
		).rejects.toBeInstanceOf(InvalidGrantError);
	});

	it('accepts authorization-code exchange when PKCE verifier is correct', async () => {
		const {applicationId, service} = createTestContext();
		const verifier = 'wKwK_j0LtPrNQDPWFoHlGVLMqclyoWc1fL7CnkApFQQ';
		const code = await issueAuthorizationCode(service, applicationId.toString(), verifier);

		const tokenResponse = await service.tokenExchange({
			grantType: 'authorization_code',
			clientId: applicationId.toString(),
			clientSecret: 'test-secret',
			code,
			redirectUri: 'https://example.com/callback',
			codeVerifier: verifier,
		});

		expect(tokenResponse.access_token).toBeTruthy();
		expect(tokenResponse.refresh_token).toBeTruthy();
		expect(tokenResponse.token_type).toBe('Bearer');
	});

	it('keeps authorization codes single-use after a successful PKCE exchange', async () => {
		const {applicationId, service} = createTestContext();
		const verifier = 'wKwK_j0LtPrNQDPWFoHlGVLMqclyoWc1fL7CnkApFQQ';
		const code = await issueAuthorizationCode(service, applicationId.toString(), verifier);

		await service.tokenExchange({
			grantType: 'authorization_code',
			clientId: applicationId.toString(),
			clientSecret: 'test-secret',
			code,
			redirectUri: 'https://example.com/callback',
			codeVerifier: verifier,
		});

		await expect(
			service.tokenExchange({
				grantType: 'authorization_code',
				clientId: applicationId.toString(),
				clientSecret: 'test-secret',
				code,
				redirectUri: 'https://example.com/callback',
				codeVerifier: verifier,
			}),
		).rejects.toBeInstanceOf(InvalidGrantError);
	});

	it('rejects redirect URI mismatch for PKCE-protected authorization codes', async () => {
		const {applicationId, service} = createTestContext();
		const verifier = 'wKwK_j0LtPrNQDPWFoHlGVLMqclyoWc1fL7CnkApFQQ';
		const code = await issueAuthorizationCode(service, applicationId.toString(), verifier);

		await expect(
			service.tokenExchange({
				grantType: 'authorization_code',
				clientId: applicationId.toString(),
				clientSecret: 'test-secret',
				code,
				redirectUri: 'https://example.com/other',
				codeVerifier: verifier,
			}),
		).rejects.toBeInstanceOf(InvalidGrantError);
	});

	it('rejects cross-client redemption for PKCE-protected authorization codes', async () => {
		const {applicationId, secondApplicationId, service} = createTestContext();
		const verifier = 'wKwK_j0LtPrNQDPWFoHlGVLMqclyoWc1fL7CnkApFQQ';
		const code = await issueAuthorizationCode(service, applicationId.toString(), verifier);

		await expect(
			service.tokenExchange({
				grantType: 'authorization_code',
				clientId: secondApplicationId.toString(),
				clientSecret: 'test-secret',
				code,
				redirectUri: 'https://example.com/callback',
				codeVerifier: verifier,
			}),
		).rejects.toBeInstanceOf(InvalidGrantError);
	});
});
