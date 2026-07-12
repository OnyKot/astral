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

import {useLingui} from '@lingui/react/macro';
import {CaretDownIcon, GearIcon, PlusIcon, UserPlusIcon} from '@phosphor-icons/react';
import {Track, type LocalParticipant, type LocalTrackPublication, type RemoteParticipant, type RemoteTrackPublication} from 'livekit-client';

import {clsx} from 'clsx';
import {autorun} from 'mobx';
import {observer} from 'mobx-react-lite';
import React, {useCallback, useState} from 'react';
import type {ConnectableElement} from 'react-dnd';
import {useDrag, useDrop} from 'react-dnd';
import {getEmptyImage} from 'react-dnd-html5-backend';
import {createPortal} from 'react-dom';

import * as ContextMenuActionCreators from '~/actions/ContextMenuActionCreators';
import * as GuildMemberActionCreators from '~/actions/GuildMemberActionCreators';
import * as LayoutActionCreators from '~/actions/LayoutActionCreators';
import * as ModalActionCreators from '~/actions/ModalActionCreators';
import {modal} from '~/actions/ModalActionCreators';
import * as ToastActionCreators from '~/actions/ToastActionCreators';

import {ChannelTypes, isGuildRtcChannelType, Permissions} from '~/Constants';

import {ChannelBottomSheet} from '~/components/bottomsheets/ChannelBottomSheet';
import {VoiceLobbyBottomSheet} from '~/components/bottomsheets/VoiceLobbyBottomSheet';
import {Typing} from '~/components/channel/Typing';
import {getTypingText, usePresentableTypingUsers} from '~/components/channel/TypingUsers';
import {GenericChannelItem} from '~/components/layout/GenericChannelItem';
import {ChannelCreateModal} from '~/components/modals/ChannelCreateModal';
import {ChannelSettingsModal} from '~/components/modals/ChannelSettingsModal';
import {ExternalLinkWarningModal} from '~/components/modals/ExternalLinkWarningModal';
import {InviteModal} from '~/components/modals/InviteModal';
import {Avatar} from '~/components/uikit/Avatar';
import {AvatarStack} from '~/components/uikit/avatars/AvatarStack';
import {CategoryContextMenu} from '~/components/uikit/ContextMenu/CategoryContextMenu';
import {ChannelContextMenu} from '~/components/uikit/ContextMenu/ChannelContextMenu';
import FocusRing from '~/components/uikit/FocusRing/FocusRing';
import {MentionBadge} from '~/components/uikit/MentionBadge';
import {Tooltip} from '~/components/uikit/Tooltip/Tooltip';

import {useConnectedVoiceSession} from '~/hooks/useConnectedVoiceSession';
import {useMergeRefs} from '~/hooks/useMergeRefs';
import {useTextOverflow} from '~/hooks/useTextOverflow';

import {useLocation} from '~/lib/router';

import type {ChannelRecord} from '~/records/ChannelRecord';
import type {GuildRecord} from '~/records/GuildRecord';

import AccessibilityStore, {ChannelTypingIndicatorMode} from '~/stores/AccessibilityStore';
import AuthenticationStore from '~/stores/AuthenticationStore';
import AutocompleteStore from '~/stores/AutocompleteStore';
import ChannelStore from '~/stores/ChannelStore';
import ContextMenuStore, {isContextMenuNodeTarget} from '~/stores/ContextMenuStore';
import GuildMemberStore from '~/stores/GuildMemberStore';
import KeyboardModeStore from '~/stores/KeyboardModeStore';
import MobileLayoutStore from '~/stores/MobileLayoutStore';
import PermissionStore from '~/stores/PermissionStore';
import ReadStateStore from '~/stores/ReadStateStore';
import SelectedChannelStore from '~/stores/SelectedChannelStore';
import TrustedDomainStore from '~/stores/TrustedDomainStore';
import UserGuildSettingsStore from '~/stores/UserGuildSettingsStore';
import UserStore from '~/stores/UserStore';
import MediaEngineStore from '~/stores/voice/MediaEngineFacade';

import * as ChannelUtils from '~/utils/ChannelUtils';
import * as InviteUtils from '~/utils/InviteUtils';
import {stopPropagationOnEnterSpace} from '~/utils/KeyboardUtils';
import {openExternalUrl} from '~/utils/NativeUtils';
import * as PermissionUtils from '~/utils/PermissionUtils';
import * as RouterUtils from '~/utils/RouterUtils';
import {isBroadcastVoiceChannel} from '~/utils/channelVoiceMode';

