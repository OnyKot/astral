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
 * useDragControls — initiator handle for programmatic drag.
 *
 * Modal uses this: `dragListener={false}` so the element doesn't start a drag
 * on pointerdown itself; instead a touch listener on the header calls
 * `dragControls.start(event)` to begin. The controls hold a reference to the
 * drag implementation the motion component registered, and `.start()` just
 * forwards the event to it.
 */

import {useMemo} from 'react';

import type {DragControls, DragImpl} from '../types';

export function useDragControls(): DragControls {
	return useMemo<DragControls>(() => {
		let impl: DragImpl | null = null;
		return {
			start(event, _opts) {
				if (!impl) return;
				impl.beginDrag(event as PointerEvent);
			},
			_mount(next) {
				impl = next;
				return () => {
					if (impl === next) impl = null;
				};
			},
		};
	}, []);
}
