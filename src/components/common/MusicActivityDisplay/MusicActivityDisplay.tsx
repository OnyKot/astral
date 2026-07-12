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
import {ArrowSquareOutIcon, MusicNoteIcon, PauseIcon, PlayIcon} from '@phosphor-icons/react';
import {clsx} from 'clsx';
import {observer} from 'mobx-react-lite';
import type React from 'react';
import {useEffect, useMemo, useState} from 'react';
import {formatMusicArtists, type MusicActivity} from '~/lib/musicActivity';
import PresenceStore from '~/stores/PresenceStore';
import styles from './MusicActivityDisplay.module.css';

interface MusicActivityDisplayProps {
	userId?: string;
	activity?: MusicActivity | null;
	className?: string;
	compact?: boolean;
	showEmptyState?: boolean;
}

type ITunesSearchTrack = {
	artworkUrl100?: string;
	artworkUrl60?: string;
};

type ITunesSearchResponse = {
	results?: Array<ITunesSearchTrack>;
};

const artworkFallbackCache = new Map<string, string | null>();

const upscaleItunesArtwork = (url: string): string => {
	return url.replace(/\/\d+x\d+bb(?=\.)/u, '/600x600bb');
};

const buildArtworkLookupKey = (activity: MusicActivity): string => {
	return [activity.provider, activity.title, activity.artists.join(',')].join('|').toLowerCase();
};

const lookupFallbackArtwork = async (activity: MusicActivity): Promise<string | null> => {
	const query = `${activity.title} ${activity.artists[0] ?? ''}`.trim();
	if (!query) {
		return null;
	}

	const url = new URL('https://itunes.apple.com/search');
	url.searchParams.set('media', 'music');
	url.searchParams.set('entity', 'song');
	url.searchParams.set('limit', '1');
	url.searchParams.set('term', query);

	const response = await fetch(url.toString());
	if (!response.ok) {
		return null;
	}

	const payload = (await response.json()) as ITunesSearchResponse;
	const first = payload.results?.[0];
	const artwork = first?.artworkUrl100 ?? first?.artworkUrl60 ?? null;
	return artwork ? upscaleItunesArtwork(artwork) : null;
};

export const MusicActivityDisplay: React.FC<MusicActivityDisplayProps> = observer(
	({userId, activity, className, compact = false, showEmptyState = false}) => {
		const {t} = useLingui();
		const resolvedActivity = activity ?? (userId ? PresenceStore.getMusicActivity(userId) : null);
		const [fallbackArtworkUrl, setFallbackArtworkUrl] = useState<string | null>(null);
		const normalizedProvider = resolvedActivity?.provider?.trim().toLowerCase() ?? '';
		const isSteamActivity = normalizedProvider.includes('steam');

		const artworkLookupKey = useMemo(
			() => (resolvedActivity ? buildArtworkLookupKey(resolvedActivity) : null),
			[resolvedActivity],
		);

		useEffect(() => {
			let cancelled = false;

			if (!resolvedActivity || resolvedActivity.artworkUrl) {
				setFallbackArtworkUrl(null);
				return () => {
					cancelled = true;
				};
			}

			if (!artworkLookupKey) {
				setFallbackArtworkUrl(null);
				return () => {
					cancelled = true;
				};
			}

			const cached = artworkFallbackCache.get(artworkLookupKey);
			if (cached !== undefined) {
				setFallbackArtworkUrl(cached);
				return () => {
					cancelled = true;
				};
			}

			void lookupFallbackArtwork(resolvedActivity)
				.then((url) => {
					artworkFallbackCache.set(artworkLookupKey, url);
					if (!cancelled) {
						setFallbackArtworkUrl(url);
					}
				})
				.catch(() => {
					artworkFallbackCache.set(artworkLookupKey, null);
					if (!cancelled) {
						setFallbackArtworkUrl(null);
					}
				});

			return () => {
				cancelled = true;
			};
		}, [resolvedActivity, artworkLookupKey]);

		if (!resolvedActivity || isSteamActivity) {
			if (!showEmptyState) {
				return null;
			}

			return (
				<div className={clsx(styles.emptyState, className)}>
					<MusicNoteIcon className={styles.emptyIcon} weight="fill" />
					<div className={styles.emptyText}>
						<div className={styles.emptyTitle}>
							<Trans>Nothing is playing right now</Trans>
						</div>
						<div className={styles.emptyDescription}>
							<Trans>Play a track in Astral Music or enable desktop Now Playing to show a card here.</Trans>
						</div>
					</div>
				</div>
			);
		}

		const providerLabel =
			resolvedActivity.provider === 'spotify'
				? t`Spotify`
				: resolvedActivity.provider === 'yandex_music'
					? t`Yandex Music`
					: resolvedActivity.provider === 'steam'
						? t`Steam`
						: resolvedActivity.trackUrl
							? t`Astral Music`
							: t`Desktop Now Playing`;
		const stateLabel = resolvedActivity.isPlaying ? t`Listening now` : t`Paused`;
		const displayArtworkUrl = resolvedActivity.artworkUrl || fallbackArtworkUrl;

		return (
			<div className={clsx(styles.card, compact && styles.compact, className)}>
				<div className={styles.artwork}>
					{displayArtworkUrl && (
						<>
							<img src={displayArtworkUrl} alt="" className={styles.artworkImage} draggable={false} />
							<span className={styles.artworkShade} aria-hidden />
						</>
					)}
					{!displayArtworkUrl && <MusicNoteIcon className={styles.artworkIcon} weight="fill" />}
				</div>

				<div className={styles.meta}>
					<div className={styles.topRow}>
						<div className={styles.stateRow}>
							<span className={styles.stateIcon}>
								{resolvedActivity.isPlaying ? <PlayIcon weight="fill" size={12} /> : <PauseIcon weight="fill" size={12} />}
							</span>
							<span className={styles.stateText}>{stateLabel}</span>
						</div>
						{resolvedActivity.showProvider !== false && <span className={styles.providerBadge}>{providerLabel}</span>}
					</div>

					<div className={styles.title} title={resolvedActivity.title}>
						{resolvedActivity.title}
					</div>
					{resolvedActivity.artists.length > 0 && (
						<div className={styles.artists} title={formatMusicArtists(resolvedActivity.artists)}>
							{formatMusicArtists(resolvedActivity.artists)}
						</div>
					)}
					{resolvedActivity.album && (
						<div className={styles.album} title={resolvedActivity.album}>
							{resolvedActivity.album}
						</div>
					)}
				</div>

				{resolvedActivity.trackUrl && (
					<a
						href={resolvedActivity.trackUrl}
						target="_blank"
						rel="noopener noreferrer"
						className={styles.linkButton}
						aria-label={t`Open track`}
					>
						<ArrowSquareOutIcon size={16} weight="bold" />
					</a>
				)}
			</div>
		);
	},
);
