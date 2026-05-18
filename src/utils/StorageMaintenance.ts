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

import {voiceStatsDB} from '~/lib/VoiceStatsDB';
import {mediaDeviceCache} from '~/lib/MediaDeviceCache';
import {clearBackgroundImages} from '~/utils/BackgroundImageDB';
import {clearAudioCustomizationCache} from '~/utils/CustomSoundDB';

export interface StorageMaintenanceSnapshot {
	totalUsageBytes: number | null;
	quotaBytes: number | null;
	localStorageBytes: number;
	sessionStorageBytes: number;
	cacheBuckets: number | null;
	persistent: boolean | null;
}

const measureStorageBytes = (storage: Storage | undefined): number => {
	if (!storage) {
		return 0;
	}

	let size = 0;
	for (let index = 0; index < storage.length; index += 1) {
		const key = storage.key(index);
		if (!key) continue;
		const value = storage.getItem(key) ?? '';
		size += (key.length + value.length) * 2;
	}
	return size;
};

const getSafeStorage = (kind: 'local' | 'session'): Storage | undefined => {
	if (typeof window === 'undefined') {
		return undefined;
	}

	try {
		return kind === 'local' ? window.localStorage : window.sessionStorage;
	} catch {
		return undefined;
	}
};

const getCacheBucketCount = async (): Promise<number | null> => {
	if (typeof window === 'undefined' || !('caches' in window)) {
		return null;
	}

	try {
		return (await window.caches.keys()).length;
	} catch {
		return null;
	}
};

export const getStorageMaintenanceSnapshot = async (): Promise<StorageMaintenanceSnapshot> => {
	const localStorageBytes = measureStorageBytes(getSafeStorage('local'));
	const sessionStorageBytes = measureStorageBytes(getSafeStorage('session'));

	let totalUsageBytes: number | null = null;
	let quotaBytes: number | null = null;
	let persistent: boolean | null = null;

	try {
		const estimate = await navigator.storage?.estimate?.();
		totalUsageBytes = typeof estimate?.usage === 'number' ? estimate.usage : null;
		quotaBytes = typeof estimate?.quota === 'number' ? estimate.quota : null;
	} catch {
		// ignore
	}

	try {
		persistent = (await navigator.storage?.persisted?.()) ?? null;
	} catch {
		persistent = null;
	}

	return {
		totalUsageBytes,
		quotaBytes,
		localStorageBytes,
		sessionStorageBytes,
		cacheBuckets: await getCacheBucketCount(),
		persistent,
	};
};

const clearBrowserCacheStorage = async (): Promise<number> => {
	if (typeof window === 'undefined' || !('caches' in window)) {
		return 0;
	}

	try {
		const keys = await window.caches.keys();
		const results = await Promise.all(keys.map(async (key) => window.caches.delete(key)));
		return results.filter(Boolean).length;
	} catch {
		return 0;
	}
};

export const clearSafeApplicationCaches = async (): Promise<{deletedCacheBuckets: number}> => {
	mediaDeviceCache.clear();

	await Promise.allSettled([
		clearBackgroundImages(),
		clearAudioCustomizationCache(),
		voiceStatsDB.clear(),
	]);

	return {
		deletedCacheBuckets: await clearBrowserCacheStorage(),
	};
};
