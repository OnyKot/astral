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
import {TrashIcon} from '@phosphor-icons/react';
import {clsx} from 'clsx';
import {observer} from 'mobx-react-lite';
import {type FC, useCallback} from 'react';
import * as ContextMenuActionCreators from '~/actions/ContextMenuActionCreators';
import {deriveDefaultNameFromMessage} from '~/components/channel/embeds/EmbedUtils';
import {getMediaButtonVisibility} from '~/components/channel/embeds/media/MediaButtonUtils';
import type {BaseMediaProps} from '~/components/channel/embeds/media/MediaTypes';
import {InlineAudioPlayer} from '~/components/media-player/components/InlineAudioPlayer';
import {MediaContextMenu} from '~/components/uikit/ContextMenu/MediaContextMenu';
import {Tooltip} from '~/components/uikit/Tooltip/Tooltip';
import {useDeleteAttachment} from '~/hooks/useDeleteAttachment';
import {useMediaFavorite} from '~/hooks/useMediaFavorite';
import type {MessageAttachment} from '~/records/MessageRecord';
import MobileLayoutStore from '~/stores/MobileLayoutStore';
import messageStyles from '~/styles/Message.module.css';
import {createSaveHandler} from '~/utils/FileDownloadUtils';
import {buildMediaProxyURL} from '~/utils/MediaProxyUtils';
import styles from './EmbedAudio.module.css';

type EmbedAudioProps = BaseMediaProps & {
	src: string;
	title?: string;
	duration?: number;
	waveform?: string;
	embedUrl?: string;
	fileSize?: number;
	mediaAttachments?: ReadonlyArray<MessageAttachment>;
	isPreview?: boolean;
	isVoiceMessage?: boolean;
};

const EmbedAudio: FC<EmbedAudioProps> = observer(
	({
		src,
		title,
		duration: apiDuration,
		waveform,
		embedUrl,
		channelId,
		messageId,
		attachmentId,
		embedIndex,
		message,
		contentHash,
		onDelete,
		fileSize,
		isPreview,
		isVoiceMessage = false,
	}) => {
		const {t} = useLingui();
		const effectiveSrc = buildMediaProxyURL(src);
		const {enabled: isMobile} = MobileLayoutStore;

		const defaultName =
			title || deriveDefaultNameFromMessage({message, attachmentId, embedIndex, url: embedUrl || src, proxyUrl: src});
		const messageAuthorName = message?.author.globalName || message?.author.username || null;

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

		const handleContextMenu = useCallback(
			(e: React.MouseEvent) => {
				if (!message || isPreview) return;

				e.preventDefault();
				e.stopPropagation();

				ContextMenuActionCreators.openFromEvent(e, ({onClose}) => (
					<MediaContextMenu
						message={message}
						originalSrc={src}
						type="audio"
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

		const handleDownload = (e: React.MouseEvent) => {
			e.preventDefault();
			e.stopPropagation();
			createSaveHandler(src, 'audio')();
		};

		const handleDeleteClick = useDeleteAttachment(message, attachmentId);

		const containerStyles: React.CSSProperties = isMobile
			? {
					display: 'grid',
					width: '100%',
					maxWidth: '100%',
					minWidth: 0,
				}
			: {
					display: 'grid',
					width: isVoiceMessage ? '360px' : '400px',
					maxWidth: isVoiceMessage ? 'min(100%, 360px)' : '400px',
				};

		const {showDeleteButton, showDownloadButton} = getMediaButtonVisibility(
			canFavorite,
			isPreview ? undefined : message,
			attachmentId,
			{disableDelete: !!isPreview},
		);

		if (isMobile) {
			return (
				<div style={containerStyles} className={clsx(styles.container, isVoiceMessage && styles.voiceMobileContainer)}>
					<InlineAudioPlayer
						src={effectiveSrc}
						title={defaultName}
						fileSize={fileSize}
						duration={apiDuration}
						waveform={waveform}
						isFavorited={isFavorited}
						canFavorite={canFavorite}
						onFavoriteClick={handleFavoriteClick}
						onDownloadClick={showDownloadButton ? handleDownload : undefined}
						onContextMenu={handleContextMenu}
						isVoiceMessage={isVoiceMessage}
						enableVoicePlaybackBanner={!isPreview}
						channelId={channelId}
						messageId={messageId}
						attachmentId={attachmentId}
						messageAuthorName={messageAuthorName}
					/>
				</div>
			);
		}

		return (
			<div style={containerStyles} className={styles.container}>
				{showDeleteButton && (
					<Tooltip text={t`Delete`} position="top">
						<button
							type="button"
							onClick={handleDeleteClick}
							className={clsx(messageStyles.hoverAction, styles.deleteButton)}
							aria-label={t`Delete attachment`}
						>
							<TrashIcon size={16} weight="bold" />
						</button>
					</Tooltip>
				)}
				<InlineAudioPlayer
					src={effectiveSrc}
					title={defaultName}
					fileSize={fileSize}
					duration={apiDuration}
					waveform={waveform}
					isFavorited={isFavorited}
					canFavorite={canFavorite}
					onFavoriteClick={handleFavoriteClick}
					onDownloadClick={showDownloadButton ? handleDownload : undefined}
					onContextMenu={handleContextMenu}
					isVoiceMessage={isVoiceMessage}
					enableVoicePlaybackBanner={!isPreview}
					channelId={channelId}
					messageId={messageId}
					attachmentId={attachmentId}
					messageAuthorName={messageAuthorName}
				/>
			</div>
		);
	},
);

export default EmbedAudio;
