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

import {Routes} from '~/Routes';

export const AUTO_REDIRECT_EXEMPT_PATHS = new Set<string>([
	Routes.RESET_PASSWORD,
	Routes.AUTHORIZE_IP,
	Routes.EMAIL_REVERT,
	Routes.VERIFY_EMAIL,
	Routes.OAUTH_AUTHORIZE,
	Routes.REPORT,
]);

const AUTO_REDIRECT_EXEMPT_PREFIXES = ['/invite/', '/gift/', '/gifts/', '/theme/', '/oauth2/'];

export const isAutoRedirectExemptPath = (pathname: string): boolean => {
	if (AUTO_REDIRECT_EXEMPT_PATHS.has(pathname)) {
		return true;
	}

	return AUTO_REDIRECT_EXEMPT_PREFIXES.some((prefix) => pathname.startsWith(prefix));
};

/**
 * Surfaces that deliberately run without a gateway socket, even for a visitor
 * who already holds a token: the auth forms plus the standalone invite / gift /
 * theme / OAuth / report pages.
 *
 * This mirrors the `isAuthRoute` memo in src/router/components/RootComponent.tsx
 * — that component bails out of `ensureSessionStarted` on exactly these paths.
 * The list lives here as well so src/index.tsx can make the same call *before*
 * React mounts, when it opens the socket early to overlap the boot waterfall.
 * Keep the two in sync (ideally collapse RootComponent onto this helper).
 */
const GATEWAY_BYPASS_PREFIXES = [
	Routes.LOGIN,
	Routes.REGISTER,
	Routes.FORGOT_PASSWORD,
	Routes.RESET_PASSWORD,
	Routes.VERIFY_EMAIL,
	Routes.AUTHORIZE_IP,
	Routes.EMAIL_REVERT,
	Routes.OAUTH_AUTHORIZE,
	Routes.REPORT,
	'/invite/',
	'/gift/',
	'/gifts/',
	'/theme/',
];

export const isGatewayBypassPath = (pathname: string): boolean =>
	GATEWAY_BYPASS_PREFIXES.some((prefix) => pathname.startsWith(prefix));

/**
 * Routes an unauthenticated visitor is allowed to view without being bounced
 * to the login screen. These include the public marketing surface, which is
 * normally served by the marketing service but can be handled by the SPA in
 * local development or after an edge-routing fallback.
 */
export const PUBLIC_UNAUTHENTICATED_PATHS = new Set<string>([
	Routes.HOME,
	Routes.MARKETING,
	'/ai-agent',
	'/careers',
	'/company-information',
	'/docs',
	'/download',
	'/guidelines',
	'/help',
	'/how-it-works',
	'/manifest',
	'/manifesto',
	'/moved',
	'/partners',
	'/philosophy',
	'/plutonium',
	'/press',
	'/privacy',
	'/security',
	'/status',
	'/terms',
]);

const PUBLIC_UNAUTHENTICATED_PREFIXES = [`${Routes.MARKETING}/`, '/help/'];

export const isPublicUnauthenticatedPath = (pathname: string): boolean =>
	PUBLIC_UNAUTHENTICATED_PATHS.has(pathname) ||
	PUBLIC_UNAUTHENTICATED_PREFIXES.some((prefix) => pathname.startsWith(prefix));
