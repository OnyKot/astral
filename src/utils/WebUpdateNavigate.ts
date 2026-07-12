/*
 * Copyright (C) 2026 Astral Contributors
 *
 * Navigate to the lightweight web update page (avoids reloading the heavy SPA shell).
 */

export function getWebUpdatePageUrl(options?: {sha?: string | null; returnPath?: string}): string {
	const url = new URL('/update.html', window.location.origin);
	if (options?.sha) {
		url.searchParams.set('sha', options.sha);
	}
	const current = window.location.pathname + window.location.search;
	const returnPath = options?.returnPath ?? (current.startsWith('/update.html') ? '/channels/@me' : current);
	url.searchParams.set('return', returnPath);
	return url.toString();
}

export function navigateToWebUpdatePage(options?: {sha?: string | null; returnPath?: string}): void {
	window.location.assign(getWebUpdatePageUrl(options));
}
