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

/*
 * Lightweight haptic feedback wrapper.
 *
 * Uses navigator.vibrate (Android + Chrome on most platforms). iOS
 * Safari does NOT expose vibrate() to web apps — calls are no-ops
 * there, which is fine (silent degradation). We intentionally keep
 * patterns short (<= 30ms) so they read as tactile confirmation, not
 * annoying buzz.
 *
 * Canonical semantic presets (not raw ms) so call sites stay
 * self-documenting and we can retune centrally:
 *
 *   tap()       — any primary button press (send, confirm)
 *   selection() — picker/toggle changed
 *   success()   — action completed (message sent, settings saved)
 *   warning()   — caution (about to delete, about to leave)
 *   error()     — rejected action (validation fail, network error)
 *   longPress() — crossed long-press threshold (context menu about to open)
 */

type HapticKind = 'tap' | 'selection' | 'success' | 'warning' | 'error' | 'longPress';

const PATTERNS: Record<HapticKind, number | ReadonlyArray<number>> = {
	tap: 10,
	selection: 8,
	success: [10, 30, 10],
	warning: [15, 40, 15],
	error: [20, 60, 20, 60, 20],
	longPress: 18,
};

function canVibrate(): boolean {
	if (typeof navigator === 'undefined') return false;
	if (typeof navigator.vibrate !== 'function') return false;
	return true;
}

export function haptic(kind: HapticKind): void {
	if (!canVibrate()) return;
	try {
		const pattern = PATTERNS[kind];
		// navigator.vibrate accepts number | number[]; TS may not know
		// about readonly arrays so we spread to a mutable copy.
		navigator.vibrate(Array.isArray(pattern) ? [...(pattern as ReadonlyArray<number>)] : (pattern as number));
	} catch {
		// Some browsers throw on privacy-mode or when not triggered by
		// a user gesture. Silent catch — haptic is always best-effort.
	}
}

/*
 * Convenience helpers — identical to `haptic('tap')` etc. but less
 * noisy at call sites.
 */
export const hapticTap = (): void => haptic('tap');
export const hapticSelection = (): void => haptic('selection');
export const hapticSuccess = (): void => haptic('success');
export const hapticWarning = (): void => haptic('warning');
export const hapticError = (): void => haptic('error');
export const hapticLongPress = (): void => haptic('longPress');
