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

import {Plural, Trans, useLingui} from '@lingui/react/macro';

import {
	BellSimpleIcon,
	CopyIcon,
	CompassIcon,
	BellSimpleSlashIcon,
	CheckIcon,
	ChecksIcon,
	MagnifyingGlassIcon,
	NotePencilIcon,
	PaperPlaneIcon,
	PlusIcon,
	PushPinIcon,
	SignOutIcon,
	XIcon,
} from '@phosphor-icons/react';

import {clsx} from 'clsx';
import {observer} from 'mobx-react-lite';
import type React from 'react';
import {useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState} from 'react';

import * as ChannelActionCreators from '~/actions/ChannelActionCreators';
import * as ContextMenuActionCreators from '~/actions/ContextMenuActionCreators';
import * as LayoutActionCreators from '~/actions/LayoutActionCreators';
import * as MessageActionCreators from '~/actions/MessageActionCreators';
import * as ModalActionCreators from '~/actions/ModalActionCreators';
import {modal} from '~/actions/ModalActionCreators';
import * as NavigationActionCreators from '~/actions/NavigationActionCreators';
import * as PrivateChannelActionCreators from '~/actions/PrivateChannelActionCreators';
import * as TextCopyActionCreators from '~/actions/TextCopyActionCreators';
import * as ToastActionCreators from '~/actions/ToastActionCreators';
import * as UserActionCreators from '~/actions/UserActionCreators';
import * as UserProfileActionCreators from '~/actions/UserProfileActionCreators';

import {ChannelTypes, MAX_MESSAGES_PER_CHANNEL, ME, MessageTypes} from '~/Constants';

import {CreateDMBottomSheet} from '~/components/bottomsheets/CreateDMBottomSheet';
import {UserTag} from '~/components/channel/UserTag';
import {CustomStatusDisplay} from '~/components/common/CustomStatusDisplay/CustomStatusDisplay';
import {GroupDMAvatar} from '~/components/common/GroupDMAvatar';
import {LongPressable} from '~/components/LongPressable';
import {CreateDMModal} from '~/components/modals/CreateDMModal';
import {AddGuildModal} from '~/components/modals/AddGuildModal';
import {EditGroupBottomSheet} from '~/components/modals/EditGroupBottomSheet';
import {EditGroupModal} from '~/components/modals/EditGroupModal';
import {GroupInvitesBottomSheet} from '~/components/modals/GroupInvitesBottomSheet';
import {GroupInvitesModal} from '~/components/modals/GroupInvitesModal';
import {DMContextMenu} from '~/components/uikit/ContextMenu/DMContextMenu';
import {GroupDMContextMenu} from '~/components/uikit/ContextMenu/GroupDMContextMenu';
import {ResizeHandle} from '~/components/layout/ResizeHandle';
import {MobileNavigationMenuButton} from '~/components/layout/MobileNavigationDrawer';
import {FriendsIcon} from '~/components/icons/FriendsIcon';
import LayoutSizingStore from '~/stores/LayoutSizingStore';
import FocusRing from '~/components/uikit/FocusRing/FocusRing';
import {KeybindHint, TooltipWithKeybind} from '~/components/uikit/KeybindHint/KeybindHint';
import type {MenuGroupType} from '~/components/uikit/MenuBottomSheet/MenuBottomSheet';
import {MenuBottomSheet} from '~/components/uikit/MenuBottomSheet/MenuBottomSheet';
import {Scroller, type ScrollerHandle} from '~/components/uikit/Scroller';
import {StatusAwareAvatar} from '~/components/uikit/StatusAwareAvatar';
import {Tooltip} from '~/components/uikit/Tooltip/Tooltip';
import {StoriesRail} from '~/components/channel/dm/StoriesRail';

import {useLeaveGroup} from '~/hooks/useLeaveGroup';

import {getCustomStatusText, isGiftShowcaseCustomStatus, normalizeCustomStatus} from '~/lib/customStatus';
import {SafeMarkdown} from '~/lib/markdown';
import {MarkdownContext} from '~/lib/markdown/renderers';
import {useLocation} from '~/lib/router';

import {Routes} from '~/Routes';

import type {ChannelRecord} from '~/records/ChannelRecord';

import AuthenticationStore from '~/stores/AuthenticationStore';
import ChannelStore from '~/stores/ChannelStore';
import KeyboardModeStore from '~/stores/KeyboardModeStore';
import MessageStore from '~/stores/MessageStore';
import MobileLayoutStore from '~/stores/MobileLayoutStore';
import PresenceStore from '~/stores/PresenceStore';
import QuickSwitcherStore from '~/stores/QuickSwitcherStore';
import ReadStateStore from '~/stores/ReadStateStore';
import SelectedChannelStore from '~/stores/SelectedChannelStore';
import StoryStore from '~/stores/StoryStore';
import TypingStore from '~/stores/TypingStore';
import UserGuildSettingsStore from '~/stores/UserGuildSettingsStore';
import UserStore from '~/stores/UserStore';
import GuildListStore from '~/stores/GuildListStore';
import GuildReadStateStore from '~/stores/GuildReadStateStore';

import * as ChannelUtils from '~/utils/ChannelUtils';
import {getSortedDmChannels} from '~/utils/dmChannelUtils';
import * as RouterUtils from '~/utils/RouterUtils';
import SnowflakeUtil from '~/utils/SnowflakeUtil';
import {parseForwardedStoryPreview, parseForwardedStoryPreviewFromComponents} from '~/utils/StoryForwardPayload';
import {SystemMessageUtils} from '~/utils/SystemMessageUtils';
import * as TimeUtils from '~/utils/TimeUtils';
import * as AvatarUtils from '~/utils/AvatarUtils';
import * as StringUtils from '~/utils/StringUtils';

import {PullToRefresh} from '~/components/uikit/PullToRefresh/PullToRefresh';
import {SwipeActions} from '~/components/uikit/SwipeActions/SwipeActions';
import * as UserGuildSettingsActionCreators from '~/actions/UserGuildSettingsActionCreators';
import styles from './DMList.module.css';

const MOBILE_FRIENDS_CHANNEL_ID = '@friends';
const MOBILE_STORIES_COLLAPSE_DISTANCE_PX = 84;
const DM_PREVIEW_PRELOAD_BATCH_SIZE = 16;
const DM_PREVIEW_PRELOAD_BATCH_SIZE_MOBILE = 8;
const DM_PREVIEW_PRELOAD_MAX_CHANNELS = 96;
const DM_PREVIEW_PRELOAD_MAX_CHANNELS_MOBILE = 28;
const DM_THREAD_WARM_COUNT_DESKTOP = 3;
const DM_THREAD_WARM_COUNT_MOBILE = 1;
const DM_THREAD_WARM_MESSAGE_LIMIT_MOBILE = Math.min(MAX_MESSAGES_PER_CHANNEL, 24);
const DM_THREAD_WARM_DELAY_MS = 460;
const DM_THREAD_WARM_DELAY_MS_MOBILE = 900;

