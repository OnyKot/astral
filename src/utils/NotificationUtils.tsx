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

import {type I18n, i18n} from '@lingui/core';
import {msg} from '@lingui/core/macro';
import * as NotificationActionCreators from '~/actions/NotificationActionCreators';
import * as SoundActionCreators from '~/actions/SoundActionCreators';
import AuthenticationStore from '~/stores/AuthenticationStore';
import SoundStore from '~/stores/SoundStore';
import UserStore from '~/stores/UserStore';
import {checkAndroidPermission, requestAndroidPermission} from '~/utils/AndroidPermissions';
import {isNativeAndroidApp} from '~/utils/AndroidAppInfo';
import {getAndroidWebViewBridge} from '~/utils/AndroidWebViewBridge';
import {
	isPermissionGranted,
	LocalNotifications,
	PushNotifications,
	type LocalNotificationActionType,
	type LocalNotificationPermissionStatus,
	type PushPermissionStatus,
} from '~/utils/NativePushPlugins';
import * as AvatarUtils from '~/utils/AvatarUtils';
import {getElectronAPI, isDesktop, isNativeMobile} from '~/utils/NativeUtils';
import * as RouterUtils from '~/utils/RouterUtils';
import {SoundType} from '~/utils/SoundUtils';

let notificationClickHandlerInitialized = false;
let localNotificationId = 100000;
const LOCAL_NOTIFICATION_PREFIX = 'local:';
const ONGOING_CALL_NOTIFICATION_ID = 99999;
const ONGOING_CALL_NOTIFICATION_NATIVE_ID = `${LOCAL_NOTIFICATION_PREFIX}${ONGOING_CALL_NOTIFICATION_ID}`;
const ANDROID_WEBVIEW_NOTIFICATION_PREFIX = 'android-webview:';
export const NATIVE_CALL_ACTION_ANSWER = 'answer_call';
export const NATIVE_CALL_ACTION_REJECT = 'reject_call';
export const NATIVE_CALL_ACTION_HANGUP = 'hangup_call';

const LOCAL_ACTION_TYPE_MESSAGE = 'astral_message';
const LOCAL_ACTION_TYPE_INCOMING_CALL = 'astral_incoming_call';
const LOCAL_ACTION_TYPE_ONGOING_CALL = 'astral_ongoing_call';
const ANDROID_NOTIFICATION_CHANNEL_ID = 'astral_notifications';
const ANDROID_MESSAGE_CHANNEL_ID = ANDROID_NOTIFICATION_CHANNEL_ID;
const ANDROID_CALL_CHANNEL_ID = ANDROID_NOTIFICATION_CHANNEL_ID;
const ANDROID_ONGOING_CALL_CHANNEL_ID = ANDROID_NOTIFICATION_CHANNEL_ID;

let nativeActionTypesRegistered = false;

export const ensureDesktopNotificationClickHandler = (): void => {
	if (notificationClickHandlerInitialized) return;

	const electronApi = getElectronAPI();
	if (!electronApi) return;

	notificationClickHandlerInitialized = true;

	electronApi.onNotificationClick((_id: string, url?: string) => {
		if (url) {
			RouterUtils.transitionTo(url);
		}
	});
};

export const hasNotification = (): boolean => {
	if (isDesktop()) return true;
	if (isNativeAndroidApp()) return true;
	if (isNativeMobile()) return true;
	return typeof Notification !== 'undefined';
};

export const isGranted = async (): Promise<boolean> => {
	if (isDesktop()) return true;
	const androidBridge = getAndroidWebViewBridge();
	if (androidBridge) {
		return androidBridge.areNotificationsEnabled();
	}
	if (isNativeMobile()) {
		if (isNativeAndroidApp()) {
			return (await checkAndroidPermission('notifications')) === 'granted';
		}

		try {
			const pushPermissions: PushPermissionStatus = await PushNotifications.checkPermissions();
			if (!isPermissionGranted(pushPermissions.receive)) {
				return false;
			}

			if (LocalNotifications.checkPermissions) {
				const localPermissions: LocalNotificationPermissionStatus = await LocalNotifications.checkPermissions();
				if (!isPermissionGranted(localPermissions.display)) {
					return false;
				}
			}

			return true;
		} catch {
			return false;
		}
	}

	return typeof Notification !== 'undefined' && Notification.permission === 'granted';
};

export const playNotificationSoundIfEnabled = (): void => {
	if (!SoundStore.isSoundTypeEnabled(SoundType.Message)) return;
	SoundActionCreators.playSound(SoundType.Message);
};

type PermissionResult = 'granted' | 'denied' | 'unsupported';

