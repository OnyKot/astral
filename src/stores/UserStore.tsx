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

		this.users = {
			[currentUser.id]: userRecord,
		};

		if (!userRecord.isClaimed()) {
			setTimeout(async () => {
				openClaimAccountModal();
			}, 1000);
		}
	}

	@action
	handleUserUpdate(user: User): void {
		const existingUser = this.users[user.id];
		const updatedUser = existingUser ? existingUser.withUpdates(user) : new UserRecord(user);
		this.users = {
			...this.users,
			[user.id]: updatedUser,
		};
	}

	cacheUsers(users: Array<User & {globalName?: never}>): void {
		const updatedUsers = {...this.users};
		for (const user of users) {
			const existingUser = updatedUsers[user.id];
			if (existingUser) {
				updatedUsers[user.id] = existingUser.withUpdates(user);
			} else {
				updatedUsers[user.id] = new UserRecord(user);
			}
		}
		runInAction(() => {
			this.users = updatedUsers;
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
