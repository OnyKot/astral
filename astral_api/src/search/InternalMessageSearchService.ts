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

import {createChannelID, createMessageID, createUserID, type ChannelID} from '~/BrandedTypes';
import {MessageReferenceTypes} from '~/Constants';
import type {Message} from '~/Models';
import type {IMessageRepository} from '~/channel/repositories/IMessageRepository';
import type {IUserRepository} from '~/user/IUserRepository';
import {extractTimestamp} from '~/utils/SnowflakeUtils';
import type {MessageSearchFilters} from './MessageSearchService';

export interface InternalMessageSearchHit {
	id: string;
	channelId: string;
	createdAt: number;
	score: number;
}

interface InternalSearchResult {
	hits: Array<InternalMessageSearchHit>;
	total: number;
	exhausted: boolean;
}

type AuthorType = 'user' | 'bot' | 'webhook';

const DEFAULT_BATCH_SIZE = 100;
const MAX_BATCH_SIZE = 200;
const MAX_CHANNEL_CONCURRENCY = 6;
const MAX_MESSAGES_PER_CHANNEL = 10_000;
const MAX_MESSAGES_PER_REQUEST = 250_000;
const CACHE_TTL_MS = 20_000;
const CACHE_MAX_HITS = 10_000;

interface CachedSearchResult {
	expiresAt: number;
	result: InternalSearchResult;
}

export class InternalMessageSearchService {
	private static readonly resultCache = new Map<string, CachedSearchResult>();

	constructor(
		private readonly messageRepository: IMessageRepository,
		private readonly userRepository?: IUserRepository,
	) {}

	async searchMessages(
		query: string,
		filters: MessageSearchFilters,
		options?: {
			hitsPerPage?: number;
			page?: number;
		},
	): Promise<{hits: Array<InternalMessageSearchHit>; total: number}> {
		const hitsPerPage = options?.hitsPerPage ?? 25;
		const page = options?.page ?? 1;
		const cacheKey = this.buildCacheKey(query, filters);
		const cached = InternalMessageSearchService.resultCache.get(cacheKey);
		if (cached && cached.expiresAt > Date.now()) {
			return this.paginateCachedResult(cached.result, hitsPerPage, page);
		}

		const channelIds = this.resolveChannelIds(filters);
		if (channelIds.length === 0) {
			return {hits: [], total: 0};
		}

		const searchText = this.normalizeSearchText([query, filters.content, ...(filters.contents ?? [])]);
		const searchTerms = this.splitSearchTerms(searchText);
		const authorTypeCache = new Map<string, Promise<AuthorType>>();
		const scanState = {scanned: 0};
		const hits: Array<InternalMessageSearchHit> = [];
		let exhausted = true;

		const queue = [...channelIds];
		const workers = Array.from({length: Math.min(MAX_CHANNEL_CONCURRENCY, queue.length)}, async () => {
			while (queue.length > 0 && scanState.scanned < MAX_MESSAGES_PER_REQUEST) {
				const channelId = queue.shift();
				if (!channelId) {
					return;
				}

				const channelResult = await this.scanChannelMessages(channelId, {
					searchText,
					searchTerms,
					filters,
					authorTypeCache,
					scanState,
				});
				hits.push(...channelResult.hits);
				if (!channelResult.exhausted) {
					exhausted = false;
				}
			}
		});

		await Promise.all(workers);

		const sortedHits = this.sortHits(hits, filters.sortBy ?? 'timestamp', filters.sortOrder ?? 'desc');
		const result: InternalSearchResult = {
			hits: sortedHits,
			total: exhausted ? sortedHits.length : Math.max(sortedHits.length, (page - 1) * hitsPerPage + 1),
			exhausted,
		};

		if (sortedHits.length <= CACHE_MAX_HITS) {
			InternalMessageSearchService.resultCache.set(cacheKey, {
				expiresAt: Date.now() + CACHE_TTL_MS,
				result,
			});
		}

		return this.paginateCachedResult(result, hitsPerPage, page);
	}

	private paginateCachedResult(
		result: InternalSearchResult,
		hitsPerPage: number,
		page: number,
	): {hits: Array<InternalMessageSearchHit>; total: number} {
		const start = Math.max(0, (page - 1) * hitsPerPage);
		return {
			hits: result.hits.slice(start, start + hitsPerPage),
			total: result.total,
		};
	}

	private buildCacheKey(query: string, filters: MessageSearchFilters): string {
		return JSON.stringify({
			query: this.normalizeSearchText([query]),
			filters: this.normalizeFiltersForCache(filters),
		});
	}

