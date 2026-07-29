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
 * but WITHOUT ANY WARRANTY; without even implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with Astral. If not, see <https://www.gnu.org/licenses/>.
 */

/*
 * Selectel CDN cache-purge client.
 *
 * Replaces the Cloudflare purge caller for the cdn.astraof.com edge. The CDN
 * API (https://api.selectel.ru/cdn/v3/) accepts only a project-scoped IAM
 * token in the X-Auth-Token header (static tokens are not supported), so when
 * auth credentials are configured the service issues and refreshes that token
 * itself; otherwise it uses SELECTEL_CDN_API_TOKEN verbatim (a 24h IAM token
 * the operator keeps current).
 *
 * Purge = POST /cache/tasks with {action: 'delete', action_type, domain, paths}.
 *   - selective: action_type 'single' + paths[] (≤50 per request, 10/hour).
 *   - full:      action_type 'full' (delete only, 3/hour).
 * Callers hand us URL prefixes (host+pathname) from the shared purge queue; we
 * strip the host down to the pathname the API expects (paths are relative to
 * the CDN domain).
 */

import {Config} from '~/Config';
import {Logger} from '~/Logger';

const CDN_API_BASE = 'https://api.selectel.ru/cdn/v3';
const IAM_AUTH_URL = 'https://cloud.api.selcloud.ru/identity/v3/auth/tokens';

/** Max paths per selective purge request (Selectel limit). */
const MAX_PATHS_PER_REQUEST = 50;

/** Refresh the IAM token this far before its 24h expiry. */
const TOKEN_REFRESH_MARGIN_MS = 60 * 60 * 1000;

interface SelectelCdnConfig {
	purgeEnabled: boolean;
	domain?: string;
	apiToken?: string;
	authUsername?: string;
	authAccountId?: string;
	authPassword?: string;
	authProjectName?: string;
}

export interface PurgeResult {
	taskIds: Array<string>;
}

export class SelectelCdnPurgeService {
	private readonly cfg: SelectelCdnConfig;
	private cachedToken: string | null = null;
	private cachedTokenExpiresAt = 0;

	constructor(cfg: SelectelCdnConfig = Config.selectelCdn) {
		this.cfg = cfg;
	}

	get enabled(): boolean {
		return this.cfg.purgeEnabled === true && Boolean(this.cfg.domain);
	}

	/**
	 * Resolve the X-Auth-Token value. If auth credentials are configured, issue
	 * (and cache) a project-scoped IAM token; otherwise use the static env
	 * token. Concurrent callers share the in-flight refresh.
	 */
	private async resolveToken(): Promise<string> {
		const hasAuthCreds =
			this.cfg.authUsername && this.cfg.authAccountId && this.cfg.authPassword && this.cfg.authProjectName;

		if (hasAuthCreds) {
			if (this.cachedToken && Date.now() < this.cachedTokenExpiresAt) {
				return this.cachedToken;
			}
			return this.issueIamToken();
		}

		if (!this.cfg.apiToken) {
			throw new Error('Selectel CDN purge enabled but no API token or auth credentials configured');
		}
		return this.cfg.apiToken;
	}

	private async issueIamToken(): Promise<string> {
		const body = {
			auth: {
				identity: {
					methods: ['password'],
					password: {
						user: {
							name: this.cfg.authUsername,
							domain: {name: this.cfg.authAccountId},
							password: this.cfg.authPassword,
						},
					},
				},
				scope: {
					project: {
						name: this.cfg.authProjectName,
						domain: {name: this.cfg.authAccountId},
					},
				},
			},
		};

		const response = await fetch(IAM_AUTH_URL, {
			method: 'POST',
			headers: {'Content-Type': 'application/json'},
			body: JSON.stringify(body),
		});

		if (!response.ok) {
			const errorText = await response.text();
			throw new Error(`Selectel IAM auth failed (${response.status}): ${errorText}`);
		}

		// The issued token is returned in the X-Subject-Token response header.
		const token = response.headers.get('x-subject-token');
		if (!token) {
			throw new Error('Selectel IAM auth succeeded but X-Subject-Token header was missing');
		}

		// IAM tokens live 24h; refresh one hour before expiry to be safe.
		this.cachedToken = token;
		this.cachedTokenExpiresAt = Date.now() + 24 * 60 * 60 * 1000 - TOKEN_REFRESH_MARGIN_MS;
		Logger.debug('Issued fresh Selectel CDN IAM token');
		return token;
	}

