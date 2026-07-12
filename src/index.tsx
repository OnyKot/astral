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

import 'urlpattern-polyfill';
import '~/styles/preflight.css';
import '~/styles/generated/color-system.css';
import '~/global.css';
import '~/stores/SpellcheckStore';
import '~/components/quick-switcher/QuickSwitcherModal';

import {i18n} from '@lingui/core';
import {I18nProvider} from '@lingui/react';
import * as Sentry from '@sentry/react';
import {useEffect, useRef, useState} from 'react';
import ReactDOM from 'react-dom/client';

import {App} from '~/App';
import {warmupCriticalChunks} from '~/bootstrap/warmupCriticalChunks';
import {setupHttpClient} from '~/bootstrap/setupHttpClient';
import {BootstrapErrorScreen} from '~/components/BootstrapErrorScreen';
import {ErrorFallback} from '~/components/ErrorFallback';
import {ForcedUpdateScreen} from '~/components/ForcedUpdateScreen';
import {NetworkErrorScreen} from '~/components/NetworkErrorScreen';
import {initI18n} from '~/i18n';
import CaptchaInterceptor from '~/lib/CaptchaInterceptor';
import AccountManager from '~/stores/AccountManager';
import ChannelDisplayNameStore from '~/stores/ChannelDisplayNameStore';
import GeoIPStore from '~/stores/GeoIPStore';
import KeybindStore from '~/stores/KeybindStore';
import NewDeviceMonitoringStore from '~/stores/NewDeviceMonitoringStore';
import NotificationStore from '~/stores/NotificationStore';
import QuickSwitcherStore from '~/stores/QuickSwitcherStore';
import RuntimeConfigStore from '~/stores/RuntimeConfigStore';
import MediaEngineFacade from '~/stores/voice/MediaEngineFacade';
import * as PushSubscriptionService from '~/services/push/PushSubscriptionService';
import {registerServiceWorker} from '~/sw/register';
import {getClientInfo, preloadClientInfo} from '~/utils/ClientInfoUtils';
import {
	getDesktopUpdateDownloadUrl,
	isDesktopUpdateRequiredAsync,
	resolveMinimumSupportedDesktopVersion,
} from '~/utils/DesktopUpdateUtils';
import {getAndroidUpdateDownloadUrl, getAndroidUpdateGateInfo} from '~/utils/AndroidUpdateUtils';
import {
	fetchLiveBuildIdentity,
	formatBuildSha,
	getLocalBuildSha,
	getLocalBuildTimestamp,
	getLocalProjectEnv,
	isBuildShaStale,
	resolveChannelLabel,
} from '~/utils/BuildIdentityUtils';
import {fetchReleaseManifest} from '~/utils/ReleaseClient';
import {getWebUpdateGateInfo} from '~/utils/WebUpdateUtils';
import {reloadAppHard} from '~/utils/factoryReset';
import {navigateToWebUpdatePage} from '~/utils/WebUpdateNavigate';
import Config from './Config';

preloadClientInfo();

const RESIZE_OBSERVER_LOOP_ERROR_PATTERN = /ResizeObserver loop (limit exceeded|completed with undelivered notifications)/i;

const isResizeObserverLoopError = (value: unknown): boolean => {
	if (typeof value === 'string') {
		return RESIZE_OBSERVER_LOOP_ERROR_PATTERN.test(value);
	}

	if (value instanceof Error) {
		return RESIZE_OBSERVER_LOOP_ERROR_PATTERN.test(value.message);
	}

	if (typeof value === 'object' && value !== null && 'message' in value) {
		return RESIZE_OBSERVER_LOOP_ERROR_PATTERN.test(String((value as {message: unknown}).message));
	}

	return false;
};

if (typeof window !== 'undefined') {
	window.addEventListener(
		'error',
		(event) => {
			if (isResizeObserverLoopError(event.message) || isResizeObserverLoopError(event.error)) {
				event.preventDefault();
				event.stopImmediatePropagation();
			}
		},
		true,
	);

	window.addEventListener(
		'unhandledrejection',
		(event) => {
			if (isResizeObserverLoopError(event.reason)) {
				event.preventDefault();
			}
		},
		true,
	);
}

const normalizePathSegment = (value: string): string => value.replace(/^\/+|\/+$/g, '');

