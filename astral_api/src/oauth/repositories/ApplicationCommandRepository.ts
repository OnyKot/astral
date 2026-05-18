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
import {BatchBuilder, buildPatchFromData, executeVersionedUpdate, fetchMany, fetchOne} from '~/database/Cassandra';
import {APPLICATION_COMMAND_COLUMNS} from '~/database/CassandraTypes';
import type {
	ApplicationCommandRow,
	ApplicationCommandsByApplicationRow,
} from '~/database/types/ApplicationCommandTypes';
import {ApplicationCommand} from '~/models/ApplicationCommand';
import {ApplicationCommands, ApplicationCommandsByApplication} from '~/Tables';
import type {IApplicationCommandRepository} from './IApplicationCommandRepository';

const SELECT_COMMAND_CQL = ApplicationCommands.selectCql({
	where: ApplicationCommands.where.eq('command_id'),
});

const SELECT_COMMAND_IDS_BY_APPLICATION_CQL = ApplicationCommandsByApplication.selectCql({
	columns: ['command_id'],
	where: ApplicationCommandsByApplication.where.eq('application_id'),
});

const SELECT_COMMAND_IDS_BY_APPLICATION_AND_GUILD_CQL = ApplicationCommandsByApplication.selectCql({
	columns: ['command_id'],
	where: [ApplicationCommandsByApplication.where.eq('application_id'), ApplicationCommandsByApplication.where.eq('guild_id')],
});

const FETCH_COMMANDS_BY_IDS_CQL = ApplicationCommands.selectCql({
	where: ApplicationCommands.where.in('command_id', 'command_ids'),
});

export class ApplicationCommandRepository implements IApplicationCommandRepository {
	async getCommand(commandId: CommandID): Promise<ApplicationCommand | null> {
		const row = await fetchOne<ApplicationCommandRow>(SELECT_COMMAND_CQL, {command_id: commandId});
		return row ? new ApplicationCommand(row) : null;
	}

	async listCommandsByApplication(
		applicationId: ApplicationID,
		guildId?: GuildID | null,
	): Promise<Array<ApplicationCommand>> {
		let ids: Array<ApplicationCommandsByApplicationRow>;

		if (guildId !== undefined) {
			ids = await fetchMany<ApplicationCommandsByApplicationRow>(SELECT_COMMAND_IDS_BY_APPLICATION_AND_GUILD_CQL, {
				application_id: applicationId,
				guild_id: guildId,
			});
		} else {
			ids = await fetchMany<ApplicationCommandsByApplicationRow>(SELECT_COMMAND_IDS_BY_APPLICATION_CQL, {
				application_id: applicationId,
			});
		}

		if (ids.length === 0) {
			return [];
		}

		const rows = await fetchMany<ApplicationCommandRow>(FETCH_COMMANDS_BY_IDS_CQL, {
			command_ids: ids.map((r) => r.command_id),
		});

		return rows.map((r) => new ApplicationCommand(r));
	}

	async upsertCommand(data: ApplicationCommandRow): Promise<ApplicationCommand> {
		const commandId = data.command_id;

		const result = await executeVersionedUpdate<ApplicationCommandRow, 'command_id'>(
			async () => {
				return await fetchOne<ApplicationCommandRow>(SELECT_COMMAND_CQL, {command_id: commandId});
			},
			(current) => ({
				pk: {command_id: commandId},
				patch: buildPatchFromData(data, current, APPLICATION_COMMAND_COLUMNS, ['command_id']),
			}),
			ApplicationCommands,
			{onFailure: 'log'},
		);

		const batch = new BatchBuilder();
		batch.addPrepared(
			ApplicationCommandsByApplication.upsertAll({
				application_id: data.application_id,
				guild_id: data.guild_id,
				command_id: data.command_id,
			}),
		);
		await batch.execute();

		return new ApplicationCommand({...data, version: result.finalVersion});
	}

	async deleteCommand(commandId: CommandID): Promise<void> {
		const command = await this.getCommand(commandId);
		if (!command) {
			return;
		}

		const batch = new BatchBuilder();
		batch.addPrepared(ApplicationCommands.deleteByPk({command_id: commandId}));
		batch.addPrepared(
			ApplicationCommandsByApplication.deleteByPk({
				application_id: command.applicationId,
				guild_id: command.guildId,
				command_id: commandId,
			}),
		);
		await batch.execute();
	}

	async deleteAllCommandsByApplication(applicationId: ApplicationID, guildId?: GuildID | null): Promise<void> {
		const commands = await this.listCommandsByApplication(applicationId, guildId);

		if (commands.length === 0) {
			return;
		}

		const batch = new BatchBuilder();
		for (const command of commands) {
			batch.addPrepared(ApplicationCommands.deleteByPk({command_id: command.commandId}));
			batch.addPrepared(
				ApplicationCommandsByApplication.deleteByPk({
					application_id: command.applicationId,
					guild_id: command.guildId,
					command_id: command.commandId,
				}),
			);
		}
		await batch.execute();
	}
}
