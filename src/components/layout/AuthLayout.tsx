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

import {I18nProvider} from '@lingui/react';
import clsx from 'clsx';
import {observer} from 'mobx-react-lite';
import {type ReactNode, Suspense, useCallback, useEffect, useMemo, useRef, useState} from 'react';
import type {GuildSplashCardAlignmentValue} from '~/Constants';
import {GuildSplashCardAlignment} from '~/Constants';
import {AuthBackground} from '~/components/auth/AuthBackground';
import {AuthCardContainer} from '~/components/auth/AuthCardContainer';
import {AuthLoadingState} from '~/components/auth/AuthLoadingState';
import {NativeDragRegion} from '~/components/layout/NativeDragRegion';
import {NativeTitlebar} from '~/components/layout/NativeTitlebar';
import {Scroller, type ScrollerHandle} from '~/components/uikit/Scroller';
import {AuthLayoutContext} from '~/contexts/AuthLayoutContext';
import {useSetLayoutVariant} from '~/contexts/LayoutVariantContext';
import {useAuthBackground} from '~/hooks/useAuthBackground';
import {useNativePlatform} from '~/hooks/useNativePlatform';
import i18n, {initI18n} from '~/i18n';
import foodPatternUrl from '~/images/ilikestars.svg';
import {useLocation} from '~/lib/router';
import {isMobileExperienceEnabled} from '~/utils/mobileExperience';
import styles from './AuthLayout.module.css';

type NavigatorWithPerformanceHints = Navigator & {
	deviceMemory?: number;
	hardwareConcurrency?: number;
	connection?: {
		saveData?: boolean;
		effectiveType?: string;
		addEventListener?: (type: 'change', listener: () => void) => void;
		removeEventListener?: (type: 'change', listener: () => void) => void;
	};
};

const LOW_END_CONNECTION_TYPES = new Set(['slow-2g', '2g']);

function shouldUseLiteAuthEffects(): boolean {
	if (typeof window === 'undefined') return false;

	const prefersReducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches === true;
	const navigatorWithHints = navigator as NavigatorWithPerformanceHints;
	const memoryGb = navigatorWithHints.deviceMemory;
	const cpuThreads = navigatorWithHints.hardwareConcurrency;
	const saveData = navigatorWithHints.connection?.saveData === true;
	const lowBandwidth = LOW_END_CONNECTION_TYPES.has(navigatorWithHints.connection?.effectiveType ?? '');
	const lowMemory = typeof memoryGb === 'number' && memoryGb <= 4;
	const lowCpu = typeof cpuThreads === 'number' && cpuThreads <= 4;

	return prefersReducedMotion || saveData || lowBandwidth || lowMemory || lowCpu;
}

