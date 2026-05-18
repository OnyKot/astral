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

/*
 * Width preferences for the resizable desktop chrome panes. Stored in
 * pixels (not rem) so the layout doesn't drift when the user changes
 * font size, and applied via CSS variables on the root element so
 * every consumer that already reads `--layout-sidebar-width` etc.
 * picks up the new value without further plumbing.
 *
 * Bounds are intentionally generous on the upper side and tight on
 * the lower so the user can't accidentally drag a pane to nothing
 * and lose the handle. Mobile layout ignores the store entirely —
 * MobileLayoutStore drives the responsive shell separately.
 */

export const SIDEBAR_DEFAULT_PX = 270; // 16.875rem at 16px root
export const SIDEBAR_MIN_PX = 200;
export const SIDEBAR_MAX_PX = 480;

export const MEMBER_LIST_DEFAULT_PX = 240;
export const MEMBER_LIST_MIN_PX = 180;
export const MEMBER_LIST_MAX_PX = 360;

class LayoutSizingStoreClass {
	sidebarWidthPx: number = SIDEBAR_DEFAULT_PX;
	memberListWidthPx: number = MEMBER_LIST_DEFAULT_PX;

	constructor() {
		makeAutoObservable(this, {}, {autoBind: true});
		void this.initPersistence();
	}

	private async initPersistence(): Promise<void> {
		await makePersistent(this, 'LayoutSizingStore', ['sidebarWidthPx', 'memberListWidthPx']);
		this.applyToRoot();
	}

	private clamp(value: number, min: number, max: number): number {
		return Math.max(min, Math.min(max, value));
	}

	setSidebarWidth(px: number): void {
		this.sidebarWidthPx = this.clamp(px, SIDEBAR_MIN_PX, SIDEBAR_MAX_PX);
		this.applyToRoot();
	}

	setMemberListWidth(px: number): void {
		this.memberListWidthPx = this.clamp(px, MEMBER_LIST_MIN_PX, MEMBER_LIST_MAX_PX);
		this.applyToRoot();
	}

	resetSidebar(): void {
		this.sidebarWidthPx = SIDEBAR_DEFAULT_PX;
		this.applyToRoot();
	}

	resetMemberList(): void {
		this.memberListWidthPx = MEMBER_LIST_DEFAULT_PX;
		this.applyToRoot();
	}

	/*
	 * Push the current widths into CSS custom properties on <html> so
	 * the existing `--layout-sidebar-width` consumers get the user's
	 * choice with zero refactor. Called from the constructor's
	 * persistence callback and from every setter so the DOM stays in
	 * sync with the mobx state.
	 */
	applyToRoot(): void {
		if (typeof document === 'undefined') return;
		const root = document.documentElement;
		root.style.setProperty('--layout-sidebar-width', `${this.sidebarWidthPx}px`);
		root.style.setProperty('--layout-member-list-width', `${this.memberListWidthPx}px`);
	}
}

const LayoutSizingStore = new LayoutSizingStoreClass();
export default LayoutSizingStore;
