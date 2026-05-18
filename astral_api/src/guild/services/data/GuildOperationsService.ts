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

import {
	type ChannelID,
	createChannelID,
	createGuildID,
	type GuildID,
	guildIdToRoleId,
	type UserID,
} from '~/BrandedTypes';
import {
	ChannelTypes,
	DEFAULT_PERMISSIONS,
	GuildFeatures,
	GuildSplashCardAlignment,
	type GuildSplashCardAlignmentValue,
	MAX_GUILDS_NON_PREMIUM,
	MAX_GUILDS_PREMIUM,
	Permissions,
	SystemChannelFlags,
} from '~/Constants';
import type {IChannelRepository} from '~/channel/IChannelRepository';
import type {ChannelService} from '~/channel/services/ChannelService';
import {AuditLogActionType} from '~/constants/AuditLogActionType';
import {JoinSourceTypes} from '~/constants/Guild';
import {InputValidationError, MaxGuildsError, MissingPermissionsError, UnknownGuildError} from '~/Errors';
import type {
	GuildCreateRequest,
	GuildDiscoveryResponse,
	GuildPartialResponse,
	GuildResponse,
	GuildUpdateRequest,
} from '~/guild/GuildModel';
import {mapGuildToDiscoveryResponse, mapGuildToGuildResponse, mapGuildToPartialResponse} from '~/guild/GuildModel';
import type {IGuildRepository} from '~/guild/IGuildRepository';
import {moderateText} from '~/infrastructure/ContentModerationHelper';
import type {EntityAssetService, PreparedAssetUpload} from '~/infrastructure/EntityAssetService';
import type {IGatewayService} from '~/infrastructure/IGatewayService';
import type {IGrokService} from '~/infrastructure/IGrokService';
import {getMetricsService} from '~/infrastructure/MetricsService';
import type {SnowflakeService} from '~/infrastructure/SnowflakeService';
import type {InviteRepository} from '~/invite/InviteRepository';
import {Logger} from '~/Logger';
import {getGuildSearchService} from '~/Meilisearch';
import type {Guild, User} from '~/Models';
import type {RequestCache} from '~/middleware/RequestCacheMiddleware';
import type {IUserRepository} from '~/user/IUserRepository';
import {extractTimestamp} from '~/utils/SnowflakeUtils';
import type {IWebhookRepository} from '~/webhook/IWebhookRepository';
import type {GuildDataHelpers} from './GuildDataHelpers';
import type {GuildDiscoveryApplicationRepository} from '../../repositories/GuildDiscoveryApplicationRepository';

interface PreparedGuildAssets {
	icon: PreparedAssetUpload | null;
	banner: PreparedAssetUpload | null;
	splash: PreparedAssetUpload | null;
	embed_splash: PreparedAssetUpload | null;
}

const BASE_GUILD_FEATURES: ReadonlyArray<string> = [
	GuildFeatures.ANIMATED_ICON,
	GuildFeatures.ANIMATED_BANNER,
	GuildFeatures.BANNER,
	GuildFeatures.INVITE_SPLASH,
];

const DISCOVERY_NEW_GUILD_WINDOW_MS = 45 * 24 * 60 * 60 * 1000;
const DISCOVERY_METRICS_CACHE_TTL_MS = 30 * 1000;
const DISCOVERY_METRICS_CACHE_MAX_ENTRIES = 5000;
const DISCOVERY_METRICS_CONCURRENCY = 16;

export const GUILD_DISCOVERY_CATEGORY_IDS = [
	'all',
	'featured',
	'voice',
	'media',
	'expressive',
	'large',
	'new',
] as const;

export type GuildDiscoveryCategoryId = (typeof GUILD_DISCOVERY_CATEGORY_IDS)[number];
type GuildDiscoverySortBy = 'relevance' | 'memberCount' | 'createdAt' | 'trending';

interface GuildDiscoveryMetrics {
	presenceCount: number;
	trendingScore: number;
}

interface CachedGuildDiscoveryMetrics extends GuildDiscoveryMetrics {
	expiresAt: number;
}

const discoveryMetricsCache = new Map<string, CachedGuildDiscoveryMetrics>();

interface GuildDiscoveryCategoryDefinition {
	id: GuildDiscoveryCategoryId;
	label: string;
	description: string;
	matches: (guild: Guild, nowMs: number) => boolean;
}

const GUILD_DISCOVERY_TAXONOMY: ReadonlyArray<GuildDiscoveryCategoryDefinition> = [
	{
		id: 'all',
		label: 'All',
		description: 'All discoverable communities',
		matches: () => true,
	},
	{
		id: 'featured',
		label: 'Featured',
		description: 'Verified or curated communities',
		matches: (guild) =>
			guild.features.has(GuildFeatures.VERIFIED) ||
			guild.features.has(GuildFeatures.VISIONARY) ||
			guild.features.has(GuildFeatures.OPERATOR),
	},
	{
		id: 'voice',
		label: 'Voice',
		description: 'Communities with advanced voice features',
		matches: (guild) => guild.features.has(GuildFeatures.VIP_VOICE),
	},
	{
		id: 'media',
		label: 'Media Rich',
		description: 'Communities with enhanced visual branding',
		matches: (guild) =>
			guild.features.has(GuildFeatures.BANNER) ||
			guild.features.has(GuildFeatures.ANIMATED_BANNER) ||
			guild.features.has(GuildFeatures.ANIMATED_ICON) ||
			guild.features.has(GuildFeatures.INVITE_SPLASH),
	},
	{
		id: 'expressive',
		label: 'Expressive',
		description: 'Communities with expanded emoji and sticker capacity',
		matches: (guild) =>
			guild.features.has(GuildFeatures.MORE_EMOJI) ||
			guild.features.has(GuildFeatures.MORE_STICKERS) ||
			guild.features.has(GuildFeatures.UNLIMITED_EMOJI) ||
			guild.features.has(GuildFeatures.UNLIMITED_STICKERS),
	},
	{
		id: 'large',
		label: 'Large',
		description: 'Communities with large member bases',
		matches: (guild) => guild.memberCount >= 1000,
	},
	{
		id: 'new',
		label: 'New',
		description: 'Recently created communities',
		matches: (guild, nowMs) => nowMs - extractTimestamp(guild.id) <= DISCOVERY_NEW_GUILD_WINDOW_MS,
	},
];

