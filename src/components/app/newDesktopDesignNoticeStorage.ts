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

import AppStorage from '~/lib/AppStorage';

const STORAGE_PREFIX = 'astral:new-desktop-design-notice:v2:';

export function getDesktopDesignNoticeStorageKey(username: string | null | undefined): string | null {
	const normalized = username?.trim().toLowerCase();
	return normalized ? `${STORAGE_PREFIX}${normalized}` : null;
}

export function hasSeenDesktopDesignNotice(username: string | null | undefined): boolean {
	const key = getDesktopDesignNoticeStorageKey(username);
	if (!key) return true;
	return AppStorage.getItem(key) === '1';
}

export function markDesktopDesignNoticeSeen(username: string | null | undefined): void {
	const key = getDesktopDesignNoticeStorageKey(username);
	if (!key) return;
	AppStorage.setItem(key, '1');
}
