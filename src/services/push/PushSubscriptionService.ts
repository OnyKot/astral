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

import {Endpoints} from '~/Endpoints';
import http from '~/lib/HttpClient';
import {Logger} from '~/lib/Logger';
import AuthenticationStore from '~/stores/AuthenticationStore';
import RuntimeConfigStore from '~/stores/RuntimeConfigStore';
import {requestAndroidPermission} from '~/utils/AndroidPermissions';
import {isAndroidNativePushConfigured, isNativeAndroidApp} from '~/utils/AndroidAppInfo';
import {dispatchNativeCallAction} from '~/utils/NativeCallActions';
import {
	NATIVE_CALL_ACTION_ANSWER,
	NATIVE_CALL_ACTION_HANGUP,
	NATIVE_CALL_ACTION_REJECT,
} from '~/utils/NotificationUtils';
import {
	isPermissionGranted,
	LocalNotifications,
	PushNotifications,
	type LocalNotificationActionPerformed,
	type LocalNotificationPermissionStatus,
	type PushNotificationActionPerformed,
	type PushPermissionStatus,
} from '~/utils/NativePushPlugins';
import {isNativeMobile} from '~/utils/NativeUtils';
import {isInstalledPwa} from '~/utils/PwaUtils';

interface PushSubscriptionListResponse {
	subscriptions: Array<{subscription_id: string; user_agent: string | null}>;
}

export interface NativeNotificationNavigationPayload {
	url: string;
	targetUserId?: string;
}

type NativeNavigateListener = (payload: NativeNotificationNavigationPayload) => void;

const logger = new Logger('PushSubscriptionService');

let registerPromise: Promise<string | null> | null = null;
let unregisterPromise: Promise<void> | null = null;
let nativeBridgeInitialized = false;

let nativeToken: string | null = null;
let nativeSubscriptionId: string | null = null;
let lastRegisteredNativeToken: string | null = null;
let lastRegisteredNativeUserId: string | null = null;

const nativeTokenWaiters = new Set<(value: string | null) => void>();
const nativeNavigateListeners = new Set<NativeNavigateListener>();
const pendingNativeNavigations: Array<NativeNotificationNavigationPayload> = [];

const getPublicVapidKey = async (): Promise<string | null> => {
	await RuntimeConfigStore.waitForInit();
	return RuntimeConfigStore.publicPushVapidKey;
};

const isWebPushSupported = (): boolean =>
	isInstalledPwa() && 'serviceWorker' in navigator && 'PushManager' in window && typeof Notification !== 'undefined';

const isNativePushSupported = (): boolean => isNativeMobile();

const hasConfiguredNativePush = async (): Promise<boolean> => {
	if (!isNativePushSupported()) {
		return false;
	}

	if (!isNativeAndroidApp()) {
		return true;
	}

	return await isAndroidNativePushConfigured();
};

export const shouldManagePushSubscriptions = (): boolean => isWebPushSupported() || isNativePushSupported();

const logPushUnavailable = (): void => {
	if (isNativePushSupported()) {
		logger.debug('Native push plugin is unavailable in this runtime');
		return;
	}

	if (!isInstalledPwa()) {
		logger.debug('Skipping push handling because the app is not running as an installed PWA');
	} else {
		logger.debug('Web push not supported in this environment');
	}
};

