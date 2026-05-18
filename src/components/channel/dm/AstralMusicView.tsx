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
import {
	ArrowClockwiseIcon,
	ArrowSquareOutIcon,
	HeartIcon,
	HeartStraightIcon,
	LinkSimpleIcon,
	MusicNotesSimpleIcon,
	PlayIcon,
	SparkleIcon,
	WaveformIcon,
} from '@phosphor-icons/react';
import {clsx} from 'clsx';
import {observer} from 'mobx-react-lite';
import React from 'react';
import {MusicActivityDisplay} from '~/components/common/MusicActivityDisplay/MusicActivityDisplay';
import {Button} from '~/components/uikit/Button/Button';
import {
	buildAstralMusicTrackSnapshot,
	type AstralMusicSearchItem,
	type AstralMusicTrackSnapshot,
} from '~/lib/astralMusic';
import AstralMusicStore from '~/stores/AstralMusicStore';
import MusicPresenceStore from '~/stores/MusicPresenceStore';
import styles from './AstralMusicView.module.css';

type AstralMusicViewProps = {
	searchQuery: string;
};

const SectionCard: React.FC<{
	title: string;
	subtitle: string;
	children: React.ReactNode;
}> = ({title, subtitle, children}) => (
	<section className={styles.sectionCard}>
		<div className={styles.sectionHeader}>
			<div>
				<div className={styles.sectionTitle}>{title}</div>
				<div className={styles.sectionSubtitle}>{subtitle}</div>
			</div>
		</div>
		{children}
	</section>
);

const TrackPill: React.FC<{
	track: AstralMusicTrackSnapshot;
	onPlay?: () => void;
	onFavorite?: () => void;
	favorited?: boolean;
}> = ({track, onPlay, onFavorite, favorited = false}) => (
	<div className={styles.trackPill}>
		<div className={styles.trackPillMeta}>
			<div className={styles.trackPillTitle}>{track.title}</div>
			<div className={styles.trackPillSubtitle}>{track.artists.join(', ')}</div>
		</div>
		<div className={styles.trackPillActions}>
			{onFavorite && (
				<Button
					small
					variant="secondary"
					className={styles.inlineButton}
					onClick={onFavorite}
					leftIcon={favorited ? <HeartStraightIcon size={14} weight="fill" /> : <HeartIcon size={14} weight="bold" />}
				>
					{favorited ? <Trans>Сохранено</Trans> : <Trans>Сохранить</Trans>}
				</Button>
			)}
			{onPlay && (
				<Button small className={styles.inlineButton} onClick={onPlay} leftIcon={<PlayIcon size={14} weight="fill" />}>
					<Trans>Поставить в карточку</Trans>
				</Button>
			)}
		</div>
	</div>
);

const SearchResultCard: React.FC<{
	item: AstralMusicSearchItem;
	onSelect?: (item: AstralMusicSearchItem) => void;
	onFavorite?: (item: AstralMusicSearchItem) => void;
	isFavorited: boolean;
}> = ({item, onSelect, onFavorite, isFavorited}) => {
	const {t} = useLingui();
	const snapshot = buildAstralMusicTrackSnapshot(item);
	const artworkUrl = snapshot?.artworkUrl ?? null;
	const primary = snapshot?.title ?? String(item.name ?? item.title ?? '');
	const secondary = snapshot?.artists.join(', ') || String(item.primary_artist ?? item.provider ?? '');
	const tertiary = snapshot?.album ?? '';
	const trackUrl = snapshot?.trackUrl ?? null;

	return (
		<div className={styles.resultCard}>
			<div
				className={styles.resultArtwork}
				style={artworkUrl ? {backgroundImage: `linear-gradient(180deg, rgb(11 13 22 / 18%), rgb(11 13 22 / 72%)), url(${artworkUrl})`} : undefined}
			>
				{!artworkUrl && <MusicNotesSimpleIcon size={18} weight="fill" />}
			</div>
			<div className={styles.resultMeta}>
				<div className={styles.resultTitle}>{primary || t`Без названия`}</div>
				<div className={styles.resultSubtitle}>{secondary || t`Пока нет данных об исполнителе`}</div>
				{tertiary && <div className={styles.resultTertiary}>{tertiary}</div>}
			</div>
			<div className={styles.resultActions}>
				{onFavorite && snapshot && (
					<Button
						small
						variant="secondary"
						className={styles.inlineButton}
						onClick={() => onFavorite(item)}
						leftIcon={isFavorited ? <HeartStraightIcon size={14} weight="fill" /> : <HeartIcon size={14} weight="bold" />}
					>
						{isFavorited ? <Trans>Сохранено</Trans> : <Trans>Сохранить</Trans>}
					</Button>
				)}
				{onSelect && snapshot && (
					<Button small className={styles.inlineButton} onClick={() => onSelect(item)} leftIcon={<PlayIcon size={14} weight="fill" />}>
						<Trans>Поставить в профиль</Trans>
					</Button>
				)}
				{trackUrl && (
					<a className={styles.resultLink} href={trackUrl} target="_blank" rel="noopener noreferrer" aria-label={t`Открыть трек`}>
						<LinkSimpleIcon size={16} weight="bold" />
					</a>
				)}
			</div>
		</div>
	);
};

