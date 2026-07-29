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

import {observer} from 'mobx-react-lite';
import React from 'react';
import {ChannelTypes, ME} from '~/Constants';
import {AppBadge} from '~/components/AppBadge';
import {ChunkLoadBoundary} from '~/components/ChunkLoadBoundary';
import {ChannelIndexPage} from '~/components/channel/ChannelIndexPage';
import {ChannelLayout} from '~/components/channel/ChannelLayout';
import {DMLayout} from '~/components/channel/dm/DMLayout';
import {AppLayout} from '~/components/layout/AppLayout';
import {GuildsLayout} from '~/components/layout/GuildsLayout';
import {createRoute, Redirect, useParams} from '~/lib/router';
import SessionManager from '~/lib/SessionManager';
import {Routes} from '~/Routes';
import {GuildChannelRouter} from '~/router/components/GuildChannelRouter';
import {rootRoute} from '~/router/routes/rootRoutes';
import AuthenticationStore from '~/stores/AuthenticationStore';
import ChannelStore from '~/stores/ChannelStore';
import MobileLayoutStore from '~/stores/MobileLayoutStore';
import SelectedChannelStore from '~/stores/SelectedChannelStore';

/*
 * Only genuinely page-level surfaces are code-split — discovery, notifications,
 * the "you" tab, public profiles, the premium callback, the favorites layout and
 * the mobile bottom sheets. Those are where the payload win is, and a chunk of
 * theirs that goes missing degrades a single page.
 *
 * The shell — AppLayout, GuildsLayout, DMLayout, ChannelLayout and
 * ChannelIndexPage, statically imported above — deliberately ships with `main`.
 * It renders on the very route every authenticated session lands on, so
 * splitting it trades main-chunk bytes for a serial round trip on first paint;
 * worse, it leaves the whole app unrenderable for any tab still holding a
 * pre-deploy index.html, because a missing shell chunk takes down the root
 * boundary instead of a single page.
 *
 * Same React.lazy pattern as ~/router/routes/authRoutes.tsx: one chunk per
 * module, fetched on demand. Unlike the auth tree — which has a single Suspense
 * fence in AuthLayout — each lazy usage here gets its own fence, so a pending
 * leaf can only blank its own slot and never the shell rendered above it.
 */
const FavoritesLayout = React.lazy(() =>
	import('~/components/layout/FavoritesLayout').then((m) => ({default: m.FavoritesLayout})),
);
const DiscoveryPage = React.lazy(() =>
	import('~/components/pages/DiscoveryPage').then((m) => ({default: m.DiscoveryPage})),
);
const NotificationsPage = React.lazy(() =>
	import('~/components/pages/NotificationsPage').then((m) => ({default: m.NotificationsPage})),
);
const PremiumCallbackPage = React.lazy(() => import('~/components/pages/PremiumCallbackPage'));
const UserPublicProfilePage = React.lazy(() =>
	import('~/components/pages/UserPublicProfilePage').then((m) => ({default: m.UserPublicProfilePage})),
);
const YouPage = React.lazy(() => import('~/components/pages/YouPage').then((m) => ({default: m.YouPage})));
const BookmarksBottomSheet = React.lazy(() =>
	import('~/components/modals/BookmarksBottomSheet').then((m) => ({default: m.BookmarksBottomSheet})),
);
const StatusChangeBottomSheet = React.lazy(() =>
	import('~/components/modals/StatusChangeBottomSheet').then((m) => ({default: m.StatusChangeBottomSheet})),
);

/*
 * `null` is the correct fallback for these fences. React only mounts the tree
 * after index.tsx's bootstrap() has resolved and index.html ships no inline
 * loader, so a chunk that is still in flight leaves the same empty surface the
 * viewer was already looking at — it never replaces content that was painted.
 *
 * The boundary sits above the fence because a lazy payload that *rejects* — the
 * chunk 404s after a redeploy — throws instead of suspending. Left alone that
 * rejection reaches the root Sentry boundary and swaps the working app for the
 * crash screen; ChunkLoadBoundary turns it into one reload instead.
 */
const RouteChunk = ({children}: {children: React.ReactNode}): React.ReactElement => (
	<ChunkLoadBoundary>
		<React.Suspense fallback={null}>{children}</React.Suspense>
	</ChunkLoadBoundary>
);

