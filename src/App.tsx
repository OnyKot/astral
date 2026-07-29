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

/*
 * The highlight.js and katex stylesheets used to be imported here. Importing
 * them from the root component put them in the render-blocking stylesheet of
 * every cold load for a feature only fenced code blocks use, so they now load
 * next to the libraries themselves — see
 * ~/lib/markdown/renderers/common/code-elements.tsx. Please don't move them back.
 */

import {i18n} from '@lingui/core';
import {I18nProvider} from '@lingui/react';
import {RoomAudioRenderer, RoomContext} from '@livekit/components-react';
import {IconContext} from '@phosphor-icons/react';
import * as Sentry from '@sentry/react';
import {observer} from 'mobx-react-lite';
import React, {type ReactNode} from 'react';

import * as ModalActionCreators from '~/actions/ModalActionCreators';
import * as WindowActionCreators from '~/actions/WindowActionCreators';
import {DndContext} from '~/components/layout/DndContext';
import GlobalOverlays from '~/components/layout/GlobalOverlays';
import {NativeTitlebar} from '~/components/layout/NativeTitlebar';
import {NativeTrafficLightsBackdrop} from '~/components/layout/NativeTrafficLightsBackdrop';

import {UserSettingsModal} from '~/components/modals/UserSettingsModal';
import '~/components/modals/SudoVerificationModal';

import {QUICK_SWITCHER_PORTAL_ID} from '~/components/quick-switcher/QuickSwitcherConstants';
import FocusRingScope from '~/components/uikit/FocusRing/FocusRingScope';
import {SVGMasks} from '~/components/uikit/SVGMasks';
import {IncomingCallManager} from '~/components/voice/IncomingCallManager';

import {type LayoutVariant, LayoutVariantProvider} from '~/contexts/LayoutVariantContext';

import {showMyselfTypingHelper} from '~/devtools/ShowMyselfTypingHelper';

import {useActivityRecorder} from '~/hooks/useActivityRecorder';
import {useElectronScreenSharePicker} from '~/hooks/useElectronScreenSharePicker';
import {useNativePlatform} from '~/hooks/useNativePlatform';
import {useTextInputContextMenu} from '~/hooks/useTextInputContextMenu';

import CaptchaInterceptorStore from '~/lib/CaptchaInterceptor';
import FocusManager from '~/lib/FocusManager';
import KeybindManager from '~/lib/KeybindManager';
import {startReadStateCleanup} from '~/lib/ReadStateCleanup';
import SessionManager from '~/lib/SessionManager';
import {Outlet, RouterProvider} from '~/lib/router';

import {router} from '~/router';

import AccessibilityStore from '~/stores/AccessibilityStore';
import ConnectionStore from '~/stores/ConnectionStore';
import ModalStore from '~/stores/ModalStore';
import PopoutStore from '~/stores/PopoutStore';
import ReadStateStore from '~/stores/ReadStateStore';
import TwitchIntegrationStore from '~/stores/TwitchIntegrationStore';
import UserSettingsStore from '~/stores/UserSettingsStore';
import UserStore from '~/stores/UserStore';
import MediaEngineStore from '~/stores/voice/MediaEngineFacade';
import LayerManager from '~/stores/LayerManager';

import {ensureAutostartDefaultEnabled} from '~/utils/AutostartUtils';
import {startDeepLinkHandling} from '~/utils/DeepLinkUtils';
import {isFastMobileExperience, isLowEndMobileExperience} from '~/utils/mobileExperience';
import {isAndroidWebViewShell as detectAndroidWebViewShell} from '~/utils/AndroidWebViewUtils';
import {attachExternalLinkInterceptor, getElectronAPI, getNativePlatform} from '~/utils/NativeUtils';
import {getChatBackgroundAsset} from '~/constants/chatBackgrounds';

import styles from './App.module.css';
import Config from './Config';

interface AppWrapperProps {
	children: ReactNode;
}

interface WakeLockSentinelLike {
	release(): Promise<void>;
	addEventListener?(type: 'release', listener: () => void): void;
	released?: boolean;
}

type WakeLockCapableNavigator = Navigator & {
	wakeLock?: {
		request(type: 'screen'): Promise<WakeLockSentinelLike>;
	};
};

