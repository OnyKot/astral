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

const canWarmup = (): boolean => {
	if (typeof window === 'undefined') return false;
	const nav = navigator as Navigator & {
		connection?: {
			saveData?: boolean;
			effectiveType?: string;
		};
		deviceMemory?: number;
	};

	// Respect low-end devices / data-saving mode.
	if (nav.connection?.saveData) return false;
	if (nav.connection?.effectiveType === '2g') return false;
	if (typeof nav.deviceMemory === 'number' && nav.deviceMemory <= 2) return false;
	return true;
};

const runWarmupImports = (): void => {
	void import('~/components/pages/DiscoveryPage');
	void import('~/components/modals/UserProfileModal');
	void import('~/components/modals/tabs/VoiceTab');
	void import('~/components/modals/tabs/VideoTab');
	void import('~/components/voice/VoiceCallView');
};

export const warmupCriticalChunks = (): void => {
	if (!canWarmup()) return;

	const schedule = (window as Window & {
		requestIdleCallback?: (cb: IdleRequestCallback, options?: IdleRequestOptions) => number;
	}).requestIdleCallback;

	if (schedule) {
		schedule(() => {
			runWarmupImports();
		}, {timeout: 3500});
		return;
	}

	window.setTimeout(() => {
		runWarmupImports();
	}, 1200);
};

