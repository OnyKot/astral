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
import {BellSlashIcon, EyeIcon, WarningCircleIcon} from '@phosphor-icons/react';
import {clsx} from 'clsx';
import {autorun} from 'mobx';
import {observer} from 'mobx-react-lite';
import React from 'react';
import * as MessageActionCreators from '~/actions/MessageActionCreators';
import {ASTRALBOT_ID, MessageEmbedTypes, MessageFlags, MessageStates, MessageTypes} from '~/Constants';
import {EditingMessageInput} from '~/components/channel/EditingMessageInput';
import {MessageAttachments} from '~/components/channel/MessageAttachments';
import {MessageAuthorInfo} from '~/components/channel/MessageAuthorInfo';
import {MessageComponents} from '~/components/channel/MessageComponents';
import {ForwardedStoryCard} from '~/components/channel/ForwardedStoryCard';
import {MessageReactions} from '~/components/channel/MessageReactions';
import {MessageAvatar} from '~/components/channel/MessageAvatar';
import {MessageUsername} from '~/components/channel/MessageUsername';
import {ReplyPreview} from '~/components/channel/ReplyPreview';
import {TimestampWithTooltip} from '~/components/channel/TimestampWithTooltip';
import {UserTag} from '~/components/channel/UserTag';
import {MessageStatusIcon} from '~/components/channel/MessageStatusIcon';
import {Tooltip} from '~/components/uikit/Tooltip';
import FocusManager from '~/lib/FocusManager';
import {SafeMarkdown} from '~/lib/markdown';
import {NodeType} from '~/lib/markdown/parser/types/enums';
import {MarkdownContext, parse} from '~/lib/markdown/renderers';
import AccessibilityStore from '~/stores/AccessibilityStore';
import GuildMemberStore from '~/stores/GuildMemberStore';
import GuildStore from '~/stores/GuildStore';
import MessageEditStore from '~/stores/MessageEditStore';
import MobileLayoutStore from '~/stores/MobileLayoutStore';
import UserSettingsStore from '~/stores/UserSettingsStore';
import UserStore from '~/stores/UserStore';
import markupStyles from '~/styles/Markup.module.css';
import styles from '~/styles/Message.module.css';
import * as DateUtils from '~/utils/DateUtils';
import {SpoilerSyncProvider} from '~/utils/SpoilerUtils';
import {resolveForwardedStoryPreview} from '~/utils/StoryForwardPayload';
import {useMessageViewContext} from './MessageViewContext';

const MessageStateToClassName: Record<string, string> = {
	[MessageStates.SENT]: styles.messageSent,
	[MessageStates.SENDING]: styles.messageSending,
	[MessageStates.FAILED]: styles.messageFailed,
};

