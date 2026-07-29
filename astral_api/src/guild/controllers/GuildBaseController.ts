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

import type {HonoApp} from '~/App';
import {requireSudoMode} from '~/auth/services/SudoVerificationService';
import {createGuildID, createUserID} from '~/BrandedTypes';
import {AccessDeniedError} from '~/Errors';
import {GuildCreateRequest, GuildUpdateRequest} from '~/guild/GuildModel';
import {GUILD_DISCOVERY_CATEGORY_IDS} from '~/guild/services/data/GuildOperationsService';
import {DefaultUserOnly, LoginRequired} from '~/middleware/AuthMiddleware';
import {RateLimitMiddleware} from '~/middleware/RateLimitMiddleware';
import {SudoModeMiddleware} from '~/middleware/SudoModeMiddleware';
import {RateLimitConfigs} from '~/RateLimitConfig';
import {createQueryIntegerType, Int64Type, PasswordType, SudoVerificationSchema, VanityURLCodeType, z} from '~/Schema';
import {Validator} from '~/Validator';

const GuildDiscoveryQueryRequest = z.object({
	q: z.string().trim().max(120).optional().default(''),
	limit: createQueryIntegerType({defaultValue: 24, minValue: 1, maxValue: 100}),
	offset: createQueryIntegerType({defaultValue: 0, minValue: 0, maxValue: 2000}),
	sort_by: z.enum(['relevance', 'member_count', 'created_at', 'trending']).optional().default('trending'),
	sort_order: z.enum(['asc', 'desc']).optional().default('desc'),
	category: z.enum(GUILD_DISCOVERY_CATEGORY_IDS).optional().default('all'),
});

type GuildDiscoveryQueryRequest = z.infer<typeof GuildDiscoveryQueryRequest>;

const mapDiscoverySortBy = (sortBy: GuildDiscoveryQueryRequest['sort_by']) =>
	sortBy === 'member_count' ? 'memberCount' : sortBy === 'created_at' ? 'createdAt' : sortBy;

const GuildJoinRequestCreateRequest = z.object({
	message: z.string().trim().max(500).optional().default(''),
});

const GuildJoinRequestListQueryRequest = z.object({
	status: z.enum(['pending', 'approved', 'rejected', 'withdrawn']).optional(),
});

const GuildJoinRequestReviewRequest = z.object({
	review_note: z.string().trim().max(1000).nullish(),
});

