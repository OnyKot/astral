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
import {
	FilmSlateIcon,
	GifIcon,
	KeyboardIcon,
	MagnifyingGlassIcon,
	SmileyIcon,
	SparkleIcon,
	StickerIcon,
} from '@phosphor-icons/react';
import {clsx} from 'clsx';
import {observer} from 'mobx-react-lite';
import React from 'react';
import * as ExpressionPickerActionCreators from '~/actions/ExpressionPickerActionCreators';
import {MobileEmojiPicker} from '~/components/channel/MobileEmojiPicker';
import {MobileMemesPicker} from '~/components/channel/MobileMemesPicker';
import {MobileStickersPicker} from '~/components/channel/MobileStickersPicker';
import {GifPicker} from '~/components/channel/pickers/gif/GifPicker';
import styles from '~/components/modals/ExpressionPickerSheet.module.css';
import {StatusGifEmojiPicker} from '~/components/modals/StatusGifEmojiPicker';
import {ExpressionPickerHeaderContext, type ExpressionPickerTabType} from '~/components/popouts/ExpressionPickerPopout';
import {BottomSheet} from '~/components/uikit/BottomSheet/BottomSheet';
import {type SegmentedTab, SegmentedTabs} from '~/components/uikit/SegmentedTabs/SegmentedTabs';
import * as StickerSendUtils from '~/lib/StickerSendUtils';
import type {StatusGifEmoji} from '~/lib/statusGifEmojis';
import type {GuildStickerRecord} from '~/records/GuildStickerRecord';
import type {Emoji} from '~/stores/EmojiStore';
import ExpressionPickerStore from '~/stores/ExpressionPickerStore';

interface ExpressionPickerCategoryDescriptor {
	type: ExpressionPickerTabType;
	label: MessageDescriptor;
	shortLabel: MessageDescriptor;
	icon: React.ComponentType<{className?: string; weight?: 'regular' | 'bold' | 'fill'}>;
	renderComponent: (props: {
		channelId?: string;
		onSelect: (emoji: Emoji, shiftKey?: boolean) => void;
		onClose: () => void;
		searchTerm?: string;
		setSearchTerm?: (term: string) => void;
		setHoveredEmoji?: (emoji: Emoji | null) => void;
		searchActive?: boolean;
		onSearchActiveChange?: (active: boolean) => void;
		searchAutoFocusKey?: number;
		onStatusGifEmojiSelect?: (emoji: StatusGifEmoji) => void;
		selectedStatusGifEmojiValue?: string | null;
	}) => React.ReactNode;
}

const EXPRESSION_PICKER_CATEGORY_DESCRIPTORS: Array<ExpressionPickerCategoryDescriptor> = [
	{
		type: 'gifs' as const,
		label: msg`GIFs`,
		shortLabel: msg`GIF`,
		icon: GifIcon,
		renderComponent: ({onClose}) => (
			<div className={styles.pickerContent}>
				<GifPicker onClose={onClose} />
			</div>
		),
	},
	{
		type: 'memes' as const,
		label: msg`Media`,
		shortLabel: msg`Media`,
		icon: FilmSlateIcon,
		renderComponent: ({onClose}) => (
			<div className={styles.pickerContent}>
				<MobileMemesPicker onClose={onClose} />
			</div>
		),
	},
	{
		type: 'stickers' as const,
		label: msg`Stickers`,
		shortLabel: msg`Stickers`,
		icon: StickerIcon,
		renderComponent: ({channelId, onClose}) => {
			const handleStickerSelect = (sticker: GuildStickerRecord, shiftKey?: boolean) => {
				if (channelId) {
					StickerSendUtils.handleStickerSelect(channelId, sticker);
					if (!shiftKey) {
						onClose?.();
					}
				}
			};

			return (
				<div className={styles.pickerContent}>
					<MobileStickersPicker channelId={channelId} handleSelect={handleStickerSelect} />
				</div>
			);
		},
	},
	{
		type: 'emojis' as const,
		label: msg`Emojis`,
		shortLabel: msg`Emoji`,
		icon: SmileyIcon,
		renderComponent: ({channelId, onSelect, searchTerm, setSearchTerm, searchActive, onSearchActiveChange, searchAutoFocusKey}) => (
			<div className={styles.pickerContent}>
				<MobileEmojiPicker
					channelId={channelId}
					handleSelect={onSelect}
					externalSearchTerm={searchTerm}
					externalSetSearchTerm={setSearchTerm}
					searchActive={searchActive}
					onSearchActiveChange={onSearchActiveChange}
					searchAutoFocusKey={searchAutoFocusKey}
				/>
			</div>
		),
	},
	{
		type: 'status-gif-emojis' as const,
		label: msg`Animated status emoji`,
		shortLabel: msg`Animated`,
		icon: SparkleIcon,
		renderComponent: ({onClose, onStatusGifEmojiSelect, selectedStatusGifEmojiValue}) => (
			<div className={styles.pickerContent}>
				<StatusGifEmojiPicker
					selectedValue={selectedStatusGifEmojiValue ?? null}
					onSelect={(emoji) => {
						onStatusGifEmojiSelect?.(emoji);
						onClose();
					}}
					compact
				/>
			</div>
		),
	},
];

