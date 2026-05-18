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

import {motion, useReducedMotion} from 'framer-motion';
import {UsersThreeIcon} from '@phosphor-icons/react';
import {observer} from 'mobx-react-lite';
import type React from 'react';
import styles from './EmptyStateView.module.css';

interface EmptyStateViewProps {
	title: string;
	subtitle: string;
	action?: {
		label: string;
		onClick: () => void;
	};
	icon?: React.ReactNode;
}

export const EmptyStateView = observer(({title, subtitle, action, icon}: EmptyStateViewProps) => {
	const prefersReducedMotion = useReducedMotion();

	return (
		<motion.div
			className={styles.container}
			initial={prefersReducedMotion ? false : {opacity: 0, y: 18, scale: 0.985}}
			animate={prefersReducedMotion ? {opacity: 1} : {opacity: 1, y: 0, scale: 1}}
			transition={prefersReducedMotion ? {duration: 0} : {duration: 0.32, ease: [0.22, 1, 0.36, 1]}}
		>
			<div className={styles.card}>
				<div className={styles.iconShell}>
					{icon ?? <UsersThreeIcon weight="fill" className={styles.icon} />}
				</div>
				<h2 className={styles.title}>{title}</h2>
				<p className={styles.subtitle}>{subtitle}</p>
				{action && (
					<button type="button" className={styles.action} onClick={action.onClick}>
						{action.label}
					</button>
				)}
			</div>
		</motion.div>
	);
});