const appLayoutRoute = createRoute({
	getParentRoute: () => rootRoute,
	id: 'appLayout',
	onEnter: () => {
		if (!SessionManager.isInitialized) {
			return undefined;
		}
		if (!AuthenticationStore.isAuthenticated) {
			const current = window.location.pathname + window.location.search;
			return new Redirect(`${Routes.LOGIN}?redirect_to=${encodeURIComponent(current)}`);
		}
		return undefined;
	},
	layout: ({children}) => (
		<>
			<AppBadge />
			<AppLayout>{children}</AppLayout>
		</>
	),
});

const guildsLayoutRoute = createRoute({
	getParentRoute: () => appLayoutRoute,
	id: 'guildsLayout',
	layout: ({children}) => <GuildsLayout>{children}</GuildsLayout>,
});

const notificationsRoute = createRoute({
	getParentRoute: () => appLayoutRoute,
	id: 'notifications',
	path: Routes.NOTIFICATIONS,
	component: () => {
		const [bookmarksSheetOpen, setBookmarksSheetOpen] = React.useState(false);

		return (
			<>
				<RouteChunk>
					<NotificationsPage onBookmarksClick={() => setBookmarksSheetOpen(true)} />
				</RouteChunk>
				{/*
				 * The sheet keeps rendering while closed — BottomSheet's
				 * AnimatePresence needs to already be mounted for the open
				 * transition to animate — so it gets its own fence to stop its
				 * chunk from holding the page behind it.
				 */}
				<RouteChunk>
					<BookmarksBottomSheet isOpen={bookmarksSheetOpen} onClose={() => setBookmarksSheetOpen(false)} />
				</RouteChunk>
			</>
		);
	},
});

const youRoute = createRoute({
	getParentRoute: () => appLayoutRoute,
	id: 'you',
	path: Routes.YOU,
	component: () => {
		const [statusSheetOpen, setStatusSheetOpen] = React.useState(false);

		return (
			<>
				<RouteChunk>
					<YouPage onAvatarClick={() => setStatusSheetOpen(true)} />
				</RouteChunk>
				<RouteChunk>
					<StatusChangeBottomSheet isOpen={statusSheetOpen} onClose={() => setStatusSheetOpen(false)} />
				</RouteChunk>
			</>
		);
	},
});

const premiumCallbackRoute = createRoute({
	getParentRoute: () => appLayoutRoute,
	id: 'premiumCallback',
	path: Routes.PREMIUM_CALLBACK,
	component: () => (
		<RouteChunk>
			<PremiumCallbackPage />
		</RouteChunk>
	),
});

const userProfileRoute = createRoute({
	getParentRoute: () => appLayoutRoute,
	id: 'userProfile',
	path: Routes.USER_PROFILE,
	component: () => {
		const {userId} = useParams() as {userId: string};
		return (
			<RouteChunk>
				<UserPublicProfilePage userId={userId} />
			</RouteChunk>
		);
	},
});

const legacyUserProfileRoute = createRoute({
	getParentRoute: () => appLayoutRoute,
	id: 'legacyUserProfile',
	path: Routes.USER_PROFILE_LEGACY,
	component: () => {
		const {userId} = useParams() as {userId: string};
		return (
			<RouteChunk>
				<UserPublicProfilePage userId={userId} />
			</RouteChunk>
		);
	},
});

const channelUserProfileRoute = createRoute({
	getParentRoute: () => appLayoutRoute,
	id: 'channelUserProfile',
	path: Routes.CHANNEL_USER_PROFILE,
	component: () => {
		const {channelId, userId} = useParams() as {channelId: string; userId: string};
		return (
			<RouteChunk>
				<UserPublicProfilePage userId={userId} channelId={channelId} />
			</RouteChunk>
		);
	},
});

const userProfileTrailingSlashRoute = createRoute({
	getParentRoute: () => appLayoutRoute,
	id: 'userProfileTrailingSlash',
	path: `${Routes.USER_PROFILE}/`,
	component: () => {
		const {userId} = useParams() as {userId: string};
		return (
			<RouteChunk>
				<UserPublicProfilePage userId={userId} />
			</RouteChunk>
		);
	},
});

const legacyUserProfileTrailingSlashRoute = createRoute({
	getParentRoute: () => appLayoutRoute,
	id: 'legacyUserProfileTrailingSlash',
	path: `${Routes.USER_PROFILE_LEGACY}/`,
	component: () => {
		const {userId} = useParams() as {userId: string};
		return (
			<RouteChunk>
				<UserPublicProfilePage userId={userId} />
			</RouteChunk>
		);
	},
});

