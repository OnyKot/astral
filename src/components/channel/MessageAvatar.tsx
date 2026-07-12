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
import {clsx} from 'clsx';
import {PreloadableUserPopout} from '~/components/channel/PreloadableUserPopout';
import {Avatar} from '~/components/uikit/Avatar';
import FocusRing from '~/components/uikit/FocusRing/FocusRing';
import type {MessageRecord} from '~/records/MessageRecord';
import type {UserRecord} from '~/records/UserRecord';
import StoryStore from '~/stores/StoryStore';
import css from '~/styles/Message.module.css';

export const MessageAvatar = observer(
	({
		user,
		message,
		guildId,
		size,
		className,
		isHovering,
	}: {
		user: UserRecord;
		message: MessageRecord;
		guildId?: string;
		size: 16 | 24 | 32 | 40 | 48 | 80 | 120;
		className: string;
		isHovering: boolean;
			isPreview: boolean;
		}) => {
		const hasStory = message.webhookId == null && StoryStore.hasActiveStory(user.id);
		const hasFreshStory = message.webhookId == null && StoryStore.hasFreshStory(user.id);

		return (
			<PreloadableUserPopout
				user={user}
				isWebhook={message.webhookId != null}
				guildId={guildId}
				channelId={message.channelId}
				enableLongPressActions={false}
			>
				<FocusRing>
					<Avatar
						user={user}
						size={size}
						className={clsx(
							className,
							hasStory && css.messageAvatarStoryRing,
							hasFreshStory ? css.messageAvatarStoryFresh : hasStory && css.messageAvatarStorySeen,
						)}
						forceAnimate={isHovering}
						guildId={guildId}
						data-user-id={user.id}
						data-guild-id={guildId}
						data-message-swipe-ignore="true"
					/>
				</FocusRing>
			</PreloadableUserPopout>
		);
	},
);
