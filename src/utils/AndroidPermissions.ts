import {registerPlugin} from '@capacitor/core';
import {isNativeAndroidApp} from '~/utils/AndroidAppInfo';

export type AndroidPermissionName = 'camera' | 'microphone' | 'notifications' | 'bluetooth';
export type AndroidPermissionStatus = 'granted' | 'denied' | 'permanently-denied' | 'unsupported';
export type AndroidPermissionSnapshot = Record<AndroidPermissionName, AndroidPermissionStatus>;

interface AndroidPermissionResponse {
	permission: AndroidPermissionName;
	status: string;
}

interface AndroidPermissionsPlugin {
	getStatuses(): Promise<Record<string, string>>;
	checkPermission(options: {permission: AndroidPermissionName}): Promise<AndroidPermissionResponse>;
	requestPermission(options: {permission: AndroidPermissionName}): Promise<AndroidPermissionResponse>;
	requestPermissions(options: {permissions: Array<AndroidPermissionName>}): Promise<Record<string, string>>;
	openAppSettings(): Promise<void>;
}

const AndroidPermissions = registerPlugin<AndroidPermissionsPlugin>('AndroidPermissions');

const DEFAULT_SNAPSHOT: AndroidPermissionSnapshot = {
	camera: 'unsupported',
	microphone: 'unsupported',
	notifications: 'unsupported',
	bluetooth: 'unsupported',
};

const normalizeStatus = (status: string | null | undefined): AndroidPermissionStatus => {
	switch (status) {
		case 'granted':
			return 'granted';
		case 'permanently_denied':
		case 'permanently-denied':
			return 'permanently-denied';
		case 'denied':
			return 'denied';
		default:
			return 'unsupported';
	}
};

const normalizeSnapshot = (raw: Record<string, string> | null | undefined): AndroidPermissionSnapshot => ({
	camera: normalizeStatus(raw?.camera),
	microphone: normalizeStatus(raw?.microphone),
	notifications: normalizeStatus(raw?.notifications),
	bluetooth: normalizeStatus(raw?.bluetooth),
});

export const getAndroidPermissionStatuses = async (): Promise<AndroidPermissionSnapshot> => {
	if (!isNativeAndroidApp()) {
		return {...DEFAULT_SNAPSHOT};
	}

	try {
		return normalizeSnapshot(await AndroidPermissions.getStatuses());
	} catch {
		return {...DEFAULT_SNAPSHOT};
	}
};

export const checkAndroidPermission = async (
	permission: AndroidPermissionName,
): Promise<AndroidPermissionStatus> => {
	if (!isNativeAndroidApp()) {
		return 'unsupported';
	}

	try {
		const result = await AndroidPermissions.checkPermission({permission});
		return normalizeStatus(result.status);
	} catch {
		return 'unsupported';
	}
};

export const requestAndroidPermission = async (
	permission: AndroidPermissionName,
): Promise<AndroidPermissionStatus> => {
	if (!isNativeAndroidApp()) {
		return 'unsupported';
	}

	try {
		const result = await AndroidPermissions.requestPermission({permission});
		return normalizeStatus(result.status);
	} catch {
		return 'unsupported';
	}
};

export const requestAndroidPermissions = async (
	permissions: Array<AndroidPermissionName>,
): Promise<AndroidPermissionSnapshot> => {
	if (!isNativeAndroidApp()) {
		return {...DEFAULT_SNAPSHOT};
	}

	try {
		return normalizeSnapshot(await AndroidPermissions.requestPermissions({permissions}));
	} catch {
		return {...DEFAULT_SNAPSHOT};
	}
};

export const openAndroidAppSettings = async (): Promise<void> => {
	if (!isNativeAndroidApp()) {
		return;
	}

	try {
		await AndroidPermissions.openAppSettings();
	} catch {
		// ignore
	}
};

export const isAndroidPermissionDenied = (status: AndroidPermissionStatus): boolean =>
	status === 'denied' || status === 'permanently-denied';

export const isAndroidPermissionGranted = (status: AndroidPermissionStatus): boolean =>
	status === 'granted';