export const UserMessage = observer(() => {
	const {t, i18n} = useLingui();
	const {message, channel, handleDelete, isHovering, shouldGroup, showAvatar, previewContext, previewOverrides, onPopoutToggle} =
		useMessageViewContext();
	const [animateEmoji, setAnimateEmoji] = React.useState(
		UserSettingsStore.getAnimateEmoji() && FocusManager.isFocused(),
	);
	const [value, setValue] = React.useState('');
	const hasInitializedEditingRef = React.useRef(false);
	const isEditing = MessageEditStore.isEditing(message.channelId, message.id);
	const userAuthor = UserStore.getUser(message.author.id);
	const author = message.webhookId != null ? message.author : (userAuthor ?? message.author);
	const formattedDate = DateUtils.getRelativeDateString(message.timestamp, i18n);
	const cornerTimestamp = DateUtils.isSameDay(message.timestamp)
		? DateUtils.getFormattedTime(message.timestamp)
		: DateUtils.getFormattedShortDate(message.timestamp);
	const messageDisplayCompact = UserSettingsStore.getMessageDisplayCompact();
	const showUserAvatarsInCompactMode = AccessibilityStore.showUserAvatarsInCompactMode;
	const textareaRef = React.useRef<HTMLTextAreaElement>(null);
	const {nodes: astNodes} = React.useMemo(
		() =>
			parse({
				content: message.content,
				context: MarkdownContext.STANDARD_WITH_JUMBO,
			}),
		[message.content],
	);
	const storyPreview = React.useMemo(
		() => resolveForwardedStoryPreview(message.content, message.components),
		[message.components, message.content],
	);
	const hasStoryPreview = storyPreview != null;
	const hasTextContent = message.content.trim().length > 0 && !hasStoryPreview;

	const shouldHideContent =
		UserSettingsStore.getRenderEmbeds() &&
		message.embeds.length > 0 &&
		message.embeds.every((embed) => embed.type === MessageEmbedTypes.IMAGE || embed.type === MessageEmbedTypes.GIFV) &&
		astNodes.length === 1 &&
		astNodes[0].type === NodeType.Link &&
		!message.suppressEmbeds;

	const guild = GuildStore.getGuild(channel.guildId ?? '');
	const member = GuildMemberStore.getMember(guild?.id ?? '', author?.id ?? '');
	const shouldAppearAuthorless = false;

	const mobileLayout = MobileLayoutStore;
	const renderMessageStatus = () => <MessageStatusIcon message={message} channelId={channel.id} />;
	const renderMessageBubbleCornerMeta = () => (
		<span className={styles.messageBubbleCornerMeta}>
			<TimestampWithTooltip date={message.timestamp} className={styles.messageCornerTimestamp}>
				{cornerTimestamp}
			</TimestampWithTooltip>
			{message.isCurrentUserAuthor() && renderMessageStatus()}
		</span>
	);
	const renderStoryReactions = () => {
		if (!hasStoryPreview || !UserSettingsStore.getRenderReactions() || message.reactions.length === 0) {
			return null;
		}

		return <MessageReactions message={message} isPreview={Boolean(previewContext)} onPopoutToggle={onPopoutToggle} />;
	};

	React.useLayoutEffect(() => {
		if (isEditing) {
			if (!hasInitializedEditingRef.current) {
				hasInitializedEditingRef.current = true;
				const persistedDraft = MessageEditStore.getEditingContent(channel.id, message.id);
				const initialValue = persistedDraft ?? message.content;
				setValue(initialValue);
				textareaRef.current?.focus();
				textareaRef.current?.setSelectionRange(initialValue.length, initialValue.length);
			} else {
				textareaRef.current?.focus();
			}
		} else {
			hasInitializedEditingRef.current = false;
			setValue('');
		}
	}, [channel.id, isEditing, message.content, message.id]);

	React.useEffect(() => {
		if (!isEditing) {
			return;
		}
		MessageEditStore.setEditingContent(channel.id, message.id, value);
	}, [channel.id, isEditing, message.id, value]);

	React.useEffect(() => {
		if (animateEmoji) return;
		const emojiImgs = document.querySelectorAll(
			`img[data-message-id="${message.id}"][data-animated="true"]`,
		) as NodeListOf<HTMLImageElement>;

		for (const img of emojiImgs) {
			const src = img.src;
			img.src = isHovering ? src.replace('.webp', '.gif') : src.replace('.gif', '.webp');
		}
	}, [animateEmoji, isHovering, message.id]);

	/*
	 * Single unified effect for emoji animation.
	 * Merged from two duplicate autorun effects that both watched
	 * UserSettingsStore.animateEmoji and FocusManager.isFocused().
	 * Previous duplication caused double subscriptions and race conditions.
	 */
	React.useEffect(() => {
		const disposer = autorun(() => {
			const shouldAnimate = UserSettingsStore.animateEmoji && FocusManager.isFocused();
			setAnimateEmoji(shouldAnimate);

			const emojiImgs = document.querySelectorAll(
				`img[data-message-id="${message.id}"][data-animated="true"]`,
			) as NodeListOf<HTMLImageElement>;

			for (const img of emojiImgs) {
				const src = img.src;
				if (shouldAnimate) {
					img.src = src.replace('.webp', '.gif');
				} else {
					img.src = src.replace('.gif', '.webp');
				}
			}
		});

		return () => disposer();
	}, [message.id]);

	const onSubmit = React.useCallback(
		(actualContent?: string) => {
			if (message.messageSnapshots) {
				return;
			}
			const content = (actualContent ?? value).trim();
			if (!content) {
				handleDelete();
				return;
			}

			MessageActionCreators.stopEdit(channel.id);
			MessageActionCreators.edit(channel.id, message.id, content);
		},
		[channel.id, handleDelete, message.id, value, message.messageSnapshots],
	);

	const cancelEditing = React.useCallback(() => {
		MessageActionCreators.stopEdit(message.channelId);
	}, [message.channelId]);

	const handleDismissSystemMessage = React.useCallback(() => {
		MessageActionCreators.deleteOptimistic(message.channelId, message.id);
	}, [message.channelId, message.id]);

	if (message.type === MessageTypes.CLIENT_SYSTEM && message.author.id === ASTRALBOT_ID) {
		return (
			<SpoilerSyncProvider>
				<div className={styles.messageGutterLeft} />

				<MessageAvatar
					user={author}
					message={message}
					guildId={guild?.id}
					size={40}
					className={styles.messageAvatar}
					isHovering={isHovering}
					isPreview={!!previewContext}
				/>

				<div className={styles.messageGutterRight} />

				<div className={styles.messageContent}>
					<h3 className={styles.messageAuthorInfo}>
						<span className={styles.authorContainer}>
							<MessageUsername
								user={author}
								message={message}
								guild={guild}
								member={member ?? undefined}
								className={styles.messageUsername}
								isPreview={!!previewContext}
								previewColor={previewOverrides?.usernameColor}
								previewName={previewOverrides?.displayName}
							/>
							<UserTag className={styles.userTagOffset} system={author.system} />
						</span>
						<TimestampWithTooltip date={message.timestamp} className={styles.messageTimestamp}>
							{formattedDate}
						</TimestampWithTooltip>
						{renderMessageStatus()}
					</h3>
					<div className={styles.messageText} data-mobile-message-action-hitbox="bubble">
						<div className={clsx(markupStyles.markup)}>
							<SafeMarkdown
								content={message.content}
								options={{
									context: MarkdownContext.STANDARD_WITH_JUMBO,
									messageId: message.id,
									channelId: message.channelId,
								}}
							/>
						</div>

						<div className={styles.systemMessageContainer}>
							<EyeIcon className={styles.systemMessageIcon} />
							<div>
								<Trans>
									only you can see this message.{' '}
									<button
										type="button"
										className={styles.systemMessageDismissButton}
										onClick={handleDismissSystemMessage}
										key="dismiss"
									>
										dismiss
									</button>
								</Trans>
							</div>
						</div>
					</div>
				</div>

				<div className={styles.container}>
					<MessageAttachments />
					<MessageComponents />
				</div>
			</SpoilerSyncProvider>
		);
	}

	const renderMessageContent = () => {
		if (isEditing && !previewContext && !mobileLayout.enabled) {
			return (
				<EditingMessageInput
					channel={channel}
					onCancel={cancelEditing}
					onSubmit={onSubmit}
					textareaRef={textareaRef}
					value={value}
					setValue={setValue}
				/>
			);
		}

		if (shouldHideContent || (!hasTextContent && !hasStoryPreview)) return null;

		if (storyPreview) {
			return (
				<ForwardedStoryCard
					preview={storyPreview}
					messageId={message.id}
					channelId={message.channelId}
				/>
			);
		}

		return (
			<div className={clsx(markupStyles.markup)}>
				<SafeMarkdown
					content={message.content}
					options={{
						context: MarkdownContext.STANDARD_WITH_JUMBO,
						messageId: message.id,
						channelId: message.channelId,
					}}
				/>
				{(message.editedTimestamp || message.isEditing) &&
					(message.isEditing ? (
						<span className={styles.editedLabel}> {t`(edited)`}</span>
					) : (
						<TimestampWithTooltip date={message.editedTimestamp!} className={styles.editedTimestamp}>
							<span className={styles.editedLabel}> {t`(edited)`}</span>
						</TimestampWithTooltip>
					))}
			</div>
		);
	};

	if (messageDisplayCompact) {
		return (
			<SpoilerSyncProvider>
				{message.messageReference && message.messageReference.type === 0 && (
					<ReplyPreview message={message} channelId={channel.id} animateEmoji={animateEmoji} />
				)}

				<div className={styles.compactContentWrapper}>
					<MessageAuthorInfo
						message={message}
						author={author}
						guild={guild}
						member={member ?? undefined}
						shouldGroup={shouldGroup}
						shouldAppearAuthorless={shouldAppearAuthorless}
						messageDisplayCompact={messageDisplayCompact}
						showUserAvatarsInCompactMode={showUserAvatarsInCompactMode}
						mobileLayoutEnabled={mobileLayout.enabled}
						isHovering={isHovering}
						formattedDate={formattedDate}
						previewContext={previewContext}
						previewOverrides={previewOverrides}
					/>
					{!shouldHideContent && (hasTextContent || hasStoryPreview) && (
						hasStoryPreview ? (
							<>
								<div
									className={clsx(
										styles.compactForwardedStory,
										MessageStateToClassName[message.state],
									)}
									data-mobile-message-action-hitbox="bubble"
								>
									{renderMessageContent()}
									{renderMessageBubbleCornerMeta()}
								</div>
								{renderStoryReactions()}
							</>
						) : (
							<span
								className={clsx(styles.compactInlineContent, MessageStateToClassName[message.state])}
								data-mobile-message-action-hitbox="bubble"
							>
								{isEditing && !previewContext && !mobileLayout.enabled ? (
									<EditingMessageInput
										channel={channel}
										onCancel={cancelEditing}
										onSubmit={onSubmit}
										textareaRef={textareaRef}
										value={value}
										setValue={setValue}
									/>
								) : (
									<span className={clsx(markupStyles.markup, 'inline')}>
										<SafeMarkdown
											content={message.content}
											options={{
												context: MarkdownContext.STANDARD_WITH_JUMBO,
												messageId: message.id,
												channelId: message.channelId,
											}}
										/>
										{(message.editedTimestamp || message.isEditing) &&
											(message.isEditing ? (
												<span className={styles.editedLabel}> {t`(edited)`}</span>
											) : (
												<TimestampWithTooltip date={message.editedTimestamp!} className={styles.editedTimestamp}>
													<span className={styles.editedLabel}> {t`(edited)`}</span>
												</TimestampWithTooltip>
											))}
									</span>
								)}
								{renderMessageBubbleCornerMeta()}
							</span>
						)
					)}
				</div>

				<div className={styles.container}>
					<MessageAttachments />
					<MessageComponents />
					{((!hasTextContent && !hasStoryPreview && !isEditing) || shouldHideContent) && renderMessageBubbleCornerMeta()}
				</div>

				{mobileLayout.enabled && message.state === MessageStates.FAILED && (
					<div className={styles.mobileFailedIndicator}>
						<WarningCircleIcon weight="fill" className={styles.mobileFailedIcon} />
						<span>{t`Not sent. Hold for options.`}</span>
					</div>
				)}
			</SpoilerSyncProvider>
		);
	}

	return (
		<SpoilerSyncProvider>
			{message.messageReference && message.messageReference.type === 0 && (
				<ReplyPreview message={message} channelId={channel.id} animateEmoji={animateEmoji} />
			)}

			{showAvatar && (
				<>
					<div className={styles.messageGutterLeft} />
					<MessageAvatar
						user={author}
						message={message}
						guildId={guild?.id}
						size={40}
						className={styles.messageAvatar}
						isHovering={isHovering}
						isPreview={!!previewContext}
					/>
					<div className={styles.messageGutterRight} />
				</>
			)}

			{!showAvatar && (
				<MessageAuthorInfo
					message={message}
					author={author}
					guild={guild}
					member={member ?? undefined}
					shouldGroup
					shouldAppearAuthorless={shouldAppearAuthorless}
					messageDisplayCompact={messageDisplayCompact}
					showUserAvatarsInCompactMode={showUserAvatarsInCompactMode}
					mobileLayoutEnabled={mobileLayout.enabled}
					isHovering={isHovering}
					formattedDate={formattedDate}
					previewContext={previewContext}
					previewOverrides={previewOverrides}
				/>
			)}

			{(hasTextContent || hasStoryPreview || isEditing) &&
				((!shouldHideContent && (hasTextContent || hasStoryPreview)) || isEditing) && (
				<div className={styles.messageContent}>
					<div
						className={clsx(styles.messageText, MessageStateToClassName[message.state])}
						data-mobile-message-action-hitbox="bubble"
					>
						{showAvatar && (
							<h3 className={clsx(styles.messageAuthorInfo, styles.messageAuthorInfoInBubble)}>
								<span className={styles.authorContainer}>
									<MessageUsername
										user={author}
										message={message}
										guild={guild}
										member={member ?? undefined}
										className={styles.messageUsername}
										isPreview={!!previewContext}
										previewColor={previewOverrides?.usernameColor}
										previewName={previewOverrides?.displayName}
									/>
									{author.bot && <UserTag className={styles.userTagOffset} system={author.system} />}
								</span>
								{(message.flags & MessageFlags.SUPPRESS_NOTIFICATIONS) !== 0 && (
									<span className={styles.messageBubbleMeta}>
										<Tooltip text={t`This was a @silent message.`}>
											<BellSlashIcon weight="fill" className={styles.silentMessageIcon} />
										</Tooltip>
									</span>
								)}
							</h3>
						)}
						{renderMessageContent()}
						{renderMessageBubbleCornerMeta()}
					</div>
					{renderStoryReactions()}
				</div>
			)}

			<div className={styles.container}>
				{((!hasTextContent && !hasStoryPreview && !isEditing) || (shouldHideContent && !isEditing)) && showAvatar && (
					<h3 className={styles.messageAuthorInfo}>
						<span className={styles.authorContainer}>
							<MessageUsername
								user={author}
								message={message}
								guild={guild}
								member={member ?? undefined}
								className={styles.messageUsername}
								isPreview={!!previewContext}
								previewColor={previewOverrides?.usernameColor}
								previewName={previewOverrides?.displayName}
							/>
							{author.bot && <UserTag className={styles.userTagOffset} />}
						</span>
						{(message.flags & MessageFlags.SUPPRESS_NOTIFICATIONS) !== 0 && (
							<Tooltip text={t`This was a @silent message.`}>
								<BellSlashIcon weight="fill" className={styles.silentMessageIcon} />
							</Tooltip>
						)}
					</h3>
				)}

				<MessageAttachments />
				<MessageComponents />
				{((!hasTextContent && !hasStoryPreview && !isEditing) || shouldHideContent) && renderMessageBubbleCornerMeta()}
			</div>

			{mobileLayout.enabled && message.state === MessageStates.FAILED && (
				<div className={styles.mobileFailedIndicator}>
					<WarningCircleIcon weight="fill" className={styles.mobileFailedIcon} />
					<span>{t`Not sent. Hold for options.`}</span>
				</div>
			)}
		</SpoilerSyncProvider>
	);
});
