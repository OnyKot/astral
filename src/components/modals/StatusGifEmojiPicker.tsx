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

import {Trans, useLingui} from '@lingui/react/macro';
import {MagnifyingGlassIcon, SparkleIcon} from '@phosphor-icons/react';
import {clsx} from 'clsx';
import React from 'react';
import {STATUS_GIF_EMOJIS, type StatusGifEmoji} from '~/lib/statusGifEmojis';
import styles from './StatusGifEmojiPicker.module.css';

interface StatusGifEmojiPickerProps {
	selectedValue: string | null;
	onSelect: (emoji: StatusGifEmoji) => void;
	className?: string;
	compact?: boolean;
	disabled?: boolean;
}

const normalizeSearchTerm = (value: string): string => value.trim().toLowerCase().replace(/^:+|:+$/g, '');

export const StatusGifEmojiPicker: React.FC<StatusGifEmojiPickerProps> = ({
	selectedValue,
	onSelect,
	className,
	compact = false,
	disabled = false,
}) => {
	const {t} = useLingui();
	const [searchTerm, setSearchTerm] = React.useState('');

	const filteredEmojis = React.useMemo(() => {
		const normalized = normalizeSearchTerm(searchTerm);
		if (!normalized) {
			return STATUS_GIF_EMOJIS;
		}

		return STATUS_GIF_EMOJIS.filter(
			(emoji) => emoji.id.includes(normalized) || emoji.value.includes(normalized) || emoji.name.includes(normalized),
		);
	}, [searchTerm]);

	return (
		<section
			className={clsx(styles.picker, compact && styles.compact, className)}
			data-sheet-drag-ignore="true"
			aria-label={t`Animated status emoji`}
		>
			<div className={styles.header}>
				<div className={styles.title}>
					<SparkleIcon weight="fill" className={styles.titleIcon} aria-hidden="true" />
					<span>
						<Trans>Animated status emoji</Trans>
					</span>
				</div>
				<span className={styles.count}>{STATUS_GIF_EMOJIS.length}</span>
			</div>
			<div className={styles.search}>
				<MagnifyingGlassIcon weight="bold" className={styles.searchIcon} aria-hidden="true" />
				<input
					value={searchTerm}
					onChange={(event) => setSearchTerm(event.currentTarget.value)}
					placeholder={t`Search animated emoji`}
					disabled={disabled}
					className={styles.searchInput}
					inputMode="search"
				/>
			</div>
			<div className={styles.grid} role="listbox" aria-label={t`Animated status emoji`}>
				{filteredEmojis.length > 0 ? (
					filteredEmojis.map((emoji) => {
						const selected = selectedValue === emoji.value;
						return (
							<button
								key={emoji.value}
								type="button"
								className={clsx(styles.emojiButton, selected && styles.emojiButtonSelected)}
								onClick={() => onSelect(emoji)}
								disabled={disabled}
								role="option"
								aria-selected={selected}
								aria-label={`:${emoji.name}:`}
								title={`:${emoji.name}:`}
							>
								<img
									src={emoji.url}
									alt=""
									className={styles.emojiImage}
									loading="lazy"
									decoding="async"
									draggable={false}
								/>
							</button>
						);
					})
				) : (
					<div className={styles.empty}>
						<Trans>No animated emoji found</Trans>
					</div>
				)}
			</div>
		</section>
	);
};

StatusGifEmojiPicker.displayName = 'StatusGifEmojiPicker';
