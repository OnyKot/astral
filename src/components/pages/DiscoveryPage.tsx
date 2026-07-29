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
import {GridFourIcon, ListIcon, MagnifyingGlassIcon} from '@phosphor-icons/react';
import {clsx} from 'clsx';
import {observer} from 'mobx-react-lite';
import React from 'react';
import * as GuildDiscoveryActionCreators from '~/actions/GuildDiscoveryActionCreators';
import {Button} from '~/components/uikit/Button/Button';
import {Routes} from '~/Routes';
import * as AvatarUtils from '~/utils/AvatarUtils';
import * as RouterUtils from '~/utils/RouterUtils';
import styles from './DiscoveryPage.module.css';

const PAGE_SIZE = 24;
const TAG_LIMIT = 3;

const safeNumber = (value: unknown, fallback = 0): number => {
	const numeric = typeof value === 'number' ? value : Number(value);
	return Number.isFinite(numeric) ? numeric : fallback;
};

const formatCount = (value: unknown): string => new Intl.NumberFormat().format(safeNumber(value));

/*
 * Persist filter / view-mode preferences across reloads. The Discovery
 * page used to forget what the user was looking at the moment they
 * navigated away — sort, category, view mode were all reset. Now they
 * live in localStorage so the page remembers the user's slice of the
 * catalog.
 */
const STORAGE_KEY = 'astral.discovery.preferences';

interface DiscoveryPreferences {
	category: string;
	sortBy: 'trending' | 'member_count' | 'created_at' | 'relevance';
	viewMode: 'grid' | 'list';
}

const DEFAULT_PREFERENCES: DiscoveryPreferences = {
	category: 'all',
	sortBy: 'trending',
	viewMode: 'grid',
};

function loadPreferences(): DiscoveryPreferences {
	if (typeof localStorage === 'undefined') return DEFAULT_PREFERENCES;
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return DEFAULT_PREFERENCES;
		const parsed = JSON.parse(raw) as Partial<DiscoveryPreferences>;
		return {
			category: parsed.category ?? DEFAULT_PREFERENCES.category,
			sortBy: parsed.sortBy ?? DEFAULT_PREFERENCES.sortBy,
			viewMode: parsed.viewMode === 'list' ? 'list' : 'grid',
		};
	} catch {
		return DEFAULT_PREFERENCES;
	}
}

function savePreferences(prefs: DiscoveryPreferences): void {
	if (typeof localStorage === 'undefined') return;
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
	} catch {
		// quota / private mode — silently ignore, defaults still work
	}
}

