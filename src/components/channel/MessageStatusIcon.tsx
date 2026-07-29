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

import {CheckIcon, ChecksIcon, CircleNotchIcon} from '@phosphor-icons/react';
import {observer} from 'mobx-react-lite';
import React from 'react';
import {MessageStates} from '~/Constants';
import type {MessageRecord} from '~/records/MessageRecord';
import ReadStateStore from '~/stores/ReadStateStore';
import {compare as compareSnowflakes} from '~/utils/SnowflakeUtils';
import styles from './MessageStatusIcon.module.css';

interface Props {
	message: MessageRecord;
	channelId: string;
}

/**
 * Shows sending/sent/read status for own private-channel messages.
 * The current client has channel ack state; recipient-specific receipts can
 * plug into this component when the API starts sending them.
 */
export const MessageStatusIcon: React.FC<Props> = observer(({message, channelId}) => {
	if (!message.isCurrentUserAuthor()) return null;

	if (message.state === MessageStates.SENDING) {
		return (
			<span className={styles.statusIcon} aria-label="Sending">
				<CircleNotchIcon className={styles.spinning} weight="bold" />
			</span>
		);
	}

	if (message.state === MessageStates.FAILED) {
		return null;
	}

	const ackMessageId = ReadStateStore.ackMessageId(channelId);
	const isRead = ackMessageId !== null && compareSnowflakes(ackMessageId, message.id) >= 0;

	return (
		<span className={`${styles.statusIcon} ${isRead ? styles.read : styles.sent}`} aria-label={isRead ? 'Read' : 'Delivered'}>
			{isRead ? <ChecksIcon weight="bold" /> : <CheckIcon weight="bold" />}
		</span>
	);
});
