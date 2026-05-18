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
import {
	CaretDownIcon,
	CaretLeftIcon,
	ChatTeardropIcon,
	PhoneIcon,
	XIcon,
} from '@phosphor-icons/react';
import {clsx} from 'clsx';
import {AnimatePresence, motion, useReducedMotion} from 'framer-motion';
import {observer} from 'mobx-react-lite';
import React from 'react';

import * as CallActionCreators from '~/actions/CallActionCreators';
import * as ContextMenuActionCreators from '~/actions/ContextMenuActionCreators';
import {ChannelTypes} from '~/Constants';
import {BlockedUserBarrier, UnclaimedDMBarrier} from '~/components/channel/barriers/BarrierComponents';
import {ChannelChatLayout} from '~/components/channel/ChannelChatLayout';
import {ChannelHeader} from '~/components/channel/ChannelHeader';
import {ChannelMembers} from '~/components/channel/ChannelMembers';
import {ChannelTextarea} from '~/components/channel/ChannelTextarea';
import dmStyles from '~/components/channel/dm/DMChannelView.module.css';
import {Avatar} from '~/components/uikit/Avatar';
import {BottomSheet} from '~/components/uikit/BottomSheet/BottomSheet';
import {Button} from '~/components/uikit/Button/Button';
import {UserContextMenu} from '~/components/uikit/ContextMenu/UserContextMenu';
import {CompactVoiceCallView} from '~/components/voice/CompactVoiceCallView';
import {VoiceControlBar} from '~/components/voice/VoiceControlBar';
import {useChannelMemberListVisibility} from '~/hooks/useChannelMemberListVisibility';
import {useChannelSearchVisibility} from '~/hooks/useChannelSearchVisibility';
import {useAstralDocumentTitle} from '~/hooks/useAstralDocumentTitle';
import {useMemberListVisible} from '~/hooks/useMemberListVisible';
import {Logger} from '~/lib/Logger';
import type {ChannelRecord} from '~/records/ChannelRecord';
import type {UserRecord} from '~/records/UserRecord';
import AuthenticationStore from '~/stores/AuthenticationStore';
import AndroidNotificationSettingsStore from '~/stores/AndroidNotificationSettingsStore';
import CallStateStore, {type Call} from '~/stores/CallStateStore';
import ChannelStore from '~/stores/ChannelStore';
import MobileLayoutStore from '~/stores/MobileLayoutStore';
import RelationshipStore from '~/stores/RelationshipStore';
import UserStore from '~/stores/UserStore';
import MediaEngineStore from '~/stores/voice/MediaEngineFacade';
import WindowStore from '~/stores/WindowStore';
import {isNativeAndroidApp} from '~/utils/AndroidAppInfo';
import {
	ANDROID_NOTIFICATION_CALL_CHANNEL_ID,
	openAndroidAppNotificationSettings,
	openAndroidChannelNotificationSettings,
} from '~/utils/AndroidNotificationSettings';
import * as CallUtils from '~/utils/CallUtils';
import * as ChannelUtils from '~/utils/ChannelUtils';
import {isMobileExperienceEnabled} from '~/utils/mobileExperience';
import styles from '../ChannelIndexPage.module.css';
import {ChannelSearchResults} from '../ChannelSearchResults';
import {Messages} from '../Messages';
import {ChannelViewScaffold} from './ChannelViewScaffold';
import {useCallHeaderState} from './useCallHeaderState';
import {useChannelSearchState} from './useChannelSearchState';

interface DMChannelViewProps {
	channelId: string;
}

const logger = new Logger('DMChannelView');
const CALL_AVATAR_PIXEL_SIZES = [100, 60, 40, 30] as const;
const CALL_AVATAR_PADDING = 16;
const CALL_AVATAR_LAYOUT_OFFSET = 320;
const ARC_EASE = [0.22, 1, 0.36, 1] as const;

function getPanelMotion(reducedMotion: boolean, delay = 0) {
	if (reducedMotion) {
		return {};
	}

	return {
		initial: {opacity: 0, y: 10, scale: 0.99},
		animate: {opacity: 1, y: 0, scale: 1},
		exit: {opacity: 0, y: -8, scale: 0.99},
		transition: {duration: 0.24, ease: ARC_EASE, delay},
	};
}

interface CallParticipant {
	user: UserRecord;
	isRinging: boolean;
	isSpeaking: boolean;
}

