import {
	COMPONENT_TYPE_STORY_PREVIEW,
	type MessageComponents,
	type StoryPreviewComponent,
} from '~/records/MessageComponentTypes';

export interface ForwardedStoryPreviewData {
	authorName: string;
	summary: string;
	mediaUrl: string | null;
	mediaTransform: StoryPreviewTransform | null;
	comment: string | null;
	isVideo: boolean;
	storyId: string | null;
	userId: string | null;
	text: string | null;
	background: string | null;
	textAlign: 'left' | 'center' | 'right' | null;
	textTone: 'light' | 'dark' | 'accent' | null;
	textScale: number | null;
	textTransform: StoryPreviewTransform | null;
	emojis: Array<StoryPreviewEmoji>;
	drawings: Array<StoryPreviewDrawing>;
}

export interface StoryPreviewTransform {
	x?: number;
	y?: number;
	scale?: number;
	rotate?: number;
}

export interface StoryPreviewEmoji {
	id: string;
	name: string;
	url?: string;
	native?: string;
	transform?: StoryPreviewTransform;
}

export interface StoryPreviewDrawing {
	id: string;
	color: string;
	width: number;
	points: Array<{x: number; y: number}>;
}

export interface StoryForwardPayloadInput {
	authorName: string;
	summary: string;
	mediaUrl?: string | null;
	mediaTransform?: StoryPreviewTransform | null;
	mediaType?: string | null;
	comment?: string | null;
	storyId?: string | null;
	userId?: string | null;
	text?: string | null;
	background?: string | null;
	textAlign?: 'left' | 'center' | 'right' | null;
	textTone?: 'light' | 'dark' | 'accent' | null;
	textScale?: number | null;
	textTransform?: StoryPreviewTransform | null;
	emojis?: Array<StoryPreviewEmoji> | null;
	drawings?: Array<StoryPreviewDrawing> | null;
}

