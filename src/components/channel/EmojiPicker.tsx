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
import {SmileySadIcon} from '@phosphor-icons/react';
import {clsx} from 'clsx';
import {observer} from 'mobx-react-lite';
import React from 'react';
import * as EmojiPickerActionCreators from '~/actions/EmojiPickerActionCreators';
import styles from '~/components/channel/EmojiPicker.module.css';
import {EmojiPickerCategoryList} from '~/components/channel/emoji-picker/EmojiPickerCategoryList';
import {
	EMOJI_SPRITE_SIZE,
	EMOJIS_PER_ROW,
	OVERSCAN_ROWS,
	getEmojiImageUrl,
	preloadEmojiImageUrls,
} from '~/components/channel/emoji-picker/EmojiPickerConstants';
import {EmojiPickerInspector} from '~/components/channel/emoji-picker/EmojiPickerInspector';
import {EmojiPickerSearchBar} from '~/components/channel/emoji-picker/EmojiPickerSearchBar';
import {useEmojiCategories} from '~/components/channel/emoji-picker/hooks/useEmojiCategories';
import {useVirtualRows} from '~/components/channel/emoji-picker/hooks/useVirtualRows';
import {VirtualizedRow} from '~/components/channel/emoji-picker/VirtualRow';
import {PremiumUpsellBanner} from '~/components/channel/PremiumUpsellBanner';
import {ExpressionPickerHeaderContext, ExpressionPickerHeaderPortal} from '~/components/popouts/ExpressionPickerPopout';
import {Scroller, type ScrollerHandle} from '~/components/uikit/Scroller';
import {useForceUpdate} from '~/hooks/useForceUpdate';
import {useSearchInputAutofocus} from '~/hooks/useSearchInputAutofocus';
import {ComponentDispatch} from '~/lib/ComponentDispatch';
import UnicodeEmojis, {EMOJI_SPRITES} from '~/lib/UnicodeEmojis';
import ChannelStore from '~/stores/ChannelStore';
import EmojiStore, {type Emoji, normalizeEmojiSearchQuery} from '~/stores/EmojiStore';
import {checkEmojiAvailability, shouldShowEmojiPremiumUpsell} from '~/utils/ExpressionPermissionUtils';
import {shouldShowPremiumFeatures} from '~/utils/PremiumUtils';

const PICKER_PRELOAD_EMOJI_COUNT = EMOJIS_PER_ROW * (OVERSCAN_ROWS * 3 + 4);

