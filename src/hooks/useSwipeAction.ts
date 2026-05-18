import React from 'react';
import {hapticSelection} from '~/utils/haptics';

const DEFAULT_THRESHOLD = 56;
const DEFAULT_MAX_OFFSET = 100;
const ACTIVATION_PX = 18;
const DOMINANCE_RATIO = 1.4;
const VERTICAL_CANCEL_PX = 12;
const POST_ENGAGE_VERTICAL_CANCEL_PX = 42;

interface UseSwipeActionOptions {
	enabled?: boolean;
	onAction: () => void;
	direction?: 'left' | 'right';
	threshold?: number;
	maxOffset?: number;
}

interface UseSwipeActionResult {
	gestureProps: Pick<
		React.HTMLAttributes<HTMLElement>,
		'onTouchStart' | 'onTouchMove' | 'onTouchEnd' | 'onTouchCancel'
	>;
	offset: number;
	progress: number;
	armed: boolean;
	isActive: boolean;
}

/*
 * Single-direction swipe that commits an action on release past
 * the threshold. Cancels if the user drifts vertically (so normal
 * list scroll still works). Fires a haptic when the threshold is
 * crossed so users feel when the action is armed.
 */
export function useSwipeAction({
	enabled = true,
	onAction,
	direction = 'left',
	threshold = DEFAULT_THRESHOLD,
	maxOffset = DEFAULT_MAX_OFFSET,
}: UseSwipeActionOptions): UseSwipeActionResult {
	const [offset, setOffset] = React.useState(0);
	const [armed, setArmed] = React.useState(false);
	const stateRef = React.useRef<{
		startX: number;
		startY: number;
		engaged: boolean;
		cancelled: boolean;
	} | null>(null);

	const reset = React.useCallback(() => {
		stateRef.current = null;
		setOffset(0);
		setArmed(false);
	}, []);

	const onTouchStart = React.useCallback(
		(event: React.TouchEvent) => {
			if (!enabled) return;
			const touch = event.touches[0];
			if (!touch) return;
			stateRef.current = {startX: touch.clientX, startY: touch.clientY, engaged: false, cancelled: false};
		},
		[enabled],
	);

	const onTouchMove = React.useCallback(
		(event: React.TouchEvent) => {
			const state = stateRef.current;
			if (!state || state.cancelled) return;
			const touch = event.touches[0];
			if (!touch) return;
			const dx = touch.clientX - state.startX;
			const dy = touch.clientY - state.startY;

			if (!state.engaged) {
				if (Math.abs(dy) > VERTICAL_CANCEL_PX) {
					state.cancelled = true;
					setOffset(0);
					setArmed(false);
					return;
				}
				const directionalDx = direction === 'left' ? -dx : dx;
				// Engage only on a clearly horizontal gesture so vertical list
				// scrolling with tiny horizontal drift never reveals the action.
				if (
					directionalDx > ACTIVATION_PX &&
					Math.abs(dx) > Math.abs(dy) * DOMINANCE_RATIO
				) {
					state.engaged = true;
				} else {
					return;
				}
			} else if (Math.abs(dy) > POST_ENGAGE_VERTICAL_CANCEL_PX) {
				// Sudden vertical drift after engagement (user changed their
				// mind mid-swipe): release the row and let the list scroll.
				state.cancelled = true;
				setOffset(0);
				setArmed(false);
				return;
			}

			const directionalDx = direction === 'left' ? -dx : dx;
			const clamped = Math.max(0, Math.min(maxOffset, directionalDx));
			setOffset(clamped);
			const nextArmed = clamped >= threshold;
			if (nextArmed !== armed) {
				setArmed(nextArmed);
				if (nextArmed) hapticSelection();
			}
		},
		[direction, maxOffset, threshold, armed],
	);

	const onTouchEnd = React.useCallback(() => {
		const state = stateRef.current;
		stateRef.current = null;
		if (!state || state.cancelled || !state.engaged) {
			setOffset(0);
			setArmed(false);
			return;
		}
		if (armed) {
			onAction();
		}
		setOffset(0);
		setArmed(false);
	}, [armed, onAction]);

	const onTouchCancel = React.useCallback(() => {
		reset();
	}, [reset]);

	React.useEffect(() => () => reset(), [reset]);

	const progress = threshold > 0 ? Math.min(1, offset / threshold) : 0;
	const isActive = offset > 0;

	return {
		gestureProps: {onTouchStart, onTouchMove, onTouchEnd, onTouchCancel},
		offset,
		progress,
		armed,
		isActive,
	};
}
