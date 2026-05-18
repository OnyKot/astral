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

import type {DragEndEvent} from '@dnd-kit/core';
import {DndContext, PointerSensor, useSensor, useSensors} from '@dnd-kit/core';
import {restrictToHorizontalAxis, restrictToVerticalAxis} from '@dnd-kit/modifiers';
import {arrayMove, horizontalListSortingStrategy, SortableContext, verticalListSortingStrategy} from '@dnd-kit/sortable';
import {useLingui} from '@lingui/react/macro';

import {
	ChatCircleDotsIcon,
	CompassIcon,
	CaretDownIcon,
	CaretUpIcon,
	ExclamationMarkIcon,
	FolderIcon,
	GearIcon,
	NotePencilIcon,
	PlanetIcon,
	RobotIcon,
	WaveformIcon,
} from '@phosphor-icons/react';
import {clsx} from 'clsx';
import {observer} from 'mobx-react-lite';
import React from 'react';
import * as DimensionActionCreators from '~/actions/DimensionActionCreators';
import * as ModalActionCreators from '~/actions/ModalActionCreators';
import {modal} from '~/actions/ModalActionCreators';
import * as NavigationActionCreators from '~/actions/NavigationActionCreators';
import * as PremiumModalActionCreators from '~/actions/PremiumModalActionCreators';
import * as UserSettingsActionCreators from '~/actions/UserSettingsActionCreators';
import {ChannelTypes, ME} from '~/Constants';
import {openClaimAccountModal} from '~/components/modals/ClaimAccountModal';
import {UserSettingsModal} from '~/components/modals/UserSettingsModal';
import FocusRing from '~/components/uikit/FocusRing/FocusRing';
import {MentionBadgeAnimated} from '~/components/uikit/MentionBadge';
import {StatusAwareAvatar} from '~/components/uikit/StatusAwareAvatar';
import {Tooltip} from '~/components/uikit/Tooltip/Tooltip';
import {Popout} from '~/components/uikit/Popout/Popout';
import {UserAreaPopout} from '~/components/popouts/UserAreaPopout';
import {VoiceConnectionStatus} from '~/components/voice/VoiceConnectionStatus';
import {ComponentDispatch} from '~/lib/ComponentDispatch';
import {Platform} from '~/lib/Platform';
import {useLocation} from '~/lib/router';
import {Routes} from '~/Routes';
import type {ChannelRecord} from '~/records/ChannelRecord';
import type {GuildRecord} from '~/records/GuildRecord';
import CallStateStore from '~/stores/CallStateStore';
import ChannelStore from '~/stores/ChannelStore';
import DimensionStore from '~/stores/DimensionStore';
import GuildAvailabilityStore from '~/stores/GuildAvailabilityStore';
import GuildDockStore from '~/stores/GuildDockStore';
import GuildListStore from '~/stores/GuildListStore';
import GuildReadStateStore from '~/stores/GuildReadStateStore';
import InitializationStore from '~/stores/InitializationStore';
import MobileLayoutStore from '~/stores/MobileLayoutStore';
import NagbarStore from '~/stores/NagbarStore';
import ReadStateStore from '~/stores/ReadStateStore';
import SelectedChannelStore from '~/stores/SelectedChannelStore';
import ContextMenuStore from '~/stores/ContextMenuStore';
import ModalStore from '~/stores/ModalStore';
import UserSettingsStore from '~/stores/UserSettingsStore';
import UserStore from '~/stores/UserStore';
import MediaEngineStore from '~/stores/voice/MediaEngineFacade';
import ChannelListLayoutStore from '~/stores/ChannelListLayoutStore';
import AccessibilityStore from '~/stores/AccessibilityStore';
import LayoutSizingStore from '~/stores/LayoutSizingStore';
import VoicePanelLayoutStore from '~/stores/VoicePanelLayoutStore';
import {getBestContrastColor, int2hex} from '~/utils/ColorUtils';
import {isNativeMobile} from '~/utils/NativeUtils';
import * as RouterUtils from '~/utils/RouterUtils';
import * as SnowflakeUtils from '~/utils/SnowflakeUtils';
import {useActiveNagbars, useNagbarConditions} from './app-layout/hooks';
import {NagbarContainer} from './app-layout/NagbarContainer';
import {TopNagbarContext} from './app-layout/TopNagbarContext';
import styles from './GuildsLayout.module.css';
import {AddGuildButton} from './guild-list/AddGuildButton';
import {DownloadButton} from './guild-list/DownloadButton';
import {AstralButton} from './guild-list/AstralButton';
import {DMListItem} from './guild-list/GuildListDMItem';
import {GuildListItem} from './guild-list/GuildListItem';
import {HelpButton} from './guild-list/HelpButton';
import {PlutoniumButton} from './guild-list/PlutoniumButton';
import {MobileMentionToast} from './MobileMentionToast';
import {OutlineFrame} from './OutlineFrame';
import {ScrollIndicatorOverlay} from './ScrollIndicatorOverlay';

const isSelectedPath = (pathname: string, path: string) => {
	return pathname === path || pathname.startsWith(`${path}/`);
};

const DM_LIST_REMOVAL_DELAY_MS = 750;
const DESKTOP_DOCK_HIDE_DELAY_MS = 200;

const getUnreadDMChannels = () => {
	const dmChannels = ChannelStore.dmChannels;
	return dmChannels.filter((channel) => ReadStateStore.hasUnread(channel.id));
};

interface GuildFolderRender {
	key: string;
	name: string | null;
	color: number | null;
	guilds: Array<GuildRecord>;
	guildIds: Array<string>;
	mentionCount: number;
	scrollSeverity: 'mention' | 'unread' | undefined;
}

type GuildRenderEntry = {type: 'guild'; guild: GuildRecord} | {type: 'folder'; folder: GuildFolderRender};

interface GuildListProps {
	desktopDockEnabled?: boolean;
	onDockPointerEnter?: () => void;
	onDockPointerLeave?: () => void;
}

const getSelectedGuildIdFromPath = (pathname: string): string | null => {
	if (!Routes.isGuildChannelRoute(pathname)) return null;
	const match = pathname.match(/^\/channels\/([^/]+)/);
	if (!match || !match[1] || match[1].startsWith('@')) return null;
	return match[1];
};

