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
import {
	ArrowBendUpRightIcon,
	ArrowLeftIcon,
	CaretRightIcon,
	EyeSlashIcon,
	ListIcon,
	MagnifyingGlassIcon,
	PencilIcon,
	PhoneIcon,
	StarFourIcon,
	TrashIcon,
	UserPlusIcon,
	UsersIcon,
	VideoCameraIcon,
	XIcon,
} from '@phosphor-icons/react';
import {clsx} from 'clsx';
import {observer} from 'mobx-react-lite';
import React from 'react';
import * as CallActionCreators from '~/actions/CallActionCreators';
import * as ContextMenuActionCreators from '~/actions/ContextMenuActionCreators';
import * as FavoritesActionCreators from '~/actions/FavoritesActionCreators';
import * as LayoutActionCreators from '~/actions/LayoutActionCreators';
import * as MessageActionCreators from '~/actions/MessageActionCreators';
import * as ModalActionCreators from '~/actions/ModalActionCreators';
import {modal} from '~/actions/ModalActionCreators';
import * as ToastActionCreators from '~/actions/ToastActionCreators';
import * as UserProfileActionCreators from '~/actions/UserProfileActionCreators';
import {ChannelTypes, ME, RelationshipTypes, StatusTypes} from '~/Constants';
import {ChannelSearchBottomSheet} from '~/components/bottomsheets/ChannelSearchBottomSheet';
import {ChannelDetailsBottomSheet} from '~/components/bottomsheets/ChannelDetailsBottomSheet';
import {MessageSearchBar} from '~/components/channel/MessageSearchBar';
import {GroupDMAvatar} from '~/components/common/GroupDMAvatar';
import {NativeDragRegion} from '~/components/layout/NativeDragRegion';
import {AddFriendsToGroupModal} from '~/components/modals/AddFriendsToGroupModal';
import {CreateDMModal} from '~/components/modals/CreateDMModal';
import {EditGroupModal} from '~/components/modals/EditGroupModal';
import {ConfirmModal} from '~/components/modals/ConfirmModal';
import {ForwardModal} from '~/components/modals/ForwardModal';
import FocusRing from '~/components/uikit/FocusRing/FocusRing';
import {StatusAwareAvatar} from '~/components/uikit/StatusAwareAvatar';
import {useCanFitMemberList} from '~/hooks/useMemberListVisible';
import {useTextOverflow} from '~/hooks/useTextOverflow';
import {ComponentDispatch} from '~/lib/ComponentDispatch';
import {useLocation} from '~/lib/router/react';
import {Routes} from '~/Routes';
import type {ChannelRecord} from '~/records/ChannelRecord';
import AccessibilityStore from '~/stores/AccessibilityStore';
import CallStateStore from '~/stores/CallStateStore';
import ChannelListLayoutStore from '~/stores/ChannelListLayoutStore';
import FavoritesStore from '~/stores/FavoritesStore';
import MemberListStore from '~/stores/MemberListStore';
import MessageSelectionStore from '~/stores/MessageSelectionStore';
import MobileLayoutStore from '~/stores/MobileLayoutStore';
import PresenceStore from '~/stores/PresenceStore';
import UserActivityStore from '~/stores/UserActivityStore';
import RelationshipStore from '~/stores/RelationshipStore';
import MediaEngineStore from '~/stores/voice/MediaEngineFacade';
import * as CallUtils from '~/utils/CallUtils';
import * as ChannelUtils from '~/utils/ChannelUtils';
import {shouldUse12HourFormat} from '~/utils/DateUtils';
import {MAX_GROUP_DM_RECIPIENTS} from '~/utils/groupDmUtils';
import * as RouterUtils from '~/utils/RouterUtils';
import type {SearchSegment} from '~/utils/SearchSegmentManager';
import {UserTag} from '../channel/UserTag';
import {ChannelContextMenu} from '../uikit/ContextMenu/ChannelContextMenu';
import {MenuGroup} from '../uikit/ContextMenu/MenuGroup';
import {MenuItem} from '../uikit/ContextMenu/MenuItem';
import {Tooltip} from '../uikit/Tooltip/Tooltip';
import {CallButtons} from './ChannelHeader/CallButtons';
import {ChannelHeaderIcon} from './ChannelHeader/ChannelHeaderIcon';
import {ChannelNotificationSettingsButton} from './ChannelHeader/ChannelNotificationSettingsButton';
import {ChannelPinsButton} from './ChannelHeader/ChannelPinsButton';
import {UpdaterIcon} from './ChannelHeader/UpdaterIcon';
import {MobileNavigationMenuButton} from '~/components/layout/MobileNavigationDrawer';
import {InboxButton} from './ChannelHeader/UtilityButtons';
import styles from './ChannelHeader.module.css';
import {useChannelHeaderData} from './channel-header/useChannelHeaderData';