interface CallParticipantsRowProps {
	call: Call;
	channel: ChannelRecord;
}

const getCallAvatarSize = (count: number, windowWidth: number): number => {
	if (count <= 0) return CALL_AVATAR_PIXEL_SIZES[CALL_AVATAR_PIXEL_SIZES.length - 1];
	const availableWidth = Math.max(0, windowWidth - CALL_AVATAR_LAYOUT_OFFSET);
	for (const size of CALL_AVATAR_PIXEL_SIZES) {
		const slotWidth = size + CALL_AVATAR_PADDING;
		if (availableWidth > count * slotWidth) {
			return size;
		}
	}
	return CALL_AVATAR_PIXEL_SIZES[CALL_AVATAR_PIXEL_SIZES.length - 1];
};

const CallParticipantsRow = observer(({call, channel}: CallParticipantsRowProps) => {
	const {t} = useLingui();
	const windowWidth = WindowStore.windowSize.width;
	const isMobile = MobileLayoutStore.isMobileLayout();
	const voiceParticipants = MediaEngineStore.participants;
	const liveVoiceParticipantIds = React.useMemo(() => {
		const ids = new Set<string>();
		for (const participant of Object.values(voiceParticipants)) {
			if (participant.userId) ids.add(participant.userId);
		}
		return ids;
	}, [voiceParticipants]);
	const speakingUserIds = React.useMemo(() => {
		const userIds = new Set<string>();
		for (const participant of Object.values(voiceParticipants)) {
			if (participant.isSpeaking && participant.userId) {
				userIds.add(participant.userId);
			}
		}
		return userIds;
	}, [voiceParticipants]);
	const currentUserId = AuthenticationStore.currentUserId;
	const callParticipantIds = call.participants;
	const liveParticipantIds = CallStateStore.getParticipants(channel.id);
	const orderedIds = [
		currentUserId,
		...callParticipantIds,
		...liveParticipantIds,
		...channel.recipientIds,
		...call.ringing,
	].filter((id): id is string => Boolean(id));

	const ringingSet = new Set(call.ringing);
	const participantSet = new Set([...callParticipantIds, ...liveParticipantIds]);
	const participants: Array<CallParticipant> = [];
	const seen = new Set<string>();

	const addParticipant = (id: string) => {
		if (seen.has(id)) return;
		const isInCall = participantSet.has(id) || liveVoiceParticipantIds.has(id);
		const isRinging = ringingSet.has(id) && !isInCall;
		if (!isInCall && !isRinging) return;
		const user = UserStore.getUser(id);
		if (!user) return;
		participants.push({user, isRinging: !isInCall && isRinging, isSpeaking: speakingUserIds.has(user.id)});
		seen.add(id);
	};

	for (const id of orderedIds) {
		addParticipant(id);
	}

	for (const id of liveParticipantIds) {
		addParticipant(id);
	}

	for (const id of call.ringing) {
		addParticipant(id);
	}

	const handleContextMenu = React.useCallback(
		(event: React.MouseEvent, user: UserRecord) => {
			event.preventDefault();
			event.stopPropagation();
			ContextMenuActionCreators.openFromEvent(event, ({onClose}) => (
				<UserContextMenu user={user} onClose={onClose} channelId={channel.id} isCallContext />
			));
		},
		[channel.id],
	);

	if (participants.length === 0) return null;

	const baseAvatarSize = getCallAvatarSize(participants.length, windowWidth);
	const avatarSize = isMobile
		? participants.length <= 1
			? 108
			: participants.length === 2
				? 84
				: participants.length === 3
					? 72
					: participants.length === 4
						? 62
						: participants.length <= 6
							? 54
							: 48
		: baseAvatarSize;

	return (
		<div className={dmStyles.callParticipantsRow} role="group" aria-label={t`Call participants`}>
			{participants.map(({user, isRinging, isSpeaking}) => (
				<button
					type="button"
					key={user.id}
					className={`${dmStyles.callParticipant} ${isRinging ? dmStyles.callParticipantRinging : ''} ${isSpeaking ? dmStyles.callParticipantSpeaking : ''}`.trim()}
					onContextMenu={(event) => handleContextMenu(event, user)}
					aria-label={isSpeaking ? `${user.username} ${t`is speaking`}` : user.username}
				>
					{isRinging && (
						<>
							<span className={`${dmStyles.callParticipantRipple} ${dmStyles.callParticipantRipple0}`} />
							<span className={`${dmStyles.callParticipantRipple} ${dmStyles.callParticipantRipple1}`} />
							<span className={`${dmStyles.callParticipantRipple} ${dmStyles.callParticipantRipple2}`} />
						</>
					)}
					{!isRinging && isSpeaking && <span className={dmStyles.callParticipantSpeakingPulse} />}
					<div className={dmStyles.callParticipantAvatar}>
						<Avatar user={user} size={avatarSize} status={null} showOffline={false} />
					</div>
				</button>
			))}
		</div>
	);
});

