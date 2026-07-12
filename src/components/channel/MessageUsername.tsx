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
import FocusRing from '~/components/uikit/FocusRing/FocusRing';
import type {GuildMemberRecord} from '~/records/GuildMemberRecord';
import type {GuildRecord} from '~/records/GuildRecord';
import type {MessageRecord} from '~/records/MessageRecord';
import type {UserRecord} from '~/records/UserRecord';
import KeyboardModeStore from '~/stores/KeyboardModeStore';
import styles from '~/styles/Message.module.css';
import * as NicknameUtils from '~/utils/NicknameUtils';
import {getChannelListNameEffectPreset} from '~/utils/ProfileEffectResolver';

const messageStyles = styles as unknown as Record<string, string>;

export const MessageUsername = observer(
	({
		user,
		message,
		guild,
		member,
		className,
		previewColor,
		previewName,
	}: {
		user: UserRecord;
		message: MessageRecord;
		guild?: GuildRecord;
		member?: GuildMemberRecord;
		className: string;
		isPreview: boolean;
		previewColor?: string;
		previewName?: string;
	}) => {
		const displayName = previewName || NicknameUtils.getNickname(user, guild?.id, message.channelId);
		const channelListNameEffect = getChannelListNameEffectPreset(user);
		const hasNameEffect = channelListNameEffect !== 'none' && !previewName;
		const color = hasNameEffect ? undefined : previewColor || member?.getColorString();

		return (
			<PreloadableUserPopout
				user={user}
				isWebhook={message.webhookId != null}
				guildId={guild?.id}
				channelId={message.channelId}
				enableLongPressActions={false}
			>
				<FocusRing>
					<span
						className={clsx(className, hasNameEffect && messageStyles[`messageUsernameEffect_${channelListNameEffect}`])}
						style={{color}}
						data-user-id={user.id}
						data-guild-id={guild?.id}
						data-message-swipe-ignore="true"
						tabIndex={KeyboardModeStore.keyboardModeEnabled ? 0 : -1}
						role="button"
						onKeyDown={(e) => {
							if (e.key === 'Enter' || e.key === ' ') {
								e.preventDefault();
								e.currentTarget.click();
							}
						}}
					>
						{displayName}
					</span>
				</FocusRing>
			</PreloadableUserPopout>
		);
	},
);