const normalizeTrendingScore = (memberCount: number, presenceCount: number): number => {
	const onlineComponent = Math.log10(1 + Math.max(0, presenceCount));
	const memberComponent = Math.log10(1 + Math.max(0, memberCount));
	const activityRatio = memberCount > 0 ? presenceCount / memberCount : 0;
	const activityComponent = Math.min(1, activityRatio * 8);
	return Number((onlineComponent * 0.5 + memberComponent * 0.3 + activityComponent * 0.2).toFixed(6));
};

const getDiscoveryCategoryDefinition = (categoryId: GuildDiscoveryCategoryId): GuildDiscoveryCategoryDefinition =>
	GUILD_DISCOVERY_TAXONOMY.find((category) => category.id === categoryId) ?? GUILD_DISCOVERY_TAXONOMY[0];

export class GuildOperationsService {
	constructor(
		private readonly guildRepository: IGuildRepository,
		private readonly channelRepository: IChannelRepository,
		private readonly inviteRepository: InviteRepository,
		private readonly channelService: ChannelService,
		private readonly gatewayService: IGatewayService,
		private readonly entityAssetService: EntityAssetService,
		private readonly userRepository: IUserRepository,
		private readonly snowflakeService: SnowflakeService,
		private readonly webhookRepository: IWebhookRepository,
		private readonly discoveryApplicationRepository: GuildDiscoveryApplicationRepository,
		private readonly helpers: GuildDataHelpers,
		private readonly grokService: IGrokService,
	) {}

	async getGuild({userId, guildId}: {userId: UserID; guildId: GuildID}): Promise<GuildResponse> {
		const guild = await this.gatewayService.getGuildData({guildId, userId});
		if (!guild) throw new UnknownGuildError();
		return guild;
	}

	async getUserGuilds(userId: UserID): Promise<Array<GuildResponse>> {
		const guilds = await this.guildRepository.listUserGuilds(userId);
		const guildsWithPermissions = await Promise.all(
			guilds.map(async (guild) => {
				const permissions = await this.gatewayService.getUserPermissions({guildId: guild.id, userId});
				return mapGuildToGuildResponse(guild, {permissions});
			}),
		);
		guildsWithPermissions.sort((a, b) => a.id.localeCompare(b.id));
		return guildsWithPermissions;
	}

