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

// Polls the C++ `userver_presence` service through Caddy:
//   GET /api/v1/guilds/:guild_id/counts
//   → { guild_id, member_count, presence_count }
//
// The service caches per-guild counts for 3 seconds in-process (positive
// AND negative caching), so a 10s polling interval costs the gateway at
// most one RPC per 3s per guild_id regardless of how many tabs are open.
//
// Designed for low-key UI affordances: live "X online" badges in guild
// headers, marketing landing counters, etc. NOT for membership state —
// that still flows through the gateway WebSocket.

import React from 'react';
import HttpClient from '~/lib/HttpClient';
import {Logger} from '~/lib/Logger';

const logger = new Logger('useGuildPresenceCounts');

export interface GuildPresenceCounts {
	guildId: string;
	memberCount: number;
	presenceCount: number;
}

interface ApiResponse {
	guild_id: string;
	member_count: number;
	presence_count: number;
}

export interface UseGuildPresenceCountsOptions {
	// Polling interval in ms. Default 10s — well above the 3s server cache
	// so most polls hit the cache. Set to 0 to fetch once and stop.
	intervalMs?: number;
	// Pause polling when the document is hidden (default: true). Saves
	// gateway traffic for backgrounded tabs.
	pauseWhenHidden?: boolean;
}

interface UseGuildPresenceCountsResult {
	data: GuildPresenceCounts | null;
	error: Error | null;
	loading: boolean;
	notFound: boolean;
	refresh: () => void;
}

const DEFAULT_INTERVAL_MS = 10_000;

export function useGuildPresenceCounts(
	guildId: string | null | undefined,
	options?: UseGuildPresenceCountsOptions,
): UseGuildPresenceCountsResult {
	const intervalMs = options?.intervalMs ?? DEFAULT_INTERVAL_MS;
	const pauseWhenHidden = options?.pauseWhenHidden ?? true;

	const [data, setData] = React.useState<GuildPresenceCounts | null>(null);
	const [error, setError] = React.useState<Error | null>(null);
	const [loading, setLoading] = React.useState<boolean>(Boolean(guildId));
	const [notFound, setNotFound] = React.useState<boolean>(false);
	const [refreshTick, setRefreshTick] = React.useState(0);

	const refresh = React.useCallback(() => {
		setRefreshTick((tick) => tick + 1);
	}, []);

	React.useEffect(() => {
		if (!guildId) {
			setData(null);
			setError(null);
			setLoading(false);
			setNotFound(false);
			return;
		}

		let cancelled = false;
		const controller = new AbortController();

		const fetchOnce = async () => {
			try {
				const response = await HttpClient.get<ApiResponse>({
					url: `/guilds/${encodeURIComponent(guildId)}/counts`,
					signal: controller.signal,
					rejectWithError: true,
				});
				if (cancelled) return;

				const body = response.body;
				setData({
					guildId: body.guild_id,
					memberCount: body.member_count,
					presenceCount: body.presence_count,
				});
				setError(null);
				setNotFound(false);
			} catch (err) {
				if (cancelled) return;
				if (err instanceof Error && err.name === 'AbortError') return;

				// HTTP 404 from the C++ handler means "guild not found".
				// Surface it as a flag rather than a generic error so callers
				// can render an empty state instead of a red banner.
				const status = (err as {status?: number} | undefined)?.status;
				if (status === 404) {
					setNotFound(true);
					setData(null);
					setError(null);
				} else {
					setError(err as Error);
					logger.warn('fetch failed', err);
				}
			} finally {
				if (!cancelled) setLoading(false);
			}
		};

		// Initial fetch
		setLoading(true);
		void fetchOnce();

		// Polling
		let timer: number | null = null;
		const start = () => {
			if (intervalMs <= 0) return;
			timer = window.setInterval(fetchOnce, intervalMs);
		};
		const stop = () => {
			if (timer != null) {
				window.clearInterval(timer);
				timer = null;
			}
		};

		const onVisibility = () => {
			if (!pauseWhenHidden) return;
			if (document.hidden) {
				stop();
			} else {
				// Refresh immediately on tab refocus, then resume polling.
				void fetchOnce();
				start();
			}
		};

		if (!pauseWhenHidden || !document.hidden) {
			start();
		}
		document.addEventListener('visibilitychange', onVisibility);

		return () => {
			cancelled = true;
			stop();
			controller.abort();
			document.removeEventListener('visibilitychange', onVisibility);
		};
		// refreshTick is part of the deps so callers can force re-fetch via refresh().
	}, [guildId, intervalMs, pauseWhenHidden, refreshTick]);

	return {data, error, loading, notFound, refresh};
}