const STORY_FORWARD_PREFIX = 'astral-story-card:';
const STORY_FORWARD_MARKER = '[Story preview]';
const STORY_FORWARD_V2_PREFIX = '[Astral story preview] ';
const STORY_FORWARD_TAG_PREFIX = String.fromCodePoint(0xe0001, 0xe0073, 0xe0074, 0xe0079);
const URL_PATTERN = /^https?:\/\/\S+$/i;
const VIDEO_EXTENSION_PATTERN = /\.(mp4|mov|m4v|webm)(?:[?#].*)?$/i;
const MAX_STORY_MEDIA_URL_LENGTH = 1024;
const MAX_PREVIEW_EMOJIS = 8;
const MAX_PREVIEW_DRAWINGS = 18;
const MAX_PREVIEW_DRAWING_POINTS = 120;

/** Keep story card payloads small enough for in-message delivery (no message.txt fallback). */
export function sanitizeStoryMediaUrl(mediaUrl: string | null | undefined): string | null {
	if (!mediaUrl?.trim()) return null;
	const trimmed = mediaUrl.trim();
	if (trimmed.startsWith('data:') || trimmed.startsWith('blob:')) return null;
	if (trimmed.length > MAX_STORY_MEDIA_URL_LENGTH) return null;
	return trimmed;
}

const encodeBase64Url = (text: string): string => {
	const bytes = new TextEncoder().encode(text);
	let binary = '';
	for (const byte of bytes) {
		binary += String.fromCharCode(byte);
	}
	return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/u, '');
};

const decodeBase64Url = (text: string): string => {
	const padded = `${text}${'='.repeat((4 - (text.length % 4)) % 4)}`.replace(/-/gu, '+').replace(/_/gu, '/');
	const binary = atob(padded);
	const bytes = new Uint8Array(binary.length);
	for (let index = 0; index < binary.length; index += 1) {
		bytes[index] = binary.charCodeAt(index);
	}
	return new TextDecoder().decode(bytes);
};

export function encodeStoryForwardPayload(payload: StoryForwardPayloadInput): string {
	return `${STORY_FORWARD_PREFIX}${encodeBase64Url(
		JSON.stringify({
			v: 4,
			authorName: payload.authorName,
			summary: payload.summary,
			mediaUrl: sanitizeStoryMediaUrl(payload.mediaUrl),
			mediaTransform: sanitizePreviewTransform(payload.mediaTransform, {minScale: 1, maxScale: 4}),
			mediaType: payload.mediaType || null,
			comment: payload.comment?.trim() || null,
			storyId: payload.storyId?.trim() || null,
			userId: payload.userId?.trim() || null,
			text: payload.text?.trim() || null,
			background: payload.background?.trim() || null,
			textAlign: payload.textAlign ?? null,
			textTone: payload.textTone ?? null,
			textScale: sanitizePreviewScale(payload.textScale, 0.6, 2.8),
			textTransform: sanitizePreviewTransform(payload.textTransform, {minScale: 0.6, maxScale: 2.8}),
			emojis: sanitizePreviewEmojis(payload.emojis),
			drawings: sanitizePreviewDrawings(payload.drawings),
		}),
	)}`;
}

function sanitizePreviewScale(value: number | null | undefined, min: number, max: number): number | null {
	if (typeof value !== 'number' || !Number.isFinite(value)) return null;
	return Math.max(min, Math.min(max, Number(value.toFixed(3))));
}

function sanitizePreviewTransform(
	transform: StoryPreviewTransform | null | undefined,
	{minScale, maxScale}: {minScale: number; maxScale: number},
): StoryPreviewTransform | null {
	if (!transform || typeof transform !== 'object') return null;
	const next: StoryPreviewTransform = {};
	if (typeof transform.x === 'number' && Number.isFinite(transform.x)) {
		next.x = Math.max(-480, Math.min(480, Math.round(transform.x)));
	}
	if (typeof transform.y === 'number' && Number.isFinite(transform.y)) {
		next.y = Math.max(-560, Math.min(560, Math.round(transform.y)));
	}
	const scale = sanitizePreviewScale(transform.scale, minScale, maxScale);
	if (scale != null) {
		next.scale = scale;
	}
	if (typeof transform.rotate === 'number' && Number.isFinite(transform.rotate)) {
		next.rotate = Math.max(-180, Math.min(180, Math.round(transform.rotate)));
	}
	return Object.keys(next).length > 0 ? next : null;
}

function sanitizePreviewEmojis(emojis: Array<StoryPreviewEmoji> | null | undefined): Array<StoryPreviewEmoji> {
	if (!Array.isArray(emojis)) return [];
	return emojis.slice(0, MAX_PREVIEW_EMOJIS).map((emoji, index) => ({
		id: typeof emoji.id === 'string' && emoji.id ? emoji.id : `emoji-${index}`,
		name: typeof emoji.name === 'string' ? emoji.name : 'emoji',
		url: typeof emoji.url === 'string' && emoji.url ? emoji.url : undefined,
		native: typeof emoji.native === 'string' && emoji.native ? emoji.native : undefined,
		transform: sanitizePreviewTransform(emoji.transform, {minScale: 0.5, maxScale: 3.2}) ?? undefined,
	}));
}

function sanitizePreviewDrawings(drawings: Array<StoryPreviewDrawing> | null | undefined): Array<StoryPreviewDrawing> {
	if (!Array.isArray(drawings)) return [];
	return drawings.slice(0, MAX_PREVIEW_DRAWINGS).map((stroke, index) => ({
		id: typeof stroke.id === 'string' && stroke.id ? stroke.id : `stroke-${index}`,
		color: typeof stroke.color === 'string' && stroke.color ? stroke.color : '#ffffff',
		width: typeof stroke.width === 'number' ? Math.max(1, Math.min(stroke.width, 32)) : 8,
		points: Array.isArray(stroke.points)
			? stroke.points
					.slice(0, MAX_PREVIEW_DRAWING_POINTS)
					.map((point) => ({
						x: typeof point.x === 'number' ? Math.max(0, Math.min(point.x, 1000)) : 0,
						y: typeof point.y === 'number' ? Math.max(0, Math.min(point.y, 1000)) : 0,
					}))
			: [],
	}));
}

function decodeInvisibleTagPayload(content: string): unknown {
	const encoded = Array.from(content.slice(STORY_FORWARD_TAG_PREFIX.length), (char) => {
		const codePoint = char.codePointAt(0) ?? 0;
		return codePoint >= 0xe0000 && codePoint <= 0xe007f ? String.fromCharCode(codePoint - 0xe0000) : '';
	}).join('');
	return JSON.parse(decodeBase64Url(encoded));
}

function normalizeStoryForwardPayload(payload: unknown): ForwardedStoryPreviewData | null {
	if (!payload || typeof payload !== 'object') return null;
	const record = payload as {
		authorName?: unknown;
		summary?: unknown;
		mediaUrl?: unknown;
		mediaTransform?: unknown;
		mediaType?: unknown;
		comment?: unknown;
		storyId?: unknown;
		userId?: unknown;
		text?: unknown;
		background?: unknown;
		textAlign?: unknown;
		textTone?: unknown;
		textScale?: unknown;
		textTransform?: unknown;
		emojis?: unknown;
		drawings?: unknown;
	};
	const mediaUrl = typeof record.mediaUrl === 'string' && record.mediaUrl.trim() ? record.mediaUrl.trim() : null;
	return {
		authorName: typeof record.authorName === 'string' && record.authorName.trim() ? record.authorName.trim() : 'Story',
		summary: typeof record.summary === 'string' && record.summary.trim() ? record.summary.trim() : 'Story',
		mediaUrl,
		mediaTransform: sanitizePreviewTransform(record.mediaTransform as StoryPreviewTransform | null | undefined, {minScale: 1, maxScale: 4}),
		comment: typeof record.comment === 'string' && record.comment.trim() ? record.comment.trim() : null,
		isVideo: record.mediaType === 'video' || (mediaUrl ? VIDEO_EXTENSION_PATTERN.test(mediaUrl) : false),
		storyId: typeof record.storyId === 'string' && record.storyId.trim() ? record.storyId.trim() : null,
		userId: typeof record.userId === 'string' && record.userId.trim() ? record.userId.trim() : null,
		text: typeof record.text === 'string' && record.text.trim() ? record.text.trim() : null,
		background: typeof record.background === 'string' && record.background.trim() ? record.background.trim() : null,
		textAlign:
			record.textAlign === 'left' || record.textAlign === 'center' || record.textAlign === 'right'
				? record.textAlign
				: null,
		textTone:
			record.textTone === 'light' || record.textTone === 'dark' || record.textTone === 'accent'
				? record.textTone
				: null,
		textScale: sanitizePreviewScale(record.textScale as number | null | undefined, 0.6, 2.8),
		textTransform: sanitizePreviewTransform(record.textTransform as StoryPreviewTransform | null | undefined, {minScale: 0.6, maxScale: 2.8}),
		emojis: sanitizePreviewEmojis(record.emojis as Array<StoryPreviewEmoji> | null | undefined),
		drawings: sanitizePreviewDrawings(record.drawings as Array<StoryPreviewDrawing> | null | undefined),
	};
}

function parseAccessibleStoryForwardText(content: string): ForwardedStoryPreviewData | null {
	const lines = content
		.replace(/\r\n/g, '\n')
		.split('\n')
		.map((line) => line.trim())
		.filter(Boolean);
	if (lines.length < 2) return null;

	const headerLine = lines[0]
		.replace(/^[┌—\-─|│\s]+/u, '')
		.replace(/[─└─]+$/u, '')
		.trim();
	if (!/(story preview|предпросмотр истории)/iu.test(headerLine)) {
		return null;
	}

	const stripLinePrefix = (line: string) => line.replace(/^[|│]\s*/u, '').trim();
	let authorName = 'Story';
	const summaryLines: string[] = [];
	let footerIndex = lines.length;

	for (let index = 1; index < lines.length; index += 1) {
		const rawLine = lines[index]!;
		if (/^└/.test(rawLine)) {
			footerIndex = index;
			break;
		}
		const line = stripLinePrefix(rawLine);
		const fromMatch = line.match(/^(?:From|От)\s*:\s*(.+)$/iu);
		if (fromMatch) {
			authorName = fromMatch[1]?.trim() || authorName;
			continue;
		}
		summaryLines.push(line);
	}

	const commentLines =
		footerIndex < lines.length - 1
			? lines.slice(footerIndex + 1).map(stripLinePrefix).filter(Boolean)
			: summaryLines.slice(1);
	const summary = summaryLines[0]?.trim() || 'Story';

	return {
		authorName: authorName || 'Story',
		summary,
		mediaUrl: null,
		mediaTransform: null,
		comment: commentLines.length > 0 ? commentLines.join('\n') : null,
		isVideo: false,
		storyId: null,
		userId: null,
		text: summary,
		background: null,
		textAlign: null,
		textTone: null,
		textScale: null,
		textTransform: null,
		emojis: [],
		drawings: [],
	};
}

export function resolveForwardedStoryPreview(
	content: string | null | undefined,
	components: MessageComponents | null | undefined,
): ForwardedStoryPreviewData | null {
	return parseForwardedStoryPreviewFromComponents(components) ?? parseForwardedStoryPreview(content);
}

export function createStoryPreviewComponents(
	preview: ForwardedStoryPreviewData,
): MessageComponents {
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
					media_transform: preview.mediaTransform,
					comment: preview.comment,
					is_video: preview.isVideo,
					story_id: preview.storyId,
					user_id: preview.userId,
					text: preview.text,
					background: preview.background,
					text_align: preview.textAlign,
					text_tone: preview.textTone,
					text_scale: preview.textScale,
					text_transform: preview.textTransform,
					emojis: preview.emojis,
					drawings: preview.drawings,
				},
			],
		},
	];
}

