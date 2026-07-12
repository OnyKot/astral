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

import {Trans, useLingui} from '@lingui/react/macro';
import {PlayIcon, TwitchLogoIcon} from '@phosphor-icons/react';
import {clsx} from 'clsx';
import {observer} from 'mobx-react-lite';
import React from 'react';
import {formatMusicArtists, isTwitchLiveActivity} from '~/lib/musicActivity';
import AuthenticationStore from '~/stores/AuthenticationStore';
import PresenceStore from '~/stores/PresenceStore';
import TwitchIntegrationStore from '~/stores/TwitchIntegrationStore';
import styles from './ProfileStreamingStatusCard.module.css';

interface ProfileStreamingStatusCardProps {
	userId: string;
	compact?: boolean;
}

const REFRESH_INTERVAL_MS = 60_000;

const getTwitchLoginFromUrl = (url: string | null | undefined): string | null => {
	if (!url) {
		return null;
	}

	try {
		const parsed = new URL(url);
		if (!parsed.hostname.toLowerCase().includes('twitch.tv')) {
			return null;
		}

		const [login] = parsed.pathname.split('/').filter(Boolean);
		return login ? login.toLowerCase() : null;
	} catch {
		return null;
	}
};

export const ProfileStreamingStatusCard: React.FC<ProfileStreamingStatusCardProps> = observer(
	({userId, compact = false}) => {
		const {t} = useLingui();
		const isCurrentUser = userId === AuthenticationStore.currentUserId;
		const presenceActivity = PresenceStore.getMusicActivity(userId);
		const hasPresenceTwitchLive = isTwitchLiveActivity(presenceActivity);

		React.useEffect(() => {
			if (!isCurrentUser) {
				return;
			}

			void TwitchIntegrationStore.ensureBootstrapped();
			const interval = setInterval(() => {
				void TwitchIntegrationStore.refreshLiveState();
			}, REFRESH_INTERVAL_MS);

			return () => {
				clearInterval(interval);
			};
		}, [isCurrentUser]);

		const connection = TwitchIntegrationStore.connection;
		const liveState = TwitchIntegrationStore.liveState;
		const hasStoreLive =
			Boolean(connection) &&
			Boolean(liveState?.isLive) &&
			(liveState?.creatorUserId === userId || liveState?.login === connection?.login);

		if ((!isCurrentUser || !connection || !liveState || !hasStoreLive) && !hasPresenceTwitchLive) {
			return null;
		}

		const shouldUseStoreLive = Boolean(isCurrentUser && connection && liveState && hasStoreLive);
		const presenceLogin = getTwitchLoginFromUrl(presenceActivity?.trackUrl);
		const channelLogin = shouldUseStoreLive ? liveState!.login || connection!.login : presenceLogin;
		const channelDisplayName = shouldUseStoreLive
			? liveState!.displayName || connection!.displayName || channelLogin
			: presenceActivity?.title?.trim() || null;
		const channelUrl = shouldUseStoreLive
			? `https://www.twitch.tv/${encodeURIComponent(channelLogin!)}`
			: presenceActivity?.trackUrl || null;
		const previewUrl =
			channelLogin
				? `https://static-cdn.jtvnw.net/previews-ttv/live_user_${encodeURIComponent(channelLogin)}-640x360.jpg?m=${Math.floor(Date.now() / 60_000)}`
				: null;

		const startedAtLabel = shouldUseStoreLive && liveState!.startedAt > 0
			? new Intl.DateTimeFormat(undefined, {hour: '2-digit', minute: '2-digit'}).format(new Date(liveState!.startedAt))
			: null;
		const presenceMeta = presenceActivity ? formatMusicArtists(presenceActivity.artists) : '';

		return (
			<div className={clsx(styles.root, compact && styles.rootCompact)}>
				<div className={styles.headerRow}>
					<span className={styles.streamingBadge}>
						<span className={styles.streamingBadgeIcon}>
							<PlayIcon size={10} weight="fill" />
						</span>
						<Trans>Streaming</Trans>
					</span>
					{channelUrl ? (
						<a href={channelUrl} target="_blank" rel="noreferrer" className={styles.channelLink}>
							<TwitchLogoIcon size={12} weight="fill" />
							<span>{channelLogin ? `@${channelLogin}` : t`Open channel`}</span>
						</a>
					) : (
						<span className={styles.channelLink}>
							<TwitchLogoIcon size={12} weight="fill" />
							<span>Twitch</span>
						</span>
					)}
				</div>

				<div className={styles.title}>{channelDisplayName || t`Live on Twitch`}</div>
				{startedAtLabel && (
					<div className={styles.metaText}>
						{t`Started at ${startedAtLabel}`}
					</div>
				)}
				{!startedAtLabel && presenceMeta && <div className={styles.metaText}>{presenceMeta}</div>}

				{channelUrl && previewUrl && (
					<a href={channelUrl} target="_blank" rel="noreferrer" className={styles.previewLink}>
						<img src={previewUrl} alt={t`Live preview`} className={styles.previewImage} loading="lazy" />
					</a>
				)}
			</div>
		);
	},
);
