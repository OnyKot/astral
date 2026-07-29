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

import {randomUUID} from 'node:crypto';
import {mkdir, readFile, rename, writeFile} from 'node:fs/promises';
import {dirname, join} from 'node:path';
import type {HonoApp} from '~/App';
import {InputValidationError, UnknownUserError} from '~/Errors';
import {DefaultUserOnly, LoginRequired} from '~/middleware/AuthMiddleware';
import type {User} from '~/Models';

type StoryMediaType = 'image' | 'video' | 'text';
type StoryTextAlign = 'left' | 'center' | 'right';
type StoryTextTone = 'light' | 'dark' | 'accent';

interface StoryTransform {
	x: number;
	y: number;
	scale: number;
	rotate?: number;
}

interface StoryEmojiSticker {
	id: string;
	name: string;
	url?: string;
	native?: string;
	transform: StoryTransform;
}

interface StoredStoryReaction {
	emoji: string;
	user_ids: Array<string>;
}

interface StoredStory {
	id: string;
	user_id: string;
	user?: {
		id: string;
		name: string;
		username: string;
		global_name: string | null;
		avatar: string | null;
	};
	media_type: StoryMediaType;
	media_url: string;
	media_transform: StoryTransform;
	text: string;
	text_align: StoryTextAlign;
	text_tone: StoryTextTone;
	text_scale: number;
	text_transform: StoryTransform;
	emojis: Array<StoryEmojiSticker>;
	viewer_ids: Array<string>;
	reactions: Array<StoredStoryReaction>;
	background: string;
	created_at: number;
	expires_at: number;
	duration_ms: number;
}

type StoryStore = Record<string, Array<StoredStory>>;

const STORY_STORE_PATH = process.env.ASTRAL_STORIES_STORE_PATH || join(process.cwd(), '.stories.json');
const STORY_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_STORIES_PER_USER = 24;
const MAX_DATA_URL_LENGTH = 18 * 1024 * 1024;
const MAX_STORY_EMOJIS = 18;
const MAX_STORY_EMOJI_URL_LENGTH = 4096;
const BACKGROUNDS = new Set(['brand', 'midnight', 'aurora', 'berry', 'sunset', 'mint', 'blush', 'graphite']);

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));

const sanitizeString = (value: unknown, maxLength: number): string =>
	typeof value === 'string' ? value.trim().slice(0, maxLength) : '';

const sanitizeViewerIds = (value: unknown): Array<string> => {
	if (!Array.isArray(value)) return [];
	return [...new Set(value.filter((id): id is string => typeof id === 'string').map((id) => id.trim()).filter(Boolean))]
		.slice(-10000);
};

const sanitizeReactionEmoji = (value: unknown): string => sanitizeString(value, 24).slice(0, 8);

const sanitizeStoryReactions = (value: unknown): Array<StoredStoryReaction> => {
	if (!Array.isArray(value)) return [];
	return value.slice(0, 16).flatMap((item) => {
		if (!item || typeof item !== 'object') return [];
		const record = item as Record<string, unknown>;
		const emoji = sanitizeReactionEmoji(record.emoji);
		if (!emoji) return [];
		return [{
			emoji,
			user_ids: sanitizeViewerIds(record.user_ids),
		}];
	});
};

const sanitizeTransform = (
	value: unknown,
	defaultValue: StoryTransform,
	minScale: number,
	maxScale: number,
): StoryTransform => {
	const record = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
	return {
		x: Math.round(clamp(Number(record.x ?? defaultValue.x) || 0, -480, 480)),
		y: Math.round(clamp(Number(record.y ?? defaultValue.y) || 0, -640, 640)),
		scale: Number(clamp(Number(record.scale ?? defaultValue.scale) || defaultValue.scale, minScale, maxScale).toFixed(3)),
		rotate: Math.round(clamp(Number(record.rotate ?? defaultValue.rotate ?? 0) || 0, -180, 180)),
	};
};

const sanitizeStoryEmojis = (value: unknown): Array<StoryEmojiSticker> => {
	if (!Array.isArray(value)) return [];
	return value.slice(0, MAX_STORY_EMOJIS).flatMap((item, index) => {
		if (!item || typeof item !== 'object') return [];
		const record = item as Record<string, unknown>;
		const name = sanitizeString(record.name, 80);
		const url = sanitizeString(record.url, MAX_STORY_EMOJI_URL_LENGTH);
		const native = sanitizeString(record.native, 16);
		if (!name || (!url && !native)) return [];
		return [{
			id: sanitizeString(record.id, 120) || `emoji-${index}`,
			name,
			url: url || undefined,
			native: native || undefined,
			transform: sanitizeTransform(record.transform, {x: 0, y: 0, scale: 1, rotate: 0}, 0.5, 3.2),
		}];
	});
};

const sanitizeMediaType = (value: unknown): StoryMediaType => {
	if (value === 'image' || value === 'video' || value === 'text') return value;
	throw InputValidationError.create('media_type', 'Invalid story media type');
};

