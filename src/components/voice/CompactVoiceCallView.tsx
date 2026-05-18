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

import type {MessageDescriptor} from '@lingui/core';
import {msg} from '@lingui/core/macro';
import {useLingui} from '@lingui/react/macro';
import {ArrowsOutIcon, XIcon} from '@phosphor-icons/react';
import {
	isTrackReference,
	ParticipantContext,
	TrackRefContext,
	type TrackReference,
	useConnectionState,
	useParticipants,
	useTracks,
} from '@livekit/components-react';
import {clsx} from 'clsx';
import {motion, useReducedMotion} from 'framer-motion';
import {ConnectionState, Track} from 'livekit-client';
import {observer} from 'mobx-react-lite';
import type React from 'react';
import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import FocusRing from '~/components/uikit/FocusRing/FocusRing';
import type {ChannelRecord} from '~/records/ChannelRecord';
import styles from './CompactVoiceCallView.module.css';
import {VoiceControlBar} from './VoiceControlBar';
import {VoiceParticipantTile} from './VoiceParticipantTile';

interface CompactVoiceCallViewProps {
	channel: ChannelRecord;
	className?: string;
	hideHeader?: boolean;
	hideControlBar?: boolean;
	controlBar?: React.ReactNode;
	onExpand?: () => void;
	expandLabel?: string;
}

const MAX_CAMERA_TILES = 4;
const ARC_EASE = [0.22, 1, 0.36, 1] as const;

type WebKitFullscreenVideoElement = HTMLVideoElement & {
	webkitDisplayingFullscreen?: boolean;
	webkitEnterFullscreen?: () => void;
	webkitExitFullscreen?: () => void;
};

function getContainerMotion(reducedMotion: boolean) {
	if (reducedMotion) {
		return {};
	}

	return {
		initial: {opacity: 0, y: 12, scale: 0.985},
		animate: {opacity: 1, y: 0, scale: 1},
		transition: {duration: 0.3, ease: ARC_EASE},
	};
}

function getTileMotion(reducedMotion: boolean, delay = 0) {
	if (reducedMotion) {
		return {};
	}

	return {
		initial: {opacity: 0, y: 10, scale: 0.98},
		animate: {opacity: 1, y: 0, scale: 1},
		transition: {duration: 0.24, ease: ARC_EASE, delay},
		whileHover: {y: -2},
	};
}

function getButtonMotion(reducedMotion: boolean) {
	if (reducedMotion) {
		return {};
	}

	return {
		whileHover: {y: -1, scale: 1.01},
		whileTap: {scale: 0.98},
		transition: {duration: 0.16, ease: ARC_EASE},
	};
}

function getConnectionLabel(state: ConnectionState, t: (m: MessageDescriptor) => string) {
	switch (state) {
		case ConnectionState.Connecting:
			return t(msg({message: 'Connecting...'}));
		case ConnectionState.Reconnecting:
			return t(msg({message: 'Reconnecting...'}));
		case ConnectionState.Disconnected:
			return t(msg({message: 'Disconnected'}));
		default:
			return t(msg({message: 'Voice Connected'}));
	}
}

function trackSortKey(tr: TrackReference) {
	const sourceRank = tr.source === Track.Source.ScreenShare ? 0 : 1;
	return `${sourceRank}:${tr.participant?.identity ?? ''}:${tr.publication?.trackSid ?? ''}`;
}

function getUserIdFromIdentity(identity: string | undefined): string | null {
	if (!identity) return null;
	const match = identity.match(/^user_(\d+)(?:_(.+))?$/);
	return match ? match[1] : null;
}

function dedupeTrackRefsByUserAndSource(trackRefs: Array<TrackReference>): Array<TrackReference> {
	const bestByUserAndSource = new Map<string, TrackReference>();
	const score = (tr: TrackReference): number => {
		let next = 0;
		if (!tr.publication?.isMuted) next += 2;
		if (tr.publication?.track) next += 2;
		return next;
	};

	for (const tr of trackRefs) {
		const identity = tr.participant.identity ?? '';
		const userKey = getUserIdFromIdentity(identity) ?? identity;
		const key = `${userKey}:${tr.source}`;
		const existing = bestByUserAndSource.get(key);
		if (!existing) {
			bestByUserAndSource.set(key, tr);
			continue;
		}
		if (score(tr) > score(existing)) {
			bestByUserAndSource.set(key, tr);
		}
	}

	return Array.from(bestByUserAndSource.values());
}

