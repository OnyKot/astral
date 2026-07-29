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

import {isAndroidFastMode} from '~/utils/AndroidWebViewUtils';

const canWarmup = (): boolean => {
	if (typeof window === 'undefined') return false;
	if (isAndroidFastMode()) return false;
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

/*
 * Only modules that are *exclusively* reached through a dynamic import belong
 * here: an `import()` for something the initial graph already pulls in statically
 * resolves from the module cache and warms nothing.
 *
 * That was the case for the three entries this list used to carry —
 * UserProfileModal (statically imported by ~/actions/UserProfileActionCreators
 * and the user popouts) and the VoiceTab/VideoTab pair (reached from
 * UserSettingsModal, which src/App.tsx imports at the root). They have been
 * dropped rather than left in as no-ops.
 *
 * What is left is the secondary app routes, which src/router/routes/appRoutes.tsx
 * now code-splits, plus the voice call view that GuildChannelView lazy-loads. The
 * app shell and chat chunks are deliberately NOT warmed here: appRoutes requests
 * those while it evaluates, long before this runs, because the landing route
 * needs them immediately.
 */
const runWarmupImports = (): void => {
	void import('~/components/pages/DiscoveryPage');
	void import('~/components/pages/NotificationsPage');
	void import('~/components/pages/YouPage');
	void import('~/components/pages/UserPublicProfilePage');
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

