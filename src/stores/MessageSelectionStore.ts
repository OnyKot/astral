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
import type {MessageRecord} from '~/records/MessageRecord';
import MessageStore from '~/stores/MessageStore';

class MessageSelectionStore {
	channelId: string | null = null;
	selectedIds = new Set<string>();
	private dragIntent: boolean | null = null;

	constructor() {
		makeAutoObservable(this, {}, {autoBind: true});
	}

	get count(): number {
		return this.selectedIds.size;
	}

	get active(): boolean {
		return this.count > 0;
	}

	get ids(): Array<string> {
		return Array.from(this.selectedIds);
	}

	isActiveForChannel(channelId: string): boolean {
		return this.channelId === channelId && this.active;
	}

	isSelected(channelId: string, messageId: string): boolean {
		return this.channelId === channelId && this.selectedIds.has(messageId);
	}

	clear(): void {
		this.channelId = null;
		this.selectedIds.clear();
		this.dragIntent = null;
	}

	ensureChannel(channelId: string): void {
		if (this.channelId === channelId) return;
		this.channelId = channelId;
		this.selectedIds.clear();
		this.dragIntent = null;
	}

	select(channelId: string, messageId: string): void {
		this.ensureChannel(channelId);
		this.selectedIds.add(messageId);
	}

	setSelected(channelId: string, messageId: string, selected: boolean): void {
		this.ensureChannel(channelId);
		if (selected) {
			this.selectedIds.add(messageId);
		} else {
			this.selectedIds.delete(messageId);
		}
		if (this.selectedIds.size === 0) {
			this.clear();
		}
	}

	toggle(channelId: string, messageId: string): void {
		this.setSelected(channelId, messageId, !this.isSelected(channelId, messageId));
	}

	startSelection(channelId: string, messageId: string): void {
		this.ensureChannel(channelId);
		this.selectedIds.add(messageId);
	}

	startDrag(channelId: string, messageId: string, selected: boolean): void {
		this.dragIntent = selected;
		this.setSelected(channelId, messageId, selected);
	}

	applyDrag(channelId: string, messageId: string): void {
		if (this.dragIntent == null) return;
		this.setSelected(channelId, messageId, this.dragIntent);
	}

	endDrag(): void {
		this.dragIntent = null;
	}

	getSelectedMessages(): Array<MessageRecord> {
		if (!this.channelId) return [];
		const selectedIds = this.selectedIds;
		return MessageStore.getMessages(this.channelId)
			.toArray()
			.filter((message) => selectedIds.has(message.id));
	}
}

export default new MessageSelectionStore();
