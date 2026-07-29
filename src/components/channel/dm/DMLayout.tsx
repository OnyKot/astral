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
import * as NavigationActionCreators from '~/actions/NavigationActionCreators';
import {ME} from '~/Constants';
import {DMChannelView} from '~/components/channel/channel-view/DMChannelView';
import {DMFriendsView} from '~/components/channel/dm/DMFriendsView';
import {DMList} from '~/components/channel/dm/DMList';
import {RecentMentionsPage} from '~/components/pages/RecentMentionsPage';
import {SavedMessagesPage} from '~/components/pages/SavedMessagesPage';
import {useEdgeSwipeBack} from '~/hooks/useEdgeSwipeBack';
import {useLocation, useParams} from '~/lib/router';
import {Routes} from '~/Routes';
import MobileLayoutStore from '~/stores/MobileLayoutStore';
import * as RouterUtils from '~/utils/RouterUtils';
import styles from './DMLayout.module.css';

const MOBILE_FRIENDS_CHANNEL_ID = '@friends';

export const DMLayout = observer(({children}: {children?: React.ReactNode}) => {
	const {channelId, messageId} = useParams() as {channelId?: string; messageId?: string};
	const location = useLocation();
	const mobileLayout = MobileLayoutStore;
	const isMobileFriendsRoute = channelId === MOBILE_FRIENDS_CHANNEL_ID;
	const isMobileContentView =
		mobileLayout.enabled &&
		(Boolean(channelId) || Boolean(children) || location.pathname === Routes.BOOKMARKS || location.pathname === Routes.MENTIONS);

	React.useEffect(() => {
		if (Routes.isDMRoute(location.pathname) || Routes.isFavoritesRoute(location.pathname)) {
			NavigationActionCreators.deselectGuild();
		}
	}, [location.pathname]);

	React.useEffect(() => {
		if (Routes.isDMRoute(location.pathname) && channelId && !isMobileFriendsRoute) {
			NavigationActionCreators.selectChannel(ME, channelId, messageId);
		}
	}, [channelId, messageId, location.pathname, isMobileFriendsRoute]);

	const handleSwipeBack = React.useCallback(() => {
		if (!mobileLayout.enabled || location.pathname === Routes.ME) {
			return;
		}
		RouterUtils.transitionTo(Routes.ME);
	}, [mobileLayout.enabled, location.pathname]);

	const {
		gestureProps,
		containerRef: edgeSwipeContainerRef,
		stageStyle,
		isActive: isEdgeSwipeActive,
		isPreviewVisible: isEdgeSwipePreviewVisible,
		progress: edgeSwipeProgress,
	} = useEdgeSwipeBack({
		enabled: isMobileContentView && location.pathname !== Routes.ME,
		onBack: handleSwipeBack,
		edgeZonePx: 42,
		activationPx: 12,
		triggerPx: 84,
		maxOffsetPx: 240,
		maxVerticalDriftPx: 52,
		triggerVelocityPxPerSecond: 840,
		commitDurationMs: 190,
	});
	const mobileSwipePreviewStyle = React.useMemo(
		() =>
			({
				'--dm-swipe-preview-opacity': Math.min(1, edgeSwipeProgress * 1.05),
				'--dm-swipe-preview-offset': `${-10 + edgeSwipeProgress * 10}px`,
			}) as React.CSSProperties,
		[edgeSwipeProgress],
	);

	const renderContent = () => {
		if (location.pathname === Routes.BOOKMARKS) {
			return <SavedMessagesPage />;
		}
		if (location.pathname === Routes.MENTIONS) {
			return <RecentMentionsPage />;
		}
		if (isMobileFriendsRoute) {
			return <DMFriendsView />;
		}
		if (channelId) {
			return <DMChannelView key={channelId} channelId={channelId} />;
		}
		if (children) {
			return children;
		}
		return <DMFriendsView />;
	};

	if (mobileLayout.enabled) {
		if (!isMobileContentView) {
			return (
				<div className={styles.dmListColumn}>
					<DMList />
				</div>
			);
		}
		return (
			<div
				ref={edgeSwipeContainerRef}
				className={styles.contentColumn}
				data-edge-swipe-active={isEdgeSwipeActive ? '1' : '0'}
				data-chat-edge-swipe-host="true"
				style={mobileSwipePreviewStyle}
				{...gestureProps}
			>
				{isEdgeSwipePreviewVisible && (
					<div className={styles.mobileSwipePreview} aria-hidden={!isEdgeSwipePreviewVisible}>
						<DMList />
					</div>
				)}
				<div className={styles.contentInner} style={stageStyle}>
					{renderContent()}
				</div>
			</div>
		);
	}

	return (
		<div className={styles.dmLayoutContainer}>
			<div className={styles.dmListColumn}>
				<DMList />
			</div>
			<div className={styles.contentColumn}>
				<div className={styles.contentInner}>{renderContent()}</div>
			</div>
		</div>
	);
});
