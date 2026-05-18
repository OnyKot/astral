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

import {describe, expect, it} from 'vitest';
import type {ChannelID} from '~/BrandedTypes';
import {ChannelTypes} from '~/Constants';
import type {Channel} from '~/Models';
import {ChannelHelpers} from './ChannelHelpers';

const id = (value: number) => BigInt(value) as ChannelID;

const channel = ({
	channelId,
	parentId = null,
	type,
	position,
}: {
	channelId: number;
	parentId?: ChannelID | null;
	type: number;
	position: number;
}) =>
	({
		id: id(channelId),
		parentId,
		type,
		position,
	}) as Channel;

describe('ChannelHelpers.normalizeGuildChannelInsertIndex', () => {
	const categoryId = id(100);
	const remainingChannels = [
		channel({channelId: 100, type: ChannelTypes.GUILD_CATEGORY, position: 1}),
		channel({channelId: 101, parentId: categoryId, type: ChannelTypes.GUILD_TEXT, position: 2}),
		channel({channelId: 102, parentId: categoryId, type: ChannelTypes.GUILD_VOICE, position: 3}),
	];

	it('moves text insertion before the first voice channel in a category', () => {
		const insertIndex = ChannelHelpers.normalizeGuildChannelInsertIndex({
			remainingChannels,
			insertIndex: 3,
			targetChannel: channel({channelId: 103, type: ChannelTypes.GUILD_TEXT, position: 4}),
			desiredParentId: categoryId,
		});

		expect(insertIndex).toBe(2);
	});

	it('moves voice insertion after existing text channels in a category', () => {
		const insertIndex = ChannelHelpers.normalizeGuildChannelInsertIndex({
			remainingChannels,
			insertIndex: 1,
			targetChannel: channel({channelId: 103, type: ChannelTypes.GUILD_VOICE, position: 4}),
			desiredParentId: categoryId,
		});

		expect(insertIndex).toBe(2);
	});

	it('keeps legal text insertion before voice channels unchanged', () => {
		const insertIndex = ChannelHelpers.normalizeGuildChannelInsertIndex({
			remainingChannels,
			insertIndex: 1,
			targetChannel: channel({channelId: 103, type: ChannelTypes.GUILD_TEXT, position: 4}),
			desiredParentId: categoryId,
		});

		expect(insertIndex).toBe(1);
	});

	it('does not normalize top-level inserts', () => {
		const insertIndex = ChannelHelpers.normalizeGuildChannelInsertIndex({
			remainingChannels,
			insertIndex: 3,
			targetChannel: channel({channelId: 103, type: ChannelTypes.GUILD_TEXT, position: 4}),
			desiredParentId: null,
		});

		expect(insertIndex).toBe(3);
	});
});
