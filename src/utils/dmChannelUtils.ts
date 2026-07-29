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

import {ChannelTypes, RelationshipTypes} from '~/Constants';
import type {ChannelRecord} from '~/records/ChannelRecord';
import RelationshipStore from '~/stores/RelationshipStore';
import UserPinnedDMStore from '~/stores/UserPinnedDMStore';
import SnowflakeUtil from '~/utils/SnowflakeUtil';

const getChannelSortSnowflake = (channel: ChannelRecord): string => {
	const baseSnowflake = channel.lastMessageId ?? channel.id;

	if (channel.type !== ChannelTypes.DM) {
		return baseSnowflake;
	}

	const recipientId = channel.recipientIds[0];
	if (!recipientId) {
		return baseSnowflake;
	}

	const relationship = RelationshipStore.getRelationship(recipientId);
	if (!relationship || relationship.type !== RelationshipTypes.FRIEND) {
		return baseSnowflake;
	}

	const sinceTimestamp = relationship.since.getTime();
	if (!Number.isFinite(sinceTimestamp)) {
		return baseSnowflake;
	}

	const friendshipSnowflake = SnowflakeUtil.fromTimestamp(sinceTimestamp);
	return SnowflakeUtil.compare(friendshipSnowflake, baseSnowflake) > 0 ? friendshipSnowflake : baseSnowflake;
};

export const getSortedDmChannels = (
	dmChannels: ReadonlyArray<ChannelRecord>,
	currentUserId?: string | null,
): Array<ChannelRecord> => {
	const pinnedOrder = new Map(UserPinnedDMStore.pinnedDMs.map((id, index) => [id, index]));

	const compareChannelIds = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

	/*
	 * Decorate before sorting: the pin lookup and the sort snowflake (relationship
	 * lookup + BigInt snowflake math) are otherwise recomputed on every one of the
	 * O(n log n) comparisons. Both are pure with respect to state that cannot
	 * change mid-sort, so hoisting them out preserves the exact total order.
	 */
	const decorated = dmChannels
		.filter((channel) => !(channel.type === ChannelTypes.DM_PERSONAL_NOTES || channel.id === currentUserId))
		.map((channel) => ({
			channel,
			// -1 marks an unpinned channel; real pin indices are always >= 0.
			pinIndex: pinnedOrder.get(channel.id) ?? -1,
			sortSnowflake: getChannelSortSnowflake(channel),
		}));

	decorated.sort((a, b) => {
		const aIsPinned = a.pinIndex >= 0;
		const bIsPinned = b.pinIndex >= 0;

		if (aIsPinned && bIsPinned) {
			const diff = a.pinIndex - b.pinIndex;
			if (diff !== 0) {
				return diff;
			}
			return compareChannelIds(a.channel.id, b.channel.id);
		}
		if (aIsPinned !== bIsPinned) {
			return aIsPinned ? -1 : 1;
		}

		const sortDiff = SnowflakeUtil.compare(b.sortSnowflake, a.sortSnowflake);
		if (sortDiff !== 0) {
			return sortDiff;
		}
		return compareChannelIds(a.channel.id, b.channel.id);
	});

	return decorated.map((entry) => entry.channel);
};
