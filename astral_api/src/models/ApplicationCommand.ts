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

export const ApplicationCommandType = {
	CHAT_INPUT: 1,
	USER: 2,
	MESSAGE: 3,
} as const;

export const ApplicationCommandOptionType = {
	SUB_COMMAND: 1,
	SUB_COMMAND_GROUP: 2,
	STRING: 3,
	INTEGER: 4,
	BOOLEAN: 5,
	USER: 6,
	CHANNEL: 7,
	ROLE: 8,
	MENTIONABLE: 9,
	NUMBER: 10,
} as const;

export interface ApplicationCommandOption {
	type: number;
	name: string;
	description: string;
	required?: boolean;
	choices?: Array<{name: string; value: string | number}>;
	options?: Array<ApplicationCommandOption>;
	min_value?: number;
	max_value?: number;
	min_length?: number;
	max_length?: number;
}

export class ApplicationCommand {
	readonly commandId: CommandID;
	readonly applicationId: ApplicationID;
	readonly guildId: GuildID | null;
	readonly name: string;
	readonly description: string;
	readonly type: number;
	readonly options: Array<ApplicationCommandOption>;
	readonly defaultMemberPermissions: string | null;
	readonly dmPermission: boolean;
	readonly version: number;

	constructor(row: ApplicationCommandRow) {
		this.commandId = row.command_id;
		this.applicationId = row.application_id;
		this.guildId = row.guild_id;
		this.name = row.name;
		this.description = row.description;
		this.type = row.type ?? ApplicationCommandType.CHAT_INPUT;
		this.options = row.options ? JSON.parse(row.options) : [];
		this.defaultMemberPermissions = row.default_member_permissions;
		this.dmPermission = row.dm_permission ?? true;
		this.version = row.version ?? 1;
	}

	toRow(): ApplicationCommandRow {
		return {
			command_id: this.commandId,
			application_id: this.applicationId,
			guild_id: this.guildId,
			name: this.name,
			description: this.description,
			type: this.type,
			options: this.options.length > 0 ? JSON.stringify(this.options) : null,
			default_member_permissions: this.defaultMemberPermissions,
			dm_permission: this.dmPermission,
			version: this.version,
		};
	}

	toResponse(): Record<string, unknown> {
		return {
			id: this.commandId.toString(),
			application_id: this.applicationId.toString(),
			guild_id: this.guildId?.toString() ?? null,
			name: this.name,
			description: this.description,
			type: this.type,
			options: this.options,
			default_member_permissions: this.defaultMemberPermissions,
			dm_permission: this.dmPermission,
			version: this.version,
		};
	}
}