export const DiscoveryPage = observer(() => {
	const {i18n, t} = useLingui();
	const initialPrefsRef = React.useRef<DiscoveryPreferences | null>(null);
	if (initialPrefsRef.current === null) {
		initialPrefsRef.current = loadPreferences();
	}
	const initialPrefs = initialPrefsRef.current;

	const [searchInput, setSearchInput] = React.useState('');
	const [debouncedSearch, setDebouncedSearch] = React.useState('');
	const [activeCategory, setActiveCategory] = React.useState<string>(initialPrefs.category);
	const [sortBy, setSortBy] = React.useState<'trending' | 'member_count' | 'created_at' | 'relevance'>(
		initialPrefs.sortBy,
	);
	const [viewMode, setViewMode] = React.useState<'grid' | 'list'>(initialPrefs.viewMode);
	const [guilds, setGuilds] = React.useState<Array<GuildDiscoveryActionCreators.GuildDiscoveryItem>>([]);
	const [taxonomy, setTaxonomy] = React.useState<Array<GuildDiscoveryActionCreators.GuildDiscoveryCategory>>([]);
	const [total, setTotal] = React.useState(0);
	const [loading, setLoading] = React.useState(true);
	const [loadingMore, setLoadingMore] = React.useState(false);
	const [joiningGuildId, setJoiningGuildId] = React.useState<string | null>(null);
	const [requestedGuildIds, setRequestedGuildIds] = React.useState<Array<string>>([]);
	const [error, setError] = React.useState<string | null>(null);

	/*
	 * Debounce search-as-you-type so we don't hit the discovery
	 * endpoint on every keystroke. 280ms is the sweet spot — fast
	 * enough that the result list feels live, slow enough that a fast
	 * typer types a 6-letter query before any HTTP request fires.
	 */
	React.useEffect(() => {
		const timer = window.setTimeout(() => {
			setDebouncedSearch(searchInput.trim());
		}, 280);
		return () => window.clearTimeout(timer);
	}, [searchInput]);

	// Persist user preferences whenever they change
	React.useEffect(() => {
		savePreferences({category: activeCategory, sortBy, viewMode});
	}, [activeCategory, sortBy, viewMode]);

	const fetchGuilds = React.useCallback(
		async ({
			offset,
			append,
			query,
			category,
			sort,
		}: {
			offset: number;
			append: boolean;
			query: string;
			category: string;
			sort: 'trending' | 'member_count' | 'created_at' | 'relevance';
		}) => {
			try {
				if (append) {
					setLoadingMore(true);
				} else {
					setLoading(true);
				}
				setError(null);
				const response = await GuildDiscoveryActionCreators.fetchGuildDiscovery({
					q: query,
					limit: PAGE_SIZE,
					offset,
					sort_by: query.trim().length > 0 ? 'relevance' : sort,
					sort_order: 'desc',
					category,
				});
				setTotal(response.total);
				setTaxonomy(response.taxonomy);
				setGuilds((prev) => (append ? [...prev, ...response.guilds] : response.guilds));
			} catch {
				setError(t`Failed to load communities. Please try again.`);
				if (!append) {
					setGuilds([]);
					setTotal(0);
					setTaxonomy([]);
				}
			} finally {
				setLoading(false);
				setLoadingMore(false);
			}
		},
		[t],
	);

	const runFetch = React.useCallback(
		(offset = 0, append = false) =>
			fetchGuilds({
				offset,
				append,
				query: debouncedSearch,
				category: activeCategory,
				sort: sortBy,
			}),
		[activeCategory, fetchGuilds, debouncedSearch, sortBy],
	);

	React.useEffect(() => {
		void runFetch();
	}, [runFetch]);

	/*
	 * The form-submit handler still exists for keyboard users hitting
	 * Enter — it just flushes the debounce immediately by mirroring
	 * the input into the debounced state, which `runFetch` already
	 * watches via its dependency array.
	 */
	const handleSearchSubmit = React.useCallback(
		(event: React.FormEvent) => {
			event.preventDefault();
			setDebouncedSearch(searchInput.trim());
		},
		[searchInput],
	);

	const handleCategorySelect = React.useCallback((category: string) => {
		setActiveCategory(category);
	}, []);

	const handleCardAction = React.useCallback(
		async (guild: GuildDiscoveryActionCreators.GuildDiscoveryItem) => {
			if (guild.is_member) {
				RouterUtils.transitionTo(Routes.guildChannel(guild.id));
				return;
			}

			setJoiningGuildId(guild.id);
			try {
				const result = await GuildDiscoveryActionCreators.joinDiscoveryGuild(guild.id, i18n);
				if (result.kind === 'requested') {
					setRequestedGuildIds((prev) => (prev.includes(guild.id) ? prev : [...prev, guild.id]));
					return;
				}
				RouterUtils.transitionTo(Routes.guildChannel(result.guild.id, result.guild.system_channel_id || undefined));
			} catch {
				// Error UI is opened by GuildDiscoveryActionCreators.
			} finally {
				setJoiningGuildId(null);
			}
		},
		[i18n],
	);

	const handleResetFilters = React.useCallback(() => {
		setSearchInput('');
		setDebouncedSearch('');
		setActiveCategory('all');
		setSortBy('trending');
	}, []);

	const hasMore = guilds.length < total;
	const normalizedQuery = debouncedSearch;
	const isSearching = normalizedQuery.length > 0;
	const isSearchPending = searchInput.trim() !== debouncedSearch;
	const activeTaxonomy = React.useMemo(
		() => (taxonomy.length > 0 ? taxonomy : [{id: 'all', label: t`All`, description: '', count: total}]),
		[t, taxonomy, total],
	);
	const activeCategoryEntry = React.useMemo(
		() => activeTaxonomy.find((category) => category.id === activeCategory) ?? activeTaxonomy[0] ?? null,
		[activeCategory, activeTaxonomy],
	);
	const requestedGuildIdSet = React.useMemo(() => new Set(requestedGuildIds), [requestedGuildIds]);

	const formatTagLabel = React.useCallback(
		(tag: string): string => {
			const normalized = tag.trim().toLowerCase().replace(/[_-]+/g, ' ');
			switch (normalized) {
				case 'gaming':
					return t`Gaming`;
				case 'music':
					return t`Music`;
				case 'art':
					return t`Art`;
				case 'education':
					return t`Education`;
				case 'technology':
				case 'tech':
					return t`Technology`;
				case 'anime':
					return t`Anime`;
				case 'memes':
					return t`Memes`;
				case 'roleplay':
				case 'rp':
					return t`Roleplay`;
				case 'crypto':
					return t`Crypto`;
				case 'nft':
					return t`NFT`;
				case 'ai':
					return t`AI`;
				case 'sports':
					return t`Sports`;
				case 'movies':
				case 'film':
					return t`Movies`;
				case 'books':
					return t`Books`;
				case 'science':
					return t`Science`;
				case 'news':
					return t`News`;
				case 'community':
					return t`Community`;
				case 'business':
					return t`Business`;
				case 'travel':
					return t`Travel`;
				case 'fashion':
					return t`Fashion`;
				case 'food':
					return t`Food`;
				case 'health':
					return t`Health`;
				case 'fitness':
					return t`Fitness`;
				case 'featured':
					return t`Featured`;
				case 'trending':
					return t`Trending`;
				case 'voice':
					return t`Voice`;
				case 'media':
					return t`Media`;
				case 'expressive':
					return t`Expressive`;
				case 'large':
					return t`Large`;
				case 'new':
					return t`New`;
				default:
					return tag
						.split(/[_-]+/)
						.filter(Boolean)
						.map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
						.join(' ');
			}
		},
		[t],
	);

	const formatCategoryLabel = React.useCallback(
		(category: {id: string; label?: string | null}): string => {
			const normalizedId = category.id.trim().toLowerCase();
			switch (normalizedId) {
				case 'all':
					return t`All`;
				case 'featured':
					return t`Featured`;
				case 'trending':
					return t`Trending`;
				default: {
					const rawLabel = category.label?.trim();
					if (rawLabel) {
						return formatTagLabel(rawLabel);
					}
					return formatTagLabel(category.id);
				}
			}
		},
		[formatTagLabel, t],
	);

	const renderGuildCard = React.useCallback(
		(guild: GuildDiscoveryActionCreators.GuildDiscoveryItem) => {
			const iconUrl = AvatarUtils.getGuildIconURL({id: guild.id, icon: guild.icon});
			const guildFeatures = Array.isArray(guild.features) ? guild.features : [];
			const guildTags = Array.isArray(guild.tags) ? guild.tags : [];
			const guildName = guild.name?.trim() || t`Unknown community`;
			const requiresJoinRequest = guildFeatures.includes('INVITES_DISABLED');
			const requestPending = requestedGuildIdSet.has(guild.id);
			const actionLabel = guild.is_member
				? t`Open`
				: requestPending
					? t`Pending`
					: requiresJoinRequest
						? t`Request`
						: t`Join`;
			const statusLabel = guild.is_member
				? t`Joined`
				: requestPending
					? t`Pending`
					: requiresJoinRequest
						? t`By request`
						: null;
			const tagLine = guildTags
				.slice(0, TAG_LIMIT)
				.map((tag) => formatTagLabel(tag))
				.join(' · ');

			return (
				<article className={styles.card} key={guild.id}>
					<div className={styles.cardMain}>
						<div className={styles.cardIcon}>
							{iconUrl ? <img src={iconUrl} alt="" /> : <span>{guildName.slice(0, 1).toUpperCase()}</span>}
						</div>
						<div className={styles.cardBody}>
							<div className={styles.cardTitleRow}>
								<h3 className={styles.cardTitle}>{guildName}</h3>
								{statusLabel ? <span className={styles.cardStatus}>{statusLabel}</span> : null}
							</div>
							<p className={styles.cardMeta}>
								{t`${formatCount(guild.member_count)} members`} · {t`${formatCount(guild.presence_count)} online`}
							</p>
							{tagLine ? <p className={styles.cardTags}>{tagLine}</p> : null}
						</div>
					</div>
					<div className={styles.cardAction}>
						<Button
							onClick={() => void handleCardAction(guild)}
							variant={guild.is_member || requiresJoinRequest || requestPending ? 'secondary' : 'primary'}
							small
							disabled={requestPending || joiningGuildId === guild.id}
							submitting={joiningGuildId === guild.id}
						>
							{actionLabel}
						</Button>
					</div>
				</article>
			);
		},
		[formatTagLabel, handleCardAction, joiningGuildId, requestedGuildIdSet, t],
	);

	return (
		<div className={styles.page}>
			<div className={styles.shell}>
				<header className={styles.pageHeader}>
					<h1 className={styles.pageTitle}>
						<Trans>Discover</Trans>
					</h1>
					<p className={styles.pageSubtitle}>
						<Trans>Public communities you can browse and join.</Trans>
					</p>
				</header>

				<form onSubmit={handleSearchSubmit} className={styles.searchForm} role="search">
					<MagnifyingGlassIcon className={styles.searchIcon} weight="bold" size={18} aria-hidden="true" />
					<input
						className={styles.searchInput}
						type="search"
						value={searchInput}
						onChange={(event) => setSearchInput(event.target.value)}
						placeholder={t`Search communities`}
						aria-label={t`Search communities`}
						autoComplete="off"
						spellCheck={false}
					/>
					<button
						type="submit"
						className={clsx(styles.searchSubmit, isSearchPending && styles.searchSubmitPending)}
						aria-label={t`Search`}
						title={t`Search`}
					>
						<MagnifyingGlassIcon weight="bold" size={16} aria-hidden="true" />
					</button>
				</form>

				<div className={styles.categoryRail}>
					<div className={styles.categoryRow}>
						{activeTaxonomy.map((category) => (
							<button
								key={category.id}
								type="button"
								className={styles.categoryButton}
								data-active={activeCategory === category.id}
								onClick={() => handleCategorySelect(category.id)}
							>
								<span>{formatCategoryLabel(category)}</span>
								<span className={styles.categoryCount}>{formatCount(category.count)}</span>
							</button>
						))}
					</div>
				</div>

				<section className={styles.resultsSection} aria-labelledby="discovery-results-heading">
					<div className={styles.resultsHeader}>
						<div className={styles.resultsHeading}>
							<h2 className={styles.resultsTitle} id="discovery-results-heading">
								{isSearching ? t`Results` : t`Communities`}
							</h2>
							<p className={styles.resultsSubtitle}>
								{isSearching
									? t`"${normalizedQuery}"`
									: activeCategoryEntry
										? formatCategoryLabel(activeCategoryEntry)
										: t`All public listings`}
								{' · '}
								{t`${formatCount(total)} total`}
							</p>
						</div>

						<div className={styles.resultsTools}>
							<label className={styles.sortLabel}>
								<Trans>Sort</Trans>
								<select
									className={styles.sortSelect}
									value={sortBy}
									onChange={(event) =>
										setSortBy(event.target.value as 'trending' | 'member_count' | 'created_at' | 'relevance')
									}
								>
									<option value="trending">{t`Trending`}</option>
									<option value="member_count">{t`Members`}</option>
									<option value="created_at">{t`Newest`}</option>
									<option value="relevance">{t`Relevance`}</option>
								</select>
							</label>
							<div className={styles.viewModeToggle} role="group" aria-label={t`View mode`}>
								<button
									type="button"
									className={clsx(styles.viewModeButton, viewMode === 'grid' && styles.viewModeButtonActive)}
									onClick={() => setViewMode('grid')}
									aria-label={t`Grid view`}
									aria-pressed={viewMode === 'grid'}
									title={t`Grid view`}
								>
									<GridFourIcon size={16} weight="bold" />
								</button>
								<button
									type="button"
									className={clsx(styles.viewModeButton, viewMode === 'list' && styles.viewModeButtonActive)}
									onClick={() => setViewMode('list')}
									aria-label={t`List view`}
									aria-pressed={viewMode === 'list'}
									title={t`List view`}
								>
									<ListIcon size={16} weight="bold" />
								</button>
							</div>
						</div>
					</div>

					{loading && <p className={styles.stateText}>{t`Loading...`}</p>}
					{error && <p className={styles.errorText}>{error}</p>}

					{!loading && !error && guilds.length === 0 && (
						<div className={styles.emptyState}>
							<div className={styles.emptyStateTitle}>{t`No communities found`}</div>
							<p className={styles.emptyStateDescription}>
								{isSearching || activeCategory !== 'all'
									? t`Try another search or category.`
									: t`No public listings yet.`}
							</p>
							{(isSearching || activeCategory !== 'all' || sortBy !== 'trending') && (
								<Button variant="secondary" small onClick={handleResetFilters}>
									<Trans>Reset</Trans>
								</Button>
							)}
						</div>
					)}

					{guilds.length > 0 && (
						<>
							<div className={viewMode === 'list' ? styles.list : styles.grid}>
								{guilds.map((guild) => renderGuildCard(guild))}
							</div>

							{hasMore && (
								<div className={styles.loadMoreRow}>
									<Button
										variant="secondary"
										small
										onClick={() => void runFetch(guilds.length, true)}
										submitting={loadingMore}
									>
										<Trans>Load more</Trans>
									</Button>
								</div>
							)}
						</>
					)}
				</section>
			</div>
		</div>
	);
});
