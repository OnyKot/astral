import {useLingui} from '@lingui/react/macro';
import {clsx} from 'clsx';
import {SafeMarkdown} from '~/lib/markdown';
import {MarkdownContext} from '~/lib/markdown/renderers';
import StoryStore from '~/stores/StoryStore';
import markupStyles from '~/styles/Markup.module.css';
import styles from '~/styles/Message.module.css';
import type {ForwardedStoryPreviewData} from '~/utils/StoryForwardPayload';

interface ForwardedStoryCardProps {
	channelId?: string;
	className?: string;
	messageId?: string;
	preview: ForwardedStoryPreviewData;
}

export function ForwardedStoryCard({channelId, className, messageId, preview}: ForwardedStoryCardProps) {
	const {t} = useLingui();
	const openStory = () => {
		StoryStore.requestOpenForwardedStory(preview);
	};
	const hasMediaPreview = Boolean(preview.mediaUrl);
	const hasOverlayPreview = Boolean(preview.text || preview.emojis.length > 0 || preview.drawings.length > 0);
	const css = styles as Record<string, string>;
	const backgroundClass = preview.background ? css[`forwardedStoryBackground_${preview.background}`] : undefined;
	const textAlignClass = css[`forwardedStoryTextAlign_${preview.textAlign ?? 'center'}`];
	const textToneClass = css[`forwardedStoryTextTone_${preview.textTone ?? 'light'}`];
	const storyCardContent = (
		<>
			<span
				className={clsx(styles.forwardedStoryMedia, backgroundClass)}
				data-video={preview.isVideo ? 'true' : undefined}
				data-text={!hasMediaPreview ? 'true' : undefined}
			>
				{hasMediaPreview ? (
					preview.isVideo ? (
						<video src={preview.mediaUrl!} muted playsInline preload="metadata" />
					) : (
						<img src={preview.mediaUrl!} alt="" loading="lazy" />
					)
				) : (
					<span className={styles.forwardedStoryMediaText}>{preview.summary}</span>
				)}
				{preview.drawings.length > 0 && (
					<svg className={styles.forwardedStoryDrawingLayer} viewBox="0 0 1000 1000" preserveAspectRatio="none" aria-hidden="true">
						{preview.drawings.map((stroke) => (
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
				{preview.text && (
					<span
						className={clsx(
							styles.forwardedStoryTextOverlay,
							textAlignClass,
							textToneClass,
						)}
					>
						{preview.text}
					</span>
				)}
				{hasOverlayPreview && preview.emojis.map((emoji) => (
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
			<span className={styles.forwardedStoryInfo}>
				<span className={styles.forwardedStoryLabel}>{t`Story preview`}</span>
				<span className={styles.forwardedStoryTitle}>{preview.authorName}</span>
				<span className={styles.forwardedStorySummary}>{preview.summary}</span>
			</span>
		</>
	);

	return (
		<div className={clsx(styles.forwardedStoryWrap, className)}>
			<button type="button" className={styles.forwardedStoryCard} onClick={openStory}>
				{storyCardContent}
			</button>
			{preview.comment && (
				<div className={clsx(markupStyles.markup, styles.forwardedStoryComment)}>
					<SafeMarkdown
						content={preview.comment}
						options={{
							context: MarkdownContext.STANDARD_WITH_JUMBO,
							messageId,
							channelId,
						}}
					/>
				</div>
			)}
		</div>
	);
}