const requestBrowserPermission = async (): Promise<PermissionResult> => {
	if (typeof Notification === 'undefined') {
		return 'unsupported';
	}

	try {
		const permission = await Notification.requestPermission();
		return permission === 'granted' ? 'granted' : 'denied';
	} catch {
		return 'denied';
	}
};

const requestNativePermission = async (): Promise<PermissionResult> => {
	if (isNativeAndroidApp()) {
		const status = await requestAndroidPermission('notifications');
		return status === 'granted' ? 'granted' : 'denied';
	}

	try {
		const pushPermissions: PushPermissionStatus = await PushNotifications.requestPermissions();
		if (!isPermissionGranted(pushPermissions.receive)) {
			return 'denied';
		}

		if (LocalNotifications.requestPermissions) {
			const localPermissions: LocalNotificationPermissionStatus = await LocalNotifications.requestPermissions();
			if (!isPermissionGranted(localPermissions.display)) {
				return 'denied';
			}
		}

		return 'granted';
	} catch {
		return 'unsupported';
	}
};

const getCurrentUserAvatar = (): string | null => {
	const currentUserId = AuthenticationStore.currentUserId;
	if (!currentUserId) return null;

	const currentUser = UserStore.getUser(currentUserId);
	if (!currentUser) return null;

	return AvatarUtils.getUserAvatarURL(currentUser);
};

export const requestPermission = async (i18n: I18n): Promise<void> => {
	if (isDesktop()) {
		NotificationActionCreators.permissionGranted();
		playNotificationSoundIfEnabled();

		const icon = getCurrentUserAvatar() ?? '';
		void showNotification({
			title: i18n._(msg`Access granted`),
			body: i18n._(msg`Huzzah! Desktop notifications are enabled`),
			icon,
		});

		return;
	}

	const result = isNativeAndroidApp() || isNativeMobile() ? await requestNativePermission() : await requestBrowserPermission();
	if (result !== 'granted') {
		NotificationActionCreators.permissionDenied(i18n);
		return;
	}

	NotificationActionCreators.permissionGranted();

	if (isNativeAndroidApp() || isNativeMobile()) {
		return;
	}

	playNotificationSoundIfEnabled();

	const icon = getCurrentUserAvatar() ?? '';
	void showNotification({
		title: i18n._(msg`Access granted`),
		body: i18n._(msg`Huzzah! Notifications are enabled`),
		icon,
	});
};

export interface NotificationResult {
	browserNotification: Notification | null;
	nativeNotificationId: string | null;
}

const getServiceWorkerRegistration = async (): Promise<ServiceWorkerRegistration | null> => {
	if (typeof navigator === 'undefined' || typeof navigator.serviceWorker === 'undefined') {
		return null;
	}

	try {
		return (await navigator.serviceWorker.getRegistration()) ?? null;
	} catch {
		return null;
	}
};

const tryShowNotificationViaServiceWorker = async ({
	title,
	body,
	url,
	icon,
	targetUserId,
}: {
	title: string;
	body: string;
	url?: string;
	icon?: string;
	targetUserId?: string;
}): Promise<{shown: boolean; result: NotificationResult}> => {
	const registration = await getServiceWorkerRegistration();
	if (!registration) {
		return {shown: false, result: {browserNotification: null, nativeNotificationId: null}};
	}

	const options: NotificationOptions = {body};

	if (icon) {
		options.icon = icon;
	}

	if (url || targetUserId) {
		const data: Record<string, unknown> = {};
		if (url) data.url = url;
		if (targetUserId) data.target_user_id = targetUserId;
		options.data = data;
	}

	try {
		await registration.showNotification(title, options);
		return {shown: true, result: {browserNotification: null, nativeNotificationId: null}};
	} catch {
		return {shown: false, result: {browserNotification: null, nativeNotificationId: null}};
	}
};

const tryShowNotificationViaWindowNotification = ({
	title,
	body,
	url,
	icon,
}: {
	title: string;
	body: string;
	url?: string;
	icon?: string;
}): NotificationResult => {
	const notificationOptions: NotificationOptions = icon ? {body, icon} : {body};
	const notification = new Notification(title, notificationOptions);
	notification.addEventListener('click', (event) => {
		event.preventDefault();
		window.focus();
		if (url) {
			RouterUtils.transitionTo(url);
		}
		notification.close();
	});
	return {browserNotification: notification, nativeNotificationId: null};
};

const nextLocalNotificationId = (): number => {
	localNotificationId += 1;
	if (localNotificationId > 2147483000) {
		localNotificationId = 100000;
	}
	return localNotificationId;
};