export const AppWrapper = observer(({children}: AppWrapperProps) => {
	const saturationFactor = AccessibilityStore.saturationFactor;
	const alwaysUnderlineLinks = AccessibilityStore.alwaysUnderlineLinks;
	const enableTextSelection = AccessibilityStore.textSelectionEnabled;
	const fontSize = AccessibilityStore.fontSize;
	const messageGutter = AccessibilityStore.messageGutter;
	const messageGroupSpacing = AccessibilityStore.messageGroupSpacingValue;
	const reducedMotion = AccessibilityStore.useReducedMotion;
	const streamModeEnabled = TwitchIntegrationStore.settings.streamModeEnabled;
	const hideSensitiveOverlay = TwitchIntegrationStore.settings.hideSensitiveOverlay;
	const showTwitchPresence = TwitchIntegrationStore.settings.showTwitchPresence;
	const twitchLiveState = TwitchIntegrationStore.liveState;
	const {platform, isNative, isMacOS, isWindows, isLinux} = useNativePlatform();
	const isNativeDesktopPlatform = isNative && (isMacOS || isWindows || isLinux);
	const isNativeDesktopNonMac = isNative && (isWindows || isLinux);
	const isNativeMobilePlatform = isNative && !isNativeDesktopPlatform;
	const isAndroidWebViewShell = React.useMemo(() => {
		return detectAndroidWebViewShell();
	}, []);
	const isMobileWebBrowser = React.useMemo(() => {
		if (isNative) {
			return false;
		}

		const ua = navigator.userAgent ?? '';
		return /Android|iPhone|iPad|iPod/i.test(ua);
	}, [isNative]);
	const showNativeTitlebar = isNativeDesktopNonMac;
	useElectronScreenSharePicker();
	const syncThemeAcrossDevices = AccessibilityStore.syncThemeAcrossDevices;
	const localThemeOverride = AccessibilityStore.localThemeOverride;
	const customThemeCss = AccessibilityStore.customThemeCss;
	const themeGradientStyle = AccessibilityStore.themeGradientStyle;
	const buttonMotionStyle = AccessibilityStore.buttonMotionStyle;
	const customThemeGradientStart = AccessibilityStore.customThemeGradientStart;
	const customThemeGradientMiddle = AccessibilityStore.customThemeGradientMiddle;
	const customThemeGradientEnd = AccessibilityStore.customThemeGradientEnd;
	const customThemeGradientAngle = AccessibilityStore.customThemeGradientAngle;
	const customThemeGradientGlow = AccessibilityStore.customThemeGradientGlow;
	const chatBackgroundId = AccessibilityStore.chatBackgroundId;
	const messageGradientStyle = AccessibilityStore.messageGradientStyle;
	const [layoutVariant, setLayoutVariant] = React.useState<LayoutVariant>('app');
	const layoutVariantContextValue = React.useMemo(
		() => ({variant: layoutVariant, setVariant: setLayoutVariant}),
		[layoutVariant],
	);

	const popouts = PopoutStore.getPopouts();
	const topPopout = popouts.length ? popouts[popouts.length - 1] : null;
	const topPopoutRequiresBackdrop = Boolean(topPopout && !topPopout.disableBackdrop);

	const userSettings = UserSettingsStore;
	const userSettingsTheme = userSettings.theme;
	const systemDarkMode = userSettings.systemDarkMode;
	const room = MediaEngineStore.room;
	const voiceSessionActive = MediaEngineStore.connected || MediaEngineStore.connecting || MediaEngineStore.channelId !== null;
	const ringsContainerRef = React.useRef<HTMLDivElement>(null);
	const overlayScopeRef = React.useRef<HTMLDivElement>(null);

	const recordActivity = useActivityRecorder();
	const handleUserActivity = React.useCallback(() => recordActivity(), [recordActivity]);
	const handleImmediateActivity = React.useCallback(() => recordActivity(true), [recordActivity]);
	const handleResize = React.useCallback(() => WindowActionCreators.resized(), []);
	useTextInputContextMenu();

	const effectiveTheme = React.useMemo(() => {
		return UserSettingsStore.getTheme();
	}, [userSettingsTheme, syncThemeAcrossDevices, localThemeOverride, systemDarkMode]);

	const hasBlockingModal = ModalStore.hasModalOpen();

	React.useLayoutEffect(() => {
		const root = document.documentElement;
		root.dataset.appRenderPhase = 'critical';

		let firstFrame = 0;
		let secondFrame = 0;
		let idleHandle: number | null = null;
		const complete = () => {
			root.dataset.appRenderPhase = 'complete';
		};

		firstFrame = window.requestAnimationFrame(() => {
			secondFrame = window.requestAnimationFrame(() => {
				const requestIdle = (window as Window & {requestIdleCallback?: (callback: () => void, options?: {timeout: number}) => number})
					.requestIdleCallback;
				if (typeof requestIdle === 'function') {
					idleHandle = requestIdle(complete, {timeout: 120});
				} else {
					complete();
				}
			});
		});

		return () => {
			window.cancelAnimationFrame(firstFrame);
			window.cancelAnimationFrame(secondFrame);
			if (idleHandle !== null) {
				const cancelIdle = (window as Window & {cancelIdleCallback?: (handle: number) => void}).cancelIdleCallback;
				cancelIdle?.(idleHandle);
			}
		};
	}, []);

	React.useEffect(() => {
		const node = ringsContainerRef.current;
		if (!node) return;

		const shouldBlockBackground = hasBlockingModal || topPopoutRequiresBackdrop;

		node.toggleAttribute('inert', shouldBlockBackground);

		return () => {
			node.removeAttribute('inert');
		};
	}, [hasBlockingModal, topPopoutRequiresBackdrop]);

	React.useEffect(() => {
		showMyselfTypingHelper.start();
		return () => showMyselfTypingHelper.stop();
	}, []);

	React.useEffect(() => {
		startReadStateCleanup();
	}, []);

	React.useEffect(() => {
		if (!('serviceWorker' in navigator)) {
			return;
		}

		const postBadgeUpdate = (count: number) => {
			const controller = navigator.serviceWorker.controller;
			if (!controller) {
				return;
			}
			try {
				controller.postMessage({type: 'APP_UPDATE_BADGE', count});
			} catch (error) {
				console.warn('[Badge] Failed to post badge update to service worker', error);
			}
		};

		const updateBadgeFromReadState = () => {
			const channelIds = ReadStateStore.getChannelIds();
			const totalMentions = channelIds.reduce((sum, channelId) => sum + ReadStateStore.getMentionCount(channelId), 0);
			postBadgeUpdate(totalMentions);
		};

		const unsubscribe = ReadStateStore.subscribe(() => {
			updateBadgeFromReadState();
		});

		return () => {
			unsubscribe();
		};
	}, []);

	React.useEffect(() => {
		void KeybindManager.init(i18n);
		void CaptchaInterceptorStore;
		return () => {
			KeybindManager.destroy();
		};
	}, []);

	React.useEffect(() => {
		void AccessibilityStore.applyStoredZoom();

		const electronApi = getElectronAPI();
		if (!electronApi) return;

		const unsubZoomIn = electronApi.onZoomIn?.(() => void AccessibilityStore.adjustZoom(0.1));
		const unsubZoomOut = electronApi.onZoomOut?.(() => void AccessibilityStore.adjustZoom(-0.1));
		const unsubZoomReset = electronApi.onZoomReset?.(() => AccessibilityStore.updateSettings({zoomLevel: 1.0}));
		const unsubOpenSettings = electronApi.onOpenSettings?.(() => {
			ModalActionCreators.push(ModalActionCreators.modal(() => <UserSettingsModal />));
		});

		return () => {
			unsubZoomIn?.();
			unsubZoomOut?.();
			unsubZoomReset?.();
			unsubOpenSettings?.();
		};
	}, []);

	React.useEffect(() => {
		const root = document.documentElement;
		root.classList.toggle('reduced-motion', reducedMotion);
		return () => {
			root.classList.remove('reduced-motion');
		};
	}, [reducedMotion]);

	React.useEffect(() => {
		const root = document.documentElement;
		const updateMobileLiteMode = () => {
			const fastMobileExperience = isFastMobileExperience();
			root.classList.toggle('mobile-lite', isAndroidWebViewShell || isLowEndMobileExperience());
			root.classList.toggle('mobile-fast-mode', fastMobileExperience);
			root.classList.toggle('android-fast-mode', isAndroidWebViewShell);
			root.toggleAttribute('data-mobile-fast-mode', fastMobileExperience);
			root.toggleAttribute('data-android-fast-mode', isAndroidWebViewShell);
		};
		updateMobileLiteMode();
		window.addEventListener('resize', updateMobileLiteMode);
		return () => {
			window.removeEventListener('resize', updateMobileLiteMode);
			root.classList.remove('mobile-lite');
			root.classList.remove('mobile-fast-mode');
			root.classList.remove('android-fast-mode');
			root.removeAttribute('data-mobile-fast-mode');
			root.removeAttribute('data-android-fast-mode');
		};
	}, [isAndroidWebViewShell]);

	React.useEffect(() => {
		const root = document.documentElement;
		const shouldHideSensitive = streamModeEnabled && hideSensitiveOverlay;
		const twitchLive = showTwitchPresence && Boolean(twitchLiveState?.isLive);
		root.classList.toggle('stream-mode', streamModeEnabled);
		root.classList.toggle('stream-mode-hide-sensitive', shouldHideSensitive);
		root.classList.toggle('twitch-live', twitchLive);
		root.toggleAttribute('data-stream-mode', streamModeEnabled);
		root.toggleAttribute('data-stream-mode-hide-sensitive', shouldHideSensitive);
		root.toggleAttribute('data-twitch-live', twitchLive);
		if (twitchLiveState?.login) {
			root.dataset.twitchLiveLogin = twitchLiveState.login;
		} else {
			delete root.dataset.twitchLiveLogin;
		}

		return () => {
			root.classList.remove('stream-mode', 'stream-mode-hide-sensitive', 'twitch-live');
			root.removeAttribute('data-stream-mode');
			root.removeAttribute('data-stream-mode-hide-sensitive');
			root.removeAttribute('data-twitch-live');
			delete root.dataset.twitchLiveLogin;
		};
	}, [hideSensitiveOverlay, showTwitchPresence, streamModeEnabled, twitchLiveState?.isLive, twitchLiveState?.login]);

	React.useEffect(() => {
		if (Config.PUBLIC_BUILD_SHA && Config.PUBLIC_BUILD_TIMESTAMP) {
			const buildInfo = Config.PUBLIC_BUILD_NUMBER
				? `build ${Config.PUBLIC_BUILD_NUMBER} (${Config.PUBLIC_BUILD_SHA})`
				: Config.PUBLIC_BUILD_SHA;
			console.info(`[BUILD INFO] ${Config.PUBLIC_PROJECT_ENV} - ${buildInfo} - ${Config.PUBLIC_BUILD_TIMESTAMP}`);
		}

		FocusManager.init();

		const shouldRegisterWindowListeners = !isNative;
		if (shouldRegisterWindowListeners && document.hasFocus()) {
			document.documentElement.classList.add('window-focused');
		}

		const preventScroll = (event: Event) => event.preventDefault();
		const handleBlur = () => {
			WindowActionCreators.focus(false);
			if (shouldRegisterWindowListeners) {
				document.documentElement.classList.remove('window-focused');
			}
		};
		const handleFocus = () => {
			WindowActionCreators.focus(true);
			if (shouldRegisterWindowListeners) {
				document.documentElement.classList.add('window-focused');
			}
			handleImmediateActivity();
		};
		const handleVisibilityChange = () => {
			WindowActionCreators.visibilityChanged(!document.hidden);
		};

		const preventPinchZoom = (event: TouchEvent) => {
			if (event.touches.length > 1) {
				event.preventDefault();
			}
		};

		if (shouldRegisterWindowListeners) {
			document.addEventListener('scroll', preventScroll);
			window.addEventListener('blur', handleBlur);
			window.addEventListener('focus', handleFocus);
			document.addEventListener('visibilitychange', handleVisibilityChange);
			window.addEventListener('mousedown', handleImmediateActivity);
			window.addEventListener('mousemove', handleUserActivity);
			window.addEventListener('keydown', handleUserActivity);
			window.addEventListener('resize', handleResize);
			window.addEventListener('touchstart', handleImmediateActivity);
			document.addEventListener('touchstart', preventPinchZoom, {passive: false});
			document.addEventListener('touchmove', preventPinchZoom, {passive: false});
		}

		return () => {
			FocusManager.destroy();
			if (shouldRegisterWindowListeners) {
				document.removeEventListener('scroll', preventScroll);
				window.removeEventListener('blur', handleBlur);
				window.removeEventListener('focus', handleFocus);
				document.removeEventListener('visibilitychange', handleVisibilityChange);
				window.removeEventListener('mousedown', handleImmediateActivity);
				window.removeEventListener('mousemove', handleUserActivity);
				window.removeEventListener('keydown', handleUserActivity);
				window.removeEventListener('resize', handleResize);
				window.removeEventListener('touchstart', handleImmediateActivity);
				document.removeEventListener('touchstart', preventPinchZoom);
				document.removeEventListener('touchmove', preventPinchZoom);
			}
		};
	}, [handleImmediateActivity, handleUserActivity, handleResize, isNative]);

	React.useEffect(() => {
		if (!isNative) {
			return;
		}
		const htmlNode = document.documentElement;
		const updateClass = (focused: boolean) => {
			htmlNode.classList.toggle('window-focused', focused);
		};
		const handleFocus = () => {
			updateClass(true);
			WindowActionCreators.focus(true);
			handleImmediateActivity();
		};
		const handleBlur = () => {
			updateClass(false);
			WindowActionCreators.focus(false);
		};
		const handleVisibilityChange = () => {
			WindowActionCreators.visibilityChanged(!document.hidden);
		};
		const preventPinchZoom = (event: TouchEvent) => {
			if (event.touches.length > 1) {
				event.preventDefault();
			}
		};
		updateClass(document.hasFocus());
		window.addEventListener('focus', handleFocus);
		window.addEventListener('blur', handleBlur);
		document.addEventListener('visibilitychange', handleVisibilityChange);
		window.addEventListener('mousedown', handleImmediateActivity);
		window.addEventListener('mousemove', handleUserActivity);
		window.addEventListener('keydown', handleUserActivity);
		window.addEventListener('resize', handleResize);
		window.addEventListener('touchstart', handleImmediateActivity);
		document.addEventListener('touchstart', preventPinchZoom, {passive: false});
		document.addEventListener('touchmove', preventPinchZoom, {passive: false});
		return () => {
			window.removeEventListener('focus', handleFocus);
			window.removeEventListener('blur', handleBlur);
			document.removeEventListener('visibilitychange', handleVisibilityChange);
			window.removeEventListener('mousedown', handleImmediateActivity);
			window.removeEventListener('mousemove', handleUserActivity);
			window.removeEventListener('keydown', handleUserActivity);
			window.removeEventListener('resize', handleResize);
			window.removeEventListener('touchstart', handleImmediateActivity);
			document.removeEventListener('touchstart', preventPinchZoom);
			document.removeEventListener('touchmove', preventPinchZoom);
		};
	}, [handleImmediateActivity, handleResize, handleUserActivity, isNative]);

	React.useEffect(() => {
		if (!isNativeMobilePlatform) {
			return;
		}

		let resumeTimer: ReturnType<typeof setTimeout> | null = null;
		let deferredVoiceResumeTimer: ReturnType<typeof setTimeout> | null = null;

		const tryResumeVoiceSession = () => {
			if (!ConnectionStore.isConnected || ConnectionStore.isConnecting) {
				return;
			}

			if (MediaEngineStore.connected || MediaEngineStore.connecting) {
				return;
			}

			if (!MediaEngineStore.getShouldReconnect()) {
				return;
			}

			const lastConnected = MediaEngineStore.getLastConnectedChannel();
			if (!lastConnected) {
				return;
			}

			void MediaEngineStore.connectToVoiceChannel(lastConnected.guildId, lastConnected.channelId);
		};

		const triggerNativeResumeRecovery = () => {
			if (document.hidden) {
				return;
			}

			if (resumeTimer) {
				clearTimeout(resumeTimer);
			}

			// Delay a bit so Android restores WebView/network stack before reconnect.
			resumeTimer = setTimeout(() => {
				resumeTimer = null;

				const token = SessionManager.token;
				if (!token) {
					return;
				}

				if (!ConnectionStore.isConnected && !ConnectionStore.isConnecting) {
					void ConnectionStore.startSession(token);
				} else {
					ConnectionStore.socket?.handleNetworkStatusChange(navigator.onLine);
				}

				tryResumeVoiceSession();

				if (deferredVoiceResumeTimer) {
					clearTimeout(deferredVoiceResumeTimer);
				}
				deferredVoiceResumeTimer = setTimeout(() => {
					deferredVoiceResumeTimer = null;
					tryResumeVoiceSession();
				}, 900);
			}, 250);
		};

		window.addEventListener('focus', triggerNativeResumeRecovery);
		document.addEventListener('visibilitychange', triggerNativeResumeRecovery);

		return () => {
			window.removeEventListener('focus', triggerNativeResumeRecovery);
			document.removeEventListener('visibilitychange', triggerNativeResumeRecovery);
			if (resumeTimer) {
				clearTimeout(resumeTimer);
			}
			if (deferredVoiceResumeTimer) {
				clearTimeout(deferredVoiceResumeTimer);
			}
		};
	}, [isNativeMobilePlatform]);

	React.useEffect(() => {
		if (!isMobileWebBrowser) {
			return;
		}

		let resumeTimer: ReturnType<typeof setTimeout> | null = null;

		const triggerBrowserResumeRecovery = () => {
			if (document.hidden) {
				return;
			}

			if (resumeTimer) {
				clearTimeout(resumeTimer);
			}

			resumeTimer = setTimeout(() => {
				resumeTimer = null;

				const token = SessionManager.token;
				if (!token) {
					return;
				}

				if (!ConnectionStore.isConnected && !ConnectionStore.isConnecting) {
					void ConnectionStore.startSession(token);
					return;
				}

				ConnectionStore.socket?.handleNetworkStatusChange(navigator.onLine);
			}, 300);
		};

		window.addEventListener('focus', triggerBrowserResumeRecovery);
		window.addEventListener('pageshow', triggerBrowserResumeRecovery);
		document.addEventListener('visibilitychange', triggerBrowserResumeRecovery);

		return () => {
			window.removeEventListener('focus', triggerBrowserResumeRecovery);
			window.removeEventListener('pageshow', triggerBrowserResumeRecovery);
			document.removeEventListener('visibilitychange', triggerBrowserResumeRecovery);
			if (resumeTimer) {
				clearTimeout(resumeTimer);
			}
		};
	}, [isMobileWebBrowser]);

	React.useEffect(() => {
		if (!isNativeMobilePlatform && !isMobileWebBrowser) {
			return;
		}

		const root = document.documentElement;
		const viewport = window.visualViewport;
		let viewportSyncFrame: number | null = null;

		const flushViewportInsets = () => {
			viewportSyncFrame = null;
			if (!window.visualViewport) {
				root.style.setProperty('--android-virtual-frame-bottom', '0px');
				root.style.setProperty('--mobile-keyboard-inset', '0px');
				return;
			}

			const visibleBottom = window.visualViewport.height + window.visualViewport.offsetTop;
			const keyboardInset = Math.max(0, Math.round(window.innerHeight - visibleBottom));
			root.style.setProperty('--android-virtual-frame-bottom', `${keyboardInset}px`);
			if (keyboardInset >= 120) {
				delete root.dataset.keyboardInsetBridge;
				root.style.setProperty('--mobile-keyboard-inset', `${keyboardInset}px`);
				root.style.setProperty('--mobile-expression-picker-height', `${keyboardInset}px`);
			} else if (root.dataset.keyboardInsetBridge !== 'true') {
				root.style.setProperty('--mobile-keyboard-inset', '0px');
			}
		};

		const syncViewportInsets = () => {
			if (viewportSyncFrame != null) return;
			viewportSyncFrame = window.requestAnimationFrame(flushViewportInsets);
		};

		syncViewportInsets();
		viewport?.addEventListener('resize', syncViewportInsets);
		viewport?.addEventListener('scroll', syncViewportInsets);
		window.addEventListener('orientationchange', syncViewportInsets);

		return () => {
			viewport?.removeEventListener('resize', syncViewportInsets);
			viewport?.removeEventListener('scroll', syncViewportInsets);
			window.removeEventListener('orientationchange', syncViewportInsets);
			if (viewportSyncFrame != null) {
				window.cancelAnimationFrame(viewportSyncFrame);
			}
			root.style.setProperty('--android-virtual-frame-bottom', '0px');
			root.style.setProperty('--mobile-keyboard-inset', '0px');
			delete root.dataset.keyboardInsetBridge;
		};
	}, [isMobileWebBrowser, isNativeMobilePlatform]);

	React.useEffect(() => {
		if (!isNativeMobilePlatform) {
			return;
		}

		const handleNativeBack = (event: Event) => {
			if (LayerManager.closeTopLayer()) {
				event.preventDefault();
				event.stopPropagation();
				return;
			}

			if (window.history.length > 1) {
				event.preventDefault();
				event.stopPropagation();
				window.history.back();
			}
		};

		window.addEventListener('astral:native-back', handleNativeBack);
		return () => {
			window.removeEventListener('astral:native-back', handleNativeBack);
		};
	}, [isNativeMobilePlatform]);

	React.useEffect(() => {
		const htmlNode = document.documentElement;
		const platformClasses = [
			isNative ? 'platform-native' : 'platform-web',
			`platform-${platform}`,
			isNativeDesktopNonMac ? 'platform-native-desktop' : null,
			isNativeMobilePlatform ? 'platform-native-mobile' : null,
			isMobileWebBrowser ? 'platform-mobile-browser' : null,
			isAndroidWebViewShell ? 'platform-android-webview-shell' : null,
		].filter((value): value is string => value !== null);

		htmlNode.classList.add(...platformClasses);

		return () => {
			htmlNode.classList.remove(...platformClasses);
		};
	}, [isAndroidWebViewShell, isMobileWebBrowser, isNative, isNativeDesktopNonMac, isNativeMobilePlatform, platform]);

	React.useEffect(() => {
		if (isNative) {
			return;
		}

		const handlePageUnload = () => {
			const guildId = MediaEngineStore.guildId;
			const connected = MediaEngineStore.connected;
			const room = MediaEngineStore.room;
			const socket = ConnectionStore.socket;

			if (socket && connected && guildId) {
				try {
					if (room) {
						room.disconnect(true);
					}

					socket.updateVoiceState({
						guild_id: guildId,
						channel_id: null,
						self_mute: true,
						self_deaf: true,
						self_video: false,
						self_stream: false,
						connection_id: MediaEngineStore.connectionId ?? null,
					});
				} catch (error) {
					console.error('Failed to send disconnect on page unload:', error);
				}
			}
		};

		window.addEventListener('beforeunload', handlePageUnload);
		const handlePageHide = (event: PageTransitionEvent) => {
			if (isMobileWebBrowser || event.persisted) {
				return;
			}
			handlePageUnload();
		};
		window.addEventListener('pagehide', handlePageHide);

		return () => {
			window.removeEventListener('beforeunload', handlePageUnload);
			window.removeEventListener('pagehide', handlePageHide);
		};
	}, [isMobileWebBrowser, isNative]);

	React.useEffect(() => {
		if (isNative || !isMobileWebBrowser || !voiceSessionActive) {
			return;
		}

		const wakeLock = (navigator as WakeLockCapableNavigator).wakeLock;
		if (!wakeLock) {
			return;
		}

		let released = false;
		let sentinel: WakeLockSentinelLike | null = null;

		const requestWakeLock = async () => {
			if (released || document.hidden || sentinel) {
				return;
			}

			try {
				sentinel = await wakeLock.request('screen');
				sentinel.addEventListener?.('release', () => {
					if (!released) {
						sentinel = null;
					}
				});
			} catch (error) {
				console.warn('[WakeLock] Failed to acquire screen wake lock for mobile voice session', error);
			}
		};

		const handleVisibilityChange = () => {
			if (!document.hidden) {
				void requestWakeLock();
			}
		};

		void requestWakeLock();
		document.addEventListener('visibilitychange', handleVisibilityChange);

		return () => {
			released = true;
			document.removeEventListener('visibilitychange', handleVisibilityChange);
			const activeSentinel = sentinel;
			sentinel = null;
			if (activeSentinel && !activeSentinel.released) {
				void activeSentinel.release().catch(() => {});
			}
		};
	}, [isMobileWebBrowser, isNative, voiceSessionActive]);

	React.useEffect(() => {
		// Do NOT delete these attributes in a cleanup function. Under React
		// StrictMode (and any time this effect re-runs because one of the deps
		// changed), React runs cleanup right before the next setup. If we
		// deleted the attribute here, there would be a window where
		// --app-shell-background falls back to the :root default and the
		// user briefly sees the wrong gradient. Just overwrite in place; the
		// <html> element lives for the whole app session anyway so there is
		// nothing to clean up on unmount.
		const htmlNode = document.documentElement;
		htmlNode.dataset.themeGradientStyle = themeGradientStyle;
		htmlNode.dataset.buttonMotionStyle = buttonMotionStyle;
		htmlNode.dataset.messageGradientStyle = messageGradientStyle;
		htmlNode.style.setProperty('--theme-custom-gradient-start', customThemeGradientStart);
		htmlNode.style.setProperty('--theme-custom-gradient-middle', customThemeGradientMiddle);
		htmlNode.style.setProperty('--theme-custom-gradient-end', customThemeGradientEnd);
		htmlNode.style.setProperty('--theme-custom-gradient-angle', `${customThemeGradientAngle}deg`);
		htmlNode.style.setProperty('--theme-custom-gradient-overlay-opacity', `${customThemeGradientGlow / 100}`);
	}, [
		themeGradientStyle,
		buttonMotionStyle,
		customThemeGradientStart,
		customThemeGradientMiddle,
		customThemeGradientEnd,
		customThemeGradientAngle,
		customThemeGradientGlow,
		messageGradientStyle,
	]);

	React.useEffect(() => {
		const htmlNode = document.documentElement;
		const chatBackground = getChatBackgroundAsset(chatBackgroundId);
		htmlNode.style.setProperty(
			'--chat-background-pattern-image',
			chatBackground.src ? `url("${chatBackground.src}")` : 'none',
		);
		htmlNode.style.setProperty('--chat-background-pattern-size', `${chatBackground.tileSize}px`);
		htmlNode.style.setProperty('--chat-background-pattern-opacity', `${chatBackground.opacity}`);
	}, [chatBackgroundId]);

	const previousEffectiveThemeRef = React.useRef<string | null>(null);

	React.useEffect(() => {
		const htmlNode = document.documentElement;
		const themeClasses = [
			'theme-dark',
			'theme-coal',
			'theme-green',
			'theme-gray',
			'theme-blue',
			'theme-sunset',
			'theme-night-sky',
			'theme-purple',
			'theme-orange',
			'theme-pink',
			'theme-yellow',
			'theme-light',
			'theme-system',
		];

		// Only theme changes should toggle transition class.
		const previousTheme = previousEffectiveThemeRef.current;
		const isThemeSwitch = previousTheme !== null && previousTheme !== effectiveTheme;
		previousEffectiveThemeRef.current = effectiveTheme;

		let transitionTimer: number | undefined;
		if (isThemeSwitch) {
			htmlNode.classList.add('theme-transitioning');
			transitionTimer = window.setTimeout(() => {
				htmlNode.classList.remove('theme-transitioning');
			}, 140);
		}

		htmlNode.classList.remove(...themeClasses);
		htmlNode.classList.add(`theme-${effectiveTheme}`);

		return () => {
			if (transitionTimer !== undefined) {
				window.clearTimeout(transitionTimer);
			}
			htmlNode.classList.remove('theme-transitioning');
		};
	}, [effectiveTheme]);

	React.useEffect(() => {
		const htmlNode = document.documentElement;
		htmlNode.style.setProperty('--saturation-factor', saturationFactor.toString());
		htmlNode.style.setProperty('--user-select', enableTextSelection ? 'auto' : 'none');
		htmlNode.style.setProperty('--font-size', `${fontSize}px`);
		htmlNode.style.setProperty('--chat-horizontal-padding', `${messageGutter}px`);
		htmlNode.style.setProperty('--message-group-spacing', `${messageGroupSpacing}px`);

		if (alwaysUnderlineLinks) {
			htmlNode.style.setProperty('--link-decoration', 'underline');
		} else {
			htmlNode.style.removeProperty('--link-decoration');
		}
	}, [
		saturationFactor,
		alwaysUnderlineLinks,
		enableTextSelection,
		fontSize,
		messageGutter,
		messageGroupSpacing,
	]);

	React.useEffect(() => {
		const styleElementId = 'Astral-custom-theme-style';
		const existing = document.getElementById(styleElementId) as HTMLStyleElement | null;

		const css = customThemeCss?.trim() ?? '';

		if (!css) {
			if (existing?.parentNode) {
				existing.parentNode.removeChild(existing);
			}
			return;
		}

		const styleElement = existing ?? document.createElement('style');
		styleElement.id = styleElementId;
		styleElement.textContent = css;

		if (!existing) {
			document.head.appendChild(styleElement);
		}
	}, [customThemeCss]);

	return (
		<LayoutVariantProvider value={layoutVariantContextValue}>
			<SVGMasks />
			<RoomContext.Provider value={room ?? undefined}>
				{room && <RoomAudioRenderer />}
				<div ref={ringsContainerRef} className={styles.appContainer} data-theme-transition="surface">
					<FocusRingScope containerRef={ringsContainerRef}>
						<NativeTrafficLightsBackdrop variant={layoutVariant} />
						{showNativeTitlebar && <NativeTitlebar platform={platform} />}
						{children}
					</FocusRingScope>
				</div>
				<div ref={overlayScopeRef} className={styles.overlayScope}>
					<div
						id={QUICK_SWITCHER_PORTAL_ID}
						className={styles.quickSwitcherPortal}
						data-overlay-pass-through="true"
						aria-hidden="true"
					/>
					<GlobalOverlays />
					<IncomingCallManager />
				</div>
			</RoomContext.Provider>
		</LayoutVariantProvider>
	);
});

export const App = observer((): React.ReactElement => {
	const currentUser = UserStore.currentUser;

	React.useEffect(() => {
		const initAutostart = async () => {
			const platform = await getNativePlatform();
			if (platform === 'macos') {
				void ensureAutostartDefaultEnabled();
			}
		};

		void initAutostart();
	}, []);

	React.useEffect(() => {
		void startDeepLinkHandling();
	}, []);

	React.useEffect(() => {
		const detach = attachExternalLinkInterceptor();
		return () => detach?.();
	}, []);

	React.useEffect(() => {
		if (currentUser) {
			void TwitchIntegrationStore.ensureBootstrapped();
			Sentry.setUser({
				id: currentUser.id,
				username: currentUser.username,
				email: currentUser.email ?? undefined,
			});
		} else {
			Sentry.setUser(null);
		}
	}, [currentUser]);

	return (
		<I18nProvider i18n={i18n}>
			<IconContext.Provider value={{color: 'currentColor', weight: 'regular'}}>
				<DndContext>
					<RouterProvider router={router}>
						<AppWrapper>
							<Outlet />
						</AppWrapper>
					</RouterProvider>
				</DndContext>
			</IconContext.Provider>
		</I18nProvider>
	);
});
