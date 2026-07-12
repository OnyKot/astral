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
import {AnimatePresence, motion, useReducedMotion} from 'framer-motion';
import type React from 'react';
import styles from '../ChannelIndexPage.module.css';

interface ChannelViewScaffoldProps {
	header: React.ReactNode;
	chatArea: React.ReactNode;
	sidePanel?: React.ReactNode | null;
	showMemberListDivider?: boolean;
	className?: string;
}

export const ChannelViewScaffold: React.FC<ChannelViewScaffoldProps> = ({
	header,
	chatArea,
	sidePanel = null,
	showMemberListDivider = false,
	className,
}) => {
	const prefersReducedMotion = useReducedMotion();
	const panelTransition = prefersReducedMotion
		? {duration: 0}
		: {duration: 0.2, ease: [0.22, 1, 0.36, 1] as const};

	return (
		<div className={clsx(styles.channelGrid, className)}>
			<div>{header}</div>
			<div className={styles.contentGrid}>
				{showMemberListDivider && <div className={styles.memberListDivider} />}
				{chatArea}
				<AnimatePresence initial={false} mode="wait">
					{sidePanel && (
						<motion.div
							key={showMemberListDivider ? 'member-panel' : 'side-panel'}
							className={styles.sidePanelMotion}
							initial={prefersReducedMotion ? false : {opacity: 0, x: 12}}
							animate={{opacity: 1, x: 0}}
							exit={prefersReducedMotion ? {opacity: 0} : {opacity: 0, x: 8}}
							transition={panelTransition}
						>
							{sidePanel}
						</motion.div>
					)}
				</AnimatePresence>
			</div>
		</div>
	);
};