import styles from './ChannelItem.module.css';
import {ChannelItemIcon} from './ChannelItemIcon';
import channelItemSurfaceStyles from './ChannelItemSurface.module.css';
import type {ScrollIndicatorSeverity} from './ScrollIndicatorOverlay';
import {DND_TYPES, type DragItem, type DropResult} from './types/dnd';
import {isCategory, isTextChannel} from './utils/channelOrganization';
import {VoiceChannelUserCount} from './VoiceChannelUserCount';

export interface ChannelItemCoreProps {
	channel: {
		name: string;
		type: number;
	};
	isSelected?: boolean;
	typingIndicator?: React.ReactNode;
	className?: string;
}

type ScreenSharePublication = LocalTrackPublication | RemoteTrackPublication;

const findScreenSharePublication = (participant: LocalParticipant | RemoteParticipant): ScreenSharePublication | null => {
	for (const publication of participant.videoTrackPublications.values()) {
		if (publication.source === Track.Source.ScreenShare) {
			return publication as ScreenSharePublication;
		}
	}
	return null;
};

export const ChannelItemCore: React.FC<ChannelItemCoreProps> = observer(
	({channel, isSelected = false, typingIndicator, className}) => {
		const channelLabelRef = React.useRef<HTMLSpanElement>(null);
		const isChannelNameOverflowing = useTextOverflow(channelLabelRef);

		return (
			<div
				className={clsx(
					styles.channelItemCore,
					isSelected ? styles.channelItemCoreSelected : styles.channelItemCoreUnselected,
					className,
				)}
			>
				<Tooltip text={channel.name}>
					<div>
						{ChannelUtils.getIcon(channel, {
							className: clsx(
								styles.channelItemIcon,
								isSelected ? styles.channelItemIconSelected : styles.channelItemIconUnselected,
							),
						})}
					</div>
				</Tooltip>
				<Tooltip text={isChannelNameOverflowing ? channel.name : ''}>
					<span ref={channelLabelRef} className={styles.channelItemLabel}>
						{channel.name}
					</span>
				</Tooltip>
				<div className={styles.channelItemActions}>{typingIndicator}</div>
			</div>
		);
	},
);

