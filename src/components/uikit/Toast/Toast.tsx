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

import {CheckIcon, XIcon} from '@phosphor-icons/react';
import {motion, useReducedMotion} from 'framer-motion';
import {observer} from 'mobx-react-lite';
import {useCallback, useEffect} from 'react';
import type {ToastPropsExtended} from '~/components/uikit/Toast';
import {isMobileExperienceEnabled} from '~/utils/mobileExperience';
import styles from './Toast.module.css';

const MINIMUM_TIMEOUT = 1500;

export const Toast = observer(
	({id, type, children, timeout = MINIMUM_TIMEOUT, onClick, onTimeout, onClose, closeToast}: ToastPropsExtended) => {
		const isMobileExperience = isMobileExperienceEnabled();
		const reducedMotion = useReducedMotion() ?? false;

		useEffect(() => {
			const finalTimeout = Math.max(timeout, MINIMUM_TIMEOUT);
			const timer = setTimeout(() => {
				if (onTimeout) onTimeout();
				else closeToast(id);
			}, finalTimeout);
			return () => clearTimeout(timer);
		}, [timeout, onTimeout, closeToast, id]);

		useEffect(() => {
			return () => {
				if (onClose) onClose();
			};
		}, [onClose]);

		const handleClick = useCallback(
			(event: React.MouseEvent) => {
				if (onClick) onClick(event);
				else closeToast(id);
			},
			[onClick, closeToast, id],
		);

		/*
		 * Spring-based entrance with a subtle scale punch so toasts feel more
		 * reactive than a flat opacity/y slide. `layout` keeps the stack tidy
		 * when an earlier toast dismisses — siblings glide into their new
		 * positions instead of snapping. Reduced motion collapses everything
		 * to a plain 0.1s fade so the accessibility story stays clean.
		 */
		const motionProps = reducedMotion
			? {
					initial: {opacity: 0},
					animate: {opacity: 1},
					exit: {opacity: 0},
					transition: {duration: 0.1},
				}
			: {
					initial: {opacity: 0, y: -28, scale: 0.9},
					animate: {opacity: 1, y: 0, scale: 1},
					exit: {
						opacity: 0,
						y: -12,
						scale: 0.96,
						transition: {duration: 0.18, ease: [0.4, 0, 1, 1] as const},
					},
					transition: {
						// Tighter spring than before — snappier arrival, less
						// post-settle wobble. Matches --motion-dur-medium.
						type: 'spring' as const,
						stiffness: 420,
						damping: 28,
						mass: 0.7,
						restDelta: 0.001,
					},
				};

		return (
			<motion.div
				onClick={handleClick}
				className={`${styles.toast} ${isMobileExperience ? styles.toastMobile : styles.toastDesktop}`}
				layout
				{...motionProps}
			>
				{type === 'success' ? (
					<CheckIcon
						weight="bold"
						className={`${styles.icon} ${styles.iconSuccess} ${isMobileExperience ? styles.iconMobile : styles.iconDesktop}`}
					/>
				) : type === 'error' ? (
					<XIcon
						weight="bold"
						className={`${styles.icon} ${styles.iconError} ${isMobileExperience ? styles.iconMobile : styles.iconDesktop}`}
					/>
				) : null}
				<span className={`${styles.text} ${isMobileExperience ? styles.textMobile : styles.textDesktop}`}>
					{children}
				</span>
				<button
					type="button"
					className={styles.closeButton}
					onClick={(event) => {
						event.preventDefault();
						event.stopPropagation();
						closeToast(id);
					}}
					aria-label="Close notification"
				>
					<XIcon weight="bold" className={styles.closeIcon} />
				</button>
			</motion.div>
		);
	},
);
