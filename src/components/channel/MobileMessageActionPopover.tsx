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
import {CaretDownIcon} from '@phosphor-icons/react';
import {AnimatePresence, motion, useReducedMotion} from 'framer-motion';
import {observer} from 'mobx-react-lite';
import React from 'react';
import {createPortal} from 'react-dom';
import {useMessageActionMenuData} from '~/components/channel/messageActionMenu';
import {ExpressionPickerSheet} from '~/components/modals/ExpressionPickerSheet';
import {
	CopyTextIcon,
	DeleteIcon,
	EditIcon,
	ForwardIcon,
	PinIcon,
	ReplyIcon,
} from '~/components/uikit/ContextMenu/ContextMenuIcons';
import type {MessageRecord} from '~/records/MessageRecord';
import EmojiPickerStore from '~/stores/EmojiPickerStore';
import {shouldUseNativeEmoji} from '~/utils/EmojiUtils';
import type {ReactionEmoji, UnicodeEmoji} from '~/utils/ReactionUtils';
import {isStoryForwardPayload} from '~/utils/StoryForwardPayload';
import styles from './MobileMessageActionPopover.module.css';

type AnchorPoint = {x: number; y: number};

interface MobileMessageActionPopoverProps {
	isOpen: boolean;
	onClose: () => void;
	message: MessageRecord;
	handleDelete: (bypassConfirm?: boolean) => void;
	anchorRef: React.RefObject<HTMLElement | null>;
	anchorPoint?: AnchorPoint | null;
}

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

