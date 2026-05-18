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
import {createApplicationID, createCommandID, createGuildID} from '~/BrandedTypes';
import {AccessDeniedError, UnknownApplicationError} from '~/Errors';
import {LoginRequired} from '~/middleware/AuthMiddleware';
import {RateLimitMiddleware} from '~/middleware/RateLimitMiddleware';
import {RateLimitConfigs} from '~/RateLimitConfig';
import {createStringType, z} from '~/Schema';
import {Validator} from '~/Validator';

const CommandOptionSchema: z.ZodType<unknown> = z.lazy(() =>
	z.object({
		type: z.number().int().min(1).max(10),
		name: createStringType(1, 32),
		description: createStringType(1, 100),
		required: z.boolean().optional(),
		choices: z
			.array(
				z.object({
					name: createStringType(1, 100),
					value: z.union([z.string(), z.number()]),
				}),
			)
			.max(25)
			.optional(),
		options: z.array(CommandOptionSchema).max(25).optional(),
		min_value: z.number().optional(),
		max_value: z.number().optional(),
		min_length: z.number().int().min(0).max(6000).optional(),
		max_length: z.number().int().min(1).max(6000).optional(),
	}),
);

const CreateCommandSchema = z.object({
	name: createStringType(1, 32),
	description: createStringType(0, 100).optional().default(''),
	type: z.number().int().min(1).max(3).optional(),
	options: z.array(CommandOptionSchema).max(25).optional().nullable(),
	default_member_permissions: z.string().optional().nullable(),
	dm_permission: z.boolean().optional(),
});

const UpdateCommandSchema = z.object({
	name: createStringType(1, 32).optional(),
	description: createStringType(0, 100).optional(),
	options: z.array(CommandOptionSchema).max(25).optional().nullable(),
	default_member_permissions: z.string().optional().nullable(),
	dm_permission: z.boolean().optional(),
});

const BulkOverwriteSchema = z.array(CreateCommandSchema).max(100);

