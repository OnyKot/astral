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

import {Trans} from '@lingui/react/macro';
import {AnimatePresence, motion, useReducedMotion} from 'framer-motion';
import {observer} from 'mobx-react-lite';
import React from 'react';
import ConnectionStore from '~/stores/ConnectionStore';
import styles from './GatewayConnectionBanner.module.css';

/*
 * Top-of-app slide-down banner that surfaces gateway disconnects.
 * Previously when the WebSocket dropped, the app silently froze on
 * stale state until reconnect — users had no signal whether they
 * could keep typing or whether the bug was on their side. The bar
 * appears after a 600ms grace period (so a quick blip doesn't flash
 * a banner) and disappears as soon as we're connected again.
 */
const APPEAR_DELAY_MS = 600;

export const GatewayConnectionBanner = observer(function GatewayConnectionBanner() {
	const {isConnected, isConnecting} = ConnectionStore;
	const reducedMotion = useReducedMotion() ?? false;
	const [shouldShow, setShouldShow] = React.useState(false);

	React.useEffect(() => {
		if (isConnected) {
			setShouldShow(false);
			return;
		}

		const timer = window.setTimeout(() => setShouldShow(true), APPEAR_DELAY_MS);
		return () => window.clearTimeout(timer);
	}, [isConnected]);

	const motionProps = reducedMotion
		? {
				initial: {opacity: 0},
				animate: {opacity: 1},
				exit: {opacity: 0},
				transition: {duration: 0.12},
			}
		: {
				initial: {opacity: 0, y: -32},
				animate: {opacity: 1, y: 0},
				exit: {opacity: 0, y: -16, transition: {duration: 0.18, ease: 'easeIn' as const}},
				transition: {type: 'spring' as const, stiffness: 400, damping: 32, mass: 0.7},
			};

	return (
		<AnimatePresence>
			{shouldShow && (
				<motion.div
					key="gateway-banner"
					className={styles.banner}
					role="status"
					aria-live="polite"
					{...motionProps}
				>
					<span className={styles.dot} />
					<span className={styles.text}>
						{isConnecting ? <Trans>Reconnecting to Astral…</Trans> : <Trans>You're offline. Trying to reconnect…</Trans>}
					</span>
				</motion.div>
			)}
		</AnimatePresence>
	);
});
