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

import {type AndroidAppInfo, getAndroidAppInfo, isNativeAndroidApp} from '~/utils/AndroidAppInfo';
import {fetchReleaseManifest} from '~/utils/ReleaseClient';

export const MINIMUM_SUPPORTED_ANDROID_VERSION_CODE = 1500;

const ANDROID_UPDATE_DOWNLOAD_URL = 'https://astraof.com/download#android';

export async function resolveMinimumSupportedAndroidVersionCode(): Promise<number> {
	const manifest = await fetchReleaseManifest();
	const minVersionCode = manifest?.android?.minVersionCode;
	if (typeof minVersionCode === 'number' && Number.isFinite(minVersionCode)) {
		return minVersionCode;
	}
	return MINIMUM_SUPPORTED_ANDROID_VERSION_CODE;
}

export async function isAndroidUpdateRequiredAsync(info: AndroidAppInfo | null | undefined): Promise<boolean> {
	if (!isNativeAndroidApp()) {
		return false;
	}

	if (!info || typeof info.versionCode !== 'number') {
		return true;
	}

	const minimumVersionCode = await resolveMinimumSupportedAndroidVersionCode();
	return info.versionCode < minimumVersionCode;
}

export async function getAndroidUpdateGateInfo(): Promise<{
	required: boolean;
	info: AndroidAppInfo | null;
	requiredVersionCode: number;
}> {
	if (!isNativeAndroidApp()) {
		return {required: false, info: null, requiredVersionCode: MINIMUM_SUPPORTED_ANDROID_VERSION_CODE};
	}

	const [info, requiredVersionCode] = await Promise.all([
		getAndroidAppInfo(),
		resolveMinimumSupportedAndroidVersionCode(),
	]);

	const required = !info || typeof info.versionCode !== 'number' || info.versionCode < requiredVersionCode;
	return {required, info, requiredVersionCode};
}

export const getAndroidUpdateDownloadUrl = (): string => ANDROID_UPDATE_DOWNLOAD_URL;
