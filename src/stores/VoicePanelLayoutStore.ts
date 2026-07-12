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

const DEFAULT_WIDTH_PX = 332;
const DEFAULT_HEIGHT_PX = 84;
const MIN_WIDTH_PX = 200;
const MAX_WIDTH_PX = 392;
const MIN_HEIGHT_PX = 56;
const MAX_HEIGHT_PX = 256;
const VIEWPORT_MARGIN_PX = 16;
const DEFAULT_X_PX = 92;
const DEFAULT_Y_PX = 96;
const PINNED_X_PX = VIEWPORT_MARGIN_PX;
const PINNED_DOCK_CLEARANCE_PX = 76;
const PINNED_DOCK_GAP_PX = 10;

export const VOICE_PANEL_LAYOUT_LIMITS = {
	DEFAULT_HEIGHT_PX,
	DEFAULT_WIDTH_PX,
	MAX_HEIGHT_PX,
	MAX_WIDTH_PX,
	MIN_HEIGHT_PX,
	MIN_WIDTH_PX,
	PINNED_X_PX,
	VIEWPORT_MARGIN_PX,
} as const;

class VoicePanelLayoutStore {
	detached = false;
	collapsedIntoDock = false;
	pinned = false;
	xPx = DEFAULT_X_PX;
	yPx = DEFAULT_Y_PX;
	widthPx = DEFAULT_WIDTH_PX;
	heightPx = DEFAULT_HEIGHT_PX;
	previousXPx = DEFAULT_X_PX;
	previousYPx = DEFAULT_Y_PX;

	constructor() {
		makeAutoObservable(this, {}, {autoBind: true});
		if (typeof window !== 'undefined') {
			this.yPx = Math.max(VIEWPORT_MARGIN_PX, window.innerHeight - DEFAULT_HEIGHT_PX - 24);
		}
		void this.initPersistence();
	}

	private async initPersistence(): Promise<void> {
		await makePersistent(this, 'VoicePanelLayoutStore', [
			'detached',
			'collapsedIntoDock',
			'pinned',
			'xPx',
			'yPx',
			'widthPx',
			'heightPx',
			'previousXPx',
			'previousYPx',
		]);
		this.clampToViewport();
	}

	private clamp(value: number, min: number, max: number): number {
		return Math.max(min, Math.min(max, value));
	}

	private viewport(): {width: number; height: number} {
		if (typeof window === 'undefined') {
			return {width: 1920, height: 1080};
		}
		return {width: window.innerWidth, height: window.innerHeight};
	}

	getWidthPx(): number {
		return this.widthPx;
	}

	getHeightPx(): number {
		return this.heightPx;
	}

	getPosition(): {x: number; y: number} {
		return {x: this.xPx, y: this.yPx};
	}

	setDetached(value: boolean): void {
		this.detached = value;
	}

	setCollapsedIntoDock(value: boolean): void {
		this.collapsedIntoDock = value;
		if (value) {
			this.setCollapsedSize();
			return;
		}

		this.setExpandedSize();
	}

	toggleCollapsedIntoDock(): void {
		this.setCollapsedIntoDock(!this.collapsedIntoDock);
	}

	private applyPinnedPosition(): void {
		const {width, height} = this.viewport();
		const centeredX = Math.round((width - this.widthPx) / 2);
		this.xPx = this.clamp(centeredX, VIEWPORT_MARGIN_PX, Math.max(VIEWPORT_MARGIN_PX, width - this.widthPx - VIEWPORT_MARGIN_PX));
		this.yPx = Math.max(
			VIEWPORT_MARGIN_PX,
			height - this.heightPx - PINNED_DOCK_CLEARANCE_PX - PINNED_DOCK_GAP_PX,
		);
	}

	snapToDock(): void {
		const {width, height} = this.viewport();
		const centeredX = Math.round((width - this.widthPx) / 2);
		this.xPx = this.clamp(centeredX, VIEWPORT_MARGIN_PX, Math.max(VIEWPORT_MARGIN_PX, width - this.widthPx - VIEWPORT_MARGIN_PX));
		this.yPx = Math.max(
			VIEWPORT_MARGIN_PX,
			height - this.heightPx - PINNED_DOCK_CLEARANCE_PX - PINNED_DOCK_GAP_PX,
		);
	}

