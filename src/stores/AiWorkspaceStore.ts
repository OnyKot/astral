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

export type AiWorkspaceMode = 'chat' | 'imagine' | 'avatar';
export type AiWorkspaceMessageKind = 'text' | 'image';

export interface AiWorkspaceMessage {
	id: string;
	role: 'user' | 'assistant';
	kind: AiWorkspaceMessageKind;
	content: string;
	createdAt: number;
	imageUrl?: string;
	revisedPrompt?: string;
}

export interface AiWorkspaceThread {
	id: string;
	mode: AiWorkspaceMode;
	title: string;
	createdAt: number;
	updatedAt: number;
	messages: Array<AiWorkspaceMessage>;
}

const createId = (): string => {
	if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
		return crypto.randomUUID();
	}

	return `ai_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
};

const getDefaultThreadTitle = (mode: AiWorkspaceMode): string => {
	switch (mode) {
		case 'imagine':
			return 'Новая генерация';
		case 'avatar':
			return 'Новая аватарка';
		case 'chat':
		default:
			return 'Новый чат';
	}
};

const deriveThreadTitle = (thread: AiWorkspaceThread): string => {
	const firstUserMessage = thread.messages.find((message) => message.role === 'user' && message.content.trim().length > 0);
	if (!firstUserMessage) {
		return getDefaultThreadTitle(thread.mode);
	}

	return firstUserMessage.content.trim().replace(/\s+/g, ' ').slice(0, 48);
};

class AiWorkspaceStore {
	threads: Array<AiWorkspaceThread> = [];
	activeThreadId: string | null = null;

	constructor() {
		makeAutoObservable(this, {}, {autoBind: true});
		void this.initPersistence();
	}

	private async initPersistence(): Promise<void> {
		await makePersistent(this, 'AiWorkspaceStore', ['threads', 'activeThreadId']);
	}

	get activeThread(): AiWorkspaceThread | null {
		if (!this.activeThreadId) {
			return this.threads[0] ?? null;
		}

		return this.threads.find((thread) => thread.id === this.activeThreadId) ?? this.threads[0] ?? null;
	}

	get orderedThreads(): Array<AiWorkspaceThread> {
		return [...this.threads].sort((left, right) => right.updatedAt - left.updatedAt);
	}

	ensureThread(mode: AiWorkspaceMode = 'chat'): AiWorkspaceThread {
		if (this.activeThread) {
			return this.activeThread;
		}

		return this.createThread(mode);
	}

	openMode(mode: AiWorkspaceMode): AiWorkspaceThread {
		const current = this.activeThread;
		if (!current) {
			return this.createThread(mode);
		}

		if (current.mode === mode) {
			return current;
		}

		if (current.messages.length === 0) {
			current.mode = mode;
			current.title = getDefaultThreadTitle(mode);
			current.updatedAt = Date.now();
			return current;
		}

		return this.createThread(mode);
	}

	createThread(mode: AiWorkspaceMode = 'chat'): AiWorkspaceThread {
		const now = Date.now();
		const thread: AiWorkspaceThread = {
			id: createId(),
			mode,
			title: getDefaultThreadTitle(mode),
			createdAt: now,
			updatedAt: now,
			messages: [],
		};

		this.threads = [thread, ...this.threads];
		this.activeThreadId = thread.id;
		return thread;
	}

	setActiveThread(threadId: string): void {
		if (!this.threads.some((thread) => thread.id === threadId)) {
			return;
		}

		this.activeThreadId = threadId;
	}

	deleteThread(threadId: string): void {
		const nextThreads = this.threads.filter((thread) => thread.id !== threadId);
		this.threads = nextThreads;

		if (this.activeThreadId === threadId) {
			this.activeThreadId = nextThreads[0]?.id ?? null;
		}
	}

	addMessage(
		threadId: string,
		message: Omit<AiWorkspaceMessage, 'id' | 'createdAt'> & Partial<Pick<AiWorkspaceMessage, 'id' | 'createdAt'>>,
	): AiWorkspaceMessage | null {
		const thread = this.threads.find((candidate) => candidate.id === threadId);
		if (!thread) {
			return null;
		}

		const nextMessage: AiWorkspaceMessage = {
			id: message.id ?? createId(),
			createdAt: message.createdAt ?? Date.now(),
			role: message.role,
			kind: message.kind,
			content: message.content,
			imageUrl: message.imageUrl,
			revisedPrompt: message.revisedPrompt,
		};

		thread.messages = [...thread.messages, nextMessage];
		thread.updatedAt = nextMessage.createdAt;
		thread.title = deriveThreadTitle(thread);
		this.activeThreadId = thread.id;
		return nextMessage;
	}

	updateThreadMode(threadId: string, mode: AiWorkspaceMode): void {
		const thread = this.threads.find((candidate) => candidate.id === threadId);
		if (!thread || thread.mode === mode) {
			return;
		}

		thread.mode = mode;
		if (thread.messages.length === 0) {
			thread.title = getDefaultThreadTitle(mode);
		}
		thread.updatedAt = Date.now();
	}
}

export default new AiWorkspaceStore();
