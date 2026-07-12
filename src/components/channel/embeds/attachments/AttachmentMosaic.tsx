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

import {useLingui} from '@lingui/react/macro';
import {PlayIcon, SpeakerHighIcon} from '@phosphor-icons/react';
import {clsx} from 'clsx';
import {AnimatePresence, motion} from 'framer-motion';
import {observer} from 'mobx-react-lite';
import type {CSSProperties, FC, KeyboardEvent, MouseEvent, ReactElement} from 'react';
import {useCallback, useEffect, useMemo, useState} from 'react';
import {thumbHashToDataURL} from 'thumbhash';
import * as ContextMenuActionCreators from '~/actions/ContextMenuActionCreators';
import * as FavoriteMemeActionCreators from '~/actions/FavoriteMemeActionCreators';
import * as MediaViewerActionCreators from '~/actions/MediaViewerActionCreators';
import * as ModalActionCreators from '~/actions/ModalActionCreators';
import {modal} from '~/actions/ModalActionCreators';
import {MessageAttachmentFlags} from '~/Constants';
import {EmbedGif} from '~/components/channel/embeds/media/EmbedGifv';
import {EmbedImage} from '~/components/channel/embeds/media/EmbedImage';
import EmbedAudio from '~/components/channel/embeds/media/EmbedAudio';
import EmbedVideo from '~/components/channel/embeds/media/EmbedVideo';
import {
	isAudioAttachment,
	isGifType,
	isImageType,
	isMediaAttachment,
	isVideoAttachment,
	isVoiceLikeAttachment,
} from '~/components/channel/messageAttachmentUtils';
import {getMediaButtonVisibility} from '~/components/channel/embeds/media/MediaButtonUtils';
import {MediaContainer} from '~/components/channel/embeds/media/MediaContainer';
import {NSFWBlurOverlay} from '~/components/channel/embeds/NSFWBlurOverlay';
import {useMaybeMessageViewContext} from '~/components/channel/MessageViewContext';
import {ExpiryFootnote} from '~/components/common/ExpiryFootnote';
import {SpoilerOverlay} from '~/components/common/SpoilerOverlay';
import {AddFavoriteMemeModal} from '~/components/modals/AddFavoriteMemeModal';
import {MediaContextMenu} from '~/components/uikit/ContextMenu/MediaContextMenu';
import {useDeleteAttachment} from '~/hooks/useDeleteAttachment';
import {useNSFWMedia} from '~/hooks/useNSFWMedia';
import type {MessageAttachment, MessageRecord} from '~/records/MessageRecord';
import AccessibilityStore from '~/stores/AccessibilityStore';
import DeveloperOptionsStore from '~/stores/DeveloperOptionsStore';
import FavoriteMemeStore from '~/stores/FavoriteMemeStore';
import styles from '~/styles/AttachmentMosaic.module.css';
import {formatAttachmentDate, getEarliestAttachmentExpiry} from '~/utils/AttachmentExpiryUtils';
import {createCalculator} from '~/utils/DimensionUtils';
import * as FavoriteMemeUtils from '~/utils/FavoriteMemeUtils';
import {createSaveHandler} from '~/utils/FileDownloadUtils';
import * as ImageCacheUtils from '~/utils/ImageCacheUtils';
import {getAttachmentMediaDimensions, getMosaicMediaDimensions} from '~/utils/MediaDimensionConfig';
import {buildMediaProxyURL} from '~/utils/MediaProxyUtils';
import {useSpoilerState} from '~/utils/SpoilerUtils';

interface AttachmentMosaicProps {
	attachments: ReadonlyArray<MessageAttachment>;
	message?: MessageRecord;
	hideExpiryFootnote?: boolean;
	isPreview?: boolean;
}

interface SingleAttachmentProps {
	attachment: MessageAttachment;
	message?: MessageRecord;
	mediaAttachments: ReadonlyArray<MessageAttachment>;
	isPreview?: boolean;
}

