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

import {XIcon} from '@phosphor-icons/react';
import {clsx} from 'clsx';
import {observer} from 'mobx-react-lite';
import type React from 'react';
import {NativeDragRegion} from '~/components/layout/NativeDragRegion';
import FocusRing from '~/components/uikit/FocusRing/FocusRing';
import styles from './Nagbar.module.css';

interface NagbarProps {
	isMobile: boolean;
	backgroundColor: string;
	textColor: string;
	children: React.ReactNode;
	onDismiss?: () => void;
	dismissible?: boolean;
}

export const Nagbar = observer(
	({isMobile, backgroundColor, textColor, children, onDismiss, dismissible = false}: NagbarProps) => {
		const showDismissButton = dismissible && onDismiss;
		const handleDismissPointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
			event.stopPropagation();
		};
		const handleDismissClick = (event: React.MouseEvent<HTMLButtonElement>) => {
			event.preventDefault();
			event.stopPropagation();
			onDismiss?.();
		};

		return (
			<NativeDragRegion
				className={clsx(
					styles.nagbar,
					isMobile ? styles.nagbarMobile : styles.nagbarDesktop,
					showDismissButton && styles.nagbarDismissible,
				)}
				style={
					{
						'--nagbar-background-color': backgroundColor,
						'--nagbar-text-color': textColor,
					} as React.CSSProperties
				}
			>
				{children}
				{showDismissButton && (
					<FocusRing>
						<button
							type="button"
							className={clsx(styles.dismissButton, 'no-press-feedback')}
							style={{color: textColor}}
							aria-label="Close"
							onPointerDown={handleDismissPointerDown}
							onClick={handleDismissClick}
						>
							<XIcon weight="regular" className={styles.dismissIcon} />
						</button>
					</FocusRing>
				)}
			</NativeDragRegion>
		);
	},
);
