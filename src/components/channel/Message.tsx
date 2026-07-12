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
import {ArrowBendUpLeftIcon, CheckCircleIcon, CircleIcon} from '@phosphor-icons/react';
import {clsx} from 'clsx';
import {autorun} from 'mobx';
import {observer} from 'mobx-react-lite';
import type React from 'react';
import {useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState} from 'react';
import * as ContextMenuActionCreators from '~/actions/ContextMenuActionCreators';
import * as MessageActionCreators from '~/actions/MessageActionCreators';
import * as ReactionActionCreators from '~/actions/ReactionActionCreators';
import * as ReadStateActionCreators from '~/actions/ReadStateActionCreators';
import {ASTRALBOT_ID, MessageEmbedTypes, MessageFlags, MessagePreviewContext, MessageStates, MessageTypes} from '~/Constants';
import {MessageActionBar, MessageActionBarCore} from '~/components/channel/MessageActionBar';
import {MessageActionBottomSheet} from '~/components/channel/MessageActionBottomSheet';
import {useMessagePermissions} from '~/components/channel/messageActionUtils';
import {MessageContextMenu} from '~/components/uikit/ContextMenu/MessageContextMenu';
import FocusRing from '~/components/uikit/FocusRing/FocusRing';
import {ComponentDispatch} from '~/lib/ComponentDispatch';
import {NodeType} from '~/lib/markdown/parser/types/enums';
import {MarkdownContext, parse} from '~/lib/markdown/renderers';
import type {ChannelRecord} from '~/records/ChannelRecord';
import type {MessageRecord} from '~/records/MessageRecord';
import AccessibilityStore from '~/stores/AccessibilityStore';
import AuthenticationStore from '~/stores/AuthenticationStore';
import ContextMenuStore, {isContextMenuNodeTarget} from '~/stores/ContextMenuStore';
import DeveloperOptionsStore from '~/stores/DeveloperOptionsStore';
import EmojiPickerStore from '~/stores/EmojiPickerStore';
import EmojiStore from '~/stores/EmojiStore';
import KeyboardModeStore from '~/stores/KeyboardModeStore';
import MessageEditStore from '~/stores/MessageEditStore';
import MessageReplyStore from '~/stores/MessageReplyStore';
import MessageSelectionStore from '~/stores/MessageSelectionStore';
import MobileLayoutStore from '~/stores/MobileLayoutStore';
import UserSettingsStore from '~/stores/UserSettingsStore';
import styles from '~/styles/Message.module.css';
import {hapticLongPress, hapticSelection} from '~/utils/haptics';
import {
	applySwipeResistance,
	computeAxisVelocity,
	computeSwipeProgress,
	scheduleSwipeRelease,
	shouldCommitSwipe,
	trackVelocitySample,
} from '~/utils/motion/swipeGestures';
import {getMessageComponent} from '~/utils/MessageComponentUtils';
import {toReactionEmoji} from '~/utils/ReactionUtils';
import {MessageViewContextProvider} from './MessageViewContext';

const shouldApplyGroupedLayout = (message: MessageRecord, _prevMessage?: MessageRecord) => {
	if (message.type !== MessageTypes.DEFAULT && message.type !== MessageTypes.REPLY) {
		return false;
	}
	return true;
};

const isActivationKey = (key: string) => key === 'Enter' || key === ' ' || key === 'Spacebar' || key === 'Space';

const handleAltClickEvent = (event: React.MouseEvent, message: MessageRecord) => {
	if (!event.altKey) return;
	ReadStateActionCreators.markAsUnread(message.channelId, message.id);
};

const handleAltKeyboardEvent = (event: React.KeyboardEvent, message: MessageRecord) => {
	if (!event.altKey || !isActivationKey(event.key)) {
		return;
	}
	event.preventDefault();
	ReadStateActionCreators.markAsUnread(message.channelId, message.id);
};

const handleDeleteMessage = (
	i18n: any,
	bypassConfirm: boolean,
	message: MessageRecord,
) => {
	if (bypassConfirm) {
		MessageActionCreators.remove(message.channelId, message.id);
		return;
	}
	MessageActionCreators.showDeleteConfirmation(i18n, {message});
};

const PROFILE_TAP_IGNORE_SELECTOR =
	'a, button, input, textarea, select, summary, [contenteditable="true"], [data-message-swipe-ignore="true"], [data-user-id], [role="button"]';

const isSelectionIgnoredTarget = (target: EventTarget | null): boolean => {
	const element = target as HTMLElement | null;
	return Boolean(element?.closest(PROFILE_TAP_IGNORE_SELECTOR));
};

export type MessageBehaviorOverrides = Partial<{
	mobileLayoutEnabled: boolean;
	messageGroupSpacing: number;
	messageDisplayCompact: boolean;
	prefersReducedMotion: boolean;
	isEditing: boolean;
	isReplying: boolean;
	isHighlight: boolean;
	forceUnknownMessageType: boolean;
	contextMenuOpen: boolean;
	disableContextMenu: boolean;
	disableContextMenuTracking: boolean;
	previewOverrides?: {
		usernameColor?: string;
		displayName?: string;
	};
}>;