const isAnimated = (flags: number): boolean => (flags & MessageAttachmentFlags.IS_ANIMATED) !== 0;
const FALLBACK_VIDEO_DIMENSIONS = {width: 640, height: 360};

const getMediaDimensions = (attachment: MessageAttachment): {width: number; height: number} => {
	if (attachment.width && attachment.height) {
		return {width: attachment.width, height: attachment.height};
	}

	return isVideoAttachment(attachment) ? FALLBACK_VIDEO_DIMENSIONS : {width: 1, height: 1};
};

interface MediaLoadingState {
	loaded: boolean;
	error: boolean;
	thumbHashURL?: string;
}

const useMediaLoading = (src: string, placeholder?: string): MediaLoadingState => {
	const [loadingState, setLoadingState] = useState<Omit<MediaLoadingState, 'thumbHashURL'>>({
		loaded: ImageCacheUtils.hasImage(src),
		error: false,
	});

	const thumbHashURL = useMemo(() => {
		if (!placeholder) return undefined;
		try {
			const bytes = Uint8Array.from(atob(placeholder), (c) => c.charCodeAt(0));
			return thumbHashToDataURL(bytes);
		} catch {
			return undefined;
		}
	}, [placeholder]);

	useEffect(() => {
		if (DeveloperOptionsStore.forceRenderPlaceholders || DeveloperOptionsStore.forceMediaLoading) {
			return;
		}

		ImageCacheUtils.loadImage(
			src,
			() => setLoadingState({loaded: true, error: false}),
			() => setLoadingState({loaded: false, error: true}),
		);
	}, [src]);

	return {...loadingState, thumbHashURL};
};

interface MosaicItemProps {
	attachment: MessageAttachment;
	style?: CSSProperties;
	message?: MessageRecord;
	mediaAttachments?: ReadonlyArray<MessageAttachment>;
	isPreview?: boolean;
}

