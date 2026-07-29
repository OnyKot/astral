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

import clsx from 'clsx';
import {AnimatePresence, motion, useReducedMotion} from 'framer-motion';
import type {ReactNode} from 'react';
import authLayoutStyles from '~/components/layout/AuthLayout.module.css';
import styles from './AuthCardContainer.module.css';

export interface AuthCardContainerProps {
	showLogoSide?: boolean;
	children: ReactNode;
	isInert?: boolean;
	className?: string;
	animateSize?: boolean;
	animateContent?: boolean;
	contentKey?: string;
}

export function AuthCardContainer({
	showLogoSide = true,
	children,
	isInert = false,
	className,
	animateSize = false,
	animateContent = false,
	contentKey = 'auth-content',
}: AuthCardContainerProps) {
	const prefersReducedMotion = useReducedMotion();
	const shouldAnimateSize = animateSize && !prefersReducedMotion;
	const shouldAnimateContent = animateContent && !prefersReducedMotion;
	const content = isInert ? <div className={styles.inertOverlay}>{children}</div> : children;

	return (
		<div className={clsx(authLayoutStyles.cardContainer, className)}>
			<motion.div
				layout={shouldAnimateSize}
				initial={shouldAnimateSize ? {opacity: 0, scaleX: 0.965, scaleY: 0.985} : false}
				animate={shouldAnimateSize ? {opacity: 1, scaleX: 1, scaleY: 1} : undefined}
				transition={{
					layout: {duration: 0.34, ease: [0.22, 1, 0.36, 1]},
					opacity: {duration: 0.18, ease: 'easeOut'},
					scaleX: {duration: 0.34, ease: [0.22, 1, 0.36, 1]},
					scaleY: {duration: 0.34, ease: [0.22, 1, 0.36, 1]},
				}}
				className={clsx(authLayoutStyles.card, !showLogoSide && authLayoutStyles.cardSingle)}
			>
				{showLogoSide && (
					<div className={authLayoutStyles.logoSide}>
						<div className={authLayoutStyles.wordmarkText}>Astral</div>
					</div>
				)}
				<div className={clsx(authLayoutStyles.formSide, !showLogoSide && authLayoutStyles.formSideSingle)}>
					{shouldAnimateContent ? (
						<AnimatePresence mode="wait">
							<motion.div
								key={contentKey}
								className={styles.contentMotion}
								initial={{opacity: 0, scale: 0.994}}
								animate={{opacity: 1, scale: 1}}
								exit={{opacity: 0, scale: 0.998}}
								transition={{duration: 0.2, ease: [0.22, 1, 0.36, 1]}}
							>
								{content}
							</motion.div>
						</AnimatePresence>
					) : (
						content
					)}
				</div>
			</motion.div>
		</div>
	);
}
