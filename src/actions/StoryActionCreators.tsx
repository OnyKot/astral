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

import {Endpoints} from '~/Endpoints';
import http from '~/lib/HttpClient';

export type StoryMediaType = 'image' | 'video' | 'text';

export interface StoryAuthor {
	id: string;
	name?: string;
	username?: string;
	global_name?: string | null;
	avatar?: string | null;
}

export interface Story {
	id: string;
	user_id: string;
	user?: StoryAuthor;
	media_type: StoryMediaType;
	media_url: string;
	media_transform?: {
		x: number;
		y: number;
		scale: number;
		rotate?: number;
	};
	text: string;
	text_align?: 'left' | 'center' | 'right';
	text_tone?: 'light' | 'dark' | 'accent';
	text_scale?: number;
	text_transform?: {
		x: number;
		y: number;
		scale: number;
		rotate?: number;
	};
	emojis?: Array<StoryEmojiSticker>;
	drawings?: Array<StoryDrawingStroke>;
	background: string;
	views_count?: number;
	viewed_by_me?: boolean;
	reactions?: Array<StoryReaction>;
	created_at: number;
	expires_at: number;
	duration_ms: number;
}

export interface StoryReaction {
	emoji: string;
	count: number;
	me?: boolean;
}

export interface StoryEmojiSticker {
	id: string;
	name: string;
	url?: string;
	native?: string;
	transform: {
		x: number;
		y: number;
		scale: number;
		rotate?: number;
	};
}

export interface StoryDrawingStroke {
	id: string;
	color: string;
	width: number;
	points: Array<{x: number; y: number}>;
}

export interface CreateStoryPayload {
	media_type: StoryMediaType;
	media_url?: string;
	media_transform?: {
		x: number;
		y: number;
		scale: number;
		rotate?: number;
	};
	text?: string;
	text_align?: 'left' | 'center' | 'right';
	text_tone?: 'light' | 'dark' | 'accent';
	text_scale?: number;
	text_transform?: {
		x: number;
		y: number;
		scale: number;
		rotate?: number;
	};
	emojis?: Array<StoryEmojiSticker>;
	drawings?: Array<StoryDrawingStroke>;
	background?: string;
	duration_ms?: number;
}

export async function fetchStories(options: {compact?: boolean} = {}): Promise<Array<Story>> {
	const url = options.compact ? `${Endpoints.STORIES_FEED}?compact=1` : Endpoints.STORIES_FEED;
	const response = await http.get<{stories: Array<Story>}>({url, retries: 1});
	return response.body.stories ?? [];
}

export async function createStory(payload: CreateStoryPayload): Promise<Story> {
	const response = await http.post<{story: Story}>(Endpoints.STORIES, payload);
	return response.body.story;
}

export async function deleteStory(storyId: string): Promise<void> {
	await http.delete({url: Endpoints.STORY(storyId)});
}

export async function markStoryViewed(storyId: string): Promise<Story> {
	const response = await http.post<{story: Story}>(Endpoints.STORY_VIEW(storyId), {});
	return response.body.story;
}

export async function reactToStory(storyId: string, emoji: string): Promise<Story> {
	const response = await http.post<{story: Story}>(Endpoints.STORY_REACTION(storyId), {emoji});
	return response.body.story;
}
