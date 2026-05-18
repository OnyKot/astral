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

import type {ChannelID, UserID} from '~/BrandedTypes';
import {createChannelID} from '~/BrandedTypes';
import {ChannelTypes} from '~/Constants';
import type {MessageSearchRequest, MessageSearchResponse} from '~/channel/ChannelModel';
import type {IChannelRepository} from '~/channel/IChannelRepository';
import type {Channel} from '~/Models';
import type {ChannelService} from '~/channel/services/ChannelService';
import {type DmSearchScope, getDmChannelIdsForScope} from '~/channel/services/message/dmScopeUtils';
import {MissingPermissionsError} from '~/Errors';
import type {GuildService} from '~/guild/services/GuildService';
import type {IMediaService} from '~/infrastructure/IMediaService';
import type {UserCacheService} from '~/infrastructure/UserCacheService';
import {Logger} from '~/Logger';
import {getMessageSearchService} from '~/Meilisearch';
import type {RequestCache} from '~/middleware/RequestCacheMiddleware';
import {buildMessageSearchFilters} from '~/search/buildMessageSearchFilters';
import {InternalMessageSearchService} from '~/search/InternalMessageSearchService';
import {MessageSearchResponseMapper} from '~/search/MessageSearchResponseMapper';
import type {MessageSearchService} from '~/search/MessageSearchService';
import type {IUserRepository} from '~/user/IUserRepository';
import type {IWorkerService} from '~/worker/IWorkerService';

export class GlobalSearchService {
	private static readonly CHANNEL_INDEX_LOOKUP_CONCURRENCY = 25;

	private readonly responseMapper: MessageSearchResponseMapper;

