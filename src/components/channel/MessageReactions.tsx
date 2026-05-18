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

import {SmileyIcon} from '@phosphor-icons/react';
import {clsx} from 'clsx';
import {AnimatePresence, motion} from 'framer-motion';
import {observer} from 'mobx-react-lite';
import React, {useEffect} from 'react';
import * as ModalActionCreators from '~/actions/ModalActionCreators';
import {modal} from '~/actions/ModalActionCreators';
import * as ReactionActionCreators from '~/actions/ReactionActionCreators';
import {ReactionInteractionDisabledModal} from '~/components/alerts/ReactionInteractionDisabledModal';
import {EmojiInfoBottomSheet} from '~/components/bottomsheets/EmojiInfoBottomSheet';
import styles from '~/components/channel/MessageReactions.module.css';
import {createMessageActionHandlers, useMessagePermissions} from '~/components/channel/messageActionUtils';
import {LongPressable} from '~/components/LongPressable';
import {EmojiPickerPopout} from '~/components/popouts/EmojiPickerPopout';
import UnicodeEmojis from '~/lib/UnicodeEmojis';
import {ReactionTooltip} from '~/components/popouts/ReactionTooltip';
import FocusRing from '~/components/uikit/FocusRing/FocusRing';
import {Popout} from '~/components/uikit/Popout/Popout';
import {useHover} from '~/hooks/useHover';
import type {MessageReaction, MessageRecord} from '~/records/MessageRecord';
import KeyboardModeStore from '~/stores/KeyboardModeStore';
import MobileLayoutStore from '~/stores/MobileLayoutStore';
import {getEmojiName, getReactionKey, useEmojiURL} from '~/utils/ReactionUtils';

interface EmojiInfoData {
	id?: string;
	name: string;
	animated?: boolean;
}

