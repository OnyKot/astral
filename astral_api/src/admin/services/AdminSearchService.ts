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

import {mapGuildToAdminResponse, mapUserToAdminResponse} from '~/admin/AdminModel';
import {createGuildID, createUserID, type GuildID, type UserID} from '~/BrandedTypes';
import type {IGuildRepository} from '~/guild/IGuildRepository';
import type {ICacheService} from '~/infrastructure/ICacheService';
import type {SnowflakeService} from '~/infrastructure/SnowflakeService';
import {Logger} from '~/Logger';
import {getGuildSearchService, getUserSearchService} from '~/Meilisearch';
import type {Guild, User} from '~/Models';
import type {IUserRepository} from '~/user/IUserRepository';
import type {IWorkerService} from '~/worker/IWorkerService';
import type {AdminAuditService} from './AdminAuditService';

interface RefreshSearchIndexJobPayload {
	index_type: 'guilds' | 'users' | 'reports' | 'audit_logs' | 'channel_messages' | 'favorite_memes';
	admin_user_id: string;
	audit_log_reason: string | null;
	job_id: string;
	guild_id?: string;
	user_id?: string;
}

interface AdminSearchServiceDeps {
	guildRepository: IGuildRepository;
	userRepository: IUserRepository;
	workerService: IWorkerService;
	cacheService: ICacheService;
	snowflakeService: SnowflakeService;
	auditService: AdminAuditService;
}

export class AdminSearchService {
	constructor(private readonly deps: AdminSearchServiceDeps) {}

	async searchGuilds(data: {query?: string; limit: number; offset: number}) {
		const {guildRepository} = this.deps;
		Logger.debug(
			{query: data.query, limit: data.limit, offset: data.offset},
			'[AdminSearchService] searchGuilds called',
		);

		const guildSearchService = getGuildSearchService();
		if (!guildSearchService) {
			Logger.warn('[AdminSearchService] searchGuilds - Search service not enabled, using exact-match fallback');
			return await this.searchGuildsFallback(data);
		}

		try {
			Logger.debug('[AdminSearchService] searchGuilds - Calling Meilisearch');
			const {hits, total} = await guildSearchService.searchGuilds(
				data.query || '',
				{},
				{
					limit: data.limit,
					offset: data.offset,
				},
			);

			const guildIds = hits.map((hit) => createGuildID(BigInt(hit.id)));
			Logger.debug(
				{guild_ids: guildIds.map((id) => id.toString())},
				'[AdminSearchService] searchGuilds - Fetching from DB',
			);

			const guilds = await guildRepository.listGuilds(guildIds);
			Logger.debug({guilds_count: guilds.length}, '[AdminSearchService] searchGuilds - Got guilds from DB');

			const response = guilds.map((guild) => mapGuildToAdminResponse(guild));
			Logger.debug({response_count: response.length}, '[AdminSearchService] searchGuilds - Mapped to response');

			return {
				guilds: response,
				total,
			};
		} catch (error) {
			Logger.error({error}, '[AdminSearchService] searchGuilds - Search failed');
			return await this.searchGuildsFallback(data);
		}
	}

	async searchUsers(data: {
		query?: string;
		email_verified?: boolean;
		has_premium?: boolean;
		is_bot?: boolean;
		limit: number;
		offset: number;
	}) {
		const {cacheService, userRepository} = this.deps;
		const userSearchService = getUserSearchService();
		if (!userSearchService) {
			Logger.warn('[AdminSearchService] searchUsers - Search service not enabled, using exact-match fallback');
			return await this.searchUsersFallback(data);
		}

		try {
			const {hits, total} = await userSearchService.searchUsers(
				data.query || '',
				{
					emailVerified: data.email_verified,
					hasPremium: data.has_premium,
					isBot: data.is_bot,
				},
				{
					limit: data.limit,
					offset: data.offset,
				},
			);

			const userIds = hits.map((hit) => createUserID(BigInt(hit.id)));
			const users = (await userRepository.listUsers(userIds)).filter((user) =>
				this.matchesUserFilters(user, data),
			);

			if (users.length > 0 || total > 0) {
				return {
					users: await Promise.all(users.map((user) => mapUserToAdminResponse(user, cacheService))),
					total,
				};
			}

			return await this.searchUsersFallback(data);
		} catch (error) {
			Logger.error({error}, '[AdminSearchService] searchUsers - Search failed');
			return await this.searchUsersFallback(data);
		}
	}