interface MessageProps {
	channel: ChannelRecord;
	message: MessageRecord;
	prevMessage?: MessageRecord;
	onEdit?: (targetNode: HTMLElement) => void;
	previewContext?: keyof typeof MessagePreviewContext;
	shouldGroup?: boolean;
	previewOverrides?: {
		usernameColor?: string;
		displayName?: string;
	};
	removeTopSpacing?: boolean;
	isJumpTarget?: boolean;
	previewMode?: boolean;
	behaviorOverrides?: MessageBehaviorOverrides;
	compact?: boolean;
	idPrefix?: string;
}

/*
 * Custom comparison function for React.memo.
 * Only re-render when these specific props change — prevents cascade
 * re-renders when parent (Messages.tsx) updates but this message's
 * data hasn't actually changed.
 */
function messagePropsAreEqual(prevProps: MessageProps, nextProps: MessageProps): boolean {
	if (prevProps.channel !== nextProps.channel) return false;
	if (prevProps.message !== nextProps.message) return false;

	if (prevProps.shouldGroup !== nextProps.shouldGroup) return false;
	if (prevProps.removeTopSpacing !== nextProps.removeTopSpacing) return false;
	if (prevProps.isJumpTarget !== nextProps.isJumpTarget) return false;
	if (prevProps.previewContext !== nextProps.previewContext) return false;
	if (prevProps.compact !== nextProps.compact) return false;
	if (prevProps.idPrefix !== nextProps.idPrefix) return false;

	const prevOverrides = prevProps.behaviorOverrides;
	const nextOverrides = nextProps.behaviorOverrides;
	if (prevOverrides === nextOverrides) return true;
	if (!prevOverrides || !nextOverrides) return false;

	if (prevOverrides.mobileLayoutEnabled !== nextOverrides.mobileLayoutEnabled) return false;
	if (prevOverrides.messageGroupSpacing !== nextOverrides.messageGroupSpacing) return false;
	if (prevOverrides.messageDisplayCompact !== nextOverrides.messageDisplayCompact) return false;
	if (prevOverrides.isEditing !== nextOverrides.isEditing) return false;
	if (prevOverrides.isReplying !== nextOverrides.isReplying) return false;
	if (prevOverrides.isHighlight !== nextOverrides.isHighlight) return false;
	if (prevOverrides.contextMenuOpen !== nextOverrides.contextMenuOpen) return false;

	const prevPO = prevOverrides.previewOverrides;
	const nextPO = nextOverrides.previewOverrides;
	if (prevPO !== nextPO) {
		if (!prevPO && nextPO) return false;
		if (prevPO && !nextPO) return false;
		if (prevPO && nextPO) {
			if (prevPO.usernameColor !== nextPO.usernameColor) return false;
			if (prevPO.displayName !== nextPO.displayName) return false;
		}
	}

	return true;
}

/*
 * Message component optimized with MobX observer.
 * Observer provides fine-grained reactivity - only re-renders when
 * observable props actually change. Additional useMemo for expensive
 * markdown parsing prevents unnecessary re-parsing.
 */
