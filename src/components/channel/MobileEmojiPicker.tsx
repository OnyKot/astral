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

import {clsx} from 'clsx';
import {CaretDownIcon, CaretUpIcon} from '@phosphor-icons/react';
import {observer} from 'mobx-react-lite';
import React from 'react';
import {EmojiPickerCategoryList} from '~/components/channel/emoji-picker/EmojiPickerCategoryList';
import {
	EMOJI_SPRITE_SIZE,
	OVERSCAN_ROWS,
	getEmojiImageUrl,
	preloadEmojiImageUrls,
} from '~/components/channel/emoji-picker/EmojiPickerConstants';
import {EmojiPickerSearchBar} from '~/components/channel/emoji-picker/EmojiPickerSearchBar';
import {useEmojiCategories} from '~/components/channel/emoji-picker/hooks/useEmojiCategories';
import {useVirtualRows} from '~/components/channel/emoji-picker/hooks/useVirtualRows';
import {VirtualizedRow} from '~/components/channel/emoji-picker/VirtualRow';
import mobileStyles from '~/components/channel/MobileEmojiPicker.module.css';
import {
	ExpressionPickerHeaderPortal,
	useExpressionPickerHeaderPortal,
} from '~/components/popouts/ExpressionPickerPopout';
import {Scroller, type ScrollerHandle} from '~/components/uikit/Scroller';
import {useForceUpdate} from '~/hooks/useForceUpdate';
import {ComponentDispatch} from '~/lib/ComponentDispatch';
import UnicodeEmojis, {EMOJI_SPRITES} from '~/lib/UnicodeEmojis';
import ChannelStore from '~/stores/ChannelStore';
import EmojiStore, {type Emoji, normalizeEmojiSearchQuery} from '~/stores/EmojiStore';

const MOBILE_EMOJIS_PER_ROW = 8;
const MOBILE_PICKER_PRELOAD_EMOJI_COUNT = MOBILE_EMOJIS_PER_ROW * (OVERSCAN_ROWS + 4);