export const MobileMessageActionPopover: React.FC<MobileMessageActionPopoverProps> = observer(
	({isOpen, onClose, message, handleDelete, anchorRef, anchorPoint}) => {
		const {t} = useLingui();
		const reducedMotion = useReducedMotion();
		const [portalRoot, setPortalRoot] = React.useState<HTMLElement | null>(null);
		const [isEmojiPickerOpen, setIsEmojiPickerOpen] = React.useState(false);
		const popoverRef = React.useRef<HTMLDivElement | null>(null);
		const [position, setPosition] = React.useState({left: 12, top: 12});

		React.useEffect(() => {
			setPortalRoot(document.body);
		}, []);

		const handleAddReaction = React.useCallback(() => {
			setIsEmojiPickerOpen(true);
		}, []);

		const handleCloseEmojiPicker = React.useCallback(() => {
			setIsEmojiPickerOpen(false);
			onClose();
		}, [onClose]);

		const {handlers, permissions, quickReactionEmojis, canOpenReactionPicker} = useMessageActionMenuData(message, {
			onClose,
			onDelete: () => handleDelete(),
			onOpenEmojiPicker: handleAddReaction,
			quickReactionCount: 6,
		});

		const handlePickerEmojiSelect = React.useCallback(
			(emoji: UnicodeEmoji | ReactionEmoji) => {
				handlers.handleEmojiSelect(emoji);
				setIsEmojiPickerOpen(false);
				onClose();
			},
			[handlers, onClose],
		);

		const recalculatePosition = React.useCallback(() => {
			if (!isOpen) return;
			const viewportWidth = window.innerWidth;
			const viewportHeight = window.innerHeight;
			const margin = 12;
			const fallbackRect = anchorRef.current?.getBoundingClientRect();
			const targetX = anchorPoint?.x ?? (fallbackRect ? fallbackRect.left + fallbackRect.width / 2 : viewportWidth / 2);
			const targetY = anchorPoint?.y ?? (fallbackRect ? fallbackRect.top + fallbackRect.height / 2 : viewportHeight / 2);
			const panelWidth = Math.min(336, viewportWidth - margin * 2);
			const panelHeight = popoverRef.current?.offsetHeight ?? 320;
			const left = clamp(targetX - panelWidth / 2, margin, Math.max(margin, viewportWidth - panelWidth - margin));
			const hasSpaceAbove = targetY > panelHeight + margin * 2;
			const nextTop = hasSpaceAbove
				? targetY - panelHeight - 10
				: Math.min(targetY + 10, Math.max(margin, viewportHeight - panelHeight - margin));

			setPosition({
				left,
				top: clamp(nextTop, margin, Math.max(margin, viewportHeight - panelHeight - margin)),
			});
		}, [anchorPoint?.x, anchorPoint?.y, anchorRef, isOpen]);

		React.useLayoutEffect(() => {
			if (!isOpen || isEmojiPickerOpen) return;
			recalculatePosition();
			const frame = window.requestAnimationFrame(recalculatePosition);
			window.addEventListener('resize', recalculatePosition);
			window.addEventListener('orientationchange', recalculatePosition);
			window.addEventListener('scroll', recalculatePosition, true);
			return () => {
				window.cancelAnimationFrame(frame);
				window.removeEventListener('resize', recalculatePosition);
				window.removeEventListener('orientationchange', recalculatePosition);
				window.removeEventListener('scroll', recalculatePosition, true);
			};
		}, [isOpen, isEmojiPickerOpen, recalculatePosition]);

		React.useEffect(() => {
			if (!isOpen) {
				setIsEmojiPickerOpen(false);
				return;
			}

			const handleKeyDown = (event: KeyboardEvent) => {
				if (event.key === 'Escape') {
					onClose();
				}
			};
			window.addEventListener('keydown', handleKeyDown);
			return () => window.removeEventListener('keydown', handleKeyDown);
		}, [isOpen, onClose]);

		const closeAfter = React.useCallback(
			(action: () => void) => () => {
				action();
				onClose();
			},
			[onClose],
		);

		const hasCopyableText = Boolean(message.content && !isStoryForwardPayload(message.content));
		const actionItems = [
			message.isUserMessage() &&
				permissions.canSendMessages && {
					id: 'reply',
					icon: <ReplyIcon size={26} />,
					label: t`Reply`,
					onClick: closeAfter(handlers.handleReply),
				},
			hasCopyableText && {
				id: 'copy',
				icon: <CopyTextIcon size={26} />,
				label: t`Copy Text`,
				onClick: closeAfter(handlers.handleCopyMessage),
			},
			message.isCurrentUserAuthor() &&
				message.isUserMessage() &&
				!message.messageSnapshots &&
				permissions.canEditMessage && {
					id: 'edit',
					icon: <EditIcon size={26} />,
					label: t`Edit Message`,
					onClick: closeAfter(handlers.handleEditMessage),
				},
			message.isUserMessage() && {
				id: 'forward',
				icon: <ForwardIcon size={26} />,
				label: t`Forward`,
				onClick: closeAfter(handlers.handleForward),
			},
			message.isUserMessage() &&
				permissions.canPinMessage && {
					id: 'pin',
					icon: <PinIcon size={26} />,
					label: message.pinned ? t`Unpin Message` : t`Pin Message`,
					onClick: closeAfter(handlers.handlePinMessage),
				},
			permissions.canDeleteMessage && {
				id: 'delete',
				icon: <DeleteIcon size={26} />,
				label: t`Delete Message`,
				onClick: () => {
					onClose();
					handleDelete();
				},
				danger: true,
			},
		].filter(Boolean) as Array<{
			id: string;
			icon: React.ReactNode;
			label: string;
			onClick: () => void;
			danger?: boolean;
		}>;

		const hasQuickBar = permissions.canAddReactions && (quickReactionEmojis.length > 0 || canOpenReactionPicker);
		const shouldRenderPopover = isOpen && !isEmojiPickerOpen && (hasQuickBar || actionItems.length > 0);
		const motionProps = reducedMotion
			? {
					initial: {opacity: 0},
					animate: {opacity: 1},
					exit: {opacity: 0},
					transition: {duration: 0.08},
				}
			: {
					initial: {opacity: 0, y: 8, scale: 0.96},
					animate: {opacity: 1, y: 0, scale: 1},
					exit: {opacity: 0, y: 6, scale: 0.98},
					transition: {type: 'spring' as const, stiffness: 520, damping: 32, mass: 0.7},
				};

		const popover = (
			<>
				<AnimatePresence>
					{shouldRenderPopover && (
						<>
							<motion.button
								key="backdrop"
								type="button"
								className={styles.backdrop}
								aria-label={t`Close message actions`}
								onPointerDown={onClose}
								initial={{opacity: 0}}
								animate={{opacity: 1}}
								exit={{opacity: 0}}
								transition={{duration: reducedMotion ? 0.05 : 0.12}}
							/>
							<motion.div
								key="popover"
								ref={popoverRef}
								className={styles.popover}
								style={{left: position.left, top: position.top}}
								role="menu"
								aria-label={t`Message actions`}
								onPointerDown={(event) => event.stopPropagation()}
								{...motionProps}
							>
								{hasQuickBar && (
									<div className={styles.quickBar} aria-label={t`Quick reactions`}>
										{quickReactionEmojis.map((emoji) => {
											const isUnicodeEmoji = !emoji.guildId && !emoji.id;
											const useNativeRendering = shouldUseNativeEmoji && isUnicodeEmoji;
											return (
												<button
													key={emoji.uniqueName ?? emoji.name}
													type="button"
													onClick={() => {
														EmojiPickerStore.trackEmoji(emoji);
														handlers.handleEmojiSelect(emoji);
														onClose();
													}}
													aria-label={t`React with :${emoji.name}:`}
													className={styles.quickReactionButton}
												>
													{useNativeRendering ? (
														<span className={styles.quickReactionEmoji}>{emoji.surrogates}</span>
													) : (
														<img src={emoji.url ?? ''} alt={emoji.name} className={styles.quickReactionEmoji} />
													)}
												</button>
											);
										})}
										{canOpenReactionPicker && (
											<button
												type="button"
												onClick={handleAddReaction}
												aria-label={t`Add another reaction`}
												className={styles.moreReactionButton}
											>
												<CaretDownIcon size={22} weight="bold" />
											</button>
										)}
									</div>
								)}

								{actionItems.length > 0 && (
									<div className={styles.menu}>
										{actionItems.map((item) => (
											<button
												key={item.id}
												type="button"
												role="menuitem"
												className={`${styles.menuItem} ${item.danger ? styles.danger : ''}`}
												onClick={item.onClick}
											>
												<span className={styles.icon} aria-hidden="true">
													{item.icon}
												</span>
												<span className={styles.label}>{item.label}</span>
											</button>
										))}
									</div>
								)}
							</motion.div>
						</>
					)}
				</AnimatePresence>
				<ExpressionPickerSheet
					isOpen={isOpen && isEmojiPickerOpen}
					onClose={handleCloseEmojiPicker}
					channelId={message.channelId}
					onEmojiSelect={handlePickerEmojiSelect}
					initialSnap={1}
					snapPoints={[0, 1]}
					visibleTabs={['emojis']}
					zIndex={30002}
					reactionPicker={true}
				/>
			</>
		);

		return portalRoot ? createPortal(popover, portalRoot) : popover;
	},
);
