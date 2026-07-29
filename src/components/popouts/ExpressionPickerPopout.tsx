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

import {msg} from '@lingui/core/macro';
import {useLingui} from '@lingui/react/macro';
import {clsx} from 'clsx';
import {observer} from 'mobx-react-lite';
import React from 'react';
import ReactDOM from 'react-dom';
import * as ExpressionPickerActionCreators from '~/actions/ExpressionPickerActionCreators';
import {EmojiPicker} from '~/components/channel/EmojiPicker';
import {GifPicker} from '~/components/channel/pickers/gif/GifPicker';
import {MemesPicker} from '~/components/channel/pickers/memes/MemesPicker';
import {StickersPicker} from '~/components/channel/StickersPicker';
import {StatusGifEmojiPicker} from '~/components/modals/StatusGifEmojiPicker';
import * as StickerSendUtils from '~/lib/StickerSendUtils';
import type {StatusGifEmoji} from '~/lib/statusGifEmojis';
import type {Emoji} from '~/stores/EmojiStore';
import ExpressionPickerStore from '~/stores/ExpressionPickerStore';
import styles from './ExpressionPickerPopout.module.css';

interface ExpressionPickerHeaderContextType {
	headerPortalElement: HTMLDivElement | null;
}

export const ExpressionPickerHeaderContext = React.createContext<ExpressionPickerHeaderContextType | null>(null);

export const useExpressionPickerHeaderPortal = () => {
	return React.useContext(ExpressionPickerHeaderContext);
};

export const ExpressionPickerHeaderPortal = ({children}: {children: React.ReactNode}) => {
	const context = useExpressionPickerHeaderPortal();
	if (!context?.headerPortalElement) {
		return null;
	}
	return ReactDOM.createPortal(children, context.headerPortalElement);
};

export type ExpressionPickerTabType = 'gifs' | 'memes' | 'stickers' | 'emojis' | 'status-gif-emojis';

interface ExpressionPickerCategory {
	type: ExpressionPickerTabType;
	label: string;
	renderComponent: (props: {
		channelId?: string;
		onSelect: (emoji: Emoji, shiftKey?: boolean) => void;
		onClose?: () => void;
		onStatusGifEmojiSelect?: (emoji: StatusGifEmoji) => void;
		selectedStatusGifEmojiValue?: string | null;
	}) => React.ReactNode;
}

const createAllCategories = (i18n: ReturnType<typeof useLingui>['i18n']): Array<ExpressionPickerCategory> => [
	{
		type: 'gifs' as const,
		label: i18n._(msg`GIFs`),
		renderComponent: ({onClose}) => <GifPicker onClose={onClose} />,
	},
	{
		type: 'memes' as const,
		label: i18n._(msg`Media`),
		renderComponent: ({onClose}) => <MemesPicker onClose={onClose} />,
	},
	{
		type: 'stickers' as const,
		label: i18n._(msg`Stickers`),
		renderComponent: ({channelId, onClose}) => {
			const handleStickerSelect = (sticker: any, shiftKey?: boolean) => {
				if (channelId) {
					StickerSendUtils.handleStickerSelect(channelId, sticker);
					if (onClose && !shiftKey) {
						onClose();
					}
				}
			};

			return <StickersPicker channelId={channelId} handleSelect={handleStickerSelect} />;
		},
	},
	{
		type: 'emojis' as const,
		label: i18n._(msg`Emojis`),
		renderComponent: ({channelId, onSelect}) => <EmojiPicker channelId={channelId} handleSelect={onSelect} />,
	},
	{
		type: 'status-gif-emojis' as const,
		label: i18n._(msg`Animated`),
		renderComponent: ({onClose, onStatusGifEmojiSelect, selectedStatusGifEmojiValue}) => (
			<StatusGifEmojiPicker
				selectedValue={selectedStatusGifEmojiValue ?? null}
				onSelect={(emoji) => {
					onStatusGifEmojiSelect?.(emoji);
					onClose?.();
				}}
				compact
			/>
		),
	},
];

interface ExpressionPickerPopoutProps {
	channelId?: string;
	onEmojiSelect: (emoji: Emoji, shiftKey?: boolean) => void;
	onClose?: () => void;
	closeOnEmojiSelect?: boolean;
	visibleTabs?: Array<ExpressionPickerTabType>;
	selectedTab?: ExpressionPickerTabType;
	onTabChange?: (tab: ExpressionPickerTabType) => void;
	onStatusGifEmojiSelect?: (emoji: StatusGifEmoji) => void;
	selectedStatusGifEmojiValue?: string | null;
}