const tryShowNotificationViaAndroidWebView = ({
	title,
	body,
	url,
	tag,
	isCall,
}: {
	title: string;
	body: string;
	url?: string;
	tag?: string;
	isCall: boolean;
}): NotificationResult | null => {
	const bridge = getAndroidWebViewBridge();
	if (!bridge) return null;

	const notificationTag = tag || `astral-${nextLocalNotificationId()}`;
	bridge.showNotification(title, body, url ?? '', notificationTag, isCall);
	return {
		browserNotification: null,
		nativeNotificationId: `${ANDROID_WEBVIEW_NOTIFICATION_PREFIX}${notificationTag}`,
	};
};

const ensureNativeActionTypesRegistered = async (): Promise<void> => {
	if (!isNativeMobile() || nativeActionTypesRegistered) {
		return;
	}

	const registerActionTypes = LocalNotifications.registerActionTypes;
	if (!registerActionTypes) {
		nativeActionTypesRegistered = true;
		return;
	}

	const types: Array<LocalNotificationActionType> = [
		{
			id: LOCAL_ACTION_TYPE_MESSAGE,
			actions: [{id: 'open_message', title: i18n._(msg`Open`), foreground: true}],
		},
		{
			id: LOCAL_ACTION_TYPE_INCOMING_CALL,
			actions: [
				{id: NATIVE_CALL_ACTION_ANSWER, title: i18n._(msg`Answer`), foreground: true},
				{id: NATIVE_CALL_ACTION_REJECT, title: i18n._(msg`Decline`), foreground: false, destructive: true},
			],
		},
		{
			id: LOCAL_ACTION_TYPE_ONGOING_CALL,
			actions: [{id: NATIVE_CALL_ACTION_HANGUP, title: i18n._(msg`Hang up`), foreground: false, destructive: true}],
		},
	];

	try {
		await registerActionTypes({types});
	} catch {
		// Ignore on platforms where custom action types are unsupported.
	} finally {
		nativeActionTypesRegistered = true;
	}
};

const toLocalNotificationId = (id: string): number | null => {
	if (!id.startsWith(LOCAL_NOTIFICATION_PREFIX)) return null;
	const raw = id.slice(LOCAL_NOTIFICATION_PREFIX.length);
	const parsed = Number.parseInt(raw, 10);
	if (!Number.isFinite(parsed) || parsed <= 0) return null;
	return parsed;
};

const tryShowNotificationViaNativeMobile = async ({
	title,
	body,
	url,
	targetUserId,
}: {
	title: string;
	body: string;
	url?: string;
	targetUserId?: string;
}): Promise<NotificationResult> => {
	const id = nextLocalNotificationId();
	const extra: Record<string, unknown> = {};
	if (url) {
		extra.url = url;
	}
	if (targetUserId) {
		extra.target_user_id = targetUserId;
	}
	await ensureNativeActionTypesRegistered();

	await LocalNotifications.schedule({
		notifications: [
			{
				id,
				title,
				body,
				channelId: ANDROID_MESSAGE_CHANNEL_ID,
				actionTypeId: LOCAL_ACTION_TYPE_MESSAGE,
				extra,
			},
		],
	});

	return {browserNotification: null, nativeNotificationId: `${LOCAL_NOTIFICATION_PREFIX}${id}`};
};

export const showOngoingCallNotification = async ({
	title,
	body,
	url,
	channelId,
}: {
	title: string;
	body: string;
	url?: string;
	channelId: string;
}): Promise<string | null> => {
	const webViewResult = tryShowNotificationViaAndroidWebView({
		title,
		body,
		url,
		tag: 'ongoing-call',
		isCall: true,
	});
	if (webViewResult) return webViewResult.nativeNotificationId;

	if (!isNativeMobile()) {
		return null;
	}

	const extra: Record<string, unknown> = {};
	if (url) {
		extra.url = url;
	}

	const targetUserId = AuthenticationStore.currentUserId;
	if (targetUserId) {
		extra.target_user_id = targetUserId;
	}
	extra.channel_id = channelId;

	await ensureNativeActionTypesRegistered();

	try {
		await LocalNotifications.schedule({
			notifications: [
				{
					id: ONGOING_CALL_NOTIFICATION_ID,
					title,
					body,
					channelId: ANDROID_ONGOING_CALL_CHANNEL_ID,
					actionTypeId: LOCAL_ACTION_TYPE_ONGOING_CALL,
					extra,
					ongoing: true,
					autoCancel: false,
				},
			],
		});

		return ONGOING_CALL_NOTIFICATION_NATIVE_ID;
	} catch {
		return null;
	}
};