const blurActiveEditableElement = () => {
	const activeElement = document.activeElement;
	if (!(activeElement instanceof HTMLElement)) {
		return;
	}

	if (
		activeElement instanceof HTMLInputElement ||
		activeElement instanceof HTMLTextAreaElement ||
		activeElement.isContentEditable
	) {
		activeElement.blur();
	}
};

const REACTION_PICKER_SNAP = 0.56;
const REACTION_PICKER_SNAP_POINTS = [0, REACTION_PICKER_SNAP];

interface ExpressionPickerSheetProps {
	isOpen: boolean;
	onClose: () => void;
	channelId?: string;
	onEmojiSelect: (emoji: Emoji, shiftKey?: boolean) => void;
	closeOnEmojiSelect?: boolean;
	initialSnap?: number | null;
	snapPoints?: Array<number>;
	visibleTabs?: Array<ExpressionPickerTabType>;
	selectedTab?: ExpressionPickerTabType;
	onTabChange?: (tab: ExpressionPickerTabType) => void;
	onStatusGifEmojiSelect?: (emoji: StatusGifEmoji) => void;
	selectedStatusGifEmojiValue?: string | null;
	zIndex?: number;
	keyboardReplacement?: boolean;
	reactionPicker?: boolean;
}

export const ExpressionPickerSheet = observer(
	({
		isOpen,
		onClose,
		channelId,
		onEmojiSelect,
		closeOnEmojiSelect = true,
		initialSnap = 0.25,
		snapPoints = [0, 0.25, 0.5, 0.75, 1],
		visibleTabs = ['gifs', 'memes', 'stickers', 'emojis'],
		selectedTab: controlledSelectedTab,
		onTabChange,
		onStatusGifEmojiSelect,
		selectedStatusGifEmojiValue,
		zIndex,
		keyboardReplacement = false,
		reactionPicker = false,
	}: ExpressionPickerSheetProps) => {
		const {t} = useLingui();
		const categories = React.useMemo(
			() =>
				EXPRESSION_PICKER_CATEGORY_DESCRIPTORS.filter((category) => visibleTabs.includes(category.type)).map(
					(category) => ({
						type: category.type,
						label: t(category.label),
						shortLabel: t(category.shortLabel),
						icon: category.icon,
						renderComponent: category.renderComponent,
					}),
				),
			[visibleTabs, t],
		);

		const [internalSelectedTab, setInternalSelectedTab] = React.useState<ExpressionPickerTabType>(
			() => categories[0]?.type || 'emojis',
		);

		const [emojiSearchTerm, setEmojiSearchTerm] = React.useState('');
		const [emojiSearchMode, setEmojiSearchMode] = React.useState(false);
		const [emojiSearchAutoFocusKey, setEmojiSearchAutoFocusKey] = React.useState(0);
		const [_hoveredEmoji, setHoveredEmoji] = React.useState<Emoji | null>(null);

		const canUseStoreTab = Boolean(!reactionPicker && channelId && ExpressionPickerStore.channelId === channelId);
		const preferredSelectedTab = canUseStoreTab
			? ExpressionPickerStore.selectedTab
			: controlledSelectedTab ?? internalSelectedTab;
		const selectedTab = categories.some((category) => category.type === preferredSelectedTab)
			? preferredSelectedTab
			: categories[0]?.type || 'emojis';

		const setSelectedTab = React.useCallback(
			(tab: ExpressionPickerTabType) => {
				if (!keyboardReplacement) {
					blurActiveEditableElement();
				}

				if (onTabChange) {
					onTabChange(tab);
					return;
				}

				if (canUseStoreTab) {
					ExpressionPickerActionCreators.setTab(tab);
				} else {
					setInternalSelectedTab(tab);
				}
			},
			[canUseStoreTab, keyboardReplacement, onTabChange],
		);

		const selectedCategory = categories.find((category) => category.type === selectedTab) || categories[0];

		React.useEffect(() => {
			if (!isOpen) return;
			if (reactionPicker) return;
			if (channelId && ExpressionPickerStore.channelId !== channelId) {
				ExpressionPickerActionCreators.open(channelId, selectedTab);
			}
		}, [isOpen, channelId, reactionPicker, selectedTab]);

		const handleEmojiSelect = React.useCallback(
			(emoji: Emoji, shiftKey?: boolean) => {
				onEmojiSelect(emoji, shiftKey);
				setEmojiSearchMode(false);
				setEmojiSearchTerm('');
				if (closeOnEmojiSelect && !shiftKey) {
					onClose();
				}
			},
			[closeOnEmojiSelect, onEmojiSelect, onClose],
		);

		const showTabs = categories.length > 1;
		const showEmojiSearchButton = keyboardReplacement && categories.some((category) => category.type === 'emojis');
		const showEmojiSearchHeader = emojiSearchMode && selectedCategory?.type === 'emojis';
		const resolvedSnapPoints = reactionPicker ? REACTION_PICKER_SNAP_POINTS : snapPoints;
		const resolvedInitialSnap = reactionPicker ? REACTION_PICKER_SNAP : initialSnap;
		const shouldAllowSwipeDismiss = reactionPicker && !keyboardReplacement;

		const segmentedTabs: Array<SegmentedTab<ExpressionPickerTabType>> = React.useMemo(
			() =>
				categories.map((category) => ({
					id: category.type,
					label: category.shortLabel,
					ariaLabel: category.label,
					icon: category.icon,
					tone: category.type === 'status-gif-emojis' ? ('animated' as const) : undefined,
				})),
			[categories],
		);

		const [headerPortalElement, setHeaderPortalElement] = React.useState<HTMLDivElement | null>(null);

		const headerPortalCallback = React.useCallback((node: HTMLDivElement | null) => {
			setHeaderPortalElement(node);
		}, []);

		const headerContextValue = React.useMemo(() => ({headerPortalElement}), [headerPortalElement]);

		const headerContent = (
			<>
				<div className={styles.headerControls} data-search-active={showEmojiSearchHeader ? '1' : '0'}>
					{showTabs && !showEmojiSearchHeader ? (
						<div className={styles.headerTabs}>
							<SegmentedTabs
								tabs={segmentedTabs}
								selectedTab={selectedTab}
								onTabChange={setSelectedTab}
								ariaLabel={t`Expression picker categories`}
							/>
						</div>
					) : null}
					{showEmojiSearchButton && !showEmojiSearchHeader ? (
						<button
							type="button"
							className={styles.keyboardButton}
							onClick={() => {
								setSelectedTab('emojis');
								setEmojiSearchMode(true);
								setEmojiSearchAutoFocusKey((key) => key + 1);
							}}
							aria-label={t`Search emojis`}
						>
							<MagnifyingGlassIcon weight="bold" />
						</button>
					) : null}
					{keyboardReplacement && !showEmojiSearchButton && !showEmojiSearchHeader ? (
						<button type="button" className={styles.keyboardButton} onClick={onClose} aria-label={t`Show keyboard`}>
							<KeyboardIcon weight="bold" />
						</button>
					) : null}
				</div>
				<div ref={headerPortalCallback} className={styles.headerPortal} />
			</>
		);

		return (
			<ExpressionPickerHeaderContext.Provider value={headerContextValue}>
				<BottomSheet
					isOpen={isOpen}
					onClose={onClose}
					snapPoints={resolvedSnapPoints}
					initialSnap={resolvedInitialSnap}
					disablePadding={true}
					disableDefaultHeader={true}
					headerSlot={headerContent}
					showCloseButton={false}
					showHandle={shouldAllowSwipeDismiss}
					disableDrag={!shouldAllowSwipeDismiss}
					avoidKeyboard={!keyboardReplacement}
					backdropOpacity={reactionPicker ? 0.48 : 0}
					showBackdrop={true}
					disableBackdropBlur={!reactionPicker}
					animationPreset={keyboardReplacement ? 'keyboard-replacement' : 'default'}
					zIndex={zIndex}
					containerClassName={clsx(
						keyboardReplacement && styles.keyboardReplacementSheet,
						reactionPicker && styles.reactionPickerSheet,
					)}
				>
					<div className={styles.container}>
						<div className={styles.contentContainer}>
							<div className={styles.contentInner}>
								{selectedCategory.renderComponent({
									channelId,
									onSelect: handleEmojiSelect,
									onClose,
									searchTerm: selectedTab === 'emojis' ? emojiSearchTerm : undefined,
									setSearchTerm: selectedTab === 'emojis' ? setEmojiSearchTerm : undefined,
									setHoveredEmoji: selectedTab === 'emojis' ? setHoveredEmoji : undefined,
									searchActive: selectedTab === 'emojis' ? emojiSearchMode : false,
									onSearchActiveChange:
										selectedTab === 'emojis'
											? (active: boolean) => {
													setEmojiSearchMode(active);
													if (!active) {
														setEmojiSearchTerm('');
													}
												}
											: undefined,
									searchAutoFocusKey: emojiSearchAutoFocusKey,
									onStatusGifEmojiSelect,
									selectedStatusGifEmojiValue,
								})}
							</div>
						</div>
					</div>
				</BottomSheet>
			</ExpressionPickerHeaderContext.Provider>
		);
	},
);
