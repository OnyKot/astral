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

import type {ChannelID, GuildID, UserID} from '~/BrandedTypes';
import {Permissions} from '~/Constants';
import type {MessageSearchRequest, MessageSearchResponse} from '~/channel/ChannelModel';
import type {IChannelRepository} from '~/channel/IChannelRepository';
import type {ChannelService} from '~/channel/services/ChannelService';
import {InputValidationError, MissingPermissionsError} from '~/Errors';
import type {IGatewayService} from '~/infrastructure/IGatewayService';
import type {IMediaService} from '~/infrastructure/IMediaService';
import type {UserCacheService} from '~/infrastructure/UserCacheService';
import {Logger} from '~/Logger';
import {getMessageSearchService} from '~/Meilisearch';
import type {Channel} from '~/Models';
import type {RequestCache} from '~/middleware/RequestCacheMiddleware';
import {buildMessageSearchFilters} from '~/search/buildMessageSearchFilters';
import {InternalMessageSearchService} from '~/search/InternalMessageSearchService';
import {MessageSearchResponseMapper} from '~/search/MessageSearchResponseMapper';
import type {IUserRepository} from '~/user/IUserRepository';
import type {IWorkerService} from '~/worker/IWorkerService';

export class GuildSearchService {
	private readonly responseMapper: MessageSearchResponseMapper;

	constructor(
		private readonly channelRepository: IChannelRepository,
		private readonly channelService: ChannelService,
		private readonly userCacheService: UserCacheService,
		private readonly gatewayService: IGatewayService,
		private readonly userRepository: IUserRepository,
		private readonly mediaService: IMediaService,
		private readonly workerService: IWorkerService,
) {
		this.responseMapper = new MessageSearchResponseMapper(
			this.channelRepository,
			this.channelService,
			this.userCacheService,
			this.mediaService,
		);
		this.internalMessageSearchService = new InternalMessageSearchService(this.channelRepository.messages, this.userRepository);
	}

	private readonly internalMessageSearchService: InternalMessageSearchService;

	private getMessageSearchService() {
		try {
			return getMessageSearchService();
		} catch (error) {
			Logger.warn({error}, '[GuildSearchService] Message search backend unavailable, using internal fallback');
			return null;
		}
	}

	async searchMessages(params: {
		userId: UserID;
		guildId: GuildID;
		channelIds: Array<ChannelID>;
		searchParams: MessageSearchRequest;
		requestCache: RequestCache;
	}): Promise<MessageSearchResponse | {indexing: true}> {
		const {userId, guildId, searchParams, requestCache} = params;
		let {channelIds} = params;
		const strictChannelPermissions = channelIds.length > 0;

		await this.gatewayService.getGuildData({guildId, userId});

		const searchService = this.getMessageSearchService();

		if (channelIds.length === 0) {
			const channels = await this.channelRepository.listGuildChannels(guildId);
			channelIds = channels.map((c) => c.id);
		}

		const validChannelIds: Array<ChannelID> = [];
		for (const channelId of channelIds) {
			const channel = await this.channelRepository.findUnique(channelId);
			if (!channel || channel.guildId !== guildId) {
				throw InputValidationError.create('channel_ids', 'All channels must belong to this guild');
			}

			const canSearch = await this.gatewayService.checkPermission({
				guildId,
				userId,
				channelId,
				permission: Permissions.VIEW_CHANNEL | Permissions.READ_MESSAGE_HISTORY,
			});

			if (!canSearch) {
				if (strictChannelPermissions) {
					throw new MissingPermissionsError();
				}
				continue;
			}

			validChannelIds.push(channelId);
		}

		if (validChannelIds.length === 0) {
			const hitsPerPage = searchParams.hits_per_page ?? 25;
			const page = searchParams.page ?? 1;
			return {
				messages: [],
				total: 0,
				hits_per_page: hitsPerPage,
				page,
			};
		}

		const channelsNeedingIndex = await Promise.all(
			validChannelIds.map(async (channelId) => {
				const channel = await this.channelRepository.findUnique(channelId);
				return channel && !channel.indexedAt ? channelId : null;
			}),
		);

		const unindexedChannels = channelsNeedingIndex.filter((id): id is ChannelID => id !== null);

		if (searchService && unindexedChannels.length > 0) {
			await Promise.all(
				unindexedChannels.map((channelId) =>
					this.workerService.addJob(
						'indexChannelMessages',
						{channelId: channelId.toString()},
						{
							jobKey: `indexChannelMessages-${channelId}`,
							maxAttempts: 3,
						},
					),
				),
			);
			Logger.warn(
				{channelIds: unindexedChannels.map((id) => id.toString())},
				'[GuildSearchService] Falling back to internal search while indexing catches up',
			);
		}

		const filters = buildMessageSearchFilters(
			searchParams,
			validChannelIds.map((id) => id.toString()),
		);

		const hitsPerPage = searchParams.hits_per_page ?? 25;
		const page = searchParams.page ?? 1;
		const result = searchService
			? await searchService
					.searchMessages('', filters, {
						hitsPerPage,
						page,
					})
					.catch((error) => {
						Logger.warn({error, guildId}, '[GuildSearchService] External search failed, using internal fallback');
						return null;
					})
			: null;
		const finalResult =
			result ??
			(await this.internalMessageSearchService.searchMessages('', filters, {
				hitsPerPage,
				page,
			}));

		const messageResponses = await this.responseMapper.mapSearchResultToResponses(finalResult, userId, requestCache);

		return {
			messages: messageResponses,
			total: finalResult.total,
			hits_per_page: hitsPerPage,
			page,
		};
	}