export function parseForwardedStoryPreview(content: string | null | undefined): ForwardedStoryPreviewData | null {
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

	const accessibleTextPreview = parseAccessibleStoryForwardText(trimmed);
	if (accessibleTextPreview) {
		return accessibleTextPreview;
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
		authorName: authorName || 'Story',
		summary: summary || 'Story',
		mediaUrl,
		mediaTransform: null,
		comment: commentLines.length > 0 ? commentLines.join('\n') : null,
		isVideo: mediaUrl ? VIDEO_EXTENSION_PATTERN.test(mediaUrl) : false,
		storyId: null,
		userId: null,
		text: summary || null,
		background: null,
		textAlign: null,
		textTone: null,
		textScale: null,
		textTransform: null,
		emojis: [],
		drawings: [],
	};
}

export function isStoryForwardPayload(content: string | null | undefined): boolean {
	return parseForwardedStoryPreview(content) != null;
}

function normalizeStoryPreviewComponent(component: StoryPreviewComponent): ForwardedStoryPreviewData {
	return {
		authorName: component.author_name || 'Story',
		summary: component.summary || 'Story',
		mediaUrl: component.media_url?.trim() || null,
		mediaTransform: sanitizePreviewTransform(component.media_transform, {minScale: 1, maxScale: 4}),
		comment: component.comment?.trim() || null,
		isVideo: !!component.is_video,
		storyId: component.story_id?.trim() || null,
		userId: component.user_id?.trim() || null,
		text: component.text?.trim() || null,
		background: component.background?.trim() || null,
		textAlign: component.text_align ?? null,
		textTone: component.text_tone ?? null,
		textScale: sanitizePreviewScale(component.text_scale, 0.6, 2.8),
		textTransform: sanitizePreviewTransform(component.text_transform, {minScale: 0.6, maxScale: 2.8}),
		emojis: sanitizePreviewEmojis(component.emojis),
		drawings: sanitizePreviewDrawings(component.drawings),
	};
}

export function parseForwardedStoryPreviewFromComponents(
	components: MessageComponents | null | undefined,
): ForwardedStoryPreviewData | null {
	if (!components) return null;
	for (const row of components) {
		for (const child of row.components) {
			if (child.type === COMPONENT_TYPE_STORY_PREVIEW) {
				return normalizeStoryPreviewComponent(child);
			}
		}
	}
	return null;
}