	async getGuildDiscovery(params: {
		userId: UserID;
		query: string;
		limit: number;
		offset: number;
		sortBy: GuildDiscoverySortBy;
		sortOrder: 'asc' | 'desc';
		category: GuildDiscoveryCategoryId;
	}): Promise<GuildDiscoveryResponse> {
		const {userId, query, limit, offset, sortBy, sortOrder, category} = params;
		const trimmedQuery = query.trim();
		const normalizedQuery = trimmedQuery.toLowerCase();
		const nowMs = Date.now();
		const requiresRescore = sortBy === 'trending' || category !== 'all';
		const candidateLimit = requiresRescore
			? Math.min(Math.max((offset + limit) * 6, 180), 1000)
			: Math.min(Math.max(offset + limit, limit), 1000);

		let candidateGuilds: Array<Guild> = [];
		let usedSearch = false;

		const guildSearchService = getGuildSearchService();
		if (guildSearchService) {
			try {
				const discoverySearchSortBy = trimmedQuery.length > 0 ? 'relevance' : 'memberCount';
				const {hits} = await guildSearchService.searchGuilds(
					trimmedQuery,
					{
						sortBy: discoverySearchSortBy,
						sortOrder: 'desc',
					},
					{
						limit: candidateLimit,
						offset: 0,
					},
				);

				const guildIds = hits.map((hit) => createGuildID(BigInt(hit.id)));
				const guilds = guildIds.length > 0 ? await this.guildRepository.listGuilds(guildIds) : [];
				const guildById = new Map(guilds.map((guild) => [guild.id.toString(), guild]));
				candidateGuilds = hits.map((hit) => guildById.get(hit.id)).filter((guild): guild is Guild => guild != null);
				usedSearch = true;
			} catch (error) {
				Logger.warn({error, query: trimmedQuery}, 'Guild discovery search failed, falling back to Cassandra');
			}
		}

		if (!usedSearch) {
			const scanTarget = Math.min(Math.max(candidateLimit * 3, 240), 4500);
			const pageSize = Math.min(Math.max(Math.floor(candidateLimit / 2), 80), 200);
			let lastGuildId: GuildID | undefined;
			const collectedGuilds: Array<Guild> = [];

			while (collectedGuilds.length < scanTarget) {
				const page = await this.guildRepository.listAllGuildsPaginated(pageSize, lastGuildId);
				if (page.length === 0) break;
				collectedGuilds.push(...page);
				lastGuildId = page[page.length - 1]?.id;
				if (page.length < pageSize) break;
			}

			const filteredGuilds =
				normalizedQuery.length === 0
					? collectedGuilds
					: collectedGuilds.filter((guild) => {
							const lowerName = guild.name.toLowerCase();
							const lowerVanity = guild.vanityUrlCode?.toLowerCase() ?? '';
							return lowerName.includes(normalizedQuery) || lowerVanity.includes(normalizedQuery);
						});

			filteredGuilds.sort((a, b) => {
				const aName = a.name.toLowerCase();
				const bName = b.name.toLowerCase();
				const aVanity = a.vanityUrlCode?.toLowerCase() ?? '';
				const bVanity = b.vanityUrlCode?.toLowerCase() ?? '';
				const aStarts = aName.startsWith(normalizedQuery) || aVanity.startsWith(normalizedQuery);
				const bStarts = bName.startsWith(normalizedQuery) || bVanity.startsWith(normalizedQuery);
				if (aStarts !== bStarts) return aStarts ? -1 : 1;
				if (a.memberCount !== b.memberCount) return b.memberCount - a.memberCount;
				if (a.id === b.id) return 0;
				return a.id > b.id ? -1 : 1;
			});

			candidateGuilds = filteredGuilds.slice(0, candidateLimit);
		}
		candidateGuilds = candidateGuilds.filter(
			(guild) =>
				guild.features.has(GuildFeatures.DISCOVERY_APPROVED) &&
				!guild.features.has(GuildFeatures.DISCOVERY_DISABLED),
		);

		const taxonomy = GUILD_DISCOVERY_TAXONOMY.map((taxonomyCategory) => ({
			id: taxonomyCategory.id,
			label: taxonomyCategory.label,
			description: taxonomyCategory.description,
			count: candidateGuilds.filter((guild) => taxonomyCategory.matches(guild, nowMs)).length,
		}));

		if (candidateGuilds.length === 0) {
			return {
				guilds: [],
				total: 0,
				taxonomy,
			};
		}

		const selectedCategory = getDiscoveryCategoryDefinition(category);
		const categorizedGuilds =
			selectedCategory.id === 'all'
				? candidateGuilds
				: candidateGuilds.filter((guild) => selectedCategory.matches(guild, nowMs));

		if (categorizedGuilds.length === 0) {
			return {
				guilds: [],
				total: 0,
				taxonomy,
			};
		}

		const userGuilds = await this.guildRepository.listUserGuilds(userId);
		const userGuildIds = new Set(userGuilds.map((guild) => guild.id.toString()));

		const orderedGuilds = [...categorizedGuilds];
		const shouldSortTrending = sortBy === 'trending';
		let metricsByGuildId: Map<string, GuildDiscoveryMetrics> | null = null;

		if (shouldSortTrending) {
			metricsByGuildId = await this.getDiscoveryMetrics(categorizedGuilds);
			orderedGuilds.sort((a, b) => {
				const aMetrics = metricsByGuildId?.get(a.id.toString());
				const bMetrics = metricsByGuildId?.get(b.id.toString());
				const aScore = aMetrics?.trendingScore ?? 0;
				const bScore = bMetrics?.trendingScore ?? 0;
				if (aScore !== bScore) {
					return sortOrder === 'asc' ? aScore - bScore : bScore - aScore;
				}
				if (a.memberCount !== b.memberCount) {
					return b.memberCount - a.memberCount;
				}
				return a.id > b.id ? -1 : 1;
			});
		} else if (sortBy === 'memberCount') {
			orderedGuilds.sort((a, b) =>
				sortOrder === 'asc' ? a.memberCount - b.memberCount : b.memberCount - a.memberCount,
			);
		} else if (sortBy === 'createdAt') {
			orderedGuilds.sort((a, b) => {
				if (a.id === b.id) return 0;
				return sortOrder === 'asc' ? (a.id < b.id ? -1 : 1) : a.id > b.id ? -1 : 1;
			});
		} else if (!usedSearch) {
			orderedGuilds.sort((a, b) => {
				const aName = a.name.toLowerCase();
				const bName = b.name.toLowerCase();
				const aVanity = a.vanityUrlCode?.toLowerCase() ?? '';
				const bVanity = b.vanityUrlCode?.toLowerCase() ?? '';
				const aStarts = aName.startsWith(normalizedQuery) || aVanity.startsWith(normalizedQuery);
				const bStarts = bName.startsWith(normalizedQuery) || bVanity.startsWith(normalizedQuery);
				if (aStarts !== bStarts) return aStarts ? -1 : 1;
				if (a.memberCount !== b.memberCount) return b.memberCount - a.memberCount;
				if (a.id === b.id) return 0;
				return a.id > b.id ? -1 : 1;
			});
		}

		if (sortBy === 'relevance' && sortOrder === 'asc') {
			orderedGuilds.reverse();
		}

		const pagedGuilds = orderedGuilds.slice(offset, offset + limit);
		if (pagedGuilds.length === 0) {
			return {
				guilds: [],
				total: categorizedGuilds.length,
				taxonomy,
			};
		}

		if (!metricsByGuildId) {
			metricsByGuildId = await this.getDiscoveryMetrics(pagedGuilds);
		}

		const tagRows = await Promise.all(
			pagedGuilds.map(async (guild) => {
				const row = await this.discoveryApplicationRepository.findByGuildId(guild.id);
				return [guild.id.toString(), row?.tags ? Array.from(row.tags) : []] as const;
			}),
		);
		const tagsByGuildId = new Map<string, Array<string>>(tagRows);

		const guilds = pagedGuilds.map((guild) => {
			const metrics = metricsByGuildId?.get(guild.id.toString()) ?? {presenceCount: 0, trendingScore: 0};
			return mapGuildToDiscoveryResponse(guild, {
				presenceCount: metrics.presenceCount,
				trendingScore: metrics.trendingScore,
				isMember: userGuildIds.has(guild.id.toString()),
				tags: tagsByGuildId.get(guild.id.toString()) ?? [],
			});
		});

		return {
			guilds,
			total: categorizedGuilds.length,
			taxonomy,
		};
	}

