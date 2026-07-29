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

import {motion, useAnimationControls, useReducedMotion} from 'framer-motion';
import {observer} from 'mobx-react-lite';
import React from 'react';
import * as AuthenticationActionCreators from '~/actions/AuthenticationActionCreators';
import {KeyboardModeListener} from '~/components/layout/KeyboardModeListener';
import {MobileNavigationDrawer} from '~/components/layout/MobileNavigationDrawer';
import {SplashScreen} from '~/components/layout/SplashScreen';
import {UserSettingsModal} from '~/components/modals/UserSettingsModal';
import {useLocation} from '~/lib/router';
import SessionManager from '~/lib/SessionManager';
import {Routes} from '~/Routes';
import {isAutoRedirectExemptPath, isPublicUnauthenticatedPath} from '~/router/constants';
import * as PushSubscriptionService from '~/services/push/PushSubscriptionService';
import AccountManager from '~/stores/AccountManager';
import AuthenticationStore from '~/stores/AuthenticationStore';
import ConnectionStore from '~/stores/ConnectionStore';
import InitializationStore from '~/stores/InitializationStore';
import LocationStore from '~/stores/LocationStore';
import MobileLayoutStore from '~/stores/MobileLayoutStore';
import MobileNavigationStore from '~/stores/MobileNavigationStore';
import ModalStore from '~/stores/ModalStore';
import UserStore from '~/stores/UserStore';
import {navigateToWithMobileHistory} from '~/utils/MobileNavigation';
import {isFastMobileExperience} from '~/utils/mobileExperience';
import {shouldRunEntranceMotion} from '~/utils/motion/MotionPresets';
import {captureReferralCodeFromSearchParams} from '~/utils/ReferralUtils';
import * as RouterUtils from '~/utils/RouterUtils';
import styles from './RootComponent.module.css';