	private normalizeFiltersForCache(filters: MessageSearchFilters): Record<string, unknown> {
		return {
			...filters,
			content: this.normalizeSearchText([filters.content ?? '']) || undefined,
			contents: filters.contents?.map((value) => this.normalizeSearchText([value])).filter(Boolean) ?? undefined,
		};
	}

	private resolveChannelIds(filters: MessageSearchFilters): Array<string> {
		const channelIds = new Set<string>();

		if (filters.channelId) {
			channelIds.add(filters.channelId);
		}

		for (const channelId of filters.channelIds ?? []) {
			channelIds.add(channelId);
		}

		for (const excluded of filters.excludeChannelIds ?? []) {
			channelIds.delete(excluded);
		}

		return Array.from(channelIds);
	}

	private async scanChannelMessages(
		channelId: string,
		params: {
			searchText: string;
			searchTerms: Array<string>;
			filters: MessageSearchFilters;
			authorTypeCache: Map<string, Promise<AuthorType>>;
			scanState: {scanned: number};
		},
	): Promise<{hits: Array<InternalMessageSearchHit>; exhausted: boolean}> {
		const hits: Array<InternalMessageSearchHit> = [];
		let exhausted = true;
		const filters = params.filters;

		let beforeMessageId: bigint | undefined = filters.maxId ? BigInt(filters.maxId) : undefined;
		const afterMessageId: bigint | undefined = filters.minId ? BigInt(filters.minId) : undefined;
		const batchSize = Math.min(
			MAX_BATCH_SIZE,
			Math.max(
				DEFAULT_BATCH_SIZE,
				Math.min(
					MAX_BATCH_SIZE,
					(filters.sortBy === 'relevance' ? 200 : 100) * Math.max(1, filters.contents?.length ?? 1),
				),
			),
		);

		while (params.scanState.scanned < MAX_MESSAGES_PER_REQUEST) {
			if (hits.length >= MAX_MESSAGES_PER_CHANNEL) {
				exhausted = false;
				break;
			}

			const batch = await this.messageRepository.listMessages(
				createChannelID(BigInt(channelId)) as ChannelID,
				beforeMessageId ? createMessageID(beforeMessageId) : undefined,
				batchSize,
				afterMessageId ? createMessageID(afterMessageId) : undefined,
			);

			if (batch.length === 0) {
				break;
			}

			for (const message of batch) {
				if (params.scanState.scanned >= MAX_MESSAGES_PER_REQUEST) {
					exhausted = false;
					break;
				}

				params.scanState.scanned++;
				const matched = await this.evaluateMessage(message, params);
				if (matched) {
					hits.push(matched);
				}
			}

			const lastMessage = batch[batch.length - 1];
			if (!lastMessage) {
				break;
			}

			const nextBefore = lastMessage.id;
			if (beforeMessageId !== undefined && nextBefore === beforeMessageId) {
				exhausted = false;
				break;
			}

			beforeMessageId = nextBefore;
			if (batch.length < batchSize) {
				break;
			}
		}

		if (params.scanState.scanned >= MAX_MESSAGES_PER_REQUEST) {
			exhausted = false;
		}

		return {hits, exhausted};
	}

	private async evaluateMessage(
		message: Message,
		params: {
			searchText: string;
			searchTerms: Array<string>;
			filters: MessageSearchFilters;
			authorTypeCache: Map<string, Promise<AuthorType>>;
		},
	): Promise<InternalMessageSearchHit | null> {
		if (!(await this.matchesMessageFilters(message, params.filters, params.authorTypeCache))) {
			return null;
		}

		const contentMatch = this.matchesSearchText(message.content ?? '', params.searchText, params.searchTerms);
		if (!contentMatch.matched) {
			return null;
		}

		return {
			id: message.id.toString(),
			channelId: message.channelId.toString(),
			createdAt: Math.floor(extractTimestamp(message.id) / 1000),
			score: contentMatch.score,
		};
	}

