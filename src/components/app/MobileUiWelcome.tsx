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

import {Trans, useLingui} from '@lingui/react/macro';
import {AnimatePresence, motion, useReducedMotion} from 'framer-motion';
import {observer} from 'mobx-react-lite';
import React from 'react';
import AppStorage from '~/lib/AppStorage';
import MobileLayoutStore from '~/stores/MobileLayoutStore';
import UserStore from '~/stores/UserStore';
import styles from './MobileUiWelcome.module.css';

const STORAGE_PREFIX = 'astral:mobile-ui-welcome:v1:';
const SHOW_DELAY_MS = 650;
const DISPLAY_DURATION_MS = 4200;

export const MobileUiWelcome = observer(() => {
	const {t} = useLingui();
	const reducedMotion = useReducedMotion() ?? false;
	const isMobile = MobileLayoutStore.isMobileLayout();
	const userId = UserStore.currentUser?.id ?? null;
	const [isVisible, setIsVisible] = React.useState(false);

	React.useEffect(() => {
		setIsVisible(false);
		if (!isMobile || !userId) {
			return;
		}

		const storageKey = `${STORAGE_PREFIX}${userId}`;
		if (AppStorage.getItem(storageKey) === '1') {
			return;
		}

		const showTimer = window.setTimeout(() => {
			AppStorage.setItem(storageKey, '1');
			setIsVisible(true);
		}, SHOW_DELAY_MS);
		const hideTimer = window.setTimeout(() => {
			setIsVisible(false);
		}, SHOW_DELAY_MS + DISPLAY_DURATION_MS);

		return () => {
			window.clearTimeout(showTimer);
			window.clearTimeout(hideTimer);
		};
	}, [isMobile, userId]);

	return (
		<AnimatePresence>
			{isVisible && (
				<motion.aside
					className={styles.overlay}
					role="status"
					aria-label={t`New mobile interface`}
					initial={reducedMotion ? false : {opacity: 0}}
					animate={{opacity: 1}}
					exit={{opacity: 0}}
					transition={{duration: reducedMotion ? 0 : 0.55, ease: [0.22, 1, 0.36, 1]}}
				>
					<motion.div
						className={styles.copy}
						initial={reducedMotion ? false : {opacity: 0, y: 14, scale: 0.97}}
						animate={{opacity: 1, y: 0, scale: 1}}
						exit={{opacity: 0, y: -8, scale: 0.985}}
						transition={{duration: reducedMotion ? 0 : 0.6, delay: 0.12, ease: [0.22, 1, 0.36, 1]}}
					>
						<span className={styles.badge}>
							<Trans>New mobile UI</Trans>
						</span>
						<strong className={styles.title}>
							<Trans>A faster way through Astral</Trans>
						</strong>
						<span className={styles.description}>
							<Trans>Swipe from the left edge to open navigation anywhere.</Trans>
						</span>
					</motion.div>
					<div className={styles.leftGlow} aria-hidden />
					<div className={styles.rightGlow} aria-hidden />
					<div className={styles.topGlow} aria-hidden />
					<div className={styles.bottomGlow} aria-hidden />
				</motion.aside>
			)}
		</AnimatePresence>
	);
});
