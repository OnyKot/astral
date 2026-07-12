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
 * but WITHOUT ANY WARRANTY; without the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with Astral. If not, see <https://www.gnu.org/licenses/>.
 */

import {useCallback, useEffect, useMemo, useRef, useState} from 'react';

export interface ViewportWindowOptions {
	/*
	 * Total number of items in the list. When the count is small enough that
	 * every item fits within a few viewports, windowing adds overhead for no
	 * gain — callers should skip the hook and render flat below this count.
	 */
	itemCount: number;
	/*
	 * Estimated height of a single item in px. Used to size placeholders for
	 * unmounted items so the scrollbar stays accurate. The real height is
	 * measured for mounted items and feeds back into the estimate.
	 */
	estimatedItemHeight: number;
	/*
	 * Number of items to render above and below the visible viewport. Larger
	 * values reduce placeholder flashes during fast scrolling at the cost of
	 * more mounted nodes. Default 6.
	 */
	overscan?: number;
	/*
	 * Minimum item count before windowing activates. Below this, the hook
	 * returns the full range so small lists render flat. Default 40.
	 */
	enableThreshold?: number;
}

export interface ViewportWindow {
	/*
	 * Inclusive start index of the rendered window. 0 when windowing is
	 * disabled (full list rendered).
	 */
	startIndex: number;
	/*
	 * Exclusive end index of the rendered window.
	 */
	endIndex: number;
	/*
	 * True when windowing is active (item count exceeded the threshold).
	 * When false, startIndex=0 and endIndex=itemCount — render flat.
	 */
	isWindowed: boolean;
	/*
	 * Pixel height to reserve for the unmounted items above the window.
	 * Apply as paddingTop (or a spacer div) on the scroll content.
	 */
	beforeSpace: number;
	/*
	 * Pixel height to reserve for the unmounted items below the window.
	 * Apply as paddingBottom (or a spacer div).
	 */
	afterSpace: number;
	/*
	 * Report the actual measured height of a mounted item so the estimate
	 * improves over time. Call from a ResizeObserver or ref callback.
	 */
	measureItem: (index: number, height: number) => void;
}

/*
 * Viewport windowing for vertical scroll surfaces where DOM nodes are NOT
 * required off-screen (member list, pickers, search results — NOT the message
 * list, whose ScrollManager needs off-screen nodes for anchors/jump).
 *
 * The hook observes the scroll container and computes which item indices fall
 * inside [scrollTop - overscan, scrollTop + viewportHeight + overscan]. Items
 * outside that range are represented only by their reserved space, so React
 * never mounts them and the browser never lays out or paints them.
 *
 * Item heights are measured as they mount and cached, so placeholder sizing
 * converges to accurate after the first full scroll pass. Until a given index
 * is measured, `estimatedItemHeight` is used.
 *
 * The scroll position read is rAF-throttled: scroll events fire many times per
 * frame; we coalesce to one range recompute per frame.
 */
export function useViewportWindow(
	scrollRef: React.RefObject<HTMLElement | null>,
	options: ViewportWindowOptions,
): ViewportWindow {
	const {itemCount, estimatedItemHeight, overscan = 6, enableThreshold = 40} = options;

	const isWindowed = itemCount > enableThreshold;

	const [range, setRange] = useState<{start: number; end: number}>(() =>
		isWindowed ? {start: 0, end: Math.min(itemCount, overscan * 3)} : {start: 0, end: itemCount},
	);

	// Measured heights keyed by item index. Mutable ref — reads during scroll
	// must not trigger re-renders.
	const heightsRef = useRef<Map<number, number>>(new Map());
	const rafRef = useRef<number>(0);
	const lastScrollTopRef = useRef(-1);

	const recompute = useCallback(() => {
		rafRef.current = 0;
		const el = scrollRef.current;
		if (!el || !isWindowed) return;

		const scrollTop = el.scrollTop;
		const viewportHeight = el.clientHeight;
		if (scrollTop === lastScrollTopRef.current && el.scrollHeight !== 0) {
			// No vertical movement; skip unless content changed (handled by effect).
		}
		lastScrollTopRef.current = scrollTop;

		// Accumulate measured heights to map indices <-> pixel offsets.
		let offset = 0;
		let start = 0;
		const top = scrollTop - overscan * estimatedItemHeight;
		for (let i = 0; i < itemCount; i++) {
			const h = heightsRef.current.get(i) ?? estimatedItemHeight;
			if (offset + h >= top) {
				start = i;
				break;
			}
			offset += h;
		}

		const bottom = scrollTop + viewportHeight + overscan * estimatedItemHeight;
		let end = start;
		let cursor = offset;
		for (let i = start; i < itemCount; i++) {
			const h = heightsRef.current.get(i) ?? estimatedItemHeight;
			if (cursor >= bottom) {
				end = i;
				break;
			}
			cursor += h;
			end = i + 1;
		}
		end = Math.min(end, itemCount);

		setRange((prev) => {
			if (prev.start === start && prev.end === end) return prev;
			return {start, end};
		});
	}, [scrollRef, isWindowed, itemCount, estimatedItemHeight, overscan]);

	useEffect(() => {
		if (!isWindowed) {
			setRange({start: 0, end: itemCount});
			return;
		}

		const el = scrollRef.current;
		if (!el) return;

		const onScroll = () => {
			if (rafRef.current) return;
			rafRef.current = requestAnimationFrame(recompute);
		};

		el.addEventListener('scroll', onScroll, {passive: true});

		// Recompute on resize (container or content) so the window tracks
		// viewport changes and item-count changes.
		const ro = new ResizeObserver(() => {
			if (rafRef.current) return;
			rafRef.current = requestAnimationFrame(recompute);
		});
		ro.observe(el);

		// Initial compute after mount.
		recompute();

		return () => {
			el.removeEventListener('scroll', onScroll);
			ro.disconnect();
			if (rafRef.current) cancelAnimationFrame(rafRef.current);
		};
	}, [scrollRef, isWindowed, itemCount, recompute]);

	const measureItem = useCallback((index: number, height: number) => {
		if (height <= 0) return;
		const prev = heightsRef.current.get(index);
		if (prev != null && Math.abs(prev - height) < 1) return;
		heightsRef.current.set(index, height);
	}, []);

	const {startIndex, endIndex, beforeSpace, afterSpace} = useMemo(() => {
		if (!isWindowed) {
			return {startIndex: 0, endIndex: itemCount, beforeSpace: 0, afterSpace: 0};
		}
		let before = 0;
		for (let i = 0; i < range.start; i++) {
			before += heightsRef.current.get(i) ?? estimatedItemHeight;
		}
		let after = 0;
		for (let i = range.end; i < itemCount; i++) {
			after += heightsRef.current.get(i) ?? estimatedItemHeight;
		}
		return {startIndex: range.start, endIndex: range.end, beforeSpace: before, afterSpace: after};
	}, [isWindowed, itemCount, range, estimatedItemHeight]);

	return {
		startIndex,
		endIndex,
		isWindowed,
		beforeSpace,
		afterSpace,
		measureItem,
	};
}
