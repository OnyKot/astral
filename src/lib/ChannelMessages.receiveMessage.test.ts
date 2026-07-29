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

import {describe, expect, test} from 'vitest';
import {MessageStates, MessageTypes} from '~/Constants';
import {ChannelMessages} from '~/lib/ChannelMessages';
import type {Message} from '~/records/MessageRecord';

function makeAuthor(id = 'user-1') {
	return {
		id,
		username: 'tester',
		discriminator: '0001',
		avatar: null,
		bot: false,
		system: false,
		flags: 0,
	};
}

function makeMessage(overrides: Partial<Message> & Pick<Message, 'id'>): Message {
	return {
		channel_id: 'channel-1',
		author: makeAuthor(),
		type: MessageTypes.DEFAULT,
		flags: 0,
		pinned: false,
		mention_everyone: false,
		content: 'hello',
		timestamp: new Date().toISOString(),
		mentions: [],
		...overrides,
	} as Message;
}

describe('ChannelMessages.receiveMessage', () => {
	test('accepts optimistic local send while hasMoreAfter (history view)', () => {
		const channel = new ChannelMessages('channel-1').mutate({
			ready: true,
			hasMoreAfter: true,
		});
		const nonce = 'optimistic-nonce-1';
		const optimistic = makeMessage({
			id: nonce,
			nonce,
			state: MessageStates.SENDING,
			content: 'sent from history',
		});

		const next = channel.receiveMessage(optimistic, false);

		expect(next.has(nonce)).toBe(true);
		expect(next.hasMoreAfter).toBe(false);
		expect(next.length).toBe(1);
	});

	test('still drops other users live messages while hasMoreAfter', () => {
		const channel = new ChannelMessages('channel-1').mutate({
			ready: true,
			hasMoreAfter: true,
		});
		const live = makeMessage({
			id: 'remote-msg-1',
			content: 'from someone else',
			author: makeAuthor('user-2'),
		});

		const next = channel.receiveMessage(live, false);

		expect(next).toBe(channel);
		expect(next.has('remote-msg-1')).toBe(false);
		expect(next.hasMoreAfter).toBe(true);
	});

	test('replaces optimistic nonce when server message arrives', () => {
		const nonce = 'optimistic-nonce-2';
		let channel = new ChannelMessages('channel-1').mutate({ready: true, hasMoreAfter: false});
		channel = channel.receiveMessage(
			makeMessage({id: nonce, nonce, state: MessageStates.SENDING, content: 'pending'}),
			false,
		);

		const server = makeMessage({
			id: 'server-id-99',
			nonce,
			content: 'pending',
			author: makeAuthor(),
		});
		const next = channel.receiveMessage(server, false);

		expect(next.has(nonce)).toBe(false);
		expect(next.has('server-id-99')).toBe(true);
		expect(next.get('server-id-99')?.content).toBe('pending');
	});
});
