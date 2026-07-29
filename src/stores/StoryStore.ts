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

import {makeAutoObservable, runInAction} from 'mobx';
import * as StoryActionCreators from '~/actions/StoryActionCreators';
import type {ForwardedStoryPreviewData} from '~/utils/StoryForwardPayload';
import * as AvatarUtils from '~/utils/AvatarUtils';

const STORY_SEEN_STORAGE_KEY = 'astral:seen-stories';

const getSeenStoryIds = (): Set<string> => {
	if (typeof window === 'undefined') return new Set();
	try {
		const raw = window.localStorage.getItem(STORY_SEEN_STORAGE_KEY);
		const parsed = raw ? (JSON.parse(raw) as Array<string>) : [];
		return new Set(Array.isArray(parsed) ? parsed.filter((id) => typeof id === 'string') : []);
	} catch {
		return new Set();
	}
};

const persistSeenStoryIds = (ids: Set<string>): void => {
	if (typeof window === 'undefined') return;
	try {
		window.localStorage.setItem(STORY_SEEN_STORAGE_KEY, JSON.stringify([...ids].slice(-600)));
	} catch {}
};

const preloadedUrls = new Set<string>();

const preloadImage = (url: string | null | undefined): void => {
	if (!url || typeof Image === 'undefined' || preloadedUrls.has(url)) return;
	preloadedUrls.add(url);
	const image = new Image();
	image.decoding = 'async';
	image.src = url;
};

const warmStoryAssets = (stories: ReadonlyArray<StoryActionCreators.Story>): void => {
	if (typeof window === 'undefined') return;
	const warm = () => {
		for (const story of stories.slice(0, 36)) {
			if (story.media_type === 'image' && story.media_url) {
				preloadImage(story.media_url);
			}
			if (story.user) {
				preloadImage(AvatarUtils.getUserAvatarURL({
					id: story.user.id,
					avatar: story.user.avatar ?? null,
					username: story.user.username ?? story.user.name,
					globalName: story.user.global_name ?? story.user.name,
				}));
			}
			for (const emoji of story.emojis ?? []) {
				preloadImage(emoji.url);
			}
		}
	};

	const idleWindow = window as Window & {requestIdleCallback?: (callback: () => void, options?: {timeout?: number}) => number};
	if (idleWindow.requestIdleCallback) {
		idleWindow.requestIdleCallback(warm, {timeout: 450});
		return;
	}
	window.setTimeout(warm, 0);
};

const mergeStories = (
	current: ReadonlyArray<StoryActionCreators.Story>,
	incoming: ReadonlyArray<StoryActionCreators.Story>,
): Array<StoryActionCreators.Story> => {
	const incomingIds = new Set(incoming.map((story) => story.id));
	const mergedIncoming = incoming.map((story) => {
		const existing = current.find((item) => item.id === story.id);
		if (!existing) return story;
		return mergeStory(existing, story);
	});
	const now = Date.now();
	const preservedCurrent = current.filter((story) => !incomingIds.has(story.id) && story.expires_at > now);
	return [...mergedIncoming, ...preservedCurrent];
};

const mergeStoryArray = <T,>(incoming: Array<T> | undefined, existing: Array<T> | undefined): Array<T> | undefined => {
	if (incoming && incoming.length > 0) return incoming;
	if (existing && existing.length > 0) return existing;
	return incoming ?? existing;
};

const normalizeStoryReactions = (
	reactions: Array<StoryActionCreators.StoryReaction> | undefined,
): Array<StoryActionCreators.StoryReaction> | undefined => {
	if (!reactions) return reactions;
	let hasOwnReaction = false;
	return reactions
		.filter((reaction) => reaction.count > 0)
		.map((reaction) => {
			if (!reaction.me) return reaction;
			if (!hasOwnReaction) {
				hasOwnReaction = true;
				return reaction;
			}
			return {...reaction, me: false};
		});
};

const mergeStory = (
	existing: StoryActionCreators.Story,
	incoming: StoryActionCreators.Story,
): StoryActionCreators.Story => ({
	...existing,
	...incoming,
	media_url: incoming.media_url || existing.media_url,
	media_transform: incoming.media_transform ?? existing.media_transform,
	text: incoming.text || existing.text,
	text_align: incoming.text_align ?? existing.text_align,
	text_tone: incoming.text_tone ?? existing.text_tone,
	text_scale: incoming.text_scale ?? existing.text_scale,
	text_transform: incoming.text_transform ?? existing.text_transform,
	emojis: mergeStoryArray(incoming.emojis, existing.emojis),
	drawings: mergeStoryArray(incoming.drawings, existing.drawings),
	background: incoming.background || existing.background,
	duration_ms: incoming.duration_ms || existing.duration_ms,
	reactions: normalizeStoryReactions(incoming.reactions ?? existing.reactions),
});

class StoryStoreImpl {
	stories: Array<StoryActionCreators.Story> = [];
	seenIds: Set<string> = getSeenStoryIds();
	seenRevision = 0;
	loading = false;
	loaded = false;
	fullLoading = false;
	fullLoaded = false;
	openRequestUserId: string | null = null;
	openRequestStoryId: string | null = null;
	openRequestMediaUrl: string | null = null;
	openRequestAuthorName: string | null = null;
	openRequestToken = 0;
	private viewedRequestIds = new Set<string>();

	constructor() {
		makeAutoObservable(this, {}, {autoBind: true});
	}