	private async matchesMessageFilters(
		message: Message,
		filters: MessageSearchFilters,
		authorTypeCache: Map<string, Promise<AuthorType>>,
	): Promise<boolean> {
		const messageId = message.id.toString();

		if (filters.maxId && BigInt(messageId) >= BigInt(filters.maxId)) {
			return false;
		}
		if (filters.minId && BigInt(messageId) <= BigInt(filters.minId)) {
			return false;
		}

		if (filters.channelId && message.channelId.toString() !== filters.channelId) {
			return false;
		}

		if (filters.channelIds && filters.channelIds.length > 0 && !filters.channelIds.includes(message.channelId.toString())) {
			return false;
		}

		if (filters.excludeChannelIds && filters.excludeChannelIds.includes(message.channelId.toString())) {
			return false;
		}

		if (filters.pinned !== undefined) {
			const pinned = message.pinnedTimestamp != null;
			if (pinned !== filters.pinned) {
				return false;
			}
		}

		if (filters.mentionEveryone !== undefined && message.mentionEveryone !== filters.mentionEveryone) {
			return false;
		}

		if (filters.authorId && filters.authorId.length > 0) {
			const authorId = message.authorId?.toString() ?? '';
			if (!filters.authorId.includes(authorId)) {
				return false;
			}
		}

		if (filters.excludeAuthorIds && filters.excludeAuthorIds.length > 0) {
			const authorId = message.authorId?.toString() ?? '';
			if (filters.excludeAuthorIds.includes(authorId)) {
				return false;
			}
		}

		if (filters.authorType && filters.authorType.length > 0) {
			const authorType = await this.getAuthorType(message, authorTypeCache);
			if (!filters.authorType.includes(authorType)) {
				return false;
			}
		}

		if (filters.excludeAuthorType && filters.excludeAuthorType.length > 0) {
			const authorType = await this.getAuthorType(message, authorTypeCache);
			if (filters.excludeAuthorType.includes(authorType)) {
				return false;
			}
		}

		if (filters.mentions && filters.mentions.length > 0) {
			const mentionedUsers = message.mentionedUserIds;
			if (!filters.mentions.every((mention) => mentionedUsers.has(createUserID(BigInt(mention))))) {
				return false;
			}
		}

		if (filters.excludeMentions && filters.excludeMentions.length > 0) {
			const mentionedUsers = message.mentionedUserIds;
			if (filters.excludeMentions.some((mention) => mentionedUsers.has(createUserID(BigInt(mention))))) {
				return false;
			}
		}

		if (filters.has && filters.has.length > 0) {
			for (const hasType of filters.has) {
				if (!this.messageHasType(message, hasType)) {
					return false;
				}
			}
		}

		if (filters.excludeHas && filters.excludeHas.length > 0) {
			for (const hasType of filters.excludeHas) {
				if (this.messageHasType(message, hasType)) {
					return false;
				}
			}
		}

		if (filters.embedType && filters.embedType.length > 0) {
			const embedTypes = new Set(message.embeds.map((embed) => embed.type).filter((type): type is string => !!type));
			if (!filters.embedType.some((type) => embedTypes.has(type))) {
				return false;
			}
		}

		if (filters.excludeEmbedTypes && filters.excludeEmbedTypes.length > 0) {
			const embedTypes = new Set(message.embeds.map((embed) => embed.type).filter((type): type is string => !!type));
			if (filters.excludeEmbedTypes.some((type) => embedTypes.has(type))) {
				return false;
			}
		}

		if (filters.embedProvider && filters.embedProvider.length > 0) {
			const providers = new Set(
				message.embeds.map((embed) => embed.provider?.name).filter((provider): provider is string => !!provider),
			);
			if (!filters.embedProvider.some((provider) => providers.has(provider))) {
				return false;
			}
		}

		if (filters.excludeEmbedProviders && filters.excludeEmbedProviders.length > 0) {
			const providers = new Set(
				message.embeds.map((embed) => embed.provider?.name).filter((provider): provider is string => !!provider),
			);
			if (filters.excludeEmbedProviders.some((provider) => providers.has(provider))) {
				return false;
			}
		}

		const linkHostnames = this.extractLinkHostnames(message);
		if (filters.linkHostname && filters.linkHostname.length > 0) {
			if (!filters.linkHostname.some((hostname) => linkHostnames.has(hostname))) {
				return false;
			}
		}
		if (filters.excludeLinkHostnames && filters.excludeLinkHostnames.length > 0) {
			if (filters.excludeLinkHostnames.some((hostname) => linkHostnames.has(hostname))) {
				return false;
			}
		}

		const attachmentInfo = this.extractAttachmentInfo(message);
		if (filters.attachmentFilename && filters.attachmentFilename.length > 0) {
			if (!filters.attachmentFilename.some((filename) => attachmentInfo.filenames.has(filename))) {
				return false;
			}
		}
		if (filters.excludeAttachmentFilenames && filters.excludeAttachmentFilenames.length > 0) {
			if (filters.excludeAttachmentFilenames.some((filename) => attachmentInfo.filenames.has(filename))) {
				return false;
			}
		}

		if (filters.attachmentExtension && filters.attachmentExtension.length > 0) {
			if (!filters.attachmentExtension.some((extension) => attachmentInfo.extensions.has(extension))) {
				return false;
			}
		}
		if (filters.excludeAttachmentExtensions && filters.excludeAttachmentExtensions.length > 0) {
			if (filters.excludeAttachmentExtensions.some((extension) => attachmentInfo.extensions.has(extension))) {
				return false;
			}
		}

		return true;
	}