export const EmojiPicker = observer(
	({channelId, handleSelect}: {channelId?: string; handleSelect: (emoji: Emoji, shiftKey?: boolean) => void}) => {
		const headerContext = React.useContext(ExpressionPickerHeaderContext);
		if (!headerContext) {
			throw new Error(
				'EmojiPicker must be rendered inside ExpressionPickerPopout so that the header portal is available.',
			);
		}

		const [searchTerm, setSearchTerm] = React.useState('');
		const [hoveredEmoji, setHoveredEmoji] = React.useState<Emoji | null>(null);
		const [selectedRow, setSelectedRow] = React.useState(-1);
		const [selectedColumn, setSelectedColumn] = React.useState(-1);
		const [shouldScrollOnSelection, setShouldScrollOnSelection] = React.useState(false);
		const [isCompactOnScroll, setIsCompactOnScroll] = React.useState(false);
		const scrollerRef = React.useRef<ScrollerHandle>(null);
		const lastScrollTopRef = React.useRef(0);
		const searchInputRef = React.useRef<HTMLInputElement>(null);
		const emojiRefs = React.useRef<Map<string, HTMLButtonElement>>(new Map());
		const normalizedSearchTerm = React.useMemo(() => normalizeEmojiSearchQuery(searchTerm), [searchTerm]);
		const deferredSearchTerm = React.useDeferredValue(normalizedSearchTerm);

		const {i18n, t} = useLingui();
		const channel = channelId ? (ChannelStore.getChannel(channelId) ?? null) : null;
		const categoryRefs = React.useRef<Map<string, HTMLDivElement>>(new Map());
		const forceUpdate = useForceUpdate();
		const skinTone = EmojiStore.skinTone;
		const hiddenEmojiRevision = EmojiStore.hiddenEmojiRevision;
		const renderedEmojis = React.useMemo(
			() => EmojiStore.search(channel, deferredSearchTerm).slice(),
			[channel, hiddenEmojiRevision, deferredSearchTerm],
		);
		const allEmojis = React.useMemo(() => EmojiStore.search(channel, '').slice(), [channel, hiddenEmojiRevision]);
		const preloadedEmojiUrls = React.useMemo(
			() =>
				renderedEmojis
					.slice(0, PICKER_PRELOAD_EMOJI_COUNT)
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
			if (renderedEmojis.length > 0) {
				setSelectedRow(0);
				setSelectedColumn(0);
			} else {
				setSelectedRow(-1);
				setSelectedColumn(-1);
				setHoveredEmoji(null);
			}
		}, [renderedEmojis]);

		React.useEffect(() => {
			preloadEmojiImageUrls(preloadedEmojiUrls);
		}, [preloadedEmojiUrls]);

		React.useEffect(() => {
			return ComponentDispatch.subscribe('EMOJI_PICKER_RERENDER', forceUpdate);
		}, [forceUpdate]);

		useSearchInputAutofocus(searchInputRef);

		const {favoriteEmojis, frequentlyUsedEmojis, customEmojisByGuildId, unicodeEmojisByCategory} = useEmojiCategories(
			allEmojis,
		);
		const showFrequentlyUsedButton = frequentlyUsedEmojis.length > 0 && !deferredSearchTerm;
		const virtualRows = useVirtualRows(
			deferredSearchTerm,
			renderedEmojis,
			favoriteEmojis,
			frequentlyUsedEmojis,
			customEmojisByGuildId,
			unicodeEmojisByCategory,
		);

		const showPremiumUpsell =
			shouldShowPremiumFeatures() && shouldShowEmojiPremiumUpsell(channel) && !deferredSearchTerm;

		const emojiGridRows = React.useMemo(() => virtualRows.filter((row) => row.type === 'emoji-row'), [virtualRows]);

		const sections = React.useMemo(() => {
			return emojiGridRows.map((row) => row.emojis.length);
		}, [emojiGridRows]);

		const rowsWithEmojiIndex = React.useMemo(() => {
			let emojiRowIndex = -1;
			return virtualRows.map((row, index) => ({
				row,
				emojiRowIndex: row.type === 'emoji-row' ? ++emojiRowIndex : -1,
				needsSpacingAfter: row.type === 'emoji-row' && virtualRows[index + 1]?.type === 'header',
			}));
		}, [virtualRows]);

		const handleCategoryClick = React.useCallback((category: string) => {
			const element = categoryRefs.current.get(category);
			if (element) {
				scrollerRef.current?.scrollIntoViewNode({node: element, shouldScrollToStart: true});
			}
		}, []);

		const handlePickerScroll = React.useCallback((event: React.UIEvent<HTMLDivElement>) => {
			const scrollTop = Math.max(0, event.currentTarget.scrollTop);
			const delta = scrollTop - lastScrollTopRef.current;
			lastScrollTopRef.current = scrollTop;

			if (scrollTop <= 16) {
				setIsCompactOnScroll(false);
				return;
			}
			if (delta > 3) {
				setIsCompactOnScroll(true);
			} else if (delta < -8) {
				setIsCompactOnScroll(false);
			}
		}, []);

		const handleEmojiSelect = React.useCallback(
			(emoji: Emoji, shiftKey?: boolean) => {
				const availability = checkEmojiAvailability(i18n, emoji, channel);
				if (!availability.canUse) {
					return;
				}

				EmojiPickerActionCreators.trackEmojiUsage(emoji);
				handleSelect(emoji, shiftKey);
			},
			[channel, handleSelect, i18n],
		);

		const handleSelectionChange = React.useCallback(
			(row: number, column: number, shouldScroll = false) => {
				if (row < 0 || column < 0) {
					return;
				}
				setSelectedRow((prev) => (prev === row ? prev : row));
				setSelectedColumn((prev) => (prev === column ? prev : column));
				setShouldScrollOnSelection((prev) => (prev === shouldScroll ? prev : shouldScroll));

				const emoji = emojiGridRows[row]?.emojis[column];
				if (emoji) {
					setHoveredEmoji((prev) => (prev === emoji ? prev : emoji));
				}
			},
			[emojiGridRows],
		);

		const handleHover = React.useCallback(
			(emoji: Emoji | null, row?: number, column?: number) => {
				setHoveredEmoji(emoji);
				if (emoji && row !== undefined && column !== undefined) {
					handleSelectionChange(row, column, false);
				}
			},
			[handleSelectionChange],
		);

		React.useEffect(() => {
			if (renderedEmojis.length > 0 && selectedRow === 0 && selectedColumn === 0 && !hoveredEmoji) {
				handleSelectionChange(0, 0, false);
			}
		}, [renderedEmojis, selectedRow, selectedColumn, hoveredEmoji, handleSelectionChange]);

		const handleSelectEmoji = React.useCallback(
			(row: number | null, column: number | null, event?: React.KeyboardEvent) => {
				if (row === null || column === null) {
					return;
				}

				const emoji = emojiGridRows[row]?.emojis[column];
				if (emoji) {
					handleEmojiSelect(emoji, event?.shiftKey);
				}
			},
			[emojiGridRows, handleEmojiSelect],
		);

		return (
			<div className={clsx(styles.container, isCompactOnScroll && styles.containerCompactOnScroll)}>
				<ExpressionPickerHeaderPortal>
					<EmojiPickerSearchBar
						searchTerm={searchTerm}
						setSearchTerm={setSearchTerm}
						hoveredEmoji={hoveredEmoji}
						inputRef={searchInputRef}
						selectedRow={selectedRow}
						selectedColumn={selectedColumn}
						sections={sections}
						onSelect={handleSelectEmoji}
						onSelectionChange={handleSelectionChange}
					/>
				</ExpressionPickerHeaderPortal>
				<div className={styles.emojiPicker}>
					<div className={styles.bodyWrapper}>
						<div className={styles.emojiPickerListWrapper} role="presentation">
							<Scroller
								ref={scrollerRef}
								className={`${styles.list} ${styles.listWrapper}`}
								fade={false}
								key="emoji-picker-scroller"
								reserveScrollbarTrack={true}
								onScroll={handlePickerScroll}
							>
								{showPremiumUpsell && <PremiumUpsellBanner />}
								{rowsWithEmojiIndex.map(({row, emojiRowIndex, needsSpacingAfter}) => {
									const isSelectedRow = row.type === 'emoji-row' && emojiRowIndex === selectedRow;

									return (
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
											style={row.type === 'emoji-row' && needsSpacingAfter ? {marginBottom: '12px'} : undefined}
										>
											<VirtualizedRow
												row={row}
												handleHover={handleHover}
												handleSelect={handleEmojiSelect}
												skinTone={skinTone}
												spriteSheetSizes={spriteSheetSizes}
												channel={channel}
												isSelectedRow={isSelectedRow}
												selectedColumn={isSelectedRow ? selectedColumn : -1}
												emojiRowIndex={emojiRowIndex}
												shouldScrollSelectedIntoView={isSelectedRow && shouldScrollOnSelection}
												emojiRefs={emojiRefs}
											/>
										</div>
									);
								})}
							</Scroller>
							{renderedEmojis.length === 0 && (
								<div className={styles.emptyState}>
									<div className={styles.emptyStateInner}>
										<div className={styles.emptyIcon}>
											<SmileySadIcon weight="duotone" />
										</div>
										<div className={styles.emptyLabel}>{t`No emojis match your search`}</div>
									</div>
								</div>
							)}
						</div>
					</div>
					<EmojiPickerInspector hoveredEmoji={hoveredEmoji} />
				</div>
				<EmojiPickerCategoryList
					customEmojisByGuildId={customEmojisByGuildId}
					unicodeEmojisByCategory={unicodeEmojisByCategory}
					handleCategoryClick={handleCategoryClick}
					showFrequentlyUsedButton={showFrequentlyUsedButton}
				/>
			</div>
		);
	},
);
