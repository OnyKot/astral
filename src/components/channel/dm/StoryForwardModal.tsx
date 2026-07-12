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

import {Trans, useLingui} from '@lingui/react/macro';
import {MagnifyingGlassIcon} from '@phosphor-icons/react';
import {observer} from 'mobx-react-lite';
import React from 'react';
import * as MessageActionCreators from '~/actions/MessageActionCreators';
import * as ModalActionCreators from '~/actions/ModalActionCreators';
import * as PrivateChannelActionCreators from '~/actions/PrivateChannelActionCreators';
import type {Story} from '~/actions/StoryActionCreators';
import * as ToastActionCreators from '~/actions/ToastActionCreators';
import {Input} from '~/components/form/Input';
import * as Modal from '~/components/modals/Modal';
import type {RecipientItem} from '~/components/modals/shared/RecipientList';
import {RecipientList, useRecipientItems} from '~/components/modals/shared/RecipientList';
import selectorStyles from '~/components/modals/shared/SelectorModalStyles.module.css';
import {Button} from '~/components/uikit/Button/Button';
import * as SnowflakeUtils from '~/utils/SnowflakeUtils';
import {encodeStoryForwardPayload} from '~/utils/StoryForwardPayload';
import styles from './StoryForwardModal.module.css';

export const StoryForwardModal = observer(({story, authorName}: {story: Story; authorName: string}) => {
	const {t} = useLingui();
	const recipients = useRecipientItems();
	const [searchQuery, setSearchQuery] = React.useState('');
	const [comment, setComment] = React.useState('');
	const [sentTo, setSentTo] = React.useState(new Map<string, boolean>());
	const [sendingTo, setSendingTo] = React.useState(new Set<string>());
	const storySummary = React.useMemo(() => {
		if (story.text.trim()) return story.text.trim();
		if (story.media_type === 'image') return t`Photo story`;
		if (story.media_type === 'video') return t`Video story`;
		return t`Story`;
	}, [story, t]);

	const getStoryCardContent = React.useCallback((): string => {
		return encodeStoryForwardPayload({
			authorName,
			summary: storySummary,
			mediaUrl: story.media_url || null,
			mediaType: story.media_type,
			comment: comment.trim() || null,
			storyId: story.id,
			userId: story.user_id,
			text: story.text,
			background: story.background,
			textAlign: story.text_align,
			textTone: story.text_tone,
			emojis: story.emojis,
			drawings: story.drawings,
		});
	}, [authorName, comment, story, storySummary]);

	const handleSend = async (item: RecipientItem) => {
		const userId = item.type === 'group_dm' ? item.id : item.user.id;
		setSendingTo((current) => new Set(current).add(userId));
		try {
			const channelId = item.channelId ?? (await PrivateChannelActionCreators.ensureDMChannel(item.user.id));
			await MessageActionCreators.send(channelId, {
				content: getStoryCardContent(),
				nonce: SnowflakeUtils.fromTimestamp(Date.now()),
				allowedMentions: {parse: []},
			});
			setSentTo((current) => new Map(current).set(userId, true));
			ToastActionCreators.createToast({type: 'success', children: <Trans>Story forwarded</Trans>});
		} catch (error) {
			console.error('Failed to forward story:', error);
			ToastActionCreators.createToast({type: 'error', children: <Trans>Could not forward this story</Trans>});
		} finally {
			setSendingTo((current) => {
				const next = new Set(current);
				next.delete(userId);
				return next;
			});
		}
	};

	return (
		<Modal.Root size="small" centered>
			<Modal.Header title={t`Forward story`}>
				<div className={selectorStyles.headerSearch}>
					<Input
						value={searchQuery}
						onChange={(event) => setSearchQuery(event.target.value)}
						placeholder={t`Search friends`}
						leftIcon={<MagnifyingGlassIcon size={20} weight="bold" className={selectorStyles.searchIcon} />}
						className={selectorStyles.headerSearchInput}
					/>
				</div>
			</Modal.Header>
			<Modal.Content className={selectorStyles.selectorContent}>
				<div className={styles.previewCard}>
					<div className={styles.previewMedia}>
						{story.media_type === 'image' && story.media_url ? (
							<img src={story.media_url} alt="" />
						) : story.media_type === 'video' && story.media_url ? (
							<video src={story.media_url} muted playsInline />
						) : (
							<span>Aa</span>
						)}
					</div>
					<div className={styles.previewInfo}>
						<div className={styles.previewLabel}>
							<Trans>Story preview</Trans>
						</div>
						<div className={styles.previewTitle}>{authorName}</div>
						<div className={styles.previewText}>{storySummary}</div>
					</div>
				</div>
				<Input
					value={comment}
					onChange={(event) => setComment(event.target.value.slice(0, 500))}
					placeholder={t`Add a message`}
					className={styles.commentInput}
				/>
				<RecipientList
					recipients={recipients}
					sendingTo={sendingTo}
					sentTo={sentTo}
					onSend={handleSend}
					defaultButtonLabel={t`Send`}
					sentButtonLabel={t`Sent`}
					buttonClassName={styles.sendButton}
					scrollerKey="story-forward-modal-recipient-list"
					searchQuery={searchQuery}
					onSearchQueryChange={setSearchQuery}
					showSearchInput={false}
				/>
			</Modal.Content>
			<Modal.Footer>
				<Button variant="secondary" onClick={() => ModalActionCreators.pop()}>
					<Trans>Close</Trans>
				</Button>
			</Modal.Footer>
		</Modal.Root>
	);
});
