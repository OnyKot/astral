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

export type ChannelListFilter = 'all' | 'text' | 'voice';

const SIDEBAR_DEFAULT_PX = 270;
const SIDEBAR_MIN_PX = 200;
const SIDEBAR_MAX_PX = 480;

class ChannelListLayoutStore {
	sidebarCollapsed = false;
	compactView = false;
	filter: ChannelListFilter = 'all';
	sidebarWidthPx = SIDEBAR_DEFAULT_PX;

	constructor() {
		makeAutoObservable(this, {}, {autoBind: true});
		void this.initPersistence();
	}

	private async initPersistence(): Promise<void> {
		await makePersistent(this, 'ChannelListLayoutStore', ['sidebarCollapsed', 'compactView', 'filter', 'sidebarWidthPx']);
	}

	private clamp(value: number, min: number, max: number): number {
		return Math.max(min, Math.min(max, value));
	}

	getSidebarCollapsed(): boolean {
		return this.sidebarCollapsed;
	}

	setSidebarCollapsed(value: boolean): void {
		this.sidebarCollapsed = value;
	}

	toggleSidebarCollapsed(): void {
		this.sidebarCollapsed = !this.sidebarCollapsed;
	}

	getCompactView(): boolean {
		return this.compactView;
	}

	setCompactView(value: boolean): void {
		this.compactView = value;
	}

	toggleCompactView(): void {
		this.compactView = !this.compactView;
	}

	getFilter(): ChannelListFilter {
		return this.filter;
	}

	setFilter(value: ChannelListFilter): void {
		this.filter = value;
	}

	getSidebarWidthPx(): number {
		return this.sidebarWidthPx;
	}

	setSidebarWidth(px: number): void {
		this.sidebarWidthPx = this.clamp(px, SIDEBAR_MIN_PX, SIDEBAR_MAX_PX);
	}

	resetSidebarWidth(): void {
		this.sidebarWidthPx = SIDEBAR_DEFAULT_PX;
	}
}

export default new ChannelListLayoutStore();
