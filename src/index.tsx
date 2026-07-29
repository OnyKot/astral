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
import SessionManager from '~/lib/SessionManager';
import {isGatewayBypassPath} from '~/router/constants';
import AccountManager from '~/stores/AccountManager';
import ChannelDisplayNameStore from '~/stores/ChannelDisplayNameStore';
import GeoIPStore from '~/stores/GeoIPStore';
import KeybindStore from '~/stores/KeybindStore';
import NewDeviceMonitoringStore from '~/stores/NewDeviceMonitoringStore';
import NotificationStore from '~/stores/NotificationStore';
import QuickSwitcherStore from '~/stores/QuickSwitcherStore';
import RuntimeConfigStore from '~/stores/RuntimeConfigStore';
import ConnectionStore from '~/stores/gateway/ConnectionStore';
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
import {isChunkLoadError, recoverFromChunkLoadError} from '~/utils/chunkLoadRecovery';
import {reloadAppHard} from '~/utils/factoryReset';
import {navigateToWebUpdatePage} from '~/utils/WebUpdateNavigate';
import {isAndroidFastMode} from '~/utils/AndroidWebViewUtils';
import Config from './Config';

preloadClientInfo();

const androidFastModeAtBoot = isAndroidFastMode();

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
const shouldInitializeSentry = Boolean(resolvedSentryDsn) && !isLocalDevelopmentHost() && !androidFastModeAtBoot;

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
// the full crash screen. This absorbs one-off render glitches (transient store
// state, a racy effect) without dumping the user onto the crash UI, while the
// rolling window guarantees a genuinely broken build can't loop forever. A
// failed chunk download is handled separately below — re-mounting can never fix
// one, so it does not belong in this budget.
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
		if (attempted.current) return;

		/*
		 * A failed dynamic import is not the transient render glitch this budget
		 * exists for: React.lazy memoises the rejected payload, so resetError()
		 * re-renders straight into the same rejection and burns the retries without
		 * ever re-issuing the request. Reload once instead — a chunk that 404s
		 * means this tab is running an index.html from before a redeploy, and only
		 * a fresh document knows the current chunk names.
		 */
		if (isChunkLoadError(error)) {
			attempted.current = true;
			if (recoverFromChunkLoadError()) return;
			// A reload was already spent on this and the chunk is still missing;
			// retrying cannot help, so hand the user the crash screen's actions.
			setShowCrash(true);
			return;
		}

		if (showCrash) return;
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
	}, [error, showCrash, resetError]);

	if (!showCrash) {
		return null;
	}

	return (
		<I18nProvider i18n={i18n}>
			<ErrorFallback error={error instanceof Error ? error : undefined} eventId={eventId} />
		</I18nProvider>
	);
}

// True while a gateway session opened by bootstrap() is still owned by
// bootstrap() — i.e. React has not mounted the app yet. Ownership is handed over
// right before <App /> renders; until then any blocking screen we render instead
// has to close the socket back down.
let earlyGatewaySessionOwnedByBootstrap = false;

/**
 * Opens the gateway socket during bootstrap so its handshake overlaps the rest
 * of the boot work, instead of waiting for React to mount and flush an effect.
 * READY carries guilds, channels, users and read states — everything the app
 * paints — so it is the critical path, not a follow-up.
 *
 * Must only be called once the desktop/Android/web forced-update gates have all
 * been cleared: a client that is going to be blocked has to stay off the gateway
 * entirely, not connect and then be disconnected again.
 */
function startGatewaySessionIfPossible(): void {
	// Unauthenticated visitors stay socket-less, exactly as before.
	if (!SessionManager.isAuthenticated) {
		return;
	}

	const token = SessionManager.token;
	if (!token) {
		return;
	}

	// The auth forms and the standalone invite/gift/theme/OAuth/report surfaces
	// deliberately run without a socket even for a signed-in visitor (see the
	// isAuthRoute bail-out in RootComponent), so pre-connecting there would be a
	// behaviour change rather than a speed-up.
	if (isGatewayBypassPath(window.location.pathname)) {
		return;
	}

	// Needs the persisted endpoints. A first-ever visit has no snapshot yet (and
	// gatewayEndpoint defaults to ''), so it falls back to the post-mount connect
	// in RootComponent once /instance has answered.
	if (!RuntimeConfigStore.hasUsableSnapshot) {
		return;
	}

	earlyGatewaySessionOwnedByBootstrap = true;

	// Deliberately not awaited — the handshake is meant to overlap the remaining
	// boot legs. startSession flips isConnecting synchronously, so RootComponent's
	// ensureSessionStarted effect degrades to an idempotent no-op fallback.
	void ConnectionStore.startSession(token).catch((error) => {
		console.error('Failed to start gateway session during bootstrap:', error);
	});
}