const getSelectedGuildChannelIdFromPath = (pathname: string): string | null => {
	if (!Routes.isGuildChannelRoute(pathname)) return null;
	const match = pathname.match(/^\/channels\/([^/]+)\/([^/]+)/);
	if (!match || !match[1] || !match[2] || match[1].startsWith('@')) return null;
	return match[2];
};

const DesktopUtilityRail = observer(
	({
		onDockPointerEnter,
		onDockPointerLeave,
	}: {
		onDockPointerEnter: () => void;
		onDockPointerLeave: () => void;
	}) => {
		const {t} = useLingui();
		const location = useLocation();
		const currentUser = UserStore.currentUser;
		const currentUserId = currentUser?.id;
		const selectedDMChannelId = SelectedChannelStore.selectedChannelIds.get(ME);
		const directMessagesPath = selectedDMChannelId ? Routes.dmChannel(selectedDMChannelId) : Routes.ME;
		const personalNotesPath = currentUserId ? Routes.dmChannel(currentUserId) : null;

		const hasActiveVoiceConnection = Boolean(
			(MediaEngineStore.connected || MediaEngineStore.connecting) && MediaEngineStore.channelId,
		);
		const shouldShowUserPanel = Boolean(currentUser && hasActiveVoiceConnection && !VoicePanelLayoutStore.collapsedIntoDock);
		const [isUserPanelRendered, setIsUserPanelRendered] = React.useState(shouldShowUserPanel);
		const userPanelHideTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

		const isDirectMessagesSelected = location.pathname.startsWith(Routes.ME);
		const isPersonalNotesSelected = Boolean(personalNotesPath && location.pathname.startsWith(personalNotesPath));
		const isDiscoverySelected = location.pathname === Routes.DISCOVERY || location.pathname.startsWith(`${Routes.DISCOVERY}/`);

		React.useEffect(() => {
			if (userPanelHideTimerRef.current) {
				clearTimeout(userPanelHideTimerRef.current);
				userPanelHideTimerRef.current = null;
			}

			if (shouldShowUserPanel) {
				setIsUserPanelRendered(true);
				return;
			}

			if (!isUserPanelRendered) {
				return;
			}

			userPanelHideTimerRef.current = setTimeout(() => {
				setIsUserPanelRendered(false);
				userPanelHideTimerRef.current = null;
			}, 220);

			return () => {
				if (userPanelHideTimerRef.current) {
					clearTimeout(userPanelHideTimerRef.current);
					userPanelHideTimerRef.current = null;
				}
			};
		}, [isUserPanelRendered, shouldShowUserPanel]);

		React.useEffect(() => {
			VoicePanelLayoutStore.snapToDock();
			const handleResize = () => VoicePanelLayoutStore.snapToDock();
			window.addEventListener('resize', handleResize);
			return () => window.removeEventListener('resize', handleResize);
		}, []);

		const navigateToDirectMessages = React.useCallback(() => {
			NavigationActionCreators.selectChannel(ME, selectedDMChannelId ?? null);
			RouterUtils.transitionTo(directMessagesPath);
		}, [directMessagesPath, selectedDMChannelId]);

		const navigateToPersonalNotes = React.useCallback(() => {
			if (!currentUserId || !personalNotesPath) return;
			NavigationActionCreators.selectChannel(ME, currentUserId);
			RouterUtils.transitionTo(personalNotesPath);
		}, [currentUserId, personalNotesPath]);

		const navigateToDiscovery = React.useCallback(() => {
			NavigationActionCreators.selectChannel(ME, null);
			RouterUtils.transitionTo(Routes.DISCOVERY);
		}, []);

		const handleOpenAIAssistant = React.useCallback(() => {
			ModalActionCreators.push(modal(() => <UserSettingsModal initialTab="chat_settings" initialSubtab="ai" />));
		}, []);

		const handleOpenSettingsFromRail = React.useCallback(() => {
			ModalActionCreators.push(modal(() => <UserSettingsModal />));
		}, []);

		const voicePanelDensity = 'comfortable';
		const getRailWidthPx = React.useCallback(() => {
			if (typeof window === 'undefined') {
				return 68;
			}

			const rootFontSize = Number.parseFloat(window.getComputedStyle(document.documentElement).fontSize || '16');
			return Math.round(rootFontSize * 4.25);
		}, []);
		const dockAnchoredLeftPx =
			typeof window !== 'undefined'
				? getRailWidthPx() + 12
				: VoicePanelLayoutStore.xPx;
		const dockAnchoredBottomPx = 12;
		const previousVoiceConnectionRef = React.useRef(false);

		React.useEffect(() => {
			const wasConnected = previousVoiceConnectionRef.current;
			previousVoiceConnectionRef.current = hasActiveVoiceConnection;

			if (hasActiveVoiceConnection && !wasConnected) {
				VoicePanelLayoutStore.setCollapsedIntoDock(false);
			}
		}, [hasActiveVoiceConnection]);

		React.useEffect(() => {
			if (!hasActiveVoiceConnection) {
				return;
			}

			VoicePanelLayoutStore.widthPx = LayoutSizingStore.sidebarWidthPx;
		}, [hasActiveVoiceConnection, LayoutSizingStore.sidebarWidthPx]);

		return (
			<aside className={styles.desktopUtilityRail} aria-label={t`DM shortcuts`}>
			<div className={styles.desktopUtilityRailTop}>
				<div className={styles.desktopUtilityRailList}>
					<Tooltip position="right" size="large" text={t`Direct Messages`}>
						<FocusRing offset={-2}>
							<button
								type="button"
								className={clsx(
									styles.desktopUtilityRailButton,
									styles.desktopUtilityRailButtonDm,
									isDirectMessagesSelected && styles.desktopUtilityRailButtonSelected,
								)}
								aria-label={t`Direct Messages`}
								aria-pressed={isDirectMessagesSelected}
								onClick={navigateToDirectMessages}
							>
								<ChatCircleDotsIcon
									weight="fill"
									className={clsx(styles.desktopUtilityRailIcon, styles.desktopUtilityRailIconDm)}
								/>
							</button>
						</FocusRing>
					</Tooltip>

					{personalNotesPath && (
						<Tooltip position="right" size="large" text={t`Personal Notes`}>
							<FocusRing offset={-2}>
								<button
									type="button"
									className={clsx(
										styles.desktopUtilityRailButton,
										styles.desktopUtilityRailButtonNotes,
										isPersonalNotesSelected && styles.desktopUtilityRailButtonSelected,
									)}
									aria-label={t`Personal Notes`}
									aria-pressed={isPersonalNotesSelected}
									onClick={navigateToPersonalNotes}
								>
									<NotePencilIcon
										weight="fill"
										className={clsx(styles.desktopUtilityRailIcon, styles.desktopUtilityRailIconNotes)}
									/>
								</button>
							</FocusRing>
						</Tooltip>
					)}

					<Tooltip position="right" size="large" text={t`Discover`}>
						<FocusRing offset={-2}>
							<button
								type="button"
								className={clsx(
									styles.desktopUtilityRailButton,
									styles.desktopUtilityRailButtonDiscover,
									isDiscoverySelected && styles.desktopUtilityRailButtonSelected,
								)}
								aria-label={t`Discover`}
								aria-pressed={isDiscoverySelected}
								onClick={navigateToDiscovery}
							>
								<CompassIcon
									weight="fill"
									className={clsx(styles.desktopUtilityRailIcon, styles.desktopUtilityRailIconDiscover)}
								/>
							</button>
						</FocusRing>
					</Tooltip>

					<Tooltip position="right" size="large" text={t`Plutonium`}>
						<FocusRing offset={-2}>
							<button
								type="button"
								className={clsx(
									styles.desktopUtilityRailButton,
									styles.desktopUtilityRailButtonPlutonium,
									styles.desktopUtilityRailButtonPlutoniumHover,
								)}
								aria-label={t`Plutonium`}
								onClick={() => PremiumModalActionCreators.open()}
							>
								<PlanetIcon
									weight="fill"
									className={clsx(styles.desktopUtilityRailIcon, styles.desktopUtilityRailIconPlutonium)}
								/>
							</button>
						</FocusRing>
					</Tooltip>

					<Tooltip position="right" size="large" text={t`AI Assistant`}>
						<FocusRing offset={-2}>
							<button
								type="button"
								className={clsx(styles.desktopUtilityRailButton, styles.desktopUtilityRailButtonAi)}
								aria-label={t`AI Assistant`}
								onClick={handleOpenAIAssistant}
							>
								<RobotIcon
									weight="fill"
									className={clsx(styles.desktopUtilityRailIcon, styles.desktopUtilityRailIconAi)}
								/>
							</button>
						</FocusRing>
					</Tooltip>

					<Tooltip position="right" size="large" text={t`Settings`}>
						<FocusRing offset={-2}>
							<button
								type="button"
								className={clsx(styles.desktopUtilityRailButton, styles.desktopUtilityRailButtonSettings)}
								aria-label={t`Settings`}
								onClick={handleOpenSettingsFromRail}
							>
								<GearIcon
									weight="fill"
									className={clsx(styles.desktopUtilityRailIcon, styles.desktopUtilityRailIconSettings)}
								/>
							</button>
						</FocusRing>
					</Tooltip>
				</div>
			</div>

			{currentUser && (
				<div className={styles.desktopUtilityRailBottom}>
					{hasActiveVoiceConnection && (
						<Tooltip position="right" size="large" text={VoicePanelLayoutStore.collapsedIntoDock ? t`Open voice panel` : t`Hide voice panel`}>
							<FocusRing offset={-2}>
								<button
									type="button"
									className={clsx(
										styles.desktopUtilityRailVoiceButton,
										!VoicePanelLayoutStore.collapsedIntoDock && styles.desktopUtilityRailVoiceButtonActive,
									)}
									aria-label={VoicePanelLayoutStore.collapsedIntoDock ? t`Open voice panel` : t`Hide voice panel`}
									aria-pressed={!VoicePanelLayoutStore.collapsedIntoDock}
									onClick={() => VoicePanelLayoutStore.toggleCollapsedIntoDock()}
								>
									<WaveformIcon weight="fill" className={styles.desktopUtilityRailVoiceButtonIcon} />
								</button>
							</FocusRing>
						</Tooltip>
					)}
					<Popout
						render={() => <UserAreaPopout />}
						position="right-end"
						offsetMainAxis={10}
						containerClass={styles.desktopUtilityRailProfilePopout}
					>
						<FocusRing offset={-2}>
							<button type="button" className={styles.desktopUtilityRailVoiceHandle} aria-label={t`Profile`}>
								<StatusAwareAvatar user={currentUser} size={36} className={styles.desktopUtilityRailAvatar} />
							</button>
						</FocusRing>
					</Popout>
					{isUserPanelRendered && (
						<div
							className={clsx(
								styles.desktopUtilityRailUserPanel,
								shouldShowUserPanel && styles.desktopUtilityRailUserPanelOpen,
							)}
							data-density={voicePanelDensity}
							onMouseEnter={onDockPointerEnter}
							onMouseLeave={onDockPointerLeave}
							style={
								{
									left: `${dockAnchoredLeftPx}px`,
									bottom: `${dockAnchoredBottomPx}px`,
									width: `${LayoutSizingStore.sidebarWidthPx}px`,
								} as React.CSSProperties
							}
						>
							<div className={styles.desktopUtilityRailUserPanelBody}>
								<VoiceConnectionStatus embedded={true} density={voicePanelDensity} />
							</div>
						</div>
					)}
				</div>
			)}
		</aside>
		);
	},
);

