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
import {Spinner} from '~/components/uikit/Spinner';
import styles from './AuthPageStyles.module.css';

interface AuthLoadingStateProps {
	title?: string;
	description?: string;
	statusLabel?: string;
}

const getDefaultCopy = () => {
	const locale =
		(typeof document !== 'undefined' && document.documentElement.lang) ||
		(typeof navigator !== 'undefined' ? navigator.language : 'en');
	const isRussian = locale.toLowerCase().startsWith('ru');

	return isRussian
		? {
				title: '\u041f\u043e\u0434\u0433\u043e\u0442\u0430\u0432\u043b\u0438\u0432\u0430\u0435\u043c Astral',
				description:
					'\u0421\u043e\u0431\u0438\u0440\u0430\u0435\u043c \u0432\u0445\u043e\u0434, \u0443\u0432\u0435\u0434\u043e\u043c\u043b\u0435\u043d\u0438\u044f \u0438 \u043c\u043e\u0431\u0438\u043b\u044c\u043d\u0443\u044e \u043e\u0431\u043e\u043b\u043e\u0447\u043a\u0443 \u0431\u0435\u0437 \u043f\u0443\u0441\u0442\u043e\u0433\u043e \u044d\u043a\u0440\u0430\u043d\u0430.',
				statusLabel:
					'\u0417\u0430\u043f\u0443\u0441\u043a\u0430\u0435\u043c \u043d\u0430\u0442\u0438\u0432\u043d\u044b\u0439 \u0441\u043b\u043e\u0439',
			}
		: {
				title: 'Preparing Astral',
				description: 'Booting sign-in, notifications and the mobile shell without a blank screen.',
				statusLabel: 'Starting the native layer',
			};
};

export function AuthLoadingState({title, description, statusLabel}: AuthLoadingStateProps) {
	const copy = getDefaultCopy();
	const reducedMotion = useReducedMotion() ?? false;

	return (
		<div className={styles.loadingContainer}>
			<motion.div
				className={styles.loadingCard}
				initial={reducedMotion ? false : {opacity: 0, y: 14, scale: 0.98}}
				animate={reducedMotion ? {opacity: 1} : {opacity: 1, y: 0, scale: 1}}
				transition={reducedMotion ? {duration: 0.16} : {duration: 0.28, ease: [0.22, 1, 0.36, 1]}}
			>
				<div className={styles.loadingBadge}>Astral</div>
				<div className={styles.loadingHeader}>
					<div className={styles.loadingSpinnerWrap}>
						<Spinner />
					</div>
					<div className={styles.loadingBody}>
						<div className={styles.loadingTitle}>{title ?? copy.title}</div>
						<div className={styles.loadingText}>{description ?? copy.description}</div>
					</div>
				</div>
				<div className={styles.loadingStatusRow}>
					<span className={styles.loadingStatusDot} />
					<span className={styles.loadingStatusLabel}>{statusLabel ?? copy.statusLabel}</span>
				</div>
			</motion.div>
		</div>
	);
}
