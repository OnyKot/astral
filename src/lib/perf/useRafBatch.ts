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

import {useCallback, useEffect, useRef} from 'react';

export type RafBatchedFn<Args extends ReadonlyArray<unknown>> = (...args: Args) => void;

/*
 * Batches calls onto a single requestAnimationFrame tick. Multiple synchronous
 * invocations in the same frame coalesce into one rAF callback, and the latest
 * args win. Use this to coalesce store-driven updates that would otherwise
 * trigger several reactive passes per frame (e.g. typing indicators firing
 * per-DM-item re-renders).
 *
 * Returns a stable function reference; the scheduled rAF is cancelled on
 * unmount.
 */
export function useRafBatch<Args extends ReadonlyArray<unknown>>(fn: RafBatchedFn<Args>): RafBatchedFn<Args> {
	const fnRef = useRef(fn);
	fnRef.current = fn;

	const rafRef = useRef<number>(0);
	const pendingArgsRef = useRef<Args | null>(null);
	const hasPendingRef = useRef(false);

	useEffect(() => {
		return () => {
			if (rafRef.current) cancelAnimationFrame(rafRef.current);
		};
	}, []);

	return useCallback((...args: Args) => {
		pendingArgsRef.current = args;
		if (hasPendingRef.current) return;
		hasPendingRef.current = true;
		rafRef.current = requestAnimationFrame(() => {
			hasPendingRef.current = false;
			rafRef.current = 0;
			const pending = pendingArgsRef.current;
			pendingArgsRef.current = null;
			if (pending) fnRef.current(...pending);
		});
	}, []);
}
