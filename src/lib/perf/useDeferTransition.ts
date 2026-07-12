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

import {startTransition, useTransition} from 'react';

/*
 * Wraps React's startTransition / useTransition for non-urgent store-driven
 * renders. The message list and other large surfaces re-render synchronously
 * on every store change; deferring the non-visible portion keeps input and
 * scroll responsive while the heavy list reconciliation happens at concurrent
 * priority.
 *
 * `defer(fn)` runs `fn` inside a transition (no pending-state tracking).
 * `useDeferTransition()` returns [isPending, defer] for components that want
 * to show a subtle loading affordance.
 */
export function defer(fn: () => void): void {
	startTransition(fn);
}

export function useDeferTransition(): [boolean, (fn: () => void) => void] {
	const [isPending, start] = useTransition();
	const run = (fn: () => void) => start(fn);
	return [isPending, run];
}