	private async getDiscoveryMetrics(guilds: Array<Guild>): Promise<Map<string, GuildDiscoveryMetrics>> {
		const now = Date.now();
		const metricsByGuildId = new Map<string, GuildDiscoveryMetrics>();
		const guildsToFetch: Array<Guild> = [];

		for (const guild of guilds) {
			const cacheKey = guild.id.toString();
			const cached = discoveryMetricsCache.get(cacheKey);
			if (cached && cached.expiresAt > now) {
				metricsByGuildId.set(cacheKey, {
					presenceCount: cached.presenceCount,
					trendingScore: cached.trendingScore,
				});
				continue;
			}
			guildsToFetch.push(guild);
		}

		for (let i = 0; i < guildsToFetch.length; i += DISCOVERY_METRICS_CONCURRENCY) {
			const chunk = guildsToFetch.slice(i, i + DISCOVERY_METRICS_CONCURRENCY);
			const metricEntries = await Promise.all(
				chunk.map(async (guild) => {
					let presenceCount = 0;
					try {
						const counts = await this.gatewayService.getGuildCounts(guild.id);
						presenceCount = counts.presenceCount;
					} catch (error) {
						Logger.warn({guildId: guild.id, error}, 'Failed to fetch discovery guild counts');
					}

					return [
						guild.id.toString(),
						{
							presenceCount,
							trendingScore: normalizeTrendingScore(guild.memberCount, presenceCount),
						},
					] as const;
				}),
			);

			for (const [guildId, metrics] of metricEntries) {
				metricsByGuildId.set(guildId, metrics);
				discoveryMetricsCache.set(guildId, {
					...metrics,
					expiresAt: now + DISCOVERY_METRICS_CACHE_TTL_MS,
				});
			}
		}

		if (discoveryMetricsCache.size > DISCOVERY_METRICS_CACHE_MAX_ENTRIES) {
			for (const [guildId, metrics] of discoveryMetricsCache) {
				if (metrics.expiresAt <= now || discoveryMetricsCache.size > DISCOVERY_METRICS_CACHE_MAX_ENTRIES) {
					discoveryMetricsCache.delete(guildId);
				}
				if (discoveryMetricsCache.size <= DISCOVERY_METRICS_CACHE_MAX_ENTRIES) {
					break;
				}
			}
		}

		return metricsByGuildId;
	}

	async getPublicGuildData(guildId: GuildID): Promise<GuildPartialResponse> {
		const guild = await this.guildRepository.findUnique(guildId);
		if (!guild) throw new UnknownGuildError();
		return mapGuildToPartialResponse(guild);
	}

	async getGuildSystem(guildId: GuildID): Promise<Guild> {
		const guild = await this.guildRepository.findUnique(guildId);
		if (!guild) throw new UnknownGuildError();
		return guild;
	}

