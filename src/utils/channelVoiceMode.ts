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

import {ChannelTypes, Permissions} from '~/Constants';

type ChannelOverwriteLike = {
	id: string;
	type: number;
	allow: string | bigint;
	deny: string | bigint;
};

type PermissionOverwritesMap = Record<string, ChannelOverwriteLike>;

type EventVoiceChannelLike = {
	type: number;
	guildId?: string | null;
	guild_id?: string | null;
	permissionOverwrites?: PermissionOverwritesMap;
	permission_overwrites?: ReadonlyArray<Readonly<ChannelOverwriteLike>>;
};

const toBigInt = (value: string | bigint | undefined): bigint => {
	if (value === undefined) return 0n;
	return typeof value === 'bigint' ? value : BigInt(value);
};

const getGuildId = (channel: EventVoiceChannelLike): string | null => {
	return channel.guildId ?? channel.guild_id ?? null;
};

const getEveryoneOverwrite = (channel: EventVoiceChannelLike): ChannelOverwriteLike | null => {
	const guildId = getGuildId(channel);
	if (!guildId) return null;

	if (channel.permissionOverwrites) {
		const overwrite = channel.permissionOverwrites[guildId];
		if (overwrite && overwrite.type === 0) {
			return overwrite;
		}
	}

	if (Array.isArray(channel.permission_overwrites)) {
		const overwrite = channel.permission_overwrites.find((item) => item.id === guildId && item.type === 0);
		if (overwrite) {
			return {
				id: overwrite.id,
				type: overwrite.type,
				allow: overwrite.allow,
				deny: overwrite.deny,
			};
		}
	}

	return null;
};

export const isBroadcastVoiceChannel = (channel: EventVoiceChannelLike): boolean => {
	if (channel.type === ChannelTypes.GUILD_STAGE) return true;
	if (channel.type !== ChannelTypes.GUILD_VOICE) return false;

	const everyoneOverwrite = getEveryoneOverwrite(channel);
	if (!everyoneOverwrite) return false;

	const deny = toBigInt(everyoneOverwrite.deny);
	return (deny & Permissions.SPEAK) === Permissions.SPEAK;
};