const arrayBufferToBase64Url = (buffer: ArrayBuffer | null): string | null => {
	if (!buffer) return null;
	const bytes = new Uint8Array(buffer);
	let binary = '';
	for (let i = 0; i < bytes.length; i += 1) {
		binary += String.fromCharCode(bytes[i]);
	}
	const base64 = btoa(binary);
	return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

const urlBase64ToUint8Array = (base64String: string): Uint8Array => {
	const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
	const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
	const rawData = atob(base64);
	const outputArray = new Uint8Array(rawData.length);
	for (let i = 0; i < rawData.length; i += 1) {
		outputArray[i] = rawData.charCodeAt(i);
	}
	return outputArray;
};

const getServiceWorkerRegistration = async (): Promise<ServiceWorkerRegistration | undefined> => {
	if (!isWebPushSupported()) {
		return undefined;
	}

	try {
		return await navigator.serviceWorker.ready;
	} catch (error) {
		logger.error('Failed to get service worker registration', {error});
		return undefined;
	}
};

const emitNativeToken = (value: string | null): void => {
	for (const resolve of nativeTokenWaiters) {
		resolve(value);
	}
	nativeTokenWaiters.clear();
};

const waitForNativeToken = async (timeoutMs: number = 10000): Promise<string | null> => {
	if (nativeToken) {
		return nativeToken;
	}

	return await new Promise((resolve) => {
		const timeout = window.setTimeout(() => {
			nativeTokenWaiters.delete(resolver);
			resolve(null);
		}, timeoutMs);

		const resolver = (value: string | null) => {
			window.clearTimeout(timeout);
			nativeTokenWaiters.delete(resolver);
			resolve(value);
		};

		nativeTokenWaiters.add(resolver);
	});
};

const emitNativeNavigate = (payload: NativeNotificationNavigationPayload): void => {
	if (nativeNavigateListeners.size === 0) {
		pendingNativeNavigations.push(payload);
		return;
	}

	for (const listener of nativeNavigateListeners) {
		try {
			listener(payload);
		} catch (error) {
			logger.error('Native navigation listener failed', {error});
		}
	}
};

const readStringField = (data: Record<string, unknown>, keys: ReadonlyArray<string>): string | undefined => {
	for (const key of keys) {
		const value = data[key];
		if (typeof value === 'string' && value.length > 0) {
			return value;
		}
	}
	return undefined;
};

const extractNavigationPayload = (rawData: unknown): NativeNotificationNavigationPayload | null => {
	if (!rawData || typeof rawData !== 'object') return null;
	const data = rawData as Record<string, unknown>;
	const url = readStringField(data, ['url', 'deep_link', 'path']);
	if (!url) return null;
	const targetUserId = readStringField(data, ['target_user_id', 'targetUserId']);
	return {url, targetUserId};
};

const handlePushNotificationAction = (action: PushNotificationActionPerformed): void => {
	const payload = extractNavigationPayload(action.notification?.data);
	if (payload) {
		emitNativeNavigate(payload);
	}
};

const handleLocalNotificationAction = (action: LocalNotificationActionPerformed): void => {
	const actionId = action.actionId;
	if (
		actionId === NATIVE_CALL_ACTION_ANSWER ||
		actionId === NATIVE_CALL_ACTION_REJECT ||
		actionId === NATIVE_CALL_ACTION_HANGUP
	) {
		const extra = (action.notification?.extra ?? {}) as Record<string, unknown>;
		const channelId = readStringField(extra, ['channel_id', 'channelId']);
		if (channelId) {
			dispatchNativeCallAction({
				actionId,
				channelId,
			});
		}
	}

	const payload = extractNavigationPayload(action.notification?.extra);
	if (payload) {
		emitNativeNavigate(payload);
	}
};

const registerNativeTokenOnBackend = async (token: string): Promise<string | null> => {
	const trimmedToken = token.trim();
	if (trimmedToken.length === 0) {
		return null;
	}

	const currentUserId = AuthenticationStore.currentUserId;
	if (!currentUserId) {
		return null;
	}

	if (
		trimmedToken === lastRegisteredNativeToken &&
		currentUserId === lastRegisteredNativeUserId &&
		nativeSubscriptionId !== null
	) {
		return nativeSubscriptionId;
	}

	try {
		const response = await http.post<{subscription_id: string}>({
			url: Endpoints.USER_PUSH_SUBSCRIBE,
			body: {
				type: 'fcm',
				token: trimmedToken,
				user_agent: navigator.userAgent,
			},
		});

		lastRegisteredNativeToken = trimmedToken;
		lastRegisteredNativeUserId = currentUserId;
		nativeSubscriptionId = response.body.subscription_id;

		logger.info('Registered native FCM push subscription', {
			subscriptionId: response.body.subscription_id,
		});

		return response.body.subscription_id;
	} catch (error) {
		logger.error('Failed to register native FCM subscription', {error});
		return null;
	}
};

const ensureNativeBridge = async (): Promise<void> => {
	if (!isNativePushSupported() || nativeBridgeInitialized) {
		return;
	}

	if (!(await hasConfiguredNativePush())) {
		logger.debug('Skipping native push bridge because Android push is not configured in this build');
		return;
	}

	nativeBridgeInitialized = true;

	try {
		await PushNotifications.addListener('registration', (token) => {
			const value = token.value?.trim?.() ?? '';
			nativeToken = value.length > 0 ? value : null;
			emitNativeToken(nativeToken);

			if (nativeToken) {
				void registerNativeTokenOnBackend(nativeToken);
			}
		});
	} catch (error) {
		nativeBridgeInitialized = false;
		logger.error('Failed to register native push token listener', {error});
		return;
	}

	try {
		await PushNotifications.addListener('registrationError', (error) => {
			logger.error('Native push registration error', {error});
			emitNativeToken(null);
		});
	} catch (error) {
		logger.warn('Failed to register native push registrationError listener', {error});
	}

	try {
		await PushNotifications.addListener('pushNotificationActionPerformed', handlePushNotificationAction);
	} catch (error) {
		logger.warn('Failed to register native push action listener', {error});
	}

	try {
		await LocalNotifications.addListener('localNotificationActionPerformed', handleLocalNotificationAction);
	} catch (error) {
		logger.warn('Failed to register local notification action listener', {error});
	}
};

const ensureNativePermissions = async (): Promise<boolean> => {
	try {
		if (isNativeAndroidApp()) {
			const notificationStatus = await requestAndroidPermission('notifications');
			if (notificationStatus !== 'granted') {
				return false;
			}
		}

		const checkedPushPermissions: PushPermissionStatus = await PushNotifications.checkPermissions();
		let pushPermission = checkedPushPermissions.receive;

		if (!isPermissionGranted(pushPermission)) {
			const requestedPushPermissions: PushPermissionStatus = await PushNotifications.requestPermissions();
			pushPermission = requestedPushPermissions.receive;
		}

		if (!isPermissionGranted(pushPermission)) {
			return false;
		}

		if (LocalNotifications.requestPermissions) {
			const localPermissions: LocalNotificationPermissionStatus = await LocalNotifications.requestPermissions();
			if (!isPermissionGranted(localPermissions.display)) {
				return false;
			}
		}

		return true;
	} catch (error) {
		logger.error('Failed to request native push permissions', {error});
		return false;
	}
};

const registerNativePushSubscription = async (): Promise<string | null> => {
	if (!(await hasConfiguredNativePush())) {
		logger.debug('Skipping native push registration because Android push is not configured in this build');
		return null;
	}

	await ensureNativeBridge();
	if (!nativeBridgeInitialized) {
		return null;
	}

	const granted = await ensureNativePermissions();
	if (!granted) {
		logger.debug('Native push permission is not granted');
		return null;
	}

	if (nativeToken) {
		const existingSubscriptionId = await registerNativeTokenOnBackend(nativeToken);
		if (existingSubscriptionId) {
			return existingSubscriptionId;
		}
	}

	try {
		await PushNotifications.register();
	} catch (error) {
		logger.error('Failed to call PushNotifications.register()', {error});
		return null;
	}

	const token = await waitForNativeToken();
	if (!token) {
		logger.warn('Native push token was not received');
		return null;
	}

	return await registerNativeTokenOnBackend(token);
};

const registerWebPushSubscription = async (): Promise<string | null> => {
	let publicVapidKey: string | null;

	try {
		publicVapidKey = await getPublicVapidKey();
	} catch (error) {
		logger.error('Failed to resolve runtime configuration before push registration', {error});
		return null;
	}

	if (!publicVapidKey) {
		logger.debug('VAPID public key is not configured');
		return null;
	}

	if (Notification.permission !== 'granted') {
		logger.debug('Notification permission is not granted; skipping push subscription');
		return null;
	}

	try {
		const registration = await getServiceWorkerRegistration();
		if (!registration) {
			logger.debug('No active service worker registration');
			return null;
		}

		const existingSubscription = await registration.pushManager.getSubscription();
		const applicationServerKey = urlBase64ToUint8Array(publicVapidKey) as BufferSource;
		const subscription =
			existingSubscription ??
			(await registration.pushManager.subscribe({
				userVisibleOnly: true,
				applicationServerKey,
			}));

		const p256dh = arrayBufferToBase64Url(subscription.getKey('p256dh'));
		const auth = arrayBufferToBase64Url(subscription.getKey('auth'));

		if (!subscription.endpoint || !p256dh || !auth) {
			logger.error('Push subscription did not contain expected data', {
				endpoint: subscription.endpoint,
				p256dh,
				auth,
			});
			return null;
		}

		const response = await http.post<{subscription_id: string}>({
			url: Endpoints.USER_PUSH_SUBSCRIBE,
			body: {
				type: 'webpush',
				endpoint: subscription.endpoint,
				keys: {
					p256dh,
					auth,
				},
				user_agent: navigator.userAgent,
			},
		});

		logger.info('Registered web push subscription', {subscriptionId: response.body.subscription_id});
		return response.body.subscription_id;
	} catch (error) {
		logger.error('Failed to register web push subscription', {error});
		return null;
	}
};

export const initializeNativePushBridge = (): void => {
	if (!isNativePushSupported()) return;
	void ensureNativeBridge();
};

export const onNativeNotificationNavigate = (
	listener: NativeNavigateListener,
): (() => void) => {
	nativeNavigateListeners.add(listener);

	if (pendingNativeNavigations.length > 0) {
		const queued = pendingNativeNavigations.splice(0, pendingNativeNavigations.length);
		for (const payload of queued) {
			try {
				listener(payload);
			} catch (error) {
				logger.error('Failed to process queued native navigation', {error});
			}
		}
	}

	return () => {
		nativeNavigateListeners.delete(listener);
	};
};

export async function registerPushSubscription(): Promise<string | null> {
	if (!shouldManagePushSubscriptions()) {
		logPushUnavailable();
		return null;
	}

	if (registerPromise) return registerPromise;

	const promise = (async () => {
		try {
			if (isNativePushSupported()) {
				return await registerNativePushSubscription();
			}

			if (isWebPushSupported()) {
				return await registerWebPushSubscription();
			}

			logPushUnavailable();
			return null;
		} finally {
			registerPromise = null;
		}
	})();

	registerPromise = promise;
	return promise;
}

export async function unregisterAllPushSubscriptions(): Promise<void> {
	if (!shouldManagePushSubscriptions()) {
		logPushUnavailable();
		return;
	}

	if (unregisterPromise) return unregisterPromise;

	const promise = (async () => {
		try {
			const response = await http.get<PushSubscriptionListResponse>({
				url: Endpoints.USER_PUSH_SUBSCRIPTIONS,
			});

			const subscriptions = response.body.subscriptions ?? [];

			await Promise.all(
				subscriptions.map(async (subscription) => {
					try {
						await http.delete({
							url: Endpoints.USER_PUSH_SUBSCRIPTION(subscription.subscription_id),
						});
					} catch (error) {
						logger.warn('Failed to delete push subscription on backend', {
							subscriptionId: subscription.subscription_id,
							error,
						});
					}
				}),
			);

			if (isWebPushSupported()) {
				const registration = await getServiceWorkerRegistration();
				if (registration) {
					const existingSubscription = await registration.pushManager.getSubscription();
					if (existingSubscription) {
						await existingSubscription.unsubscribe();
					}
				}
			}

			if (isNativePushSupported()) {
				if (!(await hasConfiguredNativePush())) {
					logger.debug('Skipping native push cleanup because Android push is not configured in this build');
					return;
				}

				if (PushNotifications.unregister) {
					try {
						await PushNotifications.unregister();
					} catch (error) {
						logger.warn('Failed to unregister native push token', {error});
					}
				}

				nativeToken = null;
				nativeSubscriptionId = null;
				lastRegisteredNativeToken = null;
				lastRegisteredNativeUserId = null;
			}
		} catch (error) {
			logger.error('Failed to unregister push subscriptions', {error});
		} finally {
			unregisterPromise = null;
		}
	})();

	unregisterPromise = promise;
	return promise;
}
