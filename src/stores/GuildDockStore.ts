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
import {makePersistent} from '~/lib/MobXPersistence';

export const MAX_PINNED_GUILDS_IN_DOCK = 5;
export const MAX_PINNED_DMS_IN_DOCK = 8;

class GuildDockStore {
	pinnedGuildIds: Array<string> = [];
	pinnedDmChannelIds: Array<string> = [];

	constructor() {
		makeAutoObservable(this, {}, {autoBind: true});
		void this.initPersistence();
	}

	private async initPersistence(): Promise<void> {
		await makePersistent(this, 'GuildDockStore', ['pinnedGuildIds', 'pinnedDmChannelIds']);
	}

	getPinnedGuildIds(): Array<string> {
		return [...this.pinnedGuildIds];
	}

	isPinned(guildId: string): boolean {
		return this.pinnedGuildIds.includes(guildId);
	}

	getPinnedCount(): number {
		return this.pinnedGuildIds.length;
	}

	getPinnedDmChannelIds(): Array<string> {
		return [...this.pinnedDmChannelIds];
	}

	isDmPinned(channelId: string): boolean {
		return this.pinnedDmChannelIds.includes(channelId);
	}

	getPinnedDmCount(): number {
		return this.pinnedDmChannelIds.length;
	}

	pinGuild(guildId: string): {ok: boolean; reason?: 'already-pinned' | 'max-reached'} {
		if (this.isPinned(guildId)) {
			return {ok: false, reason: 'already-pinned'};
		}

		if (this.pinnedGuildIds.length >= MAX_PINNED_GUILDS_IN_DOCK) {
			return {ok: false, reason: 'max-reached'};
		}

		this.pinnedGuildIds = [...this.pinnedGuildIds, guildId];
		return {ok: true};
	}

	unpinGuild(guildId: string): void {
		this.pinnedGuildIds = this.pinnedGuildIds.filter((id) => id !== guildId);
	}

	pinDmChannel(channelId: string): {ok: boolean; reason?: 'already-pinned' | 'max-reached'} {
		if (this.isDmPinned(channelId)) {
			return {ok: false, reason: 'already-pinned'};
		}

		if (this.pinnedDmChannelIds.length >= MAX_PINNED_DMS_IN_DOCK) {
			return {ok: false, reason: 'max-reached'};
		}

		this.pinnedDmChannelIds = [...this.pinnedDmChannelIds, channelId];
		return {ok: true};
	}

	unpinDmChannel(channelId: string): void {
		this.pinnedDmChannelIds = this.pinnedDmChannelIds.filter((id) => id !== channelId);
	}

	togglePinnedDmChannel(channelId: string): {ok: boolean; pinned: boolean; reason?: 'max-reached'} {
		if (this.isDmPinned(channelId)) {
			this.unpinDmChannel(channelId);
			return {ok: true, pinned: false};
		}

		const result = this.pinDmChannel(channelId);
		if (!result.ok && result.reason === 'max-reached') {
			return {ok: false, pinned: false, reason: 'max-reached'};
		}

		return {ok: true, pinned: true};
	}

	togglePinned(guildId: string): {ok: boolean; pinned: boolean; reason?: 'max-reached'} {
		if (this.isPinned(guildId)) {
			this.unpinGuild(guildId);
			return {ok: true, pinned: false};
		}

		const result = this.pinGuild(guildId);
		if (!result.ok && result.reason === 'max-reached') {
			return {ok: false, pinned: false, reason: 'max-reached'};
		}

		return {ok: true, pinned: true};
	}

	reorderPinnedGuilds(nextOrderedGuildIds: ReadonlyArray<string>): void {
		if (this.pinnedGuildIds.length <= 1) return;
		const pinnedSet = new Set(this.pinnedGuildIds);
		const nextPinnedOrder = nextOrderedGuildIds.filter((guildId) => pinnedSet.has(guildId));
		if (nextPinnedOrder.length !== this.pinnedGuildIds.length) return;
		const hasChanged = nextPinnedOrder.some((guildId, index) => guildId !== this.pinnedGuildIds[index]);
		if (hasChanged) {
			this.pinnedGuildIds = [...nextPinnedOrder];
		}
	}

	keepOnlyExistingGuilds(existingGuildIds: ReadonlySet<string>): void {
		const filtered = this.pinnedGuildIds.filter((guildId) => existingGuildIds.has(guildId));
		if (filtered.length !== this.pinnedGuildIds.length) {
			this.pinnedGuildIds = filtered;
		}
	}

	keepOnlyExistingDmChannels(existingDmChannelIds: ReadonlySet<string>): void {
		const filtered = this.pinnedDmChannelIds.filter((channelId) => existingDmChannelIds.has(channelId));
		if (filtered.length !== this.pinnedDmChannelIds.length) {
			this.pinnedDmChannelIds = filtered;
		}
	}
}

export default new GuildDockStore();