type IdleWindow = Window & {
	requestIdleCallback?: (callback: () => void, options?: {timeout?: number}) => number;
	cancelIdleCallback?: (id: number) => void;
};

const scheduleIdleWork = (callback: () => void, timeout = 700): (() => void) => {
	if (typeof window === 'undefined') {
		return () => {};
	}

	const idleWindow = window as IdleWindow;
	if (idleWindow.requestIdleCallback) {
		const idleId = idleWindow.requestIdleCallback(callback, {timeout});
		return () => idleWindow.cancelIdleCallback?.(idleId);
	}

	const timeoutId = window.setTimeout(callback, 0);
	return () => window.clearTimeout(timeoutId);
};

const prefetchDMChannelMessages = (channelId: string, limit = MAX_MESSAGES_PER_CHANNEL): void => {
	if (!channelId || channelId === MOBILE_FRIENDS_CHANNEL_ID) {
		return;
	}

	const messages = MessageStore.peekMessages(channelId);
	if (messages?.ready || messages?.loadingMore) {
		return;
	}

	void MessageActionCreators.prefetchMessages(channelId, limit).catch(() => {});
};

const DMListItem = observer(({channel, isSelected}: {channel: ChannelRecord; isSelected: boolean}) => {
	const {t, i18n} = useLingui();
	const readState = ReadStateStore.get(channel.id);

	const isGroupDM = channel.type === ChannelTypes.GROUP_DM;
	const recipient = !isGroupDM ? UserStore.getUser(channel.recipientIds[0]) : null;
	const recipientId = recipient?.id || '';
	const isBotDM = Boolean(recipient?.bot || recipient?.system);
	const isTyping = TypingStore.isTyping(channel.id, recipientId);
	const hasUnreadMessages = readState.hasUnread();
	const isMobile = MobileLayoutStore.isMobileLayout();
	const isMuted = UserGuildSettingsStore.isChannelMuted(null, channel.id);
	const recipientHasStory = !isGroupDM && StoryStore.hasActiveStory(recipientId);
	const recipientHasFreshStory = !isGroupDM && StoryStore.hasFreshStory(recipientId);
	const [menuOpen, setMenuOpen] = useState(false);
	const [editGroupSheetOpen, setEditGroupSheetOpen] = useState(false);
	const [invitesSheetOpen, setInvitesSheetOpen] = useState(false);
	const currentUser = UserStore.getCurrentUser();
	const messagesForChannel = MessageStore.peekMessages(channel.id);
	const lastMessage =
		messagesForChannel?.last() ??
		(channel.lastMessageId ? MessageStore.peekMessage(channel.id, channel.lastMessageId) : undefined);
	const leaveGroup = useLeaveGroup();
	const {keyboardModeEnabled} = KeyboardModeStore;
	const [isFocused, setIsFocused] = useState(false);

	const scrollTargetRef = useRef<HTMLElement | null>(null);
	const setDesktopRef = useCallback((node: HTMLButtonElement | null) => {
		scrollTargetRef.current = node;
	}, []);
	const setMobileRef = useCallback((node: HTMLDivElement | null) => {
		scrollTargetRef.current = node;
	}, []);

	useEffect(() => {
		if (isSelected && (!isMobile || keyboardModeEnabled)) {
			scrollTargetRef.current?.scrollIntoView({block: 'nearest'});
		}
	}, [isMobile, isSelected, keyboardModeEnabled]);

	if (!isGroupDM && !recipient) return null;

	const displayName = ChannelUtils.getDMDisplayName(channel);

	const dmPath = Routes.dmChannel(channel.id);
	const getRecipientStatusTooltip = useCallback(() => {
		if (!recipient) return null;
		const status = normalizeCustomStatus(PresenceStore.getCustomStatus(recipient.id));
		const text = getCustomStatusText(status);
		if (!text) return null;
		return isGiftShowcaseCustomStatus(status) ? t`Gift showcase` : text;
	}, [recipient, t]);

	const prefetchConversation = useCallback(() => {
		prefetchDMChannelMessages(channel.id, isMobile ? DM_THREAD_WARM_MESSAGE_LIMIT_MOBILE : MAX_MESSAGES_PER_CHANNEL);
	}, [channel.id, isMobile]);

	const navigateTo = () => {
		prefetchConversation();
		RouterUtils.transitionTo(dmPath);
		if (MobileLayoutStore.isMobileLayout()) {
			LayoutActionCreators.updateMobileLayoutState(false, true);
		}
	};

	const handleRemoveChannel = (e?: React.MouseEvent | React.KeyboardEvent) => {
		if (e) {
			e.preventDefault();
			e.stopPropagation();
		}
		setMenuOpen(false);

		if (isGroupDM) {
			leaveGroup(channel.id);
			return;
		}

		ChannelActionCreators.remove(channel.id);
		const selectedChannel = SelectedChannelStore.selectedChannelIds.get(ME);
		if (selectedChannel === channel.id) {
			RouterUtils.transitionTo(Routes.ME);
		}
	};

	const handleCopyChannelId = async () => {
		await TextCopyActionCreators.copy(i18n, channel.id);
		setMenuOpen(false);
	};

	const handleEditGroup = () => {
		setMenuOpen(false);
		if (isMobile) {
			setEditGroupSheetOpen(true);
		} else {
			ModalActionCreators.push(modal(() => <EditGroupModal channelId={channel.id} />));
		}
	};

	const handleShowInvites = () => {
		setMenuOpen(false);
		if (isMobile) {
			setInvitesSheetOpen(true);
		} else {
			ModalActionCreators.push(modal(() => <GroupInvitesModal channelId={channel.id} />));
		}
	};

	const handleLeaveGroup = () => {
		setMenuOpen(false);
		leaveGroup(channel.id);
	};

	const handlePinChannel = async () => {
		setMenuOpen(false);
		try {
			await PrivateChannelActionCreators.pinDmChannel(channel.id);
			ToastActionCreators.createToast({type: 'success', children: t`Pinned DM`});
		} catch {
			ToastActionCreators.createToast({type: 'error', children: t`Failed to pin DM`});
		}
	};

	const handleUnpinChannel = async () => {
		setMenuOpen(false);
		try {
			await PrivateChannelActionCreators.unpinDmChannel(channel.id);
			ToastActionCreators.createToast({type: 'success', children: t`Unpinned DM`});
		} catch {
			ToastActionCreators.createToast({type: 'error', children: t`Failed to unpin DM`});
		}
	};

	const menuGroups: Array<MenuGroupType> = [];

	if (isGroupDM) {
		menuGroups.push({
			items: [
				{
					icon: <NotePencilIcon weight="fill" className={styles.iconSize5} />,
					label: t`Edit Group`,
					onClick: handleEditGroup,
				},
				channel.isPinned
					? {
							icon: <PushPinIcon weight="fill" className={styles.iconSize5} />,
							label: t`Unpin Group DM`,
							onClick: handleUnpinChannel,
						}
					: {
							icon: <PushPinIcon weight="fill" className={styles.iconSize5} />,
							label: t`Pin Group DM`,
							onClick: handlePinChannel,
						},
			],
		});
		const isOwner = channel.ownerId === AuthenticationStore.currentUserId;
		if (isOwner) {
			menuGroups[0].items.push({
				icon: <PaperPlaneIcon weight="fill" className={styles.iconSize5} />,
				label: t`Invites`,
				onClick: handleShowInvites,
			});
		}
		menuGroups.push({
			items: [
				{
					icon: <SignOutIcon weight="fill" className={styles.iconSize5} />,
					label: t`Leave Group`,
					onClick: handleLeaveGroup,
					danger: true,
				},
				{
					icon: <CopyIcon weight="fill" className={styles.iconSize5} />,
					label: t`Copy Channel ID`,
					onClick: handleCopyChannelId,
				},
			],
		});
	} else {
		menuGroups.push({
			items: [
				channel.isPinned
					? {
							icon: <PushPinIcon weight="fill" className={styles.iconSize5} />,
							label: t`Unpin DM`,
							onClick: handleUnpinChannel,
						}
					: {
							icon: <PushPinIcon weight="fill" className={styles.iconSize5} />,
							label: t`Pin DM`,
							onClick: handlePinChannel,
						},
				{
					icon: <XIcon weight="bold" className={styles.iconSize5} />,
					label: t`Close DM`,
					onClick: () => handleRemoveChannel(),
					danger: true,
				},
				{
					icon: <CopyIcon weight="fill" className={styles.iconSize5} />,
					label: t`Copy Channel ID`,
					onClick: handleCopyChannelId,
				},
			],
		});
	}

	const relativeTime = channel.lastMessageId
		? TimeUtils.formatShortRelativeTime(SnowflakeUtil.extractTimestamp(channel.lastMessageId))
		: null;
	const isLastMessageFromCurrentUser = Boolean(lastMessage && lastMessage.author.id === currentUser?.id);
	const showDeliveryStatus = isMobile && !isGroupDM && isLastMessageFromCurrentUser;
	const isMessageRead = showDeliveryStatus && !hasUnreadMessages;

	const mobileListPreview = useMemo((): {text: string; rich: boolean} | null => {
		if (!lastMessage) return null;

		if (parseForwardedStoryPreview(lastMessage.content) || parseForwardedStoryPreviewFromComponents(lastMessage.components)) {
			return {text: t`Story preview`, rich: false};
		}

		const normalizedContent = lastMessage.content.trim().replace(/\s+/g, ' ');
		if (normalizedContent.length > 0) {
			return {text: normalizedContent, rich: true};
		}

		const firstAttachment = lastMessage.attachments?.[0];
		if (firstAttachment) {
			const contentType = firstAttachment.content_type?.toLowerCase() ?? '';
			if (
				contentType.startsWith('image/') ||
				contentType.startsWith('video/') ||
				contentType.startsWith('audio/') ||
				(firstAttachment.width != null && firstAttachment.height != null)
			) {
				return {text: t`Media`, rich: false};
			}
			return {text: t`File`, rich: false};
		}

		if (lastMessage.type !== MessageTypes.DEFAULT && lastMessage.type !== MessageTypes.REPLY) {
			const systemText = SystemMessageUtils.stringify(lastMessage, i18n);
			if (systemText) {
				return {text: systemText.replace(/\.$/, ''), rich: false};
			}
		}

		return null;
	}, [lastMessage, i18n, t]);

	const renderMobileListPreview = () => {
		if (!mobileListPreview) {
			return null;
		}

		return (
			<span className={clsx(styles.dmItemSubtext, mobileListPreview.rich && styles.dmItemPreviewMarkdown)}>
				{mobileListPreview.rich ? (
					<SafeMarkdown
						content={mobileListPreview.text}
						options={{context: MarkdownContext.RESTRICTED_INLINE_REPLY}}
					/>
				) : (
					mobileListPreview.text
				)}
			</span>
		);
	};

	const handleContextMenu = (event: React.MouseEvent) => {
		event.preventDefault();
		event.stopPropagation();
		if (isGroupDM) {
			ContextMenuActionCreators.openFromEvent(event, ({onClose}) => (
				<GroupDMContextMenu channel={channel} onClose={onClose} />
			));
		} else if (recipient) {
			ContextMenuActionCreators.openFromEvent(event, ({onClose}) => (
				<DMContextMenu channel={channel} recipient={recipient} onClose={onClose} />
			));
		}
	};

	const handleAvatarClick = (event: React.MouseEvent) => {
		event.preventDefault();
		event.stopPropagation();
		if (!recipient) return;
		if (recipientHasStory) {
			StoryStore.requestOpenUserStory(recipient.id);
			return;
		}
		UserProfileActionCreators.openUserProfile(recipient.id);
	};

	const handleToggleMuteSwipe = () => {
		if (isMuted) {
			UserGuildSettingsActionCreators.updateChannelOverride(
				null,
				channel.id,
				{muted: false, mute_config: null},
				{persistImmediately: true},
			);
		} else {
			UserGuildSettingsActionCreators.updateChannelOverride(
				null,
				channel.id,
				{muted: true, mute_config: null},
				{persistImmediately: true},
			);
		}
	};

	if (isMobile) {
		return (
			<>
				<SwipeActions
					className={styles.mobileSwipeRow}
					action={{
						icon: isMuted ? <BellSimpleIcon weight="fill" /> : <BellSimpleSlashIcon weight="fill" />,
						label: isMuted ? t`Unmute` : t`Mute`,
						color: isMuted
							? 'linear-gradient(135deg, color-mix(in srgb, var(--brand-primary) 18%, var(--background-secondary) 82%), color-mix(in srgb, var(--background-secondary) 92%, var(--background-primary) 8%))'
							: 'linear-gradient(135deg, color-mix(in srgb, var(--text-primary) 12%, var(--background-secondary) 88%), color-mix(in srgb, var(--background-secondary) 94%, var(--background-primary) 6%))',
						onAction: handleToggleMuteSwipe,
					}}
				>
					<FocusRing offset={-2}>
						<LongPressable
							ref={setMobileRef}
							onLongPress={() => setMenuOpen(true)}
							className={clsx(
								isSelected
									? styles.dmItemMobileSelected
									: hasUnreadMessages
										? styles.dmItemMobileUnread
										: styles.dmItemMobile,
								isMuted && styles.dmItemMobileMuted,
							)}
							pressedClassName={styles.dmItemMobilePressed}
							role="button"
							tabIndex={0}
							onClick={navigateTo}
							onPointerDown={prefetchConversation}
							onContextMenu={handleContextMenu}
							data-dm-item="mobile"
						>
							{hasUnreadMessages && (
								<div className={styles.dmItemUnreadIndicatorContainerMobile}>
									<span className={styles.dmItemUnreadIndicator} />
								</div>
							)}
							<div className={styles.dmItemContent}>
								<div className={styles.dmItemAvatarWrapper}>
									{isGroupDM ? (
										<GroupDMAvatar channel={channel} size={48} />
									) : (
										<button
											type="button"
											className={clsx(
												styles.dmAvatarButton,
												recipientHasStory && styles.dmStoryAvatarButton,
												recipientHasFreshStory ? styles.dmStoryAvatarFresh : recipientHasStory && styles.dmStoryAvatarSeen,
											)}
											onClick={handleAvatarClick}
											aria-label={recipientHasStory ? t`Open story` : t`Open profile`}
										>
											<StatusAwareAvatar user={recipient!} size={48} isTyping={isTyping} showOffline={true} />
										</button>
									)}
								</div>
								<div className={styles.dmItemInfo}>
									<span className={styles.dmItemName}>
										{channel.isPinned && <PushPinIcon weight="fill" className={styles.dmItemPinIcon} />}
										<span className={styles.dmItemNameText}>{displayName}</span>
										{!isGroupDM && isBotDM && <UserTag className={styles.dmItemUserTag} system={recipient?.system} />}
									</span>
									{mobileListPreview ? (
										renderMobileListPreview()
									) : !isGroupDM && recipient ? (
										<Tooltip
											position="bottom"
											text={getRecipientStatusTooltip}
										>
											<CustomStatusDisplay
												userId={recipient.id}
												className={styles.dmItemCustomStatus}
												showText={true}
												showTooltip={false}
												animateOnParentHover
											/>
										</Tooltip>
									) : isGroupDM ? (
										<span className={clsx(styles.dmItemSubtext, styles.dmItemMembersSubtext)}>
											<Plural value={channel.recipientIds.length + 1} one="# Member" other="# Members" />
										</span>
									) : null}
								</div>
								{(relativeTime || showDeliveryStatus) && (
									<div className={styles.dmItemMeta}>
										{relativeTime && <span className={styles.dmItemTimestamp}>{relativeTime}</span>}
										{showDeliveryStatus && (
											<span
												className={clsx(styles.dmItemDeliveryStatus, isMessageRead && styles.dmItemDeliveryStatusRead)}
												aria-label={isMessageRead ? t`Read` : t`Sent`}
											>
												{isMessageRead ? (
													<ChecksIcon weight="bold" className={styles.dmItemDeliveryIcon} />
												) : (
													<CheckIcon weight="bold" className={styles.dmItemDeliveryIcon} />
												)}
											</span>
										)}
									</div>
								)}
							</div>
						</LongPressable>
					</FocusRing>
				</SwipeActions>
				<MenuBottomSheet isOpen={menuOpen} onClose={() => setMenuOpen(false)} groups={menuGroups} />
				{isGroupDM && (
					<>
						<EditGroupBottomSheet
							isOpen={editGroupSheetOpen}
							onClose={() => setEditGroupSheetOpen(false)}
							channelId={channel.id}
						/>
						<GroupInvitesBottomSheet
							isOpen={invitesSheetOpen}
							onClose={() => setInvitesSheetOpen(false)}
							channelId={channel.id}
						/>
					</>
				)}
			</>
		);
	}

	return (
		<>
			<FocusRing offset={-2}>
				<button
					ref={setDesktopRef}
					type="button"
					className={clsx(
						isSelected ? styles.dmItemSelected : hasUnreadMessages ? styles.dmItemUnread : styles.dmItem,
						isMuted && styles.dmItemMuted,
					)}
					onClick={navigateTo}
					onContextMenu={handleContextMenu}
					onPointerEnter={prefetchConversation}
					onPointerDown={prefetchConversation}
					onFocus={() => {
						setIsFocused(true);
						prefetchConversation();
					}}
					onBlur={() => setIsFocused(false)}
					data-dm-item="desktop"
				>
					{hasUnreadMessages && (
						<div className={styles.dmItemUnreadIndicatorContainerDesktop}>
							<span className={styles.dmItemUnreadIndicator} />
						</div>
					)}
					<div className={styles.dmItemContent}>
						<div className={styles.dmItemAvatarWrapper}>
							{isGroupDM ? (
								<GroupDMAvatar channel={channel} size={32} />
							) : (
								// The row itself is a <button>, so this must not be a nested
								// <button> (invalid HTML, breaks hydration). Use role="button".
								<div
									role="button"
									tabIndex={0}
									className={clsx(
										styles.dmAvatarButton,
										styles.dmAvatarButtonDesktop,
										recipientHasStory && styles.dmStoryAvatarButton,
										recipientHasFreshStory ? styles.dmStoryAvatarFresh : recipientHasStory && styles.dmStoryAvatarSeen,
									)}
									onClick={handleAvatarClick}
									onKeyDown={(e) => {
										if (e.key === 'Enter' || e.key === ' ') {
											e.preventDefault();
											e.stopPropagation();
											handleAvatarClick(e as unknown as React.MouseEvent);
										}
									}}
									aria-label={recipientHasStory ? t`Open story` : t`Open profile`}
								>
									<StatusAwareAvatar user={recipient!} size={32} isTyping={isTyping} showOffline={true} />
								</div>
							)}
						</div>
						<div className={styles.dmItemInfo}>
							<span className={styles.dmItemName}>
								{channel.isPinned && <PushPinIcon weight="fill" className={styles.dmItemPinIcon} />}
								<span className={styles.dmItemNameText}>{displayName}</span>
								{!isGroupDM && isBotDM && <UserTag className={styles.dmItemUserTag} system={recipient?.system} />}
							</span>
							{mobileListPreview ? (
								renderMobileListPreview()
							) : !isGroupDM && recipient ? (
								<Tooltip
									position="bottom"
									text={getRecipientStatusTooltip}
								>
									<CustomStatusDisplay
										userId={recipient.id}
										className={styles.dmItemCustomStatus}
										showText={true}
										showTooltip={false}
										animateOnParentHover
									/>
								</Tooltip>
							) : isGroupDM ? (
								<span className={clsx(styles.dmItemSubtext, styles.dmItemMembersSubtext)}>
									<Plural value={channel.recipientIds.length + 1} one="# Member" other="# Members" />
								</span>
							) : null}
						</div>
						<FocusRing offset={-2}>
							<div
								role="button"
								tabIndex={0}
								className={styles.dmItemCloseButton}
								style={{opacity: isFocused && keyboardModeEnabled ? 1 : undefined}}
								onClick={handleRemoveChannel}
								onKeyDown={(e) => {
									if (e.key === 'Enter' || e.key === ' ') {
										handleRemoveChannel(e);
									}
								}}
							>
								<XIcon weight="bold" className={styles.iconSize4} />
							</div>
						</FocusRing>
					</div>
				</button>
			</FocusRing>
			{isGroupDM && (
				<>
					<EditGroupBottomSheet
						isOpen={editGroupSheetOpen}
						onClose={() => setEditGroupSheetOpen(false)}
						channelId={channel.id}
					/>
					<GroupInvitesBottomSheet
						isOpen={invitesSheetOpen}
						onClose={() => setInvitesSheetOpen(false)}
						channelId={channel.id}
					/>
				</>
			)}
		</>
	);
});

