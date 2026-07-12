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
import styles from './MessageStatusIcon.module.css';

interface Props {
	message: MessageRecord;
	channelId: string;
}

/**
 * Shows sending/sent/read status for own DM messages.
 * - Spinning clock: message is being sent (optimistic)
 * - Single check: sent, not yet read by recipient
 * - Double check: read (recipient's ack is at or after this message)
 */
export const MessageStatusIcon: React.FC<Props> = observer(({message, channelId}) => {
	if (!message.isCurrentUserAuthor()) return null;

	if (message.state === MessageStates.SENDING) {
		return (
			<span className={styles.statusIcon} aria-label="Отправляется">
				<CircleNotchIcon className={styles.spinning} weight="bold" />
			</span>
		);
	}

	if (message.state === MessageStates.FAILED) {
		return null; // failed state handled elsewhere with red indicator
	}

	// Check if recipient has read up to this message
	const ackMessageId = ReadStateStore.ackMessageId(channelId);
	const isRead = ackMessageId !== null && BigInt(ackMessageId) >= BigInt(message.id);

	return (
		<span
			className={`${styles.statusIcon} ${isRead ? styles.read : styles.sent}`}
			aria-label={isRead ? 'Прочитано' : 'Доставлено'}
		>
			{isRead ? <ChecksIcon weight="bold" /> : <CheckIcon weight="bold" />}
		</span>
	);
});
