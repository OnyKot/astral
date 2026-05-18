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
import AlienSvg from '~/assets/emojload/Alien.svg';
import FaceWithMonocleSvg from '~/assets/emojload/Face With Monocle.svg';
import LogoSvg from '~/assets/emojload/logo.svg';
import NewMoonFaceSvg from '~/assets/emojload/New Moon Face.svg';
import SmilingFaceWithHeartEyesSvg from '~/assets/emojload/Smiling Face With Heart Eyes.svg';
import SmilingFaceWithHornsSvg from '~/assets/emojload/Smiling Face With Horns.svg';
import UnicornSvg from '~/assets/emojload/Unicorn.svg';
import ConnectionStore from '~/stores/ConnectionStore';
import DeveloperOptionsStore from '~/stores/DeveloperOptionsStore';
import InitializationStore from '~/stores/InitializationStore';
import {getAndroidAppInfo, type AndroidAppInfo, isNativeAndroidApp} from '~/utils/AndroidAppInfo';
import {isNativeMobile} from '~/utils/NativeUtils';
import {NativeDragRegion} from './NativeDragRegion';
import styles from './SplashScreen.module.css';

const SPLASH_SCREEN_DELAY = 10000;
const LOADING_FRAME_DELAY_MS = 500;

const LOADING_FRAMES = [
	{id: 'logo', src: LogoSvg},
	{id: 'alien', src: AlienSvg},
	{id: 'face-with-monocle', src: FaceWithMonocleSvg},
	{id: 'new-moon-face', src: NewMoonFaceSvg},
	{id: 'smiling-face-with-heart-eyes', src: SmilingFaceWithHeartEyesSvg},
	{id: 'smiling-face-with-horns', src: SmilingFaceWithHornsSvg},
	{id: 'unicorn', src: UnicornSvg},
] as const;

export const SplashScreen = observer(() => {
	const shouldBypass = DeveloperOptionsStore.bypassSplashScreen;
	const connected = ConnectionStore.isConnected;
	const isInitialized = InitializationStore.canNavigateToProtectedRoutes;
	const [showSplash, setShowSplash] = React.useState(true);

	React.useEffect(() => {
		if (connected && isInitialized) {
			setShowSplash(false);
			return;
		}

		const timer = setTimeout(() => setShowSplash(true), SPLASH_SCREEN_DELAY);
		return () => clearTimeout(timer);
	}, [connected, isInitialized]);

	if (shouldBypass) return null;
	return (
		<AnimatePresence initial={false}>
			{showSplash && <SplashScreenContent connected={connected} isInitialized={isInitialized} />}
		</AnimatePresence>
	);
});