	async createGuild(
		params: {user: User; data: GuildCreateRequest},
		_auditLogReason?: string | null,
	): Promise<GuildResponse> {
		try {
			const {user, data} = params;
			const currentGuildCount = await this.guildRepository.countUserGuilds(user.id);
			const maxGuilds = user.isPremium() ? MAX_GUILDS_PREMIUM : MAX_GUILDS_NON_PREMIUM;
			if (currentGuildCount >= maxGuilds) throw new MaxGuildsError(maxGuilds);

			const guildId = createGuildID(this.snowflakeService.generate());
			const textCategoryId = createChannelID(this.snowflakeService.generate());
			const voiceCategoryId = createChannelID(this.snowflakeService.generate());
			const generalChannelId = createChannelID(this.snowflakeService.generate());
			const generalVoiceId = createChannelID(this.snowflakeService.generate());

			let preparedIcon: PreparedAssetUpload | null = null;
			if (data.icon) {
				preparedIcon = await this.entityAssetService.prepareAssetUpload({
					assetType: 'icon',
					entityType: 'guild',
					entityId: guildId,
					previousHash: null,
					base64Image: data.icon,
					errorPath: 'icon',
				});
			}
			const iconKey = preparedIcon?.newHash ?? null;
			const shouldUseEmptyFeatures = data.empty_features ?? false;
			const featuresSet = shouldUseEmptyFeatures ? new Set<string>() : new Set(BASE_GUILD_FEATURES);

			const isUnclaimedOwner = !user.passwordHash;
			if (isUnclaimedOwner) {
				featuresSet.add(GuildFeatures.INVITES_DISABLED);
			}

			const guild = await this.guildRepository.upsert({
				guild_id: guildId,
				owner_id: user.id,
				name: data.name,
				vanity_url_code: null,
				icon_hash: iconKey,
				banner_hash: null,
				banner_width: null,
				banner_height: null,
				splash_hash: null,
				splash_width: null,
				splash_height: null,
				splash_card_alignment: GuildSplashCardAlignment.CENTER,
				embed_splash_hash: null,
				embed_splash_width: null,
				embed_splash_height: null,
				features: featuresSet,
				verification_level: 0,
				mfa_level: 0,
				nsfw_level: 0,
				explicit_content_filter: 0,
				default_message_notifications: 0,
				system_channel_id: generalChannelId,
				system_channel_flags: 0,
				rules_channel_id: null,
				afk_channel_id: null,
				afk_timeout: 0,
				disabled_operations: 0,
				member_count: 1,
				audit_logs_indexed_at: null,
				version: 1,
			});

			await Promise.all([
				this.channelRepository.upsert({
					channel_id: textCategoryId,
					guild_id: guildId,
					type: ChannelTypes.GUILD_CATEGORY,
					name: 'Text Channels',
					topic: null,
					icon_hash: null,
					url: null,
					parent_id: null,
					position: 0,
					owner_id: null,
					recipient_ids: null,
					nsfw: false,
					rate_limit_per_user: 0,
					bitrate: null,
					user_limit: null,
					rtc_region: null,
					last_message_id: null,
					last_pin_timestamp: null,
					permission_overwrites: null,
					nicks: null,
					soft_deleted: false,
					indexed_at: null,
					version: 1,
				}),
				this.channelRepository.upsert({
					channel_id: voiceCategoryId,
					guild_id: guildId,
					type: ChannelTypes.GUILD_CATEGORY,
					name: 'Voice Channels',
					topic: null,
					icon_hash: null,
					url: null,
					parent_id: null,
					position: 1,
					owner_id: null,
					recipient_ids: null,
					nsfw: false,
					rate_limit_per_user: 0,
					bitrate: null,
					user_limit: null,
					rtc_region: null,
					last_message_id: null,
					last_pin_timestamp: null,
					permission_overwrites: null,
					nicks: null,
					soft_deleted: false,
					indexed_at: null,
					version: 1,
				}),
				this.channelRepository.upsert({
					channel_id: generalChannelId,
					guild_id: guildId,
					type: ChannelTypes.GUILD_TEXT,
					name: 'general',
					topic: null,
					icon_hash: null,
					url: null,
					parent_id: textCategoryId,
					position: 0,
					owner_id: null,
					recipient_ids: null,
					nsfw: false,
					rate_limit_per_user: 0,
					bitrate: null,
					user_limit: null,
					rtc_region: null,
					last_message_id: null,
					last_pin_timestamp: null,
					permission_overwrites: null,
					nicks: null,
					soft_deleted: false,
					indexed_at: null,
					version: 1,
				}),
				this.channelRepository.upsert({
					channel_id: generalVoiceId,
					guild_id: guildId,
					type: ChannelTypes.GUILD_VOICE,
					name: 'General',
					topic: null,
					icon_hash: null,
					url: null,
					parent_id: voiceCategoryId,
					position: 0,
					owner_id: null,
					recipient_ids: null,
					nsfw: false,
					rate_limit_per_user: 0,
					bitrate: 64000,
					user_limit: 0,
					rtc_region: null,
					last_message_id: null,
					last_pin_timestamp: null,
					permission_overwrites: null,
					nicks: null,
					soft_deleted: false,
					indexed_at: null,
					version: 1,
				}),
				this.guildRepository.upsertRole({
					guild_id: guildId,
					role_id: guildIdToRoleId(guildId),
					name: '@everyone',
					permissions: DEFAULT_PERMISSIONS,
					position: 0,
					hoist_position: null,
					color: 0,
					icon_hash: null,
					unicode_emoji: null,
					hoist: false,
					mentionable: false,
					version: 1,
				}),
				this.guildRepository.upsertMember({
					guild_id: guildId,
					user_id: user.id,
					joined_at: new Date(),
					nick: null,
					avatar_hash: null,
					banner_hash: null,
					bio: null,
					pronouns: null,
					accent_color: null,
					join_source_type: JoinSourceTypes.INVITE,
					source_invite_code: null,
					inviter_id: null,
					deaf: false,
					mute: false,
					communication_disabled_until: null,
					role_ids: null,
					is_premium_sanitized: null,
					temporary: false,
					profile_flags: null,
					version: 1,
				}),
			]);

			await this.gatewayService.startGuild(guildId);
			await this.gatewayService.joinGuild({userId: user.id, guildId});

			const guildSearchService = getGuildSearchService();
			if (guildSearchService) {
				await guildSearchService.indexGuild(guild).catch((error) => {
					Logger.error({guildId: guild.id, error}, 'Failed to index guild in search');
				});
			}

			getMetricsService().counter({name: 'guild.create'});

			return mapGuildToGuildResponse(guild);
		} catch (error) {
			getMetricsService().counter({name: 'guild.create.error'});
			throw error;
		}
	}