const GuildList = observer(({desktopDockEnabled = false, onDockPointerEnter, onDockPointerLeave}: GuildListProps) => {
	const {t} = useLingui();
	const [isDragging, setIsDragging] = React.useState(false);
	const [openFolderIds, setOpenFolderIds] = React.useState<Set<string>>(new Set());
	const guilds = GuildListStore.guilds;
	const pinnedGuildIds = GuildDockStore.getPinnedGuildIds();
	const pinnedDmChannelIds = GuildDockStore.getPinnedDmChannelIds();
	const guildFolders = UserSettingsStore.getGuildFolders();
	const mobileLayout = MobileLayoutStore;
	const isDesktopDock = desktopDockEnabled && !mobileLayout.enabled;
	const sensors = useSensors(useSensor(PointerSensor, {activationConstraint: {distance: 8}}));
	const unavailableGuilds = GuildAvailabilityStore.unavailableGuilds;
	const unreadDMChannelsRaw = getUnreadDMChannels();
	const unreadDMChannelIds = unreadDMChannelsRaw.map((c) => c.id).join(',');
	const unreadDMChannels = React.useMemo(() => unreadDMChannelsRaw, [unreadDMChannelIds]);
	const scrollRef = React.useRef<HTMLDivElement>(null);
	const dockGuildsScrollRef = React.useRef<HTMLDivElement>(null);
	const location = useLocation();
	const hasUnavailableGuilds = unavailableGuilds.size > 0;
	const unavailableCount = unavailableGuilds.size;
	const showDownloadButton = !isNativeMobile() && !Platform.isElectron && !Platform.isPWA;
	const guildReadVersion = GuildReadStateStore.version;
	const readVersion = ReadStateStore.version;
	const guildFolderDependency = React.useMemo(
		() =>
			guildFolders
				.map((folder, index) => `${folder.id ?? `index-${index}`}:${folder.guildIds.join(',')}`)
				.join('|'),
		[guildFolders],
	);
	const guildIndicatorDependencies = React.useMemo(
		() => [guilds.length, guildReadVersion, readVersion, unreadDMChannelIds, guildFolderDependency],
		[guilds.length, guildReadVersion, readVersion, unreadDMChannelIds, guildFolderDependency],
	);
	const getGuildScrollContainer = React.useCallback(() => scrollRef.current, []);
	const [visibleDMChannels, setVisibleDMChannels] = React.useState(unreadDMChannels);
	const pinnedCallChannel =
		MediaEngineStore.connected && MediaEngineStore.channelId
			? (() => {
					const channel = ChannelStore.getChannel(MediaEngineStore.channelId);
					if (!channel) return null;
					if (channel.type !== ChannelTypes.DM && channel.type !== ChannelTypes.GROUP_DM) return null;
					const hasActiveCall = CallStateStore.hasActiveCall(channel.id);
					if (!hasActiveCall) return null;
					return channel;
				})()
			: null;
	const voiceParticipantSnapshots = MediaEngineStore.participants;
	const isDMCallParticipantSpeaking = React.useCallback(
		(channel: ChannelRecord | null): boolean => {
			if (!channel) return false;
			const participants = Object.values(voiceParticipantSnapshots);
			if (participants.length === 0) return false;

			if (channel.type === ChannelTypes.DM) {
				const recipientId = channel.recipientIds[0];
				if (!recipientId) return false;
				return participants.some((participant) => participant.userId === recipientId && participant.isSpeaking);
			}

			if (channel.type === ChannelTypes.GROUP_DM) {
				const recipientIdSet = new Set(channel.recipientIds);
				return participants.some(
					(participant) => Boolean(participant.userId) && recipientIdSet.has(participant.userId!) && participant.isSpeaking,
				);
			}

			return false;
		},
		[voiceParticipantSnapshots],
	);
	const pinnedCallSpeaking = isDMCallParticipantSpeaking(pinnedCallChannel);
	const pinnedDmChannels = React.useMemo(
		() =>
			pinnedDmChannelIds
				.map((channelId) => ChannelStore.getChannel(channelId))
				.filter((channel): channel is ChannelRecord => {
					if (!channel) return false;
					if (channel.id === pinnedCallChannel?.id) return false;
					return channel.type === ChannelTypes.DM || channel.type === ChannelTypes.GROUP_DM;
				}),
		[pinnedCallChannel?.id, pinnedDmChannelIds],
	);
	const filteredDMChannels = pinnedCallChannel
		? visibleDMChannels.filter((channel) => channel.id !== pinnedCallChannel.id)
		: visibleDMChannels;
	const desktopDockDMChannels = React.useMemo(() => {
		const orderedChannels: Array<ChannelRecord> = [];
		const seen = new Set<string>();
		for (const channel of pinnedDmChannels) {
			if (!seen.has(channel.id)) {
				orderedChannels.push(channel);
				seen.add(channel.id);
			}
		}
		for (const channel of filteredDMChannels) {
			if (!seen.has(channel.id)) {
				orderedChannels.push(channel);
				seen.add(channel.id);
			}
		}
		return orderedChannels;
	}, [filteredDMChannels, pinnedDmChannels]);
	const hasVisibleDMChannels = filteredDMChannels.length > 0 || Boolean(pinnedCallChannel);
	const hasDesktopDockDMChannels = desktopDockDMChannels.length > 0 || Boolean(pinnedCallChannel);
	const shouldCollapseFavoritesSpacing = !hasVisibleDMChannels && !hasUnavailableGuilds;
	const orderedGuilds = React.useMemo(() => {
		if (pinnedGuildIds.length === 0) return guilds;
		const guildById = new Map(guilds.map((guild) => [guild.id, guild]));
		const pinnedGuilds = pinnedGuildIds
			.map((guildId) => guildById.get(guildId))
			.filter((guild): guild is GuildRecord => guild !== undefined);
		const pinnedIdSet = new Set(pinnedGuilds.map((guild) => guild.id));
		const remainingGuilds = guilds.filter((guild) => !pinnedIdSet.has(guild.id));
		return [...pinnedGuilds, ...remainingGuilds];
	}, [guilds, pinnedGuildIds]);
	const shouldShowTopDivider = (orderedGuilds.length > 0 || hasUnavailableGuilds) && !hasVisibleDMChannels;
	const shouldShowEmptyStateDivider = !hasVisibleDMChannels && !hasUnavailableGuilds && orderedGuilds.length === 0;
	const removalTimers = React.useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
	const selectedGuildId = React.useMemo(() => getSelectedGuildIdFromPath(location.pathname), [location.pathname]);
	const selectedGuildIndex = React.useMemo(
		() => (selectedGuildId ? orderedGuilds.findIndex((guild) => guild.id === selectedGuildId) : -1),
		[orderedGuilds, selectedGuildId],
	);
	const guildIndexById = React.useMemo(() => {
		const indexMap = new Map<string, number>();
		for (let index = 0; index < orderedGuilds.length; index++) {
			indexMap.set(orderedGuilds[index].id, index);
		}
		return indexMap;
	}, [orderedGuilds]);

	React.useEffect(() => {
		GuildDockStore.keepOnlyExistingGuilds(new Set(guilds.map((guild) => guild.id)));
	}, [guilds]);

	React.useEffect(() => {
		GuildDockStore.keepOnlyExistingDmChannels(new Set(ChannelStore.dmChannels.map((channel) => channel.id)));
	}, [ChannelStore.dmChannels.length]);

	const guildRenderEntries = React.useMemo<ReadonlyArray<GuildRenderEntry>>(() => {
		const guildById = new Map(orderedGuilds.map((guild) => [guild.id, guild]));
		const folderModels: Array<GuildFolderRender> = [];
		for (let folderIndex = 0; folderIndex < guildFolders.length; folderIndex++) {
			const folder = guildFolders[folderIndex];
			const folderGuilds = folder.guildIds
				.map((guildId) => guildById.get(guildId))
				.filter((guild): guild is GuildRecord => guild !== undefined);

			if (folderGuilds.length < 2) {
				continue;
			}

			folderGuilds.sort((a, b) => (guildIndexById.get(a.id) ?? 0) - (guildIndexById.get(b.id) ?? 0));

			const mentionCount = folderGuilds.reduce(
				(total, guild) => total + GuildReadStateStore.getMentionCount(guild.id),
				0,
			);
			const hasUnread = folderGuilds.some((guild) => GuildReadStateStore.hasUnread(guild.id));

			folderModels.push({
				key: `folder:${folder.id ?? `index-${folderIndex}`}`,
				name: folder.name,
				color: folder.color,
				guilds: folderGuilds,
				guildIds: folderGuilds.map((guild) => guild.id),
				mentionCount,
				scrollSeverity: mentionCount > 0 ? 'mention' : hasUnread ? 'unread' : undefined,
			});
		}

		const folderByGuildId = new Map<string, GuildFolderRender>();
		for (const folder of folderModels) {
			for (const guildId of folder.guildIds) {
				folderByGuildId.set(guildId, folder);
			}
		}

		const renderedFolders = new Set<string>();
		const entries: Array<GuildRenderEntry> = [];
		for (const guild of orderedGuilds) {
			const folder = folderByGuildId.get(guild.id);
			if (!folder) {
				entries.push({type: 'guild', guild});
				continue;
			}

			if (renderedFolders.has(folder.key)) {
				continue;
			}

			renderedFolders.add(folder.key);
			entries.push({type: 'folder', folder});
		}

		return entries;
	}, [orderedGuilds, guildFolders, guildIndexById, guildReadVersion]);

	const hasGuildFolders = React.useMemo(
		() => guildRenderEntries.some((entry) => entry.type === 'folder'),
		[guildRenderEntries],
	);

	React.useEffect(() => {
		const unreadIds = new Set(unreadDMChannels.map((channel) => channel.id));

		setVisibleDMChannels((current) => {
			const leftover = current.filter((channel) => !unreadIds.has(channel.id));

			for (const channel of leftover) {
				if (!removalTimers.current.has(channel.id)) {
					const timer = setTimeout(() => {
						removalTimers.current.delete(channel.id);
						setVisibleDMChannels((latest) => latest.filter((latestChannel) => latestChannel.id !== channel.id));
					}, DM_LIST_REMOVAL_DELAY_MS);
					removalTimers.current.set(channel.id, timer);
				}
			}

			return [...unreadDMChannels, ...leftover];
		});

		for (const channel of unreadDMChannels) {
			const timer = removalTimers.current.get(channel.id);
			if (timer) {
				clearTimeout(timer);
				removalTimers.current.delete(channel.id);
			}
		}
	}, [unreadDMChannels]);

	React.useEffect(() => {
		return () => {
			removalTimers.current.forEach((timer) => clearTimeout(timer));
			removalTimers.current.clear();
		};
	}, []);

	React.useEffect(() => {
		if (!selectedGuildId) return;

		const selectedFolderEntry = guildRenderEntries.find(
			(entry) => entry.type === 'folder' && entry.folder.guildIds.includes(selectedGuildId),
		);
		if (!selectedFolderEntry || selectedFolderEntry.type !== 'folder') return;

		setOpenFolderIds((current) => {
			if (current.has(selectedFolderEntry.folder.key)) {
				return current;
			}
			const next = new Set(current);
			next.add(selectedFolderEntry.folder.key);
			return next;
		});
	}, [guildRenderEntries, selectedGuildId]);

	const renderDMListItems = (channels: Array<ChannelRecord>) =>
		channels.map((channel, index) => {
			const isSelected = isSelectedPath(location.pathname, Routes.dmChannel(channel.id));
			const isLastItem = index === channels.length - 1;

			return (
				<div key={channel.id} className={styles.dmListItemWrapper}>
					<DMListItem
						channel={channel}
						isSelected={isSelected}
						className={isLastItem ? styles.guildListItemNoMargin : undefined}
						isDocked={isDesktopDock}
					/>
				</div>
			);
		});

	const toggleFolder = React.useCallback((folderKey: string) => {
		setOpenFolderIds((current) => {
			const next = new Set(current);
			if (next.has(folderKey)) {
				next.delete(folderKey);
			} else {
				next.add(folderKey);
			}
			return next;
		});
	}, []);

	const handleDragEnd = (event: DragEndEvent) => {
		const {active, over} = event;
		if (over && active.id !== over.id) {
			const oldIndex = orderedGuilds.findIndex((guild) => guild.id === active.id);
			const newIndex = orderedGuilds.findIndex((guild) => guild.id === over.id);
			if (oldIndex < 0 || newIndex < 0) {
				setIsDragging(false);
				return;
			}
			const newArray = arrayMove(orderedGuilds.slice(), oldIndex, newIndex);
			GuildDockStore.reorderPinnedGuilds(newArray.map((guild) => guild.id));
			UserSettingsActionCreators.update({guildPositions: newArray.map((guild) => guild.id)});
		}
		setIsDragging(false);
	};

	const handleScroll = React.useCallback((event: React.UIEvent<HTMLDivElement>) => {
		const scrollTop = event.currentTarget.scrollTop;
		DimensionActionCreators.updateGuildListScroll(scrollTop);
	}, []);

	const handleDockGuildsWheel = React.useCallback((event: React.WheelEvent<HTMLDivElement>) => {
		if (!isDesktopDock) return;
		if (!dockGuildsScrollRef.current) return;
		if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
		event.preventDefault();
		dockGuildsScrollRef.current.scrollLeft += event.deltaY;
	}, [isDesktopDock]);

	React.useEffect(() => {
		const scrollTop = DimensionStore.getGuildListDimensions().scrollTop;
		if (scrollTop > 0 && scrollRef.current) {
			scrollRef.current.scrollTop = scrollTop;
		}
	}, []);

	return (
		<div
			ref={scrollRef}
			className={clsx(styles.guildListScrollContainer, isDesktopDock && styles.guildListScrollContainerDocked)}
			onScroll={handleScroll}
			onMouseEnter={isDesktopDock ? onDockPointerEnter : undefined}
			onMouseLeave={isDesktopDock ? onDockPointerLeave : undefined}
			onContextMenu={isDesktopDock ? onDockPointerEnter : undefined}
		>
			<div className={clsx(styles.guildListContent, isDesktopDock && styles.guildListContentDocked)}>
				<div className={clsx(styles.guildListTopSection, isDesktopDock && styles.guildListTopSectionDocked)}>
					{mobileLayout.enabled && <AstralButton isDocked={isDesktopDock} />}
					{mobileLayout.enabled && (
						<PlutoniumButton
							isDocked={isDesktopDock}
							className={shouldCollapseFavoritesSpacing ? styles.guildListItemNoMargin : undefined}
						/>
					)}

					{!isDesktopDock && (
						<>
							<div className={styles.dmListSection}>
								{pinnedCallChannel && (
									<div className={styles.dmListItemWrapper} key={`pinned-call-${pinnedCallChannel.id}`}>
										<DMListItem
											channel={pinnedCallChannel}
											isSelected={isSelectedPath(location.pathname, Routes.dmChannel(pinnedCallChannel.id))}
											voiceCallActive
											voiceCallSpeaking={pinnedCallSpeaking}
											isDocked={isDesktopDock}
										/>
									</div>
								)}
								{renderDMListItems(filteredDMChannels)}
							</div>

							{hasVisibleDMChannels && <div className={styles.guildDivider} />}
						</>
					)}
				</div>

				<div className={clsx(styles.guildListGuildsSection, isDesktopDock && styles.guildListGuildsSectionDocked)}>
					{hasUnavailableGuilds && (
						<Tooltip
							position="right"
							type={'error'}
							maxWidth="xl"
							size="large"
							text={() =>
								unavailableCount === 1
									? t`${unavailableCount} community is temporarily unavailable due to a flux capacitor malfunction.`
									: t`${unavailableCount} communities are temporarily unavailable due to a flux capacitor malfunction.`
							}
						>
							<div className={styles.unavailableContainer}>
								<div className={styles.unavailableBadge}>
									<ExclamationMarkIcon weight="regular" className={styles.unavailableIcon} />
								</div>
							</div>
						</Tooltip>
					)}

					{!isDesktopDock && shouldShowTopDivider && <div className={styles.guildDivider} />}

					{orderedGuilds.length > 0 && (
						hasGuildFolders && !isDesktopDock ? (
							<div
								className={clsx(isDesktopDock && styles.guildDockGuildsViewport)}
								ref={isDesktopDock ? dockGuildsScrollRef : undefined}
								onWheel={isDesktopDock ? handleDockGuildsWheel : undefined}
							>
								<div className={clsx(styles.guildFolderList, isDesktopDock && styles.guildFolderListDocked)}>
									{guildRenderEntries.map((entry) => {
										if (entry.type === 'guild') {
											const guildIndex = guildIndexById.get(entry.guild.id) ?? 0;
											return (
												<GuildListItem
													key={entry.guild.id}
													isSortingList={false}
													guild={entry.guild}
													isSelected={isSelectedPath(location.pathname, Routes.guildChannel(entry.guild.id))}
													guildIndex={guildIndex}
													selectedGuildIndex={selectedGuildIndex}
													isDocked={isDesktopDock}
												/>
											);
										}

										const {folder} = entry;
										const isOpen = openFolderIds.has(folder.key);
										const folderStyle: React.CSSProperties | undefined =
											folder.color != null
												? {
														backgroundColor: int2hex(folder.color),
														color: getBestContrastColor(folder.color),
													}
												: undefined;
										const folderTitle =
											folder.name && folder.name.trim().length > 0
												? folder.name
												: t`${folder.guilds.length} communities`;

										return (
											<div key={folder.key} className={styles.guildFolderWrapper}>
												<Tooltip position={isDesktopDock ? 'top' : 'right'} size="large" text={folderTitle}>
													<div
														className={styles.guildFolderButton}
														role="button"
														tabIndex={0}
														aria-label={folderTitle}
														aria-expanded={isOpen}
														onClick={() => toggleFolder(folder.key)}
														onKeyDown={(event) => {
															if (event.key === 'Enter' || event.key === ' ') {
																event.preventDefault();
																toggleFolder(folder.key);
															}
														}}
														data-scroll-indicator={folder.scrollSeverity}
														data-scroll-id={`folder-${folder.key}`}
													>
														<div
															className={clsx(
																styles.guildFolderIcon,
																(isOpen || folder.guildIds.includes(selectedGuildId ?? '')) &&
																	styles.guildFolderIconExpanded,
															)}
															style={folderStyle}
														>
															<FolderIcon weight="fill" className={styles.guildFolderGlyph} />
															<CaretDownIcon
																weight="bold"
																className={clsx(styles.guildFolderChevron, isOpen && styles.guildFolderChevronExpanded)}
															/>
														</div>
														{folder.mentionCount > 0 && (
															<div className={clsx(styles.guildBadge, styles.guildBadgeActive)}>
																<MentionBadgeAnimated mentionCount={folder.mentionCount} size="small" />
															</div>
														)}
														{folder.mentionCount === 0 && folder.scrollSeverity === 'unread' && (
															<span className={styles.guildFolderUnreadDot} />
														)}
													</div>
												</Tooltip>
												{isOpen && (
													<div
														className={clsx(
															styles.guildFolderChildren,
															isDesktopDock && styles.guildFolderChildrenDocked,
														)}
													>
														{folder.guilds.map((guild) => {
															const guildIndex = guildIndexById.get(guild.id) ?? 0;
															return (
																<GuildListItem
																	key={guild.id}
																	isSortingList={false}
																	guild={guild}
																	isSelected={isSelectedPath(location.pathname, Routes.guildChannel(guild.id))}
																	guildIndex={guildIndex}
																	selectedGuildIndex={selectedGuildIndex}
																	isDocked={isDesktopDock}
																/>
															);
														})}
													</div>
												)}
											</div>
										);
									})}
								</div>
							</div>
						) : (
							<div
								className={clsx(isDesktopDock && styles.guildDockGuildsViewport)}
								ref={isDesktopDock ? dockGuildsScrollRef : undefined}
								onWheel={isDesktopDock ? handleDockGuildsWheel : undefined}
							>
								<DndContext
									modifiers={[isDesktopDock ? restrictToHorizontalAxis : restrictToVerticalAxis]}
									onDragEnd={handleDragEnd}
									onDragStart={() => setIsDragging(true)}
									sensors={sensors}
								>
									<SortableContext
										disabled={orderedGuilds.length === 1 || mobileLayout.enabled}
										items={orderedGuilds.map((guild) => guild.id)}
										strategy={isDesktopDock ? horizontalListSortingStrategy : verticalListSortingStrategy}
									>
										{orderedGuilds.map((guild, index) => (
											<GuildListItem
												key={guild.id}
												isSortingList={isDragging}
												guild={guild}
												isSelected={isSelectedPath(location.pathname, Routes.guildChannel(guild.id))}
												guildIndex={index}
												selectedGuildIndex={selectedGuildIndex}
												isDocked={isDesktopDock}
											/>
										))}
									</SortableContext>
								</DndContext>
							</div>
						)
					)}

					{isDesktopDock && (
						<>
							{hasDesktopDockDMChannels && <div className={styles.guildDivider} />}
							<div className={clsx(styles.dmListSection, styles.dmListSectionDocked)}>
								{pinnedCallChannel && (
									<div className={styles.dmListItemWrapper} key={`pinned-call-${pinnedCallChannel.id}`}>
										<DMListItem
											channel={pinnedCallChannel}
											isSelected={isSelectedPath(location.pathname, Routes.dmChannel(pinnedCallChannel.id))}
											voiceCallActive
											voiceCallSpeaking={pinnedCallSpeaking}
											isDocked={isDesktopDock}
										/>
									</div>
								)}
								{renderDMListItems(desktopDockDMChannels)}
							</div>
						</>
					)}

					{shouldShowEmptyStateDivider && <div className={styles.guildDivider} />}

					{!isDesktopDock && (
						<>
							<AddGuildButton />
							{showDownloadButton && <DownloadButton />}
							<HelpButton />
						</>
					)}
				</div>

				{isDesktopDock && (
					<div className={styles.guildDockUtilitySection}>
						<div className={styles.guildDivider} />
						<AddGuildButton />
						{showDownloadButton && <DownloadButton />}
						<HelpButton />
					</div>
				)}
			</div>
			<ScrollIndicatorOverlay
				getScrollContainer={getGuildScrollContainer}
				dependencies={guildIndicatorDependencies}
				label={t`New`}
			/>
		</div>
	);
});