const isLocalDevelopmentHost = (): boolean => {
	if (typeof window === 'undefined') {
		return false;
	}

	return ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname);
};

function buildRuntimeSentryDsn(): string | null {
	if (typeof window === 'undefined') {
		return null;
	}

	if (!Config.PUBLIC_SENTRY_PROJECT_ID || !Config.PUBLIC_SENTRY_PUBLIC_KEY) {
		return null;
	}

	const origin = window.location.origin;
	if (!origin) {
		return null;
	}

	const proxyPath = normalizePathSegment(Config.PUBLIC_SENTRY_PROXY_PATH ?? '/error-reporting-proxy');
	const projectSegment = normalizePathSegment(Config.PUBLIC_SENTRY_PROJECT_ID);

	const url = new URL(`/${proxyPath}/${projectSegment}`, origin);
	url.username = Config.PUBLIC_SENTRY_PUBLIC_KEY;
	return url.toString();
}

const resolvedSentryDsn = Config.PUBLIC_SENTRY_DSN ?? buildRuntimeSentryDsn();
const shouldInitializeSentry = Boolean(resolvedSentryDsn) && !isLocalDevelopmentHost();

if (shouldInitializeSentry) {
	Sentry.init({
		dsn: resolvedSentryDsn!,
		environment: Config.PUBLIC_PROJECT_ENV,
		release: Config.PUBLIC_BUILD_SHA,
		sendDefaultPii: true,
		// Capture user-facing breakage, not just hard crashes: everything the
		// app logs as console.error (render warnings, failed chunk loads,
		// store errors) lands in the crash-ingest too, tagged by release.
		integrations: [Sentry.captureConsoleIntegration({levels: ['error']})],
		beforeSend(event, hint) {
			const error = hint.originalException;
			if (error instanceof Error) {
				if (error.name === 'HTTPResponseError' || error.name === 'TimeoutError') {
					return null;
				}
			}
			return event;
		},
	});
}

// Auto-recovery budget for transient render crashes. If the root error boundary
// trips, we silently re-mount the app a couple of times before falling back to
// the full crash screen. This absorbs one-off render glitches (stale chunk,
// transient store state) without dumping the user onto the crash UI, while the
// rolling window guarantees a genuinely broken build can't loop forever.
const AUTO_RECOVER_KEY = '__astral_auto_recover';
const AUTO_RECOVER_MAX = 2;
const AUTO_RECOVER_WINDOW_MS = 20000;

const readRecentRecoveries = (): Array<number> => {
	try {
		const now = Date.now();
		const raw = sessionStorage.getItem(AUTO_RECOVER_KEY);
		const times: Array<number> = raw ? JSON.parse(raw) : [];
		return times.filter((t) => now - t < AUTO_RECOVER_WINDOW_MS);
	} catch {
		return [];
	}
};

const canAutoRecover = (): boolean => readRecentRecoveries().length < AUTO_RECOVER_MAX;

const recordAutoRecover = (): void => {
	try {
		const recent = readRecentRecoveries();
		recent.push(Date.now());
		sessionStorage.setItem(AUTO_RECOVER_KEY, JSON.stringify(recent));
	} catch {
		// Best-effort; if sessionStorage is unavailable we just show the crash screen.
	}
};

function RecoverableErrorFallback({
	error,
	eventId,
	resetError,
}: {
	error: unknown;
	eventId: string;
	resetError: () => void;
}) {
	const [showCrash, setShowCrash] = useState(() => !canAutoRecover());
	const attempted = useRef(false);

	useEffect(() => {
		if (showCrash || attempted.current) return;
		attempted.current = true;
		recordAutoRecover();
		const timer = window.setTimeout(() => {
			if (canAutoRecover() || readRecentRecoveries().length <= AUTO_RECOVER_MAX) {
				resetError();
			} else {
				setShowCrash(true);
			}
		}, 60);
		return () => window.clearTimeout(timer);
	}, [showCrash, resetError]);

	if (!showCrash) {
		return null;
	}

	return (
		<I18nProvider i18n={i18n}>
			<ErrorFallback error={error instanceof Error ? error : undefined} eventId={eventId} />
		</I18nProvider>
	);
}