const getDmRouteChannelId = (pathname: string): string | null => {
	if (!pathname.startsWith(`${Routes.ME}/`)) {
		return null;
	}

	const [, , , channelId] = pathname.split('/');
	return channelId ?? null;
};

const getSelectedGuildIdFromPath = (pathname: string): string | null => {
	if (!Routes.isGuildChannelRoute(pathname)) {
		return null;
	}

	const match = pathname.match(/^\/channels\/([^/]+)/);
	if (!match || !match[1] || match[1].startsWith('@')) {
		return null;
	}

	return match[1];
};

const MobileGuildStripItem = observer(({guild, isSelected}: {guild: {id: string; name: string; icon: string | null}; isSelected: boolean}) => {
	const initials = StringUtils.getInitialsFromName(guild.name);
	const iconUrl = AvatarUtils.getGuildIconURL(guild, false);
	const mentionCount = GuildReadStateStore.getMentionCount(guild.id);
	const hasUnread = GuildReadStateStore.hasUnread(guild.id);
	const unreadCount = mentionCount > 0 ? mentionCount : hasUnread ? 1 : 0;
	const selectedChannel = SelectedChannelStore.selectedChannelIds.get(guild.id);

	const handleSelect = useCallback(() => {
		NavigationActionCreators.selectGuild(guild.id);
		RouterUtils.transitionTo(Routes.guildChannel(guild.id, selectedChannel));
		if (MobileLayoutStore.isMobileLayout()) {
			LayoutActionCreators.updateMobileLayoutState(false, true);
		}
	}, [guild.id, selectedChannel]);

	return (
		<FocusRing offset={-2}>
			<button
				type="button"
				className={clsx(styles.mobileGuildStripItem, isSelected && styles.mobileGuildStripItemSelected)}
				onClick={handleSelect}
				aria-label={guild.name}
				aria-pressed={isSelected}
			>
				<span
					className={clsx(styles.mobileGuildStripAvatar, !iconUrl && styles.mobileGuildStripAvatarFallback)}
					style={iconUrl ? {backgroundImage: `url(${iconUrl})`} : undefined}
				>
					{!iconUrl && <span className={styles.mobileGuildStripInitials}>{initials}</span>}
				</span>
				<span className={styles.mobileGuildStripName}>{guild.name}</span>
				{unreadCount > 0 && (
					<span className={styles.mobileGuildStripBadge}>
						{mentionCount > 0 ? mentionCount : ''}
					</span>
				)}
			</button>
		</FocusRing>
	);
});

