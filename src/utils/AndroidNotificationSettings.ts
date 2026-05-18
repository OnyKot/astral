import {registerPlugin} from '@capacitor/core';
import {isNativeAndroidApp} from '~/utils/AndroidAppInfo';

export const ANDROID_NOTIFICATION_MESSAGE_CHANNEL_ID = 'astral_messages';
export const ANDROID_NOTIFICATION_MENTION_CHANNEL_ID = 'astral_mentions';
export const ANDROID_NOTIFICATION_CALL_CHANNEL_ID = 'astral_calls';
export const ANDROID_NOTIFICATION_SYSTEM_CHANNEL_ID = 'astral_system';

export interface AndroidNotificationSettings {
	messageSound: boolean;
	messageVibrate: boolean;
	messageHeadsUp: boolean;
	mentionSound: boolean;
	mentionVibrate: boolean;
	mentionHeadsUp: boolean;
	callSound: boolean;
	callVibrate: boolean;
	callFullscreen: boolean;
	systemSound: boolean;
	systemVibrate: boolean;
	showOnLockscreen: boolean;
	quickActions: boolean;
}

interface AndroidNotificationsPlugin {
	getSettings(): Promise<AndroidNotificationSettings>;
	updateSettings(options: {settings: Partial<AndroidNotificationSettings>}): Promise<AndroidNotificationSettings>;
	areNotificationsEnabled(): Promise<{enabled: boolean}>;
	openAppNotificationSettings(): Promise<void>;
	openChannelNotificationSettings(options: {channelId: string}): Promise<void>;
}

const AndroidNotifications = registerPlugin<AndroidNotificationsPlugin>('AndroidNotifications');

export const getAndroidNotificationSettings = async (): Promise<AndroidNotificationSettings | null> => {
	if (!isNativeAndroidApp()) {
		return null;
	}

	try {
		return await AndroidNotifications.getSettings();
	} catch {
		return null;
	}
};

export const updateAndroidNotificationSettings = async (
	settings: Partial<AndroidNotificationSettings>,
): Promise<AndroidNotificationSettings | null> => {
	if (!isNativeAndroidApp()) {
		return null;
	}

	try {
		return await AndroidNotifications.updateSettings({settings});
	} catch {
		return null;
	}
};

export const areAndroidNotificationsEnabled = async (): Promise<boolean> => {
	if (!isNativeAndroidApp()) {
		return false;
	}

	try {
		const result = await AndroidNotifications.areNotificationsEnabled();
		return Boolean(result.enabled);
	} catch {
		return false;
	}
};

export const openAndroidAppNotificationSettings = async (): Promise<void> => {
	if (!isNativeAndroidApp()) {
		return;
	}

	try {
		await AndroidNotifications.openAppNotificationSettings();
	} catch {
		// ignore
	}
};

export const openAndroidChannelNotificationSettings = async (channelId: string): Promise<void> => {
	if (!isNativeAndroidApp()) {
		return;
	}

	try {
		await AndroidNotifications.openChannelNotificationSettings({channelId});
	} catch {
		// ignore
	}
};
