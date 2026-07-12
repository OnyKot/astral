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

import {reaction} from 'mobx';
import {useEffect, useState} from 'react';
import {isOfflineStatus, type StatusType} from '~/Constants';
import MemberSidebarStore from '~/stores/MemberSidebarStore';
import PresenceStore from '~/stores/PresenceStore';

interface UseMemberListPresenceOptions {
	guildId: string;
	channelId: string;
	userId: string;
	enabled?: boolean;
}

function getResolvedMemberListStatus(guildId: string, channelId: string, userId: string, enabled: boolean): StatusType {
	const globalStatus = PresenceStore.getStatus(userId);
	const memberListPresence = enabled ? MemberSidebarStore.getPresence(guildId, channelId, userId) : null;

	if (memberListPresence !== null && (!PresenceStore.hasKnownStatus(userId) || isOfflineStatus(globalStatus))) {
		return memberListPresence;
	}

	return globalStatus;
}

export function useMemberListPresence({
	guildId,
	channelId,
	userId,
	enabled = true,
}: UseMemberListPresenceOptions): StatusType {
	const [status, setStatus] = useState(() => getResolvedMemberListStatus(guildId, channelId, userId, enabled));

	useEffect(() => {
		let disposeMemberListReaction: (() => void) | undefined;

		if (enabled) {
			disposeMemberListReaction = reaction(
				() => MemberSidebarStore.getPresence(guildId, channelId, userId),
				() => {
					setStatus(getResolvedMemberListStatus(guildId, channelId, userId, enabled));
				},
				{fireImmediately: true},
			);
		} else {
			setStatus(PresenceStore.getStatus(userId));
		}

		const unsubscribePresence = PresenceStore.subscribeToUserStatus(userId, () => {
			setStatus(getResolvedMemberListStatus(guildId, channelId, userId, enabled));
		});

		return () => {
			unsubscribePresence();
			disposeMemberListReaction?.();
		};
	}, [guildId, channelId, userId, enabled]);

	return status;
}
