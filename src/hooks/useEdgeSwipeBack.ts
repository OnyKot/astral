import React from 'react';

const DEFAULT_EDGE_ZONE_PX = 36;
const DEFAULT_ACTIVATION_PX = 12;
const DEFAULT_TRIGGER_PX = 88;
const DEFAULT_MAX_OFFSET_PX = 180;
const DEFAULT_MAX_VERTICAL_DRIFT_PX = 56;
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
}

interface SwipeGestureState {
	startX: number;
	startY: number;
	engaged: boolean;
}

interface UseEdgeSwipeBackResult {
	gestureProps: Pick<
		React.HTMLAttributes<HTMLElement>,
		'onTouchStart' | 'onTouchMove' | 'onTouchEnd' | 'onTouchCancel'
	>;
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
}: UseEdgeSwipeBackOptions): UseEdgeSwipeBackResult {
	const [offset, setOffset] = React.useState(0);
	const gestureRef = React.useRef<SwipeGestureState | null>(null);

	const reset = React.useCallback(() => {
		gestureRef.current = null;
		setOffset(0);
	}, []);

	React.useEffect(() => {
		if (!enabled) {
			reset();
		}
	}, [enabled, reset]);

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
				engaged: false,
			};
		},
		[edgeZonePx, enabled, ignoreSelector],
	);

	const handleTouchMove = React.useCallback(
		(event: React.TouchEvent<HTMLElement>) => {
			if (!enabled || event.touches.length !== 1) {
				return;
			}

			const gesture = gestureRef.current;
			if (!gesture) {
				return;
			}

			const touch = event.touches[0];
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

			const nextOffset = Math.min(Math.max(deltaX, 0), maxOffsetPx);
			setOffset(nextOffset);

			if (deltaX > 0) {
				event.preventDefault();
				event.stopPropagation();
			}
		},
		[activationPx, enabled, maxOffsetPx, maxVerticalDriftPx, reset],
	);

	const handleTouchEnd = React.useCallback(() => {
		const gesture = gestureRef.current;
		if (!gesture?.engaged) {
			reset();
			return;
		}

		const shouldNavigateBack = offset >= triggerPx;
		reset();

		if (shouldNavigateBack) {
			onBack();
		}
	}, [offset, onBack, reset, triggerPx]);

	const progress = Math.min(offset / triggerPx, 1);
	const stageStyle: React.CSSProperties =
		offset > 0
			? {
					transform: `translate3d(${offset}px, 0, 0)`,
					opacity: 1 - progress * 0.04,
					boxShadow: `0 22px 48px rgb(0 0 0 / ${0.08 + progress * 0.18})`,
					transition: 'none',
				}
			: {};

	return {
		gestureProps: {
			onTouchStart: handleTouchStart,
			onTouchMove: handleTouchMove,
			onTouchEnd: handleTouchEnd,
			onTouchCancel: reset,
		},
		stageStyle,
		isActive: offset > 0,
		progress,
		offset,
		reset,
	};
}