	setPinned(value: boolean): void {
		if (this.pinned === value) {
			return;
		}

		this.pinned = value;
		if (value) {
			this.previousXPx = this.xPx;
			this.previousYPx = this.yPx;
			this.applyPinnedPosition();
			return;
		}

		this.xPx = this.previousXPx;
		this.yPx = this.previousYPx;
		this.clampToViewport();
	}

	togglePinned(): void {
		this.setPinned(!this.pinned);
	}

	setPosition(xPx: number, yPx: number): void {
		if (this.pinned) {
			this.applyPinnedPosition();
			return;
		}

		const {width, height} = this.viewport();
		const maxX = Math.max(VIEWPORT_MARGIN_PX, width - this.widthPx - VIEWPORT_MARGIN_PX);
		const maxY = Math.max(VIEWPORT_MARGIN_PX, height - this.heightPx - VIEWPORT_MARGIN_PX);
		this.xPx = this.clamp(Math.round(xPx), VIEWPORT_MARGIN_PX, maxX);
		this.yPx = this.clamp(Math.round(yPx), VIEWPORT_MARGIN_PX, maxY);
	}

	setBounds(xPx: number, yPx: number, widthPx: number, heightPx: number): void {
		this.widthPx = this.clamp(Math.round(widthPx), MIN_WIDTH_PX, Math.min(MAX_WIDTH_PX, this.viewport().width - VIEWPORT_MARGIN_PX * 2));
		this.heightPx = this.clamp(Math.round(heightPx), MIN_HEIGHT_PX, Math.min(MAX_HEIGHT_PX, this.viewport().height - VIEWPORT_MARGIN_PX * 2));
		if (this.pinned) {
			this.applyPinnedPosition();
			return;
		}
		const {width, height} = this.viewport();
		const maxX = Math.max(VIEWPORT_MARGIN_PX, width - this.widthPx - VIEWPORT_MARGIN_PX);
		const maxY = Math.max(VIEWPORT_MARGIN_PX, height - this.heightPx - VIEWPORT_MARGIN_PX);
		this.xPx = this.clamp(Math.round(xPx), VIEWPORT_MARGIN_PX, maxX);
		this.yPx = this.clamp(Math.round(yPx), VIEWPORT_MARGIN_PX, maxY);
	}

	setSize(widthPx: number, heightPx: number): void {
		this.setBounds(this.xPx, this.yPx, widthPx, heightPx);
	}

	setCompactSize(): void {
		this.setSize(this.widthPx, 128);
	}

	setExpandedSize(): void {
		this.setSize(this.widthPx, 184);
	}

	setCollapsedSize(): void {
		this.setSize(this.widthPx, 60);
	}

	reset(): void {
		this.detached = false;
		this.collapsedIntoDock = false;
		this.pinned = false;
		this.widthPx = DEFAULT_WIDTH_PX;
		this.heightPx = DEFAULT_HEIGHT_PX;
		this.xPx = DEFAULT_X_PX;
		this.yPx = typeof window === 'undefined' ? DEFAULT_Y_PX : Math.max(VIEWPORT_MARGIN_PX, window.innerHeight - DEFAULT_HEIGHT_PX - 24);
		this.previousXPx = this.xPx;
		this.previousYPx = this.yPx;
		this.clampToViewport();
	}

	clampToViewport(): void {
		this.widthPx = this.clamp(Math.round(this.widthPx), MIN_WIDTH_PX, Math.min(MAX_WIDTH_PX, this.viewport().width - VIEWPORT_MARGIN_PX * 2));
		this.heightPx = this.clamp(Math.round(this.heightPx), MIN_HEIGHT_PX, Math.min(MAX_HEIGHT_PX, this.viewport().height - VIEWPORT_MARGIN_PX * 2));

		if (this.pinned) {
			this.applyPinnedPosition();
			return;
		}

		this.setPosition(this.xPx, this.yPx);
	}
}

export default new VoicePanelLayoutStore();
