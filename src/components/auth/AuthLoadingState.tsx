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

import {msg} from '@lingui/core/macro';
import {motion, useReducedMotion} from 'framer-motion';
import i18n from '~/i18n';
import styles from './AuthPageStyles.module.css';

interface AuthLoadingStateProps {
	title?: string;
	description?: string;
	statusLabel?: string;
}

const getDefaultCopy = () => {
	return {
		title: i18n._(msg`Preparing Astral`),
		statusLabel: i18n._(msg`Almost ready`),
	};
};

export function AuthLoadingState({title, description, statusLabel}: AuthLoadingStateProps) {
	const copy = getDefaultCopy();
	const reducedMotion = useReducedMotion() ?? false;

	return (
		<div className={styles.loadingContainer}>
			<motion.div
				className={styles.loadingCard}
				initial={reducedMotion ? false : {opacity: 0}}
				animate={{opacity: 1}}
				transition={{duration: reducedMotion ? 0.08 : 0.14, ease: 'easeOut'}}
			>
				<div className={styles.loadingHeader}>
					<div className={styles.loadingBody}>
						<div className={styles.loadingTitle}>{title ?? copy.title}</div>
						{description ? <div className={styles.loadingText}>{description}</div> : null}
					</div>
				</div>
				<div className={styles.loadingProgressTrack} aria-label={statusLabel ?? copy.statusLabel}>
					<span className={styles.loadingProgressBar} />
				</div>
			</motion.div>
		</div>
	);
}
