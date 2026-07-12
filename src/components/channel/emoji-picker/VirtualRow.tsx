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

import {CaretDownIcon, ClockIcon, StarIcon} from '@phosphor-icons/react';
import {observer} from 'mobx-react-lite';
import React from 'react';
import * as EmojiPickerActionCreators from '~/actions/EmojiPickerActionCreators';
import styles from '~/components/channel/EmojiPicker.module.css';
import {
	CATEGORY_HEADER_HEIGHT,
	EMOJI_ROW_HEIGHT,
	OVERSCAN_ROWS,
} from '~/components/channel/emoji-picker/EmojiPickerConstants';
import {EmojiRenderer} from '~/components/channel/emoji-picker/EmojiRenderer';
import {GuildIcon} from '~/components/popouts/GuildIcon';
import type {ChannelRecord} from '~/records/ChannelRecord';
import EmojiPickerStore from '~/stores/EmojiPickerStore';
import type {Emoji} from '~/stores/EmojiStore';
import GuildStore from '~/stores/GuildStore';

export type VirtualRow =
	| {type: 'header'; category: string; name: string; guildId?: string; index: number}
	| {type: 'emoji-row'; emojis: Array<Emoji>; index: number; isCustomEmoji?: boolean; guildId?: string};

interface VirtualRowRendererProps {
	row: VirtualRow;
	handleHover: (emoji: Emoji | null, row?: number, column?: number) => void;
	handleSelect: (emoji: Emoji, shiftKey?: boolean) => void;
	skinTone: string;
	spriteSheetSizes: {nonDiversitySize: string; diversitySize: string};
	channel: ChannelRecord | null;
	gridColumns?: number;
	isSelectedRow: boolean;
	selectedColumn: number;
	emojiRowIndex: number;
	shouldScrollSelectedIntoView?: boolean;
	emojiRefs: React.MutableRefObject<Map<string, HTMLButtonElement>>;
}

const INITIAL_VISIBLE_ROWS = OVERSCAN_ROWS * 3;
const visibilityCallbacks = new Map<Element, () => void>();
let sharedRowObserver: IntersectionObserver | null = null;

function observeVirtualRow(node: Element, onVisible: () => void): () => void {
	if (typeof IntersectionObserver === 'undefined') {
		onVisible();
		return () => {};
	}

	if (!sharedRowObserver) {
		sharedRowObserver = new IntersectionObserver(
			(entries) => {
				for (const entry of entries) {
					if (!entry.isIntersecting) {
						continue;
					}

					const callback = visibilityCallbacks.get(entry.target);
					visibilityCallbacks.delete(entry.target);
					sharedRowObserver?.unobserve(entry.target);
					callback?.();
				}
			},
			{
				rootMargin: `${OVERSCAN_ROWS * EMOJI_ROW_HEIGHT}px 0px`,
				threshold: 0,
			},
		);
	}

	visibilityCallbacks.set(node, onVisible);
	sharedRowObserver.observe(node);

	return () => {
		visibilityCallbacks.delete(node);
		sharedRowObserver?.unobserve(node);
	};
}