const channelUserProfileTrailingSlashRoute = createRoute({
	getParentRoute: () => appLayoutRoute,
	id: 'channelUserProfileTrailingSlash',
	path: `${Routes.CHANNEL_USER_PROFILE}/`,
	component: () => {
		const {channelId, userId} = useParams() as {channelId: string; userId: string};
		return (
			<RouteChunk>
				<UserPublicProfilePage userId={userId} channelId={channelId} />
			</RouteChunk>
		);
	},
});

const bookmarksRoute = createRoute({
	getParentRoute: () => guildsLayoutRoute,
	id: 'bookmarks',
	path: Routes.BOOKMARKS,
	component: () => <DMLayout />,
});

const mentionsRoute = createRoute({
	getParentRoute: () => guildsLayoutRoute,
	id: 'mentions',
	path: Routes.MENTIONS,
	component: () => <DMLayout />,
});

const discoveryRoute = createRoute({
	getParentRoute: () => guildsLayoutRoute,
	id: 'discovery',
	path: Routes.DISCOVERY,
	component: () => (
		<RouteChunk>
			<DiscoveryPage />
		</RouteChunk>
	),
});

const meRoute = createRoute({
	getParentRoute: () => guildsLayoutRoute,
	id: 'me',
	path: '/channels/@me',
	component: observer(() => {
		const isMobileLayout = MobileLayoutStore.enabled;

		React.useEffect(() => {
			if (!isMobileLayout && SelectedChannelStore.selectedChannelIds.has(ME)) {
				SelectedChannelStore.clearGuildSelection(ME);
			}
		}, [isMobileLayout]);

		return <DMLayout />;
	}),
});

const favoritesRoute = createRoute({
	getParentRoute: () => guildsLayoutRoute,
	id: 'favorites',
	path: '/channels/@favorites',
	layout: ({children}) => (
		<RouteChunk>
			<FavoritesLayout>{children}</FavoritesLayout>
		</RouteChunk>
	),
});

const favoritesChannelRoute = createRoute({
	getParentRoute: () => favoritesRoute,
	id: 'favoritesChannel',
	path: '/channels/@favorites/:channelId',
	component: () => (
		<ChannelLayout>
			<ChannelIndexPage />
		</ChannelLayout>
	),
});

const channelsRoute = createRoute({
	getParentRoute: () => guildsLayoutRoute,
	id: 'channels',
	path: '/channels/:guildId',
	layout: ({children}) => {
		const params = useParams() as {guildId: string};
		const {guildId} = params;

		if (guildId === ME) {
			return <DMLayout>{children}</DMLayout>;
		}

		return guildId ? <GuildChannelRouter guildId={guildId}>{children}</GuildChannelRouter> : null;
	},
});

const channelRoute = createRoute({
	getParentRoute: () => channelsRoute,
	id: 'channel',
	path: '/channels/:guildId/:channelId',
	onEnter: (ctx) => {
		const {guildId, channelId} = ctx.params;
		const channel = ChannelStore.getChannel(channelId);
		if (channel && (channel.type === ChannelTypes.GUILD_CATEGORY || channel.type === ChannelTypes.GUILD_LINK)) {
			return new Redirect(Routes.guildChannel(guildId));
		}
		return undefined;
	},
	component: () => (
		<ChannelLayout>
			<ChannelIndexPage />
		</ChannelLayout>
	),
});

const messageRoute = createRoute({
	getParentRoute: () => channelRoute,
	id: 'message',
	path: '/channels/:guildId/:channelId/:messageId',
	onEnter: (ctx) => {
		const {guildId, channelId} = ctx.params;
		const channel = ChannelStore.getChannel(channelId);
		if (channel && (channel.type === ChannelTypes.GUILD_CATEGORY || channel.type === ChannelTypes.GUILD_LINK)) {
			return new Redirect(Routes.guildChannel(guildId));
		}
		return undefined;
	},
	component: () => (
		<ChannelLayout>
			<ChannelIndexPage />
		</ChannelLayout>
	),
});

export const appRouteTree = appLayoutRoute.addChildren([
	notificationsRoute,
	youRoute,
	premiumCallbackRoute,
	guildsLayoutRoute.addChildren([
		userProfileRoute,
		legacyUserProfileRoute,
		channelUserProfileRoute,
		userProfileTrailingSlashRoute,
		legacyUserProfileTrailingSlashRoute,
		channelUserProfileTrailingSlashRoute,
		bookmarksRoute,
		mentionsRoute,
		discoveryRoute,
		meRoute,
		favoritesRoute.addChildren([favoritesChannelRoute]),
		channelsRoute.addChildren([channelRoute.addChildren([messageRoute])]),
	]),
]);