	/** Convert a queued URL prefix (host+pathname) to an API path (pathname only). */
	private toPath(prefix: string): string {
		const trimmed = prefix.trim();
		if (trimmed === '') return '';
		// Queued entries are stored as host/pathname (no scheme). If a full URL
		// slipped in, parse it; otherwise split off any host prefix.
		try {
			if (/^https?:\/\//i.test(trimmed)) {
				return new URL(trimmed).pathname;
			}
			const slash = trimmed.indexOf('/');
			return slash === -1 ? '/' : trimmed.slice(slash);
		} catch {
			const slash = trimmed.indexOf('/');
			return slash === -1 ? '/' : trimmed.slice(slash);
		}
	}

	/** POST /cache/tasks with the given payload, returning the task_id. */
	private async createCacheTask(payload: Record<string, unknown>): Promise<string> {
		const token = await this.resolveToken();
		const response = await fetch(`${CDN_API_BASE}/cache/tasks`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'X-Auth-Token': token,
			},
			body: JSON.stringify(payload),
		});

		if (!response.ok) {
			const errorText = await response.text();
			throw new Error(`Selectel CDN purge failed (${response.status}): ${errorText}`);
		}

		const result = (await response.json()) as {task_id?: string};
		if (!result.task_id) {
			throw new Error('Selectel CDN purge accepted but task_id was missing');
		}
		return result.task_id;
	}

	/**
	 * Purge a set of URL prefixes from the CDN edge. Prefixes are chunked into
	 * batches of 50 (the Selectel selective-purge limit) and each batch becomes
	 * one cache task. Returns the list of created task IDs.
	 */
	async purgeUrls(urlPrefixes: Array<string>): Promise<PurgeResult> {
		if (!this.enabled) {
			return {taskIds: []};
		}
		if (!this.cfg.domain) {
			return {taskIds: []};
		}

		const paths = Array.from(
			new Set(
				urlPrefixes
					.map((p) => this.toPath(p))
					.filter((p) => p !== ''),
			),
		);
		if (paths.length === 0) {
			return {taskIds: []};
		}

		const taskIds: Array<string> = [];
		for (let i = 0; i < paths.length; i += MAX_PATHS_PER_REQUEST) {
			const batch = paths.slice(i, i + MAX_PATHS_PER_REQUEST);
			try {
				const taskId = await this.createCacheTask({
					action: 'delete',
					action_type: 'single',
					domain: this.cfg.domain,
					paths: batch,
				});
				taskIds.push(taskId);
				Logger.debug({count: batch.length, taskId}, 'Purged Selectel CDN cache batch');
			} catch (error) {
				Logger.error({error, pathCount: batch.length}, 'Failed to purge Selectel CDN cache batch');
				throw error;
			}
		}

		return {taskIds};
	}

	/** Purge the entire CDN domain cache (action_type 'full', delete only). */
	async purgeAll(): Promise<PurgeResult> {
		if (!this.enabled || !this.cfg.domain) {
			return {taskIds: []};
		}
		try {
			const taskId = await this.createCacheTask({
				action: 'delete',
				action_type: 'full',
				domain: this.cfg.domain,
			});
			Logger.debug({taskId, domain: this.cfg.domain}, 'Purged full Selectel CDN cache');
			return {taskIds: [taskId]};
		} catch (error) {
			Logger.error({error, domain: this.cfg.domain}, 'Failed to purge full Selectel CDN cache');
			throw error;
		}
	}
}

/**
 * No-op stand-in used when Selectel CDN purge is disabled. Mirrors the
 * CloudflarePurgeQueue/NoopCloudflarePurgeQueue split so wiring stays uniform.
 */
export class NoopSelectelCdnPurgeService extends SelectelCdnPurgeService {
	constructor() {
		super({purgeEnabled: false});
	}

	override get enabled(): boolean {
		return false;
	}

	override async purgeUrls(_urlPrefixes: Array<string>): Promise<PurgeResult> {
		return {taskIds: []};
	}

	override async purgeAll(): Promise<PurgeResult> {
		return {taskIds: []};
	}
}
