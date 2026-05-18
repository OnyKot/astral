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
import {observer} from 'mobx-react-lite';
import type {MotionValue} from 'motion';
import React from 'react';
import * as ContextMenuActionCreators from '~/actions/ContextMenuActionCreators';
import * as DimensionActionCreators from '~/actions/DimensionActionCreators';
import * as GuildActionCreators from '~/actions/GuildActionCreators';
import * as ModalActionCreators from '~/actions/ModalActionCreators';
import * as ToastActionCreators from '~/actions/ToastActionCreators';
import * as UserGuildSettingsActionCreators from '~/actions/UserGuildSettingsActionCreators';
import {APIErrorCodes, ChannelTypes, MAX_CHANNELS_PER_CATEGORY, Permissions} from '~/Constants';
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
import {ChannelItem} from './ChannelItem';
import styles from './ChannelListContent.module.css';
import {CollapsedCategoryVoiceParticipants, CollapsedChannelAvatarStack} from './CollapsedCategoryVoiceParticipants';
import {NullSpaceDropIndicator} from './NullSpaceDropIndicator';
import {ScrollIndicatorOverlay} from './ScrollIndicatorOverlay';
import type {DragItem, DropResult} from './types/dnd';
import {createChannelMoveOperation} from './utils/channelMoveOperation';
import {isTextChannel, organizeChannels} from './utils/channelOrganization';
import {VoiceParticipantsList} from './VoiceParticipantsList';

export const ChannelListContent = observer(({guild, scrollY}: {guild: GuildRecord; scrollY: MotionValue<number>}) => {
	const {t} = useLingui();
	const channels = ChannelStore.getGuildChannels(guild.id);
	const location = useLocation();
	const userGuildSettings = UserGuildSettingsStore.getSettings(guild.id);
	const [isDraggingAnything, setIsDraggingAnything] = React.useState(false);
	const [activeDragItem, setActiveDragItem] = React.useState<DragItem | null>(null);
	const scrollerRef = React.useRef<ScrollerHandle>(null);
	const stickToBottomRef = React.useRef(false);
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
	const channelIndicatorDependencies = React.useMemo(
		() => [channels.length, ReadStateStore.version],
		[channels.length, ReadStateStore.version],
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
		};
	}, []);

	const handleScroll = React.useCallback(
		(event: React.UIEvent<HTMLDivElement>) => {
			const scrollTop = event.currentTarget.scrollTop;
			const scrollHeight = event.currentTarget.scrollHeight;
			const offsetHeight = event.currentTarget.offsetHeight;

			stickToBottomRef.current = scrollHeight - (scrollTop + offsetHeight) <= 8;

			scrollY.set(scrollTop);
			DimensionActionCreators.updateChannelListScroll(guild.id, scrollTop);
		},
		[scrollY, guild.id],
	);

	const handleResize = React.useCallback((_entry: ResizeObserverEntry, type: 'container' | 'content') => {
		if (type !== 'content') return;

		if (stickToBottomRef.current && scrollerRef.current) {
			scrollerRef.current.scrollToBottom({animate: false});
		}
	}, []);

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
	}, [guild.id]);

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

								const categoryUnreadChannels = [
									...(showTextChannelsByFilter ? group.textChannels : []),
									...(showVoiceChannelsByFilter ? group.voiceChannels : []),
								];
								const categoryUnreadCount = categoryUnreadChannels.reduce(
									(total, groupChannel) => total + ReadStateStore.getUnreadCount(groupChannel.id),
									0,
								);

								const showTextChannels = filterScopedTextChannels.length > 0;
								const showVoiceChannels = filterScopedVoiceChannels.length > 0;
								const categoryIsCollapsed = Boolean(group.category && isCollapsed);
								const showTextChannelRows = showTextChannels && !categoryIsCollapsed;
								const showVoiceChannelRows = showVoiceChannels && (!categoryIsCollapsed || Boolean(connectedChannelId));
								const visibleTextChannelIds = new Set(filterScopedTextChannels.map((ch) => ch.id));
								const visibleVoiceChannelIds = new Set(filterScopedVoiceChannels.map((ch) => ch.id));
								const visibleChannels = group.orderedChannels.filter((ch) => {
									if (isTextChannel(ch)) return showTextChannelRows && visibleTextChannelIds.has(ch.id);
									if (ch.type === ChannelTypes.GUILD_VOICE) {
										return showVoiceChannelRows && visibleVoiceChannelIds.has(ch.id);
									}
									return false;
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

										{visibleChannels.map((ch) => {
											if (isTextChannel(ch)) {
												return (
													<ChannelItem
														key={ch.id}
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
											}

											if (categoryIsCollapsed) {
												if (sidebarCollapsed || !connectedChannelId || ch.id !== connectedChannelId) return null;
											}

											const channelRow = (
												<ChannelItem
													key={ch.id}
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
												return (
													<React.Fragment key={ch.id}>
														{channelRow}
														<CollapsedChannelAvatarStack guild={guild} channel={ch} />
													</React.Fragment>
												);
											}

											return (
												<React.Fragment key={ch.id}>
													{channelRow}
													{!categoryIsCollapsed && !sidebarCollapsed && <VoiceParticipantsList guild={guild} channel={ch} />}
												</React.Fragment>
											);
										})}
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
			</div>
		</ChannelListScrollbarProvider>
	);
});
