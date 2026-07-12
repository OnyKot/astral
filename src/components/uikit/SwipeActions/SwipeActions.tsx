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

import {clsx} from 'clsx';
import React from 'react';
import {useSwipeAction} from '~/hooks/useSwipeAction';
import {SWIPE_RELEASE_EASE} from '~/utils/motion/swipeGestures';
import styles from './SwipeActions.module.css';

interface SwipeActionSpec {
	icon: React.ReactNode;
	label: string;
	color?: string;
	onAction: () => void;
}

interface SwipeActionsProps {
	action: SwipeActionSpec;
	enabled?: boolean;
	direction?: 'left' | 'right';
	children: React.ReactNode;
	className?: string;
}

export const SwipeActions: React.FC<SwipeActionsProps> = ({
	action,
	enabled = true,
	direction = 'left',
	children,
	className,
}) => {
	const {gestureProps, offset, progress, armed, isDragging} = useSwipeAction({
		enabled,
		direction,
		onAction: action.onAction,
	});

	const translateX = direction === 'left' ? -offset : offset;
	const revealWidth = Math.max(0, offset);

	return (
		<div className={clsx(styles.root, className)} {...gestureProps}>
			{/* The action strip always fills the revealed gap. */}
			<div
				className={clsx(
					styles.actionLayer,
					direction === 'left' ? styles.actionLayerRight : styles.actionLayerLeft,
					armed && styles.actionLayerArmed,
				)}
				style={{
					opacity: revealWidth > 4 ? 1 : 0,
					'--swipe-action-background': action.color,
					'--swipe-action-progress': progress,
					width: revealWidth > 0 ? `${revealWidth}px` : undefined,
				} as React.CSSProperties}
				aria-hidden="true"
			>
				<div
					className={clsx(styles.actionBody, !action.label && styles.actionBodyIconOnly)}
					style={{opacity: 0.38 + Math.min(1, progress) * 0.62}}
				>
					<div
						className={styles.actionIcon}
						style={{transform: `scale(${0.84 + progress * 0.22})`}}
					>
						{action.icon}
					</div>
					{progress > 0.24 && action.label && (
						<span className={styles.actionLabel}>{action.label}</span>
					)}
				</div>
			</div>
			<div
				className={styles.content}
				style={{
					transform: `translate3d(${translateX}px, 0, 0)`,
					transition: isDragging ? 'none' : `transform 0.34s ${SWIPE_RELEASE_EASE}`,
				}}
			>
				{children}
			</div>
		</div>
	);
};
