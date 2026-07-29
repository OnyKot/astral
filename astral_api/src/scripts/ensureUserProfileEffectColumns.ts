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

import cassandra from 'cassandra-driver';
import {Config} from '~/Config';

const clientOptions: cassandra.ClientOptions = {
	contactPoints: Config.cassandra.hosts.split(','),
	keyspace: Config.cassandra.keyspace,
	localDataCenter: Config.cassandra.localDc,
};

if (Config.cassandra.username && Config.cassandra.password) {
	clientOptions.credentials = {
		username: Config.cassandra.username,
		password: Config.cassandra.password,
	};
}

const client = new cassandra.Client(clientOptions);

async function addColumnIfMissing(columnName: string): Promise<void> {
	try {
		await client.execute(`ALTER TABLE users ADD ${columnName} text`);
		console.log(`[ok] added users.${columnName}`);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		if (message.toLowerCase().includes('already exists')) {
			console.log(`[skip] users.${columnName} already exists`);
			return;
		}
		throw error;
	}
}

async function main(): Promise<void> {
	await client.connect();
	await addColumnIfMissing('profile_accent_effect');
	await addColumnIfMissing('channel_list_name_effect');
	await client.shutdown();
}

main().catch(async (error) => {
	console.error('[error] failed to ensure user profile effect columns:', error);
	await client.shutdown().catch(() => {});
	process.exitCode = 1;
});
