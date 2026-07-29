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
import {CheckIcon} from '@phosphor-icons/react';
import {motion, useReducedMotion} from 'framer-motion';
import {observer} from 'mobx-react-lite';
import MobileLayoutStore from '~/stores/MobileLayoutStore';
import * as DateUtils from '~/utils/DateUtils';
import styles from './Messages.module.css';

export const NewMessagesBar = observer(function NewMessagesBar({
	unreadCount,
	oldestUnreadTimestamp,
	isEstimated,
	onJumpToNewMessages,
}: {
	unreadCount: number;
	oldestUnreadTimestamp: number;
	isEstimated: boolean;
	onJumpToNewMessages: () => void;
}) {
	const {t} = useLingui();
	const reducedMotion = useReducedMotion() ?? false;

	const isMobile = MobileLayoutStore.isMobileLayout();
	const sameDay = DateUtils.isSameDay(oldestUnreadTimestamp);
	const compactTime = DateUtils.getFormattedCompactDateTime(oldestUnreadTimestamp);
	const shortTime = sameDay ? DateUtils.getFormattedTime(oldestUnreadTimestamp) : compactTime;
	const label = isEstimated
		? isMobile
			? t`${unreadCount}+ new since ${shortTime}`
			: t`${unreadCount}+ new messages since ${compactTime}`
		: isMobile
			? t`${unreadCount} new since ${shortTime}`
			: unreadCount === 1
				? t`${unreadCount} new message since ${compactTime}`
				: t`${unreadCount} new messages since ${compactTime}`;

	/*
	 * The "new messages since X" bar slides down from the top of the message
	 * list when the channel mounts with unread content. The animation is
	 * deliberately gentler than the JumpToPresent bar (no scale change,
	 * smaller travel) so it does not distract from message reading.
	 */
	const motionProps = reducedMotion
		? {initial: {opacity: 0}, animate: {opacity: 1}, transition: {duration: 0.12}}
		: {
				initial: {opacity: 0, y: -10},
				animate: {opacity: 1, y: 0},
				transition: {type: 'spring' as const, stiffness: 420, damping: 32, mass: 0.7},
			};

	const content = (
		<>
			<span className={styles.newMessagesBarText}>{label}</span>

			<span className={styles.newMessagesBarAction}>
				<span>{isMobile ? t`Mark Read` : t`Mark as Read`}</span>
				<CheckIcon weight="bold" size={16} />
			</span>
		</>
	);

	if (isMobile) {
		return (
			<button
				type="button"
				className={`${styles.newMessagesBar} ${styles.newMessagesBarMobile}`}
				onClick={onJumpToNewMessages}
			>
				{content}
			</button>
		);
	}

	return (
		<motion.button type="button" className={styles.newMessagesBar} onClick={onJumpToNewMessages} {...motionProps}>
			{content}
		</motion.button>
	);
});