const MosaicItemBase: FC<MosaicItemProps> = observer(
	({attachment, style, message, mediaAttachments = [], isPreview}) => {
		const {i18n} = useLingui();
		const messageViewContext = useMaybeMessageViewContext();
		const isVideo = isVideoAttachment(attachment);
		const isAudio = isAudioAttachment(attachment);
		const isAnimatedGif = isAnimated(attachment.flags) || isGifType(attachment.content_type);
		const isSpoiler = (attachment.flags & MessageAttachmentFlags.IS_SPOILER) !== 0;
		const nsfw = attachment.nsfw || (attachment.flags & MessageAttachmentFlags.CONTAINS_EXPLICIT_MEDIA) !== 0;

		const {hidden: spoilerHidden, reveal: revealSpoiler} = useSpoilerState(isSpoiler, message?.channelId);
		const {shouldBlur, gateReason} = useNSFWMedia(nsfw, message?.channelId);

		const wrapSpoiler = (node: ReactElement) =>
			isSpoiler ? (
				<SpoilerOverlay hidden={spoilerHidden} onReveal={revealSpoiler}>
					{node}
				</SpoilerOverlay>
			) : (
				node
			);

		const mosaicDimensions = getMosaicMediaDimensions(message);
		const maxMosaicWidth = mosaicDimensions.maxWidth;
		const naturalDimensions = getMediaDimensions(attachment);
		const targetWidth = Math.min(naturalDimensions.width, maxMosaicWidth * 2);
		const targetHeight = Math.round((targetWidth / naturalDimensions.width) * naturalDimensions.height);

		const proxyUrl = attachment.proxy_url ?? attachment.url ?? '';
		const isBlob = proxyUrl.startsWith('blob:');

		const thumbnailSrc =
			proxyUrl.length === 0
				? ''
				: isBlob
					? proxyUrl
					: isAnimatedGif
						? proxyUrl
						: buildMediaProxyURL(proxyUrl, {
								format: 'webp',
								width: targetWidth,
								height: targetHeight,
							});

		const {loaded, error, thumbHashURL} = useMediaLoading(thumbnailSrc, attachment.placeholder);

		const memes = FavoriteMemeStore.memes;
		const isFavorited = attachment.content_hash
			? memes.some((meme) => meme.contentHash === attachment.content_hash)
			: false;

		const handleClick = useCallback(
			(event: MouseEvent | KeyboardEvent) => {
				if (shouldBlur) {
					event.preventDefault();
					event.stopPropagation();
					return;
				}

				if (event.type === 'keydown') {
					const keyEvent = event as KeyboardEvent;
					if (keyEvent.key !== 'Enter' && keyEvent.key !== ' ') {
						return;
					}
					event.preventDefault();
				}

				const currentIndex = mediaAttachments.findIndex((a) => a.id === attachment.id);

				const items = mediaAttachments.map((att) => {
					const attIsVideo = isVideoAttachment(att);
					const attIsAudio = isAudioAttachment(att);
					const attIsAnimatedGif =
						(att.flags & MessageAttachmentFlags.IS_ANIMATED) !== 0 || att.content_type === 'image/gif';

					let type: 'image' | 'gif' | 'gifv' | 'video' | 'audio';
					if (attIsAudio) {
						type = 'audio';
					} else if (attIsVideo) {
						type = 'video';
					} else if (attIsAnimatedGif) {
						type = 'gif';
					} else {
						type = 'image';
					}

					const attProxy = att.proxy_url ?? att.url ?? '';
					const attUrl = att.url ?? '';

					return {
						src: attProxy,
						originalSrc: attUrl,
						naturalWidth: att.width || 0,
						naturalHeight: att.height || 0,
						type,
						contentHash: att.content_hash,
						attachmentId: att.id,
						filename: att.filename,
						fileSize: att.size,
						duration: att.duration,
						expiresAt: att.expires_at ?? null,
						expired: att.expired ?? false,
					};
				});

				MediaViewerActionCreators.openMediaViewer(items, currentIndex, {
					channelId: message?.channelId,
					messageId: message?.id,
					message,
				});
			},
			[attachment, message, mediaAttachments, shouldBlur],
		);

		const handleFavoriteClick = useCallback(
			async (e: MouseEvent) => {
				e.stopPropagation();
				if (!message?.channelId || !message?.id) return;

				if (isFavorited && attachment.content_hash) {
					const meme = memes.find((m) => m.contentHash === attachment.content_hash);
					if (!meme) return;
					await FavoriteMemeActionCreators.deleteFavoriteMeme(i18n, meme.id);
				} else {
					const defaultName = FavoriteMemeUtils.deriveDefaultNameFromAttachment(i18n, attachment);
					ModalActionCreators.push(
						modal(() => (
							<AddFavoriteMemeModal
								channelId={message.channelId}
								messageId={message.id}
								attachmentId={attachment.id}
								defaultName={defaultName}
								defaultAltText={attachment.filename}
							/>
						)),
					);
				}
			},
			[message, attachment, isFavorited, memes, i18n],
		);

		const handleDownloadClick = useCallback(
			(e: MouseEvent) => {
				e.stopPropagation();
				const mediaType = isAudio ? 'audio' : isVideo ? 'video' : 'image';
				createSaveHandler(attachment.url ?? '', mediaType)();
			},
			[attachment.url, isAudio, isVideo],
		);

		const isRealAttachment = !message?.attachments ? false : message.attachments.some((a) => a.id === attachment.id);

		const handleDeleteClick = useDeleteAttachment(message, isRealAttachment ? attachment.id : undefined);

		const handleContextMenu = useCallback(
			(e: MouseEvent) => {
				if (!message || isPreview) return;

				e.preventDefault();
				e.stopPropagation();

				const mediaType = isAudio ? 'audio' : isVideo ? 'video' : 'image';
				const defaultName = FavoriteMemeUtils.deriveDefaultNameFromAttachment(i18n, attachment);

				ContextMenuActionCreators.openFromEvent(e, ({onClose}) => (
					<MediaContextMenu
						message={message}
						originalSrc={attachment.url ?? ''}
						proxyURL={attachment.proxy_url ?? attachment.url ?? ''}
						type={mediaType}
						contentHash={attachment.content_hash}
						attachmentId={attachment.id}
						defaultName={defaultName}
						defaultAltText={attachment.filename}
						onClose={onClose}
						onDelete={isPreview ? () => {} : (messageViewContext?.handleDelete ?? (() => {}))}
					/>
				));
			},
			[message, attachment, isAudio, isVideo, isPreview, messageViewContext],
		);

		const mediaType = isAudio ? 'audio' : isVideo ? 'video' : isAnimatedGif ? 'animated GIF' : 'image';
		const ariaLabel = `Open ${mediaType} in full view`;
		const shouldRenderPlaceholder = !loaded || error;
		const aspectRatioStyle = {aspectRatio: `${naturalDimensions.width} / ${naturalDimensions.height}`};

		const canFavorite = !!(message?.channelId && message?.id);
		const {showFavoriteButton, showDownloadButton, showDeleteButton} = getMediaButtonVisibility(
			canFavorite,
			isPreview ? undefined : message,
			isRealAttachment ? attachment.id : undefined,
			{disableDelete: !!isPreview},
		);

		return wrapSpoiler(
			<MediaContainer
				className={styles.mosaicItem}
				style={style}
				showFavoriteButton={showFavoriteButton}
				isFavorited={isFavorited}
				onFavoriteClick={handleFavoriteClick}
				showDownloadButton={showDownloadButton}
				onDownloadClick={handleDownloadClick}
				showDeleteButton={showDeleteButton}
				onDeleteClick={handleDeleteClick}
				onContextMenu={handleContextMenu}
			>
				<button
					type="button"
					className={styles.clickableButton}
					onClick={handleClick}
					onKeyDown={handleClick}
					aria-label={ariaLabel}
				>
					{isAudio ? (
						<div className={styles.audioPlaceholder}>
							<SpeakerHighIcon weight="fill" />
						</div>
					) : (
						<div className={styles.mediaContainer}>
							<div className={styles.clickableWrapper}>
								<div className={styles.loadingOverlay} style={aspectRatioStyle}>
									{isAnimatedGif && <div className={styles.gifIndicator}>GIF</div>}

									<AnimatePresence>
										{shouldRenderPlaceholder && thumbHashURL && (
											<motion.img
												key="placeholder"
												initial={{opacity: 1}}
												exit={{opacity: 0}}
												transition={{duration: 0.3}}
												src={thumbHashURL}
												alt=""
												className={styles.placeholderImage}
											/>
										)}
									</AnimatePresence>

									<img
										src={thumbnailSrc}
										alt={attachment.filename}
										loading="lazy"
										draggable={false}
										className={clsx(
											styles.mediaImage,
											shouldRenderPlaceholder && styles.mediaImageHidden,
											shouldBlur && styles.mediaBlurred,
										)}
										aria-hidden={shouldBlur}
									/>
								</div>

								{shouldBlur && (
									<div className={styles.nsfwOverlay}>
										<NSFWBlurOverlay reason={gateReason} />
									</div>
								)}
							</div>
						</div>
					)}

					{(isVideo || isAudio) && (
						<div className={styles.playButtonOverlay}>
							<div className={styles.playButton}>
								<PlayIcon size={28} weight="fill" aria-hidden="true" />
							</div>
						</div>
					)}
				</button>
			</MediaContainer>,
		);
	},
);

