import {useLingui} from '@lingui/react/macro';
import {clsx} from 'clsx';
import {observer} from 'mobx-react-lite';
import React from 'react';
import StoryStore from '~/stores/StoryStore';
import styles from '~/styles/Message.module.css';
import type {ForwardedStoryPreviewData, StoryPreviewTransform} from '~/utils/StoryForwardPayload';

interface ForwardedStoryCardProps {
	channelId?: string;
	className?: string;
	messageId?: string;
	preview: ForwardedStoryPreviewData;
}

const getVideoPreviewSrc = (mediaUrl: string): string => {
	if (mediaUrl.includes('#')) return mediaUrl;
	return `${mediaUrl}#t=0.001`;
};

const getPreviewTransformValue = (
	transform: StoryPreviewTransform | null | undefined,
	translateScale: number,
): string | null => {
	if (!transform) return null;
	const x = Number(transform.x ?? 0) * translateScale;
	const y = Number(transform.y ?? 0) * translateScale;
	const scale = Number(transform.scale ?? 1);
	const rotate = Number(transform.rotate ?? 0);
	return `translate3d(${x}px, ${y}px, 0) rotate(${rotate}deg) scale(${scale})`;
};

const getPreviewTransformStyle = (
	transform: StoryPreviewTransform | null | undefined,
	translateScale: number,
): React.CSSProperties | undefined => {
	const transformValue = getPreviewTransformValue(transform, translateScale);
	if (!transformValue) return undefined;
	return {
		transform: transformValue,
		transformOrigin: 'center',
	};
};

export const ForwardedStoryCard = observer(function ForwardedStoryCard({className, preview}: ForwardedStoryCardProps) {
	const {t} = useLingui();
	const liveStory = preview.storyId ? StoryStore.stories.find((story) => story.id === preview.storyId) : null;
	const mediaUrl = preview.mediaUrl ?? liveStory?.media_url ?? null;
	const isVideo = preview.isVideo || liveStory?.media_type === 'video';
	const storyText = preview.text ?? liveStory?.text ?? null;
	const background = preview.background ?? liveStory?.background ?? null;
	const textAlign = preview.textAlign ?? liveStory?.text_align ?? 'center';
	const textTone = preview.textTone ?? liveStory?.text_tone ?? 'light';
	const textScale = preview.textScale ?? liveStory?.text_scale ?? 1;
	const textTransform = preview.textTransform ?? liveStory?.text_transform ?? null;
	const mediaTransform = preview.mediaTransform ?? liveStory?.media_transform ?? null;
	const emojis = preview.emojis.length > 0 ? preview.emojis : (liveStory?.emojis ?? []);
	const drawings = preview.drawings.length > 0 ? preview.drawings : (liveStory?.drawings ?? []);
	const textFallback = storyText || preview.summary;

	React.useEffect(() => {
		if (!preview.storyId || liveStory || StoryStore.loading || StoryStore.fullLoading) {
			return;
		}
		void StoryStore.loadStories();
		void StoryStore.loadFullStories();
	}, [liveStory, preview.storyId]);

	const openStory = () => {
		StoryStore.requestOpenForwardedStory(preview);
	};
	const hasMediaPreview = Boolean(mediaUrl);
	const css = styles as Record<string, string>;
	const backgroundClass = background ? css[`forwardedStoryBackground_${background}`] : undefined;
	const textAlignClass = css[`forwardedStoryTextAlign_${textAlign}`];
	const textToneClass = css[`forwardedStoryTextTone_${textTone}`];
	const mediaStyle = getPreviewTransformStyle(mediaTransform, 0.14);
	const textTransformValue = getPreviewTransformValue(textTransform, 0.14);
	const textOverlayStyle: React.CSSProperties = textTransformValue
		? {
				fontSize: `calc(0.7rem * ${textScale})`,
				transform: `translateY(-50%) ${textTransformValue}`,
				transformOrigin: 'center',
			}
		: {fontSize: `calc(0.7rem * ${textScale})`};
	const storyCardContent = (
		<>
			<span
				className={clsx(styles.forwardedStoryMedia, backgroundClass)}
				data-video={isVideo ? 'true' : undefined}
				data-text={!hasMediaPreview ? 'true' : undefined}
			>
				{hasMediaPreview ? (
					isVideo ? (
						<video src={getVideoPreviewSrc(mediaUrl!)} muted playsInline preload="metadata" style={mediaStyle} />
					) : (
						<img src={mediaUrl!} alt="" loading="lazy" style={mediaStyle} />
					)
				) : (
					<span className={styles.forwardedStoryMediaText}>{textFallback}</span>
				)}
				{drawings.length > 0 && (
					<svg className={styles.forwardedStoryDrawingLayer} viewBox="0 0 1000 1000" preserveAspectRatio="none" aria-hidden="true">
						{drawings.map((stroke) => (
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
				)}
				{storyText && (
					<span
						className={clsx(
							styles.forwardedStoryTextOverlay,
							textAlignClass,
							textToneClass,
						)}
						style={textOverlayStyle}
					>
						{storyText}
					</span>
				)}
				{emojis.map((emoji) => (
					<span
						key={emoji.id}
						className={styles.forwardedStoryEmojiSticker}
						style={{
							transform: `translate(${(emoji.transform?.x ?? 0) * 0.12}px, ${(emoji.transform?.y ?? 0) * 0.12}px) scale(${emoji.transform?.scale ?? 1}) rotate(${emoji.transform?.rotate ?? 0}deg)`,
						}}
					>
						{emoji.url ? <img src={emoji.url} alt={emoji.name} loading="lazy" /> : <span>{emoji.native}</span>}
					</span>
				))}
			</span>
		</>
	);

	return (
		<div className={clsx(styles.forwardedStoryWrap, className)}>
			<button type="button" className={styles.forwardedStoryCard} onClick={openStory} aria-label={t`Open story`}>
				{storyCardContent}
			</button>
		</div>
	);
});
