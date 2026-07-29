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

import {makeAutoObservable, runInAction} from 'mobx';
import {Endpoints} from '~/Endpoints';
import http from '~/lib/HttpClient';
import {Logger} from '~/lib/Logger';

interface UserActivityResponse {
	user_id: string;
	last_active_at: string | null;
	hidden: boolean;
}

export interface UserActivity {
	lastActiveAt: string | null;
	hidden: boolean;
	fetchedAt: number;
}

const CACHE_TTL_MS = 60_000;
const logger = new Logger('UserActivityStore');

class UserActivityStore {
	private activities = new Map<string, UserActivity>();
	private pending = new Map<string, Promise<void>>();

	activityVersion = 0;

	constructor() {
		makeAutoObservable<this, 'activities' | 'pending'>(
			this,
			{
				activities: false,
				pending: false,
			},
			{autoBind: true},
		);
	}

	getActivity(userId: string): UserActivity | null {
		void this.activityVersion;
		return this.activities.get(userId) ?? null;
	}

	ensureActivity(userId: string, options: {force?: boolean} = {}): void {
		const existing = this.activities.get(userId);
		if (!options.force && existing && Date.now() - existing.fetchedAt < CACHE_TTL_MS) {
			return;
		}

		if (this.pending.has(userId)) {
			return;
		}

		const request = http
			.get<UserActivityResponse>({url: Endpoints.USER_ACTIVITY(userId)})
			.then((response) => {
				runInAction(() => {
					this.activities.set(userId, {
						lastActiveAt: response.body.last_active_at,
						hidden: response.body.hidden,
						fetchedAt: Date.now(),
					});
					this.activityVersion++;
				});
			})
			.catch((error) => {
				logger.warn('Failed to load user activity', error);
			})
			.finally(() => {
				runInAction(() => {
					this.pending.delete(userId);
				});
			});

		this.pending.set(userId, request);
	}
}

export default new UserActivityStore();