const RootComponent: React.FC<{children?: React.ReactNode}> = observer(({children}) => {
	const location = useLocation();
	const prefersReducedMotion = useReducedMotion();
	const mobileRouteAnimationControls = useAnimationControls();
	const isAuthenticated = AuthenticationStore.isAuthenticated;
	const mobileLayoutState = MobileLayoutStore;
	const [hasRestoredLocation, setHasRestoredLocation] = React.useState(false);
	const currentUser = UserStore.currentUser;
	const [hasHandledNotificationNav, setHasHandledNotificationNav] = React.useState(false);
	const [previousMobileLayoutState, setPreviousMobileLayoutState] = React.useState(mobileLayoutState.enabled);
	const lastNotificationNavRef = React.useRef<{ts: number; key: string} | null>(null);
	const isLocationStoreHydrated = LocationStore.isHydrated;
	const canNavigateToProtectedRoutes = InitializationStore.canNavigateToProtectedRoutes;
	const pendingRedirectRef = React.useRef<string | null>(null);
	const hasEnteredProtectedRoutesRef = React.useRef(false);

	const hasStartedRestoreRef = React.useRef(false);
	const pathname = location.pathname;
	const isDesktopHandoff = location.searchParams.get('desktop_handoff') === '1';
	const isAutoRedirectExemptRoute = isAutoRedirectExemptPath(pathname);
	const shouldSkipAutoRedirect = isAutoRedirectExemptRoute || (pathname === Routes.LOGIN && isDesktopHandoff);

	const isAuthRoute = React.useMemo(() => {
		return (
			pathname.startsWith(Routes.LOGIN) ||
			pathname.startsWith(Routes.REGISTER) ||
			pathname.startsWith(Routes.FORGOT_PASSWORD) ||
			pathname.startsWith(Routes.RESET_PASSWORD) ||
			pathname.startsWith(Routes.VERIFY_EMAIL) ||
			pathname.startsWith(Routes.AUTHORIZE_IP) ||
			pathname.startsWith(Routes.EMAIL_REVERT) ||
			pathname.startsWith(Routes.OAUTH_AUTHORIZE) ||
			pathname.startsWith(Routes.REPORT) ||
			pathname.startsWith('/invite/') ||
			pathname.startsWith('/gift/') ||
			pathname.startsWith('/gifts/') ||
			pathname.startsWith('/theme/')
		);
	}, [pathname]);

	const shouldBypassGateway = isAuthRoute && pathname !== Routes.PENDING_VERIFICATION;
	const authToken = AuthenticationStore.authToken;

	const normalizeInternalUrl = React.useCallback((rawUrl: string): string => {
		try {
			const u = new URL(rawUrl, window.location.origin);
			if (u.origin === window.location.origin) {
				return u.pathname + u.search + u.hash;
			}
			return rawUrl;
		} catch {
			return rawUrl;
		}
	}, []);

	React.useEffect(() => {
		PushSubscriptionService.initializeNativePushBridge();
	}, []);

	React.useEffect(() => {
		captureReferralCodeFromSearchParams(location.searchParams);
	}, [location.searchParams]);

	React.useEffect(() => {
		if (!SessionManager.isInitialized) return;
		if (AccountManager.isSwitching) return;

		const isAuth = AuthenticationStore.isAuthenticated;

		if (isAuth && isAuthRoute) return;

		if (shouldBypassGateway) {
			if (isAuth) {
				if (!shouldSkipAutoRedirect) {
					RouterUtils.replaceWith(Routes.ME);
				}
				return;
			}
			if (ConnectionStore.isConnected || ConnectionStore.isConnecting || ConnectionStore.socket) {
				ConnectionStore.logout();
			}
			return;
		}

		if (!isAuth) {
			// Public marketing/landing surface: new visitors should see it
			// instead of being bounced straight to the login screen. Drop any
			// stale gateway socket but keep the guest on the route.
			if (isPublicUnauthenticatedPath(pathname)) {
				if (ConnectionStore.isConnected || ConnectionStore.isConnecting || ConnectionStore.socket) {
					ConnectionStore.logout();
				}
				return;
			}

			const current = pathname + window.location.search;
			if (!pendingRedirectRef.current) {
				pendingRedirectRef.current = current;
			}
			RouterUtils.replaceWith(`${Routes.LOGIN}?redirect_to=${encodeURIComponent(pendingRedirectRef.current)}`);
			return;
		}

		if (isAuth && InitializationStore.isLoading) {
			void AuthenticationActionCreators.ensureSessionStarted();
		}
	}, [
		SessionManager.isInitialized,
		authToken,
		AccountManager.isSwitching,
		AuthenticationStore.isAuthenticated,
		ConnectionStore.isConnected,
		ConnectionStore.isConnecting,
		InitializationStore.isLoading,
		shouldBypassGateway,
		shouldSkipAutoRedirect,
		pendingRedirectRef,
	]);

	React.useEffect(() => {
		if (!AuthenticationStore.isAuthenticated) return;
		const target = pendingRedirectRef.current;
		if (!target) return;

		const current = location.pathname + window.location.search;
		if (current !== target) {
			RouterUtils.replaceWith(target);
		}

		pendingRedirectRef.current = null;
	}, [AuthenticationStore.isAuthenticated, location.pathname]);

	React.useEffect(() => {
		if (
			!isAuthenticated ||
			hasRestoredLocation ||
			hasStartedRestoreRef.current ||
			!canNavigateToProtectedRoutes ||
			!isLocationStoreHydrated
		) {
			return;
		}

		if (location.pathname === Routes.HOME) {
			return;
		}

		hasStartedRestoreRef.current = true;
		setHasRestoredLocation(true);

		const lastLocation = LocationStore.getLastLocation();
		if (lastLocation && lastLocation !== location.pathname && location.pathname === Routes.ME) {
			navigateToWithMobileHistory(lastLocation, mobileLayoutState.enabled);
		} else if (mobileLayoutState.enabled) {
			const p = location.pathname;
			if ((Routes.isDMRoute(p) && p !== Routes.ME) || (Routes.isGuildChannelRoute(p) && p.split('/').length === 4)) {
				navigateToWithMobileHistory(p, true);
				setHasHandledNotificationNav(true);
			}
		}
	}, [
		isAuthenticated,
		hasRestoredLocation,
		mobileLayoutState.enabled,
		isLocationStoreHydrated,
		canNavigateToProtectedRoutes,
		location.pathname,
	]);

	React.useEffect(() => {
		if (!isAuthenticated || !hasRestoredLocation) return;

		if (previousMobileLayoutState !== mobileLayoutState.enabled) {
			setPreviousMobileLayoutState(mobileLayoutState.enabled);

			if (mobileLayoutState.enabled) {
				const currentPath = location.pathname;
				if (
					(Routes.isDMRoute(currentPath) && currentPath !== Routes.ME) ||
					(Routes.isGuildChannelRoute(currentPath) && currentPath.split('/').length === 4)
				) {
					navigateToWithMobileHistory(currentPath, true);
				}
			}
		}
	}, [isAuthenticated, hasRestoredLocation, mobileLayoutState.enabled, previousMobileLayoutState, location.pathname]);

	React.useEffect(() => {
		const shouldSaveLocation = Routes.isChannelRoute(location.pathname) || Routes.isSpecialPage(location.pathname);

		if (isAuthenticated && shouldSaveLocation) {
			LocationStore.saveLocation(location.pathname);
		}
	}, [isAuthenticated, location.pathname]);

	const navigateWithHistoryStack = React.useCallback(
		(url: string) => {
			navigateToWithMobileHistory(url, mobileLayoutState.enabled);
		},
		[mobileLayoutState.enabled],
	);

	const handleNotificationNavigatePayload = React.useCallback(
		(payload: {url: string; targetUserId?: string}) => {
			const normalizedUrl = normalizeInternalUrl(payload.url);
			const key = `${payload.targetUserId ?? ''}:${normalizedUrl}`;
			const now = Date.now();
			const last = lastNotificationNavRef.current;
			if (last && last.key === key && now - last.ts < 1500) {
				return;
			}
			lastNotificationNavRef.current = {ts: now, key};

			void (async () => {
				if (
					payload.targetUserId &&
					payload.targetUserId !== AccountManager.currentUserId &&
					AccountManager.canSwitchAccounts
				) {
					try {
						await AccountManager.switchToAccount(payload.targetUserId);
					} catch (error) {
						console.error('Failed to switch account for notification', error);
					}
				}

				if (mobileLayoutState.enabled) {
					navigateWithHistoryStack(normalizedUrl);
				} else {
					RouterUtils.transitionTo(normalizedUrl);
				}

				setHasHandledNotificationNav(true);
			})();
		},
		[mobileLayoutState.enabled, navigateWithHistoryStack, normalizeInternalUrl],
	);

	React.useEffect(() => {
		if (!isAuthenticated) return;

		const handleNotificationNavigate = (event: MessageEvent) => {
			if (event.data?.type === 'NOTIFICATION_CLICK_NAVIGATE') {
				const rawUrl = typeof event.data.url === 'string' ? event.data.url : null;
				if (!rawUrl) return;

				const targetUserId =
					typeof event.data.targetUserId === 'string' ? (event.data.targetUserId as string) : undefined;
				handleNotificationNavigatePayload({url: rawUrl, targetUserId});

				return;
			}

			if (event.data?.type === 'PUSH_SUBSCRIPTION_CHANGE') {
				if (PushSubscriptionService.shouldManagePushSubscriptions()) {
					void PushSubscriptionService.registerPushSubscription();
				}
			}
		};

		const handleNativeNotificationUrl = (event: Event) => {
			const customEvent = event as CustomEvent<{url?: string}>;
			const rawUrl = customEvent.detail?.url;
			if (!rawUrl) return;
			handleNotificationNavigatePayload({url: rawUrl});
		};

		if (!hasHandledNotificationNav) {
			const urlParams = location.searchParams;
			if (urlParams.get('fromNotification') === '1') {
				const newParams = new URLSearchParams(urlParams);
				newParams.delete('fromNotification');
				const cleanPath = location.pathname + (newParams.toString() ? `?${newParams.toString()}` : '');

				if (mobileLayoutState.enabled) {
					navigateWithHistoryStack(cleanPath);
				} else {
					RouterUtils.transitionTo(cleanPath);
				}

				setHasHandledNotificationNav(true);
			}
		}

		navigator.serviceWorker?.addEventListener('message', handleNotificationNavigate);
		const unsubscribeNative = PushSubscriptionService.onNativeNotificationNavigate(handleNotificationNavigatePayload);
		window.addEventListener('astral:native-notification-url', handleNativeNotificationUrl as EventListener);

		return () => {
			navigator.serviceWorker?.removeEventListener('message', handleNotificationNavigate);
			unsubscribeNative();
			window.removeEventListener('astral:native-notification-url', handleNativeNotificationUrl as EventListener);
		};
	}, [
		isAuthenticated,
		mobileLayoutState.enabled,
		hasHandledNotificationNav,
		location,
		navigateWithHistoryStack,
		normalizeInternalUrl,
		handleNotificationNavigatePayload,
	]);

	React.useEffect(() => {
		if (currentUser?.pendingManualVerification) {
			if (
				pathname !== Routes.PENDING_VERIFICATION &&
				!pathname.startsWith('/login') &&
				!pathname.startsWith('/register')
			) {
				RouterUtils.replaceWith(Routes.PENDING_VERIFICATION);
			}
		}
	}, [currentUser, pathname]);

	const mobileBackTarget = React.useMemo(() => {
		if (Routes.isDMRoute(pathname) && pathname !== Routes.ME && pathname !== Routes.dmChannel('@friends')) {
			return Routes.ME;
		}
		if (Routes.isFavoritesRoute(pathname) && pathname !== Routes.FAVORITES) {
			return Routes.FAVORITES;
		}
		if (Routes.isGuildChannelRoute(pathname) && pathname.split('/').length >= 4) {
			const guildId = pathname.split('/')[2];
			return guildId ? Routes.guildChannel(guildId) : null;
		}
		return null;
	}, [pathname]);

	React.useEffect(() => {
		if (!mobileLayoutState.enabled || !mobileBackTarget) {
			return;
		}

		let gestureState: 'idle' | 'pending' | 'locked' | 'cancelled' = 'idle';
		let startX = 0;
		let startY = 0;
		let startTs = 0;

		const DRAWER_EDGE_RESERVED_PX = 36;
		const BACK_GESTURE_MAX_START_X = Math.min(180, window.innerWidth * 0.48);
		const HORIZONTAL_LOCK_DISTANCE = 18;
		const HORIZONTAL_DOMINANCE_RATIO = 1.6;
		const MIN_HORIZONTAL_DISTANCE = Math.min(112, Math.max(84, window.innerWidth * 0.24));
		const MIN_FLICK_DISTANCE = 58;
		const MIN_FLICK_VELOCITY = 0.48;
		const MAX_VERTICAL_DRIFT = 42;
		const MAX_GESTURE_DURATION_MS = 700;
		const SWIPE_IGNORE_SELECTOR =
			'button, a, input, select, textarea, label, summary, video, audio, canvas, [contenteditable="true"], [draggable="true"], [role="button"], [role="link"], [role="slider"], [role="switch"], [role="textbox"], [data-edge-swipe-ignore="true"], [data-swipe-ignore="true"], [data-floating-ui-portal], [data-rsbs-root], [data-rsbs-overlay], [data-rsbs-backdrop]';

		const isInteractiveElement = (target: EventTarget | null): boolean => {
			if (!(target instanceof Element)) {
				return false;
			}

			return Boolean(target.closest(SWIPE_IGNORE_SELECTOR));
		};

		const handleTouchStart = (event: TouchEvent) => {
			gestureState = 'idle';
			if (event.touches.length !== 1 || isInteractiveElement(event.target)) return;

			const touch = event.touches[0];
			if (touch.clientX <= DRAWER_EDGE_RESERVED_PX || touch.clientX > BACK_GESTURE_MAX_START_X) return;

			gestureState = 'pending';
			startX = touch.clientX;
			startY = touch.clientY;
			startTs = Date.now();
		};

		const handleTouchMove = (event: TouchEvent) => {
			if (gestureState === 'idle' || gestureState === 'cancelled' || event.touches.length !== 1) return;

			const touch = event.touches[0];
			const deltaX = touch.clientX - startX;
			const absDeltaX = Math.abs(deltaX);
			const absDeltaY = Math.abs(touch.clientY - startY);

			if (deltaX <= 0 || absDeltaY > MAX_VERTICAL_DRIFT) {
				gestureState = 'cancelled';
				return;
			}

			if (gestureState === 'pending') {
				if (absDeltaY >= HORIZONTAL_LOCK_DISTANCE && absDeltaY >= absDeltaX) {
					gestureState = 'cancelled';
					return;
				}
				if (absDeltaX < HORIZONTAL_LOCK_DISTANCE) return;
				if (absDeltaX < absDeltaY * HORIZONTAL_DOMINANCE_RATIO) {
					gestureState = 'cancelled';
					return;
				}
				gestureState = 'locked';
			}

			if (gestureState === 'locked') {
				if (absDeltaY > absDeltaX * 0.7) {
					gestureState = 'cancelled';
					return;
				}
				event.preventDefault();
				return;
			}
		};

		const handleTouchEnd = (event: TouchEvent) => {
			const wasLocked = gestureState === 'locked';
			gestureState = 'idle';
			if (!wasLocked || event.changedTouches.length === 0) return;

			const touch = event.changedTouches[0];
			const deltaX = touch.clientX - startX;
			const absDeltaY = Math.abs(touch.clientY - startY);
			const elapsed = Math.max(Date.now() - startTs, 1);
			const velocity = deltaX / elapsed;
			const hasDistance = deltaX >= MIN_HORIZONTAL_DISTANCE;
			const isDeliberateFlick = deltaX >= MIN_FLICK_DISTANCE && velocity >= MIN_FLICK_VELOCITY;

			if (
				elapsed <= MAX_GESTURE_DURATION_MS &&
				absDeltaY <= MAX_VERTICAL_DRIFT &&
				deltaX >= absDeltaY * HORIZONTAL_DOMINANCE_RATIO &&
				(hasDistance || isDeliberateFlick)
			) {
				RouterUtils.transitionTo(mobileBackTarget);
			}
		};

		const handleTouchCancel = () => {
			gestureState = 'idle';
		};

		document.addEventListener('touchstart', handleTouchStart, {passive: true});
		document.addEventListener('touchmove', handleTouchMove, {passive: false});
		document.addEventListener('touchend', handleTouchEnd, {passive: true});
		document.addEventListener('touchcancel', handleTouchCancel, {passive: true});

		return () => {
			document.removeEventListener('touchstart', handleTouchStart);
			document.removeEventListener('touchmove', handleTouchMove);
			document.removeEventListener('touchend', handleTouchEnd);
			document.removeEventListener('touchcancel', handleTouchCancel);
		};
	}, [mobileBackTarget, mobileLayoutState.enabled]);

	const isSettingsOpen = ModalStore.hasModalOfType(UserSettingsModal);
	const showMobileNavigation =
		mobileLayoutState.enabled && Boolean(currentUser) && !isAuthRoute && !isSettingsOpen;
	const shouldAnimateMobileRoute =
		!isFastMobileExperience() &&
		shouldRunEntranceMotion() &&
		mobileLayoutState.enabled &&
		Routes.isMobileBottomNavRoute(location.pathname);
	const previousMobileRouteRef = React.useRef(location.pathname);
	const content = showMobileNavigation ? (
		<div className={styles.mobileNavigationPushLayer}>{children}</div>
	) : (
		children
	);

	React.useEffect(() => {
		if (isSettingsOpen) {
			MobileNavigationStore.close();
		}
	}, [isSettingsOpen]);

	React.useEffect(() => {
		if (isAuthenticated && canNavigateToProtectedRoutes) {
			hasEnteredProtectedRoutesRef.current = true;
		}
	}, [isAuthenticated, canNavigateToProtectedRoutes]);

	React.useEffect(() => {
		if (!shouldAnimateMobileRoute) {
			previousMobileRouteRef.current = location.pathname;
			void mobileRouteAnimationControls.start({
				opacity: 1,
				y: 0,
				scale: 1,
				transition: {duration: 0},
			});
			return;
		}

		if (previousMobileRouteRef.current === location.pathname) {
			return;
		}

		previousMobileRouteRef.current = location.pathname;
		void (async () => {
			if (prefersReducedMotion) {
				mobileRouteAnimationControls.set({opacity: 0.98, y: 0, scale: 1});
				await mobileRouteAnimationControls.start({opacity: 1, y: 0, scale: 1, transition: {duration: 0.04}});
				return;
			}

			mobileRouteAnimationControls.set({opacity: 0.96, y: 2, scale: 0.998});
			await mobileRouteAnimationControls.start({
				opacity: 1,
				y: 0,
				scale: 1,
				transition: {duration: 0.09},
			});
		})();
	}, [location.pathname, mobileRouteAnimationControls, prefersReducedMotion, shouldAnimateMobileRoute]);

	if (
		isAuthenticated &&
		!canNavigateToProtectedRoutes &&
		!shouldBypassGateway &&
		!hasEnteredProtectedRoutesRef.current
	) {
		return <SplashScreen />;
	}

	return (
		<>
			<KeyboardModeListener />
			{shouldAnimateMobileRoute ? (
				<motion.div className={styles.mobileRouteLayer} animate={mobileRouteAnimationControls}>
					{content}
				</motion.div>
			) : (
				content
			)}
			{showMobileNavigation && <MobileNavigationDrawer />}
		</>
	);
});

export {RootComponent};
