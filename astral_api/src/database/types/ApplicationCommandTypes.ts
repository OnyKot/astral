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

export interface ApplicationCommandRow {
	command_id: CommandID;
	application_id: ApplicationID;
	guild_id: GuildID | null;
	name: string;
	description: string;
	type: number;
	options: string | null;
	default_member_permissions: string | null;
	dm_permission: boolean | null;
	version: number | null;
}

export interface ApplicationCommandsByApplicationRow {
	application_id: ApplicationID;
	guild_id: GuildID | null;
	command_id: CommandID;
}

export const APPLICATION_COMMAND_COLUMNS = [
	'command_id',
	'application_id',
	'guild_id',
	'name',
	'description',
	'type',
	'options',
	'default_member_permissions',
	'dm_permission',
	'version',
] as const satisfies ReadonlyArray<keyof ApplicationCommandRow>;

export const APPLICATION_COMMANDS_BY_APPLICATION_COLUMNS = [
	'application_id',
	'guild_id',
	'command_id',
] as const satisfies ReadonlyArray<keyof ApplicationCommandsByApplicationRow>;