	private async searchGuildsFallback(data: {query?: string; limit: number; offset: number}) {
		const {guildRepository} = this.deps;
		const normalizedQuery = data.query?.trim().toLowerCase();
		const requestedLimit = data.limit || 50;
		const currentOffset = data.offset || 0;
		const batchSize = Math.min(Math.max(requestedLimit * 2, 100), 200);
		const maxBatches = 8;
		const targetMatchCount = currentOffset + requestedLimit + 1;
		const matchedGuilds: Array<Guild> = [];

		let lastGuildId: GuildID | undefined;
		let hasMoreSourceData = false;

		if (normalizedQuery && /^\d+$/.test(normalizedQuery)) {
			try {
				const exactGuild = await guildRepository.findUnique(createGuildID(BigInt(normalizedQuery)));
				if (exactGuild) {
					matchedGuilds.push(exactGuild);
				}
			} catch (error) {
				Logger.warn({error, query: normalizedQuery}, '[AdminSearchService] searchGuildsFallback - Exact lookup failed');
			}
		}

		for (let batchIndex = 0; batchIndex < maxBatches; batchIndex += 1) {
			const batch = await guildRepository.listAllGuildsPaginated(batchSize, lastGuildId);
			if (batch.length === 0) {
				hasMoreSourceData = false;
				break;
			}

			lastGuildId = batch[batch.length - 1]?.id;
			hasMoreSourceData = batch.length === batchSize;

			for (const guild of batch) {
				if (matchedGuilds.some((existing) => existing.id === guild.id)) {
					continue;
				}

				if (this.matchesGuildSearch(guild, normalizedQuery)) {
					matchedGuilds.push(guild);
				}
			}

			if (matchedGuilds.length >= targetMatchCount || batch.length < batchSize) {
				break;
			}
		}

		const guilds = matchedGuilds
			.slice(currentOffset, currentOffset + requestedLimit)
			.map((guild) => mapGuildToAdminResponse(guild));
		const total = hasMoreSourceData
			? Math.max(matchedGuilds.length, currentOffset + guilds.length + 1)
			: matchedGuilds.length;

		return {guilds, total};
	}

	private async searchUsersFallback(data: {
		query?: string;
		email_verified?: boolean;
		has_premium?: boolean;
		is_bot?: boolean;
		limit: number;
		offset: number;
	}) {
		const {cacheService, userRepository} = this.deps;
		const normalizedQuery = data.query?.trim().toLowerCase();
		const requestedLimit = data.limit || 50;
		const currentOffset = data.offset || 0;
		const batchSize = Math.min(Math.max(requestedLimit * 2, 100), 200);
		const maxBatches = 8;
		const targetMatchCount = currentOffset + requestedLimit + 1;
		const hasActiveFilters =
			data.email_verified !== undefined || data.has_premium !== undefined || data.is_bot !== undefined;

		if (!normalizedQuery && !hasActiveFilters) {
			return {users: [], total: 0};
		}

		const matchedUsers: Array<User> = [];
		let lastUserId: UserID | undefined;
		let hasMoreSourceData = false;

		if (normalizedQuery) {
			const exactUser = await this.lookupUserExact(data.query!.trim());
			if (exactUser && this.matchesUserFilters(exactUser, data) && this.matchesUserSearch(exactUser, normalizedQuery)) {
				matchedUsers.push(exactUser);
			}
		}

		for (let batchIndex = 0; batchIndex < maxBatches; batchIndex += 1) {
			const batch = await userRepository.listAllUsersPaginated(batchSize, lastUserId);
			if (batch.length === 0) {
				hasMoreSourceData = false;
				break;
			}

			lastUserId = batch[batch.length - 1]?.id;
			hasMoreSourceData = batch.length === batchSize;

			for (const user of batch) {
				if (matchedUsers.some((existing) => existing.id === user.id)) {
					continue;
				}

				if (this.matchesUserSearch(user, normalizedQuery) && this.matchesUserFilters(user, data)) {
					matchedUsers.push(user);
				}
			}

			if (matchedUsers.length >= targetMatchCount || batch.length < batchSize) {
				break;
			}
		}

		const users = matchedUsers.slice(currentOffset, currentOffset + requestedLimit);
		const total = hasMoreSourceData
			? Math.max(matchedUsers.length, currentOffset + users.length + 1)
			: matchedUsers.length;

		return {
			users: await Promise.all(users.map((user) => mapUserToAdminResponse(user, cacheService))),
			total,
		};
	}

	private matchesGuildSearch(guild: Guild, query?: string) {
		if (!query) {
			return true;
		}

		const haystack = [guild.id.toString(), guild.name, guild.vanityUrlCode ?? '', guild.ownerId.toString()]
			.filter((value) => value.length > 0)
			.map((value) => value.toLowerCase());

		return haystack.some((value) => value.includes(query));
	}