const sanitizeMediaUrl = (value: unknown, mediaType: StoryMediaType): string => {
	const mediaUrl = sanitizeString(value, MAX_DATA_URL_LENGTH);
	if (mediaType === 'text') return mediaUrl;
	if (!mediaUrl) throw InputValidationError.create('media_url', 'Story media is required');
	if (!mediaUrl.startsWith('data:image/') && !mediaUrl.startsWith('data:video/') && !/^https?:\/\//i.test(mediaUrl)) {
		throw InputValidationError.create('media_url', 'Invalid story media URL');
	}
	return mediaUrl;
};

const sanitizeStoredStory = (story: unknown): StoredStory | null => {
	if (!story || typeof story !== 'object') return null;
	const record = story as Record<string, unknown>;
	const mediaType = record.media_type === 'image' || record.media_type === 'video' || record.media_type === 'text'
		? record.media_type
		: 'text';
	const id = sanitizeString(record.id, 120);
	const userId = sanitizeString(record.user_id, 80);
	const createdAt = Number(record.created_at) || Date.now();
	const expiresAt = Number(record.expires_at) || createdAt + STORY_TTL_MS;
	if (!id || !userId || expiresAt <= Date.now()) return null;

	return {
		id,
		user_id: userId,
		user: record.user && typeof record.user === 'object' ? (record.user as StoredStory['user']) : undefined,
		media_type: mediaType,
		media_url: sanitizeString(record.media_url, MAX_DATA_URL_LENGTH),
		media_transform: sanitizeTransform(record.media_transform, {x: 0, y: 0, scale: 1}, 1, 4),
		text: sanitizeString(record.text, 220),
		text_align: record.text_align === 'left' || record.text_align === 'right' ? record.text_align : 'center',
		text_tone: record.text_tone === 'dark' || record.text_tone === 'accent' ? record.text_tone : 'light',
		text_scale: Number(clamp(Number(record.text_scale) || 1, 0.6, 1.8).toFixed(3)),
		text_transform: sanitizeTransform(record.text_transform, {x: 0, y: 0, scale: 1}, 0.6, 2.8),
		emojis: sanitizeStoryEmojis(record.emojis),
		viewer_ids: sanitizeViewerIds(record.viewer_ids),
		reactions: sanitizeStoryReactions(record.reactions),
		background: typeof record.background === 'string' && BACKGROUNDS.has(record.background) ? record.background : 'brand',
		created_at: createdAt,
		expires_at: expiresAt,
		duration_ms: Math.round(clamp(Number(record.duration_ms) || 6000, 3000, 15000)),
	};
};

async function readStore(): Promise<StoryStore> {
	try {
		const raw = await readFile(STORY_STORE_PATH, 'utf8');
		const parsed = JSON.parse(raw) as Record<string, unknown>;
		const next: StoryStore = {};
		for (const [userId, stories] of Object.entries(parsed)) {
			if (!Array.isArray(stories)) continue;
			const safeStories = stories.map(sanitizeStoredStory).filter((story): story is StoredStory => story != null);
			if (safeStories.length > 0) next[userId] = safeStories.slice(-MAX_STORIES_PER_USER);
		}
		return next;
	} catch {
		return {};
	}
}

async function writeStore(store: StoryStore): Promise<void> {
	await mkdir(dirname(STORY_STORE_PATH), {recursive: true});
	const tempPath = `${STORY_STORE_PATH}.${process.pid}.${Date.now()}.${randomUUID()}.tmp`;
	await writeFile(tempPath, JSON.stringify(store), 'utf8');
	await rename(tempPath, STORY_STORE_PATH);
}

function compactStore(store: StoryStore): StoryStore {
	const now = Date.now();
	const next: StoryStore = {};
	for (const [userId, stories] of Object.entries(store)) {
		const activeStories = stories.filter((story) => story.expires_at > now).slice(-MAX_STORIES_PER_USER);
		if (activeStories.length > 0) next[userId] = activeStories;
	}
	return next;
}

function mapUser(user: User): StoredStory['user'] {
	return {
		id: user.id.toString(),
		name: user.globalName ?? user.username,
		username: user.username,
		global_name: user.globalName,
		avatar: user.avatarHash,
	};
}

function toPublicStory(
	story: StoredStory,
	options: {compact?: boolean; viewerId?: string} = {},
): Omit<StoredStory, 'viewer_ids' | 'reactions'> & {
	views_count: number;
	viewed_by_me: boolean;
	reactions: Array<{emoji: string; count: number; me: boolean}>;
} {
	const {viewer_ids, reactions, ...publicStory} = story;
	const viewerId = options.viewerId ?? '';
	return {
		...publicStory,
		media_url: options.compact && story.media_type !== 'text' ? '' : story.media_url,
		views_count: viewer_ids.length,
		viewed_by_me: Boolean(viewerId && viewer_ids.includes(viewerId)),
		reactions: reactions
			.map((reaction) => ({
				emoji: reaction.emoji,
				count: reaction.user_ids.length,
				me: Boolean(viewerId && reaction.user_ids.includes(viewerId)),
			}))
			.filter((reaction) => reaction.count > 0),
	};
}

