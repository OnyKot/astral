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

interface UserProfileMobileState {
	userId: string | null;
	guildId?: string;
	autoFocusNote?: boolean;
}

class UserProfileMobileStore {
	userId: UserProfileMobileState['userId'] = null;
	guildId: UserProfileMobileState['guildId'] = undefined;
	autoFocusNote: UserProfileMobileState['autoFocusNote'] = undefined;

	constructor() {
		makeAutoObservable(this, {}, {autoBind: true});
	}

	get isOpen(): boolean {
		return this.userId !== null;
	}

	open(userId: string, guildId?: string, autoFocusNote?: boolean): void {
		this.userId = userId;
		this.guildId = guildId;
		this.autoFocusNote = autoFocusNote;
	}

	close(): void {
		this.userId = null;
		this.guildId = undefined;
		this.autoFocusNote = undefined;
	}
}

export default new UserProfileMobileStore();
