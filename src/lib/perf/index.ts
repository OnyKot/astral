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

/*
 * Render & scroll optimization toolkit.
 *
 * The goal is to cut the cost of the large, flat-rendered lists across the
 * interface (message list, DM list, member list, channel list) without
 * breaking the existing ScrollManager behaviour (anchor preservation,
 * jump-to-message, load-more triggers) which depends on DOM nodes existing.
 *
 * Two complementary techniques:
 *
 *  1. `contentVisibility()` / the `.cvAuto` CSS class — the browser skips
 *     layout+paint of off-screen subtrees while keeping them in the DOM.
 *     This is the safe win for the message list: nodes stay queryable for
 *     ScrollManager's getElementById anchors, but cost ~nothing when scrolled
 *     out of view. Already proven on the DM list; generalized here.
 *
 *  2. `useViewportWindow` — true unmount-virtualization for surfaces where
 *     DOM nodes are NOT needed off-screen (member list, pickers, search
 *     results). Renders only items inside the viewport + an overscan band,
 *     replacing far-off-screen items with sized placeholders.
 *
 * Plus scheduling helpers (`useRafBatch`, `useDeferTransition`) to move
 * non-urgent store-driven re-renders off the synchronous critical path.
 */

export {useViewportWindow, type ViewportWindowOptions} from './useViewportWindow';
export {useRafBatch, type RafBatchedFn} from './useRafBatch';
export {useDeferTransition} from './useDeferTransition';
export {prefersReducedMotion} from './reducedMotion';
