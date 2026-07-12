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

import {Trans, useLingui} from '@lingui/react/macro';
import {
	CaretLeftIcon,
	CaretRightIcon,
	ChatCircleTextIcon,
	CheckIcon,
	EraserIcon,
	EyeIcon,
	ImageSquareIcon,
	PaintBrushIcon,
	PaletteIcon,
	PaperPlaneRightIcon,
	PlusIcon,
	ResizeIcon,
	ShareFatIcon,
	SmileyIcon,
	TextAlignCenterIcon,
	TextAlignLeftIcon,
	TextAlignRightIcon,
	TextAaIcon,
	TrashIcon,
	XIcon,
} from '@phosphor-icons/react';
import {clsx} from 'clsx';
import {AnimatePresence, motion, useReducedMotion} from 'framer-motion';
import {observer} from 'mobx-react-lite';
import React from 'react';
import {createPortal} from 'react-dom';
import * as MessageActionCreators from '~/actions/MessageActionCreators';
import * as ModalActionCreators from '~/actions/ModalActionCreators';
import {modal} from '~/actions/ModalActionCreators';
import * as PrivateChannelActionCreators from '~/actions/PrivateChannelActionCreators';
import * as StoryActionCreators from '~/actions/StoryActionCreators';
import * as ToastActionCreators from '~/actions/ToastActionCreators';
import {MobileEmojiPicker} from '~/components/channel/MobileEmojiPicker';
import {getEmojiImageUrl} from '~/components/channel/emoji-picker/EmojiPickerConstants';
import {StoryForwardModal} from '~/components/channel/dm/StoryForwardModal';
import {StatusAwareAvatar} from '~/components/uikit/StatusAwareAvatar';
import type {UserRecord} from '~/records/UserRecord';
import EmojiStore, {type Emoji} from '~/stores/EmojiStore';
import StoryStore from '~/stores/StoryStore';
import UserStore from '~/stores/UserStore';
import * as AvatarUtils from '~/utils/AvatarUtils';
import * as EmojiUtils from '~/utils/EmojiUtils';
import {encodeStoryForwardPayload} from '~/utils/StoryForwardPayload';
import styles from './StoriesRail.module.css';

interface StoryBundle {
	id: string;
	userId: string;
	user?: UserRecord;
	displayName: string;
	fresh: boolean;
	slides: Array<StoryActionCreators.Story>;
}

interface StoriesRailProps {
	users: ReadonlyArray<UserRecord>;
	onOverlayChange?: (open: boolean) => void;
	isCollapsed?: boolean;
	collapseProgress?: number;
}

const StoryOverlayPortal: React.FC<{children: React.ReactNode}> = ({children}) => {
	const [portalTarget, setPortalTarget] = React.useState<HTMLElement | null>(null);

	React.useEffect(() => {
		setPortalTarget(document.body);
	}, []);

	return portalTarget ? createPortal(children, portalTarget) : <>{children}</>;
};

const MAX_STORY_MEDIA_BYTES = 12 * 1024 * 1024;
type AvatarSize = 16 | 24 | 28 | 32 | 36 | 40 | 48 | 56 | 64 | 80 | 120;
type StoryTransform = Readonly<{x: number; y: number; scale: number; rotate: number}>;
type MediaTransform = StoryTransform;
type TextTransform = StoryTransform;
type PointerPoint = Readonly<{x: number; y: number}>;

const storyBackgrounds = ['brand', 'midnight', 'aurora', 'berry', 'sunset', 'mint', 'blush', 'graphite'] as const;
type StoryBackground = (typeof storyBackgrounds)[number];
type StoryTextAlign = 'left' | 'center' | 'right';
type StoryTextTone = 'light' | 'dark' | 'accent';

const storyReactionEmojis = ['\u2764\uFE0F', '\u{1F602}', '\u{1F525}', '\u{1F44F}', '\u{1F62E}'] as const;
const getStoryReactionAssetUrl = (emoji: string): string | null => EmojiUtils.getEmojiURL(emoji);
const storyBrushColors = ['#ffffff', '#111827', '#f43f5e', '#f97316', '#facc15', '#22c55e', '#38bdf8', '#a78bfa'] as const;

const isStoryBackground = (value: string): value is StoryBackground =>
	(storyBackgrounds as ReadonlyArray<string>).includes(value);

const getBackgroundClass = (background: string | StoryBackground): string =>
	styles[`background_${isStoryBackground(background) ? background : 'brand'}`];

const getTextAlignClass = (align?: string): string => {
	if (align === 'left') return styles.textAlignLeft;
	if (align === 'right') return styles.textAlignRight;
	return styles.textAlignCenter;
};

const getTextToneClass = (tone?: string): string => {
	if (tone === 'dark') return styles.textToneDark;
	if (tone === 'accent') return styles.textToneAccent;
	return styles.textToneLight;
};

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));

const sanitizeMediaTransform = (transform: MediaTransform): MediaTransform => ({
	x: clamp(Math.round(transform.x), -320, 320),
	y: clamp(Math.round(transform.y), -420, 420),
	scale: Number(clamp(transform.scale, 1, 4).toFixed(3)),
	rotate: Math.round(clamp(transform.rotate, -180, 180)),
});

const sanitizeTextTransform = (transform: TextTransform): TextTransform => ({
	x: clamp(Math.round(transform.x), -260, 260),
	y: clamp(Math.round(transform.y), -360, 360),
	scale: Number(clamp(transform.scale, 0.6, 2.8).toFixed(3)),
	rotate: Math.round(clamp(transform.rotate, -180, 180)),
});

const sanitizeEmojiTransform = (transform: StoryTransform): StoryTransform => ({
	x: clamp(Math.round(transform.x), -360, 360),
	y: clamp(Math.round(transform.y), -480, 480),
	scale: Number(clamp(transform.scale, 0.5, 3.2).toFixed(3)),
	rotate: Math.round(clamp(transform.rotate, -180, 180)),
});

const sanitizeDrawingStroke = (stroke: StoryActionCreators.StoryDrawingStroke): StoryActionCreators.StoryDrawingStroke => ({
	id: stroke.id,
	color: storyBrushColors.includes(stroke.color as (typeof storyBrushColors)[number]) ? stroke.color : '#ffffff',
	width: Math.round(clamp(stroke.width, 2, 28)),
	points: stroke.points
		.slice(0, 220)
		.map((point) => ({
			x: Math.round(clamp(Number(point.x ?? 0), 0, 1000)),
			y: Math.round(clamp(Number(point.y ?? 0), 0, 1000)),
		})),
});

const sanitizeDrawingStrokes = (
	strokes: ReadonlyArray<StoryActionCreators.StoryDrawingStroke>,
): Array<StoryActionCreators.StoryDrawingStroke> =>
	strokes
		.map(sanitizeDrawingStroke)
		.filter((stroke) => stroke.points.length > 1)
		.slice(-48);

const getPointerDistance = (left: PointerPoint, right: PointerPoint): number =>
	Math.hypot(left.x - right.x, left.y - right.y);

const getPointerAngle = (left: PointerPoint, right: PointerPoint): number =>
	Math.atan2(right.y - left.y, right.x - left.x) * (180 / Math.PI);

const getPointerMidpoint = (left: PointerPoint, right: PointerPoint): PointerPoint => ({
	x: (left.x + right.x) / 2,
	y: (left.y + right.y) / 2,
});

const getMediaTransformStyle = (transform?: Partial<MediaTransform>): React.CSSProperties => {
	const safe = sanitizeMediaTransform({
		x: Number(transform?.x ?? 0),
		y: Number(transform?.y ?? 0),
		scale: Number(transform?.scale ?? 1),
		rotate: Number(transform?.rotate ?? 0),
	});
	return {
		transform: `translate3d(${safe.x}px, ${safe.y}px, 0) rotate(${safe.rotate}deg) scale(${safe.scale})`,
	};
};

const getTextTransformStyle = (transform?: Partial<TextTransform>, textScale = 1): React.CSSProperties => {
	const safe = sanitizeTextTransform({
		x: Number(transform?.x ?? 0),
		y: Number(transform?.y ?? 0),
		scale: Number(transform?.scale ?? 1),
		rotate: Number(transform?.rotate ?? 0),
	});
	return {
		fontSize: `calc(clamp(1.9rem, 9vw, 3.35rem) * ${textScale})`,
		transform: `translate3d(${safe.x}px, ${safe.y}px, 0) rotate(${safe.rotate}deg) scale(${safe.scale})`,
	};
};

const getEmojiTransformStyle = (transform?: Partial<StoryTransform>): React.CSSProperties => {
	const safe = sanitizeEmojiTransform({
		x: Number(transform?.x ?? 0),
		y: Number(transform?.y ?? 0),
		scale: Number(transform?.scale ?? 1),
		rotate: Number(transform?.rotate ?? 0),
	});
	return {
		transform: `translate3d(${safe.x}px, ${safe.y}px, 0) rotate(${safe.rotate}deg) scale(${safe.scale})`,
	};
};

const getDrawingPoint = (event: React.PointerEvent<SVGSVGElement>): {x: number; y: number} => {
	const rect = event.currentTarget.getBoundingClientRect();
	return {
		x: clamp(((event.clientX - rect.left) / Math.max(rect.width, 1)) * 1000, 0, 1000),
		y: clamp(((event.clientY - rect.top) / Math.max(rect.height, 1)) * 1000, 0, 1000),
	};
};

