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

import {action, makeAutoObservable, reaction, runInAction} from 'mobx';
import {openClaimAccountModal} from '~/components/modals/ClaimAccountModal';
import {type User, type UserPrivate, UserRecord} from '~/records/UserRecord';
import AuthenticationStore from '~/stores/AuthenticationStore';
import {
	normalizeChannelListNameEffectPreset,
	normalizeProfileAccentEffectPreset,
} from '~/utils/ProfileAccentEffectUtils';

/*
 * Keys a partial user payload (the shape the message, channel-recipient and
 * member paths send) is allowed to contain for `isCachedUserUpToDate` to be able
 * to reason about it. Anything else means "richer payload than we modelled", and
 * the caller falls through to a real write - so a new server field can never be
 * silently swallowed by the skip below.
 */
const PARTIAL_USER_KEYS: ReadonlySet<string> = new Set([
	'id',
	'username',
	'discriminator',
	'global_name',
	'avatar',
	'avatar_color',
	'bot',
	'system',
	'flags',
	'profile_accent_effect',
	'channel_list_name_effect',
	'pending_bulk_message_deletion',
]);

/*
 * True when `existing.withUpdates(user)` would produce a record equal to
 * `existing`. cacheUsers runs once per constructed MessageRecord/ChannelRecord,
 * so on a 50-message page it fires 50 times with the same author payloads;
 * without this check each of those still swaps the author's UserRecord instance
 * and invalidates every observer of that key (avatars, names, member rows).
 * withUpdates copies every field it is not given from `existing`, so comparing
 * the fields the payload actually carries is sufficient.
 */
const isCachedUserUpToDate = (existing: UserRecord, user: User): boolean => {
	for (const key of Object.keys(user)) {
		if (!PARTIAL_USER_KEYS.has(key)) return false;
	}

	if (user.username !== existing.username) return false;
	if (user.discriminator !== existing.discriminator) return false;
	if (user.flags !== existing.flags) return false;
	if (user.avatar !== existing.avatar) return false;
	if (user.bot !== undefined && user.bot !== existing.bot) return false;
	if (user.system !== undefined && user.system !== existing.system) return false;
	if (user.global_name !== undefined && user.global_name !== existing.globalName) return false;
	if (user.avatar_color !== undefined && user.avatar_color !== existing.avatarColor) return false;
	if (
		user.profile_accent_effect !== undefined &&
		normalizeProfileAccentEffectPreset(user.profile_accent_effect) !== existing.profileAccentEffect
	) {
		return false;
	}
	if (
		user.channel_list_name_effect !== undefined &&
		normalizeChannelListNameEffectPreset(user.channel_list_name_effect) !== existing.channelListNameEffect
	) {
		return false;
	}
	if ('pending_bulk_message_deletion' in user) {
		if (user.pending_bulk_message_deletion != null) return false;
		if (existing.pendingBulkMessageDeletion != null) return false;
	}

	return true;
};

const normalizeUserTag = (tag: string): string => {
	const trimmed = tag.trim();
	const match = /^(.+)#(\d{1,4})$/.exec(trimmed);
	if (!match) {
		return trimmed;
	}

	const discriminator = Number.parseInt(match[2], 10);
	if (!Number.isInteger(discriminator)) {
		return trimmed;
	}

	return `${match[1]}#${discriminator}`;
};

class UserStore {
	users: Record<string, UserRecord> = {};

	constructor() {
		makeAutoObservable(this, {}, {autoBind: true});
	}

	get currentUser(): UserRecord | null {
		const currentUserId = AuthenticationStore.userId;
		if (!currentUserId) {
			return null;
		}
		return this.users[currentUserId] ?? null;
	}

	get currentUserId(): string | null {
		return AuthenticationStore.userId;
	}

	get usersList(): ReadonlyArray<UserRecord> {
		return Object.values(this.users);
	}

	getUser(userId: string): UserRecord | undefined {
		return this.users[userId];
	}

	getCurrentUser(): UserRecord | undefined {
		return this.currentUser ?? undefined;
	}

	getUserByTag(tag: string): UserRecord | undefined {
		const normalizedTag = normalizeUserTag(tag).toLowerCase();
		return this.usersList.find((user) => normalizeUserTag(user.tag).toLowerCase() === normalizedTag);
	}

	getUsers(): ReadonlyArray<UserRecord> {
		return this.usersList;
	}

	@action
	handleConnectionOpen(currentUser: UserPrivate): void {
		const userRecord = new UserRecord(currentUser);

		/*
		 * Deliberately still a whole-map replacement: a reconnect drops every
		 * previously cached user, so invalidating every observer of `users` is the
		 * correct outcome here (unlike the per-user writes below).
		 */
		this.users = {
			[currentUser.id]: userRecord,
		};

		if (!userRecord.isClaimed()) {
			setTimeout(async () => {
				openClaimAccountModal();
			}, 1000);
		}
	}

	/*
	 * Both writers below mutate `users` per key instead of replacing the whole
	 * object. `users` is a deep observable, so replacing it wrote the property atom
	 * itself and invalidated every observer that had ever called getUser - the DM
	 * sidebar, the member list, every avatar - on a single-user update, and it also
	 * rebuilt one ObservableValue per entry each time.
	 */
	@action
	handleUserUpdate(user: User): void {
		const existingUser = this.users[user.id];
		this.users[user.id] = existingUser ? existingUser.withUpdates(user) : new UserRecord(user);
	}

	cacheUsers(users: Array<User & {globalName?: never}>): void {
		runInAction(() => {
			for (const user of users) {
				const existingUser = this.users[user.id];
				if (existingUser) {
					if (isCachedUserUpToDate(existingUser, user)) {
						continue;
					}
					this.users[user.id] = existingUser.withUpdates(user);
				} else {
					this.users[user.id] = new UserRecord(user);
				}
			}
		});
	}

	subscribe(callback: () => void): () => void {
		return reaction(
			() => this.usersList.length,
			() => callback(),
			{fireImmediately: true},
		);
	}
}

export default new UserStore();