export const GuildsLayout = observer(({children}: {children: React.ReactNode}) => {
	const {t} = useLingui();
	const mobileLayout = MobileLayoutStore;
	const [isDesktopDockExpanded, setDesktopDockExpanded] = React.useState(false);
	const [isDesktopDockHovered, setDesktopDockHovered] = React.useState(false);
	const dockHideTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
	const user = UserStore.currentUser;
	const location = useLocation();
	const isDesktopDiscoveryRoute = !mobileLayout.enabled && (
		location.pathname === Routes.DISCOVERY || location.pathname.startsWith(`${Routes.DISCOVERY}/`)
	);
	const isCommunityRoute = getSelectedGuildIdFromPath(location.pathname) !== null;
	const isChannelRoute = Routes.isChannelRoute(location.pathname);
	const isDesktopDockRoute = !mobileLayout.enabled && (isChannelRoute || isDesktopDiscoveryRoute);
	const hasOpenContextMenu = Boolean(ContextMenuStore.contextMenu);
	const hasOpenModal = ModalStore.hasModalOpen();
	const shouldPauseDockInteractions = hasOpenModal;
	const selectedGuildChannelId = getSelectedGuildChannelIdFromPath(location.pathname);
	const selectedGuildChannel = selectedGuildChannelId ? ChannelStore.getChannel(selectedGuildChannelId) : null;
	const isConnectedGuildVoiceCallView = Boolean(
		!mobileLayout.enabled &&
			selectedGuildChannelId &&
			selectedGuildChannel?.type === ChannelTypes.GUILD_VOICE &&
			MediaEngineStore.connected &&
			MediaEngineStore.room &&
			MediaEngineStore.guildId === selectedGuildChannel.guildId &&
			MediaEngineStore.channelId === selectedGuildChannelId,
	);
	const shouldUseDesktopDock = isDesktopDockRoute;
	const shouldPinDesktopDock =
		shouldUseDesktopDock &&
		!mobileLayout.enabled &&
		(AccessibilityStore.dockPanelAlwaysActive || isDesktopDiscoveryRoute);
	const shouldShowDesktopDock =
		shouldUseDesktopDock &&
		(shouldPinDesktopDock ||
			isConnectedGuildVoiceCallView ||
			isDesktopDockExpanded ||
			isDesktopDockHovered ||
			hasOpenContextMenu ||
			shouldPauseDockInteractions);
	const isCommunitySidebarCollapsed = !mobileLayout.enabled && isCommunityRoute && ChannelListLayoutStore.getSidebarCollapsed();
	const isMobileGuildRootRoute =
		Routes.isGuildChannelRoute(location.pathname) && location.pathname.split('/').length === 3;
	const showGuildListOnMobile =
		mobileLayout.enabled &&
		(location.pathname === Routes.DISCOVERY || isMobileGuildRootRoute);

	const showBottomNav = mobileLayout.enabled && Routes.isMobileBottomNavRoute(location.pathname);

	const nagbarConditions = useNagbarConditions();
	const activeNagbars = useActiveNagbars(nagbarConditions);
	const prevNagbarCount = React.useRef(activeNagbars.length);
	const isReady = InitializationStore.isReady;

	React.useEffect(() => {
		if (prevNagbarCount.current !== activeNagbars.length) {
			prevNagbarCount.current = activeNagbars.length;
			ComponentDispatch.dispatch('LAYOUT_RESIZED');
		}
	}, [activeNagbars.length]);

	const THIRTY_MINUTES_MS = 30 * 60 * 1000;
	React.useEffect(() => {
		if (!isReady) return;
		if (!user) return;
		if (NagbarStore.claimAccountModalShownThisSession) return;
		if (user.isClaimed()) return;
		if (location.pathname === Routes.PENDING_VERIFICATION) return;

		const accountAgeMs = SnowflakeUtils.age(user.id);
		if (accountAgeMs < THIRTY_MINUTES_MS) return;

		NagbarStore.markClaimAccountModalShown();
		openClaimAccountModal();
	}, [isReady, user, location.pathname]);

	const shouldShowSidebarDivider = !mobileLayout.enabled;
	const guildChannelSidebarWidth =
		!mobileLayout.enabled && isCommunityRoute
			? isCommunitySidebarCollapsed
				? 0
				: LayoutSizingStore.sidebarWidthPx
			: null;

	React.useEffect(() => {
		if (mobileLayout.enabled) {
			setDesktopDockExpanded(false);
			setDesktopDockHovered(false);
		}
	}, [mobileLayout.enabled]);

	React.useEffect(() => {
		if (!shouldUseDesktopDock) {
			setDesktopDockExpanded(false);
			setDesktopDockHovered(false);
		}
	}, [shouldUseDesktopDock]);

	React.useEffect(
		() => () => {
			if (dockHideTimerRef.current) {
				clearTimeout(dockHideTimerRef.current);
			}
		},
		[],
	);

	const handleDockPointerEnter = React.useCallback(() => {
		if (dockHideTimerRef.current) {
			clearTimeout(dockHideTimerRef.current);
			dockHideTimerRef.current = null;
		}
		setDesktopDockHovered(true);
	}, []);

	const handleDockPointerLeave = React.useCallback(() => {
		if (dockHideTimerRef.current) {
			clearTimeout(dockHideTimerRef.current);
		}
		dockHideTimerRef.current = setTimeout(() => {
			setDesktopDockHovered(false);
			dockHideTimerRef.current = null;
		}, DESKTOP_DOCK_HIDE_DELAY_MS);
	}, []);

	return (
		<div
			className={clsx(
				styles.guildsLayoutContainer,
				!mobileLayout.enabled && styles.guildsLayoutContainerDesktopUtilityRail,
				shouldUseDesktopDock && styles.guildsLayoutContainerDesktopDock,
				shouldShowDesktopDock && styles.guildsLayoutContainerDesktopDockVisible,
				isDesktopDockExpanded && styles.guildsLayoutContainerDesktopDockExpanded,
				isConnectedGuildVoiceCallView && styles.guildsLayoutContainerDesktopDockCallView,
				shouldPinDesktopDock && styles.guildsLayoutContainerDesktopDockPinned,
				isCommunitySidebarCollapsed && styles.guildsLayoutCommunitySidebarCollapsed,
				mobileLayout.enabled && !showGuildListOnMobile && styles.guildsLayoutContainerMobile,
				showBottomNav && styles.guildsLayoutReserveMobileBottomNav,
			)}
			style={
				guildChannelSidebarWidth !== null
					? ({
							'--guild-channel-sidebar-width': `${guildChannelSidebarWidth}px`,
							/*
							 * Keep the guild channel sidebar and voice surfaces on the same
						 * width variable so popouts/pills that read --layout-sidebar-width
						 * do not drift horizontally from the sidebar shell.
						 */
							'--layout-sidebar-width': `${guildChannelSidebarWidth}px`,
							'--layout-voice-connection-height': '0px',
						} as React.CSSProperties)
					: ({
							'--layout-voice-connection-height': '0px',
						} as React.CSSProperties)
			}
		>
			{!mobileLayout.enabled && (
				<DesktopUtilityRail
					onDockPointerEnter={handleDockPointerEnter}
					onDockPointerLeave={handleDockPointerLeave}
				/>
			)}
			{!mobileLayout.enabled && shouldUseDesktopDock && (
				<div
					className={clsx(
						styles.guildDockLayer,
						isDesktopDockExpanded && styles.guildDockLayerExpanded,
						shouldShowDesktopDock && styles.guildDockLayerVisible,
						shouldPauseDockInteractions && styles.guildDockLayerPaused,
					)}
				>
					<button
						type="button"
						className={styles.guildDockToggleButton}
						aria-label={
							isDesktopDockExpanded
								? t`Hide communities dock`
								: t`Show communities dock`
						}
						aria-expanded={isDesktopDockExpanded}
						onClick={() => setDesktopDockExpanded((current) => !current)}
						onMouseEnter={handleDockPointerEnter}
						onMouseLeave={handleDockPointerLeave}
						hidden={isConnectedGuildVoiceCallView || shouldPinDesktopDock}
					>
						<CaretUpIcon
							weight="bold"
							className={clsx(
								styles.guildDockToggleButtonIcon,
								isDesktopDockExpanded && styles.guildDockToggleButtonIconExpanded,
							)}
						/>
					</button>
					<div
						className={styles.guildDockRevealZone}
						aria-hidden
						onMouseEnter={handleDockPointerEnter}
						onMouseLeave={handleDockPointerLeave}
					/>
					<GuildList
						desktopDockEnabled
						onDockPointerEnter={handleDockPointerEnter}
						onDockPointerLeave={handleDockPointerLeave}
					/>
				</div>
			)}
			{!mobileLayout.enabled && !shouldUseDesktopDock && <GuildList />}
			{mobileLayout.enabled && showGuildListOnMobile && <GuildList />}
			<div
				className={clsx(
					styles.contentContainer,
					shouldUseDesktopDock && styles.contentContainerDesktopDock,
					mobileLayout.enabled && !showGuildListOnMobile && styles.contentContainerMobile,
				)}
			>
				<TopNagbarContext.Provider value={activeNagbars.length > 0}>
					<OutlineFrame
						className={styles.outlineFrame}
						sidebarDivider={shouldShowSidebarDivider}
						topBanner={<MobileMentionToast />}
						nagbar={
							activeNagbars.length > 0 ? (
								<div className={styles.nagbarStack}>
									<NagbarContainer nagbars={activeNagbars} />
								</div>
							) : null
						}
					>
						<div className={styles.contentInner}>{children}</div>
					</OutlineFrame>
				</TopNagbarContext.Provider>
			</div>
		</div>
	);
});