	private matchesSearchText(content: string, searchText: string, searchTerms: Array<string>): {matched: boolean; score: number} {
		if (!searchText) {
			return {matched: true, score: 0};
		}

		const normalizedContent = this.normalizeSearchText([content]);
		if (!normalizedContent) {
			return {matched: false, score: 0};
		}

		let score = 0;
		const exactIndex = normalizedContent.indexOf(searchText);
		if (exactIndex >= 0) {
			score += 200;
		}

		let matchedTerms = 0;
		for (const term of searchTerms) {
			if (normalizedContent.includes(term)) {
				matchedTerms++;
				score += 20;
			}
		}

		if (exactIndex < 0 && matchedTerms === 0) {
			return {matched: false, score: 0};
		}

		if (searchTerms.length > 1 && matchedTerms === searchTerms.length) {
			score += 50;
		}

		return {matched: true, score};
	}

	private sortHits(
		hits: Array<InternalMessageSearchHit>,
		sortBy: NonNullable<MessageSearchFilters['sortBy']>,
		sortOrder: NonNullable<MessageSearchFilters['sortOrder']>,
	): Array<InternalMessageSearchHit> {
		return [...hits].sort((left, right) => {
			if (sortBy === 'relevance') {
				if (right.score !== left.score) {
					const compare = right.score - left.score;
					return sortOrder === 'asc' ? -compare : compare;
				}
			}

			if (right.createdAt !== left.createdAt) {
				const compare = right.createdAt - left.createdAt;
				return sortOrder === 'asc' ? -compare : compare;
			}

			const compareIds = left.id.localeCompare(right.id);
			return sortOrder === 'asc' ? compareIds : -compareIds;
		});
	}

	private async getAuthorType(message: Message, cache: Map<string, Promise<AuthorType>>): Promise<AuthorType> {
		if (message.webhookId) {
			return 'webhook';
		}

		if (!message.authorId || !this.userRepository) {
			return 'user';
		}

		const key = message.authorId.toString();
		let cached = cache.get(key);
		if (!cached) {
			cached = this.userRepository
				.findUnique(message.authorId)
				.then((user) => (user?.isBot ? 'bot' : 'user'))
				.catch(() => 'user');
			cache.set(key, cached);
		}

		return cached;
	}

	private messageHasType(message: Message, hasType: string): boolean {
		switch (hasType) {
			case 'image':
				return message.attachments.some((attachment) => attachment.contentType.trim().toLowerCase().startsWith('image/'));
			case 'sound':
				return message.attachments.some((attachment) => attachment.contentType.trim().toLowerCase().startsWith('audio/'));
			case 'video':
				return message.attachments.some((attachment) => attachment.contentType.trim().toLowerCase().startsWith('video/'));
			case 'file':
				return message.attachments.length > 0;
			case 'sticker':
				return message.stickers.length > 0;
			case 'embed':
				return message.embeds.length > 0;
			case 'link':
				return this.extractLinkHostnames(message).size > 0;
			case 'poll':
				return false;
			case 'snapshot':
				return message.reference?.type === MessageReferenceTypes.FORWARD;
			default:
				return false;
		}
	}

	private extractLinkHostnames(message: Message): Set<string> {
		const hostnames = new Set<string>();

		if (message.content) {
			const matches = message.content.matchAll(/https?:\/\/([^/\s]+)/g);
			for (const match of matches) {
				const hostname = match[1];
				if (hostname) {
					hostnames.add(hostname);
				}
			}
		}

		for (const embed of message.embeds) {
			if (!embed.url) continue;
			try {
				const url = new URL(embed.url);
				hostnames.add(url.hostname);
			} catch {}
		}

		return hostnames;
	}

	private extractAttachmentInfo(message: Message): {filenames: Set<string>; extensions: Set<string>} {
		const filenames = new Set<string>();
		const extensions = new Set<string>();

		for (const attachment of message.attachments) {
			filenames.add(attachment.filename);

			const parts = attachment.filename.split('.');
			const ext = parts.length > 1 ? parts[parts.length - 1]?.toLowerCase() ?? '' : '';
			if (ext.length > 0 && ext.length <= 10) {
				extensions.add(ext);
			}
		}

		return {filenames, extensions};
	}

	private normalizeSearchText(parts: Array<string | null | undefined>): string {
		return parts
			.filter((part): part is string => typeof part === 'string' && part.trim().length > 0)
			.join(' ')
			.normalize('NFKC')
			.toLowerCase()
			.replace(/\s+/g, ' ')
			.trim();
	}

	private splitSearchTerms(searchText: string): Array<string> {
		if (!searchText) {
			return [];
		}

		return searchText.split(' ').map((part) => part.trim()).filter((part) => part.length > 0);
	}
}