const MessageReactionItem = observer(
	({
		message,
		reaction,
		isPreview = false,
	}: {
		message: MessageRecord;
		reaction: MessageReaction;
		isPreview?: boolean;
	}) => {
		const {t, i18n} = useLingui();
		const [hoverRef, isHovering] = useHover();
		const [prevCount, setPrevCount] = React.useState(reaction.count);
		const [animationSyncKey, setAnimationSyncKey] = React.useState(0);
		const [emojiInfoOpen, setEmojiInfoOpen] = React.useState(false);
		const [selectedEmoji, setSelectedEmoji] = React.useState<EmojiInfoData | null>(null);
		/*
		 * UX note for maintainers:
		 * We intentionally run a short "micro-shake" feedback only when a user
		 * ADDS a reaction (not when removing one). The count animation already
		 * communicates numeric change, but this tactile bump makes the initial
		 * click feel acknowledged instantly, especially on touch devices where
		 * hover affordances do not exist.
		 *
		 * Implementation detail:
		 * - class toggle is local to the clicked reaction button
		 * - timeout length matches CSS keyframes duration for deterministic reset
		 * - re-trigger path clears previous timeout to avoid stale state races
		 */
		const [isAddFeedbackActive, setIsAddFeedbackActive] = React.useState(false);
		const addFeedbackTimeoutRef = React.useRef<number | null>(null);
		const isMobile = MobileLayoutStore.isMobileLayout();

		const handleTooltipAnimationSync = React.useCallback(() => {
			setAnimationSyncKey((prev) => prev + 1);
		}, []);

		React.useEffect(() => {
			if (prevCount !== reaction.count) {
				setPrevCount(reaction.count);
			}
		}, [reaction.count, prevCount]);

		const triggerAddFeedback = React.useCallback(() => {
			if (addFeedbackTimeoutRef.current != null) {
				window.clearTimeout(addFeedbackTimeoutRef.current);
			}

			setIsAddFeedbackActive(false);
			requestAnimationFrame(() => {
				setIsAddFeedbackActive(true);
			});

			addFeedbackTimeoutRef.current = window.setTimeout(() => {
				setIsAddFeedbackActive(false);
			}, 360);
		}, []);

		React.useEffect(() => {
			return () => {
				if (addFeedbackTimeoutRef.current != null) {
					window.clearTimeout(addFeedbackTimeoutRef.current);
				}
			};
		}, []);

		const handleClick = () => {
			if (isPreview) {
				ModalActionCreators.push(modal(() => <ReactionInteractionDisabledModal />));
				return;
			}

			if (reaction.me) {
				ReactionActionCreators.removeReaction(i18n, message.channelId, message.id, reaction.emoji);
			} else {
				triggerAddFeedback();
				ReactionActionCreators.addReaction(i18n, message.channelId, message.id, reaction.emoji);
			}
		};

		const handleLongPress = () => {
			if (isPreview) {
				return;
			}
			setSelectedEmoji({
				id: reaction.emoji.id ?? undefined,
				name: reaction.emoji.name,
				animated: reaction.emoji.animated,
			});
			setEmojiInfoOpen(true);
		};

		const handleCloseEmojiInfo = React.useCallback(() => {
			setEmojiInfoOpen(false);
			setSelectedEmoji(null);
		}, []);

		const emojiName = getEmojiName(reaction.emoji);
		const emojiUrl = useEmojiURL({emoji: reaction.emoji, isHovering});
		const isUnicodeEmoji = reaction.emoji.id == null;
		/*
		 * If the reaction landed as a shortcode (`flag_ru`) the literal
		 * `<span>flag_ru</span>` would render as text. The hook above
		 * already resolves shortcodes back to surrogates for the URL
		 * lookup; mirror that here for the native fallback so iOS users
		 * (where the hook intentionally returns null to use system fonts)
		 * still see a glyph instead of a stray English shortcode.
		 */
		const unicodeNativeFallback = isUnicodeEmoji
			? UnicodeEmojis.findEmojiByName(reaction.emoji.name)?.surrogates ?? reaction.emoji.name
			: reaction.emoji.name;

		const variants = {
			up: {y: -20, opacity: 0},
			down: {y: 20, opacity: 0},
			center: {y: 0, opacity: 1},
		};

		const reactionCountText = reaction.count === 1 ? t`${reaction.count} reaction` : t`${reaction.count} reactions`;
		const actionText = reaction.me ? t`press to remove reaction` : t`press to add reaction`;
		const ariaLabel = t`${emojiName}: ${reactionCountText}, ${actionText}`;

		const buttonContent = (
			<FocusRing offset={-2}>
				<button
					type="button"
					className={clsx(styles.reactionButton, isAddFeedbackActive && styles.reactionButtonAddFeedback)}
					aria-label={ariaLabel}
					aria-pressed={reaction.me}
					onClick={handleClick}
				>
					<div className={styles.reactionInner}>
						{emojiUrl ? (
							<img src={emojiUrl} alt={emojiName} draggable={false} className={clsx('emoji', styles.emoji)} />
						) : isUnicodeEmoji ? (
							<span className={clsx('emoji', styles.emoji)}>{unicodeNativeFallback}</span>
						) : null}
						<div className={styles.countWrapper}>
							<AnimatePresence initial={false}>
								<motion.div
									key={reaction.count}
									initial={reaction.count > prevCount ? 'up' : 'down'}
									animate="center"
									exit={reaction.count > prevCount ? 'down' : 'up'}
									variants={variants}
									transition={{duration: 0.2}}
								>
									{reaction.count}
								</motion.div>
							</AnimatePresence>
						</div>
					</div>
				</button>
			</FocusRing>
		);

		if (isMobile) {
			return (
				<LongPressable
					className={clsx(styles.reactionContainer, reaction.me && styles.reactionMe)}
					onLongPress={handleLongPress}
				>
					{buttonContent}
					<EmojiInfoBottomSheet isOpen={emojiInfoOpen} onClose={handleCloseEmojiInfo} emoji={selectedEmoji} />
				</LongPressable>
			);
		}

		return (
			<ReactionTooltip
				message={message}
				reaction={reaction}
				hoveredEmojiUrl={emojiUrl}
				animationSyncKey={animationSyncKey}
				onRequestAnimationSync={handleTooltipAnimationSync}
			>
				<div className={clsx(styles.reactionContainer, reaction.me && styles.reactionMe)} ref={hoverRef}>
					{buttonContent}
				</div>
			</ReactionTooltip>
		);
	},
);

