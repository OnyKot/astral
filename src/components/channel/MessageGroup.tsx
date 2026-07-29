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
import React, {Fragment} from 'react';
import type {ChannelRecord} from '~/records/ChannelRecord';
import type {MessageRecord} from '~/records/MessageRecord';
import {shouldContinueVisualMessageBlock} from '~/utils/MessageGroupingUtils';
import {Message} from './Message';
import styles from './Messages.module.css';
import {UnreadDividerSlot} from './UnreadDividerSlot';

const getStableMessageKey = (message: MessageRecord): string => message.nonce ?? message.id;

interface MessageGroupProps {
	messages: Array<MessageRecord>;
	channel: ChannelRecord;
	previousMessage?: MessageRecord;
	nextMessage?: MessageRecord;
	onEdit?: (targetNode: HTMLElement) => void;
	jumpSequenceId?: number;
	highlightedMessageId?: string | null;
	messageDisplayCompact?: boolean;
	flashKey?: number;
	getUnreadDividerVisibility?: (messageId: string, position: 'before' | 'after') => boolean;
	idPrefix?: string;
}

export const MessageGroup: React.FC<MessageGroupProps> = React.memo(
	observer((props) => {
		const {
			messages,
			channel,
			previousMessage,
			nextMessage,
			onEdit,
			jumpSequenceId,
			highlightedMessageId,
			messageDisplayCompact = false,
			getUnreadDividerVisibility,
			idPrefix,
		} = props;

		const groupId = messages[0]?.id;

		return (
			<div
				className={styles.messageGroup}
				data-jump-sequence-id={jumpSequenceId}
				data-group-id={groupId}
				role="group"
				aria-label="Message group">
				{messages.map((message, index) => {
					const prevMessage = index > 0 ? messages[index - 1] : previousMessage;
					const followingMessage = index < messages.length - 1 ? messages[index + 1] : nextMessage;
					const shouldGroupWithPrevious = shouldContinueVisualMessageBlock(prevMessage, message);
					const isGroupStart = !shouldGroupWithPrevious;
					const isGroupEnd = !shouldContinueVisualMessageBlock(message, followingMessage);

					return (
						<Fragment key={getStableMessageKey(message)}>
							{getUnreadDividerVisibility && (
								<UnreadDividerSlot beforeId={message.id} visible={getUnreadDividerVisibility(message.id, 'before')} />
							)}

							<div
								className={styles.messageItem}
								data-message-index={index}
								data-message-id={message.id}
								data-is-group-start={isGroupStart}>
								<Message
									channel={channel}
									message={message}
									prevMessage={prevMessage}
									onEdit={onEdit}
									shouldGroup={shouldGroupWithPrevious}
									isGroupEnd={isGroupEnd}
									showAvatar={isGroupStart}
									isJumpTarget={highlightedMessageId === message.id}
									compact={messageDisplayCompact}
									idPrefix={idPrefix}
								/>
							</div>
						</Fragment>
					);
				})}
			</div>
		);
	}),
	(prevProps, nextProps) => {
		// Only re-render if messages array changed or critical props changed
		if (prevProps.messages !== nextProps.messages) return false;
		if (prevProps.channel !== nextProps.channel) return false;
		if ((prevProps.previousMessage?.id ?? null) !== (nextProps.previousMessage?.id ?? null)) return false;
		if ((prevProps.nextMessage?.id ?? null) !== (nextProps.nextMessage?.id ?? null)) return false;
		if (prevProps.highlightedMessageId !== nextProps.highlightedMessageId) return false;
		if (prevProps.messageDisplayCompact !== nextProps.messageDisplayCompact) return false;
		if (prevProps.jumpSequenceId !== nextProps.jumpSequenceId) return false;
		return true;
	}
);
