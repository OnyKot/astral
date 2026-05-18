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

import type {ApplicationID, CommandID, GuildID} from '~/BrandedTypes';
import type {ApplicationCommandRow} from '~/database/types/ApplicationCommandTypes';
import {InputValidationError, UnknownApplicationError, UnknownCommandError} from '~/Errors';
import type {SnowflakeService} from '~/infrastructure/SnowflakeService';
import {ApplicationCommand, ApplicationCommandType} from '~/models/ApplicationCommand';
import type {IApplicationCommandRepository} from './repositories/IApplicationCommandRepository';
import type {IApplicationRepository} from './repositories/IApplicationRepository';

const MAX_COMMANDS_PER_APPLICATION = 100;
const MAX_COMMAND_NAME_LENGTH = 32;
const MAX_COMMAND_DESCRIPTION_LENGTH = 100;
const MAX_OPTIONS_PER_COMMAND = 25;
const COMMAND_NAME_REGEX = /^[-_\p{L}\p{N}\p{sc=Deva}\p{sc=Thai}]{1,32}$/u;

interface ApplicationCommandServiceDeps {
	applicationCommandRepository: IApplicationCommandRepository;
	applicationRepository: IApplicationRepository;
	snowflakeService: SnowflakeService;
}

export class ApplicationCommandService {
	constructor(private readonly deps: ApplicationCommandServiceDeps) {}

	private validateCommandName(name: string): void {
		if (name.length < 1 || name.length > MAX_COMMAND_NAME_LENGTH) {
			throw InputValidationError.create('name', `Command name must be between 1 and ${MAX_COMMAND_NAME_LENGTH} characters`);
		}
		if (!COMMAND_NAME_REGEX.test(name)) {
			throw InputValidationError.create(
				'name',
				'Command name must contain only lowercase letters, numbers, hyphens, and underscores',
			);
		}
		if (name !== name.toLowerCase()) {
			throw InputValidationError.create('name', 'Command name must be lowercase');
		}
	}

	private validateCommandType(type: number): void {
		const validTypes: Array<number> = [ApplicationCommandType.CHAT_INPUT, ApplicationCommandType.USER, ApplicationCommandType.MESSAGE];
		if (!validTypes.includes(type)) {
			throw InputValidationError.create('type', 'Invalid command type. Must be 1 (CHAT_INPUT), 2 (USER), or 3 (MESSAGE)');
		}
	}

	private async verifyApplicationExists(applicationId: ApplicationID): Promise<void> {
		const application = await this.deps.applicationRepository.getApplication(applicationId);
		if (!application) {
			throw new UnknownApplicationError();
		}
	}

	async listCommands(applicationId: ApplicationID, guildId?: GuildID | null): Promise<Array<ApplicationCommand>> {
		await this.verifyApplicationExists(applicationId);
		return this.deps.applicationCommandRepository.listCommandsByApplication(applicationId, guildId);
	}

	async getCommand(applicationId: ApplicationID, commandId: CommandID): Promise<ApplicationCommand> {
		await this.verifyApplicationExists(applicationId);
		const command = await this.deps.applicationCommandRepository.getCommand(commandId);
		if (!command || command.applicationId !== applicationId) {
			throw new UnknownCommandError();
		}
		return command;
	}

	async createCommand(args: {
		applicationId: ApplicationID;
		guildId?: GuildID | null;
		name: string;
		description: string;
		type?: number;
		options?: string | null;
		defaultMemberPermissions?: string | null;
		dmPermission?: boolean;
	}): Promise<ApplicationCommand> {
		await this.verifyApplicationExists(args.applicationId);

		const commandType = args.type ?? ApplicationCommandType.CHAT_INPUT;
		this.validateCommandType(commandType);
		this.validateCommandName(args.name);

		if (commandType === ApplicationCommandType.CHAT_INPUT) {
			if (!args.description || args.description.length < 1 || args.description.length > MAX_COMMAND_DESCRIPTION_LENGTH) {
				throw InputValidationError.create(
					'description',
					`Description is required for CHAT_INPUT commands and must be between 1 and ${MAX_COMMAND_DESCRIPTION_LENGTH} characters`,
				);
			}
		}

		if (args.options) {
			const parsed = JSON.parse(args.options);
			if (Array.isArray(parsed) && parsed.length > MAX_OPTIONS_PER_COMMAND) {
				throw InputValidationError.create('options', `Maximum of ${MAX_OPTIONS_PER_COMMAND} options per command`);
			}
		}

		const guildId = args.guildId ?? null;

		const existingCommands = await this.deps.applicationCommandRepository.listCommandsByApplication(
			args.applicationId,
			guildId,
		);

		if (existingCommands.length >= MAX_COMMANDS_PER_APPLICATION) {
			throw InputValidationError.create(
				'name',
				`Maximum of ${MAX_COMMANDS_PER_APPLICATION} commands per application${guildId ? ' per guild' : ''}`,
			);
		}

		const duplicate = existingCommands.find((c) => c.name === args.name && c.type === commandType);
		if (duplicate) {
			throw InputValidationError.create('name', 'A command with this name and type already exists');
		}

		const commandId = this.deps.snowflakeService.generate() as unknown as CommandID;

		const row: ApplicationCommandRow = {
			command_id: commandId,
			application_id: args.applicationId,
			guild_id: guildId,
			name: args.name,
			description: args.description ?? '',
			type: commandType,
			options: args.options ?? null,
			default_member_permissions: args.defaultMemberPermissions ?? null,
			dm_permission: args.dmPermission ?? true,
			version: null,
		};

		return this.deps.applicationCommandRepository.upsertCommand(row);
	}