export const GuildBaseController = (app: HonoApp) => {
	app.post(
		'/guilds',
		RateLimitMiddleware(RateLimitConfigs.GUILD_CREATE),
		Validator('json', GuildCreateRequest),
		LoginRequired,
		async (ctx) => {
			const user = ctx.get('user');
			const data = ctx.req.valid('json');
			const auditLogReason = ctx.get('auditLogReason') ?? null;
			return ctx.json(await ctx.get('guildService').createGuild({user, data}, auditLogReason));
		},
	);

	app.get('/users/@me/guilds', RateLimitMiddleware(RateLimitConfigs.GUILD_LIST), LoginRequired, async (ctx) => {
		if (ctx.get('authTokenType') === 'bearer') {
			const scopes = ctx.get('oauthBearerScopes');
			if (!scopes || !scopes.has('guilds')) {
				throw new AccessDeniedError();
			}
		}
		const userId = ctx.get('user').id;
		return ctx.json(await ctx.get('guildService').getUserGuilds(userId));
	});

	app.get(
		'/guilds/discovery',
		RateLimitMiddleware(RateLimitConfigs.GUILD_LIST),
		LoginRequired,
		Validator('query', GuildDiscoveryQueryRequest),
		async (ctx) => {
			const userId = ctx.get('user').id;
			const query = ctx.req.valid('query');
			return ctx.json(
				await ctx.get('guildService').getGuildDiscovery({
					userId,
					query: query.q,
					limit: query.limit,
					offset: query.offset,
					sortBy: mapDiscoverySortBy(query.sort_by),
					sortOrder: query.sort_order,
					category: query.category,
				}),
			);
		},
	);

	app.get(
		'/discovery/feed',
		RateLimitMiddleware(RateLimitConfigs.GUILD_LIST),
		LoginRequired,
		Validator('query', GuildDiscoveryQueryRequest),
		async (ctx) => {
			const userId = ctx.get('user').id;
			const query = ctx.req.valid('query');
			return ctx.json(
				await ctx.get('guildService').getGuildDiscovery({
					userId,
					query: query.q,
					limit: query.limit,
					offset: query.offset,
					sortBy: mapDiscoverySortBy(query.sort_by),
					sortOrder: query.sort_order,
					category: query.category,
				}),
			);
		},
	);

	app.post(
		'/discovery/guilds/:guild_id/join',
		RateLimitMiddleware(RateLimitConfigs.INVITE_ACCEPT),
		LoginRequired,
		Validator('param', z.object({guild_id: Int64Type})),
		async (ctx) => {
			const userId = ctx.get('user').id;
			const guildId = createGuildID(ctx.req.valid('param').guild_id);
			const requestCache = ctx.get('requestCache');
			return ctx.json(await ctx.get('guildService').joinDiscoverableGuild({userId, guildId, requestCache}));
		},
	);

	app.post(
		'/discovery/guilds/:guild_id/join-request',
		RateLimitMiddleware(RateLimitConfigs.INVITE_ACCEPT),
		LoginRequired,
		Validator('param', z.object({guild_id: Int64Type})),
		Validator('json', GuildJoinRequestCreateRequest),
		async (ctx) => {
			const userId = ctx.get('user').id;
			const guildId = createGuildID(ctx.req.valid('param').guild_id);
			const body = ctx.req.valid('json');
			const message = body.message.length > 0 ? body.message : null;
			return ctx.json(await ctx.get('guildService').submitDiscoveryJoinRequest({userId, guildId, message}), 202);
		},
	);

	app.get(
		'/guilds/:guild_id/join-requests',
		RateLimitMiddleware(RateLimitConfigs.GUILD_GET),
		LoginRequired,
		Validator('param', z.object({guild_id: Int64Type})),
		Validator('query', GuildJoinRequestListQueryRequest),
		async (ctx) => {
			const userId = ctx.get('user').id;
			const guildId = createGuildID(ctx.req.valid('param').guild_id);
			const query = ctx.req.valid('query');
			return ctx.json(await ctx.get('guildService').listGuildJoinRequests({userId, guildId, status: query.status}));
		},
	);

	app.post(
		'/guilds/:guild_id/join-requests/:user_id/approve',
		RateLimitMiddleware(RateLimitConfigs.GUILD_UPDATE),
		LoginRequired,
		Validator('param', z.object({guild_id: Int64Type, user_id: Int64Type})),
		Validator('json', GuildJoinRequestReviewRequest),
		async (ctx) => {
			const userId = ctx.get('user').id;
			const params = ctx.req.valid('param');
			const guildId = createGuildID(params.guild_id);
			const targetId = createUserID(params.user_id);
			const body = ctx.req.valid('json');
			const requestCache = ctx.get('requestCache');
			return ctx.json(
				await ctx.get('guildService').reviewGuildJoinRequest({
					userId,
					guildId,
					targetId,
					approved: true,
					reviewNote: body.review_note ?? null,
					requestCache,
				}),
			);
		},
	);

	app.post(
		'/guilds/:guild_id/join-requests/:user_id/reject',
		RateLimitMiddleware(RateLimitConfigs.GUILD_UPDATE),
		LoginRequired,
		Validator('param', z.object({guild_id: Int64Type, user_id: Int64Type})),
		Validator('json', GuildJoinRequestReviewRequest),
		async (ctx) => {
			const userId = ctx.get('user').id;
			const params = ctx.req.valid('param');
			const guildId = createGuildID(params.guild_id);
			const targetId = createUserID(params.user_id);
			const body = ctx.req.valid('json');
			const requestCache = ctx.get('requestCache');
			return ctx.json(
				await ctx.get('guildService').reviewGuildJoinRequest({
					userId,
					guildId,
					targetId,
					approved: false,
					reviewNote: body.review_note ?? null,
					requestCache,
				}),
			);
		},
	);

	app.delete(
		'/users/@me/guilds/:guild_id',
		RateLimitMiddleware(RateLimitConfigs.GUILD_LEAVE),
		LoginRequired,
		Validator('param', z.object({guild_id: Int64Type})),
		async (ctx) => {
			const userId = ctx.get('user').id;
			const guildId = createGuildID(ctx.req.valid('param').guild_id);
			const auditLogReason = ctx.get('auditLogReason') ?? null;
			await ctx.get('guildService').leaveGuild({userId, guildId}, auditLogReason);
			return ctx.body(null, 204);
		},
	);

	app.get(
		'/guilds/:guild_id',
		RateLimitMiddleware(RateLimitConfigs.GUILD_GET),
		LoginRequired,
		Validator('param', z.object({guild_id: Int64Type})),
		async (ctx) => {
			const userId = ctx.get('user').id;
			const guildId = createGuildID(ctx.req.valid('param').guild_id);
			return ctx.json(await ctx.get('guildService').getGuild({userId, guildId}));
		},
	);

	app.get(
		'/guilds/:guild_id/counts',
		RateLimitMiddleware(RateLimitConfigs.GUILD_GET),
		LoginRequired,
		Validator('param', z.object({guild_id: Int64Type})),
		async (ctx) => {
			const userId = ctx.get('user').id;
			const guildId = createGuildID(ctx.req.valid('param').guild_id);
			return ctx.json(await ctx.get('guildService').getGuildCounts({userId, guildId}));
		},
	);

	app.patch(
		'/guilds/:guild_id',
		RateLimitMiddleware(RateLimitConfigs.GUILD_UPDATE),
		LoginRequired,
		Validator('param', z.object({guild_id: Int64Type})),
		Validator('json', GuildUpdateRequest),
		async (ctx) => {
			const userId = ctx.get('user').id;
			const guildId = createGuildID(ctx.req.valid('param').guild_id);
			const data = ctx.req.valid('json');
			const requestCache = ctx.get('requestCache');
			const auditLogReason = ctx.get('auditLogReason') ?? null;
			return ctx.json(await ctx.get('guildService').updateGuild({userId, guildId, data, requestCache}, auditLogReason));
		},
	);

	app.post(
		'/guilds/:guild_id/delete',
		RateLimitMiddleware(RateLimitConfigs.GUILD_DELETE),
		LoginRequired,
		Validator('param', z.object({guild_id: Int64Type})),
		SudoModeMiddleware,
		Validator('json', z.object({password: PasswordType.optional()}).merge(SudoVerificationSchema)),
		async (ctx) => {
			const user = ctx.get('user');
			const guildId = createGuildID(ctx.req.valid('param').guild_id);
			const body = ctx.req.valid('json');
			await requireSudoMode(ctx, user, body, ctx.get('authService'), ctx.get('authMfaService'));
			const auditLogReason = ctx.get('auditLogReason') ?? null;
			await ctx.get('guildService').deleteGuild({user, guildId}, auditLogReason);
			return ctx.body(null, 204);
		},
	);

	app.get(
		'/guilds/:guild_id/vanity-url',
		RateLimitMiddleware(RateLimitConfigs.GUILD_VANITY_URL_GET),
		LoginRequired,
		Validator('param', z.object({guild_id: Int64Type})),
		async (ctx) => {
			const userId = ctx.get('user').id;
			const guildId = createGuildID(ctx.req.valid('param').guild_id);
			return ctx.json(await ctx.get('guildService').getVanityURL({userId, guildId}));
		},
	);

	app.patch(
		'/guilds/:guild_id/vanity-url',
		RateLimitMiddleware(RateLimitConfigs.GUILD_VANITY_URL_PATCH),
		LoginRequired,
		DefaultUserOnly,
		Validator('param', z.object({guild_id: Int64Type})),
		Validator('json', z.object({code: VanityURLCodeType.nullish()})),
		async (ctx) => {
			const userId = ctx.get('user').id;
			const guildId = createGuildID(ctx.req.valid('param').guild_id);
			const {code} = ctx.req.valid('json');
			const requestCache = ctx.get('requestCache');
			const auditLogReason = ctx.get('auditLogReason') ?? null;
			const {code: newCode} = await ctx
				.get('guildService')
				.updateVanityURL({userId, guildId, code: code ?? null, requestCache}, auditLogReason);
			return ctx.json({code: newCode});
		},
	);

	app.patch(
		'/guilds/:guild_id/text-channel-flexible-names',
		RateLimitMiddleware(RateLimitConfigs.GUILD_UPDATE),
		LoginRequired,
		Validator('param', z.object({guild_id: Int64Type})),
		Validator('json', z.object({enabled: z.boolean()})),
		async (ctx) => {
			const userId = ctx.get('user').id;
			const guildId = createGuildID(ctx.req.valid('param').guild_id);
			const {enabled} = ctx.req.valid('json');
			const requestCache = ctx.get('requestCache');
			const auditLogReason = ctx.get('auditLogReason') ?? null;
			return ctx.json(
				await ctx
					.get('guildService')
					.updateTextChannelFlexibleNamesFeature({userId, guildId, enabled, requestCache}, auditLogReason),
			);
		},
	);

	app.patch(
		'/guilds/:guild_id/detached-banner',
		RateLimitMiddleware(RateLimitConfigs.GUILD_UPDATE),
		LoginRequired,
		Validator('param', z.object({guild_id: Int64Type})),
		Validator('json', z.object({enabled: z.boolean()})),
		async (ctx) => {
			const userId = ctx.get('user').id;
			const guildId = createGuildID(ctx.req.valid('param').guild_id);
			const {enabled} = ctx.req.valid('json');
			const requestCache = ctx.get('requestCache');
			const auditLogReason = ctx.get('auditLogReason') ?? null;
			return ctx.json(
				await ctx
					.get('guildService')
					.updateDetachedBannerFeature({userId, guildId, enabled, requestCache}, auditLogReason),
			);
		},
	);

	app.patch(
		'/guilds/:guild_id/discovery-visibility',
		RateLimitMiddleware(RateLimitConfigs.GUILD_UPDATE),
		LoginRequired,
		Validator('param', z.object({guild_id: Int64Type})),
		Validator('json', z.object({enabled: z.boolean()})),
		async (ctx) => {
			const userId = ctx.get('user').id;
			const guildId = createGuildID(ctx.req.valid('param').guild_id);
			const {enabled} = ctx.req.valid('json');
			const requestCache = ctx.get('requestCache');
			const auditLogReason = ctx.get('auditLogReason') ?? null;
			return ctx.json(
				await ctx.get('guildService').updateDiscoveryVisibilityFeature({userId, guildId, enabled, requestCache}, auditLogReason),
			);
		},
	);

	app.get(
		'/guilds/:guild_id/discovery-application',
		RateLimitMiddleware(RateLimitConfigs.GUILD_GET),
		LoginRequired,
		Validator('param', z.object({guild_id: Int64Type})),
		async (ctx) => {
			const userId = ctx.get('user').id;
			const guildId = createGuildID(ctx.req.valid('param').guild_id);
			const application = await ctx
				.get('guildService')
				.discoveryApplications.getApplication({userId, guildId});
			return ctx.json(application);
		},
	);

	app.put(
		'/guilds/:guild_id/discovery-application',
		RateLimitMiddleware(RateLimitConfigs.GUILD_UPDATE),
		LoginRequired,
		Validator('param', z.object({guild_id: Int64Type})),
		Validator(
			'json',
			z.object({
				category: z.enum(GUILD_DISCOVERY_CATEGORY_IDS),
				description: z.string().min(1).max(2000),
				tags: z.array(z.string().min(1).max(32)).max(10).optional().default([]),
			}),
		),
		async (ctx) => {
			const userId = ctx.get('user').id;
			const guildId = createGuildID(ctx.req.valid('param').guild_id);
			const body = ctx.req.valid('json');
			const application = await ctx.get('guildService').discoveryApplications.submitApplication({
				userId,
				guildId,
				category: body.category,
				description: body.description,
				tags: body.tags,
			});
			return ctx.json(application);
		},
	);

	app.delete(
		'/guilds/:guild_id/discovery-application',
		RateLimitMiddleware(RateLimitConfigs.GUILD_UPDATE),
		LoginRequired,
		Validator('param', z.object({guild_id: Int64Type})),
		async (ctx) => {
			const userId = ctx.get('user').id;
			const guildId = createGuildID(ctx.req.valid('param').guild_id);
			await ctx.get('guildService').discoveryApplications.withdrawApplication({userId, guildId});
			return ctx.body(null, 204);
		},
	);

	app.patch(
		'/guilds/:guild_id/disallow-unclaimed-accounts',
		RateLimitMiddleware(RateLimitConfigs.GUILD_UPDATE),
		LoginRequired,
		Validator('param', z.object({guild_id: Int64Type})),
		Validator('json', z.object({enabled: z.boolean()})),
		async (ctx) => {
			const userId = ctx.get('user').id;
			const guildId = createGuildID(ctx.req.valid('param').guild_id);
			const {enabled} = ctx.req.valid('json');
			const requestCache = ctx.get('requestCache');
			const auditLogReason = ctx.get('auditLogReason') ?? null;
			return ctx.json(
				await ctx
					.get('guildService')
					.updateDisallowUnclaimedAccountsFeature({userId, guildId, enabled, requestCache}, auditLogReason),
			);
		},
	);
};
