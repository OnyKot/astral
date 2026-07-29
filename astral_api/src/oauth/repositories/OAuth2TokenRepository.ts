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

import type {ApplicationID, UserID} from '~/BrandedTypes';
import {BatchBuilder, deleteOneOrMany, fetchMany, fetchManyInChunks, fetchOne, upsertOne} from '~/database/Cassandra';
import type {
	OAuth2AccessTokenByUserRow,
	OAuth2AccessTokenRow,
	OAuth2AuthorizationCodeRow,
	OAuth2RefreshTokenByUserRow,
	OAuth2RefreshTokenRow,
} from '~/database/types/OAuth2Types';
import {OAuth2AccessToken} from '~/models/OAuth2AccessToken';
import {OAuth2AuthorizationCode} from '~/models/OAuth2AuthorizationCode';
import {OAuth2RefreshToken} from '~/models/OAuth2RefreshToken';
import {ACCESS_TOKEN_TTL_SECONDS} from '~/oauth/OAuth2Service';
import {
	OAuth2AccessTokens,
	OAuth2AccessTokensByUser,
	OAuth2AuthorizationCodes,
	OAuth2RefreshTokens,
	OAuth2RefreshTokensByUser,
} from '~/Tables';
import type {IOAuth2TokenRepository} from './IOAuth2TokenRepository';

const SELECT_AUTHORIZATION_CODE = OAuth2AuthorizationCodes.selectCql({
	where: OAuth2AuthorizationCodes.where.eq('code'),
});

const SELECT_ACCESS_TOKEN = OAuth2AccessTokens.selectCql({
	where: OAuth2AccessTokens.where.eq('token_'),
});

const SELECT_ACCESS_TOKENS_BY_USER = OAuth2AccessTokensByUser.selectCql({
	columns: ['token_'],
	where: OAuth2AccessTokensByUser.where.eq('user_id'),
});

const SELECT_REFRESH_TOKEN = OAuth2RefreshTokens.selectCql({
	where: OAuth2RefreshTokens.where.eq('token_'),
});

const SELECT_REFRESH_TOKENS_BY_IDS = OAuth2RefreshTokens.selectCql({
	where: OAuth2RefreshTokens.where.in('token_', 'tokens'),
});

const SELECT_ACCESS_TOKENS_BY_IDS = OAuth2AccessTokens.selectCql({
	where: OAuth2AccessTokens.where.in('token_', 'tokens'),
});

const SELECT_REFRESH_TOKENS_BY_USER = OAuth2RefreshTokensByUser.selectCql({
	columns: ['token_'],
	where: OAuth2RefreshTokensByUser.where.eq('user_id'),
});

export class OAuth2TokenRepository implements IOAuth2TokenRepository {
	async createAuthorizationCode(data: OAuth2AuthorizationCodeRow): Promise<OAuth2AuthorizationCode> {
		await upsertOne(OAuth2AuthorizationCodes.insert(data));
		return new OAuth2AuthorizationCode(data);
	}

	async getAuthorizationCode(code: string): Promise<OAuth2AuthorizationCode | null> {
		const row = await fetchOne<OAuth2AuthorizationCodeRow>(SELECT_AUTHORIZATION_CODE, {code});
		return row ? new OAuth2AuthorizationCode(row) : null;
	}

	async deleteAuthorizationCode(code: string): Promise<void> {
		await deleteOneOrMany(OAuth2AuthorizationCodes.deleteByPk({code}));
	}

	async createAccessToken(data: OAuth2AccessTokenRow): Promise<OAuth2AccessToken> {
		const batch = new BatchBuilder();
		batch.addPrepared(OAuth2AccessTokens.insert(data));

		if (data.user_id !== null) {
			batch.addPrepared(
				OAuth2AccessTokensByUser.insert({
					user_id: data.user_id,
					token_: data.token_,
				}),
			);
		}

		await batch.execute();
		return new OAuth2AccessToken(data);
	}

	async getAccessToken(token: string): Promise<OAuth2AccessToken | null> {
		const row = await fetchOne<OAuth2AccessTokenRow>(SELECT_ACCESS_TOKEN, {token_: token});
		if (!row) return null;

		/*
		 * Expiry was enforced by the row's TTL alone, which is a storage detail and not the lifetime
		 * the token was issued with: `default_time_to_live` only applies to writes made after it was
		 * last changed, and a row re-inserted by a repair or restored from a backup comes back with
		 * whatever TTL it was written with. Everything the server tells clients about the lifetime
		 * (`expires_in`, the `exp` of introspect, /oauth2/@me) is created_at + ACCESS_TOKEN_TTL_SECONDS,
		 * so enforce exactly that here. Absent rather than an error because every caller already
		 * treats null as an invalid token.
		 *
		 * Read at call time on purpose: OAuth2Service imports this module, so touching the constant at
		 * module scope would hit its temporal dead zone on one of the two import orders.
		 */
		if (Date.now() >= row.created_at.getTime() + ACCESS_TOKEN_TTL_SECONDS * 1000) return null;

		return new OAuth2AccessToken(row);
	}

	async deleteAccessToken(token: string, _applicationId: ApplicationID, userId: UserID | null): Promise<void> {
		const batch = new BatchBuilder();
		batch.addPrepared(OAuth2AccessTokens.deleteByPk({token_: token}));

		if (userId !== null) {
			batch.addPrepared(OAuth2AccessTokensByUser.deleteByPk({user_id: userId, token_: token}));
		}

		await batch.execute();
	}