const AuthLayoutContent = observer(function AuthLayoutContent({children}: {children?: ReactNode}) {
	const [viewportHeight, setViewportHeight] = useState(() => window.innerHeight);
	const [viewportWidth, setViewportWidth] = useState(() => window.innerWidth);
	const [splashUrl, setSplashUrl] = useState<string | null>(null);
	const [showLogoSide, setShowLogoSide] = useState(true);
	const [useLiteAuthEffects, setUseLiteAuthEffects] = useState<boolean>(() => shouldUseLiteAuthEffects());
	const [splashAlignment, setSplashAlignment] = useState<GuildSplashCardAlignmentValue>(
		GuildSplashCardAlignment.CENTER,
	);
	const {isNative, isMacOS, platform} = useNativePlatform();
	const splashUrlRef = useRef<string | null>(null);
	const scrollerRef = useRef<ScrollerHandle>(null);
	const location = useLocation();

	const {patternReady, splashLoaded, splashDimensions} = useAuthBackground(splashUrl, foodPatternUrl);

	const handleSetSplashUrl = useCallback(
		(url: string | null) => {
			if (splashUrlRef.current === url) return;
			splashUrlRef.current = url;
			setSplashUrl(url);
			if (!url) {
				setSplashAlignment(GuildSplashCardAlignment.CENTER);
			}
		},
		[setSplashAlignment],
	);

	useEffect(() => {
		const handleResize = () => {
			setViewportWidth(window.innerWidth);
			setViewportHeight(window.innerHeight);
		};
		handleResize();
		window.addEventListener('resize', handleResize);
		return () => window.removeEventListener('resize', handleResize);
	}, []);

	useEffect(() => {
		document.documentElement.classList.add('auth-page');
		return () => {
			document.documentElement.classList.remove('auth-page');
		};
	}, []);

	useEffect(() => {
		scrollerRef.current?.scrollToTop();
	}, [location.pathname]);

	const splashScale = useMemo(() => {
		if (!splashDimensions) return null;
		const {width, height} = splashDimensions;
		if (width <= 0 || height <= 0) return null;
		const heightScale = viewportHeight / height;
		const widthScale = viewportWidth / width;
		return Math.max(heightScale, widthScale);
	}, [splashDimensions, viewportHeight, viewportWidth]);

	const isMobileExperience = isMobileExperienceEnabled();

	useEffect(() => {
		const updateLiteMode = () => {
			setUseLiteAuthEffects(shouldUseLiteAuthEffects());
		};

		updateLiteMode();

		const motionMedia = window.matchMedia?.('(prefers-reduced-motion: reduce)');
		const handleMotionChange = () => {
			updateLiteMode();
		};

		if (motionMedia) {
			if ('addEventListener' in motionMedia) {
				motionMedia.addEventListener('change', handleMotionChange);
			} else {
				// Legacy Safari / Chromium API
				(motionMedia as MediaQueryList & {addListener?: (listener: () => void) => void}).addListener?.(handleMotionChange);
			}
		}

		const connection = (navigator as NavigatorWithPerformanceHints).connection;
		const handleConnectionChange = () => {
			updateLiteMode();
		};
		connection?.addEventListener?.('change', handleConnectionChange);

		return () => {
			if (motionMedia) {
				if ('removeEventListener' in motionMedia) {
					motionMedia.removeEventListener('change', handleMotionChange);
				} else {
					// Legacy Safari / Chromium API
					(motionMedia as MediaQueryList & {removeListener?: (listener: () => void) => void}).removeListener?.(
						handleMotionChange,
					);
				}
			}
			connection?.removeEventListener?.('change', handleConnectionChange);
		};
	}, []);

	useEffect(() => {
		const root = document.documentElement;
		const shouldEnableLite = isMobileExperience || useLiteAuthEffects;
		root.classList.toggle('auth-lite-effects', shouldEnableLite);
		return () => {
			root.classList.remove('auth-lite-effects');
		};
	}, [isMobileExperience, useLiteAuthEffects]);

	if (isMobileExperience) {
		return (
			<AuthLayoutContext.Provider
				value={{
					setSplashUrl: handleSetSplashUrl,
					setShowLogoSide,
					setSplashCardAlignment: setSplashAlignment,
				}}
			>
				<NativeDragRegion className={styles.topDragRegion} />
				<div className={styles.scrollerWrapper}>
					<Scroller ref={scrollerRef} className={styles.mobileContainer} fade={false} key="auth-layout-mobile-scroller">
						<div className={styles.mobileContent}>
							<div className={styles.mobileLogoContainer}>
								<div className={styles.mobileWordmarkText}>Astral</div>
							</div>
							{children}
						</div>
					</Scroller>
				</div>
			</AuthLayoutContext.Provider>
		);
	}
	return (
		<AuthLayoutContext.Provider
			value={{
				setSplashUrl: handleSetSplashUrl,
				setShowLogoSide,
				setSplashCardAlignment: setSplashAlignment,
			}}
		>
			<NativeDragRegion className={styles.topDragRegion} />
			<div className={styles.scrollerWrapper}>
				<Scroller ref={scrollerRef} className={styles.container} overflow="hidden" key="auth-layout-scroller">
					{isNative && !isMacOS && <NativeTitlebar platform={platform} />}
					<div className={styles.characterBackground}>
						<AuthBackground
							splashUrl={splashUrl}
							splashLoaded={splashLoaded}
							splashDimensions={splashDimensions}
							splashScale={splashScale}
							patternReady={patternReady}
							patternImageUrl={foodPatternUrl}
							splashAlignment={splashAlignment}
							useFullCover={false}
						/>

						<div
							className={clsx(
								styles.leftSplit,
								splashAlignment === GuildSplashCardAlignment.LEFT && styles.alignLeft,
								splashAlignment === GuildSplashCardAlignment.RIGHT && styles.alignRight,
							)}
						>
							<div className={styles.leftSplitWrapper}>
								<div className={styles.leftSplitAnimated}>
									<AuthCardContainer showLogoSide={showLogoSide} isInert={false}>
										{children}
									</AuthCardContainer>
								</div>
							</div>
						</div>
					</div>
				</Scroller>
			</div>
		</AuthLayoutContext.Provider>
	);
});

export const AuthLayout = observer(function AuthLayout({children}: {children?: ReactNode}) {
	const [isI18nInitialized, setIsI18nInitialized] = useState(false);
	const setLayoutVariant = useSetLayoutVariant();

	useEffect(() => {
		setLayoutVariant('auth');
		return () => {
			setLayoutVariant('app');
		};
	}, [setLayoutVariant]);

	useEffect(() => {
		initI18n().then(() => {
			setIsI18nInitialized(true);
		});
	}, []);

	if (!isI18nInitialized) {
		return (
			<>
				<NativeDragRegion className={styles.topDragRegion} />
				<div className={styles.bootstrapShell}>
					<div className={styles.bootstrapBackdrop} aria-hidden="true" />
					<div className={styles.bootstrapPanel}>
						<AuthLoadingState />
					</div>
				</div>
			</>
		);
	}

	return (
		<I18nProvider i18n={i18n}>
			<AuthLayoutContent>
				{/*
				 * Suspense fence for lazy-loaded auth pages (LoginPage,
				 * RegisterPage, etc). Each page is its own dynamic chunk
				 * now so we need a fallback during the network fetch —
				 * AuthLoadingState matches the bootstrap shell so the
				 * transition is invisible to users.
				 */}
				<Suspense fallback={<AuthLoadingState />}>{children}</Suspense>
			</AuthLayoutContent>
		</I18nProvider>
	);
});
