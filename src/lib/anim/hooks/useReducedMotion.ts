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
 * but WITHOUT ANY WARRANTY; without even implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with Astral. If not, see <https://www.gnu.org/licenses/>.
 */

/*
 * useReducedMotion — matches framer-motion's null-then-boolean semantics.
 *
 * Returns `null` on the first render (before the matchMedia effect runs) and
 * a boolean thereafter. Consumers branch on `reduced === null ? fallback :
 * reduced`, which is why the initial value must be null rather than false —
 * returning false on the first render would suppress the entrance animation
 * on devices that DO prefer reduced motion (the effect would flip it true
 * after mount, too late). This is the exact behavior framer ships.
 */

import {useSyncExternalStore} from 'react';

import {prefersReducedMotion} from '~/lib/perf/reducedMotion';

const REDUCE_QUERY = '(prefers-reduced-motion: reduce)';

function subscribe(callback: () => void): () => void {
	if (typeof window === 'undefined' || !window.matchMedia) return () => {};
	const mql = window.matchMedia(REDUCE_QUERY);
	mql.addEventListener('change', callback);
	return () => mql.removeEventListener('change', callback);
}

// useSyncExternalStore gives us tearing-free reads + automatic re-render on change.
function getSnapshot(): boolean {
	return prefersReducedMotion();
}

// SSR / first-render snapshot: null until the client reads matchMedia.
function getServerSnapshot(): null {
	return null;
}

export function useReducedMotion(): boolean | null {
	return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
