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
import {ClockIcon} from '@phosphor-icons/react';
import {clsx} from 'clsx';
import {observer} from 'mobx-react-lite';
import styles from '~/components/channel/EmojiPicker.module.css';
import {GuildIcon} from '~/components/popouts/GuildIcon';
import {Tooltip} from '~/components/uikit/Tooltip/Tooltip';
import UnicodeEmojis from '~/lib/UnicodeEmojis';
import type {Emoji} from '~/stores/EmojiStore';
import GuildStore from '~/stores/GuildStore';

const MOBILE_UNICODE_CATEGORY_ORDER = ['people', 'nature', 'food', 'activity', 'travel', 'objects'];

interface EmojiPickerCategoryListProps {
	customEmojisByGuildId: Map<string, Array<Emoji>>;
	unicodeEmojisByCategory: Map<string, Array<Emoji>>;
	handleCategoryClick: (category: string) => void;
	showFrequentlyUsedButton: boolean;
	horizontal?: boolean;
}

export const EmojiPickerCategoryList = observer(
	({
		customEmojisByGuildId,
		unicodeEmojisByCategory,
		handleCategoryClick,
		showFrequentlyUsedButton = false,
		horizontal = false,
	}: EmojiPickerCategoryListProps) => {
		const {i18n} = useLingui();
		const orderedUnicodeCategories = [
			...MOBILE_UNICODE_CATEGORY_ORDER.filter((category) => unicodeEmojisByCategory.has(category)),
			...Array.from(unicodeEmojisByCategory.keys()).filter((category) => !MOBILE_UNICODE_CATEGORY_ORDER.includes(category)),
		];

		if (horizontal) {
			return (
				<div className={styles.horizontalCategories}>
					{showFrequentlyUsedButton && (
						<button
							type="button"
							onClick={() => handleCategoryClick('frequently-used')}
							className={clsx(styles.categoryChip, styles.textPrimaryMuted)}
							aria-label={i18n._('Frequently Used')}
						>
							<ClockIcon className={styles.categoryChipIcon} />
							<span className={styles.categoryChipLabel}>{i18n._('Recent')}</span>
						</button>
					)}
					{Array.from(customEmojisByGuildId.keys()).map((guildId) => {
						const guild = GuildStore.getGuild(guildId)!;
						return (
							<button
								key={guild.id}
								type="button"
								onClick={() => handleCategoryClick(guild.id)}
								className={clsx(styles.categoryChip, styles.categoryChipGuild, styles.textPrimaryMuted)}
								aria-label={guild.name}
							>
								<GuildIcon
									id={guild.id}
									name={guild.name}
									icon={guild.icon}
									className={styles.categoryChipIcon}
									sizePx={18}
								/>
							</button>
						);
					})}
					{orderedUnicodeCategories.map((category) => {
						const Icon = UnicodeEmojis.getCategoryIcon(category);
						return (
							<button
								key={category}
								type="button"
								onClick={() => handleCategoryClick(category)}
								className={clsx(styles.categoryChip, styles.textPrimaryMuted)}
								aria-label={UnicodeEmojis.getCategoryLabel(category, i18n)}
							>
								<Icon className={styles.categoryChipIcon} />
								<span className={styles.categoryChipLabel}>{UnicodeEmojis.getCategoryLabel(category, i18n)}</span>
							</button>
						);
					})}
				</div>
			);
		}

		return (
			<div className={styles.categoryList}>
				<div className={styles.categoryListScroll}>
					<div className={styles.listItems}>
						{showFrequentlyUsedButton && (
							<Tooltip text={i18n._('Frequently Used')} position="left">
								<button
									type="button"
									onClick={() => handleCategoryClick('frequently-used')}
									className={clsx(styles.categoryListIcon, styles.textPrimaryMuted)}
								>
									<ClockIcon className={styles.iconSize} />
								</button>
							</Tooltip>
						)}
						{Array.from(customEmojisByGuildId.keys()).map((guildId) => {
							const guild = GuildStore.getGuild(guildId)!;
							return (
								<Tooltip key={guild.id} text={guild.name} position="left">
									<button
										type="button"
										onClick={() => handleCategoryClick(guild.id)}
										className={clsx(styles.categoryListIcon, styles.textPrimaryMuted)}
									>
										<GuildIcon
											id={guild.id}
											name={guild.name}
											icon={guild.icon}
											className={styles.iconSize}
											sizePx={24}
										/>
									</button>
								</Tooltip>
							);
						})}
						{Array.from(unicodeEmojisByCategory.keys()).map((category) => {
							const Icon = UnicodeEmojis.getCategoryIcon(category);
							return (
								<Tooltip key={category} text={UnicodeEmojis.getCategoryLabel(category, i18n)} position="left">
									<button
										type="button"
										onClick={() => handleCategoryClick(category)}
										className={clsx(styles.categoryListIcon, styles.textPrimaryMuted)}
									>
										<Icon className={styles.iconSize} />
									</button>
								</Tooltip>
							);
						})}
					</div>
				</div>
			</div>
		);
	},
);