const SingleAttachment: FC<SingleAttachmentProps> = observer(({attachment, message, mediaAttachments, isPreview}) => {
	const isVideo = isVideoAttachment(attachment);
	const isAudio = isAudioAttachment(attachment);
	const isAnimatedGif = isAnimated(attachment.flags) || isGifType(attachment.content_type);
	const isSpoiler = (attachment.flags & MessageAttachmentFlags.IS_SPOILER) !== 0;
	const nsfw = attachment.nsfw || (attachment.flags & MessageAttachmentFlags.CONTAINS_EXPLICIT_MEDIA) !== 0;

	const {hidden: spoilerHidden, reveal: revealSpoiler} = useSpoilerState(isSpoiler, message?.channelId);

	const wrapSpoiler = (node: ReactElement) =>
		isSpoiler ? (
			<SpoilerOverlay hidden={spoilerHidden} onReveal={revealSpoiler}>
				{node}
			</SpoilerOverlay>
		) : (
			node
		);

	const attachmentDimensions = getAttachmentMediaDimensions(message);
	const standaloneMediaCalculator = createCalculator({
		maxWidth: attachmentDimensions.maxWidth,
		maxHeight: attachmentDimensions.maxHeight,
		responsive: true,
	});

	const naturalDimensions = getMediaDimensions(attachment);
	const {dimensions} = standaloneMediaCalculator.calculate(naturalDimensions, {forceScale: true});

	const safeProxy = attachment.proxy_url ?? attachment.url ?? '';
	const safeUrl = attachment.url ?? '';

	const commonProps = {
		channelId: message?.channelId,
		messageId: message?.id,
		attachmentId: attachment.id,
		message,
		contentHash: attachment.content_hash,
		placeholder: attachment.placeholder,
		nsfw,
	};

	if (isAudio) {
		return wrapSpoiler(
			<EmbedAudio
				src={safeProxy}
				title={attachment.title || attachment.filename}
				duration={attachment.duration}
				waveform={attachment.waveform}
				embedUrl={safeUrl}
				channelId={message?.channelId}
				messageId={message?.id}
				attachmentId={attachment.id}
				message={message}
				contentHash={attachment.content_hash}
				fileSize={attachment.size}
				isPreview={isPreview}
				isVoiceMessage={isVoiceLikeAttachment(attachment)}
			/>,
		);
	}

	if (isVideo) {
		return wrapSpoiler(
			<div className={styles.relativeWrapper}>
				<div className={styles.mosaicContainer}>
					<div className={styles.oneByOneGrid}>
						<EmbedVideo
							{...commonProps}
							src={safeProxy}
							width={dimensions.width}
							height={dimensions.height}
							title={attachment.title || attachment.filename}
							mediaAttachments={mediaAttachments}
							isPreview={isPreview}
						/>
					</div>
				</div>
			</div>,
		);
	}

	if (isAnimatedGif) {
		const animatedProxyURL = buildMediaProxyURL(attachment.proxy_url ?? attachment.url ?? '', {
			animated: true,
		});

		return wrapSpoiler(
			<div className={styles.relativeWrapper}>
				<div className={styles.mosaicContainer}>
					<div className={styles.oneByOneGrid}>
						<EmbedGif
							{...commonProps}
							embedURL={safeUrl}
							proxyURL={animatedProxyURL}
							naturalWidth={attachment.width!}
							naturalHeight={attachment.height!}
							isPreview={isPreview}
						/>
					</div>
				</div>
			</div>,
		);
	}

	const targetWidth = Math.round(dimensions.width * 2);
	const targetHeight = Math.round(dimensions.height * 2);

	const optimizedSrc = buildMediaProxyURL(attachment.proxy_url ?? attachment.url ?? '', {
		format: 'webp',
		width: targetWidth,
		height: targetHeight,
	});

	return wrapSpoiler(
		<EmbedImage
			{...commonProps}
			src={optimizedSrc}
			originalSrc={safeUrl}
			naturalWidth={attachment.width!}
			naturalHeight={attachment.height!}
			width={dimensions.width}
			height={dimensions.height}
			constrain={true}
			mediaAttachments={mediaAttachments}
			isPreview={isPreview}
		/>,
	);
});

