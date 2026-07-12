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

import type {MessageDescriptor} from '@lingui/core';
import {msg} from '@lingui/core/macro';
import * as ChannelActionCreators from '~/actions/ChannelActionCreators';
import * as ModalActionCreators from '~/actions/ModalActionCreators';
import {selectChannel} from '~/actions/NavigationActionCreators';
import {ChannelTypes, isGuildRtcChannelType, Permissions} from '~/Constants';
import {Routes} from '~/Routes';
import * as RouterUtils from '~/utils/RouterUtils';

export interface FormInputs {
	name: string;
	url: string | null;
	type: string;
}

export interface ChannelTypeOption {
	value: number;
	name: MessageDescriptor;
	desc: MessageDescriptor;
}

/*
 * Frontend-only template value used by the create-channel modal.
 * It maps to a dedicated stage channel with listener-first permissions.
 */
export const EVENT_CHANNEL_TEMPLATE_TYPE = -1;

export const channelTypeOptions: Array<ChannelTypeOption> = [
	{
		value: ChannelTypes.GUILD_TEXT,
		name: msg`Text Channel`,
		desc: msg`Send messages, images, GIFs, and emoji`,
	},
	{
		value: ChannelTypes.GUILD_VOICE,
		name: msg`Voice Channel`,
		desc: msg`Hang out together with voice, video, and screen share`,
	},
	{
		value: EVENT_CHANNEL_TEMPLATE_TYPE,
		name: msg`Stage Channel`,
		desc: msg`Host an event in your community. Members join as listeners until added to broadcasters.`,
	},
	{
		value: ChannelTypes.GUILD_LINK,
		name: msg`Link Channel`,
		desc: msg`Quick access to an external website or resource`,
	},
];

const addListenerFirstSpeakPolicy = async (
	guildId: string,
	channel: {
		id: string;
		permission_overwrites?: ReadonlyArray<Readonly<{id: string; type: number; allow: string; deny: string}>>;
	},
) => {
	const existingOverwrites = Array.isArray(channel.permission_overwrites) ? channel.permission_overwrites : [];
	const everyoneOverwrite = existingOverwrites.find((overwrite) => overwrite.id === guildId && overwrite.type === 0);
	const nextEveryoneAllow = (BigInt(everyoneOverwrite?.allow ?? '0') & ~Permissions.SPEAK).toString();
	const nextEveryoneDeny = (BigInt(everyoneOverwrite?.deny ?? '0') | Permissions.SPEAK).toString();

	const nextPermissionOverwrites = existingOverwrites
		.filter((overwrite) => !(overwrite.id === guildId && overwrite.type === 0))
		.map((overwrite) => ({
			id: overwrite.id,
			type: overwrite.type as 0 | 1,
			allow: overwrite.allow,
			deny: overwrite.deny,
		}));

	nextPermissionOverwrites.push({
		id: guildId,
		type: 0,
		allow: nextEveryoneAllow,
		deny: nextEveryoneDeny,
	});

	await ChannelActionCreators.updatePermissionOverwrites(channel.id, nextPermissionOverwrites);
};

export const createChannel = async (guildId: string, data: FormInputs, parentId?: string): Promise<void> => {
	const selectedType = Number(data.type);
	const isEventTemplate = selectedType === EVENT_CHANNEL_TEMPLATE_TYPE;
	const channelType = isEventTemplate ? ChannelTypes.GUILD_STAGE : selectedType;
	const channel = await ChannelActionCreators.create(guildId, {
		name: data.name,
		url: data.url,
		type: channelType,
		parent_id: parentId || null,
		bitrate: isGuildRtcChannelType(channelType) ? 64000 : null,
		user_limit: isGuildRtcChannelType(channelType) ? 0 : null,
	});

	if (isEventTemplate) {
		await addListenerFirstSpeakPolicy(guildId, channel);
	}

	if (channel.type === ChannelTypes.GUILD_TEXT || isGuildRtcChannelType(channel.type)) {
		setTimeout(() => {
			RouterUtils.transitionTo(Routes.guildChannel(guildId, channel.id));
			selectChannel(guildId, channel.id);
		}, 50);
	}

	ModalActionCreators.pop();
};

export const getDefaultValues = (): Partial<FormInputs> => ({
	type: ChannelTypes.GUILD_TEXT.toString(),
});