	async deleteAllAccessTokensForUser(userId: UserID): Promise<void> {
		const tokens = await fetchMany<OAuth2AccessTokenByUserRow>(SELECT_ACCESS_TOKENS_BY_USER, {
			user_id: userId,
		});

		if (tokens.length === 0) {
			return;
		}

		const batch = new BatchBuilder();
		for (const tokenRow of tokens) {
			batch.addPrepared(OAuth2AccessTokens.deleteByPk({token_: tokenRow.token_}));
			batch.addPrepared(OAuth2AccessTokensByUser.deleteByPk({user_id: userId, token_: tokenRow.token_}));
		}
		await batch.execute();
	}

	async createRefreshToken(data: OAuth2RefreshTokenRow): Promise<OAuth2RefreshToken> {
		const batch = new BatchBuilder();
		batch.addPrepared(OAuth2RefreshTokens.insert(data));
		batch.addPrepared(
			OAuth2RefreshTokensByUser.insert({
				user_id: data.user_id,
				token_: data.token_,
			}),
		);
		await batch.execute();
		return new OAuth2RefreshToken(data);
	}

	async getRefreshToken(token: string): Promise<OAuth2RefreshToken | null> {
		const row = await fetchOne<OAuth2RefreshTokenRow>(SELECT_REFRESH_TOKEN, {token_: token});
		return row ? new OAuth2RefreshToken(row) : null;
	}

	async deleteRefreshToken(token: string, _applicationId: ApplicationID, userId: UserID): Promise<void> {
		const batch = new BatchBuilder();
		batch.addPrepared(OAuth2RefreshTokens.deleteByPk({token_: token}));
		batch.addPrepared(OAuth2RefreshTokensByUser.deleteByPk({user_id: userId, token_: token}));
		await batch.execute();
	}

	async deleteAllRefreshTokensForUser(userId: UserID): Promise<void> {
		const tokens = await fetchMany<OAuth2RefreshTokenByUserRow>(SELECT_REFRESH_TOKENS_BY_USER, {
			user_id: userId,
		});

		if (tokens.length === 0) {
			return;
		}

		const batch = new BatchBuilder();
		for (const tokenRow of tokens) {
			batch.addPrepared(OAuth2RefreshTokens.deleteByPk({token_: tokenRow.token_}));
			batch.addPrepared(OAuth2RefreshTokensByUser.deleteByPk({user_id: userId, token_: tokenRow.token_}));
		}
		await batch.execute();
	}

	async listRefreshTokensForUser(userId: UserID): Promise<Array<OAuth2RefreshToken>> {
		const tokenRefs = await fetchMany<OAuth2RefreshTokenByUserRow>(SELECT_REFRESH_TOKENS_BY_USER, {
			user_id: userId,
		});

		if (tokenRefs.length === 0) {
			return [];
		}

		const rows = await fetchManyInChunks<OAuth2RefreshTokenRow>(
			SELECT_REFRESH_TOKENS_BY_IDS,
			tokenRefs.map((tokenRef) => tokenRef.token_),
			(chunk) => ({tokens: chunk}),
		);
		return rows.map((row) => new OAuth2RefreshToken(row));
	}

	async deleteAllTokensForUserAndApplication(userId: UserID, applicationId: ApplicationID): Promise<void> {
		const accessTokenRefs = await fetchMany<OAuth2AccessTokenByUserRow>(SELECT_ACCESS_TOKENS_BY_USER, {
			user_id: userId,
		});
		const refreshTokenRefs = await fetchMany<OAuth2RefreshTokenByUserRow>(SELECT_REFRESH_TOKENS_BY_USER, {
			user_id: userId,
		});

		const [accessRows, refreshRows] = await Promise.all([
			accessTokenRefs.length === 0
				? Promise.resolve([] as Array<OAuth2AccessTokenRow>)
				: fetchManyInChunks<OAuth2AccessTokenRow>(
						SELECT_ACCESS_TOKENS_BY_IDS,
						accessTokenRefs.map((tokenRef) => tokenRef.token_),
						(chunk) => ({tokens: chunk}),
					),
			refreshTokenRefs.length === 0
				? Promise.resolve([] as Array<OAuth2RefreshTokenRow>)
				: fetchManyInChunks<OAuth2RefreshTokenRow>(
						SELECT_REFRESH_TOKENS_BY_IDS,
						refreshTokenRefs.map((tokenRef) => tokenRef.token_),
						(chunk) => ({tokens: chunk}),
					),
		]);

		const batch = new BatchBuilder();

		for (const row of accessRows) {
			if (row.application_id === applicationId) {
				batch.addPrepared(OAuth2AccessTokens.deleteByPk({token_: row.token_}));
				batch.addPrepared(OAuth2AccessTokensByUser.deleteByPk({user_id: userId, token_: row.token_}));
			}
		}

		for (const row of refreshRows) {
			if (row.application_id === applicationId) {
				batch.addPrepared(OAuth2RefreshTokens.deleteByPk({token_: row.token_}));
				batch.addPrepared(OAuth2RefreshTokensByUser.deleteByPk({user_id: userId, token_: row.token_}));
			}
		}

		await batch.execute();
	}
}