	async updateGuild(
		params: {userId: UserID; guildId: GuildID; data: GuildUpdateRequest; requestCache: RequestCache},
		auditLogReason?: string | null,
	): Promise<GuildResponse> {
		const {userId, guildId, data} = params;
		const {checkPermission, guildData} = await this.helpers.getGuildAuthenticated({userId, guildId});
		await checkPermission(Permissions.MANAGE_GUILD);

		const currentGuild = await this.guildRepository.findUnique(guildId);
		if (!currentGuild) throw new UnknownGuildError();

		if (data.name) {
			await moderateText(this.grokService, data.name, 'name');
		}

		const previousSnapshot = this.helpers.serializeGuildForAudit(currentGuild);

		if (data.mfa_level !== undefined) {
			const isOwner = guildData.owner_id === userId.toString();
			if (!isOwner) {
				throw new MissingPermissionsError();
			}

			if (data.mfa_level === 1) {
				const owner = await this.userRepository.findUniqueAssert(userId);
				if (owner.authenticatorTypes.size === 0) {
					throw InputValidationError.create(
						'mfa_level',
						'You must enable 2FA on your account before requiring it for moderators',
					);
				}
			}
		}

		const preparedAssets: PreparedGuildAssets = {icon: null, banner: null, splash: null, embed_splash: null};

		let iconHash = currentGuild.iconHash;
		if (data.icon !== undefined) {
			preparedAssets.icon = await this.entityAssetService.prepareAssetUpload({
				assetType: 'icon',
				entityType: 'guild',
				entityId: guildId,
				previousHash: currentGuild.iconHash,
				base64Image: data.icon,
				errorPath: 'icon',
			});
			iconHash = preparedAssets.icon.newHash;
		}

		let bannerHash = currentGuild.bannerHash;
		let bannerHeight = currentGuild.bannerHeight;
		let bannerWidth = currentGuild.bannerWidth;
		if (data.banner !== undefined) {
			if (data.banner && !currentGuild.features.has(GuildFeatures.BANNER)) {
				await this.rollbackPreparedAssets(preparedAssets);
				throw InputValidationError.create('banner', 'Guild banner requires BANNER feature');
			}

			try {
				preparedAssets.banner = await this.entityAssetService.prepareAssetUpload({
					assetType: 'banner',
					entityType: 'guild',
					entityId: guildId,
					previousHash: currentGuild.bannerHash,
					base64Image: data.banner,
					errorPath: 'banner',
				});

				if (preparedAssets.banner.isAnimated && !currentGuild.features.has(GuildFeatures.ANIMATED_BANNER)) {
					await this.rollbackPreparedAssets(preparedAssets);
					throw InputValidationError.create('banner', 'Animated guild banner requires ANIMATED_BANNER feature');
				}

				bannerHash = preparedAssets.banner.newHash;
				bannerHeight =
					preparedAssets.banner.newHash === currentGuild.bannerHash && bannerHeight != null
						? bannerHeight
						: (preparedAssets.banner.height ?? null);
				bannerWidth =
					preparedAssets.banner.newHash === currentGuild.bannerHash && bannerWidth != null
						? bannerWidth
						: (preparedAssets.banner.width ?? null);
			} catch (error) {
				await this.rollbackPreparedAssets(preparedAssets);
				throw error;
			}
		} else if (data.banner === null) {
			bannerHeight = null;
			bannerWidth = null;
		}

		let splashHash = currentGuild.splashHash;
		let splashWidth = currentGuild.splashWidth;
		let splashHeight = currentGuild.splashHeight;
		if (data.splash !== undefined) {
			if (data.splash && !currentGuild.features.has(GuildFeatures.INVITE_SPLASH)) {
				await this.rollbackPreparedAssets(preparedAssets);
				throw InputValidationError.create('splash', 'Invite splash requires INVITE_SPLASH feature');
			}

			try {
				preparedAssets.splash = await this.entityAssetService.prepareAssetUpload({
					assetType: 'splash',
					entityType: 'guild',
					entityId: guildId,
					previousHash: currentGuild.splashHash,
					base64Image: data.splash,
					errorPath: 'splash',
				});
				splashHash = preparedAssets.splash.newHash;
				splashHeight =
					preparedAssets.splash.newHash === currentGuild.splashHash && splashHeight != null
						? splashHeight
						: (preparedAssets.splash.height ?? null);
				splashWidth =
					preparedAssets.splash.newHash === currentGuild.splashHash && splashWidth != null
						? splashWidth
						: (preparedAssets.splash.width ?? null);
			} catch (error) {
				await this.rollbackPreparedAssets(preparedAssets);
				throw error;
			}
		} else if (data.splash === null) {
			splashHash = null;
			splashWidth = null;
			splashHeight = null;
		}

		let embedSplashHash = currentGuild.embedSplashHash;
		let embedSplashWidth = currentGuild.embedSplashWidth;
		let embedSplashHeight = currentGuild.embedSplashHeight;
		if (data.embed_splash !== undefined) {
			if (data.embed_splash && !currentGuild.features.has(GuildFeatures.INVITE_SPLASH)) {
				await this.rollbackPreparedAssets(preparedAssets);
				throw InputValidationError.create('embed_splash', 'Embed splash requires INVITE_SPLASH feature');
			}

			try {
				preparedAssets.embed_splash = await this.entityAssetService.prepareAssetUpload({
					assetType: 'embed_splash',
					entityType: 'guild',
					entityId: guildId,
					previousHash: currentGuild.embedSplashHash,
					base64Image: data.embed_splash,
					errorPath: 'embed_splash',
				});
				embedSplashHash = preparedAssets.embed_splash.newHash;
				embedSplashHeight =
					preparedAssets.embed_splash.newHash === currentGuild.embedSplashHash && embedSplashHeight != null
						? embedSplashHeight
						: (preparedAssets.embed_splash.height ?? null);
				embedSplashWidth =
					preparedAssets.embed_splash.newHash === currentGuild.embedSplashHash && embedSplashWidth != null
						? embedSplashWidth
						: (preparedAssets.embed_splash.width ?? null);
			} catch (error) {
				await this.rollbackPreparedAssets(preparedAssets);
				throw error;
			}
		} else if (data.embed_splash === null) {
			embedSplashHash = null;
			embedSplashWidth = null;
			embedSplashHeight = null;
		}

		let afkChannelId: ChannelID | null | undefined;
		if (data.afk_channel_id !== undefined) {
			if (data.afk_channel_id) {
				afkChannelId = createChannelID(data.afk_channel_id);
				const afkChannel = await this.channelRepository.findUnique(afkChannelId);
				if (!afkChannel || afkChannel.guildId !== guildId) {
					throw InputValidationError.create('afk_channel_id', 'AFK channel must be in this guild');
				}
				if (afkChannel.type !== ChannelTypes.GUILD_VOICE) {
					throw InputValidationError.create('afk_channel_id', 'AFK channel must be a voice channel');
				}
			} else {
				afkChannelId = null;
			}
		}

		let systemChannelId: ChannelID | null | undefined;
		if (data.system_channel_id !== undefined) {
			if (data.system_channel_id) {
				systemChannelId = createChannelID(data.system_channel_id);
				const systemChannel = await this.channelRepository.findUnique(systemChannelId);
				if (!systemChannel || systemChannel.guildId !== guildId) {
					throw InputValidationError.create('system_channel_id', 'System channel must be in this guild');
				}
				if (systemChannel.type !== ChannelTypes.GUILD_TEXT) {
					throw InputValidationError.create('system_channel_id', 'System channel must be a text channel');
				}
			} else {
				systemChannelId = null;
			}
		}

		let sanitizedSystemChannelFlags = currentGuild.systemChannelFlags;
		if (data.system_channel_flags !== undefined) {
			const SUPPORTED_SYSTEM_CHANNEL_FLAGS = SystemChannelFlags.SUPPRESS_JOIN_NOTIFICATIONS;
			sanitizedSystemChannelFlags = data.system_channel_flags & SUPPORTED_SYSTEM_CHANNEL_FLAGS;
		}

		let updatedFeatures = currentGuild.features;
		if (data.features !== undefined) {
			const newFeatures = new Set(currentGuild.features);

			const owner = await this.userRepository.findUnique(currentGuild.ownerId);
			const isOwnerUnclaimed = owner && !owner.passwordHash;

			const toggleableFeatures = [
				GuildFeatures.INVITES_DISABLED,
				GuildFeatures.TEXT_CHANNEL_FLEXIBLE_NAMES,
				GuildFeatures.DETACHED_BANNER,
				GuildFeatures.DISCOVERY_DISABLED,
				GuildFeatures.DISALLOW_UNCLAIMED_ACCOUNTS,
				// Note: DISCOVERY_APPROVED is intentionally NOT in this list — it
				// can only be set by an admin through the discovery moderation queue
				// (see GuildDiscoveryService.approveApplication). Owners can hide a
				// guild via DISCOVERY_DISABLED but cannot grant themselves visibility.
			];

			for (const feature of toggleableFeatures) {
				if (feature === GuildFeatures.INVITES_DISABLED && isOwnerUnclaimed) {
					newFeatures.add(feature);
					continue;
				}

				if (data.features.includes(feature)) {
					newFeatures.add(feature);
				} else {
					newFeatures.delete(feature);
				}
			}

			updatedFeatures = newFeatures;
		}

		const currentGuildRow = currentGuild.toRow();
		const splashCardAlignment: GuildSplashCardAlignmentValue =
			data.splash_card_alignment ?? currentGuildRow.splash_card_alignment ?? GuildSplashCardAlignment.CENTER;
		const upsertData = {
			...currentGuildRow,
			name: data.name ?? currentGuildRow.name,
			icon_hash: iconHash,
			banner_hash: bannerHash,
			banner_width: bannerWidth,
			banner_height: bannerHeight,
			splash_hash: splashHash,
			splash_width: splashWidth,
			splash_height: splashHeight,
			splash_card_alignment: splashCardAlignment,
			embed_splash_hash: embedSplashHash,
			embed_splash_width: embedSplashWidth,
			embed_splash_height: embedSplashHeight,
			features: updatedFeatures,
			system_channel_id: systemChannelId !== undefined ? systemChannelId : currentGuildRow.system_channel_id,
			system_channel_flags: sanitizedSystemChannelFlags,
			afk_channel_id: afkChannelId !== undefined ? afkChannelId : currentGuildRow.afk_channel_id,
			afk_timeout: data.afk_timeout ?? currentGuildRow.afk_timeout,
			default_message_notifications:
				data.default_message_notifications ?? currentGuildRow.default_message_notifications,
			verification_level: data.verification_level ?? currentGuildRow.verification_level,
			mfa_level: data.mfa_level ?? currentGuildRow.mfa_level,
			explicit_content_filter: data.explicit_content_filter ?? currentGuildRow.explicit_content_filter,
		};
		let updatedGuild: Guild;
		try {
			updatedGuild = await this.guildRepository.upsert(upsertData);
		} catch (error) {
			await this.rollbackPreparedAssets(preparedAssets);
			Logger.error({error, guildId}, 'Guild update failed, rolled back asset uploads');
			throw error;
		}

		try {
			await this.commitPreparedAssets(preparedAssets);
		} catch (error) {
			Logger.error({error, guildId}, 'Failed to commit asset changes after successful guild update');
		}

		await this.helpers.dispatchGuildUpdate(updatedGuild);

		const guildSearchService = getGuildSearchService();
		if (guildSearchService) {
			await guildSearchService.updateGuild(updatedGuild).catch((error) => {
				Logger.error({guildId: updatedGuild.id, error}, 'Failed to update guild in search');
			});
		}

		await this.helpers.recordAuditLog({
			guildId,
			userId,
			action: AuditLogActionType.GUILD_UPDATE,
			targetId: guildId,
			auditLogReason: auditLogReason ?? null,
			metadata: {name: updatedGuild.name},
			changes: this.helpers.computeGuildChanges(previousSnapshot, updatedGuild),
		});

		return mapGuildToGuildResponse(updatedGuild);
	}