const renderDrawingLayer = (
	strokes: ReadonlyArray<StoryActionCreators.StoryDrawingStroke> | null | undefined,
	className: string,
): React.ReactNode => {
	if (!strokes?.length) return null;
	return (
		<svg className={className} viewBox="0 0 1000 1000" preserveAspectRatio="none" aria-hidden="true">
			{strokes.map((stroke) => (
				<polyline
					key={stroke.id}
					points={stroke.points.map((point) => `${point.x},${point.y}`).join(' ')}
					fill="none"
					stroke={stroke.color}
					strokeWidth={stroke.width}
					strokeLinecap="round"
					strokeLinejoin="round"
				/>
			))}
		</svg>
	);
};

const fileToDataUrl = (file: File): Promise<string> =>
	new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => resolve(String(reader.result || ''));
		reader.onerror = () => reject(reader.error ?? new Error('file_read_failed'));
		reader.readAsDataURL(file);
	});

const createStoryEmojiSticker = (emoji: Emoji): StoryActionCreators.StoryEmojiSticker | null => {
	const url = getEmojiImageUrl(emoji, EmojiStore.skinTone) ?? emoji.url;
	const native = emoji.hasDiversity && EmojiStore.skinTone && emoji.surrogates
		? `${emoji.surrogates}${EmojiStore.skinTone}`
		: emoji.surrogates;
	if (!url && !native) return null;
	return {
		id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
		name: emoji.uniqueName ?? emoji.name,
		url: url ?? undefined,
		native: native ?? undefined,
		transform: {x: 0, y: 0, scale: 1, rotate: 0},
	};
};

const getStoryDisplayName = (story: StoryActionCreators.Story, user?: UserRecord): string =>
	user?.globalName ?? user?.username ?? story.user?.global_name ?? story.user?.username ?? story.user?.name ?? 'Astral';

const getStoryMessageSummary = (story: StoryActionCreators.Story): string => {
	if (story.text.trim()) return story.text.trim();
	if (story.media_type === 'image') return 'Photo story';
	if (story.media_type === 'video') return 'Video story';
	return 'Story';
};

const createStoryMessageNonce = (): string => `story-${Date.now()}-${Math.random().toString(36).slice(2)}`;

const normalizePreviewText = (value: string | null | undefined): string => (value ?? '').trim().toLocaleLowerCase();

const groupStories = (
	stories: Array<StoryActionCreators.Story>,
	seenIds: Set<string>,
	fallbackUsers: ReadonlyArray<UserRecord>,
	currentUserId?: string | null,
): Array<StoryBundle> => {
	const fallbackUserMap = new Map(fallbackUsers.map((user) => [user.id, user]));
	const byUser = new Map<string, Array<StoryActionCreators.Story>>();

	for (const story of stories) {
		if (story.expires_at <= Date.now()) continue;
		const list = byUser.get(story.user_id) ?? [];
		list.push(story);
		byUser.set(story.user_id, list);
	}

	return [...byUser.entries()]
		.map(([userId, slides]) => {
			const user = UserStore.getUser(userId) ?? fallbackUserMap.get(userId);
			const sortedSlides = slides.sort((left, right) => Number(left.created_at || 0) - Number(right.created_at || 0));
			return {
				id: userId,
				userId,
				user,
				displayName: getStoryDisplayName(sortedSlides[0], user),
				fresh: sortedSlides.some((story) => !seenIds.has(story.id)),
				slides: sortedSlides,
			};
		})
		.sort((left, right) => {
			if (left.userId === currentUserId && right.userId !== currentUserId) return -1;
			if (right.userId === currentUserId && left.userId !== currentUserId) return 1;
			if (left.fresh !== right.fresh) return left.fresh ? -1 : 1;
			return Number(right.slides.at(-1)?.created_at || 0) - Number(left.slides.at(-1)?.created_at || 0);
		});
};

const StoryAvatar: React.FC<{bundle?: StoryBundle; currentUser?: UserRecord | null; size?: AvatarSize}> = ({bundle, currentUser, size = 48}) => {
	const user = bundle?.user ?? currentUser ?? null;
	if (user) {
		return (
			<StatusAwareAvatar
				user={user}
				size={size}
				showOffline={false}
				disablePresence={true}
				disableMobileStatus={true}
				disableStatusTooltip={true}
			/>
		);
	}
	const storyAuthor = bundle?.slides[0]?.user;
	if (storyAuthor) {
		const avatarUrl = AvatarUtils.getUserAvatarURL({
			id: storyAuthor.id,
			avatar: storyAuthor.avatar ?? null,
			username: storyAuthor.username ?? storyAuthor.name,
			globalName: storyAuthor.global_name ?? storyAuthor.name,
		});
		return (
			<img
				className={styles.avatarImageFallback}
				src={avatarUrl}
				alt=""
				width={size}
				height={size}
				style={{'--story-avatar-size': `${size}px`} as React.CSSProperties}
				loading="eager"
				decoding="async"
			/>
		);
	}
	const initials = (bundle?.displayName ?? 'A')
		.split(/\s+/)
		.filter(Boolean)
		.slice(0, 2)
		.map((part) => part[0])
		.join('')
		.toUpperCase();
	return <span className={styles.avatarFallback}>{initials || 'A'}</span>;
};

