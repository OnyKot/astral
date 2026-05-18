import {registerPlugin} from '@capacitor/core';
import {isNativeAndroidApp} from '~/utils/AndroidAppInfo';

export type AndroidBiometricAvailability =
	| 'available'
	| 'no_hardware'
	| 'hw_unavailable'
	| 'none_enrolled'
	| 'unsupported'
	| 'unknown';

export interface AndroidBiometricStatus {
	available: boolean;
	availability: AndroidBiometricAvailability;
	enabled: boolean;
	hasStoredSession: boolean;
	userId: string | null;
	email: string | null;
}

export interface AndroidBiometricAuthResult {
	token: string;
	userId: string | null;
	email: string | null;
}

interface AndroidBiometricsPlugin {
	getStatus(): Promise<AndroidBiometricStatus>;
	enable(options: {token: string; userId: string; email?: string | null}): Promise<AndroidBiometricStatus>;
	disable(): Promise<AndroidBiometricStatus>;
	clearSession(): Promise<AndroidBiometricStatus>;
	syncSession(options: {token: string; userId?: string | null; email?: string | null}): Promise<AndroidBiometricStatus>;
	authenticate(): Promise<AndroidBiometricAuthResult>;
}

const AndroidBiometrics = registerPlugin<AndroidBiometricsPlugin>('AndroidBiometrics');

const UNSUPPORTED_STATUS: AndroidBiometricStatus = {
	available: false,
	availability: 'unsupported',
	enabled: false,
	hasStoredSession: false,
	userId: null,
	email: null,
};

export const getAndroidBiometricStatus = async (): Promise<AndroidBiometricStatus> => {
	if (!isNativeAndroidApp()) {
		return UNSUPPORTED_STATUS;
	}

	try {
		return await AndroidBiometrics.getStatus();
	} catch {
		return UNSUPPORTED_STATUS;
	}
};

export const enableAndroidBiometrics = async (options: {
	token: string;
	userId: string;
	email?: string | null;
}): Promise<AndroidBiometricStatus> => {
	if (!isNativeAndroidApp()) {
		return UNSUPPORTED_STATUS;
	}

	return AndroidBiometrics.enable(options);
};

export const disableAndroidBiometrics = async (): Promise<AndroidBiometricStatus> => {
	if (!isNativeAndroidApp()) {
		return UNSUPPORTED_STATUS;
	}

	return AndroidBiometrics.disable();
};

export const clearAndroidBiometricSession = async (): Promise<AndroidBiometricStatus> => {
	if (!isNativeAndroidApp()) {
		return UNSUPPORTED_STATUS;
	}

	return AndroidBiometrics.clearSession();
};

export const syncAndroidBiometricSessionIfEnabled = async (options: {
	token: string;
	userId?: string | null;
	email?: string | null;
}): Promise<AndroidBiometricStatus> => {
	if (!isNativeAndroidApp()) {
		return UNSUPPORTED_STATUS;
	}

	return AndroidBiometrics.syncSession(options);
};

export const authenticateWithAndroidBiometrics = async (): Promise<AndroidBiometricAuthResult | null> => {
	if (!isNativeAndroidApp()) {
		return null;
	}

	try {
		return await AndroidBiometrics.authenticate();
	} catch {
		return null;
	}
};