const VirtualRowRenderer: React.FC<VirtualRowRendererProps> = React.memo(
	({
		row,
		handleHover,
		handleSelect,
		skinTone,
		spriteSheetSizes,
		channel,
		gridColumns = 9,
		isSelectedRow,
		selectedColumn,
		emojiRowIndex,
		shouldScrollSelectedIntoView = false,
		emojiRefs,
	}) => {
		if (row.type === 'header') {
			const isCollapsed = EmojiPickerStore.isCategoryCollapsed(row.category);

			const handleToggleCategory = () => {
				EmojiPickerActionCreators.toggleCategory(row.category);
			};

			let leadingIcon: React.ReactNode = null;
			if (row.category === 'favorites') {
				leadingIcon = <StarIcon weight="fill" className={styles.headerIcon} />;
			} else if (row.category === 'frequently-used') {
				leadingIcon = <ClockIcon weight="fill" className={styles.headerIcon} />;
			} else if (row.guildId) {
				leadingIcon = (
					<div className={styles.headerIcon}>
						<GuildIcon
							id={row.guildId}
							name={row.name}
							icon={GuildStore.getGuild(row.guildId)?.icon ?? null}
							sizePx={16}
						/>
					</div>
				);
			}

			return (
				<button
					type="button"
					onClick={handleToggleCategory}
					className={styles.categoryTitle}
					style={{
						height: `${CATEGORY_HEADER_HEIGHT}px`,
						display: 'flex',
						alignItems: 'center',
						paddingLeft: '12px',
						paddingRight: '12px',
						marginBottom: '8px',
						position: 'sticky',
						top: 0,
						zIndex: 1,
						cursor: 'pointer',
						border: 'none',
						width: '100%',
						textAlign: 'left',
						gap: '8px',
						minWidth: 0,
					}}
				>
					{leadingIcon}
					<div style={{display: 'flex', alignItems: 'center', flex: '1 1 auto', minWidth: 0}}>
						<span
							className={styles.categoryTitle}
							style={{
								minWidth: 0,
								overflow: 'hidden',
								textOverflow: 'ellipsis',
								whiteSpace: 'nowrap',
								flex: '0 1 auto',
							}}
						>
							{row.name}
						</span>
						<CaretDownIcon
							weight="bold"
							className={styles.caretIcon}
							style={{transform: `rotate(${isCollapsed ? -90 : 0}deg)`, marginLeft: '8px'}}
						/>
					</div>
				</button>
			);
		}

		return (
			<div
				style={{
					height: `${EMOJI_ROW_HEIGHT}px`,
					position: 'relative',
				}}
			>
				<div
					className={styles.emojiGrid}
					style={{
						gridTemplateColumns: `repeat(${gridColumns}, minmax(0, 1fr))`,
					}}
				>
					{row.emojis.map((emoji, colIndex) => {
						const isSelected = isSelectedRow && colIndex === selectedColumn;
						const shouldHighlight = isSelected;
						const emojiKey = emoji.id
							? `custom-${emoji.guildId ?? 'global'}-${emoji.id}`
							: `unicode-${emoji.uniqueName ?? emoji.name ?? emoji.surrogates ?? colIndex}`;

						return (
							<EmojiRenderer
								key={emojiKey}
								emoji={emoji}
								handleHover={(e) => handleHover(e, emojiRowIndex, colIndex)}
								handleSelect={handleSelect}
								skinTone={skinTone}
								spriteSheetSizes={spriteSheetSizes}
								channel={channel}
								isHighlighted={shouldHighlight}
								shouldScrollIntoView={isSelected && shouldScrollSelectedIntoView}
								ref={(node) => {
									const key = `${emojiRowIndex}-${colIndex}`;
									if (node) {
										emojiRefs.current.set(key, node);
									} else {
										emojiRefs.current.delete(key);
									}
								}}
							/>
						);
					})}
				</div>
			</div>
		);
	},
);

interface VirtualizedRowProps {
	row: VirtualRow;
	handleHover: (emoji: Emoji | null, row?: number, column?: number) => void;
	handleSelect: (emoji: Emoji, shiftKey?: boolean) => void;
	skinTone: string;
	spriteSheetSizes: {nonDiversitySize: string; diversitySize: string};
	channel: ChannelRecord | null;
	gridColumns?: number;
	isSelectedRow?: boolean;
	selectedColumn: number;
	emojiRowIndex: number;
	shouldScrollSelectedIntoView?: boolean;
	emojiRefs: React.MutableRefObject<Map<string, HTMLButtonElement>>;
}

export const VirtualizedRow: React.FC<VirtualizedRowProps> = observer(
	({
		row,
		handleHover,
		handleSelect,
		skinTone,
		spriteSheetSizes,
		channel,
		gridColumns,
		isSelectedRow = false,
		selectedColumn,
		emojiRowIndex,
		shouldScrollSelectedIntoView = false,
		emojiRefs,
	}) => {
		const shouldRenderImmediately = row.index < INITIAL_VISIBLE_ROWS;
		const [isVisible, setIsVisible] = React.useState(shouldRenderImmediately);
		const placeholderRef = React.useRef<HTMLDivElement>(null);

		React.useEffect(() => {
			if (shouldRenderImmediately) {
				return;
			}

			const placeholder = placeholderRef.current;
			if (!placeholder) return;

			return observeVirtualRow(placeholder, () => setIsVisible(true));
		}, [shouldRenderImmediately]);

		const height = row.type === 'header' ? CATEGORY_HEADER_HEIGHT : EMOJI_ROW_HEIGHT;

		if (!isVisible) {
			return <div ref={placeholderRef} style={{height: `${height}px`}} />;
		}

		return (
			<div ref={placeholderRef}>
				<VirtualRowRenderer
					row={row}
					handleHover={handleHover}
					handleSelect={handleSelect}
					skinTone={skinTone}
					spriteSheetSizes={spriteSheetSizes}
					channel={channel}
					gridColumns={gridColumns}
					isSelectedRow={isSelectedRow}
					selectedColumn={selectedColumn}
					emojiRowIndex={emojiRowIndex}
					shouldScrollSelectedIntoView={shouldScrollSelectedIntoView}
					emojiRefs={emojiRefs}
				/>
			</div>
		);
	},
);
