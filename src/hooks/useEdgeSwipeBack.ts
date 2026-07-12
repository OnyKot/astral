import React from 'react';

const DEFAULT_EDGE_ZONE_PX = 52;
const DEFAULT_ACTIVATION_PX = 12;
const DEFAULT_TRIGGER_PX = 82;
const DEFAULT_MAX_OFFSET_PX = 240;
const DEFAULT_MAX_VERTICAL_DRIFT_PX = 52;
const DEFAULT_TRIGGER_VELOCITY_PX_PER_SECOND = 840;
const DEFAULT_COMMIT_DURATION_MS = 190;
const DEFAULT_IGNORE_SELECTOR =
	'a, button, input, textarea, select, label, summary, [role="button"], [role="switch"], [role="textbox"], [role="link"], [contenteditable="true"], [data-edge-swipe-ignore="true"]';

interface UseEdgeSwipeBackOptions {
	enabled: boolean;
	onBack: () => void;
	ignoreSelector?: string;
	edgeZonePx?: number;
	activationPx?: number;
	triggerPx?: number;
	maxOffsetPx?: number;
	maxVerticalDriftPx?: number;
	triggerVelocityPxPerSecond?: number;
	commitDurationMs?: number;
}

interface SwipeGestureState {
	startX: number;
	startY: number;
	lastX: number;
	lastTime: number;
	velocityX: number;
	engaged: boolean;
}

interface UseEdgeSwipeBackResult {
	gestureProps: Pick<React.HTMLAttributes<HTMLElement>, 'onTouchStart' | 'onTouchEnd' | 'onTouchCancel'>;
	/**
	 * Attach to the same element that receives `gestureProps`. The hook binds a
	 * non-passive `touchmove` listener here so it can `preventDefault()` the
	 * browser's scroll while dragging. React's synthetic `onTouchMove` is
	 * registered as passive, so calling `preventDefault()` there is a no-op and
	 * spams the console with warnings — hence the manual native binding.
	 */
	containerRef: (element: HTMLElement | null) => void;
	stageStyle: React.CSSProperties;
	isActive: boolean;
	progress: number;
	offset: number;
	reset: () => void;
}

