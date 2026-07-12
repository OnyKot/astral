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
import {
	DEFAULT_CHANNEL_LIST_NAME_EFFECT_PRESET,
	DEFAULT_PROFILE_ACCENT_EFFECT_PRESET,
	type ChannelListNameEffectPreset,
	type ProfileAccentEffectPreset,
	normalizeChannelListNameEffectPreset,
	normalizeProfileAccentEffectPreset,
} from '~/utils/ProfileAccentEffectUtils';

class LocalProfileEffectsStore {
	accentEffectByUserId: Record<string, ProfileAccentEffectPreset> = {};
	channelListNameEffectByUserId: Record<string, ChannelListNameEffectPreset> = {};

	constructor() {
		makeAutoObservable(this, {}, {autoBind: true});
		void this.initPersistence();
	}

	private async initPersistence(): Promise<void> {
		await makePersistent(this, 'LocalProfileEffectsStore', ['accentEffectByUserId', 'channelListNameEffectByUserId']);
	}

	getUserPreset(userId: string): ProfileAccentEffectPreset {
		if (!userId) return DEFAULT_PROFILE_ACCENT_EFFECT_PRESET;
		return normalizeProfileAccentEffectPreset(this.accentEffectByUserId[userId]);
	}

	setUserPreset(userId: string, preset: ProfileAccentEffectPreset): void {
		if (!userId) return;

		const normalizedPreset = normalizeProfileAccentEffectPreset(preset);
		if (normalizedPreset === DEFAULT_PROFILE_ACCENT_EFFECT_PRESET) {
			this.clearUserPreset(userId);
			return;
		}

		this.accentEffectByUserId = {
			...this.accentEffectByUserId,
			[userId]: normalizedPreset,
		};
	}

	clearUserPreset(userId: string): void {
		if (!userId || this.accentEffectByUserId[userId] === undefined) return;
		const nextState = {...this.accentEffectByUserId};
		delete nextState[userId];
		this.accentEffectByUserId = nextState;
	}

	getUserChannelListNameEffect(userId: string): ChannelListNameEffectPreset {
		if (!userId) return DEFAULT_CHANNEL_LIST_NAME_EFFECT_PRESET;
		return normalizeChannelListNameEffectPreset(this.channelListNameEffectByUserId[userId]);
	}

	setUserChannelListNameEffect(userId: string, preset: ChannelListNameEffectPreset): void {
		if (!userId) return;

		const normalizedPreset = normalizeChannelListNameEffectPreset(preset);
		if (normalizedPreset === DEFAULT_CHANNEL_LIST_NAME_EFFECT_PRESET) {
			this.clearUserChannelListNameEffect(userId);
			return;
		}

		this.channelListNameEffectByUserId = {
			...this.channelListNameEffectByUserId,
			[userId]: normalizedPreset,
		};
	}

	clearUserChannelListNameEffect(userId: string): void {
		if (!userId || this.channelListNameEffectByUserId[userId] === undefined) return;
		const nextState = {...this.channelListNameEffectByUserId};
		delete nextState[userId];
		this.channelListNameEffectByUserId = nextState;
	}
}

export default new LocalProfileEffectsStore();
