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

import {NotFoundPage} from '~/components/pages/NotFoundPage';
import {createRootRoute, createRoute, Redirect} from '~/lib/router';
import SessionManager from '~/lib/SessionManager';
import {Routes} from '~/Routes';
import {RootComponent} from '~/router/components/RootComponent';
import AuthenticationStore from '~/stores/AuthenticationStore';
import RuntimeConfigStore from '~/stores/RuntimeConfigStore';
import * as RouterUtils from '~/utils/RouterUtils';

export const rootRoute = createRootRoute({
	layout: ({children}) => <RootComponent>{children}</RootComponent>,
});

export const notFoundRoute = createRoute({
	id: '__notFound',
	path: '/__notfound',
	component: () => <NotFoundPage />,
});

const redirectAfterSession = (authenticatedPath: string, guestPath: string) => {
	if (SessionManager.isInitialized) {
		return new Redirect(AuthenticationStore.isAuthenticated ? authenticatedPath : guestPath);
	}

	void SessionManager.initialize().then(() => {
		RouterUtils.replaceWith(AuthenticationStore.isAuthenticated ? authenticatedPath : guestPath);
	});

	return undefined;
};

export const homeRoute = createRoute({
	getParentRoute: () => rootRoute,
	id: 'home',
	path: '/',
	onEnter: () => redirectAfterSession(Routes.ME, Routes.MARKETING),
});

export const marketingRoute = createRoute({
	getParentRoute: () => rootRoute,
	id: 'marketing',
	path: Routes.MARKETING,
	onEnter: () => {
		if (SessionManager.isInitialized && AuthenticationStore.isAuthenticated) {
			return new Redirect(Routes.ME);
		}

		if (!SessionManager.isInitialized) {
			void SessionManager.initialize().then(() => {
				if (AuthenticationStore.isAuthenticated) {
					RouterUtils.replaceWith(Routes.ME);
				}
			});
		}

		return undefined;
	},
	component: () => {
		const endpoint = RuntimeConfigStore.marketingEndpoint;
		const current = `${window.location.origin}${Routes.MARKETING}`;

		if (endpoint && endpoint.replace(/\/$/, '') !== current.replace(/\/$/, '')) {
			window.location.replace(endpoint);
			return null;
		}

		return (
			<div style={{display: 'grid', minHeight: '100dvh', placeItems: 'center', padding: 24}}>
				<div style={{display: 'grid', gap: 16, maxWidth: 420, textAlign: 'center'}}>
					<h1 style={{margin: 0}}>Astral</h1>
					<p style={{margin: 0, color: 'var(--text-secondary)'}}>Welcome to Astral.</p>
					<div style={{display: 'flex', gap: 12, justifyContent: 'center'}}>
						<a href={Routes.LOGIN}>Log in</a>
						<a href={Routes.REGISTER}>Create account</a>
					</div>
				</div>
			</div>
		);
	},
});
