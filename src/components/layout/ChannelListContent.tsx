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
import {PlusIcon} from '@phosphor-icons/react';
import {clsx} from 'clsx';
import {AnimatePresence, motion, useReducedMotion, type MotionValue} from 'framer-motion';
import {observer} from 'mobx-react-lite';
import React from 'react';
import * as ContextMenuActionCreators from '~/actions/ContextMenuActionCreators';
import * as DimensionActionCreators from '~/actions/DimensionActionCreators';
import * as GuildActionCreators from '~/actions/GuildActionCreators';
import * as MessageActionCreators from '~/actions/MessageActionCreators';
import * as ModalActionCreators from '~/actions/ModalActionCreators';
import * as ToastActionCreators from '~/actions/ToastActionCreators';
import * as UserGuildSettingsActionCreators from '~/actions/UserGuildSettingsActionCreators';
import {APIErrorCodes, ChannelTypes, isGuildRtcChannelType, MAX_CHANNELS_PER_CATEGORY, Permissions} from '~/Constants';
import {ChannelCreateModal} from '~/components/modals/ChannelCreateModal';
import {ConfirmModal} from '~/components/modals/ConfirmModal';
import {ChannelListContextMenu} from '~/components/uikit/ContextMenu/ChannelListContextMenu';
import type {ScrollerHandle} from '~/components/uikit/Scroller';
import {Scroller} from '~/components/uikit/Scroller';
import {ChannelListScrollbarProvider} from '~/contexts/ChannelListScrollbarContext';
import {HttpError} from '~/lib/HttpError';
import {useLocation} from '~/lib/router';
import type {GuildRecord} from '~/records/GuildRecord';
import ChannelStore from '~/stores/ChannelStore';
import DimensionStore from '~/stores/DimensionStore';
import PermissionStore from '~/stores/PermissionStore';
import ReadStateStore from '~/stores/ReadStateStore';
import UserGuildSettingsStore from '~/stores/UserGuildSettingsStore';
import MediaEngineStore from '~/stores/voice/MediaEngineFacade';
import ChannelListLayoutStore from '~/stores/ChannelListLayoutStore';
import MobileLayoutStore from '~/stores/MobileLayoutStore';
import SelectedChannelStore from '~/stores/SelectedChannelStore';
import {ChannelItem} from './ChannelItem';
import styles from './ChannelListContent.module.css';
import {ChannelDragPreview} from './ChannelDragPreview';
import {CollapsedCategoryVoiceParticipants, CollapsedChannelAvatarStack} from './CollapsedCategoryVoiceParticipants';
import {NullSpaceDropIndicator} from './NullSpaceDropIndicator';
import {ScrollIndicatorOverlay} from './ScrollIndicatorOverlay';
import type {DragItem, DropResult} from './types/dnd';
import {createChannelMoveOperation} from './utils/channelMoveOperation';
import {isTextChannel, organizeChannels} from './utils/channelOrganization';
import {VoiceParticipantsList} from './VoiceParticipantsList';

const DESKTOP_HEADER_SCROLL_DEADZONE_PX = 1;
const MOBILE_HEADER_COLLAPSE_SCROLL_PX = 80;
const MOBILE_HEADER_SCROLL_DEADZONE_PX = 0.75;
const MOBILE_HEADER_FULL_COLLAPSE_SCROLLABLE_MIN_PX = MOBILE_HEADER_COLLAPSE_SCROLL_PX * 2;
const MOBILE_GUILD_CHANNEL_WARM_LIMIT = 36;
const MOBILE_GUILD_CHANNEL_WARM_COUNT = 4;

