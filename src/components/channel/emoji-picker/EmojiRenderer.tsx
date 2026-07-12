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
import {ClipboardIcon, StarIcon} from '@phosphor-icons/react';
import {clsx} from 'clsx';
import React from 'react';
import * as ContextMenuActionCreators from '~/actions/ContextMenuActionCreators';
import * as EmojiPickerActionCreators from '~/actions/EmojiPickerActionCreators';
import * as PremiumModalActionCreators from '~/actions/PremiumModalActionCreators';
import * as TextCopyActionCreators from '~/actions/TextCopyActionCreators';
import styles from '~/components/channel/EmojiPicker.module.css';
import {EMOJI_SPRITE_SIZE, getEmojiImageUrl, getSpriteSheetBackground} from '~/components/channel/emoji-picker/EmojiPickerConstants';
import {MenuGroup} from '~/components/uikit/ContextMenu/MenuGroup';
import {MenuItem} from '~/components/uikit/ContextMenu/MenuItem';
import {Tooltip} from '~/components/uikit/Tooltip/Tooltip';
import {EMOJI_SPRITES} from '~/lib/UnicodeEmojis';
import type {ChannelRecord} from '~/records/ChannelRecord';
import EmojiStore from '~/stores/EmojiStore';
import EmojiPickerStore from '~/stores/EmojiPickerStore';
import type {Emoji} from '~/stores/EmojiStore';
import * as EmojiUtils from '~/utils/EmojiUtils';
import {checkEmojiAvailability} from '~/utils/ExpressionPermissionUtils';
import {shouldShowPremiumFeatures} from '~/utils/PremiumUtils';

interface EmojiRendererProps {
	emoji: Emoji;
	handleHover: (emoji: Emoji | null) => void;
	handleSelect: (emoji: Emoji, shiftKey?: boolean) => void;
	skinTone: string;
	spriteSheetSizes: {nonDiversitySize: string; diversitySize: string};
	channel: ChannelRecord | null;
	isHighlighted?: boolean;
	shouldScrollIntoView?: boolean;
}