export const ExpressionPickerPopout = observer(
	({
		channelId,
		onEmojiSelect,
		onClose,
		closeOnEmojiSelect = true,
		visibleTabs = ['gifs', 'memes', 'stickers', 'emojis'],
		selectedTab: controlledSelectedTab,
		onTabChange,
		onStatusGifEmojiSelect,
		selectedStatusGifEmojiValue,
	}: ExpressionPickerPopoutProps) => {
		const {t, i18n} = useLingui();

		const categories = React.useMemo(() => {
			const all = createAllCategories(i18n);
			return all.filter((category) => visibleTabs.includes(category.type));
		}, [i18n, visibleTabs]);

		const [internalSelectedTab, setInternalSelectedTab] = React.useState<ExpressionPickerTabType>(
			() => categories[0]?.type || 'emojis',
		);

		const canUseStoreTab = Boolean(channelId && ExpressionPickerStore.channelId === channelId);
		const preferredSelectedTab = canUseStoreTab
			? ExpressionPickerStore.selectedTab
			: controlledSelectedTab ?? internalSelectedTab;
		const selectedTab = categories.some((category) => category.type === preferredSelectedTab)
			? preferredSelectedTab
			: categories[0]?.type || 'emojis';

		const setSelectedTab = React.useCallback(
			(tab: ExpressionPickerTabType) => {
				if (tab === selectedTab) {
					return;
				}

				if (onTabChange) {
					onTabChange(tab);
					return;
				}

				if (canUseStoreTab && channelId) {
					ExpressionPickerActionCreators.toggle(channelId, tab);
				} else {
					setInternalSelectedTab(tab);
				}
			},
			[canUseStoreTab, channelId, onTabChange, selectedTab],
		);

		const selectedCategory = categories.find((category) => category.type === selectedTab) || categories[0];
		const containerRef = React.useRef<HTMLDivElement>(null);

		React.useEffect(() => {
			if (containerRef.current) {
				const firstInput = containerRef.current.querySelector('input[type="text"]') as HTMLInputElement | null;
				if (firstInput) {
					firstInput.focus();
				}
			}
		}, []);

		const handleEmojiSelect = React.useCallback(
			(emoji: Emoji, shiftKey?: boolean) => {
				onEmojiSelect(emoji, shiftKey);
				if (closeOnEmojiSelect && onClose && !shiftKey) {
					onClose();
				}
			},
			[closeOnEmojiSelect, onEmojiSelect, onClose],
		);

		const showTabs = categories.length > 1;
		const [headerPortalElement, setHeaderPortalElement] = React.useState<HTMLDivElement | null>(null);

		const headerPortalCallback = React.useCallback((node: HTMLDivElement | null) => {
			setHeaderPortalElement(node);
		}, []);

		const headerContextValue = React.useMemo(() => ({headerPortalElement}), [headerPortalElement]);

		return (
			<ExpressionPickerHeaderContext.Provider value={headerContextValue}>
				<div
					ref={containerRef}
					className={clsx(styles.container, showTabs ? styles.containerWithTabs : styles.containerNoTabs)}
				>
					<div className={styles.header}>
						{showTabs && (
							<nav className={styles.nav}>
								<div className={styles.tabList} role="tablist" aria-label={t`Expression picker categories`}>
									{categories.map((category) => (
										<button
											key={category.type}
											id={category.type}
											role="tab"
											type="button"
											aria-selected={selectedTab === category.type}
											className={clsx(
												styles.tab,
												selectedTab === category.type ? styles.tabActive : styles.tabInactive,
											)}
											onClick={() => setSelectedTab(category.type)}
										>
											{category.label}
										</button>
									))}
								</div>
							</nav>
						)}
						<div ref={headerPortalCallback} className={styles.headerPortal} />
					</div>
					<div className={styles.content}>
						{selectedCategory.renderComponent({
							channelId,
							onSelect: handleEmojiSelect,
							onClose,
							onStatusGifEmojiSelect,
							selectedStatusGifEmojiValue,
						})}
					</div>
				</div>
			</ExpressionPickerHeaderContext.Provider>
		);
	},
);
