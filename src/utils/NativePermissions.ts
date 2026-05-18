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

import {isNativeAndroidApp} from '~/utils/AndroidAppInfo';
import type {AndroidPermissionName, AndroidPermissionStatus} from '~/utils/AndroidPermissions';
import {
	checkAndroidPermission,
	openAndroidAppSettings,
	requestAndroidPermission,
} from '~/utils/AndroidPermissions';
import {getElectronAPI, isNativeMacOS} from '~/utils/NativeUtils';

type PermissionKind =
	| 'microphone'
	| 'camera'
	| 'screen'
	| 'accessibility'
	| 'input-monitoring'
	| 'notifications'
	| 'bluetooth';

export type NativePermissionResult =
	| 'granted'
	| 'denied'
	| 'not-determined'
	| 'permanently-denied'
	| 'unsupported';

const permissionCache = new Map<
	PermissionKind,
	{
		value: NativePermissionResult;
		timestamp: number;
	}
>();

const CACHE_DURATION = 1000;

export const getCachedPermission = (kind: PermissionKind): NativePermissionResult | null => {
	const cached = permissionCache.get(kind);
	if (!cached) return null;

	const age = Date.now() - cached.timestamp;
	if (age > CACHE_DURATION) {
		permissionCache.delete(kind);
		return null;
	}

	return cached.value;
};

const setCachedPermission = (kind: PermissionKind, value: NativePermissionResult): void => {
	permissionCache.set(kind, {value, timestamp: Date.now()});
};

const toAndroidPermissionName = (kind: PermissionKind): AndroidPermissionName | null => {
	switch (kind) {
		case 'microphone':
			return 'microphone';
		case 'camera':
			return 'camera';
		case 'notifications':
			return 'notifications';
		case 'bluetooth':
			return 'bluetooth';
		default:
			return null;
	}
};

const toNativeAndroidCheckResult = (status: AndroidPermissionStatus): NativePermissionResult => {
	switch (status) {
		case 'granted':
			return 'granted';
		case 'permanently-denied':
			return 'permanently-denied';
		case 'denied':
			return 'not-determined';
		default:
			return 'unsupported';
	}
};

const toNativeAndroidRequestResult = (status: AndroidPermissionStatus): NativePermissionResult => {
	switch (status) {
		case 'granted':
			return 'granted';
		case 'permanently-denied':
			return 'permanently-denied';
		case 'denied':
			return 'denied';
		default:
			return 'unsupported';
	}
};

const isMediaAccessPermissionKind = (kind: PermissionKind): kind is 'microphone' | 'camera' | 'screen' =>
	kind === 'microphone' || kind === 'camera' || kind === 'screen';

export const checkNativePermission = async (kind: PermissionKind): Promise<NativePermissionResult> => {
	if (isNativeAndroidApp()) {
		const androidPermission = toAndroidPermissionName(kind);
		if (!androidPermission) {
			const result = 'unsupported';
			setCachedPermission(kind, result);
			return result;
		}

		const result = toNativeAndroidCheckResult(await checkAndroidPermission(androidPermission));
		setCachedPermission(kind, result);
		return result;
	}

	const electronApi = getElectronAPI();
	if (!electronApi) {
		const result = 'unsupported';
		setCachedPermission(kind, result);
		return result;
	}

	if (!isNativeMacOS()) {
		const result = 'granted';
		setCachedPermission(kind, result);
		return result;
	}

	let result: NativePermissionResult;

	if (kind === 'input-monitoring') {
		const hasAccess = await electronApi.checkInputMonitoringAccess();
		result = hasAccess ? 'granted' : 'denied';
		setCachedPermission(kind, result);
		return result;
	}

	if (kind === 'accessibility') {
		const isTrusted = await electronApi.checkAccessibility(false);
		result = isTrusted ? 'granted' : 'denied';
		setCachedPermission(kind, result);
		return result;
	}

	if (!isMediaAccessPermissionKind(kind)) {
		result = 'unsupported';
		setCachedPermission(kind, result);
		return result;
	}

	const status = await electronApi.checkMediaAccess(kind);
	switch (status) {
		case 'granted':
			result = 'granted';
			break;
		case 'denied':
		case 'restricted':
			result = 'denied';
			break;
		case 'not-determined':
			result = 'not-determined';
			break;
		default:
			result = 'not-determined';
			break;
	}

	setCachedPermission(kind, result);
	return result;
};

export const requestNativePermission = async (kind: PermissionKind): Promise<NativePermissionResult> => {
	if (isNativeAndroidApp()) {
		const androidPermission = toAndroidPermissionName(kind);
		if (!androidPermission) {
			return 'unsupported';
		}

		const result = toNativeAndroidRequestResult(await requestAndroidPermission(androidPermission));
		setCachedPermission(kind, result);
		return result;
	}

	const electronApi = getElectronAPI();
	if (!electronApi) return 'unsupported';

	if (!isNativeMacOS()) {
		return 'granted';
	}

	if (kind === 'input-monitoring') {
		const hasAccess = await electronApi.checkInputMonitoringAccess();
		return hasAccess ? 'granted' : 'denied';
	}

	if (kind === 'accessibility') {
		const isTrusted = await electronApi.checkAccessibility(true);
		return isTrusted ? 'granted' : 'denied';
	}

	if (!isMediaAccessPermissionKind(kind)) {
		return 'unsupported';
	}

	const granted = await electronApi.requestMediaAccess(kind);
	return granted ? 'granted' : 'denied';
};

export const ensureNativePermission = async (kind: PermissionKind): Promise<NativePermissionResult> => {
	const current = await checkNativePermission(kind);

	if (current === 'granted' || current === 'unsupported' || current === 'permanently-denied') {
		return current;
	}

	if (current === 'not-determined') {
		return requestNativePermission(kind);
	}

	return 'denied';
};

export const isNativePermissionDenied = (result: NativePermissionResult): boolean =>
	result === 'denied' || result === 'permanently-denied';

export const openNativePermissionSettings = async (kind: PermissionKind): Promise<void> => {
	if (isNativeAndroidApp()) {
		const androidPermission = toAndroidPermissionName(kind);
		if (!androidPermission) {
			return;
		}

		await openAndroidAppSettings();
		return;
	}

	const electronApi = getElectronAPI();
	if (!electronApi) return;

	if (!isNativeMacOS()) {
		return;
	}

	switch (kind) {
		case 'accessibility':
			await electronApi.openAccessibilitySettings();
			break;
		case 'input-monitoring':
			await electronApi.openInputMonitoringSettings();
			break;
		case 'microphone':
		case 'camera':
		case 'screen':
			await electronApi.openMediaAccessSettings(kind);
			break;
	}
};
