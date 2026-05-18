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
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with Astral. If not, see <https://www.gnu.org/licenses/>.
 */

import {useLingui} from '@lingui/react/macro';
import {observer} from 'mobx-react-lite';
import React from 'react';
import MobileLayoutStore from '~/stores/MobileLayoutStore';
import styles from './ResizeHandle.module.css';

interface ResizeHandleProps {
	/*
	 * Returns the current size in px (read directly from the store
	 * each invocation so the drag tracks live state, not a stale
	 * snapshot from when the drag started).
	 */
	getSize: () => number;
	onResize: (nextPx: number) => void;
	onReset?: () => void;
	direction: 'left' | 'right';
	ariaLabel?: string;
	disabled?: boolean;
}

/*
 * Drag handle that lives on a fixed edge of a side panel and resizes
 * it horizontally. Use `direction="right"` for a panel whose handle
 * is on its RIGHT edge (sidebar growing rightward); use `"left"` for
 * a panel whose handle is on its LEFT edge (member list, growing
 * leftward). Double-click resets to default if `onReset` is provided.
 *
 * Hidden entirely on mobile layouts since the responsive shell
 * collapses panels into stacked sheets there and dragging makes no
 * sense.
 */
export const ResizeHandle: React.FC<ResizeHandleProps> = observer(
	({getSize, onResize, onReset, direction, ariaLabel, disabled = false}) => {
		const {t} = useLingui();
		const isMobile = MobileLayoutStore.isMobileLayout();
		const dragStateRef = React.useRef<{startX: number; startSize: number} | null>(null);
		const [isDragging, setIsDragging] = React.useState(false);

		const handlePointerDown = React.useCallback(
			(event: React.PointerEvent<HTMLDivElement>) => {
				if (disabled || event.button !== 0) return;
				event.preventDefault();
				event.stopPropagation();

				dragStateRef.current = {
					startX: event.clientX,
					startSize: getSize(),
				};
				setIsDragging(true);

				const handleMove = (moveEvent: PointerEvent) => {
					const drag = dragStateRef.current;
					if (!drag) return;
					const delta = moveEvent.clientX - drag.startX;
					const next = direction === 'right' ? drag.startSize + delta : drag.startSize - delta;
					onResize(next);
				};

				const handleUp = () => {
					dragStateRef.current = null;
					setIsDragging(false);
					window.removeEventListener('pointermove', handleMove);
					window.removeEventListener('pointerup', handleUp);
					window.removeEventListener('pointercancel', handleUp);
				};

				window.addEventListener('pointermove', handleMove);
				window.addEventListener('pointerup', handleUp);
				window.addEventListener('pointercancel', handleUp);
			},
			[direction, disabled, getSize, onResize],
		);

		const handleDoubleClick = React.useCallback(() => {
			if (disabled || !onReset) return;
			onReset();
		}, [disabled, onReset]);

		const handleKeyDown = React.useCallback(
			(event: React.KeyboardEvent<HTMLDivElement>) => {
				if (disabled) return;
				const STEP = event.shiftKey ? 24 : 8;
				if (event.key === 'ArrowLeft') {
					event.preventDefault();
					const cur = getSize();
					onResize(direction === 'right' ? cur - STEP : cur + STEP);
				} else if (event.key === 'ArrowRight') {
					event.preventDefault();
					const cur = getSize();
					onResize(direction === 'right' ? cur + STEP : cur - STEP);
				} else if (event.key === 'Home' && onReset) {
					event.preventDefault();
					onReset();
				}
			},
			[direction, disabled, getSize, onResize, onReset],
		);

		React.useEffect(() => {
			if (!isDragging) return;
			const previousCursor = document.body.style.cursor;
			const previousUserSelect = document.body.style.userSelect;
			document.body.style.cursor = 'col-resize';
			document.body.style.userSelect = 'none';
			return () => {
				document.body.style.cursor = previousCursor;
				document.body.style.userSelect = previousUserSelect;
			};
		}, [isDragging]);

		if (isMobile || disabled) return null;

		return (
			<div
				className={`${styles.handle} ${direction === 'left' ? styles.handleLeft : styles.handleRight} ${isDragging ? styles.handleActive : ''}`}
				role="separator"
				aria-orientation="vertical"
				aria-label={ariaLabel ?? t`Resize panel`}
				tabIndex={0}
				onPointerDown={handlePointerDown}
				onDoubleClick={handleDoubleClick}
				onKeyDown={handleKeyDown}
			>
				<div className={styles.bar} />
			</div>
		);
	},
);
