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

import {isDesktop, type NativePlatform} from '~/utils/NativeUtils';

import {fetchReleaseManifest} from '~/utils/ReleaseClient';

export interface DesktopVersionGateInfo {
	desktopVersion?: string;
	desktopChannel?: string;
	desktopArch?: string;
	desktopOS?: string;
}

export const MINIMUM_SUPPORTED_DESKTOP_VERSION = '1.5.0';

const VERSION_PART_SPLIT_PATTERN = /[.-]/u;
const NUMERIC_PREFIX_PATTERN = /^\d+/u;

const normalizeComparableVersion = (value: string | null | undefined): Array<number> => {
	if (!value) {
		return [];
	}

	return value
		.split(VERSION_PART_SPLIT_PATTERN)
		.map((part) => {
			const match = part.match(NUMERIC_PREFIX_PATTERN);
			if (!match) {
				return null;
			}

			const parsed = Number.parseInt(match[0], 10);
			return Number.isFinite(parsed) ? parsed : null;
		})
		.filter((part): part is number => part !== null);
};

export const compareVersionStrings = (left: string | null | undefined, right: string | null | undefined): number => {
	const leftParts = normalizeComparableVersion(left);
	const rightParts = normalizeComparableVersion(right);
	const length = Math.max(leftParts.length, rightParts.length);

	for (let index = 0; index < length; index += 1) {
		const leftPart = leftParts[index] ?? 0;
		const rightPart = rightParts[index] ?? 0;

		if (leftPart > rightPart) {
			return 1;
		}
		if (leftPart < rightPart) {
			return -1;
		}
	}

	return 0;
};

export const isDesktopUpdateRequired = (info: DesktopVersionGateInfo | null | undefined): boolean => {
	if (!isDesktop()) {
		return false;
	}

	if (!info?.desktopVersion) {
		return true;
	}

	return compareVersionStrings(info.desktopVersion, MINIMUM_SUPPORTED_DESKTOP_VERSION) < 0;
};

export async function resolveMinimumSupportedDesktopVersion(): Promise<string> {
	const manifest = await fetchReleaseManifest();
	return manifest?.desktop?.minVersion ?? MINIMUM_SUPPORTED_DESKTOP_VERSION;
}

export async function isDesktopUpdateRequiredAsync(
	info: DesktopVersionGateInfo | null | undefined,
): Promise<boolean> {
	if (!isDesktop()) {
		return false;
	}

	if (!info?.desktopVersion) {
		return true;
	}

	const minimumVersion = await resolveMinimumSupportedDesktopVersion();
	return compareVersionStrings(info.desktopVersion, minimumVersion) < 0;
}

const normalizeDesktopChannel = (value: string | null | undefined): 'stable' | 'canary' => {
	return value === 'canary' ? 'canary' : 'stable';
};

const normalizeDesktopArch = (value: string | null | undefined): 'x64' | 'arm64' => {
	return value === 'arm64' ? 'arm64' : 'x64';
};

const normalizeDesktopPlatform = (value: string | null | undefined): NativePlatform => {
	switch (value) {
		case 'darwin':
		case 'macos':
			return 'macos';
		case 'linux':
			return 'linux';
		case 'win32':
		case 'windows':
			return 'windows';
		default:
			return 'unknown';
	}
};

export const getDesktopUpdateDownloadUrl = (info: DesktopVersionGateInfo | null | undefined): string => {
	const channel = normalizeDesktopChannel(info?.desktopChannel);
	const arch = normalizeDesktopArch(info?.desktopArch);
	const platform = normalizeDesktopPlatform(info?.desktopOS);

	switch (platform) {
		case 'windows':
			return `https://astraof.com/dl/desktop/${channel}/win32/${arch}/latest/setup`;
		case 'macos':
			return 'https://astraof.com/download#desktop';
		case 'linux':
			return 'https://astraof.com/download#desktop';
		default:
			return 'https://astraof.com/download';
	}
};