	async updateCommand(args: {
		applicationId: ApplicationID;
		commandId: CommandID;
		name?: string;
		description?: string;
		options?: string | null;
		defaultMemberPermissions?: string | null;
		dmPermission?: boolean;
	}): Promise<ApplicationCommand> {
		const command = await this.getCommand(args.applicationId, args.commandId);

		if (args.name !== undefined) {
			this.validateCommandName(args.name);
		}

		if (args.description !== undefined && command.type === ApplicationCommandType.CHAT_INPUT) {
			if (args.description.length < 1 || args.description.length > MAX_COMMAND_DESCRIPTION_LENGTH) {
				throw InputValidationError.create(
					'description',
					`Description must be between 1 and ${MAX_COMMAND_DESCRIPTION_LENGTH} characters`,
				);
			}
		}

		if (args.options) {
			const parsed = JSON.parse(args.options);
			if (Array.isArray(parsed) && parsed.length > MAX_OPTIONS_PER_COMMAND) {
				throw InputValidationError.create('options', `Maximum of ${MAX_OPTIONS_PER_COMMAND} options per command`);
			}
		}

		if (args.name !== undefined && args.name !== command.name) {
			const existingCommands = await this.deps.applicationCommandRepository.listCommandsByApplication(
				args.applicationId,
				command.guildId,
			);
			const duplicate = existingCommands.find((c) => c.name === args.name && c.type === command.type && c.commandId !== command.commandId);
			if (duplicate) {
				throw InputValidationError.create('name', 'A command with this name and type already exists');
			}
		}

		const updatedRow: ApplicationCommandRow = {
			...command.toRow(),
			name: args.name ?? command.name,
			description: args.description ?? command.description,
			options: args.options !== undefined ? args.options : command.toRow().options,
			default_member_permissions: args.defaultMemberPermissions !== undefined ? args.defaultMemberPermissions : command.defaultMemberPermissions,
			dm_permission: args.dmPermission !== undefined ? args.dmPermission : command.dmPermission,
		};

		return this.deps.applicationCommandRepository.upsertCommand(updatedRow);
	}

	async deleteCommand(applicationId: ApplicationID, commandId: CommandID): Promise<void> {
		await this.getCommand(applicationId, commandId);
		await this.deps.applicationCommandRepository.deleteCommand(commandId);
	}

	async bulkOverwriteCommands(args: {
		applicationId: ApplicationID;
		guildId?: GuildID | null;
		commands: Array<{
			name: string;
			description: string;
			type?: number;
			options?: string | null;
			defaultMemberPermissions?: string | null;
			dmPermission?: boolean;
		}>;
	}): Promise<Array<ApplicationCommand>> {
		await this.verifyApplicationExists(args.applicationId);

		const guildId = args.guildId ?? null;

		if (args.commands.length > MAX_COMMANDS_PER_APPLICATION) {
			throw InputValidationError.create(
				'commands',
				`Maximum of ${MAX_COMMANDS_PER_APPLICATION} commands per application${guildId ? ' per guild' : ''}`,
			);
		}

		for (const cmd of args.commands) {
			const commandType = cmd.type ?? ApplicationCommandType.CHAT_INPUT;
			this.validateCommandType(commandType);
			this.validateCommandName(cmd.name);

			if (commandType === ApplicationCommandType.CHAT_INPUT) {
				if (!cmd.description || cmd.description.length < 1 || cmd.description.length > MAX_COMMAND_DESCRIPTION_LENGTH) {
					throw InputValidationError.create(
						'description',
						`Description is required for CHAT_INPUT commands and must be between 1 and ${MAX_COMMAND_DESCRIPTION_LENGTH} characters`,
					);
				}
			}
		}

		const nameTypeSet = new Set<string>();
		for (const cmd of args.commands) {
			const key = `${cmd.name}:${cmd.type ?? ApplicationCommandType.CHAT_INPUT}`;
			if (nameTypeSet.has(key)) {
				throw InputValidationError.create('commands', `Duplicate command name and type: ${cmd.name}`);
			}
			nameTypeSet.add(key);
		}

		await this.deps.applicationCommandRepository.deleteAllCommandsByApplication(args.applicationId, guildId);

		const results: Array<ApplicationCommand> = [];
		for (const cmd of args.commands) {
			const commandId = this.deps.snowflakeService.generate() as unknown as CommandID;
			const row: ApplicationCommandRow = {
				command_id: commandId,
				application_id: args.applicationId,
				guild_id: guildId,
				name: cmd.name,
				description: cmd.description ?? '',
				type: cmd.type ?? ApplicationCommandType.CHAT_INPUT,
				options: cmd.options ?? null,
				default_member_permissions: cmd.defaultMemberPermissions ?? null,
				dm_permission: cmd.dmPermission ?? true,
				version: null,
			};

			const command = await this.deps.applicationCommandRepository.upsertCommand(row);
			results.push(command);
		}

		return results;
	}
}