function teardownEarlyGatewaySession(): void {
	// A blocking screen must never sit in front of a live socket. The
	// forced-update branches return before the session is ever started, so what is
	// left to clean up here is the late failures: the runtime-config/GeoIP
	// NetworkErrorScreen and the BootstrapErrorScreen.
	if (!earlyGatewaySessionOwnedByBootstrap) {
		return;
	}

	earlyGatewaySessionOwnedByBootstrap = false;
	ConnectionStore.logout();
}

async function bootstrap(): Promise<void> {
	// Fan out the mutually independent boot legs. /version.json above all must not
	// sit behind the locale chunk: ReleaseClient asks for `cache: 'no-store'` and
	// the edge answers `Cache-Control: no-cache`, so it costs a full round trip on
	// every single web load, purely to decide whether to show ForcedUpdateScreen.
	const i18nPromise = initI18n();
	const clientInfoPromise = getClientInfo();
	const desktopGatePromise = clientInfoPromise.then((info) => isDesktopUpdateRequiredAsync(info));
	const androidGatePromise = getAndroidUpdateGateInfo();
	const webGatePromise = getWebUpdateGateInfo();
	// Local-only work (IndexedDB accounts + localStorage) that swallows its own
	// errors, so overlapping it with the network legs above is free.
	const accountPromise = AccountManager.bootstrap();
	const runtimePromise = RuntimeConfigStore.waitForInit();

	// Every promise above is awaited further down, but a rejection can land before
	// we get there; park a no-op handler now so it cannot trip the global
	// unhandledrejection listener. The later await still surfaces the error.
	const pendingBootLegs: Array<Promise<unknown>> = [
		clientInfoPromise,
		desktopGatePromise,
		androidGatePromise,
		webGatePromise,
		accountPromise,
		runtimePromise,
	];
	for (const pending of pendingBootLegs) {
		pending.catch(() => {});
	}

	// Both of these are storage reads, so awaiting them adds no latency while the
	// network legs above stay in flight — and together they are everything the
	// gateway handshake needs.
	await accountPromise;
	await RuntimeConfigStore.waitForHydration();

	// READY handlers issue REST calls, so the auth-token provider has to be
	// installed before the socket can get that far.
	setupHttpClient();

	// Hand the i18n singleton to every store that formats user-facing strings
	// *before* the socket can dispatch anything: NotificationStore throws outright
	// when it is unset. These are plain reference assignments — initI18n()
	// activates the catalog separately and every lookup happens lazily at call
	// time, so hoisting them above `await i18nPromise` changes nothing else.
	QuickSwitcherStore.setI18n(i18n);
	ChannelDisplayNameStore.setI18n(i18n);
	KeybindStore.setI18n(i18n);
	NewDeviceMonitoringStore.setI18n(i18n);
	NotificationStore.setI18n(i18n);
	MediaEngineFacade.setI18n(i18n);
	CaptchaInterceptor.setI18n(i18n);

	await i18nPromise;

	const clientInfo = await clientInfoPromise;
	if (await desktopGatePromise) {
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

	const androidGate = await androidGatePromise;
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

	const webGate = await webGatePromise;
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

	// Only now, with all three forced-update gates cleared, may this client join
	// the gateway. A client that is about to be parked on ForcedUpdateScreen must
	// never complete IDENTIFY: it would show up online to its friends and blink
	// straight back offline, and READY/MESSAGE_CREATE would fire desktop
	// notifications from behind the blocking screen. The gates were all kicked off
	// in parallel at the top of bootstrap(), so they have normally resolved long
	// before this line and awaiting them costs close to nothing — the handshake
	// still overlaps the GeoIP fetch and the first React render below.
	startGatewaySessionIfPossible();

	PushSubscriptionService.initializeNativePushBridge();

	try {
		// GeoIP has to stay chained *after* init rather than racing it: GeoIPStore
		// reads RuntimeConfigStore.apiPublicEndpoint, which is what init fills in.
		await runtimePromise;
		if (androidFastModeAtBoot) {
			void GeoIPStore.fetchGeoData().catch((error) => {
				console.error('Failed to fetch GeoIP data:', error);
			});
		} else {
			await GeoIPStore.fetchGeoData();
		}
	} catch (error) {
		teardownEarlyGatewaySession();
		console.error('Failed to initialize runtime config or fetch GeoIP data:', error);
		const root = ReactDOM.createRoot(document.getElementById('root')!);
		root.render(
			<I18nProvider i18n={i18n}>
				<NetworkErrorScreen />
			</I18nProvider>,
		);
		return;
	}

	// The app owns the socket from here on: RootComponent's ensureSessionStarted
	// effect keeps it alive and tears it down on the routes that must not hold one.
	earlyGatewaySessionOwnedByBootstrap = false;

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
	teardownEarlyGatewaySession();
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
