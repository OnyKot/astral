export interface AndroidWebViewBridge {
	getAppInfo(): string;
	getPermissionStatuses(): string;
	requestPermission(permission: string): string;
	openAppSettings(): void;
	getNotificationSettings(): string;
	updateNotificationSettings(settings: string): string;
	areNotificationsEnabled(): boolean;
	showNotification(title: string, body: string, url: string, tag: string, isCall: boolean): void;
	cancelNotification(tag: string): void;
	openAppNotificationSettings(): void;
	openChannelNotificationSettings(channelId: string): void;
}

declare global {
	interface Window {
		AstralAndroidNative?: AndroidWebViewBridge;
	}
}

export const getAndroidWebViewBridge = (): AndroidWebViewBridge | null => {
	if (typeof window === 'undefined') return null;
	return window.AstralAndroidNative ?? null;
};

export const hasAndroidWebViewBridge = (): boolean => getAndroidWebViewBridge() !== null;

export const parseAndroidBridgeJson = <T>(value: string): T | null => {
	try {
		return JSON.parse(value) as T;
	} catch {
		return null;
	}
};
