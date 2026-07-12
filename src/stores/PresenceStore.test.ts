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

import {StatusTypes} from '~/Constants';
import type {UserPartial} from '~/records/UserRecord';
import {describe, expect, test} from 'vitest';
import {PresenceStore} from './PresenceStore';

function createUser(id: string): UserPartial {
	return {
		id,
		username: id,
		discriminator: '0001',
		avatar: null,
		flags: 0,
	};
}

describe('PresenceStore', () => {
	test('keeps a user online while another presence context remains active', () => {
		const store = new PresenceStore();
		const user = createUser('presence-user');

		store.handlePresenceUpdate({guild_id: 'guild-a', user, status: StatusTypes.ONLINE});
		store.handlePresenceUpdate({guild_id: 'guild-b', user, status: StatusTypes.ONLINE});
		store.handlePresenceUpdate({guild_id: 'guild-a', user, status: StatusTypes.OFFLINE});

		expect(store.getStatus(user.id)).toBe(StatusTypes.ONLINE);

		store.handlePresenceUpdate({guild_id: 'guild-b', user, status: StatusTypes.OFFLINE});

		expect(store.getStatus(user.id)).toBe(StatusTypes.OFFLINE);
	});

	test('does not clear active metadata from an unrelated offline context', () => {
		const store = new PresenceStore();
		const user = createUser('presence-metadata-user');
		const customStatus = {text: 'Available'};

		store.handlePresenceUpdate({
			guild_id: 'guild-a',
			user,
			status: StatusTypes.ONLINE,
			custom_status: customStatus,
			mobile: true,
		});
		store.handlePresenceUpdate({
			guild_id: 'guild-b',
			user,
			status: StatusTypes.ONLINE,
			custom_status: customStatus,
			mobile: true,
		});
		store.handlePresenceUpdate({
			guild_id: 'guild-b',
			user,
			status: StatusTypes.OFFLINE,
			custom_status: null,
			mobile: false,
		});

		expect(store.getStatus(user.id)).toBe(StatusTypes.ONLINE);
		expect(store.getCustomStatus(user.id)?.text).toBe(customStatus.text);
		expect(store.isMobile(user.id)).toBe(true);
	});
});
