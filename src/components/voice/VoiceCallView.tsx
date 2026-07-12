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

import {
	FloatingFocusManager,
	flip,
	offset,
	shift,
	useClick,
	useDismiss,
	useFloating,
	useInteractions,
	useRole,
} from '@floating-ui/react';
import {AnimatePresence, motion, useReducedMotion} from 'framer-motion';
import {useLingui} from '@lingui/react/macro';
import type {TrackReferenceOrPlaceholder} from '@livekit/components-react';
import {
	CarouselLayout,
	isTrackReference,
	ParticipantContext,
	TrackRefContext,
	useConnectionState,
	useParticipants,
} from '@livekit/components-react';
import {
	ArrowLeftIcon,
	ArrowsOutIcon,
	CaretDownIcon,
	CaretUpIcon,
	ChartBarIcon,
	ListIcon,
	StarIcon,
	UsersThreeIcon,
	XIcon,
} from '@phosphor-icons/react';
import {clsx} from 'clsx';
import {ConnectionState, type Participant, Track} from 'livekit-client';
import {observer} from 'mobx-react-lite';
import React, {forwardRef, useCallback, useMemo, useRef, useState} from 'react';
import * as Sentry from '@sentry/react';
import * as ToastActionCreators from '~/actions/ToastActionCreators';
import {ME, Permissions} from '~/Constants';
import {ChannelHeaderIcon} from '~/components/channel/ChannelHeader/ChannelHeaderIcon';
import {InboxButton} from '~/components/channel/ChannelHeader/UtilityButtons';
import {NativeDragRegion} from '~/components/layout/NativeDragRegion';
import {BottomSheet} from '~/components/uikit/BottomSheet/BottomSheet';
import FocusRing from '~/components/uikit/FocusRing/FocusRing';
import {Scroller} from '~/components/uikit/Scroller';
import {Tooltip} from '~/components/uikit/Tooltip/Tooltip';
import type {ChannelRecord} from '~/records/ChannelRecord';
import AccessibilityStore from '~/stores/AccessibilityStore';
import ContextMenuStore, {isContextMenuNodeTarget} from '~/stores/ContextMenuStore';
import FavoritesStore from '~/stores/FavoritesStore';
import KeyboardModeStore from '~/stores/KeyboardModeStore';
import MobileLayoutStore from '~/stores/MobileLayoutStore';
import PermissionStore from '~/stores/PermissionStore';
import PopoutStore from '~/stores/PopoutStore';
import UserStore from '~/stores/UserStore';
import VoiceSettingsStore from '~/stores/VoiceSettingsStore';
import MediaEngineStore from '~/stores/voice/MediaEngineFacade';
import ChannelListLayoutStore from '~/stores/ChannelListLayoutStore';
import * as ChannelUtils from '~/utils/ChannelUtils';
import {isBroadcastVoiceChannel} from '~/utils/channelVoiceMode';
import channelHeaderStyles from '../channel/ChannelHeader.module.css';
import {useVoiceCallTracksAndLayout} from './useVoiceCallTracksAndLayout';
import {ReconnectOrbit} from './ReconnectOrbit';
import styles from './VoiceCallView.module.css';
import {VoiceControlBar} from './VoiceControlBar';
import {VoiceGridLayout} from './VoiceGridLayout';
import {VoiceParticipantTile} from './VoiceParticipantTile';
import {VoiceStatsOverlay} from './VoiceStatsOverlay';

interface VoiceCallViewProps {
	channel: ChannelRecord;
}

const ARC_EASE = [0.22, 1, 0.36, 1] as const;

function getPanelMotion(reducedMotion: boolean, delay = 0) {
	if (reducedMotion) {
		return {};
	}

	return {
		initial: {opacity: 0, y: 10, scale: 0.99},
		animate: {opacity: 1, y: 0, scale: 1},
		transition: {duration: 0.28, ease: ARC_EASE, delay},
	};
}