export function useEdgeSwipeBack({
	enabled,
	onBack,
	ignoreSelector = DEFAULT_IGNORE_SELECTOR,
	edgeZonePx = DEFAULT_EDGE_ZONE_PX,
	activationPx = DEFAULT_ACTIVATION_PX,
	triggerPx = DEFAULT_TRIGGER_PX,
	maxOffsetPx = DEFAULT_MAX_OFFSET_PX,
	maxVerticalDriftPx = DEFAULT_MAX_VERTICAL_DRIFT_PX,
	triggerVelocityPxPerSecond = DEFAULT_TRIGGER_VELOCITY_PX_PER_SECOND,
	commitDurationMs = DEFAULT_COMMIT_DURATION_MS,
}: UseEdgeSwipeBackOptions): UseEdgeSwipeBackResult {
	const [offset, setOffset] = React.useState(0);
	const [isCommitting, setIsCommitting] = React.useState(false);
	const gestureRef = React.useRef<SwipeGestureState | null>(null);
	const commitTimeoutRef = React.useRef<number | null>(null);
	const offsetRef = React.useRef(0);
	const rafRef = React.useRef<number | null>(null);

	const setOffsetValue = React.useCallback((value: number) => {
		offsetRef.current = value;
		if (rafRef.current != null) return;

		rafRef.current = window.requestAnimationFrame(() => {
			rafRef.current = null;
			setOffset(offsetRef.current);
		});
	}, []);

	const reset = React.useCallback(() => {
		if (commitTimeoutRef.current != null) {
			window.clearTimeout(commitTimeoutRef.current);
			commitTimeoutRef.current = null;
		}
		if (rafRef.current != null) {
			window.cancelAnimationFrame(rafRef.current);
			rafRef.current = null;
		}
		gestureRef.current = null;
		offsetRef.current = 0;
		setIsCommitting(false);
		setOffset(0);
	}, []);

	React.useEffect(() => {
		if (!enabled) {
			reset();
		}
	}, [enabled, reset]);

	React.useEffect(() => {
		return () => {
			if (commitTimeoutRef.current != null) {
				window.clearTimeout(commitTimeoutRef.current);
				commitTimeoutRef.current = null;
			}
			if (rafRef.current != null) {
				window.cancelAnimationFrame(rafRef.current);
				rafRef.current = null;
			}
		};
	}, []);

	const preventDefaultIfPossible = (event: {cancelable: boolean; preventDefault: () => void; nativeEvent?: {cancelable?: boolean}}) => {
		if (event.cancelable && (event.nativeEvent?.cancelable ?? true)) {
			event.preventDefault();
		}
	};

	const handleTouchStart = React.useCallback(
		(event: React.TouchEvent<HTMLElement>) => {
			if (!enabled || event.touches.length !== 1) {
				gestureRef.current = null;
				return;
			}

			const target = event.target;
			if (target instanceof Element && target.closest(ignoreSelector)) {
				gestureRef.current = null;
				return;
			}

			const touch = event.touches[0];
			const bounds = event.currentTarget.getBoundingClientRect();
			if (touch.clientX - bounds.left > edgeZonePx) {
				gestureRef.current = null;
				return;
			}

			gestureRef.current = {
				startX: touch.clientX,
				startY: touch.clientY,
				lastX: touch.clientX,
				lastTime: performance.now(),
				velocityX: 0,
				engaged: false,
			};
		},
		[edgeZonePx, enabled, ignoreSelector],
	);

	const handleTouchMove = React.useCallback(
		(event: TouchEvent) => {
			if (!enabled || event.touches.length !== 1) {
				return;
			}

			const gesture = gestureRef.current;
			if (!gesture) {
				return;
			}

			const touch = event.touches[0];
			const now = performance.now();
			const frameMs = Math.max(1, now - gesture.lastTime);
			gesture.velocityX = ((touch.clientX - gesture.lastX) / frameMs) * 1000;
			gesture.lastX = touch.clientX;
			gesture.lastTime = now;

			const deltaX = touch.clientX - gesture.startX;
			const deltaY = touch.clientY - gesture.startY;

			if (!gesture.engaged) {
				if (deltaX < 0 || Math.abs(deltaY) > maxVerticalDriftPx) {
					reset();
					return;
				}

				if (deltaX < activationPx) {
					return;
				}

				if (Math.abs(deltaY) > Math.abs(deltaX) * 0.75) {
					reset();
					return;
				}

				gesture.engaged = true;
			}

			const currentTarget = event.currentTarget as HTMLElement | null;
			const targetWidth = currentTarget?.clientWidth || window.innerWidth || maxOffsetPx;
			const dragLimit = Math.max(maxOffsetPx, targetWidth);
			const rawOffset = Math.min(Math.max(deltaX, 0), dragLimit);
			const nextOffset = rawOffset <= triggerPx ? rawOffset : triggerPx + (rawOffset - triggerPx) * 0.72;
			setOffsetValue(nextOffset);

			if (deltaX > 0) {
				preventDefaultIfPossible(event);
				event.stopPropagation();
			}
		},
		[activationPx, enabled, maxOffsetPx, maxVerticalDriftPx, reset, setOffsetValue, triggerPx],
	);

	// React registers `onTouchMove` as a passive listener at the document root,
	// so `preventDefault()` inside a synthetic handler is ignored (and logs a
	// warning per move event). Bind our own non-passive listener to the host
	// element instead. A stable wrapper delegates to the latest handler so we
	// don't re-attach the listener every render.
	const latestTouchMoveRef = React.useRef(handleTouchMove);
	React.useEffect(() => {
		latestTouchMoveRef.current = handleTouchMove;
	}, [handleTouchMove]);

	const attachedElementRef = React.useRef<HTMLElement | null>(null);
	const stableTouchMoveRef = React.useRef<((event: TouchEvent) => void) | undefined>(undefined);
	if (!stableTouchMoveRef.current) {
		stableTouchMoveRef.current = (event: TouchEvent) => latestTouchMoveRef.current(event);
	}

	const containerRef = React.useCallback((element: HTMLElement | null) => {
		const listener = stableTouchMoveRef.current;
		if (!listener) {
			return;
		}
		if (attachedElementRef.current === element) {
			return;
		}
		if (attachedElementRef.current) {
			attachedElementRef.current.removeEventListener('touchmove', listener);
		}
		attachedElementRef.current = element;
		if (element) {
			element.addEventListener('touchmove', listener, {passive: false});
		}
	}, []);

	React.useEffect(() => {
		return () => {
			const listener = stableTouchMoveRef.current;
			if (attachedElementRef.current && listener) {
				attachedElementRef.current.removeEventListener('touchmove', listener);
				attachedElementRef.current = null;
			}
		};
	}, []);

	const handleTouchEnd = React.useCallback((event: React.TouchEvent<HTMLElement>) => {
		const gesture = gestureRef.current;
		if (!gesture?.engaged) {
			reset();
			return;
		}

		const shouldNavigateBack =
			offsetRef.current >= triggerPx ||
			(offsetRef.current >= activationPx * 2 && gesture.velocityX >= triggerVelocityPxPerSecond);

		if (shouldNavigateBack) {
			gestureRef.current = null;
			const commitOffset = Math.max(maxOffsetPx, event.currentTarget.clientWidth || window.innerWidth || maxOffsetPx);
			setIsCommitting(true);
			offsetRef.current = commitOffset;
			setOffset(commitOffset);
			commitTimeoutRef.current = window.setTimeout(() => {
				commitTimeoutRef.current = null;
				onBack();
				setIsCommitting(false);
				offsetRef.current = 0;
				setOffset(0);
			}, commitDurationMs);
			return;
		}

		gestureRef.current = null;
		setIsCommitting(true);
		offsetRef.current = 0;
		setOffset(0);
		commitTimeoutRef.current = window.setTimeout(() => {
			commitTimeoutRef.current = null;
			setIsCommitting(false);
		}, Math.min(160, commitDurationMs));
	}, [
		activationPx,
		commitDurationMs,
		maxOffsetPx,
		onBack,
		reset,
		triggerPx,
		triggerVelocityPxPerSecond,
	]);

	const progress = Math.min(offset / triggerPx, 1);
	const stageStyle: React.CSSProperties =
		offset > 0 || isCommitting
			? {
					transform: `translate3d(${offset}px, 0, 0)`,
					opacity: 1 - progress * 0.04,
					boxShadow: `0 22px 48px rgb(0 0 0 / ${0.08 + progress * 0.18})`,
					transition: isCommitting
						? `transform ${commitDurationMs}ms cubic-bezier(0.16, 1, 0.3, 1), opacity ${commitDurationMs}ms ease, box-shadow ${commitDurationMs}ms ease`
						: 'none',
				}
			: {};

	return {
		gestureProps: {
			onTouchStart: handleTouchStart,
			onTouchEnd: handleTouchEnd,
			onTouchCancel: reset,
		},
		containerRef,
		stageStyle,
		isActive: offset > 0,
		progress,
		offset,
		reset,
	};
}