	get activeStories(): Array<StoryActionCreators.Story> {
		const now = Date.now();
		return this.stories.filter((story) => story.expires_at > now);
	}

	hasActiveStory(userId: string | null | undefined): boolean {
		if (!userId) return false;
		return this.activeStories.some((story) => story.user_id === userId);
	}

	hasFreshStory(userId: string | null | undefined): boolean {
		if (!userId) return false;
		return this.activeStories.some((story) => story.user_id === userId && !this.seenIds.has(story.id));
	}

	async loadStories(force = false): Promise<void> {
		if (this.loading || (this.loaded && !force)) {
			return;
		}

		this.loading = true;
		try {
			const stories = await StoryActionCreators.fetchStories({compact: true});
			runInAction(() => {
				this.stories = mergeStories(this.stories, stories);
				this.loaded = true;
				this.loading = false;
			});
			void this.loadFullStories(force);
		} catch {
			runInAction(() => {
				this.loaded = true;
				this.loading = false;
			});
			void this.loadFullStories(true);
		}
	}

	async loadFullStories(force = false): Promise<void> {
		if (this.fullLoading || (this.fullLoaded && !force)) {
			return;
		}

		this.fullLoading = true;
		try {
			const stories = await StoryActionCreators.fetchStories();
			runInAction(() => {
				this.stories = mergeStories(this.stories, stories);
				this.loaded = true;
				this.fullLoaded = true;
				this.fullLoading = false;
			});
			warmStoryAssets(stories);
		} catch {
			runInAction(() => {
				this.fullLoading = false;
			});
		}
	}

	upsertStory(story: StoryActionCreators.Story): void {
		const index = this.stories.findIndex((item) => item.id === story.id);
		if (index >= 0) {
			this.stories = this.stories.map((item) => item.id === story.id ? mergeStory(item, story) : item);
			return;
		}
		this.stories = [story, ...this.stories];
	}

	removeStory(storyId: string): void {
		this.stories = this.stories.filter((story) => story.id !== storyId);
	}

	markSeen(storyId: string): void {
		if (this.seenIds.has(storyId)) return;
		this.seenIds.add(storyId);
		this.seenRevision += 1;
		persistSeenStoryIds(this.seenIds);
	}

	async markViewed(storyId: string): Promise<void> {
		if (this.viewedRequestIds.has(storyId)) return;
		this.viewedRequestIds.add(storyId);
		try {
			const story = await StoryActionCreators.markStoryViewed(storyId);
			runInAction(() => {
				this.upsertStory(story);
			});
		} catch {
			this.viewedRequestIds.delete(storyId);
		}
	}

	async reactToStory(storyId: string, emoji: string): Promise<void> {
		this.applyOptimisticReaction(storyId, emoji);
		const story = await StoryActionCreators.reactToStory(storyId, emoji);
		runInAction(() => {
			this.upsertStory(story);
		});
	}

	private applyOptimisticReaction(storyId: string, emoji: string): void {
		const story = this.stories.find((item) => item.id === storyId);
		if (!story) return;

		const reactions = [...(story.reactions ?? [])];
		let previousReactionIndex = reactions.findIndex((reaction) => reaction.me);
		if (previousReactionIndex >= 0 && reactions[previousReactionIndex].emoji === emoji) {
			const previousReaction = reactions[previousReactionIndex];
			const nextCount = Math.max(0, previousReaction.count - 1);
			if (nextCount === 0) {
				reactions.splice(previousReactionIndex, 1);
			} else {
				reactions[previousReactionIndex] = {...previousReaction, count: nextCount, me: false};
			}
			this.upsertStory({...story, reactions});
			return;
		}

		if (previousReactionIndex >= 0) {
			const previousReaction = reactions[previousReactionIndex];
			const nextCount = Math.max(0, previousReaction.count - 1);
			if (nextCount === 0) {
				reactions.splice(previousReactionIndex, 1);
				previousReactionIndex = -1;
			} else {
				reactions[previousReactionIndex] = {...previousReaction, count: nextCount, me: false};
			}
		}

		const nextReactionIndex = reactions.findIndex((reaction) => reaction.emoji === emoji);
		if (nextReactionIndex >= 0) {
			const nextReaction = reactions[nextReactionIndex];
			reactions[nextReactionIndex] = {...nextReaction, count: nextReaction.count + 1, me: true};
		} else {
			reactions.push({emoji, count: 1, me: true});
		}

		this.upsertStory({...story, reactions});
	}

	requestOpenUserStory(userId: string): void {
		this.openRequestUserId = userId;
		this.openRequestStoryId = null;
		this.openRequestMediaUrl = null;
		this.openRequestAuthorName = null;
		this.openRequestToken += 1;
		void this.loadStories();
		void this.loadFullStories();
	}

	requestOpenForwardedStory(preview: ForwardedStoryPreviewData): void {
		this.openRequestUserId = preview.userId;
		this.openRequestStoryId = preview.storyId;
		this.openRequestMediaUrl = preview.mediaUrl;
		this.openRequestAuthorName = preview.authorName;
		this.openRequestToken += 1;
		void this.loadStories();
		void this.loadFullStories();
	}

	clearOpenRequest(): void {
		this.openRequestUserId = null;
		this.openRequestStoryId = null;
		this.openRequestMediaUrl = null;
		this.openRequestAuthorName = null;
	}
}

export default new StoryStoreImpl();
