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

import {observer} from 'mobx-react-lite';
import type React from 'react';
import {useEffect, useState} from 'react';
import {StatusTypes} from '~/Constants';
import {Avatar} from '~/components/uikit/Avatar';
import type {UserRecord} from '~/records/UserRecord';
import PresenceStore from '~/stores/PresenceStore';
import MediaEngineStore from '~/stores/voice/MediaEngineFacade';

interface StatusAwareAvatarProps {
	user: UserRecord | null;
	size: 16 | 24 | 28 | 32 | 36 | 40 | 48 | 56 | 64 | 80 | 120;
	forceAnimate?: boolean;
	isTyping?: boolean;
	showOffline?: boolean;
	className?: string;
	isClickable?: boolean;
	disablePresence?: boolean;
	disableStatusTooltip?: boolean;
	avatarUrl?: string | null;
	hoverAvatarUrl?: string | null;
	guildId?: string | null;
	status?: string | null;
	disableMobileStatus?: boolean;
}

export const StatusAwareAvatar: React.FC<StatusAwareAvatarProps> = observer(
	({
		user,
		size,
		forceAnimate,
		isTyping,
		showOffline,
		className,
		isClickable,
		disablePresence,
		disableStatusTooltip = false,
		avatarUrl,
		hoverAvatarUrl,
		guildId,
		status: externalStatus,
		disableMobileStatus = false,
	}) => {
		const [internalStatus, setInternalStatus] = useState<string | null>(() =>
			disablePresence || !user ? null : PresenceStore.getStatus(user.id),
		);
		const [isMobile, setIsMobile] = useState<boolean>(() =>
			disablePresence || !user ? false : PresenceStore.isMobile(user.id),
		);

		const status = externalStatus ?? internalStatus;
		const isUserInAnyVoiceChannel = MediaEngineStore.isUserInAnyVoiceChannel(user?.id ?? '');
		const shouldShowVoiceCallStatus =
			Boolean(user) &&
			!disablePresence &&
			!isTyping &&
			isUserInAnyVoiceChannel &&
			status !== StatusTypes.INVISIBLE;

		useEffect(() => {
			if (disablePresence || !user || externalStatus !== undefined) {
				return;
			}

			setInternalStatus(PresenceStore.getStatus(user.id));
			setIsMobile(PresenceStore.isMobile(user.id));

			const unsubscribe = PresenceStore.subscribeToUserStatus(user.id, (_, newStatus, newIsMobile) => {
				setInternalStatus(newStatus);
				setIsMobile(newIsMobile);
			});

			return () => {
				unsubscribe();
			};
		}, [user?.id, disablePresence, user, externalStatus]);

		if (!user) {
			return null;
		}

		return (
			<Avatar
				user={user}
				size={size}
				status={disablePresence ? null : status}
				isMobileStatus={disablePresence || disableMobileStatus ? false : isMobile}
				forceAnimate={forceAnimate}
				isTyping={isTyping}
				isInCall={shouldShowVoiceCallStatus}
				showOffline={showOffline}
				className={className}
				isClickable={isClickable}
				disableStatusTooltip={disableStatusTooltip}
				avatarUrl={avatarUrl}
				hoverAvatarUrl={hoverAvatarUrl}
				guildId={guildId}
			/>
		);
	},
);