export const showIncomingCallNotification = async ({
	title,
	body,
	url,
	channelId,
}: {
	title: string;
	body: string;
	url?: string;
	channelId: string;
}): Promise<string | null> => {
	const webViewResult = tryShowNotificationViaAndroidWebView({
		title,
		body,
		url,
		tag: `incoming-call:${channelId}`,
		isCall: true,
	});
	if (webViewResult) return webViewResult.nativeNotificationId;

	if (!isNativeMobile()) {
		return null;
	}

	const id = nextLocalNotificationId();
	const extra: Record<string, unknown> = {channel_id: channelId};

	if (url) {
		extra.url = url;
	}

	const targetUserId = AuthenticationStore.currentUserId;
	if (targetUserId) {
		extra.target_user_id = targetUserId;
	}

	await ensureNativeActionTypesRegistered();

	try {
		await LocalNotifications.schedule({
			notifications: [
				{
					id,
					title,
					body,
					channelId: ANDROID_CALL_CHANNEL_ID,
					actionTypeId: LOCAL_ACTION_TYPE_INCOMING_CALL,
					extra,
				},
			],
		});

		return `${LOCAL_NOTIFICATION_PREFIX}${id}`;
	} catch {
		return null;
	}
};

export const clearOngoingCallNotification = async (): Promise<void> => {
	const bridge = getAndroidWebViewBridge();
	if (bridge) {
		bridge.cancelNotification('ongoing-call');
		return;
	}

	if (!isNativeMobile()) {
		return;
	}

	try {
		await LocalNotifications.cancel({
			notifications: [{id: ONGOING_CALL_NOTIFICATION_ID}],
		});
	} catch {
		// no-op
	}
};

export const showNotification = async ({
	title,
	body,
	url,
	icon,
	playSound = true,
}: {
	title: string;
	body: string;
	url?: string;
	icon?: string;
	playSound?: boolean;
}): Promise<NotificationResult> => {
	try {
		if (playSound) {
			playNotificationSoundIfEnabled();
		}

		const electronApi = getElectronAPI();
		if (electronApi) {
			try {
				const result = await electronApi.showNotification({
					title,
					body,
					icon: icon ?? '',
					url,
				});
				return {browserNotification: null, nativeNotificationId: result.id};
			} catch {
				return {browserNotification: null, nativeNotificationId: null};
			}
		}

		const targetUserId = AuthenticationStore.currentUserId ?? undefined;

		const webViewResult = tryShowNotificationViaAndroidWebView({title, body, url, isCall: false});
		if (webViewResult) {
			return webViewResult;
		}

		if (isNativeMobile()) {
			try {
				return await tryShowNotificationViaNativeMobile({title, body, url, targetUserId});
			} catch {
				// Fall through to browser/service worker fallback paths when native local notifications are unavailable.
			}
		}

		const swAttempt = await tryShowNotificationViaServiceWorker({title, body, url, icon, targetUserId});
		if (swAttempt.shown) {
			return swAttempt.result;
		}

		if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
			try {
				return tryShowNotificationViaWindowNotification({title, body, url, icon});
			} catch {
				const swFallback = await tryShowNotificationViaServiceWorker({title, body, url, icon, targetUserId});
				return swFallback.result;
			}
		}

		return swAttempt.result;
	} catch {
		return {browserNotification: null, nativeNotificationId: null};
	}
};

export const closeNativeNotification = (id: string): void => {
	if (id.startsWith(ANDROID_WEBVIEW_NOTIFICATION_PREFIX)) {
		getAndroidWebViewBridge()?.cancelNotification(id.slice(ANDROID_WEBVIEW_NOTIFICATION_PREFIX.length));
		return;
	}

	const localId = toLocalNotificationId(id);
	if (localId !== null) {
		void LocalNotifications.cancel({notifications: [{id: localId}]}).catch(() => undefined);
		return;
	}

	const electronApi = getElectronAPI();
	if (electronApi) {
		electronApi.closeNotification(id);
	}
};

export const closeNativeNotifications = (ids: Array<string>): void => {
	if (ids.length === 0) return;

	const bridge = getAndroidWebViewBridge();
	if (bridge) {
		for (const id of ids) {
			if (id.startsWith(ANDROID_WEBVIEW_NOTIFICATION_PREFIX)) {
				bridge.cancelNotification(id.slice(ANDROID_WEBVIEW_NOTIFICATION_PREFIX.length));
			}
		}
	}

	const localNotifications = ids.map(toLocalNotificationId).filter((id): id is number => id !== null);
	if (localNotifications.length > 0) {
		void LocalNotifications.cancel({
			notifications: localNotifications.map((id) => ({id})),
		}).catch(() => undefined);
	}

	const electronApi = getElectronAPI();
	if (electronApi) {
		const electronIds = ids.filter((id) => toLocalNotificationId(id) === null);
		if (electronIds.length > 0) {
			electronApi.closeNotifications(electronIds);
		}
	}
};