const AttachmentMosaicComponent: FC<AttachmentMosaicProps> = observer(
	({attachments, message, hideExpiryFootnote, isPreview}) => {
		const {t} = useLingui();

		const mediaAttachments = attachments.filter(isMediaAttachment);
		const audioAttachments = mediaAttachments.filter(isAudioAttachment);
		const visualMediaAttachments = mediaAttachments.filter((attachment) => !isAudioAttachment(attachment));
		const count = visualMediaAttachments.length;
		const aggregateExpiry = getEarliestAttachmentExpiry(attachments);

		const renderFootnote = () => {
			if (hideExpiryFootnote) {
				return null;
			}

			const earliest = formatAttachmentDate(aggregateExpiry.expiresAt);
			const latest = formatAttachmentDate(aggregateExpiry.latestAt);

			let label: string;
			if (earliest && latest && earliest !== latest) {
				label = aggregateExpiry.isExpired
					? t`Expired between ${earliest} and ${latest}`
					: t`Expires between ${earliest} and ${latest}`;
			} else if (earliest) {
				label = aggregateExpiry.isExpired ? t`Expired on ${earliest}` : t`Expires on ${earliest}`;
			} else {
				return null;
			}

			return AccessibilityStore.showAttachmentExpiryIndicator ? (
				<ExpiryFootnote expiresAt={aggregateExpiry.expiresAt} isExpired={aggregateExpiry.isExpired} label={label} />
			) : null;
		};

		if (count === 0) {
			if (audioAttachments.length === 0) {
				return null;
			}

			return (
				<div className={styles.mosaicContainerWrapper}>
					{audioAttachments.map((attachment) => (
						<SingleAttachment
							key={attachment.id}
							attachment={attachment}
							message={message}
							mediaAttachments={visualMediaAttachments}
							isPreview={isPreview}
						/>
					))}
					{renderFootnote()}
				</div>
			);
		}

		const renderMosaicItem = (attachment: MessageAttachment, key?: string) => (
			<MosaicItemBase
				key={key || attachment.id}
				attachment={attachment}
				message={message}
				mediaAttachments={visualMediaAttachments}
				isPreview={isPreview}
			/>
		);

		const renderAudioAttachments = () =>
			audioAttachments.length > 0 ? (
				<div className={styles.mosaicContainerWrapper}>
					{audioAttachments.map((attachment) => (
						<SingleAttachment
							key={attachment.id}
							attachment={attachment}
							message={message}
							mediaAttachments={visualMediaAttachments}
							isPreview={isPreview}
						/>
					))}
				</div>
			) : null;

		const renderGrid = (items: ReadonlyArray<MessageAttachment>, gridClassName: string) => (
			<>
				<div className={styles.mosaicContainerWrapper}>
					<div className={styles.mosaicContainer}>
						<div className={gridClassName}>{items.map((attachment) => renderMosaicItem(attachment))}</div>
					</div>
					{renderFootnote()}
				</div>
				{renderAudioAttachments()}
			</>
		);

		switch (count) {
			case 1:
				return (
					<>
						<div className={clsx(styles.mosaicContainerWrapper, styles.singleMosaicContainerWrapper)}>
							<div className={styles.mosaicContainer}>
								<SingleAttachment
									attachment={visualMediaAttachments[0]}
									message={message}
									mediaAttachments={visualMediaAttachments}
									isPreview={isPreview}
								/>
							</div>
							{renderFootnote()}
						</div>
						{renderAudioAttachments()}
					</>
				);

			case 2:
				return (
					<>
						<div className={styles.mosaicContainerWrapper}>
							<div className={styles.mosaicContainer}>
								<div className={styles.oneByTwoGrid}>
									{visualMediaAttachments.map((attachment) => (
										<div key={attachment.id} className={styles.oneByTwoGridItem}>
											{renderMosaicItem(attachment)}
										</div>
									))}
								</div>
							</div>
							{renderFootnote()}
						</div>
						{renderAudioAttachments()}
					</>
				);

			case 3:
				return (
					<>
						<div className={styles.mosaicContainerWrapper}>
							<div className={styles.mosaicContainer}>
								<div className={clsx(styles.oneByTwoGrid, styles.oneByTwoLayoutThreeGrid)}>
									<div className={styles.oneByTwoSoloItem}>{renderMosaicItem(visualMediaAttachments[0])}</div>
									<div className={styles.oneByTwoDuoItem}>
										<div className={styles.twoByOneGrid}>
											<div className={styles.twoByOneGridItem}>{renderMosaicItem(visualMediaAttachments[1])}</div>
											<div className={styles.twoByOneGridItem}>{renderMosaicItem(visualMediaAttachments[2])}</div>
										</div>
									</div>
								</div>
							</div>
							{renderFootnote()}
						</div>
						{renderAudioAttachments()}
					</>
				);

			case 4:
				return renderGrid(visualMediaAttachments, styles.twoByTwoGrid);

			case 5:
				return (
					<>
						<div className={styles.mosaicContainerWrapper}>
							<div className={styles.mosaicContainer}>
								<div className={clsx(styles.fiveAttachmentContainer)}>
									<div className={styles.oneByTwoGrid}>
										<div className={styles.oneByTwoGridItem}>{renderMosaicItem(visualMediaAttachments[0])}</div>
										<div className={styles.oneByTwoGridItem}>{renderMosaicItem(visualMediaAttachments[1])}</div>
									</div>
									<div className={styles.threeByThreeGrid}>
										{visualMediaAttachments.slice(2, 5).map((attachment) => renderMosaicItem(attachment))}
									</div>
								</div>
							</div>
							{renderFootnote()}
						</div>
						{renderAudioAttachments()}
					</>
				);

			case 6:
				return renderGrid(visualMediaAttachments, styles.threeByThreeGrid);

			case 7:
				return (
					<>
						<div className={styles.mosaicContainerWrapper}>
							<div className={styles.mosaicContainer}>
								<div className={clsx(styles.oneByOneGrid, styles.oneByOneGridMosaic)}>
									{renderMosaicItem(visualMediaAttachments[0])}
								</div>
								<div className={styles.threeByThreeGrid}>
									{visualMediaAttachments.slice(1, 7).map((attachment) => renderMosaicItem(attachment))}
								</div>
							</div>
							{renderFootnote()}
						</div>
						{renderAudioAttachments()}
					</>
				);

			case 8:
				return (
					<>
						<div className={styles.mosaicContainerWrapper}>
							<div className={styles.mosaicContainer}>
								<div className={styles.oneByTwoGrid}>
									<div className={styles.oneByTwoGridItem}>{renderMosaicItem(visualMediaAttachments[0])}</div>
									<div className={styles.oneByTwoGridItem}>{renderMosaicItem(visualMediaAttachments[1])}</div>
								</div>
								<div className={styles.threeByThreeGrid}>
									{visualMediaAttachments.slice(2, 8).map((attachment) => renderMosaicItem(attachment))}
								</div>
							</div>
							{renderFootnote()}
						</div>
						{renderAudioAttachments()}
					</>
				);

			case 9:
				return renderGrid(visualMediaAttachments, styles.threeByThreeGrid);

			case 10:
				return (
					<>
						<div className={styles.mosaicContainerWrapper}>
							<div className={styles.mosaicContainer}>
								<div className={clsx(styles.oneByOneGrid, styles.oneByOneGridMosaic)}>
									{renderMosaicItem(visualMediaAttachments[0])}
								</div>
								<div className={styles.threeByThreeGrid}>
									{visualMediaAttachments.slice(1, 10).map((attachment) => renderMosaicItem(attachment))}
								</div>
							</div>
							{renderFootnote()}
						</div>
						{renderAudioAttachments()}
					</>
				);

			default:
				throw new Error('This should never happen');
		}
	},
);

export const AttachmentMosaic: FC<AttachmentMosaicProps> = AttachmentMosaicComponent;
