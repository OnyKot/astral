import React from 'react';
import {hapticSelection} from '~/utils/haptics';
import {
	applySwipeResistance,
	computeAxisVelocity,
	scheduleSwipeRelease,
	shouldCommitSwipe,
	trackVelocitySample,
} from '~/utils/motion/swipeGestures';

const DEFAULT_THRESHOLD = 62;
const DEFAULT_MAX_OFFSET = 112;
const ACTIVATION_PX = 16;
const DOMINANCE_RATIO = 1.18;
const VERTICAL_CANCEL_PX = 16;
const POST_ENGAGE_VERTICAL_CANCEL_PX = 64;
const FLICK_VELOCITY = 0.5;

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
	isDragging: boolean;
}

export function useSwipeAction({
	enabled = true,
	onAction,
	direction = 'left',
	threshold = DEFAULT_THRESHOLD,
	maxOffset = DEFAULT_MAX_OFFSET,
}: UseSwipeActionOptions): UseSwipeActionResult {
	const [offset, setOffset] = React.useState(0);
	const [armed, setArmed] = React.useState(false);
	const [isDragging, setIsDragging] = React.useState(false);
	const armedRef = React.useRef(false);
	const offsetRef = React.useRef(0);
	const pendingOffsetRef = React.useRef(0);
	const animationFrameRef = React.useRef<number | null>(null);
	const velocitySamplesRef = React.useRef<Array<{x: number; y: number; timestamp: number}>>([]);
	const stateRef = React.useRef<{
		startX: number;
		startY: number;
		engaged: boolean;
		cancelled: boolean;
	} | null>(null);

	const cancelVisualFrame = React.useCallback(() => {
		if (animationFrameRef.current != null) {
			window.cancelAnimationFrame(animationFrameRef.current);
			animationFrameRef.current = null;
		}
	}, []);

	const commitVisualState = React.useCallback(
		(nextOffset: number) => {
			pendingOffsetRef.current = nextOffset;
			const nextArmed = nextOffset >= threshold;
			if (nextArmed !== armedRef.current) {
				armedRef.current = nextArmed;
				setArmed(nextArmed);
				if (nextArmed) {
					hapticSelection();
				}
			}

			if (animationFrameRef.current != null) {
				return;
			}

			animationFrameRef.current = window.requestAnimationFrame(() => {
				animationFrameRef.current = null;
				const frameOffset = pendingOffsetRef.current;
				if (frameOffset !== offsetRef.current) {
					offsetRef.current = frameOffset;
					setOffset(frameOffset);
				}
			});
		},
		[threshold],
	);

	const reset = React.useCallback(() => {
		cancelVisualFrame();
		stateRef.current = null;
		offsetRef.current = 0;
		pendingOffsetRef.current = 0;
		armedRef.current = false;
		velocitySamplesRef.current = [];
		setOffset(0);
		setArmed(false);
		setIsDragging(false);
	}, [cancelVisualFrame]);

	const onTouchStart = React.useCallback(
		(event: React.TouchEvent) => {
			if (!enabled) return;
			const touch = event.touches[0];
			if (!touch) return;
			stateRef.current = {startX: touch.clientX, startY: touch.clientY, engaged: false, cancelled: false};
			velocitySamplesRef.current = [{x: touch.clientX, y: touch.clientY, timestamp: performance.now()}];
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
				if (Math.abs(dy) > VERTICAL_CANCEL_PX && Math.abs(dy) >= Math.abs(dx)) {
					state.cancelled = true;
					commitVisualState(0);
					return;
				}
				const directionalDx = direction === 'left' ? -dx : dx;
				if (directionalDx > ACTIVATION_PX && Math.abs(dx) > Math.abs(dy) * DOMINANCE_RATIO) {
					state.engaged = true;
					setIsDragging(true);
				} else {
					return;
				}
			} else if (Math.abs(dy) > POST_ENGAGE_VERTICAL_CANCEL_PX) {
				state.cancelled = true;
				setIsDragging(false);
				commitVisualState(0);
				return;
			}

			event.preventDefault();
			velocitySamplesRef.current = trackVelocitySample(
				velocitySamplesRef.current,
				touch.clientX,
				touch.clientY,
			);

			const directionalDx = direction === 'left' ? -dx : dx;
			const resisted = applySwipeResistance(Math.max(0, directionalDx), maxOffset);
			commitVisualState(resisted);
		},
		[commitVisualState, direction, maxOffset],
	);

	const onTouchEnd = React.useCallback(() => {
		const state = stateRef.current;
		const currentOffset = offsetRef.current;
		const directionalVelocity =
			direction === 'left'
				? -computeAxisVelocity(velocitySamplesRef.current, 'x')
				: computeAxisVelocity(velocitySamplesRef.current, 'x');
		const shouldFire =
			state != null &&
			!state.cancelled &&
			state.engaged &&
			shouldCommitSwipe({
				offset: currentOffset,
				threshold,
				velocity: directionalVelocity,
				minFlickVelocity: FLICK_VELOCITY,
			});

		stateRef.current = null;
		setIsDragging(false);

		if (shouldFire) {
			onAction();
		}

		scheduleSwipeRelease(() => {
			armedRef.current = false;
			setArmed(false);
			commitVisualState(0);
		});
	}, [commitVisualState, direction, onAction, threshold]);

	const onTouchCancel = React.useCallback(() => {
		setIsDragging(false);
		scheduleSwipeRelease(() => {
			reset();
		});
	}, [reset]);

	React.useEffect(() => () => reset(), [reset]);

	const progress = threshold > 0 ? Math.min(1, offset / threshold) : 0;

	return {
		gestureProps: {onTouchStart, onTouchMove, onTouchEnd, onTouchCancel},
		offset,
		progress,
		armed,
		isDragging,
	};
}