export const DMList = observer(() => {
	const {t} = useLingui();
	const dmChannels = ChannelStore.dmChannels;
	const guilds = GuildListStore.guilds;
	const location = useLocation();
	const isDiscoveryTab = location.pathname === Routes.DISCOVERY || location.pathname.startsWith(`${Routes.DISCOVERY}/`);
	const currentUser = UserStore.currentUser;
	const isMobile = MobileLayoutStore.isMobileLayout();
	const [newMessageSheetOpen, setNewMessageSheetOpen] = useState(false);
	const [storyOverlayOpen, setStoryOverlayOpen] = useState(false);
	const [storiesCollapsed, setStoriesCollapsed] = useState(false);
	const [storiesCollapseProgress, setStoriesCollapseProgress] = useState(0);
	const [isRefreshingDialogs, setIsRefreshingDialogs] = useState(false);
	const [isMobileFabVisible, setIsMobileFabVisible] = useState(true);
	const guildStripViewportRef = useRef<HTMLDivElement | null>(null);
	const mobileScrollerRef = useRef<ScrollerHandle | null>(null);
	const mobileScrollSaveFrameRef = useRef<number | null>(null);
	const pendingMobileScrollTopRef = useRef(0);
	const lastMobileScrollTopRef = useRef(0);
	const mobileFabVisibleRef = useRef(true);
	const storiesCollapsedRef = useRef(false);
	const storiesCollapseProgressRef = useRef(0);
	const guildStripDragRef = useRef<{
		startX: number;
		startY?: number;
		startScrollLeft: number;
		moved: boolean;
		pointerId?: number;
	} | null>(null);
	const previewPreloadedChannelIdsRef = useRef<Set<string>>(new Set());
	const warmedThreadChannelIdsRef = useRef<Set<string>>(new Set());

	const handleOpenCreateDMModal = useCallback(() => {
		ModalActionCreators.push(modal(() => <CreateDMModal />));
	}, []);
	const handleOpenAddGuildModal = useCallback(() => {
		ModalActionCreators.push(modal(() => <AddGuildModal />));
	}, []);

	const currentUserId = currentUser?.id;
	const personalNotesPath = currentUserId ? Routes.dmChannel(currentUserId) : '';

	const filteredDmChannels = useMemo(() => getSortedDmChannels(dmChannels, currentUserId), [dmChannels, currentUserId]);
	const selectedGuildId = getSelectedGuildIdFromPath(location.pathname);

	const routeDmChannelId = getDmRouteChannelId(location.pathname);
	/*
	 * Selection/highlight policy for the DM list:
	 * We only highlight entries when the route explicitly points to that DM.
	 *
	 * Why:
	 * On mobile "/me" (index) previously auto-highlighted the first DM as a
	 * fallback. That created a confusing state where a conversation appeared
	 * selected even though the user had not opened it yet.
	 *
	 * Result:
	 * - No default "fake selected" chat on mobile index
	 * - Personal Notes is highlighted only when its route is actually active
	 * - Visual state now matches navigation state 1:1
	 */
	const highlightedChannelId = (() => {
		if (routeDmChannelId && routeDmChannelId !== currentUserId) {
			return routeDmChannelId;
		}
		return null;
	})();
	const shouldHighlightPersonalNotes =
		currentUserId != null && routeDmChannelId === currentUserId;
	const isFriendsViewSelected = routeDmChannelId === MOBILE_FRIENDS_CHANNEL_ID || location.pathname === Routes.ME;
	const mobileGreetingName = currentUser?.globalName ?? currentUser?.username ?? t`there`;
	const mobileStoryUsers = UserStore.getUsers();
	const currentUserHasStory = StoryStore.hasActiveStory(currentUserId);
	const currentUserHasFreshStory = StoryStore.hasFreshStory(currentUserId);
	const friendsPath = Routes.dmChannel(MOBILE_FRIENDS_CHANNEL_ID);
	const previewPreloadChannelIds = useMemo(
		() =>
			filteredDmChannels
				.slice(0, isMobile ? DM_PREVIEW_PRELOAD_MAX_CHANNELS_MOBILE : DM_PREVIEW_PRELOAD_MAX_CHANNELS)
				.map((channel) => channel.id),
		[filteredDmChannels, isMobile],
	);
	const warmThreadChannelIds = useMemo(() => {
		const maxWarmCount = isMobile ? DM_THREAD_WARM_COUNT_MOBILE : DM_THREAD_WARM_COUNT_DESKTOP;
		const result: Array<string> = [];
		if (highlightedChannelId) {
			result.push(highlightedChannelId);
		}

		for (const channel of filteredDmChannels) {
			if (result.length >= maxWarmCount) break;
			if (!result.includes(channel.id)) {
				result.push(channel.id);
			}
		}

		return result;
	}, [filteredDmChannels, highlightedChannelId, isMobile]);

	useEffect(() => {
		void StoryStore.loadStories();
	}, []);

	useEffect(() => {
		const pendingChannelIds = previewPreloadChannelIds.filter(
			(channelId) => !previewPreloadedChannelIdsRef.current.has(channelId),
		);
		if (pendingChannelIds.length === 0) {
			return;
		}

		for (const channelId of pendingChannelIds) {
			previewPreloadedChannelIdsRef.current.add(channelId);
		}

		let cancelled = false;
		let cancelCurrentBatch = () => {};

		const batchSize = isMobile ? DM_PREVIEW_PRELOAD_BATCH_SIZE_MOBILE : DM_PREVIEW_PRELOAD_BATCH_SIZE;

		const runBatch = (offset: number) => {
			cancelCurrentBatch = scheduleIdleWork(
				() => {
					if (cancelled) {
						return;
					}

					const batch = pendingChannelIds.slice(offset, offset + batchSize);
					if (batch.length > 0) {
						void UserActionCreators.preloadDMMessages(batch).catch(() => {});
					}

					const nextOffset = offset + batchSize;
					if (nextOffset < pendingChannelIds.length) {
						runBatch(nextOffset);
					}
				},
				isMobile ? (offset === 0 ? 900 : 1500) : offset === 0 ? 600 : 1200,
			);
		};

		runBatch(0);

		return () => {
			cancelled = true;
			cancelCurrentBatch();
		};
	}, [isMobile, previewPreloadChannelIds]);

	useEffect(() => {
		const pendingChannelIds = warmThreadChannelIds.filter((channelId) => {
			if (warmedThreadChannelIdsRef.current.has(channelId)) {
				return false;
			}
			const messages = MessageStore.peekMessages(channelId);
			return !messages?.ready && !messages?.loadingMore;
		});
		if (pendingChannelIds.length === 0) {
			return;
		}

		let cancelled = false;
		const cancelWarm = scheduleIdleWork(() => {
			if (cancelled) {
				return;
			}

			for (const channelId of pendingChannelIds) {
				warmedThreadChannelIdsRef.current.add(channelId);
				prefetchDMChannelMessages(
					channelId,
					isMobile ? DM_THREAD_WARM_MESSAGE_LIMIT_MOBILE : MAX_MESSAGES_PER_CHANNEL,
				);
			}
		}, isMobile ? DM_THREAD_WARM_DELAY_MS_MOBILE : DM_THREAD_WARM_DELAY_MS);

		return () => {
			cancelled = true;
			cancelWarm();
		};
	}, [isMobile, warmThreadChannelIds]);

	const navigateTo = (path: string) => () => {
		if (Routes.isDMRoute(path)) {
			if (path === Routes.ME) {
				NavigationActionCreators.selectChannel(ME, null);
			} else {
				const channelId = path.split('/').pop();
				if (channelId && channelId !== ME && channelId !== MOBILE_FRIENDS_CHANNEL_ID) {
					NavigationActionCreators.selectChannel(ME, channelId);
				} else if (channelId === MOBILE_FRIENDS_CHANNEL_ID) {
					NavigationActionCreators.selectChannel(ME, null);
				}
			}
		} else {
			NavigationActionCreators.selectChannel(ME, null);
		}
		RouterUtils.transitionTo(path);
		if (MobileLayoutStore.isMobileLayout()) {
			LayoutActionCreators.updateMobileLayoutState(false, true);
		}
	};

	const handleCurrentUserStoryClick = useCallback((event: React.MouseEvent<HTMLButtonElement>) => {
		if (!currentUserId || !currentUserHasStory) return;
		event.preventDefault();
		event.stopPropagation();
		StoryStore.requestOpenUserStory(currentUserId);
	}, [currentUserHasStory, currentUserId]);

	const handlePullToRefresh = useCallback(async () => {
		if (dmChannels.length === 0) return;
		setIsRefreshingDialogs(true);
		const channelIds = filteredDmChannels.slice(0, DM_PREVIEW_PRELOAD_MAX_CHANNELS).map((channel) => channel.id);
		const refreshStartedAt = Date.now();
		try {
			await UserActionCreators.preloadDMMessages(channelIds);
		} catch {}
		finally {
			const elapsed = Date.now() - refreshStartedAt;
			/*
			 * Keep the visual refresh state for a brief moment so the
			 * animation reads intentionally instead of flashing instantly
			 * on fast connections.
			 */
			const minRefreshMs = 300;
			if (elapsed < minRefreshMs) {
				await new Promise((resolve) => setTimeout(resolve, minRefreshMs - elapsed));
			}
			setIsRefreshingDialogs(false);
		}
	}, [dmChannels.length, filteredDmChannels]);

	const handleGuildStripPointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
		const viewport = guildStripViewportRef.current;
		if (!viewport) return;
		guildStripDragRef.current = {
			startX: event.clientX,
			startY: event.clientY,
			startScrollLeft: viewport.scrollLeft,
			moved: false,
			pointerId: event.pointerId,
		};
		viewport.setPointerCapture?.(event.pointerId);
	}, []);

	const handleGuildStripPointerMove = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
		const state = guildStripDragRef.current;
		const viewport = guildStripViewportRef.current;
		if (!state || !viewport) return;
		const dx = event.clientX - state.startX;
		const dy = event.clientY - (state.startY ?? event.clientY);
		const absDx = Math.abs(dx);
		const absDy = Math.abs(dy);
		if (!state.moved) {
			if (absDy >= 12 && absDy >= absDx) {
				guildStripDragRef.current = null;
				return;
			}
			if (absDx < 12) return;
			if (absDx < absDy * 1.5) {
				guildStripDragRef.current = null;
				return;
			}
		}
		if (absDy > 36 || absDy > absDx * 0.75) {
			guildStripDragRef.current = null;
			return;
		}
		state.moved = true;
		viewport.scrollLeft = state.startScrollLeft - dx;
		event.preventDefault();
		event.stopPropagation();
	}, []);

	const handleGuildStripPointerEnd = useCallback(() => {
		const viewport = guildStripViewportRef.current;
		const state = guildStripDragRef.current;
		if (state?.pointerId != null) {
			viewport?.releasePointerCapture?.(state.pointerId);
		}
		window.setTimeout(() => {
			guildStripDragRef.current = null;
		}, 0);
	}, []);

	const handleGuildStripClickCapture = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
		if (guildStripDragRef.current?.moved) {
			event.preventDefault();
			event.stopPropagation();
		}
	}, []);

	useLayoutEffect(() => {
		if (!isMobile) return;
		const savedPosition = Number.parseFloat(sessionStorage.getItem('astral:mobile-dm-list-scroll') ?? '0');
		const restoredPosition = Number.isFinite(savedPosition) ? savedPosition : 0;
		lastMobileScrollTopRef.current = restoredPosition;
		pendingMobileScrollTopRef.current = restoredPosition;
		const restoredStoriesProgress = Math.max(0, Math.min(1, restoredPosition / MOBILE_STORIES_COLLAPSE_DISTANCE_PX));
		storiesCollapseProgressRef.current = restoredStoriesProgress;
		storiesCollapsedRef.current = restoredStoriesProgress >= 0.98;
		setStoriesCollapseProgress(restoredStoriesProgress);
		setStoriesCollapsed(restoredStoriesProgress >= 0.98);
		const frame = window.requestAnimationFrame(() => {
			mobileScrollerRef.current?.scrollTo({to: restoredPosition, animate: false});
		});
		return () => window.cancelAnimationFrame(frame);
	}, [isMobile]);

	const setMobileFabVisibility = useCallback((nextVisible: boolean) => {
		if (mobileFabVisibleRef.current === nextVisible) {
			return;
		}
		mobileFabVisibleRef.current = nextVisible;
		setIsMobileFabVisible(nextVisible);
	}, []);

	const setStoriesCollapsedState = useCallback((nextCollapsed: boolean) => {
		if (storiesCollapsedRef.current === nextCollapsed) {
			return;
		}
		storiesCollapsedRef.current = nextCollapsed;
		setStoriesCollapsed(nextCollapsed);
	}, []);

	const setStoriesCollapseProgressState = useCallback((nextProgress: number) => {
		const clampedProgress = Math.max(0, Math.min(1, nextProgress));
		if (Math.abs(storiesCollapseProgressRef.current - clampedProgress) < 0.015) {
			return;
		}
		storiesCollapseProgressRef.current = clampedProgress;
		setStoriesCollapseProgress(clampedProgress);
		setStoriesCollapsedState(clampedProgress >= 0.98);
	}, [setStoriesCollapsedState]);

	const handleMobileScroll = useCallback((event: React.UIEvent<HTMLDivElement>) => {
		const scrollTop = Math.max(0, event.currentTarget.scrollTop);
		const delta = scrollTop - lastMobileScrollTopRef.current;
		pendingMobileScrollTopRef.current = scrollTop;
		lastMobileScrollTopRef.current = scrollTop;
		setStoriesCollapseProgressState(scrollTop / MOBILE_STORIES_COLLAPSE_DISTANCE_PX);

		if (scrollTop <= 24) {
			setMobileFabVisibility(true);
		} else if (delta > 7) {
			setMobileFabVisibility(false);
		} else if (delta < -5) {
			setMobileFabVisibility(true);
		}

		if (mobileScrollSaveFrameRef.current != null) return;

		mobileScrollSaveFrameRef.current = window.requestAnimationFrame(() => {
			mobileScrollSaveFrameRef.current = null;
			sessionStorage.setItem('astral:mobile-dm-list-scroll', String(pendingMobileScrollTopRef.current));
		});
	}, [setMobileFabVisibility, setStoriesCollapseProgressState]);

	useEffect(
		() => () => {
			if (mobileScrollSaveFrameRef.current != null) {
				window.cancelAnimationFrame(mobileScrollSaveFrameRef.current);
				mobileScrollSaveFrameRef.current = null;
			}
		},
		[],
	);

	if (isMobile) {
		return (
			<div className={styles.mobileContainer}>
				<div className={styles.mobileHeader}>
					<div className={styles.mobileHeaderInner}>
						<div className={styles.mobileWelcomeRow}>
							<MobileNavigationMenuButton className={styles.mobileMenuButton} />
							<div className={styles.mobileWelcomeProfile}>
								{currentUser ? (
									currentUserHasStory ? (
										<button
											type="button"
											className={clsx(
												styles.dmAvatarButton,
												styles.mobileWelcomeStoryButton,
												styles.dmStoryAvatarButton,
												currentUserHasFreshStory ? styles.dmStoryAvatarFresh : styles.dmStoryAvatarSeen,
											)}
											onClick={handleCurrentUserStoryClick}
											aria-label={t`Open story`}
										>
											<StatusAwareAvatar user={currentUser} size={40} showOffline={true} />
										</button>
									) : (
										<StatusAwareAvatar user={currentUser} size={40} showOffline={true} />
									)
								) : (
									<div className={styles.mobileWelcomeAvatarFallback} />
								)}
								<div className={styles.mobileWelcomeCopy}>
									<span className={styles.mobileWelcomeEyebrow}>
										<Trans>Hello</Trans>
									</span>
									<span className={styles.mobileWelcomeName}>{mobileGreetingName}</span>
								</div>
							</div>
							<FocusRing offset={-2}>
								<button
									type="button"
									onClick={navigateTo(Routes.DISCOVERY)}
									className={clsx(styles.mobileBellButton, isDiscoveryTab && styles.mobileBellButtonSelected)}
									aria-label={t`Search communities`}
								>
									<CompassIcon weight="fill" className={styles.iconSize5} />
								</button>
							</FocusRing>
						</div>
					</div>
				</div>

				<div className={styles.mobileTopQuickShell}>
					<StoriesRail
						users={mobileStoryUsers}
						onOverlayChange={setStoryOverlayOpen}
						isCollapsed={storiesCollapsed}
						collapseProgress={storiesCollapseProgress}
					/>
					<div className={styles.mobileSearchWrapper}>
						<button
							type="button"
							className={styles.mobileSearchButton}
							onClick={() => QuickSwitcherStore.show()}
							aria-label={t`Search chats`}
						>
							<MagnifyingGlassIcon weight="bold" className={styles.mobileSearchIcon} />
							<span>{t`Search chats`}</span>
						</button>
					</div>
					{guilds.length > 0 && (
						<div
							className={styles.mobileGuildStrip}
							aria-label={t`Communities`}
							data-pull-to-refresh-ignore="true"
						>
							<FocusRing offset={-2}>
								<button
									type="button"
									className={styles.mobileGuildAddButton}
									onClick={handleOpenAddGuildModal}
									aria-label={t`Add a Community`}
								>
									<PlusIcon weight="bold" className={styles.iconSize4} />
								</button>
							</FocusRing>
							<div
								ref={guildStripViewportRef}
								className={styles.mobileGuildStripViewport}
								onClickCapture={handleGuildStripClickCapture}
								onPointerDown={handleGuildStripPointerDown}
								onPointerMove={handleGuildStripPointerMove}
								onPointerUp={handleGuildStripPointerEnd}
								onPointerCancel={handleGuildStripPointerEnd}
								onPointerLeave={handleGuildStripPointerEnd}
							>
								{guilds.map((guild) => (
									<MobileGuildStripItem
										key={guild.id}
										guild={guild}
										isSelected={selectedGuildId === guild.id}
									/>
								))}
							</div>
						</div>
					)}
				</div>

				<PullToRefresh onRefresh={handlePullToRefresh} className={styles.mobilePullArea}>
					<Scroller
						ref={mobileScrollerRef}
						className={styles.mobileScroller}
						key="dm-list-mobile-scroller"
						reserveScrollbarTrack={false}
						onScroll={handleMobileScroll}
					>
						<div className={styles.mobileScrollerContent}>
							<div
								className={clsx(
									styles.mobileChatsSection,
									isRefreshingDialogs && styles.mobileChatsSectionRefreshing,
								)}
							>
								{filteredDmChannels.map((channel) => {
									const isSelected = highlightedChannelId === channel.id;
									return <DMListItem key={channel.id} channel={channel} isSelected={isSelected} />;
								})}
							</div>
						</div>
					</Scroller>
				</PullToRefresh>

				<FocusRing offset={-2}>
					<button
						type="button"
						onClick={() => setNewMessageSheetOpen(true)}
						className={clsx(
							styles.mobileFAB,
							(!isMobileFabVisible || newMessageSheetOpen || storyOverlayOpen) && styles.mobileFABHidden,
						)}
						aria-label={t`New message`}
					>
						<PaperPlaneIcon weight="fill" className={styles.sendIcon} />
					</button>
				</FocusRing>

				<CreateDMBottomSheet isOpen={newMessageSheetOpen} onClose={() => setNewMessageSheetOpen(false)} />
			</div>
		);
	}

	return (
		<div className={styles.dmListContainer}>
			<ResizeHandle
				direction="right"
				getSize={() => LayoutSizingStore.sidebarWidthPx}
				onResize={(px) => {
					LayoutSizingStore.previewSidebarWidth(px);
				}}
				onResizeEnd={(px) => {
					LayoutSizingStore.commitSidebarWidth(px);
				}}
				onReset={() => {
					LayoutSizingStore.resetSidebar();
				}}
			/>
			<FocusRing offset={-2}>
				<button type="button" className={styles.dmListHeader} onClick={() => QuickSwitcherStore.show()}>
					<div className={styles.dmListHeaderButton}>
						<span className={styles.dmListHeaderText}>
							<Trans>Quick Switcher</Trans>
						</span>
						<div className={styles.dmListHeaderShortcut}>
							<KeybindHint action="quick_switcher" />
						</div>
					</div>
				</button>
			</FocusRing>
			<Scroller className={styles.desktopScroller} key="dm-list-desktop-scroller">
				<div className={styles.scrollerContent}>
					<StoriesRail users={mobileStoryUsers} onOverlayChange={setStoryOverlayOpen} />

					<div className={styles.dmSectionHeader}>
						<div className={styles.dmSectionHeaderText}>
							<span className={styles.dmSectionHeaderLabel}>
								<Trans>Direct Messages</Trans>
							</span>
						</div>
						<Tooltip
							text={() => <TooltipWithKeybind label={t`Create DM`} action="create_private_group" />}
							position="top"
						>
							<FocusRing offset={-2}>
								<button type="button" className={styles.dmCreateButton} onClick={handleOpenCreateDMModal}>
									<PlusIcon weight="bold" className={styles.iconSize4} />
								</button>
							</FocusRing>
						</Tooltip>
					</div>

					<div className={styles.dmQuickItemCompact}>
						<FocusRing offset={-2}>
							<button
								type="button"
								className={clsx(styles.dmFriendsButton, isFriendsViewSelected && styles.dmFriendsButtonSelected)}
								onClick={navigateTo(friendsPath)}
								aria-pressed={isFriendsViewSelected}
							>
								<div className={styles.dmFriendsButtonIcon}>
									<FriendsIcon className={styles.iconSize4} />
								</div>
								<div className={styles.dmFriendsButtonText}>
									<span className={styles.dmFriendsButtonLabel}>
										<Trans>Friends</Trans>
									</span>
								</div>
							</button>
						</FocusRing>
					</div>
					{currentUserId && (
						<div className={styles.dmQuickItemCompact}>
							<FocusRing offset={-2}>
								<button
									type="button"
									className={clsx(styles.dmFriendsButton, shouldHighlightPersonalNotes && styles.dmFriendsButtonSelected)}
									onClick={navigateTo(personalNotesPath)}
									aria-pressed={shouldHighlightPersonalNotes}
								>
									<div className={styles.dmFriendsButtonIcon}>
										<NotePencilIcon weight="fill" className={styles.iconSize4} />
									</div>
									<div className={styles.dmFriendsButtonText}>
										<span className={styles.dmFriendsButtonLabel}>
											<Trans>Personal Notes</Trans>
										</span>
									</div>
								</button>
							</FocusRing>
						</div>
					)}
					<div className={styles.dmQuickAfterNotesSpacer} />

					<div className={styles.dmChannelList}>
						{filteredDmChannels.map((channel) => {
							const isSelected = highlightedChannelId === channel.id;
							return <DMListItem key={channel.id} channel={channel} isSelected={isSelected} />;
						})}
					</div>
					<div style={{height: 'var(--spacing-2)'}} />
				</div>
			</Scroller>
		</div>
	);
});
