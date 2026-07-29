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

import {makeAutoObservable} from 'mobx';
import {Logger} from '~/lib/Logger';

const logger = new Logger('UserPinnedDMStore');

class UserPinnedDMStore {
	pinnedDMsArray: Array<string> = [];

	constructor() {
		makeAutoObservable(this, {}, {autoBind: true});
	}

	private normalizePinnedDMs(pinnedDMs: ReadonlyArray<string>): Array<string> {
		return [...new Set(pinnedDMs.filter(Boolean))];
	}

	setPinnedDMs(pinnedDMs: ReadonlyArray<string>): void {
		const normalizedPinnedDMs = this.normalizePinnedDMs(pinnedDMs);
		this.pinnedDMsArray = normalizedPinnedDMs;
		logger.debug(`Set pinned DMs: ${normalizedPinnedDMs.length} channels`);
	}

	pin(channelId: string): void {
		if (!channelId || this.isPinned(channelId)) {
			return;
		}

		this.pinnedDMsArray = [...this.pinnedDMsArray, channelId];
	}

	unpin(channelId: string): void {
		this.pinnedDMsArray = this.pinnedDMsArray.filter((id) => id !== channelId);
	}

	isPinned(channelId: string): boolean {
		return this.pinnedDMsArray.includes(channelId);
	}

	getPinIndex(channelId: string): number {
		return this.pinnedDMsArray.indexOf(channelId);
	}

	get pinnedDMs() {
		return this.pinnedDMsArray;
	}
}

export default new UserPinnedDMStore();
