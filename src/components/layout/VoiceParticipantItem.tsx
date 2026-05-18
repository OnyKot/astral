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
import {DesktopIcon, DeviceMobileIcon} from '@phosphor-icons/react';
import {clsx} from 'clsx';
import {Track, type LocalParticipant, type LocalTrackPublication, type RemoteParticipant, type RemoteTrackPublication} from 'livekit-client';
import {observer} from 'mobx-react-lite';
import React, {useCallback, useMemo, useState} from 'react';
import type {ConnectableElement} from 'react-dnd';
import {useDrag} from 'react-dnd';
import {createPortal} from 'react-dom';
import * as ContextMenuActionCreators from '~/actions/ContextMenuActionCreators';
import {Permissions} from '~/Constants';
import {VoiceParticipantBottomSheet} from '~/components/bottomsheets/VoiceParticipantBottomSheet';
import {PreloadableUserPopout} from '~/components/channel/PreloadableUserPopout';
import {LongPressable} from '~/components/LongPressable';
import {AvatarWithPresence} from '~/components/uikit/avatars/AvatarWithPresence';
import {VoiceParticipantContextMenu} from '~/components/uikit/ContextMenu/VoiceParticipantContextMenu';
import FocusRing from '~/components/uikit/FocusRing/FocusRing';
import {Tooltip} from '~/components/uikit/Tooltip';
import type {UserRecord} from '~/records/UserRecord';
import LocalVoiceStateStore from '~/stores/LocalVoiceStateStore';
import MobileLayoutStore from '~/stores/MobileLayoutStore';
import PermissionStore from '~/stores/PermissionStore';
import type {VoiceState} from '~/stores/voice/MediaEngineFacade';
import MediaEngineStore from '~/stores/voice/MediaEngineFacade';
import * as NicknameUtils from '~/utils/NicknameUtils';
import channelItemSurfaceStyles from './ChannelItemSurface.module.css';
import {DND_TYPES} from './types/dnd';
import styles from './VoiceParticipantItem.module.css';
import {VoiceStateIcons} from './VoiceStateIcons';

type ScreenSharePublication = LocalTrackPublication | RemoteTrackPublication;

const waitForFirstVideoFrame = (video: HTMLVideoElement, timeoutMs = 2200): Promise<boolean> => {
	return new Promise((resolve) => {
		if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && video.videoWidth > 0 && video.videoHeight > 0) {
			resolve(true);
			return;
		}

		let resolved = false;
		let timeoutId: number | null = null;
		const finish = (ok: boolean) => {
			if (resolved) return;
			resolved = true;
			if (timeoutId !== null) window.clearTimeout(timeoutId);
			video.removeEventListener('loadeddata', onReady);
			video.removeEventListener('canplay', onReady);
			video.removeEventListener('resize', onReady);
			resolve(ok);
		};
		const onReady = () => {
			if (video.videoWidth > 0 && video.videoHeight > 0) finish(true);
		};

		video.addEventListener('loadeddata', onReady);
		video.addEventListener('canplay', onReady);
		video.addEventListener('resize', onReady);
		timeoutId = window.setTimeout(() => finish(false), timeoutMs);
	});
};

const findScreenSharePublication = (participant: LocalParticipant | RemoteParticipant): ScreenSharePublication | null => {
	for (const publication of participant.videoTrackPublications.values()) {
		if (publication.source === Track.Source.ScreenShare) {
			return publication as ScreenSharePublication;
		}
	}
	return null;
};

const waitForLiveTrack = async (publication: ScreenSharePublication): Promise<ScreenSharePublication['track'] | null> => {
	let liveTrack = publication.track;
	if (liveTrack) return liveTrack;
	for (let attempt = 0; attempt < 10; attempt++) {
		await new Promise((resolve) => window.setTimeout(resolve, 120));
		liveTrack = publication.track;
		if (liveTrack) return liveTrack;
	}
	return null;
};