export const ChannelItem = observer(
	({
		guild,
		channel,
		categoryUnreadCount,
		isCollapsed,
		onToggle,
		compactView = false,
		sidebarCollapsed = false,
		isDraggingAnything,
		activeDragItem,
		onChannelDrop,
		onDragStateChange,
	}: {
		guild: GuildRecord;
		channel: ChannelRecord;
		categoryUnreadCount?: number;
		isCollapsed?: boolean;
		onToggle?: () => void;
		compactView?: boolean;
		sidebarCollapsed?: boolean;
		isDraggingAnything: boolean;
		activeDragItem?: DragItem | null;
		onChannelDrop?: (item: DragItem, result: DropResult) => void;
		onDragStateChange?: (item: DragItem | null) => void;
	}) => {
		const {t} = useLingui();
		const elementRef = React.useRef<HTMLDivElement | null>(null);
		const [contextMenuOpen, setContextMenuOpen] = React.useState(false);
		const categoryNameRef = React.useRef<HTMLSpanElement>(null);
		const channelNameRef = React.useRef<HTMLSpanElement>(null);

		const isCategoryNameOverflowing = useTextOverflow(categoryNameRef);
		const isChannelNameOverflowing = useTextOverflow(channelNameRef);

		const channelIsCategory = isCategory(channel);
		const channelIsVoice = isGuildRtcChannelType(channel.type);
		const channelIsText = isTextChannel(channel);
		const resolvedCategoryUnreadCount = channelIsCategory ? Math.max(0, categoryUnreadCount ?? 0) : 0;
		const draggingChannel = activeDragItem?.type === DND_TYPES.CHANNEL ? activeDragItem : null;
		const isVoiceDragActive = draggingChannel ? isGuildRtcChannelType(draggingChannel.channelType) : false;
		const shouldDimForVoiceDrag = Boolean(isVoiceDragActive && channelIsText && channel.parentId !== null);
		const location = useLocation();
		const channelPath = `/channels/${guild.id}/${channel.id}`;
		const unreadCount = ReadStateStore.getUnreadCount(channel.id);
		const selectedChannelId = SelectedChannelStore.selectedChannelIds.get(guild.id);
		const {guildId: connectedVoiceGuildId, channelId: connectedVoiceChannelId} = useConnectedVoiceSession();
		const canManageChannels = PermissionStore.can(Permissions.MANAGE_CHANNELS, channel);
		const canInvite = InviteUtils.canInviteToChannel(channel.id, channel.guildId);
		const mobileLayout = MobileLayoutStore;
		const isMuted = UserGuildSettingsStore.isChannelMuted(guild.id, channel.id);
		const voiceStatesInChannel = MediaEngineStore.getAllVoiceStatesInChannel(guild.id, channel.id);
		const currentUserCount = Object.keys(voiceStatesInChannel).length;
		const isMobileLayout = MobileLayoutStore.isMobileLayout();
		const allowHoverAffordances = !isMobileLayout;
		const [menuOpen, setMenuOpen] = useState(false);
		const [voiceLobbyOpen, setVoiceLobbyOpen] = useState(false);
		const [isVoiceHovered, setIsVoiceHovered] = useState(false);
		const [streamPreviewPosition, setStreamPreviewPosition] = useState<{left: number; top: number} | null>(null);
		const streamPreviewVideoRef = React.useRef<HTMLVideoElement | null>(null);
		const lastClickTime = React.useRef<number>(0);
		const voiceChannelJoinRequiresDoubleClick = AccessibilityStore.voiceChannelJoinRequiresDoubleClick;
		const [isFocused, setIsFocused] = useState(false);
		const {keyboardModeEnabled} = KeyboardModeStore;

		const showKeyboardAffordances = keyboardModeEnabled && isFocused;
		const currentUserId = AuthenticationStore.currentUserId;
		const currentUser = UserStore.getCurrentUser();
		const isUnclaimed = !(currentUser?.isClaimed() ?? false);
		const isGuildOwner = currentUser ? guild.isOwner(currentUser.id) : false;
		const currentMember = currentUserId ? GuildMemberStore.getMember(guild.id, currentUserId) : null;
		const isCurrentUserTimedOut = Boolean(currentMember?.isTimedOut());
		const voiceBlockedForUnclaimed = channelIsVoice && isUnclaimed && !isGuildOwner;
		const voiceTooltipText =
			channelIsVoice && isCurrentUserTimedOut
				? t`You can't join while you're on timeout.`
				: channelIsVoice && voiceBlockedForUnclaimed
					? t`Claim your account to join this voice channel.`
					: undefined;

		const isVoiceSelected =
			channelIsVoice &&
			connectedVoiceGuildId === guild.id &&
			connectedVoiceChannelId === channel.id;
		const isSelected = isVoiceSelected || location.pathname.startsWith(channelPath) || selectedChannelId === channel.id;
		const mentionCount = ReadStateStore.getMentionCount(channel.id);
		const hasUnreadMessages = unreadCount > 0;
		const hasCategoryUnreadMessages = channelIsCategory && resolvedCategoryUnreadCount > 0;
		const isHighlight = mentionCount > 0 || hasUnreadMessages;
		const scrollIndicatorSeverity: ScrollIndicatorSeverity | undefined = channelIsCategory
			? undefined
			: mentionCount > 0
				? 'mention'
				: hasUnreadMessages
					? 'unread'
					: undefined;
		const scrollIndicatorId = `channel-${channel.id}`;
		const isAutocompleteHighlight = AutocompleteStore.highlightChannelId === channel.id;
		const typingUsers = usePresentableTypingUsers(channel);
		const channelTypingIndicatorMode = AccessibilityStore.channelTypingIndicatorMode;
		const showSelectedChannelTypingIndicator = AccessibilityStore.showSelectedChannelTypingIndicator;
		const streamerVoiceState = React.useMemo(() => {
			if (!channelIsVoice) return null;
			return Object.values(voiceStatesInChannel).find((state) => state.self_stream === true) ?? null;
		}, [channelIsVoice, voiceStatesInChannel]);
		const streamerUser = streamerVoiceState ? UserStore.getUser(streamerVoiceState.user_id) : null;
		const streamerParticipantIdentity = React.useMemo(() => {
			if (!streamerVoiceState?.connection_id) return null;
			const snapshot = MediaEngineStore.getParticipantByUserIdAndConnectionId(
				streamerVoiceState.user_id,
				streamerVoiceState.connection_id,
			);
			return snapshot?.identity ?? null;
		}, [streamerVoiceState?.connection_id, streamerVoiceState?.user_id]);
		const shouldShowStreamPreview = Boolean(
			allowHoverAffordances && channelIsVoice && isVoiceHovered && streamerParticipantIdentity && streamerUser,
		);
		const room = MediaEngineStore.room;

		const [dropIndicator, setDropIndicator] = React.useState<{position: 'top' | 'bottom'; isValid: boolean} | null>(
			null,
		);

		const dragItemData = React.useMemo<DragItem>(
			() => ({
				type: channelIsCategory ? DND_TYPES.CATEGORY : DND_TYPES.CHANNEL,
				id: channel.id,
				channelType: channel.type,
				parentId: channel.parentId,
				guildId: guild.id,
			}),
			[channelIsCategory, channel.id, channel.type, channel.parentId, guild.id],
		);

		const [{isDragging}, dragRef, preview] = useDrag(
			() => ({
				type: dragItemData.type,
				item: () => {
					onDragStateChange?.(dragItemData);
					return dragItemData;
				},
				canDrag: canManageChannels && !mobileLayout.enabled,
				collect: (monitor) => ({isDragging: monitor.isDragging()}),
				end: () => {
					onDragStateChange?.(null);
					setDropIndicator(null);
				},
			}),
			[dragItemData, canManageChannels, mobileLayout.enabled, onDragStateChange],
		);

		const isParticipantDragActive = activeDragItem?.type === DND_TYPES.VOICE_PARTICIPANT;

		const [{isOver, canDrop}, dropRef] = useDrop(
			() => ({
				accept: [DND_TYPES.CHANNEL, DND_TYPES.CATEGORY, DND_TYPES.VOICE_PARTICIPANT],
				canDrop: (item: DragItem) => {
					if (item.id === channel.id) return false;
					if (item.type === DND_TYPES.VOICE_PARTICIPANT) return channelIsVoice;
					if (item.type === DND_TYPES.CHANNEL) {
						if (isGuildRtcChannelType(item.channelType)) {
							if (!channelIsCategory && !channelIsVoice && !channelIsText) return false;
						}
						if (!isGuildRtcChannelType(item.channelType) && channelIsVoice) return false;
					}
					if (item.type === DND_TYPES.CATEGORY && channel.parentId !== null && !channelIsCategory) return false;
					return true;
				},
				hover: (_item: DragItem, monitor) => {
					const node = elementRef.current;
					if (!node) return;
					const hoverBoundingRect = node.getBoundingClientRect();
					const clientOffset = monitor.getClientOffset();
					if (!clientOffset) return;
					const hoverMiddleY = (hoverBoundingRect.bottom - hoverBoundingRect.top) / 2;
					const hoverClientY = clientOffset.y - hoverBoundingRect.top;
					setDropIndicator({
						position: hoverClientY < hoverMiddleY ? 'top' : 'bottom',
						isValid: monitor.canDrop(),
					});
				},
				drop: (item: DragItem, monitor): DropResult | undefined => {
					if (!monitor.canDrop()) {
						setDropIndicator(null);
						return;
					}
					if (item.type === DND_TYPES.VOICE_PARTICIPANT && channelIsVoice) {
						const canMove = PermissionStore.can(Permissions.MOVE_MEMBERS, {guildId: guild.id});
						if (!canMove || item.currentChannelId === channel.id) {
							setDropIndicator(null);
							return;
						}
						const targetChannel = ChannelStore.getChannel(channel.id);
						if (targetChannel) {
							const canTargetConnect = PermissionUtils.can(Permissions.CONNECT, item.userId!, targetChannel.toJSON());
							if (!canTargetConnect) {
								setDropIndicator(null);
								return;
							}
						}
						void GuildMemberActionCreators.update(guild.id, item.userId!, {
							channel_id: channel.id,
							connection_id: item.connectionId,
						});
						setDropIndicator(null);
						return;
					}
					const node = elementRef.current;
					if (!node) return;
					const hoverBoundingRect = node.getBoundingClientRect();
					const clientOffset = monitor.getClientOffset();
					if (!clientOffset) return;
					const hoverMiddleY = (hoverBoundingRect.bottom - hoverBoundingRect.top) / 2;
					const hoverClientY = clientOffset.y - hoverBoundingRect.top;
					let result: DropResult;
					if (channelIsCategory) {
						result = {
							targetId: channel.id,
							position: hoverClientY < hoverMiddleY ? 'before' : 'inside',
							targetParentId: hoverClientY < hoverMiddleY ? channel.parentId : channel.id,
						};
					} else {
						result = {
							targetId: channel.id,
							position: hoverClientY < hoverMiddleY ? 'before' : 'after',
							targetParentId: channel.parentId,
						};
					}
					onChannelDrop?.(item, result);
					setDropIndicator(null);
					return result;
				},
				collect: (monitor) => ({
					isOver: monitor.isOver({shallow: true}),
					canDrop: monitor.canDrop(),
				}),
			}),
			[channel.id, channel.type, channel.parentId, guild.id, channelIsCategory, channelIsVoice, onChannelDrop],
		);

		React.useEffect(() => {
			if (!isOver) setDropIndicator(null);
		}, [isOver]);

		React.useEffect(() => {
			preview(getEmptyImage(), {captureDraggingState: true});
		}, [preview]);

		React.useEffect(() => {
			const disposer = autorun(() => {
				const contextMenu = ContextMenuStore.contextMenu;
				const contextMenuTarget = contextMenu?.target?.target ?? null;
				const element = elementRef.current;
				const isOpen =
					Boolean(contextMenu) &&
					isContextMenuNodeTarget(contextMenuTarget) &&
					Boolean(element?.contains(contextMenuTarget));
				setContextMenuOpen(!!isOpen);
			});
			return () => disposer();
		}, []);

		React.useEffect(() => {
			const video = streamPreviewVideoRef.current;
			if (!shouldShowStreamPreview || !streamerParticipantIdentity || !room || !video) {
				return;
			}

			const participant =
				room.localParticipant?.identity === streamerParticipantIdentity
					? room.localParticipant
					: (room.remoteParticipants.get(streamerParticipantIdentity) ?? null);
			if (!participant) return;

			const publication = findScreenSharePublication(participant);
			if (!publication) return;

			const remotePublication = publication as RemoteTrackPublication;
			if (!publication.track && typeof remotePublication.setSubscribed === 'function') {
				try { remotePublication.setSubscribed(true); } catch {}
			}

			const track = publication.track;
			if (!track || typeof track.attach !== 'function') return;

			track.attach(video);
			video.muted = true;
			void video.play().catch(() => {});

			return () => {
				try { track.detach(video); } catch {}
			};
		}, [room, shouldShowStreamPreview, streamerParticipantIdentity, streamPreviewVideoRef.current]);

		React.useEffect(() => {
			const node = elementRef.current;
			if (!node || !allowHoverAffordances || !channelIsVoice) return;
			const onEnter = () => setIsVoiceHovered(true);
			const onLeave = () => setIsVoiceHovered(false);
			node.addEventListener('mouseenter', onEnter);
			node.addEventListener('mouseleave', onLeave);
			return () => {
				node.removeEventListener('mouseenter', onEnter);
				node.removeEventListener('mouseleave', onLeave);
			};
		}, [allowHoverAffordances, channelIsVoice]);

		React.useEffect(() => {
			if (!shouldShowStreamPreview) {
				setStreamPreviewPosition(null);
				return;
			}

			const updatePosition = () => {
				const node = elementRef.current;
				if (!node) return;
				const rect = node.getBoundingClientRect();
				const previewWidth = 216;
				const viewportWidth = window.innerWidth;
				const nextLeft =
					rect.right + 8 + previewWidth <= viewportWidth ? rect.right + 8 : Math.max(8, rect.left - previewWidth - 8);
				setStreamPreviewPosition({
					left: Math.round(nextLeft),
					top: Math.round(rect.top + rect.height / 2),
				});
			};

			updatePosition();
			window.addEventListener('resize', updatePosition);
			window.addEventListener('scroll', updatePosition, true);
			return () => {
				window.removeEventListener('resize', updatePosition);
				window.removeEventListener('scroll', updatePosition, true);
			};
		}, [shouldShowStreamPreview]);

		const handleSelect = useCallback(() => {
			if (channelIsVoice && isCurrentUserTimedOut) {
				ToastActionCreators.createToast({
					type: 'error',
					children: t`You can't join while you're on timeout.`,
				});
				return;
			}
			if (channelIsVoice && voiceBlockedForUnclaimed) {
				ToastActionCreators.createToast({
					type: 'error',
					children: t`Claim your account to join this voice channel.`,
				});
				return;
			}
			if (channel.type === ChannelTypes.GUILD_CATEGORY) {
				onToggle?.();
				return;
			}
			if (channel.type === ChannelTypes.GUILD_LINK && channel.url) {
				try {
					const parsed = new URL(channel.url);
					const isTrusted = TrustedDomainStore.isTrustedDomain(parsed.hostname);
					if (!isTrusted) {
						ModalActionCreators.push(
							modal(() => <ExternalLinkWarningModal url={channel.url!} hostname={parsed.hostname} />),
						);
					} else {
						void openExternalUrl(channel.url);
					}
				} catch {}
				return;
			}
			if (channelIsVoice) {
				const isBroadcastChannel = isBroadcastVoiceChannel(channel);
				if (isBroadcastChannel) {
					RouterUtils.transitionTo(channelPath);
					if (MobileLayoutStore.isMobileLayout()) {
						LayoutActionCreators.updateMobileLayoutState(false, true);
					}
					return;
				}

				if (isMobileLayout) {
					RouterUtils.transitionTo(channelPath);
					void MediaEngineStore.connectToVoiceChannel(guild.id, channel.id);
					LayoutActionCreators.updateMobileLayoutState(false, true);
					return;
				}
				if (isVoiceSelected) {
					RouterUtils.transitionTo(channelPath);
					if (MobileLayoutStore.isMobileLayout()) {
						LayoutActionCreators.updateMobileLayoutState(false, true);
					}
				} else {
					if (voiceChannelJoinRequiresDoubleClick) {
						const now = Date.now();
						const timeSinceLastClick = now - lastClickTime.current;
						lastClickTime.current = now;

						if (timeSinceLastClick < 500) {
							void MediaEngineStore.connectToVoiceChannel(guild.id, channel.id);
						} else {
							RouterUtils.transitionTo(channelPath);
							if (MobileLayoutStore.isMobileLayout()) {
								LayoutActionCreators.updateMobileLayoutState(false, true);
							}
						}
					} else {
						void MediaEngineStore.connectToVoiceChannel(guild.id, channel.id);
					}
				}
				return;
			}
			RouterUtils.transitionTo(channelPath);
			if (MobileLayoutStore.isMobileLayout()) {
				LayoutActionCreators.updateMobileLayoutState(false, true);
			}
		}, [
			channel,
			channelPath,
			guild.id,
			isVoiceSelected,
			onToggle,
			isMobileLayout,
			voiceChannelJoinRequiresDoubleClick,
		]);

		const handleContextMenu = useCallback(
			(event: React.MouseEvent) => {
				event.preventDefault();
				event.stopPropagation();

				if (isMobileLayout) {
					return;
				}

				ContextMenuActionCreators.openFromEvent(event, ({onClose}) =>
					channelIsCategory ? (
						<CategoryContextMenu category={channel} onClose={onClose} />
					) : (
						<ChannelContextMenu channel={channel} onClose={onClose} />
					),
				);
			},
			[channel, channelIsCategory, isMobileLayout],
		);

		const dragConnectorRef = useCallback(
			(node: ConnectableElement | null) => {
				dragRef(node);
			},
			[dragRef],
		);
		const dropConnectorRef = useCallback(
			(node: ConnectableElement | null) => {
				dropRef(node);
			},
			[dropRef],
		);
		const mergedRef = useMergeRefs([dragConnectorRef, dropConnectorRef, elementRef]);

		const shouldShowSelectedState =
			!channelIsCategory &&
			isSelected &&
			(!channelIsVoice || location.pathname.startsWith(channelPath));

		const hasMountedRef = React.useRef(false);

		React.useEffect(() => {
			if (shouldShowSelectedState && hasMountedRef.current) {
				elementRef.current?.scrollIntoView({block: 'nearest'});
			}
			hasMountedRef.current = true;
		}, [shouldShowSelectedState]);

		const channelItem = (
			<GenericChannelItem
				innerRef={mergedRef}
				containerClassName={styles.container}
				extraContent={hasUnreadMessages && <div className={styles.unreadIndicator} />}
				isOver={isOver}
				dropIndicator={dropIndicator}
				disabled={!isMobileLayout}
				data-dnd-name={channel.name}
				dataScrollIndicator={scrollIndicatorSeverity}
				dataScrollId={scrollIndicatorId}
				aria-label={`${channel.name} ${channelIsCategory ? 'category' : 'channel'}`}
				className={clsx(
					styles.channelItem,
					channelItemSurfaceStyles.channelItemSurface,
					shouldShowSelectedState && channelItemSurfaceStyles.channelItemSurfaceSelected,
					isAutocompleteHighlight && styles.channelItemAutocompleteHighlight,
					channelIsCategory ? styles.channelItemCategory : styles.channelItemRegular,
					hasCategoryUnreadMessages && styles.channelItemHighlight,
					!channelIsCategory && isHighlight && !shouldShowSelectedState && styles.channelItemHighlight,
					!channelIsCategory && !(isHighlight || isSelected || isVoiceSelected) && styles.channelItemMuted,
					shouldShowSelectedState && styles.channelItemSelected,
					shouldShowSelectedState && isHighlight && styles.channelItemSelectedWithUnread,
					!channelIsCategory &&
						(!isSelected ||
							(channelIsVoice && !location.pathname.startsWith(channelPath))) &&
						styles.channelItemHoverable,
					isOver && styles.channelItemOver,
					isParticipantDragActive &&
						channelIsVoice &&
						canDrop &&
						!isOver &&
						styles.channelItemVoiceDropReady,
					isParticipantDragActive &&
						channelIsVoice &&
						isOver &&
						canDrop &&
						styles.channelItemVoiceDropActive,
					contextMenuOpen && !isSelected && !channelIsCategory && styles.channelItemContextMenu,
					contextMenuOpen && channelIsCategory && styles.channelItemCategoryContextMenu,
					isDragging && styles.channelItemDragging,
					shouldDimForVoiceDrag && !isSelected && styles.channelItemDimmed,
					isMuted && styles.channelItemMutedState,
					contextMenuOpen && styles.contextMenuOpen,
					showKeyboardAffordances && styles.keyboardFocus,
					channelIsVoice && styles.channelItemVoice,
					shouldShowStreamPreview && styles.channelItemWithPreview,
					compactView && styles.channelItemCompact,
					compactView && channelIsCategory && styles.channelItemCategoryCompact,
					sidebarCollapsed && styles.channelItemSidebarCollapsed,
					sidebarCollapsed && channelIsCategory && styles.channelItemCategorySidebarCollapsed,
					voiceBlockedForUnclaimed && styles.channelItemDisabled,
				)}
				onClick={handleSelect}
				onContextMenu={handleContextMenu}
				onKeyDown={(e) => e.key === 'Enter' && handleSelect()}
				onFocus={() => setIsFocused(true)}
				onBlur={() => setIsFocused(false)}
				onLongPress={() => {
					if (isMobileLayout) setMenuOpen(true);
				}}
			>
				{!channelIsCategory && (
					<Tooltip text={ChannelUtils.getName(channel)}>
						<div>
							{ChannelUtils.getIcon(channel, {
								className: clsx(
									styles.channelItemIcon,
									shouldShowSelectedState || (isHighlight && isSelected)
										? styles.channelItemIconSelected
										: isVoiceSelected && channelIsVoice
											? styles.channelItemHighlight
											: isHighlight && !isSelected
												? styles.channelItemIconHighlight
												: styles.channelItemIconUnselected,
								),
							})}
						</div>
					</Tooltip>
				)}
				{channelIsCategory ? (
					<div className={styles.categoryContent}>
						<Tooltip text={isCategoryNameOverflowing && channel.name ? channel.name : ''}>
							<span ref={categoryNameRef} className={styles.categoryName}>
								{channel.name ?? ''}
							</span>
						</Tooltip>
						{resolvedCategoryUnreadCount > 0 && !sidebarCollapsed && (
							<MentionBadge mentionCount={resolvedCategoryUnreadCount} size="small" />
						)}
						<CaretDownIcon
							weight="bold"
							className={styles.categoryIcon}
							style={{transform: `rotate(${isCollapsed ? -90 : 0}deg)`}}
						/>
					</div>
				) : (
					<Tooltip text={isChannelNameOverflowing && channel.name ? channel.name : ''}>
						<span ref={channelNameRef} className={styles.channelName}>
							{channel.name ?? ''}
						</span>
					</Tooltip>
				)}
				{!isDraggingAnything && !sidebarCollapsed && (
					<div className={styles.channelItemActions}>
						{!channelIsCategory && !channelIsVoice && (
							<>
								{typingUsers.length > 0 &&
									channelTypingIndicatorMode !== ChannelTypingIndicatorMode.HIDDEN &&
									(showSelectedChannelTypingIndicator || !isSelected) && (
										<Tooltip
											text={() => (
												<span className={styles.typingTooltip}>{getTypingText(t, typingUsers, channel)}</span>
											)}
										>
											<div className={styles.channelTypingIndicator}>
												<Typing className={styles.typingIndicatorIcon} size={20} />
												{channelTypingIndicatorMode === ChannelTypingIndicatorMode.AVATARS && (
													<AvatarStack size={12} maxVisible={5} className={styles.typingAvatars}>
														{typingUsers.map((user) => (
															<Avatar key={user.id} user={user} size={12} guildId={channel.guildId} />
														))}
													</AvatarStack>
												)}
											</div>
										</Tooltip>
									)}
								{!isSelected && <MentionBadge mentionCount={mentionCount} size="small" />}
							</>
						)}
						{channelIsVoice && channel.userLimit != null && channel.userLimit > 0 && (
							<div className={styles.voiceUserCount}>
								<VoiceChannelUserCount currentUserCount={currentUserCount} userLimit={channel.userLimit} />
							</div>
						)}
						{allowHoverAffordances && canInvite && !channelIsCategory && (
							<div className={styles.hoverAffordance}>
								<ChannelItemIcon
									icon={UserPlusIcon}
									label={t`Invite Members`}
									selected={shouldShowSelectedState}
									onClick={() => ModalActionCreators.push(modal(() => <InviteModal channelId={channel.id} />))}
								/>
							</div>
						)}
						{allowHoverAffordances && channelIsCategory && canManageChannels && (
							<div className={styles.hoverAffordance}>
								<Tooltip text={t`Create Channel`}>
									<FocusRing offset={-2}>
										<button
											type="button"
											className={styles.createChannelButton}
											onClick={(e) => {
												e.stopPropagation();
												ModalActionCreators.push(
													modal(() => <ChannelCreateModal guildId={guild.id} parentId={channel.id} />),
												);
											}}
											onKeyDown={stopPropagationOnEnterSpace}
										>
											<PlusIcon weight="bold" className={styles.createChannelIcon} />
										</button>
									</FocusRing>
								</Tooltip>
							</div>
						)}
						{allowHoverAffordances && canManageChannels && (
							<div className={styles.hoverAffordance}>
								<ChannelItemIcon
									icon={GearIcon}
									label={channelIsCategory ? t`Edit Category` : t`Channel Settings`}
									selected={shouldShowSelectedState}
									onClick={() => ModalActionCreators.push(modal(() => <ChannelSettingsModal channelId={channel.id} />))}
								/>
							</div>
						)}
					</div>
				)}
			</GenericChannelItem>
		);
		const channelWrapper = voiceTooltipText ? (
			<Tooltip text={voiceTooltipText} position="top">
				{channelItem}
			</Tooltip>
		) : (
			channelItem
		);

		return (
			<>
				{channelWrapper}
				{shouldShowStreamPreview &&
					streamPreviewPosition &&
					createPortal(
						<div
							className={styles.streamPreviewPopover}
							aria-hidden="true"
							style={{left: `${streamPreviewPosition.left}px`, top: `${streamPreviewPosition.top}px`}}
						>
							<div className={styles.streamPreviewMeta}>
								<span className={styles.streamPreviewTitle}>{streamerUser?.displayName ?? streamerUser?.username}</span>
							</div>
							<div className={styles.streamPreviewViewport}>
								<video
									ref={streamPreviewVideoRef}
									className={styles.streamPreviewImage}
									muted
									autoPlay
									playsInline
								/>
							</div>
						</div>,
						document.body,
					)}
				{/*
				 * Mount bottom sheets ONLY when open. Both ChannelBottomSheet
				 * and VoiceLobbyBottomSheet are MobX observer() components
				 * that subscribe to stores during render. Rendering them
				 * unconditionally (even when closed) created cascading MobX
				 * reactions that triggered "Cannot update a component while
				 * rendering a different component" warnings and wasted
				 * render cycles for every channel item on every voice
				 * state change.
				 */}
				{isMobileLayout && menuOpen && (
					<ChannelBottomSheet isOpen onClose={() => setMenuOpen(false)} channel={channel} guild={guild} />
				)}
				{isMobileLayout && voiceLobbyOpen && channelIsVoice && (
					<VoiceLobbyBottomSheet
						isOpen
						onClose={() => setVoiceLobbyOpen(false)}
						channel={channel}
						guild={guild}
					/>
				)}
			</>
		);
	},
);