export const DMChannelView = observer(({channelId}: DMChannelViewProps) => {
	const {t} = useLingui();
	const reducedMotion = useReducedMotion() ?? false;
	const channel = ChannelStore.getChannel(channelId);
	const recipientId = channel?.recipientIds?.[0];
	const recipient = recipientId ? UserStore.getUser(recipientId) : null;
	const isRecipientBlocked = recipientId ? RelationshipStore.isBlocked(recipientId) : false;
	const isCurrentUserUnclaimed = !UserStore.currentUser?.isClaimed();
	const isMemberListVisible = useMemberListVisible();

	const mediaConnected = MediaEngineStore.connected;
	const mediaChannelId = MediaEngineStore.channelId;
	const mediaGuildId = MediaEngineStore.guildId;
	const room = MediaEngineStore.room;

	const searchState = useChannelSearchState(channel);
	const {
		isSearchActive,
		handleSearchClose,
		handleSearchSubmit,
		searchRefreshKey,
		activeSearchQuery,
		activeSearchSegments,
	} = searchState;

	useChannelSearchVisibility(channelId, isSearchActive);
	useChannelMemberListVisibility(channelId, isMemberListVisible);

	const isDM = channel?.type === ChannelTypes.DM;
	const displayName = channel ? ChannelUtils.getDMDisplayName(channel) : null;
	const title = isDM && displayName ? `@${displayName}` : displayName;
	useAstralDocumentTitle(title);
	const isGroupDM = channel?.type === ChannelTypes.GROUP_DM;
	const isPersonalNotes = channel?.type === ChannelTypes.DM_PERSONAL_NOTES;
	const callHeaderState = useCallHeaderState(channel);
	const call = callHeaderState.call;
	const showCompactVoiceView = callHeaderState.controlsVariant === 'inCall';
	const callExistsAndOngoing = callHeaderState.callExistsAndOngoing;
	const controlsVariant = callHeaderState.controlsVariant;
	const showCallBackground = callExistsAndOngoing && controlsVariant !== 'hidden';
	const isMobileExperience = isMobileExperienceEnabled();
	const isNativeAndroid = isNativeAndroidApp();
	const [isCallSheetOpen, setIsCallSheetOpen] = React.useState(false);
	const wasMobileInCallRef = React.useRef(false);
	const hasVisibleCallContext = callExistsAndOngoing && controlsVariant !== 'hidden';

	const handleOpenCallSheet = React.useCallback(() => {
		setIsCallSheetOpen(true);
	}, []);
	const handleCloseCallSheet = React.useCallback(() => {
		setIsCallSheetOpen(false);
	}, []);

	React.useEffect(() => {
		if (!callExistsAndOngoing) {
			setIsCallSheetOpen(false);
		}
	}, [callExistsAndOngoing]);

	React.useEffect(() => {
		const shouldAutoOpen = isMobileExperience && controlsVariant === 'inCall' && callExistsAndOngoing;
		if (shouldAutoOpen && !wasMobileInCallRef.current) {
			setIsCallSheetOpen(true);
		}
		wasMobileInCallRef.current = shouldAutoOpen;
	}, [callExistsAndOngoing, controlsVariant, isMobileExperience]);

	React.useEffect(() => {
		logger.debug('voice connection state', {
			channelId,
			connected: mediaConnected,
			mediaChannelId,
			mediaGuildId,
			hasRoom: Boolean(room),
			showCompactVoiceView,
		});
	}, [channelId, mediaConnected, mediaChannelId, mediaGuildId, room, showCompactVoiceView]);

	React.useEffect(() => {
		logger.debug('compact voice view render decision', {
			channelId,
			showCompactVoiceView,
			roomId: (room as any)?.sid ?? null,
		});
	}, [channelId, showCompactVoiceView, room]);

	const currentChannelId = channel?.id ?? null;
	const handleJoinCall = React.useCallback(() => {
		if (currentChannelId) {
			CallActionCreators.joinCall(currentChannelId);
		}
	}, [currentChannelId]);

	const handleRejectIncomingCall = React.useCallback(() => {
		if (currentChannelId) {
			CallActionCreators.rejectCall(currentChannelId);
		}
	}, [currentChannelId]);

	const handleIgnoreIncomingCall = React.useCallback(() => {
		if (currentChannelId) {
			CallActionCreators.ignoreCall(currentChannelId);
		}
	}, [currentChannelId]);
	const handleOpenAndroidNotificationSettings = React.useCallback(() => {
		void openAndroidAppNotificationSettings();
	}, []);
	const handleOpenAndroidCallChannelSettings = React.useCallback(() => {
		void openAndroidChannelNotificationSettings(ANDROID_NOTIFICATION_CALL_CHANNEL_ID);
	}, []);

	const shouldRenderMemberList = Boolean(isGroupDM && isMemberListVisible && !isSearchActive);
	const androidQuickActionsEnabled = AndroidNotificationSettingsStore.settings.quickActions;
	const androidCallFullscreenEnabled = AndroidNotificationSettingsStore.settings.callFullscreen;
	const androidSystemNotificationsEnabled = AndroidNotificationSettingsStore.systemNotificationsEnabled;
	const showAndroidCallTools = isMobileExperience && isNativeAndroid && callExistsAndOngoing;

	const handleStartMobileCall = React.useCallback(
		async (event: React.MouseEvent) => {
			if (!currentChannelId) return;
			const silent = event.shiftKey;
			await CallUtils.checkAndStartCall(currentChannelId, silent);
		},
		[currentChannelId],
	);

	const handleMobileVoiceCall = React.useCallback(
		async (event: React.MouseEvent) => {
			if (hasVisibleCallContext) {
				handleOpenCallSheet();
				return;
			}

			await handleStartMobileCall(event);
		},
		[handleOpenCallSheet, handleStartMobileCall, hasVisibleCallContext],
	);

	const handleMobileVideoCall = React.useCallback(
		async (event: React.MouseEvent) => {
			if (hasVisibleCallContext) {
				handleOpenCallSheet();
				return;
			}

			await handleStartMobileCall(event);
		},
		[handleOpenCallSheet, handleStartMobileCall, hasVisibleCallContext],
	);

	const [inCallStartedAt, setInCallStartedAt] = React.useState<number | null>(null);
	const [durationTick, setDurationTick] = React.useState(0);

	React.useEffect(() => {
		if (controlsVariant === 'inCall' && callExistsAndOngoing) {
			setInCallStartedAt((prev) => prev ?? Date.now());
			return;
		}

		setInCallStartedAt(null);
		setDurationTick(0);
	}, [callExistsAndOngoing, controlsVariant]);

	React.useEffect(() => {
		if (!inCallStartedAt) return;
		const intervalId = window.setInterval(() => {
			setDurationTick((tick) => tick + 1);
		}, 1000);
		return () => window.clearInterval(intervalId);
	}, [inCallStartedAt]);

	const formattedInCallDuration = React.useMemo(() => {
		if (!inCallStartedAt || controlsVariant !== 'inCall') return null;
		const totalSeconds = Math.max(0, Math.floor((Date.now() - inCallStartedAt) / 1000));
		const minutes = Math.floor(totalSeconds / 60);
		const seconds = totalSeconds % 60;
		return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
	}, [controlsVariant, durationTick, inCallStartedAt]);

	const callStatusLabel = React.useMemo(() => {
		switch (controlsVariant) {
			case 'incoming':
				return t`Incoming call`;
			case 'join':
				return t`Call available`;
			case 'connecting':
				return t`Connecting…`;
			case 'inCall':
				return t`In call`;
			default:
				return t`Voice call`;
		}
	}, [controlsVariant]);
	const normalizedCallStatusLabel = React.useMemo(
		() => callStatusLabel.replace('\u0432\u0402\u00a6', '...'),
		[callStatusLabel],
	);

	const callSummaryLabel = React.useMemo(() => {
		const currentCallChannelId = channel?.id;
		const participantCount =
			call && currentCallChannelId
				? Math.max(CallStateStore.getParticipants(currentCallChannelId).length, call.participants.length)
				: 0;
		if (participantCount <= 0) {
			return channel?.name ?? displayName ?? t`Direct call`;
		}

		return participantCount === 1 ? t`${participantCount} participant live` : t`${participantCount} participants live`;
	}, [call, channel?.id, channel?.name, displayName, t]);

	const callSheetButtonLabel = React.useMemo(
		() => (controlsVariant === 'incoming' ? t`Open incoming call` : t`Open call`),
		[controlsVariant],
	);
	const androidCallToolsTitle = React.useMemo(() => {
		if (!androidSystemNotificationsEnabled) {
			return t`Android call alerts are off`;
		}

		if (androidQuickActionsEnabled) {
			return t`Control this call from the Android shade`;
		}

		return t`Enable Android call actions`;
	}, [androidQuickActionsEnabled, androidSystemNotificationsEnabled, t]);
	const androidCallToolsDescription = React.useMemo(() => {
		if (!androidSystemNotificationsEnabled) {
			return t`Turn notifications back on in Android so Astral can show ringing calls and quick actions from the shade.`;
		}

		if (androidQuickActionsEnabled && androidCallFullscreenEnabled) {
			return t`Answer, decline, or jump back into the call directly from Android notifications, even when the app is backgrounded.`;
		}

		if (androidQuickActionsEnabled) {
			return t`Quick actions are enabled. If you also want lockscreen or background takeover, turn on full-screen incoming calls.`;
		}

		if (androidCallFullscreenEnabled) {
			return t`Full-screen incoming calls are ready, but quick action buttons in the shade are still disabled.`;
		}

		return t`Open the Android call channel to enable quick actions, ringtone behavior, and stronger incoming call presentation.`;
	}, [androidCallFullscreenEnabled, androidQuickActionsEnabled, androidSystemNotificationsEnabled, t]);

	const renderCallControls = React.useCallback(() => {
		if (controlsVariant === 'incoming') {
			return (
				<>
					<Button variant="primary" leftIcon={<PhoneIcon size={16} weight="fill" />} onClick={handleJoinCall}>
						<Trans>Accept</Trans>
					</Button>
					<Button
						variant="danger-primary"
						leftIcon={<XIcon size={16} weight="bold" />}
						onClick={handleRejectIncomingCall}
					>
						<Trans>Reject</Trans>
					</Button>
					<Button variant="secondary" onClick={handleIgnoreIncomingCall}>
						<Trans>Ignore</Trans>
					</Button>
				</>
			);
		}

		if (controlsVariant === 'join') {
			return (
				<Button
					variant="primary"
					leftIcon={<PhoneIcon size={16} weight="fill" />}
					onClick={handleJoinCall}
					disabled={!currentChannelId}
				>
					<Trans>Join call</Trans>
				</Button>
			);
		}

		if (controlsVariant === 'connecting') {
			return (
				<Button variant="secondary" leftIcon={<PhoneIcon size={16} weight="fill" />} disabled>
					<Trans>Connecting...</Trans>
				</Button>
			);
		}

		return null;
	}, [controlsVariant, handleJoinCall, handleRejectIncomingCall, handleIgnoreIncomingCall, currentChannelId]);

	const headerCallControls = React.useMemo(() => renderCallControls(), [renderCallControls]);
	const sheetCallControls = renderCallControls();
	const isInCallSheet = controlsVariant === 'inCall';
	const hasActiveScreenShare = React.useMemo(
		() => Object.values(MediaEngineStore.participants).some((participant) => participant.isScreenShareEnabled),
		[MediaEngineStore.participants],
	);
	const hasActiveCamera = React.useMemo(
		() => Object.values(MediaEngineStore.participants).some((participant) => participant.isCameraEnabled),
		[MediaEngineStore.participants],
	);
	const hasActiveLiveMedia = hasActiveScreenShare || hasActiveCamera;

	if (!channel) {
		return (
			<div className={dmStyles.emptyState}>
				<ChatTeardropIcon weight="fill" className={dmStyles.emptyStateIcon} />
				<h2 className={dmStyles.emptyStateTitle}>
					<Trans>This conversation has been erased</Trans>
				</h2>
				<p className={dmStyles.emptyStateDescription}>
					<Trans>Think, McFly! Did you type the right address?</Trans>
				</p>
			</div>
		);
	}

	if (isDM && !recipient) {
		return (
			<div className={dmStyles.emptyState}>
				<ChatTeardropIcon weight="fill" className={dmStyles.emptyStateIcon} />
				<h2 className={dmStyles.emptyStateTitle}>
					<Trans>User has vanished</Trans>
				</h2>
				<p className={dmStyles.emptyStateDescription}>
					<Trans>They might have taken the DeLorean elsewhere.</Trans>
				</p>
			</div>
		);
	}

	return (
		<>
			<ChannelViewScaffold
				className={showCallBackground ? styles.channelGridVoiceCallActive : undefined}
				header={
					<div className={showCallBackground ? styles.voiceActiveHeaderWrapper : undefined}>
						<ChannelHeader
							channel={channel}
							showMembersToggle={Boolean(isGroupDM)}
							showPins={true}
							onSearchSubmit={handleSearchSubmit}
							onSearchClose={handleSearchClose}
							isSearchResultsOpen={isSearchActive}
							forceVoiceCallStyle={showCompactVoiceView}
						/>
						<AnimatePresence initial={false}>
							{callExistsAndOngoing &&
								call &&
								channel &&
								(isMobileExperience ? (
									<motion.div className={dmStyles.callBannerMobile} {...getPanelMotion(reducedMotion, 0.02)}>
										<div className={dmStyles.callBannerHeader}>
											<div className={dmStyles.callBannerEyebrow}>{normalizedCallStatusLabel}</div>
										</div>
										<CallParticipantsRow call={call} channel={channel} />
										{controlsVariant === 'inCall' && (
											<motion.div className={dmStyles.callBannerPreview} {...getPanelMotion(reducedMotion, 0.04)}>
												<CompactVoiceCallView
													channel={channel}
													className={`${dmStyles.compactVoiceCallView} ${dmStyles.compactVoiceCallViewInline}`.trim()}
													hideHeader={true}
												/>
											</motion.div>
										)}
										<div className={dmStyles.callBannerActionRow}>
											{controlsVariant !== 'inCall' && headerCallControls && (
												<div className={dmStyles.callControlsMobile}>{headerCallControls}</div>
											)}
											<Button
												variant={controlsVariant === 'inCall' ? 'primary' : 'secondary'}
												onClick={handleOpenCallSheet}
												leftIcon={<PhoneIcon size={16} weight="fill" />}
											>
												{callSheetButtonLabel}
											</Button>
										</div>
										{showAndroidCallTools && (
											<div className={dmStyles.androidCallTools}>
												<div className={dmStyles.androidCallToolsHeader}>
													<div className={dmStyles.androidCallToolsTitle}>{androidCallToolsTitle}</div>
													<div className={dmStyles.androidCallToolsDescription}>{androidCallToolsDescription}</div>
												</div>
												<div className={dmStyles.androidCallToolsActions}>
													<Button variant="secondary" small={true} onClick={handleOpenAndroidCallChannelSettings}>
														<Trans>Call channel</Trans>
													</Button>
													<Button variant="secondary" small={true} onClick={handleOpenAndroidNotificationSettings}>
														<Trans>Android settings</Trans>
													</Button>
												</div>
											</div>
										)}
									</motion.div>
								) : controlsVariant === 'inCall' ? (
									<motion.div className={dmStyles.callBanner} {...getPanelMotion(reducedMotion, 0.02)}>
										<CallParticipantsRow call={call} channel={channel} />
										<CompactVoiceCallView channel={channel} className={dmStyles.compactVoiceCallView} hideHeader={true} />
									</motion.div>
								) : (
									<motion.div className={dmStyles.callBanner} {...getPanelMotion(reducedMotion, 0.02)}>
										<div className={dmStyles.callBannerHeader}>
											<div className={dmStyles.callBannerEyebrow}>{normalizedCallStatusLabel}</div>
											<div className={dmStyles.callBannerMeta}>{callSummaryLabel}</div>
										</div>
										<CallParticipantsRow call={call} channel={channel} />
										{headerCallControls && <div className={dmStyles.callControls}>{headerCallControls}</div>}
									</motion.div>
								))}
						</AnimatePresence>
					</div>
				}
				chatArea={
					<ChannelChatLayout
						channel={channel}
						messages={<Messages key={channel.id} channel={channel} />}
						textarea={
							isDM && isRecipientBlocked && recipient ? (
								<BlockedUserBarrier userId={recipient.id} username={recipient.username} />
							) : isCurrentUserUnclaimed && isDM && !isPersonalNotes && !isGroupDM ? (
								<UnclaimedDMBarrier />
							) : (
								<ChannelTextarea channel={channel} />
							)
						}
					/>
				}
				sidePanel={
					isSearchActive ? (
						<div className={styles.searchPanel}>
							<ChannelSearchResults
								channel={channel}
								searchQuery={activeSearchQuery}
								searchSegments={activeSearchSegments}
								refreshKey={searchRefreshKey}
								onClose={() => searchState.setIsSearchActive(false)}
							/>
						</div>
					) : shouldRenderMemberList ? (
						<ChannelMembers channel={channel} />
					) : null
				}
			/>
			{isMobileExperience && callExistsAndOngoing && call && channel && (
				<BottomSheet
						isOpen={isCallSheetOpen}
						onClose={handleCloseCallSheet}
						title={isInCallSheet ? undefined : channel.name ?? displayName ?? normalizedCallStatusLabel}
						snapPoints={isInCallSheet ? [1] : [0, 0.35, 0.65, 0.95, 1]}
						initialSnap={isInCallSheet ? 1 : 4}
						surface="primary"
						disablePadding
						disableDefaultHeader={isInCallSheet}
						showHandle={!isInCallSheet}
						showCloseButton={!isInCallSheet}
						containerClassName={isInCallSheet ? dmStyles.mobileCallFullSheetRoot : undefined}
				>
					<motion.div
						className={clsx(dmStyles.callSheetContent, isInCallSheet && dmStyles.callSheetContentFull)}
						{...getPanelMotion(reducedMotion, 0.04)}
					>
						{controlsVariant === 'inCall' ? (
							<div className={clsx(dmStyles.mobileCallStage, dmStyles.mobileCallStageFull)}>
								<div className={dmStyles.mobileCallStageHeader}>
									<button type="button" className={dmStyles.mobileCallBackButton} onClick={handleCloseCallSheet}>
										<CaretLeftIcon weight="bold" className={dmStyles.mobileCallHeaderIcon} />
									</button>
									<div className={dmStyles.mobileCallStatusPill}>{normalizedCallStatusLabel}</div>
								</div>
								<div className={dmStyles.mobileCallInfo}>
									<h2 className={dmStyles.mobileCallName}>{channel.name ?? displayName ?? t`Voice call`}</h2>
									<div className={dmStyles.mobileCallDuration}>{formattedInCallDuration ?? normalizedCallStatusLabel}</div>
								</div>
								{hasActiveLiveMedia && (
									<div className={dmStyles.mobileCallMediaStage}>
										<CompactVoiceCallView
											channel={channel}
											className={dmStyles.mobileCallMediaView}
											hideHeader={true}
											hideControlBar={true}
										/>
									</div>
								)}
								{!hasActiveLiveMedia && <CallParticipantsRow call={call} channel={channel} />}
								<div className={dmStyles.mobileCallControlsMirror}>
									<VoiceControlBar />
								</div>
								<button
									type="button"
									className={dmStyles.mobileCallMinimizeButton}
									onClick={handleCloseCallSheet}
									aria-label={t`Back to chat`}
								>
									<CaretDownIcon weight="bold" className={dmStyles.mobileCallMinimizeIcon} />
								</button>
							</div>
						) : (
							<>
								<div className={dmStyles.callSheetHeader}>
									<div className={dmStyles.callBannerEyebrow}>{normalizedCallStatusLabel}</div>
								</div>
								<CallParticipantsRow call={call} channel={channel} />
								{sheetCallControls && <div className={dmStyles.callSheetControls}>{sheetCallControls}</div>}
							</>
						)}
						{showAndroidCallTools && (
							<div className={dmStyles.androidCallTools}>
								<div className={dmStyles.androidCallToolsHeader}>
									<div className={dmStyles.androidCallToolsTitle}>{androidCallToolsTitle}</div>
									<div className={dmStyles.androidCallToolsDescription}>{androidCallToolsDescription}</div>
								</div>
								<div className={dmStyles.androidCallToolsActions}>
									<Button variant="secondary" small={true} onClick={handleOpenAndroidCallChannelSettings}>
										<Trans>Call channel</Trans>
									</Button>
									<Button variant="secondary" small={true} onClick={handleOpenAndroidNotificationSettings}>
										<Trans>Android settings</Trans>
									</Button>
								</div>
							</div>
						)}
					</motion.div>
				</BottomSheet>
			)}
		</>
	);
});