	private async lookupUserExact(query: string) {
		const {userRepository} = this.deps;

		try {
			const AstralTagMatch = query.match(/^(.+)#(\d{1,4})$/);
			if (AstralTagMatch) {
				const username = AstralTagMatch[1];
				const discriminator = parseInt(AstralTagMatch[2], 10);
				return await userRepository.findByUsernameDiscriminator(username, discriminator);
			}

			if (/^\d+$/.test(query)) {
				return await userRepository.findUnique(createUserID(BigInt(query)));
			}

			if (/^\+\d{1,15}$/.test(query)) {
				return await userRepository.findByPhone(query);
			}

			if (query.includes('@')) {
				return await userRepository.findByEmail(query);
			}

			return await userRepository.findByStripeSubscriptionId(query);
		} catch (error) {
			Logger.warn({error, query}, '[AdminSearchService] lookupUserExact - Exact lookup failed');
			return null;
		}
	}

	private matchesUserFilters(
		user: User,
		data: {
			email_verified?: boolean;
			has_premium?: boolean;
			is_bot?: boolean;
		},
	) {
		if (data.email_verified !== undefined && user.emailVerified !== data.email_verified) {
			return false;
		}

		if (data.has_premium !== undefined && (user.premiumType !== null) !== data.has_premium) {
			return false;
		}

		if (data.is_bot !== undefined && user.isBot !== data.is_bot) {
			return false;
		}

		return true;
	}

	private matchesUserSearch(user: User, query?: string) {
		if (!query) {
			return true;
		}

		const rawDiscriminator = user.discriminator.toString();
		const paddedDiscriminator = rawDiscriminator.padStart(4, '0');
		const haystack = [
			user.id.toString(),
			user.username,
			user.globalName ?? '',
			`${user.username}#${rawDiscriminator}`,
			`${user.username}#${paddedDiscriminator}`,
			user.email ?? '',
			user.phone ?? '',
			user.stripeSubscriptionId ?? '',
			user.locale ?? '',
		]
			.filter((value) => value.length > 0)
			.map((value) => value.toLowerCase());

		return haystack.some((value) => value.includes(query));
	}

	async refreshSearchIndex(
		data: {
			index_type: 'guilds' | 'users' | 'reports' | 'audit_logs' | 'channel_messages' | 'favorite_memes';
			guild_id?: bigint;
			user_id?: bigint;
		},
		adminUserId: UserID,
		auditLogReason: string | null,
	) {
		const {workerService, snowflakeService, auditService} = this.deps;
		const jobId = snowflakeService.generate().toString();

		const payload: RefreshSearchIndexJobPayload = {
			index_type: data.index_type,
			admin_user_id: adminUserId.toString(),
			audit_log_reason: auditLogReason,
			job_id: jobId,
		};

		if (data.index_type === 'channel_messages') {
			if (!data.guild_id) {
				throw new Error('guild_id is required for the channel_messages index type');
			}
			payload.guild_id = data.guild_id.toString();
		}

		if (data.index_type === 'favorite_memes') {
			if (!data.user_id) {
				throw new Error('user_id is required for favorite_memes index type');
			}
			payload.user_id = data.user_id.toString();
		}

		await workerService.addJob('refreshSearchIndex', payload, {
			jobKey: `refreshSearchIndex_${data.index_type}_${jobId}`,
			maxAttempts: 1,
		});

		Logger.debug({index_type: data.index_type, job_id: jobId}, 'Queued search index refresh job');

		const metadata = new Map([
			['index_type', data.index_type],
			['job_id', jobId],
		]);
		if (data.guild_id) {
			metadata.set('guild_id', data.guild_id.toString());
		}
		if (data.user_id) {
			metadata.set('user_id', data.user_id.toString());
		}

		await auditService.createAuditLog({
			adminUserId,
			targetType: 'search_index',
			targetId: BigInt(0),
			action: 'queue_refresh_index',
			auditLogReason,
			metadata,
		});

		return {
			success: true,
			job_id: jobId,
		};
	}

	async getIndexRefreshStatus(jobId: string) {
		const {cacheService} = this.deps;
		const statusKey = `index_refresh_status:${jobId}`;
		const status = await cacheService.get<{
			status: 'in_progress' | 'completed' | 'failed';
			index_type: string;
			total?: number;
			indexed?: number;
			started_at?: string;
			completed_at?: string;
			failed_at?: string;
			error?: string;
		}>(statusKey);

		if (!status) {
			return {
				status: 'not_found' as const,
			};
		}

		return status;
	}
}
