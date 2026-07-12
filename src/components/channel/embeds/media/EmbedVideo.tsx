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

import {observer} from 'mobx-react-lite';
import type {FC} from 'react';
import {useCallback} from 'react';
import {thumbHashToDataURL} from 'thumbhash';
import * as ContextMenuActionCreators from '~/actions/ContextMenuActionCreators';
import * as MediaViewerActionCreators from '~/actions/MediaViewerActionCreators';
import {MessageAttachmentFlags} from '~/Constants';
import {deriveDefaultNameFromMessage} from '~/components/channel/embeds/EmbedUtils';
import {getMediaButtonVisibility} from '~/components/channel/embeds/media/MediaButtonUtils';
import {MediaContainer} from '~/components/channel/embeds/media/MediaContainer';
import type {BaseMediaProps} from '~/components/channel/embeds/media/MediaTypes';
import {NSFWBlurOverlay} from '~/components/channel/embeds/NSFWBlurOverlay';
import {VideoPlayer} from '~/components/media-player/components/VideoPlayer';
import {isAudioAttachment, isGifType, isVideoAttachment} from '~/components/channel/messageAttachmentUtils';
import {MediaContextMenu} from '~/components/uikit/ContextMenu/MediaContextMenu';
import {useDeleteAttachment} from '~/hooks/useDeleteAttachment';
import {useMediaFavorite} from '~/hooks/useMediaFavorite';
import {useNSFWMedia} from '~/hooks/useNSFWMedia';
import type {MessageAttachment} from '~/records/MessageRecord';
import MobileLayoutStore from '~/stores/MobileLayoutStore';
import {createCalculator} from '~/utils/DimensionUtils';
import {createSaveHandler} from '~/utils/FileDownloadUtils';
import {buildMediaProxyURL} from '~/utils/MediaProxyUtils';
import styles from './EmbedVideo.module.css';

const VIDEO_CONFIG = {
	MAX_WIDTH: 400,
} as const;

const videoCalculator = createCalculator({
	maxWidth: VIDEO_CONFIG.MAX_WIDTH,
	responsive: true,
});

const getMediaViewerType = (attachment: MessageAttachment): 'image' | 'gif' | 'gifv' | 'video' | 'audio' => {
	if (isAudioAttachment(attachment)) return 'audio';
	if (isVideoAttachment(attachment)) return 'video';
	if ((attachment.flags & MessageAttachmentFlags.IS_ANIMATED) !== 0 || isGifType(attachment.content_type)) return 'gif';
	return 'image';
};

const getMediaViewerDimensions = (attachment: MessageAttachment): {naturalWidth: number; naturalHeight: number} => {
	if (typeof attachment.width === 'number' && typeof attachment.height === 'number') {
		return {naturalWidth: attachment.width, naturalHeight: attachment.height};
	}
	return isVideoAttachment(attachment)
		? {naturalWidth: 640, naturalHeight: 360}
		: {naturalWidth: 0, naturalHeight: 0};
};

type EmbedVideoProps = BaseMediaProps & {
	src: string;
	width: number;
	height: number;
	placeholder?: string;
	title?: string;
	duration?: number;
	embedUrl?: string;
	fillContainer?: boolean;
	mediaAttachments?: ReadonlyArray<MessageAttachment>;
	isPreview?: boolean;
};