export const EmojiRenderer = React.forwardRef<HTMLButtonElement, EmojiRendererProps>(
	(
		{
			emoji,
			handleHover,
			handleSelect,
			skinTone,
			spriteSheetSizes,
			channel,
			isHighlighted = false,
			shouldScrollIntoView = false,
			...props
		},
		forwardedRef,
	) => {
		const emojiRef = React.useRef<HTMLButtonElement | null>(null);
		const {t, i18n} = useLingui();
		const isFavorite = EmojiPickerStore.isFavorite(emoji);
		const [unicodeImageFailed, setUnicodeImageFailed] = React.useState(false);

		React.useImperativeHandle(forwardedRef, () => emojiRef.current!);

		React.useEffect(() => {
			setUnicodeImageFailed(false);
		}, [emoji.id, emoji.name, emoji.surrogates, skinTone]);

		React.useEffect(() => {
			if (shouldScrollIntoView && emojiRef.current) {
				emojiRef.current.scrollIntoView({block: 'nearest', inline: 'nearest'});
			}
		}, [shouldScrollIntoView]);

		const availability = checkEmojiAvailability(i18n, emoji, channel);
		const isLocked = availability.isLockedByPremium;

		const handleClick = (e: React.MouseEvent) => {
			if (!availability.canUse) {
				e.preventDefault();
				e.stopPropagation();

				if (availability.isLockedByPremium && shouldShowPremiumFeatures()) {
					PremiumModalActionCreators.open();
				}

				return;
			}

			if (e.altKey) {
				e.preventDefault();
				e.stopPropagation();
				EmojiPickerActionCreators.toggleFavorite(emoji);
				return;
			}

			handleSelect(emoji, e.shiftKey);
		};

		const handleContextMenu = (e: React.MouseEvent<HTMLButtonElement>) => {
			e.preventDefault();
			e.stopPropagation();

			ContextMenuActionCreators.openFromEvent(e, (props) => (
				<>
					<MenuGroup>
						<MenuItem
							icon={<StarIcon className={styles.iconSmall} weight={isFavorite ? 'fill' : 'bold'} />}
							onClick={() => {
								EmojiPickerActionCreators.toggleFavorite(emoji);
							}}
						>
							{isFavorite ? t`Unfavorite Emoji` : t`Favorite Emoji`}
						</MenuItem>
						{emoji.id && (
							<MenuItem
								icon={<ClipboardIcon className={styles.iconSmall} />}
								onClick={() => {
									TextCopyActionCreators.copy(i18n, emoji.id!);
									props.onClose();
								}}
							>
								{t`Copy Emoji ID`}
							</MenuItem>
						)}
					</MenuGroup>
				</>
			));
		};

		const handleEmojiImageError = React.useCallback(() => {
			EmojiStore.markEmojiAsUnavailable(emoji);
		}, [emoji]);

		const renderButton = (children: React.ReactNode, locked = false) => {
			const isDisabled = locked || !availability.canUse;
			const className = clsx(
				styles.emojiRenderer,
				isHighlighted && styles.selectedEmojiRenderer,
				isDisabled && 'cursor-not-allowed',
			);

			return (
				<button
					type="button"
					tabIndex={-1}
					ref={emojiRef}
					onMouseEnter={() => handleHover(emoji)}
					onMouseLeave={() => handleHover(null)}
					onClick={handleClick}
					onContextMenu={handleContextMenu}
					className={className}
					aria-disabled={isDisabled}
					aria-selected={isHighlighted}
					role="option"
					{...props}
				>
					{children}
				</button>
			);
		};

		if (emoji.guildId || emoji.id) {
			const emojiUrl = getEmojiImageUrl(emoji, skinTone);
			const content = (
				<img
					src={emojiUrl ?? ''}
					alt={emoji.name}
					className={clsx(styles.emojiImage, isLocked && styles.emojiLocked)}
					loading="eager"
					decoding="async"
					onError={handleEmojiImageError}
				/>
			);

			if (isLocked) {
				return (
					<Tooltip text={availability.lockReason ?? t`Unlock external custom emojis with Plutonium`} position="top">
						{renderButton(content, true)}
					</Tooltip>
				);
			}

			return renderButton(content);
		}

		if (emoji.surrogates) {
			const hasDiversity = emoji.hasDiversity && skinTone;
			const displayEmoji = hasDiversity ? emoji.surrogates + skinTone : emoji.surrogates;
			/*
			 * Apple devices have full system emoji coverage (flags
			 * included), so we keep the cheap native span. Everywhere
			 * else, we serve the same Twemoji <img> the message body and
			 * reaction renderer already use. We deliberately bypass the
			 * sprite-sheet branch below: production caddy currently 404s
			 * on /emoji/spritesheet-emoji.png, which manifested as empty
			 * boxes in the picker and the "letters instead of flags"
			 * symptom in reactions. Individual Twemoji SVGs are tiny and
			 * CDN-cached, so the per-cell network cost is negligible.
			 */
			if (EmojiUtils.shouldUseNativeEmoji || unicodeImageFailed) {
				return renderButton(<span className={styles.nativeEmoji}>{displayEmoji}</span>);
			}

			const twemojiUrl = getEmojiImageUrl(emoji, skinTone);
			if (twemojiUrl) {
				return renderButton(
					<img
						src={twemojiUrl}
						alt={emoji.name}
						className={styles.emojiImage}
						crossOrigin="anonymous"
						loading="eager"
						decoding="async"
						onLoad={(event) => EmojiUtils.applyEmojiVisualNormalization(event.currentTarget)}
						onError={() => setUnicodeImageFailed(true)}
					/>,
				);
			}

			return renderButton(<span className={styles.nativeEmoji}>{displayEmoji}</span>);
		}

		/*
		 * Fallback for legacy entries that don't carry surrogates (e.g.
		 * a managed pack with only `url`). Sprite-sheet path is dead
		 * code now but kept compileable in case the sheet asset returns
		 * later — avoiding it for unicode is the explicit fix.
		 */
		if (!emoji.useSpriteSheet) {
			const emojiUrl = getEmojiImageUrl(emoji, skinTone);
			return renderButton(
				<img
					src={emojiUrl ?? ''}
					alt={emoji.name}
					className={styles.emojiImage}
					loading="eager"
					decoding="async"
					onError={handleEmojiImageError}
				/>,
			);
		}

		const hasDiversity = emoji.hasDiversity && skinTone;
		const index = hasDiversity ? emoji.diversityIndex : emoji.index;

		if (index === undefined) {
			const emojiUrl = getEmojiImageUrl(emoji, skinTone);
			return renderButton(
				<img
					src={emojiUrl ?? ''}
					alt={emoji.name}
					className={styles.emojiImage}
					loading="eager"
					decoding="async"
					onError={handleEmojiImageError}
				/>,
			);
		}

		const perRow = hasDiversity ? EMOJI_SPRITES.DiversityPerRow : EMOJI_SPRITES.NonDiversityPerRow;
		const x = -(index % perRow) * EMOJI_SPRITE_SIZE;
		const y = -Math.floor(index / perRow) * EMOJI_SPRITE_SIZE;

		const spriteStyle = {
			backgroundImage: getSpriteSheetBackground(hasDiversity ? skinTone : ''),
			backgroundPosition: `${x}px ${y}px`,
			backgroundSize: hasDiversity ? spriteSheetSizes.diversitySize : spriteSheetSizes.nonDiversitySize,
		};

		return renderButton(<div className={styles.spriteEmoji} style={spriteStyle} />);
	},
);

EmojiRenderer.displayName = 'EmojiRenderer';