const captureFirstFrameFromLiveKitPublication = async (publication: ScreenSharePublication): Promise<string | null> => {
	const remotePublication = publication as RemoteTrackPublication;
	if (!publication.track && typeof remotePublication.setSubscribed === 'function') {
		try {
			remotePublication.setSubscribed(true);
		} catch {}
	}

	const liveTrack = await waitForLiveTrack(publication);
	if (!liveTrack || typeof liveTrack.attach !== 'function' || typeof liveTrack.detach !== 'function') {
		return null;
	}

	const attached = liveTrack.attach();
	const video = attached instanceof HTMLVideoElement ? attached : null;
	if (!video) {
		try {
			liveTrack.detach(attached);
		} catch {}
		return null;
	}

	video.muted = true;
	video.autoplay = true;
	video.playsInline = true;
	void video.play().catch(() => {});

	const hasFrame = await waitForFirstVideoFrame(video);
	if (!hasFrame || video.videoWidth <= 0 || video.videoHeight <= 0) {
		try {
			liveTrack.detach(video);
		} catch {}
		video.remove();
		return null;
	}

	const canvas = document.createElement('canvas');
	canvas.width = video.videoWidth;
	canvas.height = video.videoHeight;
	const ctx = canvas.getContext('2d');
	if (!ctx) {
		try {
			liveTrack.detach(video);
		} catch {}
		video.remove();
		return null;
	}

	ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
	const frameDataUrl = canvas.toDataURL('image/jpeg', 0.9);
	try {
		liveTrack.detach(video);
	} catch {}
	video.remove();
	return frameDataUrl;
};

