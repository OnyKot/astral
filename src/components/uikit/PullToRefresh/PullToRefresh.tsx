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

import {ArrowClockwiseIcon} from '@phosphor-icons/react';
import {clsx} from 'clsx';
import React from 'react';
import {useKeyboardOpen} from '~/hooks/useKeyboardOpen';
import {usePullToRefresh} from '~/hooks/usePullToRefresh';
import styles from './PullToRefresh.module.css';

interface PullToRefreshProps {
	onRefresh: () => Promise<void> | void;
	enabled?: boolean;
	children: React.ReactNode;
	className?: string;
}

export const PullToRefresh: React.FC<PullToRefreshProps> = ({onRefresh, enabled = true, children, className}) => {
	const keyboardOpen = useKeyboardOpen();
	const gestureEnabled = enabled && !keyboardOpen;
	const {gestureProps, pullDistance, progress, isRefreshing} = usePullToRefresh({onRefresh, enabled: gestureEnabled});

	const armed = progress >= 1;
	const showIndicator = pullDistance > 0 && !isRefreshing;
	const indicatorRotation = Math.min(1, progress) * 210;

	return (
		<div
			className={clsx(styles.root, className)}
			{...gestureProps}
			style={{
				transform: pullDistance > 0 || isRefreshing ? `translateY(${pullDistance}px)` : undefined,
				transition: pullDistance === 0 && !isRefreshing ? 'transform 0.24s ease' : undefined,
			}}
		>
			<div
				className={clsx(styles.indicator, showIndicator && styles.indicatorVisible, armed && styles.indicatorArmed)}
				style={{
					opacity: showIndicator ? Math.min(1, progress) : 0,
					transform: `translateX(-50%) translateZ(0) scale(${0.78 + progress * 0.22})`,
				}}
				aria-hidden="true"
			>
				<span
					className={clsx(styles.indicatorGlyph, armed && styles.indicatorGlyphArmed)}
					style={{transform: `rotate(${indicatorRotation}deg)`}}
				>
					<ArrowClockwiseIcon weight="bold" />
				</span>
			</div>
			{children}
		</div>
	);
};