export const AstralMusicView: React.FC<AstralMusicViewProps> = observer(({searchQuery}) => {
	const {t} = useLingui();
	const deferredSearchQuery = React.useDeferredValue(searchQuery.trim());
	const currentTrack = AstralMusicStore.currentTrack;

	React.useEffect(() => {
		void AstralMusicStore.ensureBootstrapped();
	}, []);

	React.useEffect(() => {
		void AstralMusicStore.search(deferredSearchQuery);
	}, [deferredSearchQuery]);

	const favoritesLookup = React.useMemo(
		() =>
			new Set(
				AstralMusicStore.favoriteTracks.map((track: AstralMusicTrackSnapshot) =>
					[track.trackUrl ?? '', track.title, track.artists.join(','), track.album ?? ''].join('|'),
				),
			),
		[AstralMusicStore.favoriteTracks],
	);

	const renderHistory = (tracks: Array<AstralMusicTrackSnapshot>, emptyText: string) => {
		if (tracks.length === 0) {
			return <div className={styles.emptyRail}>{emptyText}</div>;
		}

		return (
			<div className={styles.trackRail}>
				{tracks.map((track) => {
					const key = [track.trackUrl ?? '', track.title, track.artists.join(','), track.album ?? ''].join('|');
					return (
						<TrackPill
							key={key}
							track={track}
							favorited={favoritesLookup.has(key)}
							onPlay={() => void AstralMusicStore.savePlaybackFromItem(track)}
							onFavorite={() => void AstralMusicStore.toggleFavorite(track)}
						/>
					);
				})}
			</div>
		);
	};

	const sections = [
		{
			key: 'tracks',
			title: t`Треки`,
			subtitle: t`Быстрый выбор для карточки профиля`,
			items: AstralMusicStore.searchResults.tracks.items,
		},
		{
			key: 'albums',
			title: t`Альбомы`,
			subtitle: t`Когда одного трека уже мало`,
			items: AstralMusicStore.searchResults.albums.items,
		},
		{
			key: 'artists',
			title: t`Исполнители`,
			subtitle: t`Ищите артистов и открывайте их музыку`,
			items: AstralMusicStore.searchResults.artists.items,
		},
		{
			key: 'playlists',
			title: t`Плейлисты`,
			subtitle: t`Подборки для длинного прослушивания`,
			items: AstralMusicStore.searchResults.playlists.items,
		},
	];

	return (
		<div className={styles.root}>
			<section className={styles.hero}>
				<div className={styles.heroGlow} aria-hidden="true" />
				<div className={styles.heroHeader}>
					<div className={styles.heroBadge}>
						<WaveformIcon size={16} weight="fill" />
						<span>
							<Trans>Astral Music</Trans>
						</span>
					</div>
					<div className={styles.heroActions}>
						<Button
							small
							variant="secondary"
							onClick={() => void AstralMusicStore.refreshAll()}
							leftIcon={<ArrowClockwiseIcon size={16} weight="bold" />}
						>
							<Trans>Обновить</Trans>
						</Button>
						<Button small onClick={() => AstralMusicStore.openMusicApp()} leftIcon={<ArrowSquareOutIcon size={16} weight="bold" />}>
							<Trans>Открыть полное приложение</Trans>
						</Button>
					</div>
				</div>

				<div className={styles.heroBody}>
					<div className={styles.heroCopy}>
						<h3 className={styles.heroTitle}>
							<Trans>Встройте Astral Music прямо в мессенджер</Trans>
						</h3>
						<p className={styles.heroDescription}>
							<Trans>
								Ищите музыку в живом каталоге, закрепляйте трек в карточке профиля и держите весь музыкальный поток
								прямо в домашнем экране DM, не прыгая в отдельные окна.
							</Trans>
						</p>
						<div className={styles.heroMetrics}>
							<div className={styles.metricCard}>
								<div className={styles.metricLabel}>
									<Trans>Сессия</Trans>
								</div>
								<div className={styles.metricValue}>
									{AstralMusicStore.hasSession
										? AstralMusicStore.sessionUser?.global_name || AstralMusicStore.sessionUser?.username || t`Подключено`
										: AstralMusicStore.sessionStatus === 'loading'
											? t`Подключение`
											: t`Готово`}
								</div>
							</div>
							<div className={styles.metricCard}>
								<div className={styles.metricLabel}>
									<Trans>Текущая карточка</Trans>
								</div>
								<div className={styles.metricValue}>
									{MusicPresenceStore.currentActivity?.title || AstralMusicStore.currentTrack?.title || t`Пока ничего не выбрано`}
								</div>
							</div>
							<div className={styles.metricCard}>
								<div className={styles.metricLabel}>
									<Trans>Движок поиска</Trans>
								</div>
								<div className={styles.metricValue}>
									{AstralMusicStore.searchResults.meta.engine === 'empty'
										? t`Ожидает поиск`
										: AstralMusicStore.searchResults.meta.engine}
								</div>
							</div>
						</div>
					</div>

					<div className={styles.previewCard}>
						<div className={styles.previewEyebrow}>
							<SparkleIcon size={14} weight="fill" />
							<span>
								<Trans>Живой предпросмотр профиля</Trans>
							</span>
						</div>
						<MusicActivityDisplay activity={MusicPresenceStore.currentActivity} showEmptyState />
						<div className={styles.previewActions}>
							{currentTrack && (
								<>
									<Button
										small
										variant="secondary"
										onClick={() => void AstralMusicStore.toggleFavorite(currentTrack)}
										leftIcon={<HeartStraightIcon size={14} weight="fill" />}
									>
										<Trans>Сохранить текущий трек</Trans>
									</Button>
									<Button small variant="secondary" onClick={() => void AstralMusicStore.clearPlayback()}>
										<Trans>Очистить карточку</Trans>
									</Button>
								</>
							)}
						</div>
					</div>
				</div>
			</section>

			<div className={styles.layout}>
				<div className={styles.mainColumn}>
					<SectionCard
						title={deferredSearchQuery ? t`Результаты поиска` : t`Поиск по Astral Music`}
						subtitle={
							deferredSearchQuery
								? t`Выберите любой результат, и карточка в Astral обновится сразу`
								: t`Начните печатать выше, чтобы искать треки, альбомы, артистов и плейлисты прямо в музыкальном каталоге`
						}
					>
						{AstralMusicStore.searchStatus === 'loading' && <div className={styles.searchState}>Ищем в Astral Music...</div>}
						{AstralMusicStore.searchStatus === 'error' && (
							<div className={styles.searchState}>
								{AstralMusicStore.searchError || t`Поиск по музыке сейчас недоступен.`}
							</div>
						)}
						{AstralMusicStore.searchStatus !== 'loading' && !deferredSearchQuery && (
							<div className={styles.searchState}>
								<Trans>Используйте поле поиска выше, чтобы быстро вывести нужный трек прямо в мессенджер.</Trans>
							</div>
						)}
						{AstralMusicStore.searchStatus === 'ready' && !AstralMusicStore.hasSearchResults && deferredSearchQuery && (
							<div className={styles.searchState}>
								<Trans>Ничего не найдено. Попробуйте более общий запрос по треку, артисту или альбому.</Trans>
							</div>
						)}
						{AstralMusicStore.hasSearchResults && (
							<div className={styles.sectionsGrid}>
								{sections
									.filter((section) => section.items.length > 0)
									.map((section) => (
										<section key={section.key} className={styles.resultsSection}>
											<div className={styles.resultsHeader}>
												<div className={styles.resultsTitle}>{section.title}</div>
												<div className={styles.resultsSubtitle}>{section.subtitle}</div>
											</div>
											<div className={styles.resultsList}>
												{section.items.map((item: AstralMusicSearchItem, index: number) => {
													const snapshot = buildAstralMusicTrackSnapshot(item);
													const favoriteKey = snapshot
														? [snapshot.trackUrl ?? '', snapshot.title, snapshot.artists.join(','), snapshot.album ?? ''].join('|')
														: `${section.key}:${index}`;
													return (
														<SearchResultCard
															key={favoriteKey}
															item={item}
															isFavorited={snapshot ? favoritesLookup.has(favoriteKey) : false}
															onSelect={(nextItem) => void AstralMusicStore.savePlaybackFromItem(nextItem)}
															onFavorite={(nextItem) => void AstralMusicStore.toggleFavorite(nextItem)}
														/>
													);
												})}
											</div>
										</section>
									))}
							</div>
						)}
					</SectionCard>
				</div>

				<div className={styles.sideColumn}>
					<SectionCard title={t`Закреплённые избранные`} subtitle={t`Треки, которые можно мгновенно вернуть в карточку профиля`}>
						{renderHistory(AstralMusicStore.favoriteTracks, t`Пока ничего не закреплено. Сохраните что-нибудь из поиска или из текущей карточки.`)}
					</SectionCard>

					<SectionCard title={t`Недавние выборы`} subtitle={t`Последние треки из Astral Music всегда под рукой внутри мессенджера`}>
						{renderHistory(AstralMusicStore.historyTracks, t`Здесь появятся ваши последние треки из Astral Music.`)}
					</SectionCard>
				</div>
			</div>
		</div>
	);
});
