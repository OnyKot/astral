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
import {ArrowDownIcon} from '@phosphor-icons/react';
import React from 'react';
import {hapticTap} from '~/utils/haptics';
import styles from './ScrollToBottomButton.module.css';

interface ScrollToBottomButtonProps {
	unreadCount?: number;
	onClick: () => void;
}

/*
 * Floating action button that appears on the bottom-right of the
 * message list when the user has scrolled up. Unlike JumpToPresentBar
 * (which shows when there are older messages not yet loaded —
 * `hasMoreAfter`) this one handles the common case: user has loaded
 * messages, scrolled up within them, and wants to jump back down.
 *
 * Shows an unread badge if the channel has unreads — gives a visual
 * hook for "I see there's activity below, take me there" without
 * requiring the NewMessagesBar at the top.
 */
export const ScrollToBottomButton: React.FC<ScrollToBottomButtonProps> = ({unreadCount = 0, onClick}) => {
	const {t} = useLingui();

	const handleClick = () => {
		hapticTap();
		onClick();
	};

	const displayCount = unreadCount > 99 ? '99+' : String(unreadCount);

	return (
		<button
			type="button"
			className={styles.button}
			onClick={handleClick}
			aria-label={
				unreadCount > 0
					? t`Jump to latest (${displayCount} unread)`
					: t`Jump to latest messages`
			}
		>
			<ArrowDownIcon weight="bold" className={styles.icon} aria-hidden="true" />
			{unreadCount > 0 && (
				<span className={styles.unreadBadge} aria-hidden="true">
					{displayCount}
				</span>
			)}
		</button>
	);
};
