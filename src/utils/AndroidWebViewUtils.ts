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

type AstralAndroidWindow = Window & {
	AstralAndroidNative?: unknown;
};

export function isAndroidWebViewShell(): boolean {
	if (typeof navigator === 'undefined') return false;

	const ua = navigator.userAgent ?? '';
	if (!/Android/i.test(ua)) return false;

	if (/\bwv\b/i.test(ua)) return true;
	if (typeof window !== 'undefined' && 'AstralAndroidNative' in (window as AstralAndroidWindow)) return true;
	return false;
}

export function isAndroidFastMode(): boolean {
	return isAndroidWebViewShell();
}