export const MessageReactions = observer(
	({
		message,
		isPreview = false,
		onPopoutToggle,
	}: {
		message: MessageRecord;
		isPreview?: boolean;
		onPopoutToggle?: (isOpen: boolean) => void;
	}) => {
		const {t} = useLingui();
		const [emojiPickerOpen, setEmojiPickerOpen] = React.useState(false);
		const addReactionButtonRef = React.useRef<HTMLButtonElement>(null);
		const permissions = useMessagePermissions(message);
		const handlers = createMessageActionHandlers(message);
		const keyboardModeEnabled = KeyboardModeStore.keyboardModeEnabled;

		const blurReactionTrigger = React.useCallback(() => {
			if (keyboardModeEnabled) {
				return;
			}
			requestAnimationFrame(() => addReactionButtonRef.current?.blur());
		}, [keyboardModeEnabled]);

		const handleEmojiPickerToggle = React.useCallback(
			(open: boolean) => {
				setEmojiPickerOpen(open);
				onPopoutToggle?.(open);
				if (!open) {
					blurReactionTrigger();
				}
			},
			[onPopoutToggle, blurReactionTrigger],
		);

		const handleEmojiPickerOpen = React.useCallback(() => handleEmojiPickerToggle(true), [handleEmojiPickerToggle]);
		const handleEmojiPickerClose = React.useCallback(() => handleEmojiPickerToggle(false), [handleEmojiPickerToggle]);

		useEffect(() => {
			return () => {
				if (emojiPickerOpen) {
					onPopoutToggle?.(false);
				}
			};
		}, [emojiPickerOpen, onPopoutToggle]);

		const hasReactions = message.reactions.length > 0;

		return (
			<div className={styles.reactionsGrid}>
				{/*
				 * AnimatePresence with `initial={false}` so reactions already
				 * present when the message renders (historical reactions loaded
				 * from the backend) do NOT animate — only reactions added after
				 * first paint get the pop entrance. Each reaction is wrapped in
				 * a motion.div with scale-punch spring that mimics how other
				 * chat clients make reactions feel alive.
				 */}
				<AnimatePresence initial={false}>
					{message.reactions.map((reaction) => (
						<motion.div
							key={getReactionKey(message.id, reaction.emoji)}
							layout
							initial={{opacity: 0, scale: 0.4}}
							animate={{opacity: 1, scale: 1}}
							exit={{opacity: 0, scale: 0.4, transition: {duration: 0.15, ease: 'easeIn' as const}}}
							transition={{
								type: 'spring' as const,
								stiffness: 520,
								damping: 18,
								mass: 0.55,
							}}
						>
							<MessageReactionItem message={message} reaction={reaction} isPreview={isPreview} />
						</motion.div>
					))}
				</AnimatePresence>
				{hasReactions && permissions.canAddReactions && !isPreview && (
					<Popout
						render={({onClose}) => (
							<EmojiPickerPopout
								channelId={message.channelId}
								handleSelect={handlers.handleEmojiSelect}
								onClose={onClose}
							/>
						)}
						position="right-start"
						uniqueId={`emoji-picker-reactions-${message.id}`}
						animationType="none"
						onOpen={handleEmojiPickerOpen}
						onClose={handleEmojiPickerClose}
					>
						<FocusRing offset={-2}>
							<button
								ref={addReactionButtonRef}
								type="button"
								className={clsx(styles.addReactionButton, emojiPickerOpen && styles.addReactionButtonActive)}
								aria-label={t`Add Reaction`}
								data-action="message-add-reaction-button"
							>
								<SmileyIcon size={20} weight="fill" />
							</button>
						</FocusRing>
					</Popout>
				)}
			</div>
		);
	},
);
