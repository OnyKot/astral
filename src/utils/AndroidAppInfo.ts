import {registerPlugin} from '@capacitor/core';
import {guessPlatform, isNativeMobile} from '~/utils/NativeUtils';

export interface AndroidAppInfo {
	packageName: string;
	versionName: string;
	versionCode: number;
	nativePushConfigured?: boolean;
}

interface AstralAppInfoPlugin {
	getInfo(): Promise<AndroidAppInfo>;
}

const AstralAppInfo = registerPlugin<AstralAppInfoPlugin>('AstralAppInfo');
let appInfoPromise: Promise<AndroidAppInfo | null> | null = null;

export const isNativeAndroidApp = (): boolean => isNativeMobile() && guessPlatform() === 'android';

export async function getAndroidAppInfo(): Promise<AndroidAppInfo | null> {
	if (!isNativeAndroidApp()) {
		return null;
	}

	if (!appInfoPromise) {
		appInfoPromise = AstralAppInfo.getInfo().catch((error) => {
			console.warn('[AndroidAppInfo] Failed to read native app info', error);
			appInfoPromise = null;
			return null;
		});
	}

	return await appInfoPromise;
}

export async function isAndroidNativePushConfigured(): Promise<boolean> {
	const info = await getAndroidAppInfo();
	return Boolean(info?.nativePushConfigured);
}
