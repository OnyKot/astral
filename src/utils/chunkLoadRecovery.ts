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

import {reloadAppHard} from '~/utils/factoryReset';

/*
 * The same failure — a code-split chunk that no longer exists on the server —
 * is reported under a different name by every engine: rspack/webpack throw a
 * `ChunkLoadError`, Chrome throws a TypeError naming the module, Firefox and
 * Safari each phrase it their own way. Match all of them so recovery does not
 * silently stop working when the bundler or the browser changes its wording.
 */
const CHUNK_LOAD_ERROR_PATTERN =
	/ChunkLoadError|Loading chunk .+ failed|Loading CSS chunk .+ failed|Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed|Unable to preload CSS/i;

const matchesChunkLoadError = (value: string): boolean => CHUNK_LOAD_ERROR_PATTERN.test(value);

export const isChunkLoadError = (value: unknown): boolean => {
	if (typeof value === 'string') {
		return matchesChunkLoadError(value);
	}

	if (value instanceof Error) {
		return matchesChunkLoadError(value.name) || matchesChunkLoadError(value.message);
	}

	// Not every engine hands us a real Error — Sentry boundaries and some polyfills
	// pass a plain object through — so duck-type name/message as well.
	if (typeof value === 'object' && value !== null) {
		const candidate = value as {name?: unknown; message?: unknown};
		return matchesChunkLoadError(String(candidate.name)) || matchesChunkLoadError(String(candidate.message));
	}

	return false;
};

/*
 * The marker lives in sessionStorage because it has to survive the reload it is
 * guarding (reloadAppHard drops the HTTP/service-worker caches, not session
 * state) and die with the tab.
 *
 * It stores a timestamp rather than a boolean so the guard clears itself: a tab
 * whose reload actually fixed the problem is free to recover again much later,
 * while a deploy that stays broken — or a device that is simply offline — costs
 * at most one reload per window instead of looping forever.
 */
const CHUNK_RELOAD_MARKER_KEY = '__astral_chunk_reload';
const CHUNK_RELOAD_WINDOW_MS = 120000;

const hasRecentChunkReload = (): boolean => {
	try {
		const raw = sessionStorage.getItem(CHUNK_RELOAD_MARKER_KEY);
		if (!raw) {
			return false;
		}

		const attemptedAt = Number(raw);
		if (!Number.isFinite(attemptedAt)) {
			return false;
		}

		return Date.now() - attemptedAt < CHUNK_RELOAD_WINDOW_MS;
	} catch {
		// sessionStorage throws in locked-down/private contexts. Fail closed: with
		// no way to remember an attempt, reloading could never terminate.
		return true;
	}
};

/**
 * Reload the app once so the browser fetches a fresh index.html naming the
 * chunks that actually exist.
 *
 * Retrying in place cannot work: React.lazy memoises the *rejected* payload, so
 * re-rendering the component replays the rejection without re-issuing the
 * request. Only a new document can recover a tab that is holding an index.html
 * from before a redeploy.
 *
 * Returns true when a reload was started (the caller should keep rendering
 * nothing), false when the budget is spent and the error should surface.
 */
export const recoverFromChunkLoadError = (): boolean => {
	if (typeof window === 'undefined') {
		return false;
	}

	/*
	 * The very same rejection is what a dead network produces, and there a reload
	 * makes things strictly worse: reloadAppHard unregisters the service worker on
	 * the way out, so the user lands on the browser's offline page instead of the
	 * app. `onLine === false` is the one direction of that flag worth trusting.
	 */
	if (typeof navigator !== 'undefined' && navigator.onLine === false) {
		return false;
	}

	if (hasRecentChunkReload()) {
		return false;
	}

	try {
		sessionStorage.setItem(CHUNK_RELOAD_MARKER_KEY, String(Date.now()));
	} catch {
		// Same reasoning as above: no marker means no loop protection, so we would
		// rather show the crash screen than risk an endless reload.
		return false;
	}

	void reloadAppHard();
	return true;
};