export const StoriesRail: React.FC<StoriesRailProps> = observer(({users, onOverlayChange, isCollapsed = false, collapseProgress = 0}) => {
	const {t} = useLingui();
	const reducedMotion = useReducedMotion() ?? false;
	const currentUser = UserStore.currentUser;
	const currentUserId = currentUser?.id ?? null;
	const [viewerOpen, setViewerOpen] = React.useState(false);
	const [editorOpen, setEditorOpen] = React.useState(false);
	const [bundleIndex, setBundleIndex] = React.useState(0);
	const [slideIndex, setSlideIndex] = React.useState(0);
	const [progress, setProgress] = React.useState(0);
	const [storyReplyText, setStoryReplyText] = React.useState('');
	const [storyActionsExpanded, setStoryActionsExpanded] = React.useState(false);
	const [storyActionError, setStoryActionError] = React.useState('');
	const [storyActionNotice, setStoryActionNotice] = React.useState('');
	const [storyActionBusy, setStoryActionBusy] = React.useState(false);
	const [draftText, setDraftText] = React.useState('');
	const [draftBackground, setDraftBackground] = React.useState<StoryBackground>('brand');
	const [draftTextAlign, setDraftTextAlign] = React.useState<StoryTextAlign>('center');
	const [draftTextTone, setDraftTextTone] = React.useState<StoryTextTone>('light');
	const [draftTextScale, setDraftTextScale] = React.useState(1);
	const [draftFile, setDraftFile] = React.useState<File | null>(null);
	const [draftPreview, setDraftPreview] = React.useState('');
	const [draftMediaDataUrl, setDraftMediaDataUrl] = React.useState('');
	const [draftMediaPreparing, setDraftMediaPreparing] = React.useState(false);
	const [draftMediaTransform, setDraftMediaTransform] = React.useState<MediaTransform>({x: 0, y: 0, scale: 1, rotate: 0});
	const [draftTextTransform, setDraftTextTransform] = React.useState<TextTransform>({x: 0, y: 0, scale: 1, rotate: 0});
	const [draftEmojis, setDraftEmojis] = React.useState<Array<StoryActionCreators.StoryEmojiSticker>>([]);
	const [draftDrawings, setDraftDrawings] = React.useState<Array<StoryActionCreators.StoryDrawingStroke>>([]);
	const [draftBrushEnabled, setDraftBrushEnabled] = React.useState(false);
	const [draftBrushColor, setDraftBrushColor] = React.useState<(typeof storyBrushColors)[number]>('#ffffff');
	const [draftBrushSize, setDraftBrushSize] = React.useState(8);
	const [emojiPickerOpen, setEmojiPickerOpen] = React.useState(false);
	const [emojiSearchTerm, setEmojiSearchTerm] = React.useState('');
	const [draftError, setDraftError] = React.useState('');
	const [submitting, setSubmitting] = React.useState(false);
	const fileInputRef = React.useRef<HTMLInputElement | null>(null);
	const draftObjectUrlRef = React.useRef<string | null>(null);
	const draftReadTokenRef = React.useRef(0);
	const storyViewerTouchStartYRef = React.useRef<number | null>(null);
	const mediaPointersRef = React.useRef<Map<number, PointerPoint>>(new Map());
	const mediaGestureRef = React.useRef<{
		mode: 'drag' | 'pinch';
		startPoint: PointerPoint;
		startDistance: number;
		startAngle: number;
		startMidpoint: PointerPoint;
		startTransform: MediaTransform;
	} | null>(null);
	const textPointersRef = React.useRef<Map<number, PointerPoint>>(new Map());
	const textGestureRef = React.useRef<{
		mode: 'drag' | 'pinch';
		startPoint: PointerPoint;
		startDistance: number;
		startAngle: number;
		startMidpoint: PointerPoint;
		startTransform: TextTransform;
	} | null>(null);
	const emojiPointersRef = React.useRef<Map<string, Map<number, PointerPoint>>>(new Map());
	const emojiGestureRef = React.useRef<Map<string, {
		mode: 'drag' | 'pinch';
		startPoint: PointerPoint;
		startDistance: number;
		startAngle: number;
		startMidpoint: PointerPoint;
		startTransform: StoryTransform;
	}>>(new Map());
	const drawingPointerRef = React.useRef<number | null>(null);

	const bundles = React.useMemo(
		() => groupStories(StoryStore.stories, StoryStore.seenIds, users, currentUserId),
		[StoryStore.stories, StoryStore.seenRevision, users, currentUserId],
	);
	const activeBundle = bundles[bundleIndex] ?? null;
	const activeSlide = activeBundle?.slides[slideIndex] ?? null;
	const hasReadyMediaDraft = Boolean(draftPreview && (!draftFile || draftMediaDataUrl));
	const hasPendingMediaDraft = Boolean(draftPreview && draftFile && !draftMediaDataUrl);
	const canSubmit = Boolean(!draftMediaPreparing && !hasPendingMediaDraft && (draftText.trim() || hasReadyMediaDraft || draftEmojis.length > 0 || draftDrawings.length > 0));
	const activeViewsCount = activeSlide?.views_count ?? 0;
	const activeStoryReaction = activeSlide?.reactions?.find((reaction) => reaction.me) ?? null;
	const visibleStoryReaction =
		activeStoryReaction ?? activeSlide?.reactions?.find((reaction) => reaction.count > 0) ?? null;
	const activeReactionEmoji = activeStoryReaction?.emoji ?? null;
	const visibleReactionEmoji = activeReactionEmoji ?? visibleStoryReaction?.emoji ?? null;
	const visibleReactionsCount = visibleStoryReaction?.count ?? 0;
	const activeReactionsCount = activeSlide?.reactions?.reduce((total, reaction) => total + reaction.count, 0) ?? 0;
	const storyReactionOptions = storyReactionEmojis;
	const storyAgeLabel = React.useMemo(() => {
		if (!activeSlide?.created_at) return null;
		const diffMs = Date.now() - activeSlide.created_at;
		const minutes = Math.max(1, Math.floor(diffMs / 60_000));
		if (minutes < 60) return t`${minutes}m ago`;
		const hours = Math.floor(minutes / 60);
		if (hours < 24) return t`${hours}h ago`;
		return t`${Math.floor(hours / 24)}d ago`;
	}, [activeSlide?.created_at, t]);
	const isOwnActiveStory = Boolean(activeSlide && currentUserId && activeSlide.user_id === currentUserId);
	const canMessageStoryOwner = Boolean(activeSlide && currentUserId && activeSlide.user_id !== currentUserId);
	const storyOverlayOpen = viewerOpen || editorOpen;
	const safeCollapseProgress = isCollapsed ? 1 : clamp(collapseProgress, 0, 1);
	const railStyle = React.useMemo(
		() =>
			({
				maxHeight: `${5.25 * (1 - safeCollapseProgress)}rem`,
				opacity: 1 - safeCollapseProgress,
				paddingTop: `${0.12 * (1 - safeCollapseProgress)}rem`,
				transform: `translate3d(${-0.25 * safeCollapseProgress}rem, ${-2.95 * safeCollapseProgress}rem, 0) scale(${1 - 0.76 * safeCollapseProgress})`,
				filter: `blur(${0.25 * safeCollapseProgress}px) saturate(${1 - 0.18 * safeCollapseProgress})`,
			}) as React.CSSProperties,
		[safeCollapseProgress],
	);

	React.useEffect(() => {
		onOverlayChange?.(storyOverlayOpen);
		if (!storyOverlayOpen || typeof document === 'undefined') {
			return () => onOverlayChange?.(false);
		}
		const scrollY = window.scrollY;
		const previousOverflow = document.body.style.overflow;
		const previousPosition = document.body.style.position;
		const previousTop = document.body.style.top;
		const previousWidth = document.body.style.width;
		document.body.style.overflow = 'hidden';
		document.body.style.position = 'fixed';
		document.body.style.top = `-${scrollY}px`;
		document.body.style.width = '100%';
		document.documentElement.dataset.storyOverlayOpen = 'true';
		return () => {
			document.body.style.overflow = previousOverflow;
			document.body.style.position = previousPosition;
			document.body.style.top = previousTop;
			document.body.style.width = previousWidth;
			window.scrollTo(0, scrollY);
			delete document.documentElement.dataset.storyOverlayOpen;
			onOverlayChange?.(false);
		};
	}, [onOverlayChange, storyOverlayOpen]);

	React.useEffect(() => {
		void StoryStore.loadStories();
		void StoryStore.loadFullStories();
	}, []);

	React.useEffect(() => () => {
		if (draftObjectUrlRef.current) {
			URL.revokeObjectURL(draftObjectUrlRef.current);
			draftObjectUrlRef.current = null;
		}
	}, []);

	React.useEffect(() => {
		if (viewerOpen && activeSlide) {
			StoryStore.markSeen(activeSlide.id);
			void StoryStore.markViewed(activeSlide.id);
		}
	}, [activeSlide, viewerOpen]);

	React.useEffect(() => {
		if (!viewerOpen || !activeSlide || activeSlide.media_type === 'text' || activeSlide.media_url) return;
		void StoryStore.loadFullStories(true);
	}, [activeSlide, viewerOpen]);

	React.useEffect(() => {
		setStoryReplyText('');
		setStoryActionsExpanded(false);
		setStoryActionError('');
		setStoryActionNotice('');
	}, [activeSlide?.id]);

	const openStory = React.useCallback((index: number, requestedSlideIndex = 0) => {
		setBundleIndex(index);
		setSlideIndex(requestedSlideIndex);
		setProgress(0);
		setStoryActionsExpanded(false);
		setViewerOpen(true);
	}, []);

	React.useEffect(() => {
		const requestedUserId = StoryStore.openRequestUserId;
		const requestedStoryId = StoryStore.openRequestStoryId;
		const requestedMediaUrl = StoryStore.openRequestMediaUrl;
		const requestedAuthorName = normalizePreviewText(StoryStore.openRequestAuthorName);
		if (!requestedUserId && !requestedStoryId && !requestedMediaUrl && !requestedAuthorName) return;

		let requestedSlideIndex = 0;
		const requestedIndex = bundles.findIndex((bundle) => {
			const exactSlideIndex = bundle.slides.findIndex((slide) => {
				if (requestedStoryId && slide.id === requestedStoryId) return true;
				return Boolean(requestedMediaUrl && slide.media_url === requestedMediaUrl);
			});
			if (exactSlideIndex >= 0) {
				requestedSlideIndex = exactSlideIndex;
				return true;
			}
			if (requestedUserId && bundle.userId === requestedUserId) return true;
			return Boolean(requestedAuthorName && normalizePreviewText(bundle.displayName) === requestedAuthorName);
		});
		if (requestedIndex >= 0) {
			openStory(requestedIndex, requestedSlideIndex);
			StoryStore.clearOpenRequest();
			return;
		}
		if (!StoryStore.loading && !StoryStore.fullLoading) {
			void StoryStore.loadFullStories(true);
		}
	}, [
		bundles,
		openStory,
		StoryStore.openRequestToken,
		StoryStore.loading,
		StoryStore.fullLoading,
	]);

	const closeViewer = React.useCallback(() => {
		setViewerOpen(false);
		setProgress(0);
		setStoryActionsExpanded(false);
	}, []);

	const sendStoryMessage = React.useCallback(async (recipientUserId: string, content: string) => {
		const channelId = await PrivateChannelActionCreators.ensureDMChannel(recipientUserId);
		await MessageActionCreators.send(channelId, {
			content,
			nonce: createStoryMessageNonce(),
			allowedMentions: {parse: []},
		});
	}, []);

	const reactToActiveStory = React.useCallback(async (emoji: string) => {
		if (!activeSlide || storyActionBusy) return;
		setStoryActionError('');
		setStoryActionNotice('');
		setStoryActionBusy(true);
		try {
			await StoryStore.reactToStory(activeSlide.id, emoji);
		} catch {
			setStoryActionError(t`Could not react to this story`);
		} finally {
			setStoryActionBusy(false);
		}
	}, [activeReactionEmoji, activeSlide, storyActionBusy, t]);

	const replyToActiveStory = React.useCallback(async () => {
		if (!activeSlide || !activeBundle || !canMessageStoryOwner || storyActionBusy) return;
		const text = storyReplyText.trim();
		if (!text) return;
		setStoryActionError('');
		setStoryActionNotice('');
		setStoryActionBusy(true);
		try {
			await sendStoryMessage(
				activeSlide.user_id,
				encodeStoryForwardPayload({
					authorName: activeBundle.displayName,
					summary: getStoryMessageSummary(activeSlide),
					mediaUrl: activeSlide.media_url,
					mediaType: activeSlide.media_type,
					comment: text,
					storyId: activeSlide.id,
					userId: activeSlide.user_id,
					text: activeSlide.text,
					background: activeSlide.background,
					textAlign: activeSlide.text_align,
					textTone: activeSlide.text_tone,
					emojis: activeSlide.emojis,
					drawings: activeSlide.drawings,
				}),
			);
			setStoryReplyText('');
			setStoryActionNotice(t`Reply sent`);
		} catch {
			setStoryActionError(t`Could not send this story reply`);
		} finally {
			setStoryActionBusy(false);
		}
	}, [activeBundle, activeSlide, canMessageStoryOwner, sendStoryMessage, storyActionBusy, storyReplyText, t]);

	const openStoryForwardModal = React.useCallback(() => {
		if (!activeSlide || !activeBundle) return;
		ModalActionCreators.push(modal(() => <StoryForwardModal story={activeSlide} authorName={activeBundle.displayName} />));
	}, [activeBundle, activeSlide]);

	const handleStoryViewerTouchStart = React.useCallback((event: React.TouchEvent<HTMLElement>) => {
		if (event.touches.length !== 1) {
			storyViewerTouchStartYRef.current = null;
			return;
		}
		const target = event.target;
		if (target instanceof Element && target.closest('button, input, textarea, [data-story-action-panel="true"]')) {
			storyViewerTouchStartYRef.current = null;
			return;
		}
		storyViewerTouchStartYRef.current = event.touches[0].clientY;
	}, []);

	const handleStoryViewerTouchEnd = React.useCallback((event: React.TouchEvent<HTMLElement>) => {
		const startY = storyViewerTouchStartYRef.current;
		storyViewerTouchStartYRef.current = null;
		const touch = event.changedTouches[0];
		if (startY == null || !touch) return;

		const deltaY = startY - touch.clientY;
		if (deltaY > 42) {
			setStoryActionsExpanded(true);
			return;
		}
		if (deltaY < -42) {
			setStoryActionsExpanded(false);
		}
	}, []);

	const goToPrevious = React.useCallback(() => {
		if (!activeBundle) return;
		if (slideIndex > 0) {
			setSlideIndex((current) => current - 1);
			setProgress(0);
			return;
		}
		if (bundleIndex > 0) {
			const previousBundle = bundles[bundleIndex - 1];
			setBundleIndex(bundleIndex - 1);
			setSlideIndex(Math.max(previousBundle.slides.length - 1, 0));
			setProgress(0);
		}
	}, [activeBundle, bundleIndex, bundles, slideIndex]);

	const goToNext = React.useCallback(() => {
		if (!activeBundle) return;
		if (slideIndex < activeBundle.slides.length - 1) {
			setSlideIndex((current) => current + 1);
			setProgress(0);
			return;
		}
		if (bundleIndex < bundles.length - 1) {
			setBundleIndex((current) => current + 1);
			setSlideIndex(0);
			setProgress(0);
			return;
		}
		closeViewer();
	}, [activeBundle, bundleIndex, bundles.length, closeViewer, slideIndex]);

	const handleViewerKeyDown = React.useCallback(
		(event: KeyboardEvent) => {
			if (!viewerOpen) return;
			if (event.key === 'Escape') closeViewer();
			if (event.key === 'ArrowLeft') goToPrevious();
			if (event.key === 'ArrowRight' || event.key === ' ') {
				event.preventDefault();
				goToNext();
			}
		},
		[closeViewer, goToNext, goToPrevious, viewerOpen],
	);

	React.useEffect(() => {
		if (!viewerOpen || !activeSlide || reducedMotion) return;
		if (activeSlide.media_type === 'video') return;
		if (activeSlide.media_type !== 'text' && !activeSlide.media_url) return;
		setProgress(0);
		const startedAt = performance.now();
		let frame = 0;

		const tick = (now: number) => {
			const duration = Math.max(2500, Number(activeSlide.duration_ms || 5000));
			const nextProgress = Math.min((now - startedAt) / duration, 1);
			setProgress(nextProgress);
			if (nextProgress >= 1) {
				goToNext();
				return;
			}
			frame = window.requestAnimationFrame(tick);
		};

		frame = window.requestAnimationFrame(tick);
		return () => window.cancelAnimationFrame(frame);
	}, [activeSlide, goToNext, reducedMotion, viewerOpen]);

	React.useEffect(() => {
		if (!viewerOpen) return;
		window.addEventListener('keydown', handleViewerKeyDown);
		return () => window.removeEventListener('keydown', handleViewerKeyDown);
	}, [handleViewerKeyDown, viewerOpen]);

	const handleFileChange = React.useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
		const file = event.currentTarget.files?.[0] ?? null;
		setDraftError('');
		if (!file) return;
		if (!file.type.startsWith('image/') && !file.type.startsWith('video/')) {
			setDraftError(t`Choose a photo or video`);
			return;
		}
		if (file.size > MAX_STORY_MEDIA_BYTES) {
			setDraftError(t`Story media is too large`);
			return;
		}
		setDraftFile(file);
		setDraftMediaTransform({x: 0, y: 0, scale: 1, rotate: 0});
		setDraftMediaDataUrl('');
		setDraftMediaPreparing(true);
		if (draftObjectUrlRef.current) {
			URL.revokeObjectURL(draftObjectUrlRef.current);
		}
		const objectUrl = URL.createObjectURL(file);
		const readToken = draftReadTokenRef.current + 1;
		draftReadTokenRef.current = readToken;
		draftObjectUrlRef.current = objectUrl;
		setDraftPreview(objectUrl);
		void fileToDataUrl(file)
			.then((dataUrl) => {
				if (draftReadTokenRef.current === readToken) {
					setDraftMediaDataUrl(dataUrl);
				}
			})
			.catch(() => setDraftError(t`Could not read this file`))
			.finally(() => {
				if (draftReadTokenRef.current === readToken) {
					setDraftMediaPreparing(false);
				}
			});
	}, [t]);

	const resetEditor = React.useCallback(() => {
		setDraftText('');
		setDraftFile(null);
		setDraftPreview('');
		setDraftMediaDataUrl('');
		setDraftMediaPreparing(false);
		setDraftError('');
		setDraftBackground('brand');
		setDraftTextAlign('center');
		setDraftTextTone('light');
		setDraftTextScale(1);
		setDraftMediaTransform({x: 0, y: 0, scale: 1, rotate: 0});
		setDraftTextTransform({x: 0, y: 0, scale: 1, rotate: 0});
		setDraftEmojis([]);
		setDraftDrawings([]);
		setDraftBrushEnabled(false);
		setDraftBrushColor('#ffffff');
		setDraftBrushSize(8);
		setEmojiPickerOpen(false);
		setEmojiSearchTerm('');
		mediaPointersRef.current.clear();
		mediaGestureRef.current = null;
		textPointersRef.current.clear();
		textGestureRef.current = null;
		emojiPointersRef.current.clear();
		emojiGestureRef.current.clear();
		drawingPointerRef.current = null;
		draftReadTokenRef.current += 1;
		if (draftObjectUrlRef.current) {
			URL.revokeObjectURL(draftObjectUrlRef.current);
			draftObjectUrlRef.current = null;
		}
		if (fileInputRef.current) fileInputRef.current.value = '';
	}, []);

	const closeEditor = React.useCallback(() => {
		setEditorOpen(false);
		resetEditor();
	}, [resetEditor]);

	const submitStory = React.useCallback(async () => {
		if (submitting) return;
		if (draftPreview && draftFile && !draftMediaDataUrl) {
			setDraftError(t`Preparing media...`);
			return;
		}
		if (!canSubmit) return;
		setSubmitting(true);
		setDraftError('');
		try {
			const sanitizedDrawings = sanitizeDrawingStrokes(draftDrawings);
			const mediaType: StoryActionCreators.StoryMediaType = draftPreview
				? draftFile?.type.startsWith('video/')
					? 'video'
					: 'image'
				: 'text';
			const story = await StoryActionCreators.createStory({
				media_type: mediaType,
				media_url: draftMediaDataUrl || undefined,
				media_transform: mediaType === 'text' ? undefined : sanitizeMediaTransform(draftMediaTransform),
				text: draftText.trim() || undefined,
				text_align: draftTextAlign,
				text_tone: draftTextTone,
				text_scale: draftTextScale,
				text_transform: draftText.trim() ? sanitizeTextTransform(draftTextTransform) : undefined,
				emojis: draftEmojis.map((emoji) => ({
					...emoji,
					transform: sanitizeEmojiTransform({
						x: Number(emoji.transform.x ?? 0),
						y: Number(emoji.transform.y ?? 0),
						scale: Number(emoji.transform.scale ?? 1),
						rotate: Number(emoji.transform.rotate ?? 0),
					}),
				})),
				drawings: sanitizedDrawings,
				background: draftBackground,
				duration_ms: mediaType === 'video' ? 9000 : 5000,
			});
			StoryStore.upsertStory({
				...story,
				drawings: story.drawings ?? sanitizedDrawings,
			});
			closeEditor();
		} catch (error) {
			console.error('Failed to publish story:', error);
			setDraftError(t`Could not publish this story`);
		} finally {
			setSubmitting(false);
		}
	}, [canSubmit, closeEditor, draftBackground, draftDrawings, draftEmojis, draftFile, draftMediaDataUrl, draftMediaTransform, draftPreview, draftText, draftTextAlign, draftTextScale, draftTextTone, draftTextTransform, submitting, t]);

	const cycleTextAlign = React.useCallback(() => {
		setDraftTextAlign((current) => (current === 'center' ? 'left' : current === 'left' ? 'right' : 'center'));
	}, []);

	const cycleTextTone = React.useCallback(() => {
		setDraftTextTone((current) => (current === 'light' ? 'accent' : current === 'accent' ? 'dark' : 'light'));
	}, []);

	const cycleTextScale = React.useCallback(() => {
		setDraftTextScale((current) => (current >= 1.18 ? 0.88 : Number((current + 0.15).toFixed(2))));
	}, []);

	const cycleBrushSize = React.useCallback(() => {
		setDraftBrushSize((current) => (current >= 14 ? 5 : current + 3));
	}, []);

	const clearDraftDrawings = React.useCallback(() => {
		setDraftDrawings([]);
		drawingPointerRef.current = null;
	}, []);

	const resetMediaTransform = React.useCallback(() => {
		setDraftMediaTransform({x: 0, y: 0, scale: 1, rotate: 0});
		mediaPointersRef.current.clear();
		mediaGestureRef.current = null;
	}, []);

	const resetTextTransform = React.useCallback(() => {
		setDraftTextTransform({x: 0, y: 0, scale: 1, rotate: 0});
		textPointersRef.current.clear();
		textGestureRef.current = null;
	}, []);

	const syncMediaGesture = React.useCallback(() => {
		const points = [...mediaPointersRef.current.values()];
		if (points.length >= 2) {
			mediaGestureRef.current = {
				mode: 'pinch',
				startPoint: points[0],
				startDistance: Math.max(1, getPointerDistance(points[0], points[1])),
				startAngle: getPointerAngle(points[0], points[1]),
				startMidpoint: getPointerMidpoint(points[0], points[1]),
				startTransform: draftMediaTransform,
			};
			return;
		}
		if (points.length === 1) {
			mediaGestureRef.current = {
				mode: 'drag',
				startPoint: points[0],
				startDistance: 1,
				startAngle: 0,
				startMidpoint: points[0],
				startTransform: draftMediaTransform,
			};
			return;
		}
		mediaGestureRef.current = null;
	}, [draftMediaTransform]);

	const handleMediaPointerDown = React.useCallback((event: React.PointerEvent<HTMLDivElement>) => {
		if (!draftPreview) return;
		event.preventDefault();
		event.stopPropagation();
		event.currentTarget.setPointerCapture?.(event.pointerId);
		mediaPointersRef.current.set(event.pointerId, {x: event.clientX, y: event.clientY});
		syncMediaGesture();
	}, [draftPreview, syncMediaGesture]);

	const handleMediaPointerMove = React.useCallback((event: React.PointerEvent<HTMLDivElement>) => {
		if (!draftPreview || !mediaPointersRef.current.has(event.pointerId)) return;
		event.preventDefault();
		event.stopPropagation();
		mediaPointersRef.current.set(event.pointerId, {x: event.clientX, y: event.clientY});
		const gesture = mediaGestureRef.current;
		if (!gesture) return;
		const points = [...mediaPointersRef.current.values()];

		if (gesture.mode === 'pinch' && points.length >= 2) {
			const distance = Math.max(1, getPointerDistance(points[0], points[1]));
			const angle = getPointerAngle(points[0], points[1]);
			const midpoint = getPointerMidpoint(points[0], points[1]);
			const scale = clamp(gesture.startTransform.scale * (distance / gesture.startDistance), 1, 4);
			setDraftMediaTransform(sanitizeMediaTransform({
				x: gesture.startTransform.x + midpoint.x - gesture.startMidpoint.x,
				y: gesture.startTransform.y + midpoint.y - gesture.startMidpoint.y,
				scale,
				rotate: gesture.startTransform.rotate + angle - gesture.startAngle,
			}));
			return;
		}

		if (gesture.mode === 'drag' && points.length === 1) {
			const point = points[0];
			setDraftMediaTransform(sanitizeMediaTransform({
				x: gesture.startTransform.x + point.x - gesture.startPoint.x,
				y: gesture.startTransform.y + point.y - gesture.startPoint.y,
				scale: gesture.startTransform.scale,
				rotate: gesture.startTransform.rotate,
			}));
		}
	}, [draftPreview]);

	const handleMediaPointerEnd = React.useCallback((event: React.PointerEvent<HTMLDivElement>) => {
		if (!draftPreview) return;
		event.preventDefault();
		event.stopPropagation();
		mediaPointersRef.current.delete(event.pointerId);
		event.currentTarget.releasePointerCapture?.(event.pointerId);
		syncMediaGesture();
	}, [draftPreview, syncMediaGesture]);

	const syncTextGesture = React.useCallback(() => {
		const points = [...textPointersRef.current.values()];
		if (points.length >= 2) {
			textGestureRef.current = {
				mode: 'pinch',
				startPoint: points[0],
				startDistance: Math.max(1, getPointerDistance(points[0], points[1])),
				startAngle: getPointerAngle(points[0], points[1]),
				startMidpoint: getPointerMidpoint(points[0], points[1]),
				startTransform: draftTextTransform,
			};
			return;
		}
		if (points.length === 1) {
			textGestureRef.current = {
				mode: 'drag',
				startPoint: points[0],
				startDistance: 1,
				startAngle: 0,
				startMidpoint: points[0],
				startTransform: draftTextTransform,
			};
			return;
		}
		textGestureRef.current = null;
	}, [draftTextTransform]);

	const handleTextPointerDown = React.useCallback((event: React.PointerEvent<HTMLDivElement>) => {
		if (!draftText.trim()) return;
		event.preventDefault();
		event.stopPropagation();
		event.currentTarget.setPointerCapture?.(event.pointerId);
		textPointersRef.current.set(event.pointerId, {x: event.clientX, y: event.clientY});
		syncTextGesture();
	}, [draftText, syncTextGesture]);

	const handleTextPointerMove = React.useCallback((event: React.PointerEvent<HTMLDivElement>) => {
		if (!draftText.trim() || !textPointersRef.current.has(event.pointerId)) return;
		event.preventDefault();
		event.stopPropagation();
		textPointersRef.current.set(event.pointerId, {x: event.clientX, y: event.clientY});
		const gesture = textGestureRef.current;
		if (!gesture) return;
		const points = [...textPointersRef.current.values()];

		if (gesture.mode === 'pinch' && points.length >= 2) {
			const distance = Math.max(1, getPointerDistance(points[0], points[1]));
			const angle = getPointerAngle(points[0], points[1]);
			const midpoint = getPointerMidpoint(points[0], points[1]);
			const scale = clamp(gesture.startTransform.scale * (distance / gesture.startDistance), 0.6, 2.8);
			setDraftTextTransform(sanitizeTextTransform({
				x: gesture.startTransform.x + midpoint.x - gesture.startMidpoint.x,
				y: gesture.startTransform.y + midpoint.y - gesture.startMidpoint.y,
				scale,
				rotate: gesture.startTransform.rotate + angle - gesture.startAngle,
			}));
			return;
		}

		if (gesture.mode === 'drag' && points.length === 1) {
			const point = points[0];
			setDraftTextTransform(sanitizeTextTransform({
				x: gesture.startTransform.x + point.x - gesture.startPoint.x,
				y: gesture.startTransform.y + point.y - gesture.startPoint.y,
				scale: gesture.startTransform.scale,
				rotate: gesture.startTransform.rotate,
			}));
		}
	}, [draftText]);

	const handleTextPointerEnd = React.useCallback((event: React.PointerEvent<HTMLDivElement>) => {
		if (!draftText.trim()) return;
		event.preventDefault();
		event.stopPropagation();
		textPointersRef.current.delete(event.pointerId);
		event.currentTarget.releasePointerCapture?.(event.pointerId);
		syncTextGesture();
	}, [draftText, syncTextGesture]);

	const handleEmojiSelect = React.useCallback((emoji: Emoji) => {
		const sticker = createStoryEmojiSticker(emoji);
		if (!sticker) return;
		setDraftEmojis((current) => [...current, sticker].slice(-18));
		setEmojiPickerOpen(false);
	}, []);

	const syncEmojiGesture = React.useCallback((stickerId: string, transform: StoryTransform) => {
		const points = [...(emojiPointersRef.current.get(stickerId)?.values() ?? [])];
		if (points.length >= 2) {
			emojiGestureRef.current.set(stickerId, {
				mode: 'pinch',
				startPoint: points[0],
				startDistance: Math.max(1, getPointerDistance(points[0], points[1])),
				startAngle: getPointerAngle(points[0], points[1]),
				startMidpoint: getPointerMidpoint(points[0], points[1]),
				startTransform: transform,
			});
			return;
		}
		if (points.length === 1) {
			emojiGestureRef.current.set(stickerId, {
				mode: 'drag',
				startPoint: points[0],
				startDistance: 1,
				startAngle: 0,
				startMidpoint: points[0],
				startTransform: transform,
			});
			return;
		}
		emojiGestureRef.current.delete(stickerId);
	}, []);

	const handleEmojiPointerDown = React.useCallback((sticker: StoryActionCreators.StoryEmojiSticker) => (event: React.PointerEvent<HTMLDivElement>) => {
		event.preventDefault();
		event.stopPropagation();
		event.currentTarget.setPointerCapture?.(event.pointerId);
		const points = emojiPointersRef.current.get(sticker.id) ?? new Map<number, PointerPoint>();
		points.set(event.pointerId, {x: event.clientX, y: event.clientY});
		emojiPointersRef.current.set(sticker.id, points);
		syncEmojiGesture(sticker.id, sanitizeEmojiTransform({
			x: Number(sticker.transform.x ?? 0),
			y: Number(sticker.transform.y ?? 0),
			scale: Number(sticker.transform.scale ?? 1),
			rotate: Number(sticker.transform.rotate ?? 0),
		}));
	}, [syncEmojiGesture]);

	const handleEmojiPointerMove = React.useCallback((stickerId: string) => (event: React.PointerEvent<HTMLDivElement>) => {
		const points = emojiPointersRef.current.get(stickerId);
		if (!points?.has(event.pointerId)) return;
		event.preventDefault();
		event.stopPropagation();
		points.set(event.pointerId, {x: event.clientX, y: event.clientY});
		const gesture = emojiGestureRef.current.get(stickerId);
		if (!gesture) return;
		const activePoints = [...points.values()];
		let nextTransform: StoryTransform | null = null;

		if (gesture.mode === 'pinch' && activePoints.length >= 2) {
			const distance = Math.max(1, getPointerDistance(activePoints[0], activePoints[1]));
			const angle = getPointerAngle(activePoints[0], activePoints[1]);
			const midpoint = getPointerMidpoint(activePoints[0], activePoints[1]);
			nextTransform = sanitizeEmojiTransform({
				x: gesture.startTransform.x + midpoint.x - gesture.startMidpoint.x,
				y: gesture.startTransform.y + midpoint.y - gesture.startMidpoint.y,
				scale: gesture.startTransform.scale * (distance / gesture.startDistance),
				rotate: gesture.startTransform.rotate + angle - gesture.startAngle,
			});
		} else if (gesture.mode === 'drag' && activePoints.length === 1) {
			const point = activePoints[0];
			nextTransform = sanitizeEmojiTransform({
				x: gesture.startTransform.x + point.x - gesture.startPoint.x,
				y: gesture.startTransform.y + point.y - gesture.startPoint.y,
				scale: gesture.startTransform.scale,
				rotate: gesture.startTransform.rotate,
			});
		}

		if (!nextTransform) return;
		setDraftEmojis((current) =>
			current.map((item) => item.id === stickerId ? {...item, transform: nextTransform} : item),
		);
	}, []);

	const handleEmojiPointerEnd = React.useCallback((stickerId: string) => (event: React.PointerEvent<HTMLDivElement>) => {
		event.preventDefault();
		event.stopPropagation();
		const points = emojiPointersRef.current.get(stickerId);
		points?.delete(event.pointerId);
		event.currentTarget.releasePointerCapture?.(event.pointerId);
		const sticker = draftEmojis.find((item) => item.id === stickerId);
		if (sticker && points && points.size > 0) {
			syncEmojiGesture(stickerId, sanitizeEmojiTransform({
				x: Number(sticker.transform.x ?? 0),
				y: Number(sticker.transform.y ?? 0),
				scale: Number(sticker.transform.scale ?? 1),
				rotate: Number(sticker.transform.rotate ?? 0),
			}));
		} else {
			emojiPointersRef.current.delete(stickerId);
			emojiGestureRef.current.delete(stickerId);
		}
	}, [draftEmojis, syncEmojiGesture]);

	const handleDrawingPointerDown = React.useCallback((event: React.PointerEvent<SVGSVGElement>) => {
		if (!draftBrushEnabled) return;
		event.preventDefault();
		event.stopPropagation();
		event.currentTarget.setPointerCapture?.(event.pointerId);
		drawingPointerRef.current = event.pointerId;
		const point = getDrawingPoint(event);
		const stroke: StoryActionCreators.StoryDrawingStroke = {
			id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
			color: draftBrushColor,
			width: draftBrushSize,
			points: [point],
		};
		setDraftDrawings((current) => [...current, stroke].slice(-48));
	}, [draftBrushColor, draftBrushEnabled, draftBrushSize]);

	const handleDrawingPointerMove = React.useCallback((event: React.PointerEvent<SVGSVGElement>) => {
		if (!draftBrushEnabled || drawingPointerRef.current !== event.pointerId) return;
		event.preventDefault();
		event.stopPropagation();
		const point = getDrawingPoint(event);
		setDraftDrawings((current) =>
			current.map((stroke, index) =>
				index === current.length - 1
					? sanitizeDrawingStroke({...stroke, points: [...stroke.points, point]})
					: stroke,
			),
		);
	}, [draftBrushEnabled]);

	const handleDrawingPointerEnd = React.useCallback((event: React.PointerEvent<SVGSVGElement>) => {
		if (drawingPointerRef.current !== event.pointerId) return;
		event.preventDefault();
		event.stopPropagation();
		event.currentTarget.releasePointerCapture?.(event.pointerId);
		drawingPointerRef.current = null;
		setDraftDrawings((current) => sanitizeDrawingStrokes(current));
	}, []);

	const AlignIcon = draftTextAlign === 'left' ? TextAlignLeftIcon : draftTextAlign === 'right' ? TextAlignRightIcon : TextAlignCenterIcon;
	const isEditedMediaTransform = draftMediaTransform.x !== 0 || draftMediaTransform.y !== 0 || draftMediaTransform.scale !== 1 || draftMediaTransform.rotate !== 0;
	const isEditedTextTransform = draftTextTransform.x !== 0 || draftTextTransform.y !== 0 || draftTextTransform.scale !== 1 || draftTextTransform.rotate !== 0;
	const getBackgroundLabel = React.useCallback(
		(background: StoryBackground): string => {
			if (background === 'midnight') return t`Midnight`;
			if (background === 'aurora') return t`Aurora`;
			if (background === 'berry') return t`Berry`;
			if (background === 'sunset') return t`Sunset`;
			if (background === 'mint') return t`Mint`;
			if (background === 'blush') return t`Blush`;
			if (background === 'graphite') return t`Graphite`;
			return t`Astral`;
		},
		[t],
	);

	const deleteActiveStory = React.useCallback(async () => {
		if (!activeSlide || activeSlide.user_id !== currentUserId) return;
		const storyId = activeSlide.id;
		StoryStore.removeStory(storyId);
		try {
			await StoryActionCreators.deleteStory(storyId);
		} catch {
			ToastActionCreators.createToast({
				type: 'error',
				children: t`Could not delete this story. Please try again.`,
			});
		}
		goToNext();
	}, [activeSlide, currentUserId, goToNext, t]);

	return (
		<>
			<div
				className={clsx(styles.rail, safeCollapseProgress >= 0.98 && styles.railCollapsed)}
				style={railStyle}
			>
				<div className={styles.scroller} role="list" aria-label={t`Stories`} data-pull-to-refresh-ignore="true">
					<button type="button" role="listitem" className={styles.addButton} onClick={() => setEditorOpen(true)}>
						<div className={styles.addRing}>
							<StoryAvatar currentUser={currentUser} size={48} />
							<span className={styles.addBadge}>
								<PlusIcon weight="bold" />
							</span>
						</div>
						<span className={styles.storyName}>
							<Trans>Your story</Trans>
						</span>
					</button>
					{bundles.map((bundle, index) => (
						<button
							key={bundle.id}
							type="button"
							role="listitem"
							className={styles.storyButton}
							onClick={() => openStory(index)}
						>
							<div className={clsx(styles.ring, bundle.fresh ? styles.ringFresh : styles.ringSeen)}>
								<div className={styles.avatarWrap}>
									<StoryAvatar bundle={bundle} size={48} />
								</div>
							</div>
							<span className={styles.storyName}>{bundle.displayName}</span>
						</button>
					))}
					{StoryStore.loading && bundles.length === 0 && Array.from({length: 4}, (_, index) => (
						<div key={index} className={styles.storySkeleton} aria-hidden="true">
							<span className={styles.storySkeletonCircle} />
							<span className={styles.storySkeletonLine} />
						</div>
					))}
				</div>
			</div>

			<StoryOverlayPortal>
				<AnimatePresence>
					{editorOpen && (
					<motion.div
						key="story-editor"
						className={styles.viewerBackdrop}
						data-edge-swipe-ignore="true"
						onPointerDown={(event) => event.stopPropagation()}
						onTouchStart={(event) => event.stopPropagation()}
						initial={reducedMotion ? false : {opacity: 0}}
						animate={{opacity: 1}}
						exit={{opacity: 0}}
						transition={{duration: reducedMotion ? 0 : 0.18}}
					>
						<motion.div
							className={clsx(styles.viewer, styles.editor, getBackgroundClass(draftBackground))}
							data-edge-swipe-ignore="true"
							initial={reducedMotion ? false : {opacity: 0, y: 16, scale: 0.98}}
							animate={{opacity: 1, y: 0, scale: 1}}
							exit={{opacity: 0, y: 10, scale: 0.985}}
							transition={{duration: reducedMotion ? 0 : 0.22, ease: [0.22, 1, 0.36, 1]}}
						>
							<div className={styles.editorTopBar}>
								<button type="button" className={styles.closeButton} onClick={closeEditor} aria-label={t`Close stories`}>
									<XIcon weight="bold" />
								</button>
								<button
									type="button"
									className={styles.publishButton}
									onClick={submitStory}
									disabled={!canSubmit || submitting}
									aria-label={t`Publish story`}
								>
									<CheckIcon weight="bold" />
								</button>
							</div>

							<div className={styles.editorPreview}>
								{draftPreview && draftFile?.type.startsWith('video/') ? (
									<div
										className={styles.editableMediaStage}
										onPointerDown={handleMediaPointerDown}
										onPointerMove={handleMediaPointerMove}
										onPointerUp={handleMediaPointerEnd}
										onPointerCancel={handleMediaPointerEnd}
									>
										<video
											className={clsx(styles.storyMedia, styles.storyMediaEditable)}
											src={draftPreview}
											playsInline
											muted
											loop
											autoPlay
											style={getMediaTransformStyle(draftMediaTransform)}
										/>
									</div>
								) : draftPreview ? (
									<div
										className={styles.editableMediaStage}
										onPointerDown={handleMediaPointerDown}
										onPointerMove={handleMediaPointerMove}
										onPointerUp={handleMediaPointerEnd}
										onPointerCancel={handleMediaPointerEnd}
									>
										<img
											className={clsx(styles.storyMedia, styles.storyMediaEditable)}
											src={draftPreview}
											alt=""
											style={getMediaTransformStyle(draftMediaTransform)}
										/>
									</div>
								) : draftText.trim() || draftEmojis.length === 0 ? (
									<div
										className={clsx(
											styles.textStoryPreview,
											styles.textStoryEditable,
											getTextAlignClass(draftTextAlign),
											getTextToneClass(draftTextTone),
										)}
										style={getTextTransformStyle(draftTextTransform, draftTextScale)}
										onPointerDown={handleTextPointerDown}
										onPointerMove={handleTextPointerMove}
										onPointerUp={handleTextPointerEnd}
										onPointerCancel={handleTextPointerEnd}
									>
										{draftText.trim() || t`Share a moment`}
									</div>
								) : null}
								{draftPreview && draftText.trim() && (
									<div
										className={clsx(
											styles.textStoryPreview,
											styles.textStoryOverlay,
											styles.textStoryEditable,
											getTextAlignClass(draftTextAlign),
											getTextToneClass(draftTextTone),
										)}
										style={getTextTransformStyle(draftTextTransform, draftTextScale)}
										onPointerDown={handleTextPointerDown}
										onPointerMove={handleTextPointerMove}
										onPointerUp={handleTextPointerEnd}
										onPointerCancel={handleTextPointerEnd}
									>
										{draftText.trim()}
									</div>
								)}
								<svg
									className={clsx(styles.storyDrawingLayer, draftBrushEnabled && styles.storyDrawingLayerActive)}
									viewBox="0 0 1000 1000"
									preserveAspectRatio="none"
									aria-hidden="true"
									onPointerDown={handleDrawingPointerDown}
									onPointerMove={handleDrawingPointerMove}
									onPointerUp={handleDrawingPointerEnd}
									onPointerCancel={handleDrawingPointerEnd}
								>
									{draftDrawings.map((stroke) => (
										<polyline
											key={stroke.id}
											points={stroke.points.map((point) => `${point.x},${point.y}`).join(' ')}
											fill="none"
											stroke={stroke.color}
											strokeWidth={stroke.width}
											strokeLinecap="round"
											strokeLinejoin="round"
										/>
									))}
								</svg>
								{draftEmojis.map((sticker) => (
									<div
										key={sticker.id}
										className={styles.storyEmojiSticker}
										style={getEmojiTransformStyle(sticker.transform)}
										onPointerDown={handleEmojiPointerDown(sticker)}
										onPointerMove={handleEmojiPointerMove(sticker.id)}
										onPointerUp={handleEmojiPointerEnd(sticker.id)}
										onPointerCancel={handleEmojiPointerEnd(sticker.id)}
									>
										{sticker.url ? (
											<img src={sticker.url} alt={sticker.name} draggable={false} />
										) : (
											<span>{sticker.native}</span>
										)}
									</div>
								))}
							</div>

							<div className={styles.editorPanel}>
								<input
									ref={fileInputRef}
									type="file"
									accept="image/*,video/*"
									className={styles.fileInput}
									onChange={handleFileChange}
								/>
								<div className={styles.editorTools} aria-label={t`Story tools`}>
									<button type="button" className={styles.toolButton} onClick={() => fileInputRef.current?.click()} aria-label={t`Add photo or video`}>
										<ImageSquareIcon weight="bold" />
									</button>
									<button
										type="button"
										className={clsx(styles.toolButton, draftTextScale !== 1 && styles.toolButtonActive)}
										onClick={cycleTextScale}
										aria-label={t`Text size`}
									>
										<TextAaIcon weight="bold" />
									</button>
									<button
										type="button"
										className={clsx(styles.toolButton, draftTextAlign !== 'center' && styles.toolButtonActive)}
										onClick={cycleTextAlign}
										aria-label={t`Text alignment`}
									>
										<AlignIcon weight="bold" />
									</button>
									<button
										type="button"
										className={clsx(styles.toolButton, draftTextTone !== 'light' && styles.toolButtonActive)}
										onClick={cycleTextTone}
										aria-label={t`Text color`}
									>
										<PaletteIcon weight="bold" />
									</button>
									<button
										type="button"
										className={clsx(styles.toolButton, emojiPickerOpen && styles.toolButtonActive)}
										onClick={() => setEmojiPickerOpen((open) => !open)}
										aria-label={t`Add emoji`}
									>
										<SmileyIcon weight="bold" />
									</button>
									<button
										type="button"
										className={clsx(styles.toolButton, draftBrushEnabled && styles.toolButtonActive)}
										onClick={() => setDraftBrushEnabled((enabled) => !enabled)}
										aria-label={t`Draw on story`}
									>
										<PaintBrushIcon weight="bold" />
									</button>
									<button
										type="button"
										className={clsx(styles.toolButton, draftBrushSize !== 8 && styles.toolButtonActive)}
										onClick={cycleBrushSize}
										aria-label={t`Brush size`}
									>
										<span className={styles.brushSizePreview} style={{'--brush-size': `${draftBrushSize}px`} as React.CSSProperties} />
									</button>
									<button
										type="button"
										className={clsx(styles.toolButton, draftDrawings.length > 0 && styles.toolButtonActive)}
										onClick={clearDraftDrawings}
										aria-label={t`Clear drawing`}
										disabled={draftDrawings.length === 0}
									>
										<EraserIcon weight="bold" />
									</button>
									<button
										type="button"
										className={clsx(styles.toolButton, isEditedMediaTransform && styles.toolButtonActive)}
										onClick={resetMediaTransform}
										aria-label={t`Reset media position`}
										disabled={!draftPreview}
									>
										<ResizeIcon weight="bold" />
									</button>
									<button
										type="button"
										className={clsx(styles.toolButton, isEditedTextTransform && styles.toolButtonActive)}
										onClick={resetTextTransform}
										aria-label={t`Reset text position`}
										disabled={!draftText.trim()}
									>
										<TextAaIcon weight="bold" />
									</button>
								</div>
								<AnimatePresence initial={false}>
									{emojiPickerOpen && (
										<motion.div
											key="story-emoji-picker"
											className={styles.emojiPickerSheet}
											initial={reducedMotion ? false : {height: 0, opacity: 0, y: 8}}
											animate={{height: 'min(19rem, 42dvh)', opacity: 1, y: 0}}
											exit={{height: 0, opacity: 0, y: 8}}
											transition={{duration: reducedMotion ? 0 : 0.18, ease: [0.22, 1, 0.36, 1]}}
										>
											<MobileEmojiPicker
												handleSelect={handleEmojiSelect}
												externalSearchTerm={emojiSearchTerm}
												externalSetSearchTerm={setEmojiSearchTerm}
											/>
										</motion.div>
									)}
								</AnimatePresence>
								{draftBrushEnabled && (
									<div className={styles.brushColorRow} aria-label={t`Brush color`}>
										{storyBrushColors.map((color) => (
											<button
												key={color}
												type="button"
												className={clsx(styles.brushColorButton, color === draftBrushColor && styles.brushColorButtonSelected)}
												style={{'--brush-color': color} as React.CSSProperties}
												onClick={() => setDraftBrushColor(color)}
												aria-label={t`Brush color`}
											/>
										))}
									</div>
								)}
								<textarea
									value={draftText}
									onChange={(event) => setDraftText(event.currentTarget.value.slice(0, 280))}
									className={styles.storyTextarea}
									placeholder={draftPreview ? t`Add a caption` : t`Write a status`}
								/>
								{draftMediaPreparing && <div className={styles.editorHint}><Trans>Preparing media...</Trans></div>}
								<div className={styles.backgroundRow} aria-label={t`Story background`}>
									{storyBackgrounds.map((background) => (
										<button
											key={background}
											type="button"
											className={clsx(
												styles.backgroundSwatch,
												getBackgroundClass(background),
												background === draftBackground && styles.backgroundSwatchSelected,
											)}
											onClick={() => setDraftBackground(background)}
											aria-label={getBackgroundLabel(background)}
										/>
									))}
								</div>
								{draftError && <div className={styles.editorError}>{draftError}</div>}
							</div>
						</motion.div>
					</motion.div>
				)}

					{viewerOpen && activeBundle && activeSlide && (
					<motion.div
						key="story-viewer"
						className={styles.viewerBackdrop}
						data-edge-swipe-ignore="true"
						onPointerDown={(event) => {
							event.stopPropagation();
							if (event.target === event.currentTarget) {
								closeViewer();
							}
						}}
						onTouchStart={(event) => event.stopPropagation()}
						initial={reducedMotion ? false : {opacity: 0}}
						animate={{opacity: 1}}
						exit={{opacity: 0}}
						transition={{duration: reducedMotion ? 0 : 0.24, ease: [0.22, 1, 0.36, 1]}}
					>
						<motion.div
							className={clsx(styles.viewer, getBackgroundClass(activeSlide.background || 'brand'))}
							data-story-actions-expanded={storyActionsExpanded ? 'true' : 'false'}
							data-edge-swipe-ignore="true"
							onTouchStart={handleStoryViewerTouchStart}
							onTouchEnd={handleStoryViewerTouchEnd}
							initial={reducedMotion ? false : {opacity: 0, y: 16, scale: 0.98}}
							animate={{opacity: 1, y: 0, scale: 1}}
							exit={{opacity: 0, y: 10, scale: 0.985}}
							transition={{duration: reducedMotion ? 0 : 0.28, ease: [0.22, 1, 0.36, 1]}}
						>
							<div className={styles.progressRow}>
								{activeBundle.slides.map((slide, index) => {
									const fill = index < slideIndex ? 1 : index === slideIndex ? progress : 0;
									return (
										<div key={slide.id} className={styles.progressTrack}>
											<div className={styles.progressFill} style={{transform: `scaleX(${fill})`}} />
										</div>
									);
								})}
							</div>

							<div className={styles.viewerHeader}>
								<div className={styles.viewerAuthor}>
									<StoryAvatar bundle={activeBundle} size={40} />
									<div className={styles.viewerCopy}>
										<div className={styles.viewerName}>{activeBundle.displayName}</div>
										<div className={styles.viewerMetaRow}>
											<span className={styles.viewerTime}>{storyAgeLabel ?? t`Story`}</span>
											<span className={styles.viewerViews} aria-label={t`${activeViewsCount} views`}>
												<EyeIcon weight="bold" />
												{activeViewsCount}
											</span>
										</div>
									</div>
								</div>
								<div className={styles.viewerActions}>
									{activeSlide.user_id === currentUserId && (
										<button
											type="button"
											className={styles.closeButton}
											onClick={deleteActiveStory}
											aria-label={t`Delete story`}
										>
											<TrashIcon weight="bold" />
										</button>
									)}
									<button type="button" className={styles.closeButton} onClick={closeViewer} aria-label={t`Close stories`}>
										<XIcon weight="bold" />
									</button>
								</div>
							</div>

							<div className={styles.viewerBody}>
								{activeSlide.media_type !== 'text' && !activeSlide.media_url ? (
									<div className={styles.storyMediaLoading} role="status" aria-live="polite">
										<span>
											<Trans>Loading story</Trans>
										</span>
									</div>
								) : activeSlide.media_type === 'video' ? (
									<video
										className={styles.storyMedia}
										src={activeSlide.media_url}
										autoPlay
										muted
										playsInline
										onTimeUpdate={(event) => {
											const video = event.currentTarget;
											if (video.duration && Number.isFinite(video.duration)) {
												setProgress(video.currentTime / video.duration);
											}
										}}
										onEnded={goToNext}
										onLoadedMetadata={(event) => {
											void event.currentTarget.play().catch(() => {});
										}}
										style={getMediaTransformStyle(activeSlide.media_transform)}
									/>
								) : activeSlide.media_type === 'image' ? (
									<img className={styles.storyMedia} src={activeSlide.media_url} alt="" style={getMediaTransformStyle(activeSlide.media_transform)} />
								) : activeSlide.text ? (
									<div
										className={clsx(
											styles.textStoryPreview,
											getTextAlignClass(activeSlide.text_align),
											getTextToneClass(activeSlide.text_tone),
										)}
										style={getTextTransformStyle(activeSlide.text_transform, activeSlide.text_scale ?? 1)}
									>
										{activeSlide.text}
									</div>
								) : null}
								{activeSlide.media_type !== 'text' && activeSlide.text && (
									<div
										className={clsx(
											styles.textStoryPreview,
											styles.textStoryOverlay,
											getTextAlignClass(activeSlide.text_align),
											getTextToneClass(activeSlide.text_tone),
										)}
										style={getTextTransformStyle(activeSlide.text_transform, activeSlide.text_scale ?? 1)}
									>
										{activeSlide.text}
									</div>
								)}
								{renderDrawingLayer(activeSlide.drawings, styles.storyDrawingLayer)}
								{activeSlide.emojis?.map((sticker) => (
									<div key={sticker.id} className={styles.storyEmojiSticker} style={getEmojiTransformStyle(sticker.transform)}>
										{sticker.url ? (
											<img src={sticker.url} alt={sticker.name} draggable={false} />
										) : (
											<span>{sticker.native}</span>
										)}
									</div>
								))}
							</div>

							<button
								type="button"
								className={clsx(styles.storyQuickActionButton, storyActionsExpanded && styles.storyQuickActionButtonHidden)}
								onClick={() => setStoryActionsExpanded(true)}
								aria-label={t`Show story actions`}
							>
								<ShareFatIcon weight="bold" />
							</button>

							<div
								className={clsx(styles.storyActionPanel, storyActionsExpanded && styles.storyActionPanelExpanded)}
								data-story-action-panel="true"
								onPointerDown={(event) => event.stopPropagation()}
								onClick={(event) => event.stopPropagation()}
							>
								<button
									type="button"
									className={styles.storyActionHandle}
									onClick={() => setStoryActionsExpanded((current) => !current)}
									aria-expanded={storyActionsExpanded}
									aria-label={storyActionsExpanded ? t`Hide story actions` : t`Show story actions`}
								>
									<span />
								</button>
								<div className={styles.storyReactionRow} aria-label={t`Story reactions`}>
									{storyReactionOptions.map((emoji) => {
										const assetUrl = getStoryReactionAssetUrl(emoji);
										return (
											<button
												key={emoji}
												type="button"
												className={clsx(styles.storyReactionButton, activeReactionEmoji === emoji && styles.storyReactionButtonActive)}
												onClick={() => reactToActiveStory(emoji)}
												disabled={storyActionBusy || activeReactionEmoji === emoji}
												aria-label={t`React to story`}
											>
												{assetUrl ? <img src={assetUrl} alt="" draggable={false} /> : <span>{emoji}</span>}
											</button>
										);
									})}
									{visibleReactionEmoji && (
										<span className={styles.storyReactionCount} aria-label={t`${visibleReactionsCount} story reactions`}>
											{getStoryReactionAssetUrl(visibleReactionEmoji) ? (
												<img src={getStoryReactionAssetUrl(visibleReactionEmoji) ?? ''} alt="" draggable={false} />
											) : (
												<span>{visibleReactionEmoji}</span>
											)}
											{visibleReactionsCount}
										</span>
									)}
									<button
										type="button"
										className={styles.storyForwardToggle}
										onClick={openStoryForwardModal}
										aria-label={t`Forward story`}
									>
										<ShareFatIcon weight="bold" />
									</button>
								</div>

								{canMessageStoryOwner ? (
									<div className={styles.storyReplyRow}>
										<ChatCircleTextIcon weight="bold" />
										<input
											value={storyReplyText}
											onChange={(event) => setStoryReplyText(event.currentTarget.value.slice(0, 500))}
											className={styles.storyReplyInput}
											placeholder={t`Reply to story`}
											disabled={storyActionBusy}
										/>
										<button
											type="button"
											className={styles.storySendButton}
											onClick={replyToActiveStory}
											disabled={storyActionBusy || !storyReplyText.trim()}
											aria-label={t`Send story reply`}
										>
											<PaperPlaneRightIcon weight="bold" />
										</button>
									</div>
								) : isOwnActiveStory ? (
									<div className={styles.storyOwnerStats}>
										<span className={styles.storyOwnerStat}>
											<EyeIcon weight="bold" />
											{t`${activeViewsCount} views`}
										</span>
										{(activeSlide.reactions ?? []).map((reaction) => (
											<span key={reaction.emoji} className={styles.storyOwnerStat}>
												{reaction.emoji} {reaction.count}
											</span>
										))}
										{activeReactionsCount === 0 && (
											<span className={styles.storyOwnerHint}>
												<Trans>No reactions yet</Trans>
											</span>
										)}
									</div>
								) : null}

								{storyActionError && <div className={styles.storyActionError}>{storyActionError}</div>}
								{storyActionNotice && <div className={styles.storyActionNotice}>{storyActionNotice}</div>}
							</div>

							<button
								type="button"
								className={clsx(styles.navZone, styles.navLeft)}
								onClick={goToPrevious}
								aria-label={t`Previous story`}
							>
								<span className={styles.navIcon}>
									<CaretLeftIcon weight="bold" />
								</span>
							</button>
							<button
								type="button"
								className={clsx(styles.navZone, styles.navRight)}
								onClick={goToNext}
								aria-label={t`Next story`}
							>
								<span className={styles.navIcon}>
									<CaretRightIcon weight="bold" />
								</span>
							</button>
						</motion.div>
					</motion.div>
				)}
				</AnimatePresence>
			</StoryOverlayPortal>
		</>
	);
});
