import type {MessageComponents} from './ComponentTypes';
import {COMPONENT_TYPE_STORY_PREVIEW} from './ComponentTypes';
import type {MessageRequest} from './MessageTypes';

interface StoryForwardPreview {
	authorName: string;
	summary: string;
	mediaUrl: string | null;
	comment: string | null;
	isVideo: boolean;
}

const STORY_FORWARD_PREFIX = 'astral-story-card:';
const STORY_FORWARD_MARKER = '[Story preview]';
const STORY_FORWARD_V2_PREFIX = '[Astral story preview] ';
const STORY_FORWARD_TAG_PREFIX = String.fromCodePoint(0xe0001, 0xe0073, 0xe0074, 0xe0079);
const URL_PATTERN = /^https?:\/\/\S+$/i;
const VIDEO_EXTENSION_PATTERN = /\.(mp4|mov|m4v|webm)(?:[?#].*)?$/i;

function decodeBase64Url(text: string): string {
	const padded = `${text}${'='.repeat((4 - (text.length % 4)) % 4)}`.replace(/-/g, '+').replace(/_/g, '/');
	return Buffer.from(padded, 'base64').toString('utf8');
}

function decodeInvisibleTagPayload(content: string): unknown {
	const encoded = Array.from(content.slice(STORY_FORWARD_TAG_PREFIX.length), (char) => {
		const codePoint = char.codePointAt(0) ?? 0;
		return codePoint >= 0xe0000 && codePoint <= 0xe007f ? String.fromCharCode(codePoint - 0xe0000) : '';
	}).join('');
	return JSON.parse(decodeBase64Url(encoded));
}

function limitText(value: string, maxLength: number): string {
	return value.length > maxLength ? value.slice(0, maxLength) : value;
}

function normalizeStoryForwardPayload(payload: unknown): StoryForwardPreview | null {
	if (!payload || typeof payload !== 'object') return null;
	const record = payload as {
		authorName?: unknown;
		summary?: unknown;
		mediaUrl?: unknown;
		mediaType?: unknown;
		comment?: unknown;
	};
	const mediaUrl = typeof record.mediaUrl === 'string' && record.mediaUrl.trim() ? record.mediaUrl.trim() : null;
	return {
		authorName: limitText(
			typeof record.authorName === 'string' && record.authorName.trim() ? record.authorName.trim() : 'Story',
			80,
		),
		summary: limitText(
			typeof record.summary === 'string' && record.summary.trim() ? record.summary.trim() : 'Story',
			240,
		),
		mediaUrl: mediaUrl ? limitText(mediaUrl, 2048) : null,
		comment:
			typeof record.comment === 'string' && record.comment.trim() ? limitText(record.comment.trim(), 500) : null,
		isVideo: record.mediaType === 'video' || (mediaUrl ? VIDEO_EXTENSION_PATTERN.test(mediaUrl) : false),
	};
}

export function parseStoryForwardPreview(content: string | null | undefined): StoryForwardPreview | null {
	if (!content) return null;
	const trimmed = content.trim();
	const embeddedStoryPrefixIndex = trimmed.indexOf(STORY_FORWARD_PREFIX);
	const embeddedV2PrefixIndex = trimmed.indexOf(STORY_FORWARD_V2_PREFIX);
	const embeddedMarkerIndex = trimmed.indexOf(STORY_FORWARD_MARKER);

	if (embeddedStoryPrefixIndex >= 0) {
		try {
			const encoded = trimmed
				.slice(embeddedStoryPrefixIndex + STORY_FORWARD_PREFIX.length)
				.split(/\s/u, 1)[0]
				?.trim();
			if (!encoded) return null;
			return normalizeStoryForwardPayload(JSON.parse(decodeBase64Url(encoded)));
		} catch {
			return null;
		}
	}

	if (trimmed.startsWith(STORY_FORWARD_TAG_PREFIX)) {
		try {
			return normalizeStoryForwardPayload(decodeInvisibleTagPayload(trimmed));
		} catch {
			return null;
		}
	}

	if (embeddedV2PrefixIndex >= 0) {
		try {
			return normalizeStoryForwardPayload(
				JSON.parse(decodeURIComponent(trimmed.slice(embeddedV2PrefixIndex + STORY_FORWARD_V2_PREFIX.length))),
			);
		} catch {
			return null;
		}
	}

	const legacyText = embeddedMarkerIndex >= 0 ? trimmed.slice(embeddedMarkerIndex) : trimmed;
	const lines = legacyText.replace(/\r\n/g, '\n').split('\n');
	if (lines[0]?.trim() !== STORY_FORWARD_MARKER) return null;

	const authorLine = lines[1]?.trim() ?? '';
	const summary = lines[2]?.trim() ?? '';
	const mediaLineIndex = lines.findIndex((line, index) => index > 2 && URL_PATTERN.test(line.trim()));
	const mediaUrl = mediaLineIndex >= 0 ? lines[mediaLineIndex]!.trim() : null;
	const commentLines =
		mediaLineIndex >= 0
			? lines.slice(mediaLineIndex + 1).filter((line) => line.trim().length > 0)
			: lines.slice(3).filter((line) => line.trim().length > 0);
	const authorName = authorLine.includes(':') ? authorLine.slice(authorLine.indexOf(':') + 1).trim() : authorLine;

	return {
		authorName: limitText(authorName || 'Story', 80),
		summary: limitText(summary || 'Story', 240),
		mediaUrl: mediaUrl ? limitText(mediaUrl, 2048) : null,
		comment: commentLines.length > 0 ? limitText(commentLines.join('\n'), 500) : null,
		isVideo: mediaUrl ? VIDEO_EXTENSION_PATTERN.test(mediaUrl) : false,
	};
}

export function createStoryPreviewComponents(preview: StoryForwardPreview): MessageComponents {
	return [
		{
			type: 1,
			components: [
				{
					type: COMPONENT_TYPE_STORY_PREVIEW,
					kind: 'story_preview',
					author_name: preview.authorName,
					summary: preview.summary,
					media_url: preview.mediaUrl,
					comment: preview.comment,
					is_video: preview.isVideo,
				},
			],
		},
	];
}

export function applyStoryForwardPreviewComponent(data: MessageRequest): void {
	const preview = parseStoryForwardPreview(data.content);
	if (!preview) return;

	data.content = '';
	data.components = createStoryPreviewComponents(preview);
	data.allowed_mentions = data.allowed_mentions ?? {parse: []};
}
