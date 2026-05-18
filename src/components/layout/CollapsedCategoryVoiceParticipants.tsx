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

import {SpeakerHighIcon} from '@phosphor-icons/react';
import {observer} from 'mobx-react-lite';
import React from 'react';
import {AvatarStack} from '~/components/uikit/avatars/AvatarStack';
import {StackUserAvatar} from '~/components/uikit/avatars/StackUserAvatar';
import type {ChannelRecord} from '~/records/ChannelRecord';
import type {GuildRecord} from '~/records/GuildRecord';
import MediaEngineStore from '~/stores/voice/MediaEngineFacade';
import styles from './CollapsedCategoryVoiceParticipants.module.css';

export const CollapsedCategoryVoiceParticipants = observer(
	({guild, voiceChannels}: {guild: GuildRecord; voiceChannels: Array<ChannelRecord>}) => {
		const allVoiceStates = MediaEngineStore.getAllVoiceStates();

		/*
		 * Pre-compute the user→channel mapping in a single pass so the
		 * render loop below is O(n) instead of O(n×m). Previously
		 * firstChannelForUser() was called per-user inside JSX and
		 * searched through all voice channels each time.
		 */
		const {sortedUserIds, channelByUser} = React.useMemo(() => {
			const chanMap = new Map<string, ChannelRecord>();
			for (const channel of voiceChannels) {
				const states = allVoiceStates[guild.id]?.[channel.id];
				if (!states) continue;
				for (const s of Object.values(states)) {
					if (!chanMap.has(s.user_id)) {
						chanMap.set(s.user_id, channel);
					}
				}
			}
			const sorted = Array.from(chanMap.keys()).sort((a, b) => a.localeCompare(b));
			return {sortedUserIds: sorted, channelByUser: chanMap};
		}, [voiceChannels, allVoiceStates, guild.id]);

		if (sortedUserIds.length === 0) return null;

		return (
			<div className={styles.container}>
				<SpeakerHighIcon className={styles.icon} />
				<AvatarStack size={28} maxVisible={7}>
					{sortedUserIds.map((uid) => {
						const ch = channelByUser.get(uid);
						if (!ch) return null;
						return <StackUserAvatar key={uid} guild={guild} channel={ch} userId={uid} />;
					})}
				</AvatarStack>
			</div>
		);
	},
);

export const CollapsedChannelAvatarStack = observer(
	({guild, channel}: {guild: GuildRecord; channel: ChannelRecord}) => {
		const channelStates = MediaEngineStore.getAllVoiceStatesInChannel(guild.id, channel.id);

		const uniqueUserIds = React.useMemo(() => {
			const set = new Set<string>();
			for (const s of Object.values(channelStates)) set.add(s.user_id);
			return Array.from(set);
		}, [channelStates]);

		return (
			<div className={styles.channelContainer}>
				<AvatarStack size={28} maxVisible={10}>
					{uniqueUserIds.map((uid) => (
						<StackUserAvatar key={uid} guild={guild} channel={channel} userId={uid} />
					))}
				</AvatarStack>
			</div>
		);
	},
);