const EmbedVideo: FC<EmbedVideoProps> = observer(
	({
		src,
		width,
		height,
		placeholder,
		title,
		duration,
		nsfw,
		channelId,
		messageId,
		attachmentId,
		embedIndex,
		embedUrl,
		message,
		contentHash,
		onDelete,
		fillContainer = false,
		mediaAttachments = [],
		isPreview,
	}) => {
		const {enabled: isMobile} = MobileLayoutStore;
		const effectiveSrc = buildMediaProxyURL(src);
		const isBlob = src.startsWith('blob:');
		const posterSrc = isBlob ? null : buildMediaProxyURL(src, {format: 'webp'});

		const {shouldBlur, gateReason} = useNSFWMedia(nsfw, channelId);

		const defaultName =
			title || deriveDefaultNameFromMessage({message, attachmentId, embedIndex, url: embedUrl || src, proxyUrl: src});

		const {
			isFavorited,
			toggleFavorite: handleFavoriteClick,
			canFavorite,
		} = useMediaFavorite({
			channelId,
			messageId,
			attachmentId,
			embedIndex,
			defaultName,
			contentHash,
		});

		const handleDownloadClick = useCallback(
			(e: React.MouseEvent) => {
				e.stopPropagation();
				createSaveHandler(src, 'video')();
			},
			[src],
		);

		const handleOpenPreview = useCallback(
			(e: React.MouseEvent) => {
				e.preventDefault();
				e.stopPropagation();

				if (mediaAttachments.length > 0) {
					const currentIndex = mediaAttachments.findIndex((attachment) => attachment.id === attachmentId);
					const items = mediaAttachments.map((attachment) => {
						const {naturalWidth, naturalHeight} = getMediaViewerDimensions(attachment);
						return {
							src: attachment.proxy_url ?? attachment.url ?? '',
							originalSrc: attachment.url ?? '',
							naturalWidth,
							naturalHeight,
							type: getMediaViewerType(attachment),
							contentHash: attachment.content_hash,
							attachmentId: attachment.id,
							filename: attachment.filename,
							fileSize: attachment.size,
							duration: attachment.duration,
							expiresAt: attachment.expires_at ?? null,
							expired: attachment.expired ?? false,
						};
					});

					MediaViewerActionCreators.openMediaViewer(items, Math.max(0, currentIndex), {
						channelId,
						messageId,
						message,
					});
					return;
				}

				MediaViewerActionCreators.openMediaViewer(
					[
						{
							src,
							originalSrc: embedUrl || src,
							naturalWidth: width,
							naturalHeight: height,
							type: 'video',
							contentHash,
							attachmentId,
							embedIndex,
							filename: title,
							duration,
						},
					],
					0,
					{
						channelId,
						messageId,
						message,
					},
				);
			},
			[
				attachmentId,
				channelId,
				contentHash,
				duration,
				embedIndex,
				embedUrl,
				height,
				mediaAttachments,
				message,
				messageId,
				src,
				title,
				width,
			],
		);

		const handleDeleteClick = useDeleteAttachment(message, attachmentId);

		const handleContextMenu = useCallback(
			(e: React.MouseEvent) => {
				if (!message || isPreview) return;

				e.preventDefault();
				e.stopPropagation();

				ContextMenuActionCreators.openFromEvent(e, ({onClose}) => (
					<MediaContextMenu
						message={message}
						originalSrc={src}
						type="video"
						contentHash={contentHash}
						attachmentId={attachmentId}
						defaultName={defaultName}
						onClose={onClose}
						onDelete={onDelete || (() => {})}
					/>
				));
			},
			[message, src, contentHash, attachmentId, defaultName, onDelete, isPreview],
		);

		const thumbHashUrl = placeholder
			? thumbHashToDataURL(Uint8Array.from(atob(placeholder), (c) => c.charCodeAt(0)))
			: undefined;

		const {dimensions} = useCallback(() => {
			return videoCalculator.calculate({width, height}, {responsive: true});
		}, [width, height])();

		const aspectRatio = `${dimensions.width} / ${dimensions.height}`;

		const containerStyles: React.CSSProperties = isMobile
			? {
					aspectRatio,
					width: '100%',
					maxWidth: '100%',
				}
			: fillContainer
				? {
						width: '100%',
						height: '100%',
					}
				: {
						width: dimensions.width,
						maxWidth: '100%',
						aspectRatio,
					};

		if (shouldBlur) {
			return (
				<div className={styles.blurContainer}>
					<div className={styles.blurContent} style={containerStyles}>
						<div className={styles.blurInner}>
							{thumbHashUrl && (
								<img src={thumbHashUrl} alt="" className={styles.blurThumbnail} style={{filter: 'blur(40px)'}} />
							)}
						</div>
					</div>
					<NSFWBlurOverlay reason={gateReason} />
				</div>
			);
		}

		const {showFavoriteButton, showDownloadButton, showDeleteButton} = getMediaButtonVisibility(
			canFavorite,
			isPreview ? undefined : message,
			attachmentId,
			{disableDelete: !!isPreview},
		);

		if (isMobile) {
			return (
				<MediaContainer
					className={styles.mediaContainer}
					style={containerStyles}
					showFavoriteButton={showFavoriteButton}
					isFavorited={isFavorited}
					onFavoriteClick={handleFavoriteClick}
					showOpenButton={true}
					onOpenClick={handleOpenPreview}
					showDownloadButton={showDownloadButton}
					onDownloadClick={handleDownloadClick}
					showDeleteButton={showDeleteButton}
					onDeleteClick={handleDeleteClick}
					onContextMenu={handleContextMenu}
					renderedWidth={dimensions.width}
					renderedHeight={dimensions.height}
				>
					<div className={styles.mobileContainer}>
						<VideoPlayer
							src={effectiveSrc}
							poster={posterSrc || undefined}
							placeholder={placeholder}
							duration={duration}
							width={dimensions.width}
							height={dimensions.height}
							preload="metadata"
							loadBeforePlay={true}
							isMobile={true}
							className={styles.videoPlayerBlock}
						/>
					</div>
				</MediaContainer>
			);
		}

		return (
			<MediaContainer
				className={styles.mediaContainer}
				style={containerStyles}
				showFavoriteButton={showFavoriteButton}
				isFavorited={isFavorited}
				onFavoriteClick={handleFavoriteClick}
				showOpenButton={true}
				onOpenClick={handleOpenPreview}
				showDownloadButton={showDownloadButton}
				onDownloadClick={handleDownloadClick}
				showDeleteButton={showDeleteButton}
				onDeleteClick={handleDeleteClick}
				onContextMenu={handleContextMenu}
				renderedWidth={dimensions.width}
				renderedHeight={dimensions.height}
			>
				<VideoPlayer
					src={effectiveSrc}
					poster={posterSrc || undefined}
					placeholder={placeholder}
					duration={duration}
					width={dimensions.width}
					height={dimensions.height}
					fillContainer={fillContainer}
					className={fillContainer ? styles.videoPlayerFill : styles.videoPlayerBlock}
				/>
			</MediaContainer>
		);
	},
);

export default EmbedVideo;