export const VoiceParticipantItem = observer(function VoiceParticipantItem({
	user,
	voiceState,
	guildId,
	isGroupedItem = false,
	isCurrentUserConnection = false,
	isCurrentUser = false,
}: {
	user: UserRecord;
	voiceState: VoiceState | null;
	guildId: string;
	isGroupedItem?: boolean;
	isCurrentUserConnection?: boolean;
	isCurrentUser?: boolean;
}) {
	const {t} = useLingui();
	const connectionId = voiceState?.connection_id ?? '';
	const participant = MediaEngineStore.getParticipantByUserIdAndConnectionId(user.id, connectionId);
	const connectedChannelId = MediaEngineStore.channelId;
	const currentChannelId = voiceState?.channel_id ?? connectedChannelId ?? null;

	const canMoveMembers = PermissionStore.can(Permissions.MOVE_MEMBERS, {guildId});
	const canDragParticipant = canMoveMembers && currentChannelId !== null;

	const isSpeaking = participant?.isSpeaking ?? false;
	const isMobileLayout = MobileLayoutStore.isMobileLayout();
	const [menuOpen, setMenuOpen] = useState(false);
	const [isProfilePopoutOpen, setIsProfilePopoutOpen] = useState(false);
	const [isPreviewHovered, setIsPreviewHovered] = useState(false);
	const [streamPreviewUrl, setStreamPreviewUrl] = useState<string | null>(null);
	const [streamPreviewLoading, setStreamPreviewLoading] = useState(false);
	const [streamPreviewPosition, setStreamPreviewPosition] = useState<{left: number; top: number} | null>(null);
	const localSelfVideo = LocalVoiceStateStore.selfVideo;
	const localSelfStream = LocalVoiceStateStore.selfStream;
	const isLocalParticipant = isCurrentUser || isCurrentUserConnection;
	const rowWrapperRef = React.useRef<HTMLDivElement | null>(null);

	const [{isDragging}, dragRef] = useDrag(
		() => ({
			type: DND_TYPES.VOICE_PARTICIPANT,
			item: {
				type: DND_TYPES.VOICE_PARTICIPANT,
				id: user.id,
				userId: user.id,
				connectionId,
				guildId,
				currentChannelId,
			},
			canDrag: canDragParticipant,
			collect: (monitor) => ({isDragging: monitor.isDragging()}),
		}),
		[user.id, guildId, currentChannelId, canDragParticipant],
	);

	const dragConnectorRef = useCallback(
		(node: ConnectableElement | null) => {
			dragRef(node);
		},
		[dragRef],
	);

	const isSelfMuted = voiceState?.self_mute ?? (participant ? !participant.isMicrophoneEnabled : false);
	const isSelfDeafened = voiceState?.self_deaf ?? false;
	const isGuildMuted = voiceState?.mute ?? false;
	const isGuildDeafened = voiceState?.deaf ?? false;
	const isActuallySpeaking = isSpeaking && !isSelfMuted && !isGuildMuted;

	const remoteCameraOn = voiceState?.self_video ?? (participant ? participant.isCameraEnabled : false);
	const remoteLive = voiceState?.self_stream ?? (participant ? participant.isScreenShareEnabled : false);
	const displayCameraOn = !!(remoteCameraOn || (isLocalParticipant ? localSelfVideo : false));
	const displayLive = !!(remoteLive || (isLocalParticipant ? localSelfStream : false));
	const hasVoiceStateIcons =
		displayCameraOn || displayLive || isSelfMuted || isSelfDeafened || isGuildMuted || isGuildDeafened;
	const fallbackIdentity = connectionId ? `user_${user.id}_${connectionId}` : null;
	const streamerParticipantIdentity = participant?.identity ?? fallbackIdentity;
	const shouldShowStreamPreview = Boolean(!isMobileLayout && isPreviewHovered && displayLive && streamerParticipantIdentity);
	const room = MediaEngineStore.room;

	const handleContextMenu = useCallback(
		(event: React.MouseEvent) => {
			event.preventDefault();
			event.stopPropagation();
			const participantName = NicknameUtils.getNickname(user, guildId, currentChannelId) || user.username;
			ContextMenuActionCreators.openFromEvent(event, ({onClose}) => (
				<VoiceParticipantContextMenu
					user={user}
					participantName={participantName}
					onClose={onClose}
					guildId={guildId}
					connectionId={connectionId}
					isGroupedItem={isGroupedItem}
				/>
			));
		},
		[user, guildId, connectionId, currentChannelId],
	);

	const handleProfilePopoutOpen = React.useCallback(() => {
		setIsProfilePopoutOpen(true);
	}, []);

	const handleProfilePopoutClose = React.useCallback(() => {
		setIsProfilePopoutOpen(false);
	}, []);

	const DeviceIcon = voiceState?.is_mobile ? DeviceMobileIcon : DesktopIcon;
	const unknownDeviceFallback = useMemo(() => t`Unknown Device`, []);
	const displayName = isGroupedItem
		? voiceState?.connection_id || unknownDeviceFallback
		: NicknameUtils.getNickname(user, guildId, currentChannelId);
	const openProfileAriaLabel = !isGroupedItem ? t`Open profile for ${displayName}` : undefined;
	const previewTitle = NicknameUtils.getNickname(user, guildId, currentChannelId) || user.username;

	React.useEffect(() => {
		if (!shouldShowStreamPreview || !streamerParticipantIdentity || !room) {
			setStreamPreviewLoading(false);
			setStreamPreviewUrl(null);
			return;
		}

		let cancelled = false;
		setStreamPreviewLoading(true);
		setStreamPreviewUrl(null);

		const resolveParticipant = (): LocalParticipant | RemoteParticipant | null => {
			if (room.localParticipant?.identity === streamerParticipantIdentity) {
				return room.localParticipant;
			}
			const directMatch = room.remoteParticipants.get(streamerParticipantIdentity);
			if (directMatch) return directMatch;

			for (const remote of room.remoteParticipants.values()) {
				if (remote.identity === streamerParticipantIdentity) return remote;
			}
			return null;
		};

		void (async () => {
			const lkParticipant = resolveParticipant();
			if (!lkParticipant) {
				if (!cancelled) {
					setStreamPreviewLoading(false);
				}
				return;
			}

			const publication = findScreenSharePublication(lkParticipant);
			if (!publication) {
				if (!cancelled) {
					setStreamPreviewLoading(false);
				}
				return;
			}

			const frame = await captureFirstFrameFromLiveKitPublication(publication);
			if (cancelled) return;
			setStreamPreviewUrl(frame);
			setStreamPreviewLoading(false);
		})();

		return () => {
			cancelled = true;
		};
	}, [displayLive, room, shouldShowStreamPreview, streamerParticipantIdentity]);

	React.useEffect(() => {
		if (!shouldShowStreamPreview) {
			setStreamPreviewPosition(null);
			return;
		}

		const updatePosition = () => {
			const node = rowWrapperRef.current;
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

	const row = (
		<div
			ref={rowWrapperRef}
			className={clsx(styles.participantRowWrapper, shouldShowStreamPreview && styles.participantRowWrapperWithPreview)}
		>
			<FocusRing offset={-2} ringClassName={channelItemSurfaceStyles.channelItemFocusRing}>
				<LongPressable
					ref={dragConnectorRef}
					className={clsx(
						styles.participantRow,
						isActuallySpeaking && styles.participantRowSpeaking,
						isDragging && styles.participantRowDragging,
						isCurrentUserConnection && !isActuallySpeaking && styles.participantRowCurrentConnection,
						isProfilePopoutOpen && styles.participantRowPopoutOpen,
					)}
					onContextMenu={handleContextMenu}
					onLongPress={() => {
						if (isMobileLayout) setMenuOpen(true);
					}}
					onMouseEnter={() => {
						if (!isMobileLayout) setIsPreviewHovered(true);
					}}
					onMouseLeave={() => {
						setIsPreviewHovered(false);
					}}
					role={!isGroupedItem ? 'button' : undefined}
					tabIndex={!isGroupedItem ? 0 : -1}
					aria-label={openProfileAriaLabel}
				>
					{isGroupedItem ? (
						<div
							className={clsx(
								styles.deviceIcon,
								isActuallySpeaking && styles.deviceIconSpeaking,
								isCurrentUserConnection && !isActuallySpeaking && styles.deviceIconCurrent,
							)}
						>
							<DeviceIcon className={styles.iconContainer} weight="regular" />
						</div>
					) : (
						<AvatarWithPresence user={user} size={24} speaking={isActuallySpeaking} guildId={guildId} />
					)}

					{isGroupedItem ? (
						<Tooltip text={displayName} position="top">
							<span
								className={clsx(
									styles.participantName,
									isActuallySpeaking && styles.participantNameSpeaking,
									isCurrentUserConnection && !isActuallySpeaking && styles.participantNameCurrent,
								)}
							>
								{displayName}
							</span>
						</Tooltip>
					) : (
						<span
							className={clsx(
								styles.participantName,
								isActuallySpeaking && styles.participantNameSpeaking,
								isCurrentUser && !isActuallySpeaking && styles.participantNameCurrent,
							)}
						>
							{displayName}
						</span>
					)}

					{hasVoiceStateIcons && (
						<div className={styles.iconsContainer}>
							<VoiceStateIcons
								isSelfMuted={isSelfMuted}
								isSelfDeafened={isSelfDeafened}
								isGuildMuted={isGuildMuted}
								isGuildDeafened={isGuildDeafened}
								isCameraOn={displayCameraOn}
								isScreenSharing={displayLive}
								className={styles.flexShrinkZero}
							/>
						</div>
					)}
				</LongPressable>
			</FocusRing>
		</div>
	);

	return (
		<>
			{isGroupedItem ? (
				row
			) : (
				<PreloadableUserPopout
					user={user}
					isWebhook={false}
					guildId={guildId}
					channelId={currentChannelId ?? undefined}
					position="right-start"
					disableContextMenu={true}
					onPopoutOpen={handleProfilePopoutOpen}
					onPopoutClose={handleProfilePopoutClose}
				>
					{row}
				</PreloadableUserPopout>
			)}
			{shouldShowStreamPreview &&
				streamPreviewPosition &&
				createPortal(
					<div
						className={styles.streamPreviewPopover}
						aria-hidden="true"
						style={{left: `${streamPreviewPosition.left}px`, top: `${streamPreviewPosition.top}px`}}
					>
						<div className={styles.streamPreviewMeta}>
							<span className={styles.streamPreviewTitle}>{previewTitle}</span>
						</div>
						<div className={styles.streamPreviewViewport}>
							{streamPreviewUrl ? (
								<img src={streamPreviewUrl} alt="" className={styles.streamPreviewImage} />
							) : (
								<span className={styles.streamPreviewFallback}>{streamPreviewLoading ? t`Loading...` : t`No preview yet`}</span>
							)}
						</div>
					</div>,
					document.body,
				)}

			{isMobileLayout && (
				<VoiceParticipantBottomSheet
					isOpen={menuOpen}
					onClose={() => setMenuOpen(false)}
					user={user}
					participant={participant}
					guildId={guildId}
					connectionId={connectionId}
					isConnectionItem={isGroupedItem}
				/>
			)}
		</>
	);
});