const {VoiceCallButton, VideoCallButton} = CallButtons;
const LAST_ONLINE_RECENT_MS = 10 * 60 * 1000;

const formatLastOnlineTime = (timestamp: string, locale: string): string | null => {
	const date = new Date(timestamp);
	const time = date.getTime();
	if (!Number.isFinite(time)) {
		return null;
	}

	return new Intl.DateTimeFormat(locale, {
		hour: 'numeric',
		minute: '2-digit',
		hour12: shouldUse12HourFormat(locale),
	}).format(date);
};

interface ChannelHeaderProps {
	channel?: ChannelRecord;
	leftContent?: React.ReactNode;
	showMembersToggle?: boolean;
	showPins?: boolean;
	onSearchSubmit?: (query: string, segments: Array<SearchSegment>) => void;
	onSearchClose?: () => void;
	isSearchResultsOpen?: boolean;
	forceVoiceCallStyle?: boolean;
	showMobileBackButton?: boolean;
}

export const ChannelHeader = observer(
	({
		channel,
		leftContent,
		showMembersToggle = false,
		showPins = true,
		onSearchSubmit,
		onSearchClose,
		isSearchResultsOpen,
		forceVoiceCallStyle = false,
		showMobileBackButton = true,
	}: ChannelHeaderProps) => {
		const {t, i18n} = useLingui();

		const location = useLocation();
		const {isMembersOpen} = MemberListStore;
		const isMobile = MobileLayoutStore.isMobileLayout();
		const isCallChannelConnected = Boolean(MediaEngineStore.connected && MediaEngineStore.channelId === channel?.id);
		const isVoiceCallActive =
			!isMobile &&
			Boolean(
				channel &&
					(channel.type === ChannelTypes.DM || channel.type === ChannelTypes.GROUP_DM) &&
					isCallChannelConnected &&
					CallStateStore.hasActiveCall(channel.id),
			);
		const isVoiceHeaderActive = isVoiceCallActive || forceVoiceCallStyle;
		const canFitMemberList = useCanFitMemberList();

		const [channelDetailsOpen, setChannelDetailsOpen] = React.useState(false);
		const [channelSearchOpen, setChannelSearchOpen] = React.useState(false);
		const [openSearchImmediately, setOpenSearchImmediately] = React.useState(false);
		const [initialTab, setInitialTab] = React.useState<'members' | 'pins'>('members');
		const [searchQuery, setSearchQuery] = React.useState('');
		const [searchSegments, setSearchSegments] = React.useState<Array<SearchSegment>>([]);
		const latestSearchQueryRef = React.useRef('');
		const latestSearchSegmentsRef = React.useRef<Array<SearchSegment>>([]);
		React.useEffect(() => {
			latestSearchQueryRef.current = searchQuery;
			latestSearchSegmentsRef.current = searchSegments;
		}, [searchQuery, searchSegments]);
		const searchInputRef = React.useRef<HTMLInputElement>(null);

		const dmNameRef = React.useRef<HTMLSpanElement>(null);
		const groupDMNameRef = React.useRef<HTMLSpanElement>(null);
		const guildChannelNameRef = React.useRef<HTMLSpanElement>(null);

		const isDMNameOverflowing = useTextOverflow(dmNameRef);
		const isGroupDMNameOverflowing = useTextOverflow(groupDMNameRef);
		const isGuildChannelNameOverflowing = useTextOverflow(guildChannelNameRef);

		const {
			isDM,
			isGroupDM,
			isPersonalNotes,
			isGuildChannel,
			isVoiceChannel,
			recipient,
			directMessageName,
			groupDMName,
			channelName,
			channelTypeLabel,
		} = useChannelHeaderData(channel);
		const isBotDMRecipient = isDM && recipient?.bot;
		const isChannelSidebarCollapsed = !isMobile && isGuildChannel && ChannelListLayoutStore.getSidebarCollapsed();

		const isFavorited = channel && !isPersonalNotes ? !!FavoritesStore.getChannel(channel.id) : false;

		const handleOpenCreateGroupDM = React.useCallback(() => {
			if (!channel) return;
			const initialRecipientIds = Array.from(channel.recipientIds);
			const excludeChannelId = channel.type === ChannelTypes.GROUP_DM ? channel.id : undefined;
			ModalActionCreators.push(
				modal(() => (
					<CreateDMModal initialSelectedUserIds={initialRecipientIds} duplicateExcludeChannelId={excludeChannelId} />
				)),
			);
		}, [channel]);

		const handleOpenEditGroup = React.useCallback(() => {
			if (!channel) return;
			ModalActionCreators.push(modal(() => <EditGroupModal channelId={channel.id} />));
		}, [channel]);
		const handleOpenAddFriendsToGroup = React.useCallback(() => {
			if (!channel) return;
			ModalActionCreators.push(modal(() => <AddFriendsToGroupModal channelId={channel.id} />));
		}, [channel]);

		const handleToggleMembers = React.useCallback(() => {
			if (!canFitMemberList || isMobile) {
				setInitialTab('members');
				setOpenSearchImmediately(false);
				setChannelDetailsOpen(true);
				return;
			}
			LayoutActionCreators.toggleMembers(!isMembersOpen);
		}, [isMembersOpen, canFitMemberList, isMobile]);

		React.useEffect(() => {
			const handleChannelDetailsOpen = (payload?: unknown) => {
				const {initialTab} = (payload ?? {}) as {initialTab?: 'members' | 'pins'};
				setInitialTab(initialTab || 'members');
				setOpenSearchImmediately(false);
				setChannelDetailsOpen(true);
			};

			return ComponentDispatch.subscribe('CHANNEL_DETAILS_OPEN', handleChannelDetailsOpen);
		}, []);

		React.useEffect(() => {
			if (!showMembersToggle) return;
			return ComponentDispatch.subscribe('CHANNEL_MEMBER_LIST_TOGGLE', () => {
				if (canFitMemberList && !isMobile) {
					LayoutActionCreators.toggleMembers(!isMembersOpen);
					return;
				}

				setInitialTab('members');
				setOpenSearchImmediately(false);
				setChannelDetailsOpen(true);
			});
		}, [showMembersToggle, canFitMemberList, isMembersOpen, isMobile]);

		const handleOpenUserProfile = React.useCallback(() => {
			if (!recipient) return;
			UserProfileActionCreators.openUserProfile(recipient.id);
		}, [recipient]);

		const handleBackClick = React.useCallback(() => {
			if (isDM || isGroupDM || isPersonalNotes) {
				RouterUtils.transitionTo(Routes.ME);
			} else if (Routes.isFavoritesRoute(location.pathname)) {
				RouterUtils.transitionTo(Routes.FAVORITES);
			} else if (isGuildChannel && channel?.guildId) {
				RouterUtils.transitionTo(Routes.guildChannel(channel.guildId));
			} else {
				window.history.back();
			}
		}, [isDM, isGroupDM, isPersonalNotes, isGuildChannel, channel?.guildId, location.pathname]);

		const handleRevealChannelList = React.useCallback(() => {
			ChannelListLayoutStore.setSidebarCollapsed(false);
		}, []);

		const handleChannelDetailsClick = () => {
			setInitialTab('members');
			setOpenSearchImmediately(false);
			setChannelDetailsOpen(true);
		};

		const handleMobileSearchClick = () => {
			setChannelSearchOpen(true);
		};

		const handleContextMenu = React.useCallback(
			(event: React.MouseEvent) => {
				if (channel && isGuildChannel) {
					event.preventDefault();
					event.stopPropagation();
					ContextMenuActionCreators.openFromEvent(event, ({onClose}) => (
						<ChannelContextMenu channel={channel} onClose={onClose} />
					));
				}
			},
			[channel, isGuildChannel],
		);

		const handleMobileVoiceCall = React.useCallback(
			async (event: React.MouseEvent) => {
				if (!channel) return;
				const isConnected = MediaEngineStore.connected;
				const connectedChannelId = MediaEngineStore.channelId;
				const isInCall = isConnected && connectedChannelId === channel.id;

				if (isInCall) {
					void CallActionCreators.leaveCall(channel.id);
				} else if (CallStateStore.hasActiveCall(channel.id)) {
					CallActionCreators.joinCall(channel.id);
				} else {
					const silent = event.shiftKey;
					await CallUtils.checkAndStartCall(channel.id, silent);
				}
			},
			[channel],
		);

		const handleMobileVideoCall = React.useCallback(
			async (event: React.MouseEvent) => {
				if (!channel) return;
				const isConnected = MediaEngineStore.connected;
				const connectedChannelId = MediaEngineStore.channelId;
				const isInCall = isConnected && connectedChannelId === channel.id;

				if (isInCall) {
					void CallActionCreators.leaveCall(channel.id);
				} else if (CallStateStore.hasActiveCall(channel.id)) {
					CallActionCreators.joinCall(channel.id);
				} else {
					const silent = event.shiftKey;
					await CallUtils.checkAndStartCall(channel.id, silent);
				}
			},
			[channel],
		);

		const handleToggleFavorite = React.useCallback(() => {
			if (!channel || isPersonalNotes) return;

			if (isFavorited) {
				FavoritesStore.removeChannel(channel.id);
				ToastActionCreators.createToast({type: 'success', children: t`Channel removed from favorites`});
			} else {
				FavoritesStore.addChannel(channel.id, channel.guildId ?? ME);
				ToastActionCreators.createToast({type: 'success', children: t`Channel added to favorites`});
			}
		}, [channel, isPersonalNotes, isFavorited]);

		const handleFavoriteContextMenu = React.useCallback(
			(event: React.MouseEvent) => {
				event.preventDefault();
				event.stopPropagation();

				ContextMenuActionCreators.openFromEvent(event, ({onClose}) => (
					<MenuGroup>
						<MenuItem
							icon={<EyeSlashIcon />}
							onClick={() => {
								onClose();
								FavoritesActionCreators.confirmHideFavorites(undefined, i18n);
							}}
							danger
						>
							{t`Hide Favorites`}
						</MenuItem>
					</MenuGroup>
				));
			},
			[t],
		);

		const isGroupDMFull = channel ? channel.recipientIds.length + 1 >= MAX_GROUP_DM_RECIPIENTS : false;
		const isFriendDM =
			isDM &&
			recipient &&
			!isBotDMRecipient &&
			RelationshipStore.getRelationship(recipient.id)?.type === RelationshipTypes.FRIEND;
		const isPrivateHeader = isDM || isGroupDM || isPersonalNotes;
		const channelHoverDescription =
			(isGuildChannel && channel?.topic?.trim()) ||
			(!isDM ? channelTypeLabel : null) ||
			(isGroupDM ? t`Conversation` : '');
		const shouldShowCreateGroupButton = !!channel && !isMobile && !isPersonalNotes && isFriendDM && !isGroupDM;
		const shouldShowAddFriendsButton = !!channel && !isMobile && !isPersonalNotes && isGroupDM && !isGroupDMFull;
		const selectionActive = channel ? MessageSelectionStore.isActiveForChannel(channel.id) : false;
		const selectedMessages = selectionActive ? MessageSelectionStore.getSelectedMessages() : [];
		const selectedCount = selectedMessages.length;
		const recipientStatus = recipient ? PresenceStore.getStatus(recipient.id) : StatusTypes.OFFLINE;
		const isRecipientInCall = recipient ? MediaEngineStore.isUserInAnyVoiceChannel(recipient.id) : false;
		const isRecipientOnline =
			isRecipientInCall ||
			recipientStatus === StatusTypes.ONLINE ||
			recipientStatus === StatusTypes.IDLE ||
			recipientStatus === StatusTypes.DND;
		const recipientActivity = recipient ? UserActivityStore.getActivity(recipient.id) : null;

		React.useEffect(() => {
			if (!isDM || !recipient || isRecipientOnline) {
				return;
			}

			UserActivityStore.ensureActivity(recipient.id);
		}, [isDM, recipient?.id, recipient, isRecipientOnline]);

		const dmPresenceLabel = React.useMemo(() => {
			if (!isDM || !recipient) {
				return null;
			}

			if (isRecipientOnline) {
				return t`currently online`;
			}

			if (!recipientActivity || recipientActivity.hidden || !recipientActivity.lastActiveAt) {
				return t`last online: recently`;
			}

			const lastActiveTime = Date.parse(recipientActivity.lastActiveAt);
			if (!Number.isFinite(lastActiveTime) || Date.now() - lastActiveTime < LAST_ONLINE_RECENT_MS) {
				return t`last online: recently`;
			}

			const formattedTime = formatLastOnlineTime(recipientActivity.lastActiveAt, i18n.locale);
			return formattedTime ? t`last online: at ${formattedTime}` : t`last online: recently`;
		}, [isDM, recipient, isRecipientOnline, recipientActivity, t, i18n.locale]);

		const handleForwardSelectedMessages = React.useCallback(() => {
			if (selectedMessages.length === 0) return;
			ModalActionCreators.push(
				modal(() => (
					<ForwardModal
						messages={selectedMessages}
						onForwarded={() => {
							MessageSelectionStore.clear();
						}}
					/>
				)),
			);
		}, [selectedMessages]);

		const handleDeleteSelectedMessages = React.useCallback(() => {
			if (selectedMessages.length === 0) return;
			const currentSelection = [...selectedMessages];
			ModalActionCreators.push(
				modal(() => (
					<ConfirmModal
						title={t`Delete selected messages`}
						description={t`${currentSelection.length} selected messages will be removed from this view. Your own messages are deleted for everyone; messages from other people are hidden locally for you.`}
						primaryText={t`Delete`}
						onPrimary={async () => {
							for (const selectedMessage of currentSelection) {
								if (selectedMessage.isCurrentUserAuthor()) {
									await MessageActionCreators.remove(selectedMessage.channelId, selectedMessage.id);
								} else {
									MessageActionCreators.deleteOptimistic(selectedMessage.channelId, selectedMessage.id);
								}
							}
							MessageSelectionStore.clear();
							ToastActionCreators.createToast({
								type: 'success',
								children: t`Selected messages removed`,
							});
						}}
					/>
				)),
			);
		}, [selectedMessages, t]);

		return (
			<>
				<div
					className={clsx(
						styles.headerWrapper,
						isPrivateHeader ? styles.headerWrapperPrivate : styles.headerWrapperGuild,
						isVoiceHeaderActive && styles.headerWrapperCallActive,
					)}
				>
					<NativeDragRegion
						className={clsx(styles.headerContainer, isVoiceHeaderActive && styles.headerContainerCallActive)}
					>
						<div className={styles.headerLeftSection}>
							{isMobile ? (
								<>
									<MobileNavigationMenuButton className={styles.mobileMenuButton} />
									{showMobileBackButton && (
										<FocusRing offset={-2}>
											<button
												type="button"
												className={styles.backButton}
												onClick={handleBackClick}
												data-edge-swipe-ignore="true"
											>
												<ArrowLeftIcon className={styles.backIconBold} weight="bold" />
											</button>
										</FocusRing>
									)}
								</>
							) : isChannelSidebarCollapsed ? (
								<FocusRing offset={-2}>
									<button
										type="button"
										className={styles.backButtonDesktop}
										style={{display: 'flex'}}
										aria-label={t`Expand channel list`}
										onClick={handleRevealChannelList}
										data-edge-swipe-ignore="true"
									>
										<ListIcon className={styles.backIcon} />
									</button>
								</FocusRing>
							) : null}

							<div className={styles.leftContentContainer}>
								{leftContent ? (
									leftContent
								) : channel ? (
									isMobile ? (
										<FocusRing offset={-2}>
											<button
												type="button"
												className={clsx(styles.mobileButton, (isDM || isGroupDM) && styles.mobileButtonConversation)}
												onClick={handleChannelDetailsClick}
											>
												{isDM && recipient ? (
													<>
														<StatusAwareAvatar user={recipient} size={40} showOffline={true} />
														<span className={styles.dmNameWrapper}>
															<span className={styles.dmIdentity}>
																<span className={styles.channelTitleRow}>
																	<Tooltip text={isDMNameOverflowing && directMessageName ? directMessageName : ''}>
																		<span ref={dmNameRef} className={styles.channelName}>
																			{directMessageName}
																		</span>
																	</Tooltip>
																	{isBotDMRecipient && <UserTag className={styles.userTag} system={recipient.system} />}
																</span>
																{dmPresenceLabel && (
																	<span
																		className={clsx(
																			styles.dmPresenceLabel,
																			isRecipientOnline && styles.dmPresenceLabelOnline,
																		)}
																	>
																		{dmPresenceLabel}
																	</span>
																)}
															</span>
														</span>
														<CaretRightIcon className={styles.caretRight} weight="bold" />
													</>
												) : isGroupDM ? (
													<>
														<GroupDMAvatar channel={channel} size={40} />
														<Tooltip text={isGroupDMNameOverflowing && groupDMName ? groupDMName : ''}>
															<span ref={groupDMNameRef} className={styles.channelName}>
																{groupDMName}
															</span>
														</Tooltip>
														<CaretRightIcon className={styles.caretRight} weight="bold" />
													</>
												) : (
													<>
														{ChannelUtils.getIcon(channel, {className: styles.channelIcon})}
														<Tooltip text={isGuildChannelNameOverflowing && channelName ? channelName : ''}>
															<span ref={guildChannelNameRef} className={styles.channelName}>
																{channelName}
															</span>
														</Tooltip>
														<CaretRightIcon className={styles.caretRight} weight="bold" />
													</>
												)}
											</button>
										</FocusRing>
									) : isDM && recipient ? (
										<FocusRing offset={-2}>
											<button type="button" className={styles.desktopButton} onClick={handleOpenUserProfile}>
												<StatusAwareAvatar user={recipient} size={40} showOffline={true} />
												<span className={styles.dmNameWrapper}>
													<span className={styles.channelCapsuleBody}>
														<span className={styles.dmIdentity}>
															<span className={styles.channelTitleRow}>
																<Tooltip text={isDMNameOverflowing ? directMessageName : ''}>
																	<span ref={dmNameRef} className={styles.channelName}>
																		{directMessageName}
																	</span>
																</Tooltip>
																{channelHoverDescription && (
																	<span className={styles.channelCapsuleMeta}>{channelHoverDescription}</span>
																)}
																{isBotDMRecipient && <UserTag className={styles.userTag} system={recipient.system} />}
															</span>
															{dmPresenceLabel && (
																<span
																	className={clsx(
																		styles.dmPresenceLabel,
																		isRecipientOnline && styles.dmPresenceLabelOnline,
																	)}
																>
																	{dmPresenceLabel}
																</span>
															)}
														</span>
													</span>
												</span>
											</button>
										</FocusRing>
									) : isGroupDM ? (
										isMobile ? (
											<div className={styles.avatarWrapper}>
												<GroupDMAvatar channel={channel} size={32} />
												<Tooltip text={isGroupDMNameOverflowing && groupDMName ? groupDMName : ''}>
													<span ref={groupDMNameRef} className={styles.channelName}>
														{groupDMName}
													</span>
												</Tooltip>
											</div>
										) : (
											<FocusRing offset={-2}>
												<div
													className={styles.groupDMHeaderTrigger}
													role="button"
													tabIndex={0}
													onClick={handleOpenEditGroup}
													onKeyDown={(event) => {
														if (event.key === 'Enter' || event.key === ' ') {
															event.preventDefault();
															handleOpenEditGroup();
														}
													}}
												>
													<div className={styles.groupDMHeaderInner}>
														<GroupDMAvatar channel={channel} size={40} />
														<div className={styles.dmNameWrapper}>
															<span className={styles.channelCapsuleBody}>
																<span className={styles.channelTitleRow}>
																	<Tooltip text={isGroupDMNameOverflowing && groupDMName ? groupDMName : ''}>
																		<span
																			ref={groupDMNameRef}
																			className={clsx(styles.channelName, styles.groupDMChannelName)}
																		>
																			{groupDMName}
																		</span>
																	</Tooltip>
																	{channelHoverDescription && (
																		<span className={styles.channelCapsuleMeta}>{channelHoverDescription}</span>
																	)}
																</span>
															</span>
														</div>
													</div>
													<PencilIcon className={styles.groupDMEditIcon} size={16} weight="bold" />
												</div>
											</FocusRing>
										)
									) : isPersonalNotes ? (
										<div className={styles.channelInfoContainer}>
											<span className={styles.channelCapsuleBody}>
												<span className={styles.channelTitleRow}>
													<Tooltip text={isGuildChannelNameOverflowing && channelName ? channelName : ''}>
														<span ref={guildChannelNameRef} className={styles.channelName}>
															{channelName}
														</span>
													</Tooltip>
													{channelHoverDescription && (
														<span className={styles.channelCapsuleMeta}>{channelHoverDescription}</span>
													)}
												</span>
											</span>
										</div>
									) : (
										// biome-ignore lint/a11y/noStaticElementInteractions: Context menu requires onContextMenu handler on this container
										<div className={styles.channelInfoContainer} onContextMenu={handleContextMenu}>
											<span className={styles.channelCapsuleBody}>
												<span className={styles.channelTitleRow}>
													<Tooltip text={isGuildChannelNameOverflowing && channelName ? channelName : ''}>
														<span ref={guildChannelNameRef} className={styles.channelName}>
															{channelName}
														</span>
													</Tooltip>
													{channelHoverDescription && (
														<span className={styles.channelCapsuleMeta}>{channelHoverDescription}</span>
													)}
												</span>
											</span>
										</div>
									)
								) : null}
							</div>
						</div>

						<div className={styles.headerRightSection}>
							{selectionActive ? (
								<div className={styles.selectionToolbar} role="toolbar" aria-label={t`Selected messages`}>
									<span className={styles.selectionCount}>
										<span className={styles.selectionCountNumber}>{selectedCount}</span>
										<span>{t`Selected messages`}</span>
									</span>
									<Tooltip text={t`Forward selected messages`} position="bottom">
										<FocusRing offset={-2}>
											<button
												type="button"
												className={styles.selectionActionButton}
												aria-label={t`Forward selected messages`}
												onClick={handleForwardSelectedMessages}
												disabled={selectedCount === 0}
											>
												<ArrowBendUpRightIcon className={styles.buttonIcon} weight="bold" />
											</button>
										</FocusRing>
									</Tooltip>
									<Tooltip text={t`Delete selected messages`} position="bottom">
										<FocusRing offset={-2}>
											<button
												type="button"
												className={clsx(styles.selectionActionButton, styles.selectionActionButtonDanger)}
												aria-label={t`Delete selected messages`}
												onClick={handleDeleteSelectedMessages}
												disabled={selectedCount === 0}
											>
												<TrashIcon className={styles.buttonIcon} weight="bold" />
											</button>
										</FocusRing>
									</Tooltip>
									<Tooltip text={t`Cancel selection`} position="bottom">
										<FocusRing offset={-2}>
											<button
												type="button"
												className={styles.selectionActionButton}
												aria-label={t`Cancel selection`}
												onClick={() => MessageSelectionStore.clear()}
											>
												<XIcon className={styles.buttonIcon} weight="bold" />
											</button>
										</FocusRing>
									</Tooltip>
								</div>
							) : (
								<>
							{isMobile && (isDM || isGroupDM) && !isPersonalNotes && (
								<>
									<FocusRing offset={-2}>
										<button
											type="button"
											className={styles.iconButtonMobile}
											aria-label={t`Voice Call`}
											onClick={handleMobileVoiceCall}
										>
											<PhoneIcon className={styles.buttonIconMobile} />
										</button>
									</FocusRing>
									<FocusRing offset={-2}>
										<button
											type="button"
											className={styles.iconButtonMobile}
											aria-label={t`Video Call`}
											onClick={handleMobileVideoCall}
										>
											<VideoCameraIcon className={styles.buttonIconMobile} />
										</button>
									</FocusRing>
								</>
							)}

							{isMobile && channel && !isVoiceChannel && (
								<FocusRing offset={-2}>
									<button
										type="button"
										className={styles.iconButtonMobile}
										aria-label={t`Search messages`}
										onClick={handleMobileSearchClick}
									>
										<MagnifyingGlassIcon className={styles.buttonIconMobile} weight="bold" />
									</button>
								</FocusRing>
							)}

							{isMobile && showMembersToggle && channel && (
								<FocusRing offset={-2}>
									<button
										type="button"
										className={styles.iconButtonMobile}
										aria-label={t`Show Members`}
										onClick={handleChannelDetailsClick}
									>
										<UsersIcon className={styles.buttonIconMobile} weight="bold" />
									</button>
								</FocusRing>
							)}

							{channel && !isMobile && !isPersonalNotes && AccessibilityStore.showFavorites && (
								<Tooltip text={isFavorited ? t`Remove from Favorites` : t`Add to Favorites`} position="bottom">
									<FocusRing offset={-2}>
										<button
											type="button"
											className={isFavorited ? styles.iconButtonSelected : styles.iconButtonDefault}
											aria-label={isFavorited ? t`Remove from Favorites` : t`Add to Favorites`}
											onClick={handleToggleFavorite}
										onContextMenu={handleFavoriteContextMenu}
									>
											<StarFourIcon className={styles.buttonIcon} weight={isFavorited ? 'fill' : 'bold'} />
										</button>
									</FocusRing>
								</Tooltip>
							)}

							{channel && isGuildChannel && !isMobile && !isVoiceChannel && !isPersonalNotes && (
								<ChannelNotificationSettingsButton channel={channel} />
							)}

							{showPins && channel && !isMobile && <ChannelPinsButton channel={channel} />}

							{(isDM || isGroupDM) && channel && !isMobile && !(isDM && isBotDMRecipient) && (
								<>
									<VoiceCallButton channel={channel} />
									<VideoCallButton channel={channel} />
								</>
							)}

							{shouldShowCreateGroupButton && (
								<ChannelHeaderIcon icon={UserPlusIcon} label={t`Create Group DM`} onClick={handleOpenCreateGroupDM} />
							)}

							{shouldShowAddFriendsButton && (
								<ChannelHeaderIcon
									icon={UserPlusIcon}
									label={t`Add Friends to Group`}
									onClick={handleOpenAddFriendsToGroup}
								/>
							)}

							{showMembersToggle && !isMobile && (
								<ChannelHeaderIcon
									icon={UsersIcon}
									isSelected={isMembersOpen}
									label={
										!canFitMemberList
											? t`Members list unavailable at this screen width`
											: isMembersOpen
												? t`Hide Members`
												: t`Show Members`
									}
									onClick={handleToggleMembers}
									disabled={!canFitMemberList}
									keybindAction="toggle_channel_member_list"
								/>
							)}

							{!isMobile && channel && !isVoiceChannel && (
								<div className={styles.messageSearchFocusWrapper}>
									<MessageSearchBar
										channel={channel}
										value={searchQuery}
										onChange={(query, segments) => {
											setSearchQuery(query);
											setSearchSegments(segments);
											latestSearchQueryRef.current = query;
											latestSearchSegmentsRef.current = segments;
										}}
										onSearch={() => {
											const q = latestSearchQueryRef.current;
											if (q.trim()) {
												onSearchSubmit?.(q, latestSearchSegmentsRef.current);
											}
										}}
										onClear={() => {
											setSearchQuery('');
											setSearchSegments([]);
											latestSearchQueryRef.current = '';
											latestSearchSegmentsRef.current = [];
											onSearchClose?.();
										}}
										isResultsOpen={Boolean(isSearchResultsOpen)}
										onCloseResults={() => onSearchClose?.()}
										inputRefExternal={searchInputRef}
									/>
								</div>
							)}

							{!isMobile && <UpdaterIcon />}

							{!isMobile && <InboxButton />}
								</>
							)}
						</div>
					</NativeDragRegion>
				</div>

				{channel && (
					<ChannelDetailsBottomSheet
						isOpen={channelDetailsOpen}
						onClose={() => {
							setChannelDetailsOpen(false);
							setOpenSearchImmediately(false);
							setInitialTab('members');
						}}
						channel={channel}
						initialTab={initialTab}
						openSearchImmediately={openSearchImmediately}
					/>
				)}

				{channel && (
					<ChannelSearchBottomSheet
						isOpen={channelSearchOpen}
						onClose={() => setChannelSearchOpen(false)}
						channel={channel}
					/>
				)}
			</>
		);
	},
);