export const ChannelListContent = observer(({guild, scrollY}: {guild: GuildRecord; scrollY: MotionValue<number>}) => {
	const {t} = useLingui();
	const channels = ChannelStore.getGuildChannels(guild.id);
	const location = useLocation();
	const userGuildSettings = UserGuildSettingsStore.getSettings(guild.id);
	const [isDraggingAnything, setIsDraggingAnything] = React.useState(false);
	const [activeDragItem, setActiveDragItem] = React.useState<DragItem | null>(null);
	const scrollerRef = React.useRef<ScrollerHandle>(null);
	const stickToBottomRef = React.useRef(false);
	const lastHeaderScrollRef = React.useRef(0);
	const mobileHeaderBaselineScrollableRef = React.useRef(0);
	const mobileHeaderCanCollapseRef = React.useRef(true);
	const hasScrollbar = true;

	const connectedChannelId = MediaEngineStore.channelId;
	const canManageChannels = PermissionStore.can(Permissions.MANAGE_CHANNELS, {guildId: guild.id});
	const hideMutedChannels = userGuildSettings?.hide_muted_channels ?? false;
	const sidebarCollapsed = ChannelListLayoutStore.getSidebarCollapsed();
	const compactView = ChannelListLayoutStore.getCompactView();
	const filter = ChannelListLayoutStore.getFilter();
	const showTextChannelsByFilter = filter !== 'voice';
	const showVoiceChannelsByFilter = filter !== 'text';

	const collapsedCategories = React.useMemo(() => {
		const collapsed = new Set<string>();
		if (userGuildSettings?.channel_overrides) {
			for (const [channelId, override] of Object.entries(userGuildSettings.channel_overrides)) {
				if (override.collapsed) collapsed.add(channelId);
			}
		}
		return collapsed;
	}, [userGuildSettings]);

	const toggleCategory = React.useCallback(
		(categoryId: string) => {
			UserGuildSettingsActionCreators.toggleChannelCollapsed(guild.id, categoryId);
		},
		[guild.id],
	);

	const channelGroups = React.useMemo(() => organizeChannels(channels), [channels]);
	const showTrailingDropZone = channelGroups.length > 0 && !sidebarCollapsed;

	// Pre-compute unread counts per group to avoid reduce() inside render loop
	const groupUnreadCounts = React.useMemo(() => {
		const map = new Map<string, number>();
		for (const group of channelGroups) {
			const allChannels = [...group.textChannels, ...group.voiceChannels];
			map.set(group.id, allChannels.reduce((sum, ch) => sum + ReadStateStore.getUnreadCount(ch.id), 0));
		}
		return map;
		// ReadStateStore.version ensures recompute on any read-state change
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [channelGroups, ReadStateStore.version]);
	const channelIndicatorDependencies = React.useMemo(
		() => [channels.length, ReadStateStore.version],
		[channels.length, ReadStateStore.version],
	);
	const isMobile = MobileLayoutStore.isMobileLayout();
	const mobileWarmChannelIds = React.useMemo(() => {
		if (!isMobile) return [];

		const ids: Array<string> = [];
		const seen = new Set<string>();
		const add = (channelId: string | null | undefined) => {
			if (!channelId || seen.has(channelId)) return;
			const channel = ChannelStore.getChannel(channelId);
			if (!channel || channel.guildId !== guild.id || channel.type !== ChannelTypes.GUILD_TEXT) return;
			if (hideMutedChannels && UserGuildSettingsStore.isGuildOrChannelMuted(guild.id, channel.id)) return;
			seen.add(channel.id);
			ids.push(channel.id);
		};

		add(SelectedChannelStore.selectedChannelIds.get(guild.id));

		for (const visit of SelectedChannelStore.recentChannelVisits) {
			if (visit.guildId === guild.id) {
				add(visit.channelId);
			}
			if (ids.length >= MOBILE_GUILD_CHANNEL_WARM_COUNT) break;
		}

		const textChannels = channels
			.filter((channel) => channel.type === ChannelTypes.GUILD_TEXT)
			.sort((a, b) => (a.position ?? 0) - (b.position ?? 0));

		for (const channel of textChannels) {
			add(channel.id);
			if (ids.length >= MOBILE_GUILD_CHANNEL_WARM_COUNT) break;
		}

		return ids.slice(0, MOBILE_GUILD_CHANNEL_WARM_COUNT);
	}, [
		channels,
		guild.id,
		hideMutedChannels,
		isMobile,
		SelectedChannelStore.recentlyVisitedChannels,
		SelectedChannelStore.selectedChannelIds.get(guild.id),
	]);
	const prefersReducedMotion = useReducedMotion();
	const channelRowTransition = React.useMemo(
		() =>
			prefersReducedMotion
				? {duration: 0}
				: {
						duration: 0.2,
						ease: [0.22, 1, 0.36, 1] as const,
					},
		[prefersReducedMotion],
	);

	React.useEffect(() => {
		if (!isMobile || mobileWarmChannelIds.length === 0) return;

		const timers: Array<number> = [];
		mobileWarmChannelIds.forEach((channelId, index) => {
			const timer = window.setTimeout(() => {
				void MessageActionCreators.prefetchMessages(channelId, MOBILE_GUILD_CHANNEL_WARM_LIMIT).catch(() => {});
			}, 90 + index * 140);
			timers.push(timer);
		});

		return () => {
			timers.forEach((timer) => window.clearTimeout(timer));
		};
	}, [isMobile, mobileWarmChannelIds]);

	const syncHeaderScroll = React.useCallback(
		(node: HTMLElement | null) => {
			if (!node) {
				scrollY.set(0);
				return;
			}

			if (isMobile) {
				const maxScrollable = Math.max(0, node.scrollHeight - node.clientHeight);
				const clampedTop = Math.min(Math.max(node.scrollTop, 0), maxScrollable);

				if (clampedTop <= 1) {
					mobileHeaderBaselineScrollableRef.current = maxScrollable;
					mobileHeaderCanCollapseRef.current =
						mobileHeaderBaselineScrollableRef.current >= MOBILE_HEADER_FULL_COLLAPSE_SCROLLABLE_MIN_PX;
				} else {
					mobileHeaderBaselineScrollableRef.current = Math.max(
						mobileHeaderBaselineScrollableRef.current,
						maxScrollable,
					);
					mobileHeaderCanCollapseRef.current =
						mobileHeaderBaselineScrollableRef.current >= MOBILE_HEADER_FULL_COLLAPSE_SCROLLABLE_MIN_PX;
				}

				if (!mobileHeaderCanCollapseRef.current) {
					if (lastHeaderScrollRef.current !== 0) {
						lastHeaderScrollRef.current = 0;
						scrollY.set(0);
					}
					return;
				}

				const nextHeaderScroll = Math.min(MOBILE_HEADER_COLLAPSE_SCROLL_PX, clampedTop);

				if (Math.abs(nextHeaderScroll - lastHeaderScrollRef.current) < MOBILE_HEADER_SCROLL_DEADZONE_PX) {
					return;
				}

				lastHeaderScrollRef.current = nextHeaderScroll;
				scrollY.set(nextHeaderScroll);
				return;
			}

			const maxScrollable = Math.max(0, node.scrollHeight - node.clientHeight);
			const clampedTop = Math.min(Math.max(node.scrollTop, 0), maxScrollable);
			const nextHeaderScroll = clampedTop < 2 ? 0 : clampedTop;
			if (Math.abs(nextHeaderScroll - lastHeaderScrollRef.current) < DESKTOP_HEADER_SCROLL_DEADZONE_PX) {
				return;
			}

			lastHeaderScrollRef.current = nextHeaderScroll;
			scrollY.set(nextHeaderScroll);
		},
		[isMobile, scrollY],
	);

	const getChannelScrollContainer = React.useCallback(
		() => scrollerRef.current?.getScrollerNode() ?? null,
		[scrollerRef],
	);

	const handleChannelDrop = React.useCallback(
		(item: DragItem, result: DropResult) => {
			if (!result) return;
			const guildChannels = ChannelStore.getGuildChannels(guild.id);
			const operation = createChannelMoveOperation({
				channels: guildChannels,
				dragItem: item,
				dropResult: result,
			});
			if (!operation) return;

			void (async () => {
				try {
					await GuildActionCreators.moveChannel(guild.id, operation);
				} catch (error) {
					if (error instanceof HttpError) {
						const body = error.body as {code?: string} | undefined;
						if (body?.code === APIErrorCodes.MAX_CATEGORY_CHANNELS) {
							ModalActionCreators.push(
								ModalActionCreators.modal(() => (
									<ConfirmModal
										title={t`Category full`}
										description={t`This category already contains the maximum of ${MAX_CHANNELS_PER_CATEGORY} channels.`}
										primaryText={t`Understood`}
										onPrimary={() => {}}
									/>
								)),
							);
							return;
						}
					}
					ToastActionCreators.createToast({
						type: 'error',
						children: t`Couldn't move the channel. Try again.`,
					});
				}
			})();
		},
		[guild.id],
	);

	React.useEffect(() => {
		const handleDragStart = () => setIsDraggingAnything(true);
		const handleDragEnd = () => setIsDraggingAnything(false);
		document.addEventListener('dragstart', handleDragStart);
		document.addEventListener('dragend', handleDragEnd);
		return () => {
			document.removeEventListener('dragstart', handleDragStart);
			document.removeEventListener('dragend', handleDragEnd);
			if (scrollDebounceRef.current) {
				clearTimeout(scrollDebounceRef.current);
			}
		};
	}, []);

	const scrollDebounceRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

	const handleScroll = React.useCallback(
		(event: React.UIEvent<HTMLDivElement>) => {
			const scrollTop = event.currentTarget.scrollTop;
			const scrollHeight = event.currentTarget.scrollHeight;
			const offsetHeight = event.currentTarget.offsetHeight;

			stickToBottomRef.current = scrollHeight - (scrollTop + offsetHeight) <= 8;

			syncHeaderScroll(event.currentTarget);

			// Debounce scroll position updates to prevent excessive store writes
			if (scrollDebounceRef.current) {
				clearTimeout(scrollDebounceRef.current);
			}
			scrollDebounceRef.current = setTimeout(() => {
				DimensionActionCreators.updateChannelListScroll(guild.id, scrollTop);
			}, 16);
		},
		[guild.id, syncHeaderScroll],
	);

	const handleResize = React.useCallback(
		(_entry: ResizeObserverEntry, type: 'container' | 'content') => {
			if (type !== 'content') return;

			if (stickToBottomRef.current && scrollerRef.current) {
				scrollerRef.current.scrollToBottom({animate: false});
			}

			syncHeaderScroll(scrollerRef.current?.getScrollerNode() ?? null);
		},
		[syncHeaderScroll],
	);

	React.useEffect(() => {
		lastHeaderScrollRef.current = 0;
		mobileHeaderBaselineScrollableRef.current = 0;
		mobileHeaderCanCollapseRef.current = true;
		scrollY.set(0);
	}, [guild.id, scrollY]);

	React.useEffect(() => {
		const guildDimensions = DimensionStore.getGuildDimensions(guild.id);

		if (guildDimensions.scrollTo) {
			const element = document.querySelector(`[data-channel-id="${guildDimensions.scrollTo}"]`);
			if (element && scrollerRef.current) {
				scrollerRef.current.scrollIntoViewNode({node: element as HTMLElement, shouldScrollToStart: false});
			}
			DimensionActionCreators.clearChannelListScrollTo(guild.id);
		} else if (guildDimensions.scrollTop && guildDimensions.scrollTop > 0 && scrollerRef.current) {
			scrollerRef.current.scrollTo({to: guildDimensions.scrollTop, animate: false});
		}

		syncHeaderScroll(scrollerRef.current?.getScrollerNode() ?? null);
	}, [guild.id, syncHeaderScroll]);

	const handleContextMenu = React.useCallback(
		(event: React.MouseEvent) => {
			ContextMenuActionCreators.openFromEvent(event, ({onClose}) => (
				<ChannelListContextMenu guild={guild} onClose={onClose} />
			));
		},
		[guild],
	);

	const filterOptions = React.useMemo(
		() => [
			{value: 'all' as const, label: t`All`},
			{value: 'text' as const, label: t`Text`},
			{value: 'voice' as const, label: t`Voice`},
		],
		[t],
	);
	const handleCreateChannel = React.useCallback(() => {
		ModalActionCreators.push(ModalActionCreators.modal(() => <ChannelCreateModal guildId={guild.id} />));
	}, [guild.id]);

	const renderChannelRow = React.useCallback(
		(key: string, children: React.ReactNode) => {
			if (isMobile) {
				return (
					<div key={key} className={styles.channelRowMotion}>
						{children}
					</div>
				);
			}

			return (
				<motion.div
					key={key}
					className={styles.channelRowMotion}
					initial={prefersReducedMotion ? false : {opacity: 0, height: 0}}
					animate={{opacity: 1, height: 'auto'}}
					exit={prefersReducedMotion ? {opacity: 0} : {opacity: 0, height: 0}}
					transition={channelRowTransition}
				>
					{children}
				</motion.div>
			);
		},
		[channelRowTransition, isMobile, prefersReducedMotion],
	);

	return (
		<ChannelListScrollbarProvider value={{hasScrollbar}}>
			<div
				className={clsx(
					styles.channelListScrollerWrapper,
					compactView && styles.channelListScrollerWrapperCompact,
					sidebarCollapsed && styles.channelListScrollerWrapperCollapsed,
				)}
			>
				<Scroller
					ref={scrollerRef}
					className={styles.channelListScroller}
					onScroll={handleScroll}
					onResize={handleResize}
					key={guild.id}
				>
					<div className={styles.navigationContainer} onContextMenu={handleContextMenu} role="navigation">
						<div className={clsx(styles.listControls, sidebarCollapsed && styles.listControlsCollapsed)}>
							<div className={styles.listTabs} role="tablist" aria-label={t`Channel filter`}>
								{filterOptions.map((option) => (
									<button
										key={option.value}
										type="button"
										role="tab"
										aria-selected={filter === option.value}
										className={clsx(styles.listTab, filter === option.value && styles.listTabActive)}
										onClick={() => ChannelListLayoutStore.setFilter(option.value)}
									>
										{option.label}
									</button>
								))}
							</div>
							{canManageChannels && (
								<button
									type="button"
									className={styles.listActionButton}
									onClick={handleCreateChannel}
									aria-label={t`Create Channel`}
									title={t`Create Channel`}
								>
									<PlusIcon weight="bold" className={styles.listActionIcon} />
								</button>
							)}
						</div>
						<div className={styles.topDropZone}>
							<NullSpaceDropIndicator
								isDraggingAnything={isDraggingAnything}
								onChannelDrop={handleChannelDrop}
								variant="top"
							/>
						</div>
						<div className={styles.channelGroupsContainer}>
							{channelGroups.map((group) => {
								const isCollapsed = group.category ? collapsedCategories.has(group.category.id) : false;
								const isNullSpace = !group.category;

								const selectedTextChannels = group.textChannels.filter((ch) =>
									location.pathname.startsWith(`/channels/${guild.id}/${ch.id}`),
								);
								const selectedVoiceChannels = group.voiceChannels.filter((ch) =>
									location.pathname.startsWith(`/channels/${guild.id}/${ch.id}`),
								);

								const filteredTextChannels = hideMutedChannels
									? group.textChannels.filter(
											(ch) =>
												selectedTextChannels.some((selected) => selected.id === ch.id) ||
												!UserGuildSettingsStore.isGuildOrChannelMuted(guild.id, ch.id),
										)
									: group.textChannels;

								const filteredVoiceChannels = hideMutedChannels
									? group.voiceChannels.filter(
											(ch) =>
												selectedVoiceChannels.some((selected) => selected.id === ch.id) ||
												ch.id === connectedChannelId ||
												!UserGuildSettingsStore.isGuildOrChannelMuted(guild.id, ch.id),
										)
									: group.voiceChannels;

								const filterScopedTextChannels = showTextChannelsByFilter ? filteredTextChannels : [];
								const filterScopedVoiceChannels = showVoiceChannelsByFilter ? filteredVoiceChannels : [];

								if (isNullSpace && filterScopedTextChannels.length === 0 && filterScopedVoiceChannels.length === 0) {
									return null;
								}

								if (
									hideMutedChannels &&
									group.category &&
									filterScopedTextChannels.length === 0 &&
									filterScopedVoiceChannels.length === 0
								) {
									return null;
								}

								const categoryUnreadCount = groupUnreadCounts.get(group.id) ?? 0;

								const showTextChannels = filterScopedTextChannels.length > 0;
								const showVoiceChannels = filterScopedVoiceChannels.length > 0;
								const categoryIsCollapsed = Boolean(group.category && isCollapsed);
								const showTextChannelRows = showTextChannels && !categoryIsCollapsed;
								const showVoiceChannelRows = showVoiceChannels && (!categoryIsCollapsed || Boolean(connectedChannelId));
								const visibleTextChannelIds = new Set(filterScopedTextChannels.map((ch) => ch.id));
								const visibleVoiceChannelIds = new Set(filterScopedVoiceChannels.map((ch) => ch.id));
								const visibleChannels = group.orderedChannels.filter((ch) => {
									if (isTextChannel(ch)) return showTextChannelRows && visibleTextChannelIds.has(ch.id);
									if (isGuildRtcChannelType(ch.type)) {
										return showVoiceChannelRows && visibleVoiceChannelIds.has(ch.id);
									}
									return false;
								});
								const channelRows = visibleChannels.map((ch) => {
									if (isTextChannel(ch)) {
										return renderChannelRow(
											`channel-row-${ch.id}`,
											<ChannelItem
												guild={guild}
												channel={ch}
												compactView={compactView}
												sidebarCollapsed={sidebarCollapsed}
												isDraggingAnything={isDraggingAnything}
												activeDragItem={activeDragItem}
												onChannelDrop={handleChannelDrop}
												onDragStateChange={setActiveDragItem}
											/>,
										);
									}

									if (categoryIsCollapsed) {
										if (sidebarCollapsed || !connectedChannelId || ch.id !== connectedChannelId) return null;
									}

									const channelRow = (
										<ChannelItem
											guild={guild}
											channel={ch}
											compactView={compactView}
											sidebarCollapsed={sidebarCollapsed}
											isDraggingAnything={isDraggingAnything}
											activeDragItem={activeDragItem}
											onChannelDrop={handleChannelDrop}
											onDragStateChange={setActiveDragItem}
										/>
									);

									if (categoryIsCollapsed && connectedChannelId && ch.id === connectedChannelId && !sidebarCollapsed) {
										return renderChannelRow(
											`channel-row-${ch.id}`,
											<>
												{channelRow}
												<CollapsedChannelAvatarStack guild={guild} channel={ch} />
											</>,
										);
									}

									return renderChannelRow(
										`channel-row-${ch.id}`,
										<>
											{channelRow}
											{!categoryIsCollapsed && !sidebarCollapsed && <VoiceParticipantsList guild={guild} channel={ch} />}
										</>,
									);
								});

								return (
									<div key={group.id} className={styles.channelGroup}>
										{group.category && (
											<ChannelItem
												guild={guild}
												channel={group.category}
												categoryUnreadCount={categoryUnreadCount}
												isCollapsed={isCollapsed}
												onToggle={() => toggleCategory(group.category!.id)}
												compactView={compactView}
												sidebarCollapsed={sidebarCollapsed}
												isDraggingAnything={isDraggingAnything}
												activeDragItem={activeDragItem}
												onChannelDrop={handleChannelDrop}
												onDragStateChange={setActiveDragItem}
											/>
										)}

										{isCollapsed && group.category && !sidebarCollapsed && (
											<CollapsedCategoryVoiceParticipants guild={guild} voiceChannels={filterScopedVoiceChannels} />
										)}

										{isMobile ? <>{channelRows}</> : <AnimatePresence initial={false}>{channelRows}</AnimatePresence>}
									</div>
								);
							})}
						</div>
						{showTrailingDropZone && (
							<div className={styles.bottomDropZone}>
								<NullSpaceDropIndicator
									isDraggingAnything={isDraggingAnything}
									onChannelDrop={handleChannelDrop}
									variant="bottom"
								/>
							</div>
						)}
						<div className={styles.bottomSpacer} />
					</div>
				</Scroller>
				<ScrollIndicatorOverlay
					getScrollContainer={getChannelScrollContainer}
					dependencies={channelIndicatorDependencies}
					label={t`New Messages`}
				/>
				<ChannelDragPreview />
			</div>
		</ChannelListScrollbarProvider>
	);
});
