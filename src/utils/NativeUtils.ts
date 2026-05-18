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

import type {ElectronAPI} from '../../src-electron/common/types';
import {Capacitor, registerPlugin} from '@capacitor/core';

export const isElectron = (): boolean => (window as {electron?: ElectronAPI}).electron !== undefined;
export const isCapacitorNative = (): boolean => Capacitor.isNativePlatform();
export const isNativeMobile = (): boolean => {
	if (!isCapacitorNative()) return false;
	const platform = Capacitor.getPlatform();
	return platform === 'android' || platform === 'ios';
};
export const isNativeApp = (): boolean => isElectron() || isNativeMobile();

interface ExternalBrowserPlugin {
	open(options: {url: string}): Promise<{opened: boolean}>;
}

const ExternalBrowser = registerPlugin<ExternalBrowserPlugin>('ExternalBrowser');

export const getElectronAPI = (): ElectronAPI | null => {
	if (!isElectron()) return null;
	return (window as {electron?: ElectronAPI}).electron ?? null;
};

export const isDesktop = (): boolean => isElectron();

export type NativePlatform = 'macos' | 'windows' | 'linux' | 'android' | 'ios' | 'unknown';

const normalizePlatform = (platform: string | null | undefined): NativePlatform => {
	const value = platform?.toLowerCase() ?? '';
	if (value.startsWith('mac')) return 'macos';
	if (value.startsWith('darwin')) return 'macos';
	if (value.startsWith('win')) return 'windows';
	if (value.includes('linux')) return 'linux';
	if (value.includes('android')) return 'android';
	if (value.includes('iphone') || value.includes('ipad') || value.includes('ios')) return 'ios';
	return 'unknown';
};

export const guessPlatform = (): NativePlatform => {
	if (isCapacitorNative()) {
		const platform = Capacitor.getPlatform();
		if (platform === 'android') return 'android';
		if (platform === 'ios') return 'ios';
	}

	const uaDataPlatform = (navigator as {userAgentData?: {platform?: string}}).userAgentData?.platform;
	if (uaDataPlatform) {
		return normalizePlatform(uaDataPlatform);
	}
	return normalizePlatform(navigator.platform);
};

export const getNativePlatform = async (): Promise<NativePlatform> => {
	const electronApi = getElectronAPI();
	if (electronApi) {
		switch (electronApi.platform) {
			case 'darwin':
				return 'macos';
			case 'win32':
				return 'windows';
			case 'linux':
				return 'linux';
			default:
				return 'unknown';
		}
	}

	if (isCapacitorNative()) {
		const platform = Capacitor.getPlatform();
		if (platform === 'android') return 'android';
		if (platform === 'ios') return 'ios';
	}

	return guessPlatform();
};

export const isNativeMacOS = (platform?: NativePlatform) => (platform ?? guessPlatform()) === 'macos';
export const isNativeWindows = (platform?: NativePlatform) => (platform ?? guessPlatform()) === 'windows';
export const isNativeLinux = (platform?: NativePlatform) => (platform ?? guessPlatform()) === 'linux';

let externalLinkHandlerAttached = false;

const toAbsoluteUrl = (href: string | null): URL | null => {
	if (!href) return null;
	if (href.startsWith('javascript:')) return null;
	try {
		return new URL(href, window.location.href);
	} catch {
		return null;
	}
};

const getExternalBrowserUrl = (anchor: HTMLAnchorElement): string | null => {
	const rawHref = anchor.getAttribute('href');
	const url = toAbsoluteUrl(rawHref);
	if (!url) return null;

	const allowedProtocols = ['http:', 'https:', 'mailto:', 'tel:', 'x-apple.systempreferences:'];
	if (!allowedProtocols.includes(url.protocol)) {
		return null;
	}

	if (url.protocol === 'mailto:' || url.protocol === 'tel:' || url.protocol === 'x-apple.systempreferences:') {
		return url.toString();
	}

	const rel = anchor.getAttribute('rel') ?? '';
	const target = anchor.getAttribute('target') ?? '';
	const isCrossOrigin = url.origin !== window.location.origin;
	const shouldForceExternal =
		isCrossOrigin ||
		rel.includes('external') ||
		(target !== '' && target !== '_self') ||
		anchor.dataset.externalBrowser === 'true';

	return shouldForceExternal ? url.toString() : null;
};

export const openExternalUrl = async (
	url: string,
	target: string = '_blank',
	options?: {preserveReferrer?: boolean},
) => {
	const electronApi = getElectronAPI();
	if (electronApi) {
		try {
			await electronApi.openExternal(url);
			return;
		} catch (error) {
			console.error('[NativeUtils] Failed to open via Electron, falling back', error);
		}
	}

	if (isNativeMobile()) {
		try {
			await ExternalBrowser.open({url});
			return;
		} catch (error) {
			console.error('[NativeUtils] Failed to open via native browser plugin, falling back', error);
		}
	}

	if (target === '_self') {
		window.location.assign(url);
		return;
	}

	window.open(url, target, options?.preserveReferrer ? 'noopener' : 'noopener,noreferrer');
};

export const attachExternalLinkInterceptor = () => {
	if (!isNativeApp() || externalLinkHandlerAttached) return () => undefined;

	const inElectron = isElectron();

	const handler = (event: MouseEvent) => {
		const target = event.target as HTMLElement | null;
		const anchor = target?.closest?.('a[href]') as HTMLAnchorElement | null;
		if (!anchor) return;
		if (anchor.dataset.routerLink === 'true') return;
		const url = getExternalBrowserUrl(anchor);
		if (!url) return;

		event.preventDefault();
		event.stopPropagation();

		if (inElectron) {
			window.open(url, anchor.target || '_blank', 'noopener,noreferrer');
		} else {
			void openExternalUrl(url, anchor.target || '_blank');
		}
	};

	document.addEventListener('click', handler, true);
	externalLinkHandlerAttached = true;

	return () => {
		document.removeEventListener('click', handler, true);
		externalLinkHandlerAttached = false;
	};
};

export const downloadWithNative = async (options: {
	url: string;
	suggestedName?: string;
	title?: string;
}): Promise<boolean> => {
	const electronApi = getElectronAPI();
	if (electronApi) {
		try {
			const result = await electronApi.downloadFile(options.url, options.suggestedName ?? 'download');
			return result.success;
		} catch (error) {
			console.error('[NativeUtils] Native download failed, falling back to browser', error);
			return false;
		}
	}

	return false;
};