	private async rollbackPreparedAssets(assets: PreparedGuildAssets): Promise<void> {
		const rollbackPromises: Array<Promise<void>> = [];

		if (assets.icon) {
			rollbackPromises.push(this.entityAssetService.rollbackAssetUpload(assets.icon));
		}
		if (assets.banner) {
			rollbackPromises.push(this.entityAssetService.rollbackAssetUpload(assets.banner));
		}
		if (assets.splash) {
			rollbackPromises.push(this.entityAssetService.rollbackAssetUpload(assets.splash));
		}
		if (assets.embed_splash) {
			rollbackPromises.push(this.entityAssetService.rollbackAssetUpload(assets.embed_splash));
		}

		await Promise.all(rollbackPromises);
	}

	private async commitPreparedAssets(assets: PreparedGuildAssets): Promise<void> {
		const commitPromises: Array<Promise<void>> = [];

		if (assets.icon) {
			commitPromises.push(this.entityAssetService.commitAssetChange({prepared: assets.icon, deferDeletion: true}));
		}
		if (assets.banner) {
			commitPromises.push(this.entityAssetService.commitAssetChange({prepared: assets.banner, deferDeletion: true}));
		}
		if (assets.splash) {
			commitPromises.push(this.entityAssetService.commitAssetChange({prepared: assets.splash, deferDeletion: true}));
		}
		if (assets.embed_splash) {
			commitPromises.push(
				this.entityAssetService.commitAssetChange({prepared: assets.embed_splash, deferDeletion: true}),
			);
		}

		await Promise.all(commitPromises);
	}