function getLayoutMotion(reducedMotion: boolean) {
	if (reducedMotion) {
		return {};
	}

	return {
		initial: {opacity: 0, y: 14},
		animate: {opacity: 1, y: 0},
		exit: {opacity: 0, y: -8},
		transition: {duration: 0.24, ease: ARC_EASE},
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

function useConnectionStateText(connectionState: ConnectionState, t: any) {
	return useMemo(() => {
		switch (connectionState) {
			case ConnectionState.Connecting:
				return t`Connecting...`;
			case ConnectionState.Reconnecting:
				return t`Reconnecting...`;
			case ConnectionState.Disconnected:
				return t`Disconnected`;
			case ConnectionState.Connected:
				return t`Voice connection established`;
			default:
				return null;
		}
	}, [connectionState, t]);
}

function getUserIdFromIdentity(identity: string | undefined): string | null {
	if (!identity) return null;
	if (!identity.startsWith('user_')) return null;
	const value = identity.slice(5);
	const delimiterIndex = value.indexOf('_');
	return delimiterIndex === -1 ? value : value.slice(0, delimiterIndex);
}

function getVoiceIdentityParts(identity: string | undefined): {userId: string | null; connectionId: string | null} {
	if (!identity) return {userId: null, connectionId: null};
	if (!identity.startsWith('user_')) return {userId: null, connectionId: null};
	const value = identity.slice(5);
	const delimiterIndex = value.indexOf('_');
	if (delimiterIndex === -1) {
		return {userId: value, connectionId: null};
	}
	return {
		userId: value.slice(0, delimiterIndex) || null,
		connectionId: value.slice(delimiterIndex + 1) || null,
	};
}

function VoiceCallCrashFallback({channel, onRetry}: {channel: ChannelRecord; onRetry?: () => void}) {
	const {t} = useLingui();

	const handleLeaveVoice = useCallback(() => {
		void MediaEngineStore.disconnectFromVoiceChannel('error');
	}, []);

	return (
		<div className={styles.voiceCrashFallback} role="alert">
			<div className={styles.voiceCrashCard}>
				<div className={styles.voiceCrashEyebrow}>{t`Voice view recovered`}</div>
				<h2 className={styles.voiceCrashTitle}>{channel.name ?? t`Voice call`}</h2>
				<p className={styles.voiceCrashDescription}>
					{t`The call UI hit a rendering error. Your app stayed open, and you can retry the voice view or leave the call safely.`}
				</p>
				<div className={styles.voiceCrashActions}>
					{onRetry && (
						<button type="button" className={styles.voiceCrashButtonPrimary} onClick={onRetry}>
							{t`Try again`}
						</button>
					)}
					<button type="button" className={styles.voiceCrashButton} onClick={handleLeaveVoice}>
						{t`Leave voice`}
					</button>
				</div>
			</div>
		</div>
	);
}

function useFullscreen(containerRef: React.RefObject<HTMLElement | null>) {
	const [isFullscreen, setIsFullscreen] = useState(false);
	const [chromeVisible, setChromeVisible] = useState(true);

	const toggleFullscreen = useCallback(() => {
		const el = containerRef.current;
		if (!el) return;

		if (document.fullscreenElement) {
			document.exitFullscreen().catch(() => {});
			return;
		}

		el.requestFullscreen().catch(() => {});
	}, [containerRef]);

	React.useEffect(() => {
		const onChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
		document.addEventListener('fullscreenchange', onChange);
		return () => document.removeEventListener('fullscreenchange', onChange);
	}, []);

	/*
	 * Auto-hide chrome after 2.5s of inactivity in fullscreen mode. The
	 * prior implementation only used `:hover` / `:focus-within` which fail
	 * the moment a user moves the cursor over the video tiles (no parent
	 * hover) and break completely on touch devices because mobile browsers
	 * don't fire `:hover`. Now any pointer/touch/key activity surfaces the
	 * chrome and resets the timer; without input the chrome fades out.
	 */
	React.useEffect(() => {
		if (!isFullscreen) {
			setChromeVisible(true);
			return;
		}

		const el = containerRef.current;
		if (!el) return;

		let timer: ReturnType<typeof setTimeout> | null = null;
		const reveal = () => {
			setChromeVisible(true);
			if (timer) clearTimeout(timer);
			timer = setTimeout(() => setChromeVisible(false), 2500);
		};

		reveal();
		el.addEventListener('mousemove', reveal);
		el.addEventListener('pointerdown', reveal);
		el.addEventListener('touchstart', reveal, {passive: true});
		el.addEventListener('keydown', reveal);

		return () => {
			if (timer) clearTimeout(timer);
			el.removeEventListener('mousemove', reveal);
			el.removeEventListener('pointerdown', reveal);
			el.removeEventListener('touchstart', reveal);
			el.removeEventListener('keydown', reveal);
		};
	}, [isFullscreen, containerRef]);

	return {isFullscreen, toggleFullscreen, chromeVisible};
}

const VoiceCallViewInner = observer(({channel}: {channel: ChannelRecord}) => {
	const {t} = useLingui();
	const reducedMotion = useReducedMotion() ?? false;
	const containerRef = useRef<HTMLDivElement>(null);

	const isMobile = MobileLayoutStore.isMobileLayout();
	const isChannelSidebarCollapsed = !isMobile && ChannelListLayoutStore.getSidebarCollapsed();
	const {keyboardModeEnabled} = KeyboardModeStore;

	const [isStatsOpen, setIsStatsOpen] = useState(false);

	const participants = useParticipants();
	const participantCount = useMemo(() => {
		if (participants.length === 0) return 0;
		const uniqueUserIds = new Set<string>();
		for (const participant of participants) {
			const userId = getUserIdFromIdentity(participant.identity);
			uniqueUserIds.add(userId ?? participant.identity);
		}
		return uniqueUserIds.size;
	}, [participants]);
	const connectionState = useConnectionState();
	const connectionStateText = useConnectionStateText(connectionState, t);
	const participantStatusText = useMemo(
		() => (participantCount === 1 ? t`${participantCount} participant` : t`${participantCount} participants`),
		[participantCount, t],
	);

	const isInboxPopoutOpen = PopoutStore.isOpen('inbox');
	const isFavorited = channel ? Boolean(FavoritesStore.getChannel(channel.id)) : false;

	const isAnyContextMenuOpen = useMemo(() => {
		const cm = ContextMenuStore.contextMenu;
		const target = cm?.target?.target ?? null;
		const container = containerRef.current;
		if (!cm || !container || !isContextMenuNodeTarget(target)) return false;
		return Boolean(container.contains(target));
	}, [ContextMenuStore.contextMenu]);

	const {isFullscreen, toggleFullscreen, chromeVisible} = useFullscreen(containerRef);

	const {
		layoutMode,
		pinnedParticipantIdentity,
		hasScreenShare,
		screenShareTracks,
		cameraTracksAll,
		filteredCameraTracks,
		focusMainTrack,
		carouselTracks,
	} = useVoiceCallTracksAndLayout({channel});

	const showParticipantsCarousel = VoiceSettingsStore.getShowParticipantsCarousel();
	const isBroadcastMode = isBroadcastVoiceChannel(channel) || MediaEngineStore.isVoiceChannelStageLike(channel.id);
	const canCurrentUserSpeak = PermissionStore.can(Permissions.SPEAK, channel);
	const isCurrentUserListenerMode = isBroadcastMode && MediaEngineStore.isCurrentUserInBroadcastListenerMode();
	const participantSnapshots = MediaEngineStore.participants;
	const guildKey = channel.guildId ?? ME;
	const voiceStatesInChannel = MediaEngineStore.getAllVoiceStatesInChannel(guildKey, channel.id);
	const {broadcasterTracks, listenerTracks} = (() => {
		if (!isBroadcastMode) {
			return {broadcasterTracks: cameraTracksAll, listenerTracks: [] as Array<TrackReferenceOrPlaceholder>};
		}

		const trackByIdentity = new Map<string, TrackReferenceOrPlaceholder>();
		for (const trackRef of cameraTracksAll) {
			trackByIdentity.set(trackRef.participant.identity, trackRef);
		}
		const voiceStatesByUserId = new Map<string, Array<(typeof voiceStatesInChannel)[string]>>();
		for (const state of Object.values(voiceStatesInChannel)) {
			if (!state?.user_id) continue;
			const existingStates = voiceStatesByUserId.get(state.user_id) ?? [];
			existingStates.push(state);
			voiceStatesByUserId.set(state.user_id, existingStates);
		}
		const resolveFallbackVoiceState = (userId: string | null) => {
			if (!userId) return null;
			const states = voiceStatesByUserId.get(userId) ?? [];
			if (states.length === 0) return null;
			const statesInCurrentChannel = states.filter((state) => state.channel_id === channel.id);
			if (statesInCurrentChannel.length === 1) return statesInCurrentChannel[0];
			if (statesInCurrentChannel.length > 1) {
				return statesInCurrentChannel.find((state) => state.suppress === true) ?? statesInCurrentChannel[0];
			}
			return states.find((state) => state.suppress === true) ?? states[0];
		};

		const nextBroadcasters: Array<TrackReferenceOrPlaceholder> = [];
		const nextListeners: Array<TrackReferenceOrPlaceholder> = [];
		const seenIdentities = new Set<string>();

		for (const participant of participants) {
			const identity = participant.identity;
			if (seenIdentities.has(identity)) continue;
			seenIdentities.add(identity);

			const trackRef =
				trackByIdentity.get(identity) ??
				({
					participant,
					source: Track.Source.Camera,
				} as TrackReferenceOrPlaceholder);

			const participantSnapshot = participantSnapshots[identity];
			const identityParts = getVoiceIdentityParts(identity);
			const userId = participantSnapshot?.userId ?? identityParts.userId;
			const connectionId = participantSnapshot?.connectionId ?? identityParts.connectionId;
			const fallbackVoiceState = resolveFallbackVoiceState(userId);
			const voiceState = connectionId ? MediaEngineStore.getVoiceStateByConnectionId(connectionId) ?? fallbackVoiceState : fallbackVoiceState;
			const isCurrentUserTrack = participant.isLocal || userId === UserStore.currentUser?.id;
			// Stage role source of truth: suppressed users are listeners, unsuppressed users are broadcasters.
			const isListener =
				voiceState?.suppress === true ||
				(isCurrentUserTrack && (isCurrentUserListenerMode || !canCurrentUserSpeak));

			if (isListener) {
				nextListeners.push(trackRef);
			} else {
				nextBroadcasters.push(trackRef);
			}
		}

		for (const trackRef of cameraTracksAll) {
			const identity = trackRef.participant.identity;
			if (seenIdentities.has(identity)) continue;
			seenIdentities.add(identity);

			const participantSnapshot = participantSnapshots[identity];
			const identityParts = getVoiceIdentityParts(identity);
			const userId = participantSnapshot?.userId ?? identityParts.userId;
			const connectionId = participantSnapshot?.connectionId ?? identityParts.connectionId;
			const fallbackVoiceState = resolveFallbackVoiceState(userId);
			const voiceState = connectionId ? MediaEngineStore.getVoiceStateByConnectionId(connectionId) ?? fallbackVoiceState : fallbackVoiceState;
			const isCurrentUserTrack = trackRef.participant.isLocal || userId === UserStore.currentUser?.id;
			// Stage role source of truth: suppressed users are listeners, unsuppressed users are broadcasters.
			const isListener =
				voiceState?.suppress === true ||
				(isCurrentUserTrack && (isCurrentUserListenerMode || !canCurrentUserSpeak));

			if (isListener) {
				nextListeners.push(trackRef);
			} else {
				nextBroadcasters.push(trackRef);
			}
		}

		return {broadcasterTracks: nextBroadcasters, listenerTracks: nextListeners};
	})();

	const {
		refs: statsRefs,
		floatingStyles: statsFloatingStyles,
		context: statsContext,
	} = useFloating({
		open: isStatsOpen,
		onOpenChange: setIsStatsOpen,
		placement: 'bottom-end',
		middleware: [offset(8), flip(), shift({padding: 8})],
	});

	const {getReferenceProps: getStatsReferenceProps, getFloatingProps: getStatsFloatingProps} = useInteractions([
		useClick(statsContext),
		useDismiss(statsContext),
		useRole(statsContext),
	]);
	const statsFloatingProps = isMobile ? {} : getStatsFloatingProps();

	const handleMobileBackClick = useCallback(() => window.history.back(), []);
	const handleRevealChannelList = useCallback(() => {
		ChannelListLayoutStore.setSidebarCollapsed(false);
	}, []);

	const handleToggleFavorite = useCallback(() => {
		if (!channel) return;

		if (isFavorited) {
			FavoritesStore.removeChannel(channel.id);
			ToastActionCreators.createToast({type: 'success', children: t`Channel removed from favorites`});
			return;
		}

		FavoritesStore.addChannel(channel.id, channel.guildId ?? ME);
		ToastActionCreators.createToast({type: 'success', children: t`Channel added to favorites`});
	}, [channel, isFavorited]);

	const handleToggleCarousel = useCallback(() => {
		VoiceSettingsStore.updateSettings({
			showParticipantsCarousel: !showParticipantsCarousel,
		});
	}, [showParticipantsCarousel]);

	const FavoriteIcon = useMemo(() => {
		const Icon = forwardRef<SVGSVGElement, React.ComponentProps<typeof StarIcon>>((props, ref) => (
			<StarIcon ref={ref} weight={isFavorited ? 'fill' : 'bold'} {...props} />
		));
		Icon.displayName = 'FavoriteIcon';
		return Icon;
	}, [isFavorited]);

	const StatsHeaderIcon = useMemo(() => {
		const Icon = forwardRef<SVGSVGElement, React.ComponentProps<typeof ChartBarIcon>>((props, ref) => (
			<ChartBarIcon ref={ref} weight="duotone" {...props} />
		));
		Icon.displayName = 'StatsHeaderIcon';
		return Icon;
	}, []);

	const FullscreenHeaderIcon = useMemo(() => {
		const Icon = forwardRef<SVGSVGElement, React.ComponentProps<typeof ArrowsOutIcon>>((props, ref) =>
			isFullscreen ? <XIcon ref={ref} weight="bold" {...props} /> : <ArrowsOutIcon ref={ref} weight="duotone" {...props} />,
		);
		Icon.displayName = 'FullscreenHeaderIcon';
		return Icon;
	}, [isFullscreen]);

	const focusLayoutNode = useMemo(() => {
		if (!focusMainTrack && carouselTracks.length === 0) {
			return (
				<div className={styles.gridLayoutWrapper}>
					<VoiceGridLayout tracks={filteredCameraTracks}>
						<VoiceParticipantTile guildId={channel.guildId} channelId={channel.id} />
					</VoiceGridLayout>
				</div>
			);
		}

		const hasCarousel = carouselTracks.length > 0;
		return (
			<div
				className={clsx(
					styles.focusLayoutContent,
					!hasCarousel && styles.noCarousel,
					hasCarousel && !showParticipantsCarousel && styles.carouselCollapsed,
				)}
			>
				<div className={styles.focusLayoutMainWrapper}>
					{focusMainTrack && (
						<div className={styles.focusLayoutMain}>
							<TrackRefContext.Provider value={focusMainTrack as TrackReferenceOrPlaceholder}>
								<ParticipantContext.Provider
									value={(focusMainTrack as TrackReferenceOrPlaceholder).participant as Participant}
								>
									<VoiceParticipantTile
										guildId={channel.guildId}
										channelId={channel.id}
										isPinned={
											(focusMainTrack as TrackReferenceOrPlaceholder).participant.identity === pinnedParticipantIdentity
										}
										showFocusIndicator={false}
										autoWatchScreenShare={
											(focusMainTrack as TrackReferenceOrPlaceholder).source === Track.Source.ScreenShare
										}
									/>
								</ParticipantContext.Provider>
							</TrackRefContext.Provider>
						</div>
					)}
				</div>

				{carouselTracks.length > 0 && (
					<div className={styles.carouselToggleWrap}>
						<Tooltip text={showParticipantsCarousel ? t`Hide Participants` : t`Show Participants`} position="bottom">
							<FocusRing offset={-2} ringClassName={styles.carouselToggleFocusRing}>
								<button
									type="button"
									aria-label={showParticipantsCarousel ? t`Hide participants` : t`Show participants`}
									className={styles.carouselToggle}
									onClick={handleToggleCarousel}
								>
									{showParticipantsCarousel ? (
										<CaretDownIcon weight="bold" className={styles.iconMedium} />
									) : (
										<CaretUpIcon weight="bold" className={styles.iconMedium} />
									)}
								</button>
							</FocusRing>
						</Tooltip>
					</div>
				)}

				{carouselTracks.length > 0 && showParticipantsCarousel && (
					<div className={styles.carouselWrapper}>
						<Scroller
							orientation="horizontal"
							fade
							className={styles.scrollerFullWidth}
							key="voice-call-carousel-scroller"
						>
							<div className={styles.carouselInner}>
								<CarouselLayout tracks={carouselTracks}>
									<VoiceParticipantTile guildId={channel.guildId} channelId={channel.id} showFocusIndicator />
								</CarouselLayout>
							</div>
						</Scroller>
					</div>
				)}
			</div>
		);
	}, [
		focusMainTrack,
		carouselTracks,
		filteredCameraTracks,
		channel.guildId,
		channel.id,
		pinnedParticipantIdentity,
		showParticipantsCarousel,
		handleToggleCarousel,
	]);

	const gridLayoutNode = useMemo(() => {
		if (hasScreenShare) {
			const gridTracks = [...screenShareTracks, ...filteredCameraTracks];
			if (isMobile) {
				return (
					<div className={styles.gridLayoutWrapper}>
						<div className={styles.mobileScreenshareLayout}>
							<div className={styles.mobileScreenshareStage} role="list" aria-label={t`Screen shares`}>
								{screenShareTracks.map((trackRef) => {
									const key = `${trackRef.participant.sid || trackRef.participant.identity}:${trackRef.source}`;

									return (
										<div key={key} className={styles.mobileScreenshareTile} role="listitem">
											<TrackRefContext.Provider value={trackRef}>
												<ParticipantContext.Provider value={trackRef.participant}>
													<VoiceParticipantTile guildId={channel.guildId} channelId={channel.id} />
												</ParticipantContext.Provider>
											</TrackRefContext.Provider>
										</div>
									);
								})}
							</div>

							{filteredCameraTracks.length > 0 && (
								<div className={styles.mobileParticipantsStrip} aria-label={t`Participants`}>
									<div className={styles.mobileParticipantsRail}>
										{filteredCameraTracks.map((trackRef) => {
											const key = `${trackRef.participant.sid || trackRef.participant.identity}:${trackRef.source}`;

											return (
												<div key={key} className={styles.mobileParticipantTile}>
													<TrackRefContext.Provider value={trackRef}>
														<ParticipantContext.Provider value={trackRef.participant}>
															<VoiceParticipantTile guildId={channel.guildId} channelId={channel.id} />
														</ParticipantContext.Provider>
													</TrackRefContext.Provider>
												</div>
											);
										})}
									</div>
								</div>
							)}
						</div>
					</div>
				);
			}

			return (
				<div className={styles.gridLayoutWrapper}>
					<div className={styles.screenshareGridLayout}>
						<VoiceGridLayout tracks={gridTracks}>
							<VoiceParticipantTile guildId={channel.guildId} channelId={channel.id} />
						</VoiceGridLayout>
					</div>
				</div>
			);
		}

		return (
			<div className={styles.gridLayoutWrapper}>
				<VoiceGridLayout tracks={filteredCameraTracks}>
					<VoiceParticipantTile guildId={channel.guildId} channelId={channel.id} />
				</VoiceGridLayout>
			</div>
		);
	}, [hasScreenShare, isMobile, screenShareTracks, filteredCameraTracks, channel.guildId, channel.id, t]);

	const stageLayoutNode = useMemo(() => {
		const stageShareTrack = screenShareTracks[0] ?? null;
		const speakerCountLabel =
			broadcasterTracks.length === 1 ? t`${broadcasterTracks.length} speaker` : t`${broadcasterTracks.length} speakers`;
		const listenerCountLabel =
			listenerTracks.length === 1 ? t`${listenerTracks.length} listener` : t`${listenerTracks.length} listeners`;

		return (
			<div className={clsx(styles.stageLayout, stageShareTrack && styles.stageLayoutWithShare)}>
				{stageShareTrack && (
					<div className={styles.stageShareContainer}>
						<div className={styles.stageShareHeader}>{t`Live stream`}</div>
						<div className={styles.stageShareTile}>
							<TrackRefContext.Provider value={stageShareTrack}>
								<ParticipantContext.Provider value={stageShareTrack.participant}>
									<VoiceParticipantTile guildId={channel.guildId} channelId={channel.id} />
								</ParticipantContext.Provider>
							</TrackRefContext.Provider>
						</div>
					</div>
				)}

				<div className={clsx(styles.stageSections, stageShareTrack && styles.stageSectionsWithShare)}>
					<section className={styles.stageSection}>
						<header className={styles.stageSectionHeader}>
							<span className={styles.stageSectionTitle}>{t`Broadcasters`}</span>
							<span className={styles.stageSectionCount}>{speakerCountLabel}</span>
						</header>
						<div className={styles.stageSectionBody}>
							{broadcasterTracks.length > 0 ? (
								<VoiceGridLayout tracks={broadcasterTracks}>
									<VoiceParticipantTile guildId={channel.guildId} channelId={channel.id} />
								</VoiceGridLayout>
							) : (
								<div className={styles.stageSectionEmpty}>{t`No broadcasters yet`}</div>
							)}
						</div>
					</section>

					<section className={styles.stageSection}>
						<header className={styles.stageSectionHeader}>
							<span className={styles.stageSectionTitle}>{t`Listeners`}</span>
							<span className={styles.stageSectionCount}>{listenerCountLabel}</span>
						</header>
						<div className={styles.stageSectionBody}>
							{listenerTracks.length > 0 ? (
								<VoiceGridLayout tracks={listenerTracks}>
									<VoiceParticipantTile guildId={channel.guildId} channelId={channel.id} />
								</VoiceGridLayout>
							) : (
								<div className={styles.stageSectionEmpty}>{t`No listeners`}</div>
							)}
						</div>
					</section>
				</div>
			</div>
		);
	}, [broadcasterTracks, channel.guildId, channel.id, listenerTracks, screenShareTracks, t]);

	const mainContentNode = useMemo(() => {
		if (isBroadcastMode) {
			return stageLayoutNode;
		}

		switch (layoutMode) {
			case 'focus':
				return focusLayoutNode;
			default:
				return gridLayoutNode;
		}
	}, [focusLayoutNode, gridLayoutNode, isBroadcastMode, layoutMode, stageLayoutNode]);
	const mainContentKey = `${isBroadcastMode ? 'stage' : layoutMode}:${hasScreenShare ? 'screen' : 'standard'}:${showParticipantsCarousel ? 'carousel' : 'collapsed'}`;

	const statsReferencePropsRaw = getStatsReferenceProps();
	const {ref: _statsRef, onClick: statsOnClickRaw, ...statsReferenceProps} = statsReferencePropsRaw;
	const statsOnClick = statsOnClickRaw as React.MouseEventHandler<HTMLButtonElement> | undefined;

	return (
			<motion.div
			ref={containerRef}
			className={clsx(
				styles.root,
				styles.voiceRoot,
				hasScreenShare && styles.voiceRootHasScreenShare,
				(isAnyContextMenuOpen || isInboxPopoutOpen || isStatsOpen) && styles.contextMenuActive,
				keyboardModeEnabled && styles.keyboardModeActive,
				isFullscreen && styles.fullscreenActive,
				isFullscreen && chromeVisible && styles.fullscreenChromeVisible,
			)}
			{...getPanelMotion(reducedMotion)}
		>
			<output className={styles.srOnly} aria-live="polite" aria-atomic="true">
				{participantCount === 1
					? t`${participantCount} participant in call`
					: t`${participantCount} participants in call`}
			</output>

			{connectionState === ConnectionState.Reconnecting && (
				<div className={styles.reconnectOverlay}>
					<ReconnectOrbit size="large" />
				</div>
			)}

			{connectionState === ConnectionState.Connecting && (
				<div className={styles.connectingOverlay}>
					<ReconnectOrbit size="large" />
					<div className={styles.connectingOverlayText}>
						<strong>{t`Connecting to voice...`}</strong>
						<span>{t`Preparing microphone and voice server`}</span>
					</div>
				</div>
			)}

			<div className={styles.topCallStatusCluster}>
				{connectionState !== ConnectionState.Reconnecting && (
					<div
						className={clsx(
							styles.connectionStatusContainer,
							connectionState === ConnectionState.Connecting && styles.statusConnecting,
							connectionState === ConnectionState.Disconnected && styles.statusDisconnected,
							connectionState === ConnectionState.Connected && styles.statusConnected,
						)}
					>
						<div className={styles.connectionStatusDot} />
						{connectionStateText}
					</div>
				)}
				<div className={styles.participantStatusPill}>
					<UsersThreeIcon weight="fill" className={styles.participantStatusIcon} />
					{participantStatusText}
				</div>
			</div>

			<NativeDragRegion className={clsx(channelHeaderStyles.headerContainer, styles.voiceChrome, styles.voiceHeader)}>
				<div className={channelHeaderStyles.headerLeftSection}>
					{isMobile ? (
						<FocusRing offset={-2}>
							<motion.button
								type="button"
								className={channelHeaderStyles.backButton}
								onClick={handleMobileBackClick}
								{...getButtonMotion(reducedMotion)}
							>
								<ArrowLeftIcon className={channelHeaderStyles.backIconBold} weight="bold" />
							</motion.button>
						</FocusRing>
					) : isChannelSidebarCollapsed ? (
						<FocusRing offset={-2}>
							<motion.button
								type="button"
								className={channelHeaderStyles.backButtonDesktop}
								style={{display: 'flex'}}
								aria-label={t`Expand channel list`}
								onClick={handleRevealChannelList}
								{...getButtonMotion(reducedMotion)}
							>
								<ListIcon className={channelHeaderStyles.backIcon} />
							</motion.button>
						</FocusRing>
					) : null}

					<div className={channelHeaderStyles.leftContentContainer}>
						<div className={channelHeaderStyles.channelInfoContainer}>
							{ChannelUtils.getIcon(channel, {className: channelHeaderStyles.channelIcon})}
							<span className={channelHeaderStyles.channelName}>{channel.name ?? ''}</span>
						</div>
					</div>
				</div>

				<div className={channelHeaderStyles.headerRightSection}>
						{channel && !isMobile && AccessibilityStore.showFavorites && (
							<ChannelHeaderIcon
								icon={FavoriteIcon}
								label={isFavorited ? t`Remove from Favorites` : t`Add to Favorites`}
								isSelected={isFavorited}
								onClick={handleToggleFavorite}
								variant="voice"
							/>
						)}

						<ChannelHeaderIcon
							ref={statsRefs.setReference}
							icon={StatsHeaderIcon}
							label={t`Connection Stats`}
							isSelected={isStatsOpen}
							onClick={statsOnClick}
							aria-expanded={isStatsOpen}
							variant="voice"
							{...statsReferenceProps}
						/>

						<ChannelHeaderIcon
							icon={FullscreenHeaderIcon}
							label={isFullscreen ? t`Exit Fullscreen` : t`Fullscreen`}
							isSelected={isFullscreen}
							onClick={toggleFullscreen}
							variant="voice"
						/>

						{!isMobile && <InboxButton variant="voice" />}
					</div>
				</NativeDragRegion>

			{isMobile && (
				<motion.div
					className={clsx(styles.mobileTopControlDock, styles.voiceChrome)}
					{...getPanelMotion(reducedMotion, 0.06)}
				>
					<VoiceControlBar />
				</motion.div>
			)}

			<motion.div className={clsx(styles.mainContent, hasScreenShare && styles.mainContentHasScreenShare)} {...getPanelMotion(reducedMotion, 0.04)}>
				<AnimatePresence mode="wait" initial={false}>
					<motion.div key={mainContentKey} className={styles.mainContentStage} {...getLayoutMotion(reducedMotion)}>
						{mainContentNode}
					</motion.div>
				</AnimatePresence>
			</motion.div>

			{!isMobile && (
				<motion.div className={clsx(styles.controlBarContainer, styles.voiceChrome)} {...getPanelMotion(reducedMotion, 0.08)}>
					<VoiceControlBar />
				</motion.div>
			)}

			{isStatsOpen &&
				(isMobile ? (
					<BottomSheet
						isOpen={isStatsOpen}
						onClose={() => setIsStatsOpen(false)}
						title={t`Connection Stats`}
						snapPoints={[0, 0.3, 0.65, 0.9, 1]}
					>
						<VoiceStatsOverlay onClose={() => setIsStatsOpen(false)} />
					</BottomSheet>
				) : (
					<FloatingFocusManager context={statsContext} modal={false}>
						<div ref={statsRefs.setFloating} style={{...statsFloatingStyles, zIndex: 30}} {...statsFloatingProps}>
							<VoiceStatsOverlay onClose={() => setIsStatsOpen(false)} />
						</div>
					</FloatingFocusManager>
				))}

		</motion.div>
	);
});

export const VoiceCallView = observer(({channel}: VoiceCallViewProps) => (
	<Sentry.ErrorBoundary fallback={({resetError}) => <VoiceCallCrashFallback channel={channel} onRetry={resetError} />}>
		<VoiceCallViewInner channel={channel} />
	</Sentry.ErrorBoundary>
));