export const ApplicationCommandController = (app: HonoApp) => {
	// GET /applications/:id/commands - List global commands
	app.get(
		'/applications/:id/commands',
		RateLimitMiddleware(RateLimitConfigs.APPLICATION_COMMANDS_LIST),
		LoginRequired,
		async (ctx) => {
			const applicationId = createApplicationID(BigInt(ctx.req.param('id')));
			const user = ctx.get('user');

			await verifyAccess(ctx, applicationId, user.id);

			const commands = await ctx.get('applicationCommandService').listCommands(applicationId, null);
			return ctx.json(commands.map((c) => c.toResponse()));
		},
	);

	// POST /applications/:id/commands - Create global command
	app.post(
		'/applications/:id/commands',
		RateLimitMiddleware(RateLimitConfigs.APPLICATION_COMMANDS_CREATE),
		LoginRequired,
		Validator('json', CreateCommandSchema),
		async (ctx) => {
			const applicationId = createApplicationID(BigInt(ctx.req.param('id')));
			const user = ctx.get('user');
			const body = ctx.req.valid('json');

			await verifyAccess(ctx, applicationId, user.id);

			const command = await ctx.get('applicationCommandService').createCommand({
				applicationId,
				guildId: null,
				name: body.name,
				description: body.description ?? '',
				type: body.type,
				options: body.options ? JSON.stringify(body.options) : null,
				defaultMemberPermissions: body.default_member_permissions,
				dmPermission: body.dm_permission,
			});

			return ctx.json(command.toResponse(), 201);
		},
	);

	// GET /applications/:id/commands/:command_id - Get global command
	app.get(
		'/applications/:id/commands/:command_id',
		RateLimitMiddleware(RateLimitConfigs.APPLICATION_COMMANDS_LIST),
		LoginRequired,
		async (ctx) => {
			const applicationId = createApplicationID(BigInt(ctx.req.param('id')));
			const commandId = createCommandID(BigInt(ctx.req.param('command_id')));
			const user = ctx.get('user');

			await verifyAccess(ctx, applicationId, user.id);

			const command = await ctx.get('applicationCommandService').getCommand(applicationId, commandId);
			return ctx.json(command.toResponse());
		},
	);

	// PATCH /applications/:id/commands/:command_id - Update global command
	app.patch(
		'/applications/:id/commands/:command_id',
		RateLimitMiddleware(RateLimitConfigs.APPLICATION_COMMANDS_UPDATE),
		LoginRequired,
		Validator('json', UpdateCommandSchema),
		async (ctx) => {
			const applicationId = createApplicationID(BigInt(ctx.req.param('id')));
			const commandId = createCommandID(BigInt(ctx.req.param('command_id')));
			const user = ctx.get('user');
			const body = ctx.req.valid('json');

			await verifyAccess(ctx, applicationId, user.id);

			const command = await ctx.get('applicationCommandService').updateCommand({
				applicationId,
				commandId,
				name: body.name,
				description: body.description,
				options: body.options !== undefined ? (body.options ? JSON.stringify(body.options) : null) : undefined,
				defaultMemberPermissions: body.default_member_permissions,
				dmPermission: body.dm_permission,
			});

			return ctx.json(command.toResponse());
		},
	);

	// DELETE /applications/:id/commands/:command_id - Delete global command
	app.delete(
		'/applications/:id/commands/:command_id',
		RateLimitMiddleware(RateLimitConfigs.APPLICATION_COMMANDS_DELETE),
		LoginRequired,
		async (ctx) => {
			const applicationId = createApplicationID(BigInt(ctx.req.param('id')));
			const commandId = createCommandID(BigInt(ctx.req.param('command_id')));
			const user = ctx.get('user');

			await verifyAccess(ctx, applicationId, user.id);

			await ctx.get('applicationCommandService').deleteCommand(applicationId, commandId);
			return ctx.body(null, 204);
		},
	);

	// PUT /applications/:id/commands - Bulk overwrite global commands
	app.put(
		'/applications/:id/commands',
		RateLimitMiddleware(RateLimitConfigs.APPLICATION_COMMANDS_BULK_OVERWRITE),
		LoginRequired,
		Validator('json', BulkOverwriteSchema),
		async (ctx) => {
			const applicationId = createApplicationID(BigInt(ctx.req.param('id')));
			const user = ctx.get('user');
			const body = ctx.req.valid('json');

			await verifyAccess(ctx, applicationId, user.id);

			const commands = await ctx.get('applicationCommandService').bulkOverwriteCommands({
				applicationId,
				guildId: null,
				commands: body.map((cmd) => ({
					name: cmd.name,
					description: cmd.description ?? '',
					type: cmd.type,
					options: cmd.options ? JSON.stringify(cmd.options) : null,
					defaultMemberPermissions: cmd.default_member_permissions,
					dmPermission: cmd.dm_permission,
				})),
			});

			return ctx.json(commands.map((c) => c.toResponse()));
		},
	);

	// Guild-specific command routes

	// GET /applications/:id/guilds/:guild_id/commands - List guild commands
	app.get(
		'/applications/:id/guilds/:guild_id/commands',
		RateLimitMiddleware(RateLimitConfigs.APPLICATION_COMMANDS_LIST),
		LoginRequired,
		async (ctx) => {
			const applicationId = createApplicationID(BigInt(ctx.req.param('id')));
			const guildId = createGuildID(BigInt(ctx.req.param('guild_id')));
			const user = ctx.get('user');

			await verifyAccess(ctx, applicationId, user.id);

			const commands = await ctx.get('applicationCommandService').listCommands(applicationId, guildId);
			return ctx.json(commands.map((c) => c.toResponse()));
		},
	);

	// POST /applications/:id/guilds/:guild_id/commands - Create guild command
	app.post(
		'/applications/:id/guilds/:guild_id/commands',
		RateLimitMiddleware(RateLimitConfigs.APPLICATION_COMMANDS_CREATE),
		LoginRequired,
		Validator('json', CreateCommandSchema),
		async (ctx) => {
			const applicationId = createApplicationID(BigInt(ctx.req.param('id')));
			const guildId = createGuildID(BigInt(ctx.req.param('guild_id')));
			const user = ctx.get('user');
			const body = ctx.req.valid('json');

			await verifyAccess(ctx, applicationId, user.id);

			const command = await ctx.get('applicationCommandService').createCommand({
				applicationId,
				guildId,
				name: body.name,
				description: body.description ?? '',
				type: body.type,
				options: body.options ? JSON.stringify(body.options) : null,
				defaultMemberPermissions: body.default_member_permissions,
				dmPermission: body.dm_permission,
			});

			return ctx.json(command.toResponse(), 201);
		},
	);

	// GET /applications/:id/guilds/:guild_id/commands/:command_id
	app.get(
		'/applications/:id/guilds/:guild_id/commands/:command_id',
		RateLimitMiddleware(RateLimitConfigs.APPLICATION_COMMANDS_LIST),
		LoginRequired,
		async (ctx) => {
			const applicationId = createApplicationID(BigInt(ctx.req.param('id')));
			const commandId = createCommandID(BigInt(ctx.req.param('command_id')));
			const user = ctx.get('user');

			await verifyAccess(ctx, applicationId, user.id);

			const command = await ctx.get('applicationCommandService').getCommand(applicationId, commandId);
			return ctx.json(command.toResponse());
		},
	);

	// PATCH /applications/:id/guilds/:guild_id/commands/:command_id
	app.patch(
		'/applications/:id/guilds/:guild_id/commands/:command_id',
		RateLimitMiddleware(RateLimitConfigs.APPLICATION_COMMANDS_UPDATE),
		LoginRequired,
		Validator('json', UpdateCommandSchema),
		async (ctx) => {
			const applicationId = createApplicationID(BigInt(ctx.req.param('id')));
			const commandId = createCommandID(BigInt(ctx.req.param('command_id')));
			const user = ctx.get('user');
			const body = ctx.req.valid('json');

			await verifyAccess(ctx, applicationId, user.id);

			const command = await ctx.get('applicationCommandService').updateCommand({
				applicationId,
				commandId,
				name: body.name,
				description: body.description,
				options: body.options !== undefined ? (body.options ? JSON.stringify(body.options) : null) : undefined,
				defaultMemberPermissions: body.default_member_permissions,
				dmPermission: body.dm_permission,
			});

			return ctx.json(command.toResponse());
		},
	);

	// DELETE /applications/:id/guilds/:guild_id/commands/:command_id
	app.delete(
		'/applications/:id/guilds/:guild_id/commands/:command_id',
		RateLimitMiddleware(RateLimitConfigs.APPLICATION_COMMANDS_DELETE),
		LoginRequired,
		async (ctx) => {
			const applicationId = createApplicationID(BigInt(ctx.req.param('id')));
			const commandId = createCommandID(BigInt(ctx.req.param('command_id')));
			const user = ctx.get('user');

			await verifyAccess(ctx, applicationId, user.id);

			await ctx.get('applicationCommandService').deleteCommand(applicationId, commandId);
			return ctx.body(null, 204);
		},
	);

	// PUT /applications/:id/guilds/:guild_id/commands - Bulk overwrite guild commands
	app.put(
		'/applications/:id/guilds/:guild_id/commands',
		RateLimitMiddleware(RateLimitConfigs.APPLICATION_COMMANDS_BULK_OVERWRITE),
		LoginRequired,
		Validator('json', BulkOverwriteSchema),
		async (ctx) => {
			const applicationId = createApplicationID(BigInt(ctx.req.param('id')));
			const guildId = createGuildID(BigInt(ctx.req.param('guild_id')));
			const user = ctx.get('user');
			const body = ctx.req.valid('json');

			await verifyAccess(ctx, applicationId, user.id);

			const commands = await ctx.get('applicationCommandService').bulkOverwriteCommands({
				applicationId,
				guildId,
				commands: body.map((cmd) => ({
					name: cmd.name,
					description: cmd.description ?? '',
					type: cmd.type,
					options: cmd.options ? JSON.stringify(cmd.options) : null,
					defaultMemberPermissions: cmd.default_member_permissions,
					dmPermission: cmd.dm_permission,
				})),
			});

			return ctx.json(commands.map((c) => c.toResponse()));
		},
	);
};

async function verifyAccess(ctx: any, applicationId: any, userId: any): Promise<void> {
	const authTokenType = ctx.get('authTokenType');
	const application = await ctx.get('applicationRepository').getApplication(applicationId);

	if (!application) {
		throw new UnknownApplicationError();
	}

	if (authTokenType === 'bot') {
		if (application.botUserId !== userId) {
			throw new AccessDeniedError();
		}
		return;
	}

	if (application.ownerUserId !== userId) {
		throw new AccessDeniedError();
	}
}
