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

import {ChannelTypes, isGuildRtcChannelType} from '~/Constants';
import type {ChannelRecord} from '~/records/ChannelRecord';
import * as ChannelUtils from '~/utils/ChannelUtils';

export const isTextChannel = (ch: ChannelRecord) =>
	ch.type === ChannelTypes.GUILD_TEXT || ch.type === ChannelTypes.GUILD_LINK;

const isVoiceChannel = (ch: ChannelRecord) => isGuildRtcChannelType(ch.type);

export const isCategory = (ch: ChannelRecord) => ch.type === ChannelTypes.GUILD_CATEGORY;

interface ChannelGroup {
	id: string;
	category?: ChannelRecord;
	textChannels: Array<ChannelRecord>;
	voiceChannels: Array<ChannelRecord>;
	orderedChannels: Array<ChannelRecord>;
}

export const organizeChannels = (channels: ReadonlyArray<ChannelRecord>): Array<ChannelGroup> => {
	const categories = channels.filter(isCategory).sort(ChannelUtils.compareChannels);
	const categoryIds = new Set(categories.map((category) => category.id));
	const channelsByParent = new Map<string | null, Array<ChannelRecord>>();

	for (const channel of channels.filter((ch) => !isCategory(ch))) {
		const parentId = channel.parentId && categoryIds.has(channel.parentId) ? channel.parentId : null;
		if (!channelsByParent.has(parentId)) channelsByParent.set(parentId, []);
		channelsByParent.get(parentId)!.push(channel);
	}

	const groups: Array<ChannelGroup> = [];
	const topLevelChannels = (channelsByParent.get(null) || []).sort(ChannelUtils.compareChannels);
	const topLevelItems = [...categories, ...topLevelChannels].sort(ChannelUtils.compareChannels);
	let nullGroupIndex = 0;
	let pendingNullChannels: Array<ChannelRecord> = [];

	const flushNullGroup = () => {
		if (pendingNullChannels.length === 0) return;
		const orderedChannels = [...pendingNullChannels].sort(ChannelUtils.compareChannels);
		groups.push({
			id: `null-space-${nullGroupIndex++}`,
			textChannels: orderedChannels.filter(isTextChannel),
			voiceChannels: orderedChannels.filter(isVoiceChannel),
			orderedChannels,
		});
		pendingNullChannels = [];
	};

	for (const item of topLevelItems) {
		if (!isCategory(item)) {
			pendingNullChannels.push(item);
			continue;
		}

		flushNullGroup();
		const category = item;
		const categoryChannels = channelsByParent.get(category.id) || [];
		const orderedChannels = [...categoryChannels].sort(ChannelUtils.compareChannels);
		groups.push({
			id: category.id,
			category,
			textChannels: orderedChannels.filter(isTextChannel),
			voiceChannels: orderedChannels.filter(isVoiceChannel),
			orderedChannels,
		});
	}

	flushNullGroup();

	return groups;
};

export const flattenOrganizedChannels = (channels: ReadonlyArray<ChannelRecord>): Array<ChannelRecord> =>
	organizeChannels(channels).flatMap((group) => [
		...(group.category ? [group.category] : []),
		...group.orderedChannels,
	]);