async function bootstrap(): Promise<void> {
	await initI18n();

	const clientInfo = await getClientInfo();
	if (await isDesktopUpdateRequiredAsync(clientInfo)) {
		const [requiredVersion, manifest] = await Promise.all([
			resolveMinimumSupportedDesktopVersion(),
			fetchReleaseManifest(),
		]);
		const root = ReactDOM.createRoot(document.getElementById('root')!);
		root.render(
			<I18nProvider i18n={i18n}>
				<ForcedUpdateScreen
					currentVersion={clientInfo.desktopVersion ?? null}
					requiredVersion={requiredVersion}
					downloadUrl={getDesktopUpdateDownloadUrl(clientInfo)}
					notes={manifest?.notes ?? null}
				/>
			</I18nProvider>,
		);
		return;
	}

	const androidGate = await getAndroidUpdateGateInfo();
	if (androidGate.required) {
		const root = ReactDOM.createRoot(document.getElementById('root')!);
		root.render(
			<I18nProvider i18n={i18n}>
				<ForcedUpdateScreen
					platform="android"
					currentVersion={androidGate.info?.versionName ?? androidGate.info?.versionCode?.toString() ?? null}
					requiredVersion={androidGate.requiredVersionCode.toString()}
					downloadUrl={getAndroidUpdateDownloadUrl()}
				/>
			</I18nProvider>,
		);
		return;
	}

	const webGate = await getWebUpdateGateInfo();
	if (webGate.required && webGate.liveSha) {
		const root = ReactDOM.createRoot(document.getElementById('root')!);
		root.render(
			<I18nProvider i18n={i18n}>
				<ForcedUpdateScreen
					platform="web"
					currentVersion={formatBuildSha(getLocalBuildSha())}
					requiredVersion={formatBuildSha(webGate.liveSha)}
					downloadUrl={window.location.href}
					notes={webGate.notes}
					onReload={() => {
						navigateToWebUpdatePage({sha: webGate.liveSha});
					}}
				/>
			</I18nProvider>,
		);
		return;
	}

	PushSubscriptionService.initializeNativePushBridge();

	QuickSwitcherStore.setI18n(i18n);
	ChannelDisplayNameStore.setI18n(i18n);
	KeybindStore.setI18n(i18n);
	NewDeviceMonitoringStore.setI18n(i18n);
	NotificationStore.setI18n(i18n);
	MediaEngineFacade.setI18n(i18n);
	CaptchaInterceptor.setI18n(i18n);

	try {
		await Promise.all([RuntimeConfigStore.waitForInit(), GeoIPStore.fetchGeoData()]);
	} catch (error) {
		console.error('Failed to initialize runtime config or fetch GeoIP data:', error);
		const root = ReactDOM.createRoot(document.getElementById('root')!);
		root.render(
			<I18nProvider i18n={i18n}>
				<NetworkErrorScreen />
			</I18nProvider>,
		);
		return;
	}

	await AccountManager.bootstrap();

	setupHttpClient();

	const root = ReactDOM.createRoot(document.getElementById('root')!);
	root.render(
		<Sentry.ErrorBoundary
			fallback={({error, eventId, resetError}) => (
				<RecoverableErrorFallback error={error} eventId={eventId} resetError={resetError} />
			)}
		>
			<App />
		</Sentry.ErrorBoundary>,
	);
	warmupCriticalChunks();
	registerServiceWorker();
}

bootstrap().catch(async (error) => {
	console.error('Failed to bootstrap app:', error);

	try {
		await initI18n();
		const root = ReactDOM.createRoot(document.getElementById('root')!);
		root.render(
			<I18nProvider i18n={i18n}>
				<BootstrapErrorScreen error={error} />
			</I18nProvider>,
		);
	} catch (renderError) {
		console.error('Failed to render error screen:', renderError);
		document.body.style.margin = '0';
		document.body.style.minHeight = '100vh';
		document.body.innerHTML = `
			<div
				style="
					min-height: 100vh;
					display: flex;
					align-items: center;
					justify-content: center;
					padding: 2rem;
					text-align: center;
					box-sizing: border-box;
				"
			>
				<p
					style="
						max-width: 32rem;
						font-size: 1.25rem;
						line-height: 1.5;
						margin: 0;
					"
				>
					Something went wrong and the app couldn't load. Please try refreshing the page.
				</p>
			</div>
		`;
	}
});
