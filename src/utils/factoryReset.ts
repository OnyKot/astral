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

/**
 * Factory-reset everything the browser holds about Astral, then reload.
 *
 * The crash-screen "Reset app data" button used to call only
 * `AppStorage.clear()` (localStorage). That left old service workers,
 * cache storage entries, sessionStorage, and origin cookies around.
 *
 * Result: a broken service worker or stale chunk could reload the same
 * crashed app again. This reset is async and best-effort; unavailable
 * browser APIs just no-op.
 */
export async function factoryReset(): Promise<void> {
	const errors: Array<unknown> = [];

	try {
		localStorage.clear();
	} catch (err) {
		errors.push(err);
	}

	try {
		sessionStorage.clear();
	} catch (err) {
		errors.push(err);
	}

	try {
		if (typeof document !== 'undefined') {
			const expired = `=; Max-Age=0; path=/; SameSite=Lax`;
			for (const raw of document.cookie.split(';')) {
				const name = raw.split('=')[0]?.trim();
				if (name) {
					document.cookie = `${name}${expired}`;
				}
			}
		}
	} catch (err) {
		errors.push(err);
	}

	await clearAppRuntimeCaches(errors);

	try {
		if (typeof indexedDB !== 'undefined' && typeof indexedDB.databases === 'function') {
			const databases = await indexedDB.databases();
			await Promise.all(
				databases
					.map((database) => database.name)
					.filter((name): name is string => Boolean(name))
					.map(
						(name) =>
							new Promise<void>((resolve) => {
								const request = indexedDB.deleteDatabase(name);
								request.onsuccess = () => resolve();
								request.onerror = () => resolve();
								request.onblocked = () => resolve();
							}),
					),
			);
		}
	} catch (err) {
		errors.push(err);
	}

	if (errors.length > 0) {
		console.warn('[factoryReset] Some steps failed (continuing):', errors);
	}
}

/**
 * Bust the HTTP cache for the page itself by reloading with a one-shot
 * cache-busting query param. Plain `location.reload()` can pull index.html
 * from cache and serve stale chunk hashes again.
 */
export async function clearAppRuntimeCaches(errors: Array<unknown> = []): Promise<void> {
	try {
		if (typeof caches !== 'undefined') {
			const keys = await caches.keys();
			await Promise.all(keys.map((k) => caches.delete(k)));
		}
	} catch (err) {
		errors.push(err);
	}

	try {
		if (typeof navigator !== 'undefined' && navigator.serviceWorker) {
			const registrations = await navigator.serviceWorker.getRegistrations();
			await Promise.all(registrations.map((r) => r.unregister().catch(() => false)));
		}
	} catch (err) {
		errors.push(err);
	}

	if (errors.length > 0) {
		console.warn('[clearAppRuntimeCaches] Some steps failed (continuing):', errors);
	}
}

export async function reloadAppHard(): Promise<void> {
	await Promise.race([
		clearAppRuntimeCaches(),
		new Promise<void>((resolve) => {
			setTimeout(resolve, 4000);
		}),
	]);
	const url = new URL(window.location.origin);
	url.pathname = '/';
	url.search = '';
	url.searchParams.set('__r', String(Date.now()));
	url.searchParams.set('__astral_cache_reset', '1');
	window.location.replace(url.toString());
	setTimeout(() => {
		if (document.visibilityState !== 'hidden') {
			window.location.href = url.toString();
		}
	}, 1500);
}