	async searchAllGuilds(params: {
		userId: UserID;
		channelIds: Array<ChannelID>;
		searchParams: MessageSearchRequest;
		requestCache: RequestCache;
	}): Promise<MessageSearchResponse | {indexing: true}> {
		const {userId, channelIds, searchParams, requestCache} = params;

		const searchService = this.getMessageSearchService();

		const {accessibleChannels, unindexedChannelIds} = await this.collectAccessibleGuildChannels(userId);

		if (searchService && unindexedChannelIds.size > 0) {
			await this.queueIndexingChannels(unindexedChannelIds);
			Logger.warn(
				{channelIds: Array.from(unindexedChannelIds)},
				'[GuildSearchService] Falling back to internal search while guild indexing catches up',
			);
		}

		let searchChannelIds = Array.from(accessibleChannels.keys());

		if (channelIds.length > 0) {
			const requestedChannelStrings = channelIds.map((id) => id.toString());
			for (const requested of requestedChannelStrings) {
				if (!accessibleChannels.has(requested)) {
					throw new MissingPermissionsError();
				}
			}
			searchChannelIds = requestedChannelStrings;
		}

		if (searchChannelIds.length === 0) {
			const hitsPerPage = searchParams.hits_per_page ?? 25;
			const page = searchParams.page ?? 1;
			return {
				messages: [],
				total: 0,
				hits_per_page: hitsPerPage,
				page,
			};
		}

		const filters = buildMessageSearchFilters(searchParams, searchChannelIds);

		const hitsPerPage = searchParams.hits_per_page ?? 25;
		const page = searchParams.page ?? 1;
		const result = searchService
			? await searchService
					.searchMessages('', filters, {
						hitsPerPage,
						page,
					})
					.catch((error) => {
						Logger.warn({error}, '[GuildSearchService] External search failed, using internal fallback');
						return null;
					})
			: null;
		const finalResult =
			result ??
			(await this.internalMessageSearchService.searchMessages('', filters, {
				hitsPerPage,
				page,
			}));

		const messageResponses = await this.responseMapper.mapSearchResultToResponses(finalResult, userId, requestCache);

		return {
			messages: messageResponses,
			total: finalResult.total,
			hits_per_page: hitsPerPage,
			page,
		};
	}

	private async queueIndexingChannels(channelIds: Iterable<string>): Promise<void> {
		await Promise.all(
			Array.from(channelIds).map((channelId) =>
				this.workerService.addJob(
					'indexChannelMessages',
					{channelId},
					{
						jobKey: `indexChannelMessages-${channelId}`,
						maxAttempts: 3,
					},
				),
			),
		);
	}

	async collectAccessibleGuildChannels(userId: UserID): Promise<{
		accessibleChannels: Map<string, Channel>;
		unindexedChannelIds: Set<string>;
	}> {
		const guildIds = await this.userRepository.getUserGuildIds(userId);
		const accessibleChannels = new Map<string, Channel>();
		const unindexedChannelIds = new Set<string>();

		await Promise.all(
			guildIds.map(async (guildId) => {
				const [guildChannels, viewableChannelIdList] = await Promise.all([
					this.channelRepository.listGuildChannels(guildId),
					this.gatewayService.getViewableChannels({
						guildId,
						userId,
					}),
				]);
				if (guildChannels.length === 0) {
					return;
				}

				const viewableChannelIds = new Set(viewableChannelIdList.map((channelId) => channelId.toString()));
				const candidates = guildChannels.filter((channel) => viewableChannelIds.has(channel.id.toString()));
				const permissionResults = await Promise.all(
					candidates.map(async (channel) => ({
						channel,
						hasPermission: await this.gatewayService.checkPermission({
							guildId,
							userId,
							channelId: channel.id,
							permission: Permissions.VIEW_CHANNEL | Permissions.READ_MESSAGE_HISTORY,
						}),
					})),
				);

				for (const {channel, hasPermission} of permissionResults) {
					if (!hasPermission) {
						continue;
					}
					const channelIdStr = channel.id.toString();
					accessibleChannels.set(channelIdStr, channel);
					if (!channel.indexedAt) {
						unindexedChannelIds.add(channelIdStr);
					}
				}
			}),
		);

		return {accessibleChannels, unindexedChannelIds};
	}
}
