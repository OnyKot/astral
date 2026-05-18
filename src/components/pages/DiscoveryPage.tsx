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
import {CompassIcon, GridFourIcon, ListIcon, MagnifyingGlassIcon, UsersIcon} from '@phosphor-icons/react';
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
const FEATURE_LIMIT = 2;

const formatCount = (value: number): string => new Intl.NumberFormat().format(value);

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
	const activeTaxonomy = React.useMemo(
		() => (taxonomy.length > 0 ? taxonomy : [{id: 'all', label: t`All`, description: '', count: total}]),
		[t, taxonomy, total],
	);
	const activeCategoryEntry = React.useMemo(
		() => activeTaxonomy.find((category) => category.id === activeCategory) ?? activeTaxonomy[0] ?? null,
		[activeCategory, activeTaxonomy],
	);
	const requestedGuildIdSet = React.useMemo(() => new Set(requestedGuildIds), [requestedGuildIds]);
	const visibleOnline = React.useMemo(() => guilds.reduce((sum, guild) => sum + guild.presence_count, 0), [guilds]);
	const joinableCount = React.useMemo(
		() => guilds.filter((guild) => guild.is_member || !guild.features.includes('INVITES_DISABLED')).length,
		[guilds],
	);
	const memberGuildCount = React.useMemo(() => guilds.filter((guild) => guild.is_member).length, [guilds]);
	const formatFeatureLabel = React.useCallback(
		(feature: string): string => {
			switch (feature) {
				case 'INVITES_DISABLED':
					return t`Request required`;
				case 'DISCOVERABLE_DISABLED':
					return t`Hidden listing`;
				case 'COMMUNITY':
					return t`Community`;
				case 'VERIFIED':
					return t`Verified`;
				case 'PARTNERED':
					return t`Partnered`;
				default:
					return feature
						.split('_')
						.filter(Boolean)
						.map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
						.join(' ');
			}
		},
		[t],
	);

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
			const bannerUrl =
				AvatarUtils.getGuildBannerURL({id: guild.id, banner: guild.banner}) ??
				AvatarUtils.getGuildSplashURL({id: guild.id, splash: guild.splash}, 1024);
			const iconUrl = AvatarUtils.getGuildIconURL({id: guild.id, icon: guild.icon});
			const requiresJoinRequest = guild.features.includes('INVITES_DISABLED');
			const requestPending = requestedGuildIdSet.has(guild.id);
			const actionLabel = guild.is_member
				? t`Open community`
				: requestPending
					? t`Request sent`
					: requiresJoinRequest
						? t`Request access`
						: t`Join community`;
			const statusLabel = guild.is_member
				? t`Already joined`
				: requestPending
					? t`Request pending`
					: requiresJoinRequest
						? t`Review required`
						: t`Open to join`;
			const tagLabels = (guild.tags ?? []).slice(0, 6);
			const featureLabels = guild.features.slice(0, FEATURE_LIMIT).map(formatFeatureLabel);

			return (
				<article
					className={styles.card}
					key={guild.id}
				>
					<div className={styles.cardBanner} style={bannerUrl ? {backgroundImage: `url(${bannerUrl})`} : undefined}>
						<div className={styles.cardOverlay} />
						<div className={styles.cardMetaRow}>
							<span className={styles.cardStatusPill}>{statusLabel}</span>
						</div>
					</div>

					<div className={styles.cardContent}>
						<div className={styles.cardTitleRow}>
							<div className={styles.cardIcon}>
								{iconUrl ? <img src={iconUrl} alt="" /> : <span>{guild.name.slice(0, 1).toUpperCase()}</span>}
							</div>
							<div className={styles.cardTitleBlock}>
								<h3 className={styles.cardTitle}>{guild.name}</h3>
								<div className={styles.cardStats}>
									<span>{t`${formatCount(guild.presence_count)} online`}</span>
									<span>{t`${formatCount(guild.member_count)} members`}</span>
								</div>
							</div>
						</div>

						<div className={styles.cardDescription}>
							{guild.is_member ? (
								<Trans>You're already in this community. Jump back in instantly.</Trans>
							) : requestPending ? (
								<Trans>Your join request is waiting for review.</Trans>
							) : requiresJoinRequest ? (
								<Trans>This community reviews join requests before letting new members enter.</Trans>
							) : (
								<Trans>Open community. Join directly from Discovery.</Trans>
							)}
						</div>

						{featureLabels.length > 0 && (
							<div className={styles.featureList}>
								{featureLabels.map((feature) => (
									<span key={`${guild.id}:${feature}`} className={styles.featureChip}>
										{feature}
									</span>
								))}
							</div>
						)}

						{tagLabels.length > 0 && (
							<div className={styles.featureList}>
								{tagLabels.map((tag) => (
									<span key={`${guild.id}:tag:${tag}`} className={styles.tagChip}>
										#{formatTagLabel(tag)}
									</span>
								))}
							</div>
						)}

						<div className={styles.cardFooter}>
							<div className={styles.cardTrendMetric}>
								<span className={styles.metricLabel}>{t`Trending`}</span>
								<span className={styles.metricValue}>{Math.max(0, Math.round(guild.trending_score))}</span>
							</div>
							<Button
								onClick={() => void handleCardAction(guild)}
								variant={guild.is_member || requiresJoinRequest || requestPending ? 'secondary' : 'primary'}
								disabled={requestPending || joiningGuildId === guild.id}
								submitting={joiningGuildId === guild.id}
							>
								{actionLabel}
							</Button>
						</div>
					</div>
				</article>
			);
		},
		[formatFeatureLabel, formatTagLabel, handleCardAction, joiningGuildId, requestedGuildIdSet, t],
	);

	return (
		<div className={styles.page}>
			<section className={styles.hero}>
				<div className={styles.heroTopRow}>
					<div className={styles.heroBadge}>
						<CompassIcon size={16} weight="fill" />
						<span>
							<Trans>Community Discovery</Trans>
						</span>
					</div>
				</div>

				<div className={styles.heroMain}>
					<div className={styles.heroCopy}>
						<h1 className={styles.heroTitle}>
							<Trans>Find a community that actually fits your vibe</Trans>
						</h1>
						<p className={styles.heroSubtitle}>
							<Trans>Explore active public spaces, see what is already alive right now, and jump into the right room without blind searching.</Trans>
						</p>
					</div>

					<div className={styles.heroStats}>
						<div className={styles.heroStatCard}>
							<span className={styles.heroStatLabel}>{t`Listed now`}</span>
							<strong className={styles.heroStatValue}>{formatCount(total)}</strong>
						</div>
						<div className={styles.heroStatCard}>
							<span className={styles.heroStatLabel}>{t`Online in results`}</span>
							<strong className={styles.heroStatValue}>{formatCount(visibleOnline)}</strong>
						</div>
						<div className={styles.heroStatCard}>
							<span className={styles.heroStatLabel}>{t`Ready to join`}</span>
							<strong className={styles.heroStatValue}>{formatCount(joinableCount)}</strong>
						</div>
						<div className={styles.heroStatCard}>
							<span className={styles.heroStatLabel}>{t`Already yours`}</span>
							<strong className={styles.heroStatValue}>{formatCount(memberGuildCount)}</strong>
						</div>
					</div>
				</div>

				<form onSubmit={handleSearchSubmit} className={styles.searchForm} role="search">
					<MagnifyingGlassIcon className={styles.searchIcon} weight="bold" size={18} aria-hidden="true" />
					<input
						className={styles.searchInput}
						type="search"
						value={searchInput}
						onChange={(event) => setSearchInput(event.target.value)}
						placeholder={t`Search by community name or invite code`}
						aria-label={t`Search communities`}
						autoComplete="off"
						spellCheck={false}
					/>
					{/*
					 * The page now searches as you type via debounce, so the
					 * submit button is mostly a fallback for keyboard users
					 * hitting Enter. We keep it visible because removing
					 * affordances confuses muscle memory and screen readers
					 * benefit from a labeled submit control.
					 */}
					<Button type="submit" variant="inverted">
						<Trans>Search</Trans>
					</Button>
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

					{activeCategoryEntry && (
						<div className={styles.activeCategoryPanel}>
							<div>
								<div className={styles.activeCategoryLabel}>{formatCategoryLabel(activeCategoryEntry)}</div>
								<div className={styles.activeCategoryDescription}>
									{activeCategoryEntry.description || t`Curated public communities that fit this slice of Discovery.`}
								</div>
							</div>
							<div className={styles.activeCategoryMeta}>{t`${formatCount(activeCategoryEntry.count)} listed`}</div>
						</div>
					)}
				</div>
			</section>

			<section className={styles.resultsSection}>
				<div className={styles.resultsHeader}>
					<div>
						<h2 className={styles.resultsTitle}>
							{isSearching ? t`Search results` : t`Recommended communities`}
						</h2>
						<div className={styles.resultsSubtitle}>
							{isSearching
								? t`Showing results for "${normalizedQuery}"`
								: activeCategoryEntry
									? t`Browsing ${formatCategoryLabel(activeCategoryEntry).toLowerCase()} communities`
									: t`Browse the current public directory`}
						</div>
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
								<option value="member_count">{t`Most members`}</option>
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
						<span className={styles.resultsCount}>
							<UsersIcon size={14} weight="fill" />
							{formatCount(total)}
						</span>
					</div>
				</div>

				{loading && <p className={styles.stateText}>{t`Loading communities...`}</p>}
				{error && <p className={styles.errorText}>{error}</p>}

				{!loading && !error && guilds.length === 0 && (
					<div className={styles.emptyStateCard}>
						<div className={styles.emptyStateTitle}>{t`Nothing matches this pass yet`}</div>
						<div className={styles.emptyStateDescription}>
							{isSearching || activeCategory !== 'all'
								? t`Try a wider search, switch categories, or reset filters to get back to the full public directory.`
								: t`Public discovery is still warming up. Check back after more communities opt into listings.`}
						</div>
						{(isSearching || activeCategory !== 'all' || sortBy !== 'trending') && (
							<Button variant="secondary" onClick={handleResetFilters}>
								<Trans>Reset filters</Trans>
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
	);
});