export const Message: React.FC<MessageProps> = observer((props) => {
		const {
			channel,
			message,
			prevMessage,
			onEdit,
			previewContext,
			shouldGroup = false,
			previewOverrides,
			removeTopSpacing = false,
			isJumpTarget = false,
			previewMode,
			behaviorOverrides,
			compact,
			idPrefix = 'message',
		} = props;

	const {t, i18n} = useLingui();

	const [showActionBar, setShowActionBar] = useState(false);
	const [isLongPressing, setIsLongPressing] = useState(false);
	const [contextMenuOpen, setContextMenuOpen] = useState(behaviorOverrides?.contextMenuOpen ?? false);
	const [isHoveringDesktop, setIsHoveringDesktop] = useState(false);
	const [isFocusedWithin, setIsFocusedWithin] = useState(false);
	const [isPopoutOpen, setIsPopoutOpen] = useState(false);
	const [swipeOffset, setSwipeOffset] = useState(0);
	const [isSwiping, setIsSwiping] = useState(false);

	const messageRef = useRef<HTMLDivElement | null>(null);
	const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);
	const wasEditingInPreviousUpdateRef = useRef(false);
	const swipeStartPosRef = useRef<{x: number; y: number} | null>(null);
	const swipeEnabledRef = useRef(false);
	const swipeOffsetRef = useRef(0);
	const swipeArmedRef = useRef(false);
	const swipeVelocitySamplesRef = useRef<Array<{x: number; y: number; timestamp: number}>>([]);
	const swipeRafRef = useRef<number | null>(null);

	const mobileLayoutEnabled = behaviorOverrides?.mobileLayoutEnabled ?? MobileLayoutStore.isEnabled();
	const messageDisplayCompact =
		compact ?? behaviorOverrides?.messageDisplayCompact ?? UserSettingsStore.getMessageDisplayCompact();
	const prefersReducedMotion = behaviorOverrides?.prefersReducedMotion ?? AccessibilityStore.useReducedMotion;
	const isEditing = behaviorOverrides?.isEditing ?? MessageEditStore.isEditing(message.channelId, message.id);
	const isReplying = behaviorOverrides?.isReplying ?? MessageReplyStore.isReplying(message.channelId, message.id);
	const isHighlight = behaviorOverrides?.isHighlight ?? MessageReplyStore.isHighlight(message.id);
	const selectionActive = !previewContext && MessageSelectionStore.isActiveForChannel(channel.id);
	const isSelected = MessageSelectionStore.isSelected(channel.id, message.id);
	const canSelectMessage = !previewContext && message.state === MessageStates.SENT;
	const forceUnknownMessageType =
		behaviorOverrides?.forceUnknownMessageType ?? DeveloperOptionsStore.forceUnknownMessageType;
	const messageGroupSpacing = behaviorOverrides?.messageGroupSpacing ?? AccessibilityStore.messageGroupSpacingValue;
	const {canAddReactions, canSendMessages} = useMessagePermissions(message);
	const canSwipeReply =
		mobileLayoutEnabled &&
		!selectionActive &&
		!previewContext &&
		!isEditing &&
		message.state === MessageStates.SENT &&
		message.isUserMessage() &&
		canSendMessages;
	const doubleClickReactionEmoji = useMemo(() => {
		if (!canAddReactions) {
			return null;
		}
		const availableEmojis = EmojiStore.search(channel, '');
		const [quickReaction] = EmojiPickerStore.getQuickReactionEmojis(availableEmojis, 1);
		return quickReaction ?? null;
	}, [canAddReactions, channel]);

	const handleContextMenuUpdate = useCallback(() => {
		const contextMenu = ContextMenuStore.contextMenu;
		const contextMenuTarget = contextMenu?.target?.target ?? null;
		const messageElement = messageRef.current;
		const isOpen =
			Boolean(contextMenu) &&
			isContextMenuNodeTarget(contextMenuTarget) &&
			Boolean(messageElement?.contains(contextMenuTarget));
		setContextMenuOpen(!!isOpen);
	}, []);

	const handleAltClick = useCallback(
		(event: React.MouseEvent) => {
			if (selectionActive) {
				event.preventDefault();
				event.stopPropagation();
				return;
			}
			handleAltClickEvent(event, message);
		},
		[message, selectionActive],
	);
	const handleAltKeyDown = useCallback(
		(event: React.KeyboardEvent<HTMLDivElement>) => {
			if (selectionActive && isActivationKey(event.key)) {
				event.preventDefault();
				MessageSelectionStore.toggle(channel.id, message.id);
				return;
			}
			handleAltKeyboardEvent(event, message);
		},
		[channel.id, message, selectionActive],
	);
	const handleMessageDoubleClick = useCallback(
		(event: React.MouseEvent<HTMLDivElement>) => {
			if (previewContext || mobileLayoutEnabled || isEditing || message.state !== MessageStates.SENT) {
				return;
			}
			if (!canAddReactions || !doubleClickReactionEmoji) {
				return;
			}
			if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) {
				return;
			}

			const target = event.target as HTMLElement | null;
			if (target?.closest('a, button, input, textarea, [contenteditable="true"], [role="button"]')) {
				return;
			}

			const selection = window.getSelection();
			if (selection && selection.type === 'Range' && selection.toString().trim().length > 0) {
				return;
			}

			ReactionActionCreators.addReaction(i18n, message.channelId, message.id, toReactionEmoji(doubleClickReactionEmoji));
			EmojiPickerStore.trackEmoji(doubleClickReactionEmoji);
		},
		[
			previewContext,
			mobileLayoutEnabled,
			isEditing,
			message.state,
			canAddReactions,
			doubleClickReactionEmoji,
			i18n,
			message.channelId,
			message.id,
		],
	);

	const handleDelete = useCallback(
		(bypassConfirm = false) => {
			handleDeleteMessage(i18n, bypassConfirm, message);
		},
		[i18n, message],
	);

	const handleContextMenu = useCallback(
		(event: React.MouseEvent) => {
			if (behaviorOverrides?.disableContextMenu) {
				event.preventDefault();
				return;
			}
			if (selectionActive && canSelectMessage) {
				event.preventDefault();
				MessageSelectionStore.toggle(channel.id, message.id);
				return;
			}
			if (
				(previewContext && previewContext !== MessagePreviewContext.LIST_POPOUT) ||
				message.state === MessageStates.SENDING ||
				isEditing
			) {
				return;
			}
			event.preventDefault();
			if (mobileLayoutEnabled) {
				return;
			}

			let linkUrl: string | undefined;
			const target = event.target as HTMLElement;
			const anchor = target.closest('a');
			if (anchor?.href) {
				linkUrl = anchor.href;
			}

			ContextMenuActionCreators.openFromEvent(event, (props) => (
				<MessageContextMenu message={message} onClose={props.onClose} onDelete={handleDelete} linkUrl={linkUrl} />
			));
		},
		[
			previewContext,
			message,
			isEditing,
			mobileLayoutEnabled,
			handleDelete,
			behaviorOverrides?.disableContextMenu,
			selectionActive,
			canSelectMessage,
			channel.id,
		],
	);

	const LONG_PRESS_DELAY = 500;
	/*
	 * Swipe thresholds tuned for mobile touch input.
	 *
	 * Previous values were too strict for real-world mobile use:
	 * - MOVEMENT_THRESHOLD was 10px (natural finger jitter on slow
	 *   phones triggered it, canceling swipes before they started)
	 * - SWIPE_ACTIVATION_DISTANCE was 18px (combined with the threshold,
	 *   created a catch-22: must move horizontally to activate, but
	 *   any vertical movement cancels)
	 * - SWIPE_VELOCITY_THRESHOLD was 0.4px/ms (too strict for slower
	 *   deliberate swipes on laggy devices)
	 *
	 * For reference: iOS swipe-back uses ~5px activation / 30px trigger,
	 * Android gesture nav uses ~10-15px / 80-100px, Discord uses ~20px.
	 */
	const MOVEMENT_THRESHOLD = 18;
	const SWIPE_VELOCITY_THRESHOLD = 0.7;
	const HIGHLIGHT_DELAY = 100;
	const SWIPE_ACTIVATION_DISTANCE = 14;
	const SWIPE_MAX_VERTICAL_DRIFT = 48;
	const SWIPE_MAX_DISTANCE = 88;
	const SWIPE_TRIGGER_DISTANCE = 52;
	const SWIPE_FLICK_VELOCITY = 0.58;

	const touchStartPos = useRef<{x: number; y: number} | null>(null);
	const velocitySamples = useRef<Array<{x: number; y: number; timestamp: number}>>([]);
	const highlightTimerRef = useRef<NodeJS.Timeout | null>(null);

	const resetSwipeState = useCallback(() => {
		if (swipeRafRef.current != null) {
			window.cancelAnimationFrame(swipeRafRef.current);
			swipeRafRef.current = null;
		}
		swipeStartPosRef.current = null;
		swipeEnabledRef.current = false;
		swipeArmedRef.current = false;
		swipeVelocitySamplesRef.current = [];
		swipeOffsetRef.current = 0;
		setIsSwiping(false);
		setSwipeOffset(0);
	}, []);

	const commitSwipeOffset = useCallback((nextOffset: number) => {
		swipeOffsetRef.current = nextOffset;
		if (swipeRafRef.current != null) {
			return;
		}
		swipeRafRef.current = window.requestAnimationFrame(() => {
			swipeRafRef.current = null;
			setSwipeOffset(swipeOffsetRef.current);
		});
	}, []);

	const releaseSwipeGesture = useCallback(() => {
		setIsSwiping(false);
		scheduleSwipeRelease(() => {
			commitSwipeOffset(0);
		});
	}, [commitSwipeOffset]);

	const clearLongPressTimers = useCallback(() => {
		if (longPressTimerRef.current) {
			clearTimeout(longPressTimerRef.current);
			longPressTimerRef.current = null;
		}
		if (highlightTimerRef.current) {
			clearTimeout(highlightTimerRef.current);
			highlightTimerRef.current = null;
		}
		setIsLongPressing(false);
	}, []);

	const clearLongPressState = useCallback((options?: {preserveTouchStart?: boolean}) => {
		clearLongPressTimers();
		if (!options?.preserveTouchStart) {
			touchStartPos.current = null;
		}
		velocitySamples.current = [];
	}, [clearLongPressTimers]);

	const calculateVelocity = useCallback((): number => {
		const samples = velocitySamples.current;
		if (samples.length < 2) return 0;

		const now = performance.now();
		const recentSamples = samples.filter((s) => now - s.timestamp < 100);
		if (recentSamples.length < 2) return 0;

		const first = recentSamples[0];
		const last = recentSamples[recentSamples.length - 1];
		const dt = last.timestamp - first.timestamp;
		if (dt === 0) return 0;

		const dx = last.x - first.x;
		const dy = last.y - first.y;
		return Math.sqrt(dx * dx + dy * dy) / dt;
	}, []);

	const handleLongPressStart = useCallback(
		(event: React.TouchEvent) => {
			if (!mobileLayoutEnabled || previewContext) {
				return;
			}
			const touch = event.touches[0];
			if (!touch) return;

			if (selectionActive && canSelectMessage) {
				if (event.cancelable) {
					event.preventDefault();
				}
				MessageSelectionStore.startDrag(channel.id, message.id, !isSelected);
				touchStartPos.current = {x: touch.clientX, y: touch.clientY};
				return;
			}

			const target = event.target as HTMLElement | null;
			const interactiveTarget = Boolean(
				target?.closest(
					'input, textarea, select, summary, [contenteditable="true"], [data-message-swipe-ignore="true"], [data-user-id], [role="button"]',
				),
			);

			touchStartPos.current = {x: touch.clientX, y: touch.clientY};
			swipeStartPosRef.current = {x: touch.clientX, y: touch.clientY};
			swipeEnabledRef.current = canSwipeReply && !interactiveTarget;
			swipeArmedRef.current = false;
			swipeVelocitySamplesRef.current = [{x: touch.clientX, y: touch.clientY, timestamp: performance.now()}];
			velocitySamples.current = [{x: touch.clientX, y: touch.clientY, timestamp: performance.now()}];

			highlightTimerRef.current = setTimeout(() => {
				if (touchStartPos.current) {
					setIsLongPressing(true);
					/*
					 * Short haptic tap to confirm the preview state has
					 * engaged — matches iOS system behaviour where long-
					 * press gives a tactile bump before the menu slides
					 * in. No-op on browsers without navigator.vibrate.
					 */
					hapticLongPress();
				}
				highlightTimerRef.current = null;
			}, HIGHLIGHT_DELAY);

			longPressTimerRef.current = setTimeout(() => {
				if (touchStartPos.current) {
					if (canSelectMessage) {
						MessageSelectionStore.startDrag(channel.id, message.id, true);
					} else {
						setShowActionBar(true);
					}
					setIsLongPressing(false);
				}
				clearLongPressState();
			}, LONG_PRESS_DELAY);
		},
		[
			mobileLayoutEnabled,
			previewContext,
			clearLongPressState,
			canSwipeReply,
			canSelectMessage,
			channel.id,
			message.id,
			selectionActive,
			isSelected,
		],
	);

	const handleSelectionPointerDown = useCallback(
		(event: React.PointerEvent<HTMLDivElement>) => {
			if (!selectionActive || !canSelectMessage || event.button !== 0 || isSelectionIgnoredTarget(event.target)) {
				return;
			}
			if (event.cancelable) {
				event.preventDefault();
			}
			event.stopPropagation();
			MessageSelectionStore.startDrag(channel.id, message.id, !isSelected);
		},
		[channel.id, message.id, selectionActive, canSelectMessage, isSelected],
	);

	const handleSelectionPointerEnter = useCallback(() => {
		if (!selectionActive || !canSelectMessage) return;
		MessageSelectionStore.applyDrag(channel.id, message.id);
	}, [channel.id, message.id, selectionActive, canSelectMessage]);

	const handleSelectionClick = useCallback(
		(event: React.MouseEvent<HTMLButtonElement>) => {
			event.preventDefault();
			event.stopPropagation();
			if (!canSelectMessage) return;
			MessageSelectionStore.toggle(channel.id, message.id);
		},
		[channel.id, message.id, canSelectMessage],
	);

	useEffect(() => {
		if (!selectionActive) return;
		const handlePointerUp = () => MessageSelectionStore.endDrag();
		window.addEventListener('pointerup', handlePointerUp, true);
		window.addEventListener('pointercancel', handlePointerUp, true);
		return () => {
			window.removeEventListener('pointerup', handlePointerUp, true);
			window.removeEventListener('pointercancel', handlePointerUp, true);
		};
	}, [selectionActive]);

	const handleLongPressEnd = useCallback(() => {
		if (selectionActive) {
			MessageSelectionStore.endDrag();
			clearLongPressState();
			return;
		}

		const currentOffset = swipeOffsetRef.current;
		const flickVelocity = -computeAxisVelocity(swipeVelocitySamplesRef.current, 'x');
		const shouldTriggerReply = shouldCommitSwipe({
			offset: currentOffset,
			threshold: SWIPE_TRIGGER_DISTANCE,
			velocity: flickVelocity,
			minFlickVelocity: SWIPE_FLICK_VELOCITY,
		});
		const replyMentioning = !message.isCurrentUserAuthor() && channel.guildId != null;

		if (isSwiping) {
			releaseSwipeGesture();
			clearLongPressState();

			if (shouldTriggerReply) {
				hapticSelection();
				MessageActionCreators.startReply(message.channelId, message.id, replyMentioning);
				ComponentDispatch.dispatch('FOCUS_TEXTAREA', {channelId: message.channelId});
			}
			return;
		}

		resetSwipeState();
		clearLongPressState();
	}, [
		SWIPE_FLICK_VELOCITY,
		SWIPE_TRIGGER_DISTANCE,
		channel.guildId,
		clearLongPressState,
		isSwiping,
		message,
		releaseSwipeGesture,
		resetSwipeState,
		selectionActive,
	]);

	const handleLongPressMove = useCallback(
		(event: React.TouchEvent) => {
			if (selectionActive) {
				const touch = event.touches[0];
				if (!touch) return;
				const target = document.elementFromPoint(touch.clientX, touch.clientY);
				const messageElement = target?.closest?.('[data-message-id][data-channel-id]') as HTMLElement | null;
				if (messageElement?.dataset.channelId === channel.id && messageElement.dataset.messageId) {
					event.preventDefault();
					MessageSelectionStore.applyDrag(channel.id, messageElement.dataset.messageId);
				}
				return;
			}

			if (!touchStartPos.current) return;
			const touch = event.touches[0];
			if (!touch) return;

			const swipeStart = swipeStartPosRef.current;
			if (swipeEnabledRef.current && swipeStart) {
				const swipeDistanceX = swipeStart.x - touch.clientX;
				const deltaY = touch.clientY - swipeStart.y;
				const absDeltaY = Math.abs(deltaY);
				const absDeltaX = Math.abs(swipeDistanceX);
				if (!isSwiping && absDeltaY >= SWIPE_ACTIVATION_DISTANCE && absDeltaY >= absDeltaX) {
					swipeEnabledRef.current = false;
				}
				const isHorizontalSwipe =
					swipeDistanceX > SWIPE_ACTIVATION_DISTANCE &&
					swipeDistanceX > absDeltaY * 1.45 &&
					absDeltaY < SWIPE_MAX_VERTICAL_DRIFT;

				if (isHorizontalSwipe || isSwiping) {
					event.preventDefault();
					clearLongPressTimers();
					swipeVelocitySamplesRef.current = trackVelocitySample(
						swipeVelocitySamplesRef.current,
						touch.clientX,
						touch.clientY,
					);
					const resistedOffset = applySwipeResistance(
						Math.max(swipeDistanceX, 0),
						SWIPE_MAX_DISTANCE,
					);
					const nextArmed = resistedOffset >= SWIPE_TRIGGER_DISTANCE;
					if (nextArmed && !swipeArmedRef.current) {
						swipeArmedRef.current = true;
						hapticSelection();
					} else if (!nextArmed) {
						swipeArmedRef.current = false;
					}
					setIsSwiping(resistedOffset > 0);
					commitSwipeOffset(resistedOffset);
					return;
				}
			}

			velocitySamples.current.push({x: touch.clientX, y: touch.clientY, timestamp: performance.now()});
			if (velocitySamples.current.length > 10) {
				velocitySamples.current = velocitySamples.current.slice(-10);
			}

			const deltaX = Math.abs(touch.clientX - touchStartPos.current.x);
			const deltaY = Math.abs(touch.clientY - touchStartPos.current.y);

			if (deltaX > MOVEMENT_THRESHOLD || deltaY > MOVEMENT_THRESHOLD) {
				clearLongPressState({preserveTouchStart: true});
				return;
			}

			const velocity = calculateVelocity();
			if (velocity > SWIPE_VELOCITY_THRESHOLD) {
				clearLongPressState({preserveTouchStart: true});
			}
		},
		[
			SWIPE_ACTIVATION_DISTANCE,
			SWIPE_MAX_DISTANCE,
			SWIPE_MAX_VERTICAL_DRIFT,
			channel.id,
			SWIPE_TRIGGER_DISTANCE,
			clearLongPressTimers,
			calculateVelocity,
			commitSwipeOffset,
			isSwiping,
			selectionActive,
		],
	);

	useEffect(() => {
		if (behaviorOverrides?.disableContextMenuTracking) {
			return;
		}
		const disposer = autorun(() => {
			handleContextMenuUpdate();
		});
		return () => {
			disposer();
		};
	}, [handleContextMenuUpdate, behaviorOverrides?.disableContextMenuTracking]);

	useEffect(() => {
		if (!behaviorOverrides?.disableContextMenuTracking) {
			return;
		}
		if (behaviorOverrides.contextMenuOpen !== undefined) {
			setContextMenuOpen(behaviorOverrides.contextMenuOpen);
		}
	}, [behaviorOverrides?.contextMenuOpen, behaviorOverrides?.disableContextMenuTracking]);

	const keyboardModeEnabled = KeyboardModeStore.keyboardModeEnabled;

	const handleFocusWithin = useCallback(() => {
		if (!keyboardModeEnabled) {
			return;
		}
		setIsFocusedWithin(true);
	}, [keyboardModeEnabled]);

	const handleBlurWithin = useCallback(() => {
		setIsFocusedWithin(false);
	}, []);

	useEffect(() => {
		if (mobileLayoutEnabled || !messageRef.current) return;
		const element = messageRef.current;
		const syncHoverState = () => {
			setIsHoveringDesktop(element.matches(':hover'));
		};
		const handleMouseEnter = () => {
			setIsHoveringDesktop(true);
		};
		const handleMouseLeave = () => {
			setIsHoveringDesktop(false);
		};
		element.addEventListener('mouseenter', handleMouseEnter);
		element.addEventListener('mouseleave', handleMouseLeave);
		window.addEventListener('focus', syncHoverState);
		const rafId = requestAnimationFrame(syncHoverState);
		return () => {
			cancelAnimationFrame(rafId);
			element.removeEventListener('mouseenter', handleMouseEnter);
			element.removeEventListener('mouseleave', handleMouseLeave);
			window.removeEventListener('focus', syncHoverState);
		};
	}, [mobileLayoutEnabled, keyboardModeEnabled]);

	useLayoutEffect(() => {
		const wasEditing = wasEditingInPreviousUpdateRef.current;
		const justStartedEditing = !wasEditing && isEditing;

		if (justStartedEditing && onEdit && messageRef.current) {
			onEdit(messageRef.current);
		}

		wasEditingInPreviousUpdateRef.current = isEditing;
	}, [isEditing, onEdit]);

	useEffect(() => {
		if (!mobileLayoutEnabled) return;

		/*
		 * Scroll listener for long-press cleanup.
		 *
		 * We ONLY cancel the long-press (context menu) timer on scroll,
		 * NOT the active swipe. Previously this also called
		 * resetSwipeState(), which killed in-progress swipe-to-reply
		 * gestures because on mobile, even tiny incidental scrolls
		 * fire during horizontal swipes (especially on slower devices
		 * where scroll events race with touch move events).
		 */
		const handleScroll = () => {
			if (touchStartPos.current && !isSwiping) {
				clearLongPressState();
			}
		};

		window.addEventListener('scroll', handleScroll, {capture: true, passive: true});
		return () => {
			window.removeEventListener('scroll', handleScroll, {capture: true});
			if (longPressTimerRef.current) {
				clearTimeout(longPressTimerRef.current);
			}
			if (highlightTimerRef.current) {
				clearTimeout(highlightTimerRef.current);
			}
		};
	}, [mobileLayoutEnabled, clearLongPressState, isSwiping]);

	useEffect(() => {
		if (!mobileLayoutEnabled) {
			resetSwipeState();
		}
	}, [mobileLayoutEnabled, resetSwipeState]);

	useEffect(() => {
		/*
		 * Safety net for rare touch-cancel races on mobile: if a row
		 * remains shifted after a swipe gesture ended, snap it back so
		 * message cards never look "stuck" off-screen.
		 */
		if (!mobileLayoutEnabled || isSwiping || swipeOffset <= 0) {
			return;
		}

		const restoreTimer = window.setTimeout(() => {
			resetSwipeState();
		}, 180);

		return () => {
			window.clearTimeout(restoreTimer);
		};
	}, [mobileLayoutEnabled, isSwiping, swipeOffset, resetSwipeState]);

	const isHovering = mobileLayoutEnabled ? false : isHoveringDesktop;

	useEffect(() => {
		if (!keyboardModeEnabled) {
			setIsFocusedWithin(false);
			return;
		}
		const activeElement = messageRef.current?.ownerDocument?.activeElement ?? document.activeElement;
		if (messageRef.current && activeElement && messageRef.current.contains(activeElement)) {
			setIsFocusedWithin(true);
		}
	}, [keyboardModeEnabled]);
	const actionBarHoverState = previewMode
		? true
		: isHovering || (keyboardModeEnabled && isFocusedWithin) || isPopoutOpen;
	const shouldForceUngroupedMediaLayout =
		!messageDisplayCompact &&
		shouldGroup &&
		message.isCurrentUserAuthor() &&
		message.isUserMessage() &&
		!message.content?.trim() &&
		(message.attachments.length > 0 || message.embeds.some((embed) => embed.type === MessageEmbedTypes.IMAGE));
	const resolvedShouldGroup = shouldForceUngroupedMediaLayout ? false : shouldGroup;

	const messageContextValue = useMemo(
		() => ({
			channel,
			message,
			handleDelete,
			shouldGroup: resolvedShouldGroup,
			isHovering,
			previewContext,
			previewOverrides,
			onPopoutToggle: setIsPopoutOpen,
		}),
		[
			channel,
			message,
			handleDelete,
			resolvedShouldGroup,
			isHovering,
			previewContext,
			previewOverrides,
			setIsPopoutOpen,
		],
	);

	const messageComponent = (
		<MessageViewContextProvider value={messageContextValue}>
			{getMessageComponent(channel, message, forceUnknownMessageType)}
		</MessageViewContextProvider>
	);

	/*
	 * Ephemeral filter (Discord MessageFlags.EPHEMERAL = 1<<6).
	 *
	 * Bots use ephemeral to send a response visible only to the user
	 * who triggered the interaction. We don't yet store the invoking
	 * user server-side (no per-message ACL), so as a defensive shim we
	 * hide ephemeral messages from anyone who isn't:
	 *   - the message's author (covers user-sent ephemerals)
	 *   - explicitly @-mentioned in the message
	 *
	 * This is intentionally over-restrictive: better to occasionally
	 * hide a message that should be visible than to leak a private
	 * response to the whole channel. Once interactions track an
	 * `invoking_user_id` per ephemeral message we can drop this.
	 *
	 * Placed AFTER all React hooks to satisfy the rules of hooks: any
	 * early `return null` must come after every useState/useEffect/etc
	 * to keep the call order stable across renders.
	 */
	if ((message.flags & MessageFlags.EPHEMERAL) !== 0) {
		const currentUserId = AuthenticationStore.currentUserId;
		const isAuthor = currentUserId != null && message.author.id === currentUserId;
		const isMentioned =
			currentUserId != null && message.mentions.some((m) => m.id === currentUserId);
		if (!isAuthor && !isMentioned) {
			return null;
		}
	}

	/*
	 * Memoized markdown parsing — previously parsed inline on every render.
	 * Parsing is expensive for long messages with complex formatting.
	 * Key by message.id since content is immutable once sent.
	 */
	const parsedContent = useMemo(() => {
		return parse({
			content: message.content,
			context: MarkdownContext.STANDARD_WITH_JUMBO,
		});
	}, [message.id, message.content]);

	const {nodes: astNodes} = parsedContent;

	const shouldHideContent =
		UserSettingsStore.getRenderEmbeds() &&
		message.embeds.length > 0 &&
		message.embeds.every((embed) => embed.type === MessageEmbedTypes.IMAGE || embed.type === MessageEmbedTypes.GIFV) &&
		astNodes.length === 1 &&
		astNodes[0].type === NodeType.Link &&
		!message.suppressEmbeds;

	const shouldDisableHoverBackground = prefersReducedMotion && !isEditing;
	const isKeyboardFocused = keyboardModeEnabled && isFocusedWithin;
	const shouldApplySpacing =
		!resolvedShouldGroup && !removeTopSpacing && previewContext !== MessagePreviewContext.LIST_POPOUT;

	const messageClasses = clsx(
		messageDisplayCompact ? styles.messageCompact : styles.message,
		shouldDisableHoverBackground && styles.messageNoHover,
		isEditing && styles.messageEditing,
		!messageDisplayCompact &&
			resolvedShouldGroup &&
			shouldApplyGroupedLayout(message, prevMessage) &&
			styles.messageGrouped,
		!previewContext && message.isMentioned() && styles.messageMentioned,
		!previewContext &&
			(isReplying || isHighlight || isJumpTarget) &&
			(isReplying ? styles.messageReplying : styles.messageHighlight),
		message.type === MessageTypes.CLIENT_SYSTEM && message.author.id === ASTRALBOT_ID && styles.messageClientSystem,
		isLongPressing && styles.messageLongPress,
		selectionActive && styles.messageSelecting,
		isSelected && styles.messageSelected,
		!previewContext && (contextMenuOpen || isPopoutOpen) && styles.contextMenuActive,
		previewContext && styles.messagePreview,
		mobileLayoutEnabled && styles.mobileLayout,
		isSwiping && styles.messageSwiping,
		swipeOffset >= SWIPE_TRIGGER_DISTANCE && styles.messageSwipeReplyReady,
		!messageDisplayCompact &&
			(!message.content || shouldHideContent) &&
			!isEditing &&
			message.isUserMessage() &&
			styles.messageNoText,
		isKeyboardFocused && styles.keyboardFocused,
		isKeyboardFocused && 'keyboard-focus-active',
		shouldApplySpacing && previewContext && styles.messagePreviewSpacing,
	);

	const shouldShowActionBar =
		!selectionActive && !previewContext && message.state !== MessageStates.SENDING && !isEditing && !MobileLayoutStore.isEnabled();

	const shouldShowBottomSheet =
		MobileLayoutStore.isEnabled() &&
		showActionBar &&
		!previewContext &&
		message.state !== MessageStates.SENDING &&
		!isEditing;

	return (
		<>
			<FocusRing>
				<div
					role="article"
					id={`${idPrefix}-${channel.id}-${message.id}`}
					data-message-id={message.id}
					data-channel-id={channel.id}
					data-message-state={message.state}
					data-channel-private={channel.isPrivate() ? 'true' : undefined}
					data-author-self={message.isCurrentUserAuthor() ? 'true' : undefined}
					data-message-bubble={
						message.isUserMessage() && message.type !== MessageTypes.CLIENT_SYSTEM ? 'true' : undefined
					}
					tabIndex={keyboardModeEnabled ? 0 : undefined}
					className={messageClasses}
					ref={messageRef}
					onClick={handleAltClick}
					onDoubleClick={handleMessageDoubleClick}
					onKeyDown={handleAltKeyDown}
					onFocus={handleFocusWithin}
					onBlur={handleBlurWithin}
					onContextMenu={handleContextMenu}
					onPointerDown={handleSelectionPointerDown}
					onPointerEnter={handleSelectionPointerEnter}
					onTouchStart={handleLongPressStart}
					onTouchEnd={handleLongPressEnd}
					onTouchCancel={handleLongPressEnd}
					onTouchMove={handleLongPressMove}
					style={{
						/*
						 * touch-action controls which gestures the browser
						 * handles natively vs passing to JS. `pan-y` alone
						 * BLOCKS horizontal swipes — the browser consumes
						 * the touch before our handlers fire.
						 *
						 * When swipe-to-reply is active (canSwipeReply +
						 * isSwiping), we need `none` so JS gets full
						 * control. Otherwise `manipulation` allows both
						 * vertical scroll and pinch-zoom without blocking
						 * horizontal swipe detection.
						 */
						touchAction: isSwiping ? 'none' : canSwipeReply ? 'manipulation' : 'pan-y',
						WebkitUserSelect: selectionActive ? 'none' : 'text',
						userSelect: selectionActive ? 'none' : 'text',
						marginTop: shouldApplySpacing && previewContext ? `${messageGroupSpacing}px` : undefined,
						'--message-swipe-offset': `${-swipeOffset}px`,
						'--message-swipe-progress': String(computeSwipeProgress(swipeOffset, SWIPE_TRIGGER_DISTANCE)),
					} as React.CSSProperties}
				>
					{(selectionActive || isSelected) && canSelectMessage && (
						<button
							type="button"
							className={clsx(styles.messageSelectionButton, 'no-press-feedback')}
							aria-label={isSelected ? t`Deselect message` : t`Select message`}
							aria-pressed={isSelected}
							onClick={handleSelectionClick}
							data-message-swipe-ignore="true"
						>
							{isSelected ? (
								<CheckCircleIcon className={styles.messageSelectionIcon} weight="fill" />
							) : (
								<CircleIcon className={styles.messageSelectionIcon} weight="bold" />
							)}
						</button>
					)}
					{canSwipeReply && (
						<div className={styles.messageSwipeReplyAffordance} aria-hidden="true">
							<div className={styles.messageSwipeReplyBadge}>
								<ArrowBendUpLeftIcon className={styles.messageSwipeReplyIcon} weight="bold" />
							</div>
						</div>
					)}
					{messageComponent}
					{shouldShowActionBar && (previewMode ? (
							<MessageActionBarCore
								message={message}
								handleDelete={handleDelete}
								permissions={{
									canSendMessages: true,
									canAddReactions: true,
									canEditMessage: true,
									canDeleteMessage: true,
									canPinMessage: true,
									shouldRenderSuppressEmbeds: true,
								}}
								isSaved={false}
								developerMode={false}
								isHovering={actionBarHoverState}
								onPopoutToggle={setIsPopoutOpen}
							/>
						) : (
							<MessageActionBar
								message={message}
								handleDelete={handleDelete}
								isHovering={actionBarHoverState}
								onPopoutToggle={setIsPopoutOpen}
							/>
						))}
				</div>
			</FocusRing>

			{shouldShowBottomSheet && (
				<MessageActionBottomSheet
					isOpen={shouldShowBottomSheet}
					onClose={() => setShowActionBar(false)}
					message={message}
					handleDelete={handleDelete}
				/>
			)}
		</>
	);
});