export const MobileEmojiPicker = observer(
	({
		channelId,
		handleSelect,
		externalSearchTerm,
		externalSetSearchTerm,
		hideSearchBar = false,
		searchActive,
		onSearchActiveChange,
		searchAutoFocusKey = 0,
	}: {
		channelId?: string;
		handleSelect: (emoji: Emoji, shiftKey?: boolean) => void;
		externalSearchTerm?: string;
		externalSetSearchTerm?: (term: string) => void;
		hideSearchBar?: boolean;
		searchActive?: boolean;
		onSearchActiveChange?: (active: boolean) => void;
		searchAutoFocusKey?: number;
	}) => {
		const headerPortalContext = useExpressionPickerHeaderPortal();
		const hasPortal = Boolean(headerPortalContext?.headerPortalElement);

		const [internalSearchTerm, setInternalSearchTerm] = React.useState('');
		const [hoveredEmoji, setHoveredEmoji] = React.useState<Emoji | null>(null);
		const supportsHover = React.useMemo(
			() => typeof window !== 'undefined' && window.matchMedia('(hover: hover) and (pointer: fine)').matches,
			[],
		);
		const [isSearchFocused, setIsSearchFocused] = React.useState(false);
		const [fastScrollDirection, setFastScrollDirection] = React.useState<-1 | 0 | 1>(0);
		const scrollerRef = React.useRef<ScrollerHandle>(null);
		const emojiRefs = React.useRef<Map<string, HTMLButtonElement>>(new Map());
		const searchInputRef = React.useRef<HTMLInputElement>(null);
		const searchContainerRef = React.useRef<HTMLDivElement | null>(null);
		const fastScrollFrameRef = React.useRef<number | null>(null);
		const fastScrollDirectionRef = React.useRef<-1 | 0 | 1>(0);
		const fastScrollVelocityRef = React.useRef(0);

		const channel = channelId ? (ChannelStore.getChannel(channelId) ?? null) : null;
		const categoryRefs = React.useRef<Map<string, HTMLDivElement>>(new Map());
		const forceUpdate = useForceUpdate();
		const skinTone = EmojiStore.skinTone;
		const hiddenEmojiRevision = EmojiStore.hiddenEmojiRevision;

		const searchTerm = externalSearchTerm ?? internalSearchTerm;
		const setSearchTerm = externalSetSearchTerm ?? setInternalSearchTerm;
		const isSearchVisible = searchActive ?? (isSearchFocused || Boolean(searchTerm));
		const normalizedSearchTerm = React.useMemo(() => normalizeEmojiSearchQuery(searchTerm), [searchTerm]);
		const deferredSearchTerm = React.useDeferredValue(normalizedSearchTerm);
		const renderedEmojis = React.useMemo(
			() => EmojiStore.search(channel, deferredSearchTerm).slice(),
			[channel, hiddenEmojiRevision, deferredSearchTerm],
		);
		const allEmojis = React.useMemo(() => EmojiStore.search(channel, '').slice(), [channel, hiddenEmojiRevision]);
		const preloadedEmojiUrls = React.useMemo(
			() =>
				renderedEmojis
					.slice(0, MOBILE_PICKER_PRELOAD_EMOJI_COUNT)
					.map((emoji) => getEmojiImageUrl(emoji, skinTone))
					.filter(Boolean),
			[renderedEmojis, skinTone],
		);

		const spriteSheetSizes = React.useMemo(() => {
			const nonDiversitySize = [
				`${EMOJI_SPRITE_SIZE * EMOJI_SPRITES.NonDiversityPerRow}px`,
				`${EMOJI_SPRITE_SIZE * Math.ceil(UnicodeEmojis.numNonDiversitySprites / EMOJI_SPRITES.NonDiversityPerRow)}px`,
			].join(' ');

			const diversitySize = [
				`${EMOJI_SPRITE_SIZE * EMOJI_SPRITES.DiversityPerRow}px`,
				`${EMOJI_SPRITE_SIZE * Math.ceil(UnicodeEmojis.numDiversitySprites / EMOJI_SPRITES.DiversityPerRow)}px`,
			].join(' ');

			return {nonDiversitySize, diversitySize};
		}, []);

		React.useEffect(() => {
			return ComponentDispatch.subscribe('EMOJI_PICKER_RERENDER', forceUpdate);
		}, [forceUpdate]);

		React.useEffect(() => {
			preloadEmojiImageUrls(preloadedEmojiUrls);
		}, [preloadedEmojiUrls]);

		const {customEmojisByGuildId, unicodeEmojisByCategory, favoriteEmojis, frequentlyUsedEmojis} =
			useEmojiCategories(allEmojis);
		const showFrequentlyUsedButton = frequentlyUsedEmojis.length > 0 && !deferredSearchTerm;
		const virtualRows = useVirtualRows(
			deferredSearchTerm,
			renderedEmojis,
			favoriteEmojis,
			frequentlyUsedEmojis,
			customEmojisByGuildId,
			unicodeEmojisByCategory,
			MOBILE_EMOJIS_PER_ROW,
		);

		const rowsWithEmojiIndex = React.useMemo(() => {
			let emojiRowIndex = -1;
			return virtualRows.map((row) => ({
				row,
				emojiRowIndex: row.type === 'emoji-row' ? ++emojiRowIndex : -1,
			}));
		}, [virtualRows]);

		const handleCategoryClick = React.useCallback((category: string) => {
			const element = categoryRefs.current.get(category);
			if (element) {
				scrollerRef.current?.scrollIntoViewNode({node: element, shouldScrollToStart: true});
			}
		}, []);

		const handleHover = React.useCallback((emoji: Emoji | null) => {
			if (supportsHover) {
				setHoveredEmoji(emoji);
			}
		}, [supportsHover]);

		const handleSearchFocusChange = React.useCallback((focused: boolean) => {
			setIsSearchFocused(focused);
			onSearchActiveChange?.(focused);
		}, [onSearchActiveChange]);

		const stopFastScroll = React.useCallback(() => {
			fastScrollDirectionRef.current = 0;
			fastScrollVelocityRef.current = 0;
			setFastScrollDirection(0);

			if (fastScrollFrameRef.current != null) {
				cancelAnimationFrame(fastScrollFrameRef.current);
				fastScrollFrameRef.current = null;
			}
		}, []);

		const runFastScrollLoop = React.useCallback(() => {
			const scrollerNode = scrollerRef.current?.getScrollerNode();
			if (!scrollerNode) {
				stopFastScroll();
				return;
			}

			const direction = fastScrollDirectionRef.current;
			if (direction === 0) {
				stopFastScroll();
				return;
			}

			const maxScroll = Math.max(0, scrollerNode.scrollHeight - scrollerNode.clientHeight);
			if (maxScroll <= 0) {
				stopFastScroll();
				return;
			}

			const currentTop = scrollerNode.scrollTop;
			const nextTop = Math.max(0, Math.min(maxScroll, currentTop + direction * fastScrollVelocityRef.current));
			scrollerNode.scrollTop = nextTop;

			const reachedEdge = (direction < 0 && nextTop <= 0) || (direction > 0 && nextTop >= maxScroll);
			if (reachedEdge) {
				stopFastScroll();
				return;
			}

			fastScrollVelocityRef.current = Math.min(90, fastScrollVelocityRef.current * 1.08 + 0.8);
			fastScrollFrameRef.current = requestAnimationFrame(runFastScrollLoop);
		}, [stopFastScroll]);

		const startFastScroll = React.useCallback(
			(direction: -1 | 1) => (event: React.PointerEvent<HTMLButtonElement> | React.MouseEvent<HTMLButtonElement>) => {
				if (isSearchFocused) {
					return;
				}

				event.preventDefault();
				event.stopPropagation();
				stopFastScroll();
				fastScrollDirectionRef.current = direction;
				fastScrollVelocityRef.current = 18;
				setFastScrollDirection(direction);
				fastScrollFrameRef.current = requestAnimationFrame(runFastScrollLoop);
			},
			[isSearchFocused, runFastScrollLoop, stopFastScroll],
		);

		React.useEffect(() => {
			return () => {
				stopFastScroll();
			};
		}, [stopFastScroll]);

		React.useEffect(() => {
			if (!isSearchVisible) {
				return;
			}

			const handleOutsidePointerDown = (event: PointerEvent) => {
				const targetNode = event.target as Node | null;
				if (!targetNode) {
					return;
				}

				if (searchContainerRef.current?.contains(targetNode)) {
					return;
				}

				searchInputRef.current?.blur();
				setIsSearchFocused(false);
				onSearchActiveChange?.(false);
			};

			document.addEventListener('pointerdown', handleOutsidePointerDown, true);
			return () => {
				document.removeEventListener('pointerdown', handleOutsidePointerDown, true);
			};
		}, [isSearchVisible, onSearchActiveChange]);

		React.useEffect(() => {
			if (!searchActive || hideSearchBar) {
				return;
			}
			requestAnimationFrame(() => searchInputRef.current?.focus());
		}, [hideSearchBar, searchActive, searchAutoFocusKey]);

		const searchBar = !hideSearchBar && isSearchVisible ? (
			<div
				ref={searchContainerRef}
				className={clsx(mobileStyles.searchBarWrapper, isSearchFocused && mobileStyles.searchBarWrapperFocused)}
			>
				<EmojiPickerSearchBar
					searchTerm={searchTerm}
					setSearchTerm={setSearchTerm}
					hoveredEmoji={hoveredEmoji}
					inputRef={searchInputRef}
					onSearchFocusChange={handleSearchFocusChange}
					compact={true}
					showSkinToneSelector={false}
				/>
			</div>
		) : null;

		return (
			<div className={mobileStyles.container}>
				{hasPortal && searchBar ? <ExpressionPickerHeaderPortal>{searchBar}</ExpressionPickerHeaderPortal> : null}
				<div
					className={clsx(mobileStyles.mobileEmojiPicker, isSearchVisible && mobileStyles.mobileEmojiPickerSearchActive)}
					data-search-focused={isSearchVisible ? '1' : '0'}
				>
					{!hasPortal && searchBar}
					<div className={mobileStyles.bodyWrapper}>
						<div className={mobileStyles.emojiPickerListWrapper} role="presentation">
							<Scroller
								ref={scrollerRef}
								className={`${mobileStyles.list} ${mobileStyles.listWrapper}`}
								key="mobile-emoji-picker-scroller"
							>
								{rowsWithEmojiIndex.map(({row, emojiRowIndex}) => (
									<div
										key={`${row.type}-${row.index}`}
										ref={
											row.type === 'header'
												? (el) => {
														if (el && 'category' in row) {
															categoryRefs.current.set(row.category, el);
														}
													}
												: undefined
										}
									>
										<VirtualizedRow
											row={row}
											handleHover={handleHover}
											handleSelect={handleSelect}
											skinTone={skinTone}
											spriteSheetSizes={spriteSheetSizes}
											channel={channel}
											gridColumns={MOBILE_EMOJIS_PER_ROW}
											isSelectedRow={false}
											selectedColumn={-1}
											emojiRowIndex={emojiRowIndex}
											emojiRefs={emojiRefs}
										/>
									</div>
								))}
							</Scroller>
						</div>
						<div className={mobileStyles.fastScrollControls}>
							<button
								type="button"
								className={clsx(
									mobileStyles.fastScrollButton,
									fastScrollDirection < 0 && mobileStyles.fastScrollButtonActive,
								)}
								onPointerDown={startFastScroll(-1)}
								onMouseDown={startFastScroll(-1)}
								onPointerUp={stopFastScroll}
								onPointerCancel={stopFastScroll}
								onPointerLeave={stopFastScroll}
								onMouseUp={stopFastScroll}
								onMouseLeave={stopFastScroll}
								aria-label="Fast scroll up"
							>
								<CaretUpIcon className={mobileStyles.fastScrollIcon} />
							</button>
							<button
								type="button"
								className={clsx(
									mobileStyles.fastScrollButton,
									fastScrollDirection > 0 && mobileStyles.fastScrollButtonActive,
								)}
								onPointerDown={startFastScroll(1)}
								onMouseDown={startFastScroll(1)}
								onPointerUp={stopFastScroll}
								onPointerCancel={stopFastScroll}
								onPointerLeave={stopFastScroll}
								onMouseUp={stopFastScroll}
								onMouseLeave={stopFastScroll}
								aria-label="Fast scroll down"
							>
								<CaretDownIcon className={mobileStyles.fastScrollIcon} />
							</button>
						</div>
					</div>
					<div
							className={clsx(
								mobileStyles.categoryListBottom,
								isSearchVisible && mobileStyles.categoryListBottomSearchActive,
							)}
					>
						<EmojiPickerCategoryList
							customEmojisByGuildId={customEmojisByGuildId}
							unicodeEmojisByCategory={unicodeEmojisByCategory}
							handleCategoryClick={handleCategoryClick}
							horizontal={true}
							showFrequentlyUsedButton={showFrequentlyUsedButton}
						/>
					</div>
				</div>
			</div>
		);
	},
);
