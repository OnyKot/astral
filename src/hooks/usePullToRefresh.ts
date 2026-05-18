import React from 'react';
import {hapticSelection} from '~/utils/haptics';

const DEFAULT_THRESHOLD_PX = 56;
const DEFAULT_MAX_PULL_PX = 88;
const RESISTANCE = 0.42;

interface UsePullToRefreshOptions {
	enabled?: boolean;
	onRefresh: () => Promise<void> | void;
	threshold?: number;
	maxPull?: number;
}

interface UsePullToRefreshResult {
	gestureProps: Pick<
		React.HTMLAttributes<HTMLElement>,
		'onTouchStart' | 'onTouchMove' | 'onTouchEnd' | 'onTouchCancel'
	>;
	pullDistance: number;
	progress: number;
	isRefreshing: boolean;
}

/*
 * Pull-to-refresh gesture. Engages only when the target element is
 * scrolled to the very top; otherwise lets the native scroll run.
 * Applies rubber-band resistance so the visual follows the finger
 * without overshooting. Triggers haptic at the arming threshold.
 */
export function usePullToRefresh({
	enabled = true,
	onRefresh,
	threshold = DEFAULT_THRESHOLD_PX,
	maxPull = DEFAULT_MAX_PULL_PX,
}: UsePullToRefreshOptions): UsePullToRefreshResult {
	const [pullDistance, setPullDistance] = React.useState(0);
	const [isRefreshing, setIsRefreshing] = React.useState(false);
	const stateRef = React.useRef<{
		startY: number;
		engaged: boolean;
		armed: boolean;
	} | null>(null);

	const findScrollable = (el: HTMLElement | null): HTMLElement | null => {
		let node: HTMLElement | null = el;
		while (node) {
			const overflowY = getComputedStyle(node).overflowY;
			if ((overflowY === 'auto' || overflowY === 'scroll') && node.scrollHeight > node.clientHeight) {
				return node;
			}
			node = node.parentElement;
		}
		return null;
	};

	const reset = React.useCallback(() => {
		stateRef.current = null;
		setPullDistance(0);
	}, []);

	const onTouchStart = React.useCallback(
		(event: React.TouchEvent) => {
			if (!enabled || isRefreshing) return;
			const scroller = findScrollable(event.target as HTMLElement);
			if (scroller && scroller.scrollTop > 0) return;
			const touch = event.touches[0];
			if (!touch) return;
			stateRef.current = {startY: touch.clientY, engaged: false, armed: false};
		},
		[enabled, isRefreshing],
	);

	const onTouchMove = React.useCallback(
		(event: React.TouchEvent) => {
			const state = stateRef.current;
			if (!state || isRefreshing) return;
			const touch = event.touches[0];
			if (!touch) return;
			const delta = touch.clientY - state.startY;
			if (delta <= 0) {
				if (state.engaged) {
					state.engaged = false;
					setPullDistance(0);
				}
				return;
			}
			const dampened = Math.min(maxPull, delta * RESISTANCE);
			if (!state.engaged && dampened > 4) {
				state.engaged = true;
			}
			if (state.engaged) {
				setPullDistance(dampened);
				if (dampened >= threshold && !state.armed) {
					state.armed = true;
					hapticSelection();
				} else if (dampened < threshold && state.armed) {
					state.armed = false;
				}
			}
		},
		[isRefreshing, maxPull, threshold],
	);

	const onTouchEnd = React.useCallback(() => {
		const state = stateRef.current;
		stateRef.current = null;
		if (!state || !state.engaged) {
			setPullDistance(0);
			return;
		}
		if (state.armed) {
			setIsRefreshing(true);
			setPullDistance(threshold);
			const finish = () => {
				setIsRefreshing(false);
				setPullDistance(0);
			};
			try {
				const result = onRefresh();
				if (result && typeof (result as Promise<void>).then === 'function') {
					(result as Promise<void>).then(finish, finish);
				} else {
					finish();
				}
			} catch {
				finish();
			}
		} else {
			setPullDistance(0);
		}
	}, [onRefresh, threshold]);

	const onTouchCancel = React.useCallback(() => {
		stateRef.current = null;
		if (!isRefreshing) setPullDistance(0);
	}, [isRefreshing]);

	React.useEffect(() => () => reset(), [reset]);

	const progress = threshold > 0 ? Math.min(1, pullDistance / threshold) : 0;

	return {
		gestureProps: {onTouchStart, onTouchMove, onTouchEnd, onTouchCancel},
		pullDistance,
		progress,
		isRefreshing,
	};
}