const SplashScreenContent = observer(({connected, isInitialized}: {connected: boolean; isInitialized: boolean}) => {
	const nativeMobile = isNativeMobile();
	const reducedMotion = useReducedMotion() ?? false;
	const [appInfo, setAppInfo] = React.useState<AndroidAppInfo | null>(null);
	const [loadingFrameIndex, setLoadingFrameIndex] = React.useState(0);

	React.useEffect(() => {
		if (!nativeMobile) {
			return;
		}

		let cancelled = false;
		void getAndroidAppInfo().then((info) => {
			if (!cancelled) {
				setAppInfo(info);
			}
		});

		return () => {
			cancelled = true;
		};
	}, [nativeMobile]);

	React.useEffect(() => {
		if (reducedMotion) {
			setLoadingFrameIndex(0);
			return;
		}

		const timer = window.setInterval(() => {
			setLoadingFrameIndex((current) => (current + 1) % LOADING_FRAMES.length);
		}, LOADING_FRAME_DELAY_MS);

		return () => {
			window.clearInterval(timer);
		};
	}, [reducedMotion]);

	const activeLoadingFrame = LOADING_FRAMES[loadingFrameIndex] ?? LOADING_FRAMES[LOADING_FRAMES.length - 1];

	return (
		<motion.div
			initial={reducedMotion ? false : {opacity: 0}}
			animate={{opacity: 1}}
			exit={{opacity: 0}}
			transition={{duration: reducedMotion ? 0.16 : 0.5}}
			className={styles.splashOverlay}
		>
			<NativeDragRegion className={styles.topDragRegion} />
			<div className={styles.splashContent}>
				{nativeMobile ? (
					<div className={styles.mobileSplashCard}>
						<div className={styles.mobileSplashGlow} aria-hidden="true" />
						<div className={styles.mobileSplashTopRow}>
							<div className={styles.mobileSplashBadge}>
								{isNativeAndroidApp() ? <Trans>Android build</Trans> : <Trans>Native build</Trans>}
							</div>
							{appInfo?.versionName ? <div className={styles.mobileSplashVersion}>v{appInfo.versionName}</div> : null}
						</div>
						<div className={styles.mobileSplashHeader}>
							<div className={styles.iconWrapper}>
								<div className={styles.iconPulse} />
								<div className={styles.animatedMark} aria-hidden="true">
									<AnimatePresence initial={false} mode="wait">
										<motion.img
											key={activeLoadingFrame.id}
											src={activeLoadingFrame.src}
											alt=""
											aria-hidden="true"
											draggable={false}
											className={styles.loadingFrameImage}
											initial={reducedMotion ? false : {opacity: 0, x: 20, scale: 0.96}}
											animate={{opacity: 1, x: 0, scale: 1}}
											exit={reducedMotion ? {opacity: 0} : {opacity: 0, x: -20, scale: 0.98}}
											transition={reducedMotion ? {duration: 0.08} : {duration: 0.26, ease: [0.22, 1, 0.36, 1]}}
										/>
									</AnimatePresence>
								</div>
							</div>
							<div className={styles.mobileSplashText}>
								<div className={styles.mobileSplashTitle}>Astral</div>
								<div className={styles.mobileSplashSubtitle}>
									{connected && !isInitialized ? (
										<Trans>Restoring chats, calls and notifications.</Trans>
									) : (
										<Trans>Booting the native shell.</Trans>
									)}
								</div>
							</div>
						</div>
						<div className={styles.mobileSplashStatusStrip}>
							<div className={styles.mobileSplashStatusPill}>
								<span className={styles.mobileSplashStatusDot} />
								<span>{connected ? <Trans>Secure link</Trans> : <Trans>Connecting</Trans>}</span>
							</div>
							<div className={styles.mobileSplashStatusPill}>
								<span className={styles.mobileSplashStatusDot} />
								<span>
									{appInfo?.nativePushConfigured ? (
										<Trans>Notifications ready</Trans>
									) : (
										<Trans>Preparing notifications</Trans>
									)}
								</span>
							</div>
						</div>
						<div className={styles.mobileSplashSteps}>
							<div className={styles.mobileSplashStep}>
								<span className={styles.mobileSplashStepDot} />
								<span>{connected ? <Trans>Session connected</Trans> : <Trans>Securing session</Trans>}</span>
							</div>
							<div className={styles.mobileSplashStep}>
								<span className={styles.mobileSplashStepDot} />
								<span>{isInitialized ? <Trans>Ready to open</Trans> : <Trans>Syncing messages and voice</Trans>}</span>
							</div>
						</div>
					</div>
				) : (
					<>
						<div className={styles.iconWrapper}>
							<div className={styles.iconPulse} />
							<div className={styles.animatedMark} aria-hidden="true">
								<AnimatePresence initial={false} mode="wait">
									<motion.img
										key={activeLoadingFrame.id}
										src={activeLoadingFrame.src}
										alt=""
										aria-hidden="true"
										draggable={false}
										className={styles.loadingFrameImage}
										initial={reducedMotion ? false : {opacity: 0, x: 20, scale: 0.96}}
										animate={{opacity: 1, x: 0, scale: 1}}
										exit={reducedMotion ? {opacity: 0} : {opacity: 0, x: -20, scale: 0.98}}
										transition={reducedMotion ? {duration: 0.08} : {duration: 0.26, ease: [0.22, 1, 0.36, 1]}}
									/>
								</AnimatePresence>
							</div>
						</div>
					</>
				)}
			</div>
			<div className={styles.splashVersionLabel}>Astral 3.0</div>
		</motion.div>
	);
});