	async deleteGuild(params: {user: User; guildId: GuildID}, _auditLogReason?: string | null): Promise<void> {
		const {user, guildId} = params;
		const {guildData} = await this.helpers.getGuildAuthenticated({userId: user.id, guildId});
		if (!guildData || guildData.owner_id !== user.id.toString()) {
			throw new MissingPermissionsError();
		}

		await this.performGuildDeletion(guildId);
	}

	async deleteGuildById(guildId: GuildID): Promise<void> {
		await this.performGuildDeletion(guildId);
	}

	private async performGuildDeletion(guildId: GuildID): Promise<void> {
		try {
			const guild = await this.guildRepository.findUnique(guildId);
			if (!guild) {
				throw new UnknownGuildError();
			}

			const members = await this.guildRepository.listMembers(guildId);

			await this.gatewayService.dispatchGuild({
				guildId,
				event: 'GUILD_DELETE',
				data: {id: guildId.toString()},
			});

			await Promise.all(
				members.map(async (member) => {
					await this.gatewayService.leaveGuild({userId: member.userId, guildId});
				}),
			);

			await Promise.all(members.map((member) => this.userRepository.deleteGuildSettings(member.userId, guildId)));

			const invites = await this.inviteRepository.listGuildInvites(guildId);
			await Promise.all(invites.map((invite) => this.inviteRepository.delete(invite.code)));

			const webhooks = await this.webhookRepository.listByGuild(guildId);
			await Promise.all(webhooks.map((webhook) => this.webhookRepository.delete(webhook.id)));

			const channels = await this.channelRepository.listGuildChannels(guildId);

			await Promise.all(channels.map((channel) => this.channelRepository.deleteAllChannelMessages(channel.id)));
			await Promise.all(channels.map((channel) => this.channelService.purgeChannelAttachments(channel)));

			await this.guildRepository.delete(guildId);
			await this.gatewayService.stopGuild(guildId);

			const guildSearchService = getGuildSearchService();
			if (guildSearchService) {
				await guildSearchService.deleteGuild(guildId).catch((error) => {
					Logger.error({guildId, error}, 'Failed to delete guild from search');
				});
			}

			getMetricsService().counter({name: 'guild.delete'});
		} catch (error) {
			getMetricsService().counter({name: 'guild.delete.error'});
			throw error;
		}
	}
}