export const StoryController = (app: HonoApp) => {
	app.get('/stories/feed', LoginRequired, DefaultUserOnly, async (ctx) => {
		const user = ctx.get('user');
		const viewerId = user.id.toString();
		const compact = ctx.req.query('compact') === '1' || ctx.req.query('compact') === 'true';
		const store = compactStore(await readStore());
		await writeStore(store);
		const stories = Object.values(store)
			.flat()
			.sort((left, right) => left.created_at - right.created_at)
			.map((story) => toPublicStory(story, {compact, viewerId}));
		return ctx.json({stories});
	});

	app.post('/stories', LoginRequired, DefaultUserOnly, async (ctx) => {
		const user = ctx.get('user');
		const body = (await ctx.req.json().catch(() => ({}))) as Record<string, unknown>;
		const mediaType = sanitizeMediaType(body.media_type);
		const mediaUrl = sanitizeMediaUrl(body.media_url, mediaType);
		const now = Date.now();
		const story: StoredStory = {
			id: randomUUID(),
			user_id: user.id.toString(),
			user: mapUser(user),
			media_type: mediaType,
			media_url: mediaUrl,
			media_transform: sanitizeTransform(body.media_transform, {x: 0, y: 0, scale: 1}, 1, 4),
			text: sanitizeString(body.text, 220),
			text_align: body.text_align === 'left' || body.text_align === 'right' ? body.text_align : 'center',
			text_tone: body.text_tone === 'dark' || body.text_tone === 'accent' ? body.text_tone : 'light',
			text_scale: Number(clamp(Number(body.text_scale) || 1, 0.6, 1.8).toFixed(3)),
			text_transform: sanitizeTransform(body.text_transform, {x: 0, y: 0, scale: 1}, 0.6, 2.8),
			emojis: sanitizeStoryEmojis(body.emojis),
			viewer_ids: [],
			reactions: [],
			background: typeof body.background === 'string' && BACKGROUNDS.has(body.background) ? body.background : 'brand',
			created_at: now,
			expires_at: now + STORY_TTL_MS,
			duration_ms: Math.round(clamp(Number(body.duration_ms) || 6000, 3000, 15000)),
		};
		if (story.media_type === 'text' && !story.text && story.emojis.length === 0) {
			throw InputValidationError.create('text', 'Story text is required');
		}

		const store = compactStore(await readStore());
		const userStories = store[story.user_id] ?? [];
		store[story.user_id] = [...userStories, story].slice(-MAX_STORIES_PER_USER);
		await writeStore(store);
		return ctx.json({story: toPublicStory(story, {viewerId: user.id.toString()})}, 201);
	});

	app.post('/stories/:story_id/view', LoginRequired, DefaultUserOnly, async (ctx) => {
		const user = ctx.get('user');
		const storyId = ctx.req.param('story_id');
		const store = compactStore(await readStore());
		const viewerId = user.id.toString();
		for (const [ownerId, stories] of Object.entries(store)) {
			const story = stories.find((item) => item.id === storyId);
			if (!story) continue;
			if (ownerId !== viewerId && !story.viewer_ids.includes(viewerId)) {
				story.viewer_ids = [...story.viewer_ids, viewerId].slice(-10000);
				await writeStore(store);
			}
			return ctx.json({story: toPublicStory(story, {viewerId})});
		}
		throw new UnknownUserError();
	});

	app.post('/stories/:story_id/reactions', LoginRequired, DefaultUserOnly, async (ctx) => {
		const user = ctx.get('user');
		const storyId = ctx.req.param('story_id');
		const viewerId = user.id.toString();
		const body = (await ctx.req.json().catch(() => ({}))) as Record<string, unknown>;
		const emoji = sanitizeReactionEmoji(body.emoji);
		if (!emoji) throw InputValidationError.create('emoji', 'Story reaction is required');
		const store = compactStore(await readStore());
		for (const stories of Object.values(store)) {
			const story = stories.find((item) => item.id === storyId);
			if (!story) continue;
			const existing = story.reactions.find((reaction) => reaction.emoji === emoji);
			if (existing) {
				existing.user_ids = existing.user_ids.includes(viewerId)
					? existing.user_ids.filter((id) => id !== viewerId)
					: [...existing.user_ids, viewerId].slice(-10000);
			} else {
				story.reactions = [...story.reactions, {emoji, user_ids: [viewerId]}].slice(-16);
			}
			story.reactions = story.reactions.filter((reaction) => reaction.user_ids.length > 0);
			await writeStore(store);
			return ctx.json({story: toPublicStory(story, {viewerId})});
		}
		throw new UnknownUserError();
	});

	app.delete('/stories/:story_id', LoginRequired, DefaultUserOnly, async (ctx) => {
		const user = ctx.get('user');
		const storyId = ctx.req.param('story_id');
		const store = compactStore(await readStore());
		const userId = user.id.toString();
		const stories = store[userId] ?? [];
		const nextStories = stories.filter((story) => story.id !== storyId);
		if (nextStories.length === stories.length) {
			throw new UnknownUserError();
		}
		if (nextStories.length > 0) store[userId] = nextStories;
		else delete store[userId];
		await writeStore(store);
		return ctx.body(null, 204);
	});
};