export const CompactVoiceCallView: React.FC<CompactVoiceCallViewProps> = observer(function CompactVoiceCallView({
	channel,
	className,
	hideHeader = false,
	hideControlBar = false,
	controlBar,
	onExpand,
	expandLabel,
}) {
	const {t} = useLingui();
	const reducedMotion = useReducedMotion() ?? false;
	const participants = useParticipants();
	const connectionState = useConnectionState();
	const sectionRef = useRef<HTMLElement | null>(null);
	const [isScreenShareFullscreen, setIsScreenShareFullscreen] = useState(false);

	const tracks = useTracks(
		[
			{source: Track.Source.ScreenShare, withPlaceholder: false},
			{source: Track.Source.Camera, withPlaceholder: false},
		],
		{onlySubscribed: false},
	);

	const trackRefs = useMemo(() => tracks.filter(isTrackReference) as Array<TrackReference>, [tracks]);

	const sortedTrackRefs = useMemo(() => {
		const deduped = dedupeTrackRefsByUserAndSource(trackRefs);
		return [...deduped].sort((a, b) => trackSortKey(a).localeCompare(trackSortKey(b)));
	}, [trackRefs]);

	const screenShareTracks = useMemo(
		() => sortedTrackRefs.filter((track) => track.source === Track.Source.ScreenShare),
		[sortedTrackRefs],
	);
	const cameraTracks = useMemo(
		() => sortedTrackRefs.filter((track) => track.source !== Track.Source.ScreenShare),
		[sortedTrackRefs],
	);

	const visibleTracks = useMemo(() => {
		return [...screenShareTracks, ...cameraTracks.slice(0, MAX_CAMERA_TILES)];
	}, [screenShareTracks, cameraTracks]);
	const overflowCount = Math.max(0, sortedTrackRefs.length - visibleTracks.length);
	const hasScreenSharePreview = useMemo(
		() => visibleTracks.some((track) => track.source === Track.Source.ScreenShare),
		[visibleTracks],
	);
	const hasMultipleScreenShares = screenShareTracks.length > 1;

	const participantCount = useMemo(() => {
		if (participants.length === 0) return 0;
		const uniqueUserIds = new Set<string>();
		for (const participant of participants) {
			const userId = getUserIdFromIdentity(participant.identity);
			uniqueUserIds.add(userId ?? participant.identity);
		}
		return uniqueUserIds.size;
	}, [participants]);
	const statusText = useMemo(
		() => getConnectionLabel(connectionState, t),
		[connectionState, t],
	);
	const participantSummary = useMemo(() => {
		if (participantCount <= 0) {
			return null;
		}

		return participantCount === 1 ? t`${participantCount} participant` : t`${participantCount} participants`;
	}, [participantCount, t]);

	const ariaLabel = useMemo(() => {
		if (connectionState !== ConnectionState.Connected) {
			return t`Voice call. ${statusText}.`;
		}

		if (!participantSummary) {
			return t`Voice call. ${statusText}.`;
		}

		return t`Voice call. ${participantSummary}.`;
	}, [connectionState, participantSummary, statusText, t]);

	const containerClassName = clsx(styles.container, className, hideHeader && styles.containerNoHeader);
	const controlBarContent = hideControlBar ? null : (controlBar ?? <VoiceControlBar />);

	const showVideoStrip = visibleTracks.length > 0;
	const primaryScreenShareTrack = useMemo(() => visibleTracks.find((track) => track.source === Track.Source.ScreenShare) ?? null, [visibleTracks]);

	const syncScreenShareFullscreenState = useCallback(() => {
		const root = sectionRef.current;
		const tile = root?.querySelector("[data-source='screen_share']") as HTMLElement | null;
		const video = tile?.querySelector('video') as WebKitFullscreenVideoElement | null;
		setIsScreenShareFullscreen(document.fullscreenElement === tile || Boolean(video?.webkitDisplayingFullscreen));
	}, []);

	const handleToggleScreenShareFullscreen = useCallback(() => {
		const root = sectionRef.current;
		const tile = root?.querySelector("[data-source='screen_share']") as HTMLElement | null;
		const video = tile?.querySelector('video') as WebKitFullscreenVideoElement | null;

		if (!tile) return;

		if (document.fullscreenElement === tile) {
			void document.exitFullscreen();
			return;
		}

		if (video?.webkitDisplayingFullscreen && typeof video.webkitExitFullscreen === 'function') {
			video.webkitExitFullscreen();
			return;
		}

		if (typeof tile.requestFullscreen === 'function') {
			tile.requestFullscreen().catch(() => {
				video?.webkitEnterFullscreen?.();
			});
			return;
		}

		video?.webkitEnterFullscreen?.();
	}, []);

	useEffect(() => {
		const root = sectionRef.current;
		const tile = root?.querySelector("[data-source='screen_share']") as HTMLElement | null;
		const video = tile?.querySelector('video') as WebKitFullscreenVideoElement | null;

		const handleChange = () => syncScreenShareFullscreenState();
		document.addEventListener('fullscreenchange', handleChange);
		video?.addEventListener('webkitbeginfullscreen', handleChange);
		video?.addEventListener('webkitendfullscreen', handleChange);
		handleChange();

		return () => {
			document.removeEventListener('fullscreenchange', handleChange);
			video?.removeEventListener('webkitbeginfullscreen', handleChange);
			video?.removeEventListener('webkitendfullscreen', handleChange);
		};
	}, [primaryScreenShareTrack, syncScreenShareFullscreenState]);

	return (
		<motion.section ref={sectionRef} className={containerClassName} aria-label={ariaLabel} {...getContainerMotion(reducedMotion)}>
			{!hideHeader && (
				<motion.header className={styles.header} {...getTileMotion(reducedMotion, 0.02)}>
					<div className={styles.headerContent}>
						<div className={styles.statusContainer} data-state={connectionState}>
							<span className={styles.statusDot} aria-hidden="true" />
							<span className={styles.statusText}>{statusText}</span>
						</div>
						{participantSummary && <span className={styles.participantPill}>{participantSummary}</span>}
					</div>
					<div className={styles.headerActions}>
						{primaryScreenShareTrack && !hideHeader && (
							<FocusRing offset={-2}>
								<motion.button
									type="button"
									className={clsx(styles.expandButton, isScreenShareFullscreen && styles.expandButtonActive)}
									onClick={handleToggleScreenShareFullscreen}
									aria-label={isScreenShareFullscreen ? t`Exit screenshare fullscreen` : t`Open screenshare fullscreen`}
									{...getButtonMotion(reducedMotion)}
								>
									{isScreenShareFullscreen ? (
										<XIcon weight="bold" className={styles.iconSmall} />
									) : (
										<ArrowsOutIcon weight="bold" className={styles.iconSmall} />
									)}
								</motion.button>
							</FocusRing>
						)}
						{onExpand && (
						<FocusRing offset={-2}>
							<motion.button
								type="button"
								className={styles.expandButton}
								onClick={onExpand}
								aria-label={expandLabel ?? t`Open call`}
								{...getButtonMotion(reducedMotion)}
							>
								<ArrowsOutIcon weight="bold" className={styles.iconSmall} />
							</motion.button>
						</FocusRing>
						)}
					</div>
				</motion.header>
			)}

			{showVideoStrip && (
				<motion.div className={clsx(styles.videoSection, hasScreenSharePreview && styles.videoSectionCentered)}>
					<motion.div
						className={clsx(styles.videoContainer, hasScreenSharePreview && styles.videoContainerCentered)}
						data-screen-share-count={screenShareTracks.length}
						data-multiple-screen-shares={hasMultipleScreenShares ? 'true' : 'false'}
						role="list"
						aria-label={t(msg({message: 'Video previews'}))}
						{...(reducedMotion ? {} : {initial: 'hidden', animate: 'visible'})}
					>
						{visibleTracks.map((trackRef) => {
							const key = `${trackRef.publication?.trackSid ?? 'pub'}:${trackRef.participant.identity}:${trackRef.source}`;
							const isScreenShareTrack = trackRef.source === Track.Source.ScreenShare;

							return (
								<motion.div
									key={key}
									className={clsx(
										styles.videoTile,
										hasScreenSharePreview && styles.videoTileCentered,
										isScreenShareTrack && styles.videoTileScreenShare,
									)}
									role="listitem"
									{...getTileMotion(reducedMotion, 0.04)}
								>
									<TrackRefContext.Provider value={trackRef}>
										<ParticipantContext.Provider value={trackRef.participant}>
											<VoiceParticipantTile trackRef={trackRef} guildId={channel.guildId} channelId={channel.id} />
										</ParticipantContext.Provider>
									</TrackRefContext.Provider>
								</motion.div>
							);
						})}

						{overflowCount > 0 && (
							<motion.div
								className={styles.moreVideos}
								role="listitem"
								aria-label={t`${overflowCount} more videos`}
								{...getTileMotion(reducedMotion, 0.08)}
							>
								<span className={styles.moreVideosText}>{t`+${overflowCount} more`}</span>
							</motion.div>
						)}
					</motion.div>
				</motion.div>
			)}

			{controlBarContent && (
				<motion.footer className={styles.controlBarSection} {...getTileMotion(reducedMotion, 0.1)}>
					{controlBarContent}
				</motion.footer>
			)}
		</motion.section>
	);
});