	constructor(
		private readonly channelRepository: IChannelRepository,
		private readonly channelService: ChannelService,
		private readonly guildService: GuildService,
		private readonly userRepository: IUserRepository,
		private readonly userCacheService: UserCacheService,
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

	private getMessageSearchService(): MessageSearchService | null {
		try {
			return getMessageSearchService();
		} catch (error) {
			Logger.warn({error}, '[GlobalSearchService] Message search backend unavailable, using internal fallback');
			return null;
		}
	}

	async searchAcrossDms(params: {
		userId: UserID;
		scope: DmSearchScope;
		searchParams: MessageSearchRequest;
		requestCache: RequestCache;
		includeChannelId?: ChannelID | null;
		requestedChannelIds?: Array<ChannelID>;
	}): Promise<MessageSearchResponse | {indexing: true}> {
		const dmChannelIds = await getDmChannelIdsForScope({
			scope: params.scope,
			userId: params.userId,
			userRepository: this.userRepository,
			includeChannelId: params.includeChannelId,
		});

		const finalChannelIds = this.filterRequestedChannelIds(dmChannelIds, params.requestedChannelIds);
		if (finalChannelIds.length === 0) {
			const hitsPerPage = params.searchParams.hits_per_page ?? 25;
			const page = params.searchParams.page ?? 1;
			return {
				messages: [],
				total: 0,
				hits_per_page: hitsPerPage,
				page,
			};
		}

		const searchService = this.getMessageSearchService();
		const needsIndexing = searchService ? await this.ensureChannelsIndexed(finalChannelIds) : false;
		if (searchService && needsIndexing) {
			Logger.warn({channelIds: finalChannelIds}, '[GlobalSearchService] Falling back to internal search while indexing catches up');
		}

		return this.runSearch(finalChannelIds, params.userId, params.searchParams, params.requestCache, searchService);
	}

	async searchAcrossGuildsAndDms(params: {
		userId: UserID;
		dmScope: DmSearchScope;
		searchParams: MessageSearchRequest;
		requestCache: RequestCache;
		includeChannelId?: ChannelID | null;
		requestedChannelIds?: Array<ChannelID>;
	}): Promise<MessageSearchResponse | {indexing: true}> {
		const {accessibleChannels, unindexedChannelIds} = await this.guildService.collectAccessibleGuildChannels(
			params.userId,
		);

		const searchService = this.getMessageSearchService();
		if (searchService && unindexedChannelIds.size > 0) {
			await this.queueIndexingChannels(unindexedChannelIds);
			Logger.warn(
				{channelIds: Array.from(unindexedChannelIds)},
				'[GlobalSearchService] Falling back to internal search while guild indexing catches up',
			);
		}

		const guildChannelIds = Array.from(accessibleChannels.keys());
		const dmChannelIds = await getDmChannelIdsForScope({
			scope: params.dmScope,
			userId: params.userId,
			userRepository: this.userRepository,
			includeChannelId: params.includeChannelId,
		});

		const combinedChannelSet = new Set<string>([...guildChannelIds, ...dmChannelIds]);
		const finalChannelIds = this.filterRequestedChannelIds(Array.from(combinedChannelSet), params.requestedChannelIds);
		if (finalChannelIds.length === 0) {
			const hitsPerPage = params.searchParams.hits_per_page ?? 25;
			const page = params.searchParams.page ?? 1;
			return {
				messages: [],
				total: 0,
				hits_per_page: hitsPerPage,
				page,
			};
		}

		const needsIndexing = searchService ? await this.ensureChannelsIndexed(finalChannelIds) : false;
		if (searchService && needsIndexing) {
			Logger.warn({channelIds: finalChannelIds}, '[GlobalSearchService] Falling back to internal search while indexing catches up');
		}

		return this.runSearch(finalChannelIds, params.userId, params.searchParams, params.requestCache, searchService);
	}

	private filterRequestedChannelIds(available: Array<string>, requested?: Array<ChannelID>): Array<string> {
		if (!requested || requested.length === 0) {
			return available;
		}

		const availableSet = new Set(available);
		const requestedStrings = requested.map((id) => id.toString());
		for (const channelId of requestedStrings) {
			if (!availableSet.has(channelId)) {
				throw new MissingPermissionsError();
			}
		}

		return requestedStrings;
	}

	private async ensureChannelsIndexed(channelIds: Array<string>): Promise<boolean> {
		const channels = await this.mapWithConcurrency(
			channelIds,
			GlobalSearchService.CHANNEL_INDEX_LOOKUP_CONCURRENCY,
			async (channelId) => {
				const channel = await this.channelRepository.findUnique(createChannelID(BigInt(channelId)));
				return channel ? {channelId, channel} : null;
			},
		);

		const unindexed = new Set<string>();
		const personalNotesIds: Array<{channelId: string; channel: Channel}> = [];

		for (const entry of channels) {
			if (!entry) continue;
			if (entry.channel.type === ChannelTypes.DM_PERSONAL_NOTES) {
				personalNotesIds.push(entry);
			} else if (!entry.channel.indexedAt) {
				unindexed.add(entry.channelId);
			}
		}

		if (personalNotesIds.length > 0) {
			const persisted = await this.mapWithConcurrency(
				personalNotesIds,
				GlobalSearchService.CHANNEL_INDEX_LOOKUP_CONCURRENCY,
				async ({channelId}) => {
					const data = await this.channelRepository.channelData.findUnique(createChannelID(BigInt(channelId)));
					return {channelId, indexedAt: data?.indexedAt ?? null};
				},
			);
			for (const {channelId, indexedAt} of persisted) {
				if (!indexedAt) unindexed.add(channelId);
			}
		}

		if (unindexed.size === 0) {
			return false;
		}

		await this.queueIndexingChannels(unindexed);
		return true;
	}

	private async mapWithConcurrency<TInput, TOutput>(
		items: Array<TInput>,
		concurrency: number,
		mapper: (item: TInput) => Promise<TOutput>,
	): Promise<Array<TOutput>> {
		const results: Array<TOutput> = [];
		for (let index = 0; index < items.length; index += concurrency) {
			const chunk = items.slice(index, index + concurrency);
			results.push(...(await Promise.all(chunk.map((item) => mapper(item)))));
		}
		return results;
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

	private async runSearch(
		channelIds: Array<string>,
		userId: UserID,
		searchParams: MessageSearchRequest,
		requestCache: RequestCache,
		searchService: MessageSearchService | null,
	): Promise<MessageSearchResponse> {
		const normalizedSearchParams = {...searchParams, channel_id: undefined};
		const filters = buildMessageSearchFilters(normalizedSearchParams, channelIds);
		const hitsPerPage = searchParams.hits_per_page ?? 25;
		const page = searchParams.page ?? 1;
		const result = searchService
			? await searchService
					.searchMessages('', filters, {
						hitsPerPage,
						page,
					})
					.catch((error) => {
						Logger.warn({error, channelIds}, '[GlobalSearchService] External search failed, using internal fallback');
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
}
