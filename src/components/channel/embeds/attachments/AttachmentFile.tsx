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
import {
	DownloadSimpleIcon,
	FileArchiveIcon,
	FileAudioIcon,
	FileCodeIcon,
	FileIcon,
	FileImageIcon,
	FilePdfIcon,
	FilePptIcon,
	FileTextIcon,
	FileVideoIcon,
	FileXlsIcon,
	TrashIcon,
	WarningCircleIcon,
} from '@phosphor-icons/react';
import {clsx} from 'clsx';
import {observer} from 'mobx-react-lite';
import {useEffect, useState} from 'react';
import * as ContextMenuActionCreators from '~/actions/ContextMenuActionCreators';
import * as MediaViewerActionCreators from '~/actions/MediaViewerActionCreators';
import {MessageAttachmentFlags} from '~/Constants';
import {splitFilename} from '~/components/channel/embeds/EmbedUtils';
import {ForwardedStoryCard} from '~/components/channel/ForwardedStoryCard';
import {useMaybeMessageViewContext} from '~/components/channel/MessageViewContext';
import {canDeleteAttachmentUtil} from '~/components/channel/messageActionUtils';
import {isGifType, isImageType, isVideoAttachment} from '~/components/channel/messageAttachmentUtils';
import {MediaContextMenu} from '~/components/uikit/ContextMenu/MediaContextMenu';
import {Tooltip} from '~/components/uikit/Tooltip/Tooltip';
import {useDeleteAttachment} from '~/hooks/useDeleteAttachment';
import type {MessageAttachment, MessageRecord} from '~/records/MessageRecord';
import MobileLayoutStore from '~/stores/MobileLayoutStore';
import attachmentFileStyles from '~/styles/AttachmentFile.module.css';
import messageStyles from '~/styles/Message.module.css';
import {downloadFile} from '~/utils/FileDownloadUtils';
import {formatFileSize} from '~/utils/FileUtils';
import {parseForwardedStoryPreview, type ForwardedStoryPreviewData} from '~/utils/StoryForwardPayload';

interface AttachmentFileProps {
	attachment: MessageAttachment;
	isPreview?: boolean;
	message?: MessageRecord;
}

export const AttachmentFile = observer(({attachment, message, isPreview}: AttachmentFileProps) => {
	const {t} = useLingui();
	const {enabled: isMobile} = MobileLayoutStore;
	const isExpired = Boolean(attachment.expired);
	const fileName = attachment.title || attachment.filename;
	const fileSize = formatFileSize(attachment.size);
	const fileExtension = fileName.split('.').pop()?.toLowerCase() || '';
	const [storyPreview, setStoryPreview] = useState<ForwardedStoryPreviewData | null>(null);
	const [checkedStoryPreview, setCheckedStoryPreview] = useState(false);

	const {name: fileNameWithoutExt, extension: fileExt} = splitFilename(fileName);

	const getFileTypeIcon = () => {
		const imageTypes = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'ico'];
		const textTypes = ['txt', 'rtf', 'md', 'log'];
		const archiveTypes = ['zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz'];
		const audioTypes = ['mp3', 'wav', 'ogg', 'flac', 'm4a', 'aac', 'wma'];
		const videoTypes = ['mp4', 'webm', 'mov', 'avi', 'mkv', 'flv', 'wmv'];
		const codeTypes = [
			'js',
			'jsx',
			'ts',
			'tsx',
			'py',
			'java',
			'c',
			'cpp',
			'h',
			'css',
			'html',
			'json',
			'xml',
			'yml',
			'yaml',
			'sh',
			'go',
			'rs',
			'rb',
			'php',
		];
		const excelTypes = ['xls', 'xlsx', 'csv'];
		const presentationTypes = ['ppt', 'pptx'];
		const documentTypes = ['doc', 'docx'];

		if (imageTypes.includes(fileExtension)) return <FileImageIcon size={32} />;
		if (fileExtension === 'pdf') return <FilePdfIcon size={32} />;
		if (textTypes.includes(fileExtension)) return <FileTextIcon size={32} />;
		if (documentTypes.includes(fileExtension)) return <FileTextIcon size={32} />;
		if (archiveTypes.includes(fileExtension)) return <FileArchiveIcon size={32} />;
		if (audioTypes.includes(fileExtension)) return <FileAudioIcon size={32} />;
		if (videoTypes.includes(fileExtension)) return <FileVideoIcon size={32} />;
		if (codeTypes.includes(fileExtension)) return <FileCodeIcon size={32} />;
		if (excelTypes.includes(fileExtension)) return <FileXlsIcon size={32} />;
		if (presentationTypes.includes(fileExtension)) return <FilePptIcon size={32} />;

		return <FileIcon size={32} />;
	};

	const imageFileExtensions = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'ico'];
	const isTextFile =
		(attachment.content_type ?? '').toLowerCase().startsWith('text/') ||
		['txt', 'md', 'markdown', 'log'].includes(fileExtension);
	const isImageFile = isImageType(attachment.content_type) || imageFileExtensions.includes(fileExtension);
	const isVideoFile = isVideoAttachment(attachment);
	const canOpenPreview = !isExpired && Boolean(attachment.url) && (isImageFile || isVideoFile);
	const mediaViewerType = isVideoFile
		? 'video'
		: (attachment.flags & MessageAttachmentFlags.IS_ANIMATED) !== 0 || isGifType(attachment.content_type) || fileExtension === 'gif'
			? 'gif'
			: 'image';

	const containerStyles: React.CSSProperties = isMobile
		? {
				display: 'grid',
				width: '100%',
				maxWidth: '100%',
				minWidth: 0,
			}
		: {
				display: 'grid',
				width: '400px',
				maxWidth: '400px',
			};

	const handleDownload = async (e: React.MouseEvent) => {
		e.preventDefault();
		e.stopPropagation();
		if (!attachment.url || isExpired) return;
		await downloadFile(attachment.url, 'file', fileName);
	};

	useEffect(() => {
		let cancelled = false;
		setStoryPreview(null);
		setCheckedStoryPreview(false);

		if (!isTextFile || !attachment.url || isExpired || attachment.size > 128 * 1024) {
			setCheckedStoryPreview(true);
			return () => {
				cancelled = true;
			};
		}

		fetch(attachment.url, {credentials: 'include'})
			.then((response) => (response.ok ? response.text() : ''))
			.then((text) => {
				if (cancelled) return;
				setStoryPreview(parseForwardedStoryPreview(text));
			})
			.catch(() => {
				if (!cancelled) setStoryPreview(null);
			})
			.finally(() => {
				if (!cancelled) setCheckedStoryPreview(true);
			});

		return () => {
			cancelled = true;
		};
	}, [attachment.size, attachment.url, isExpired, isTextFile]);

	const handleOpenPreview = (e: React.MouseEvent | React.KeyboardEvent) => {
		if (!canOpenPreview) return;
		if (e.type === 'keydown') {
			const keyEvent = e as React.KeyboardEvent;
			if (keyEvent.key !== 'Enter' && keyEvent.key !== ' ') return;
		}
		e.preventDefault();
		e.stopPropagation();
		MediaViewerActionCreators.openMediaViewer(
			[
				{
					src: attachment.proxy_url ?? attachment.url ?? '',
					originalSrc: attachment.url ?? '',
					naturalWidth: typeof attachment.width === 'number' ? attachment.width : isVideoFile ? 640 : 0,
					naturalHeight: typeof attachment.height === 'number' ? attachment.height : isVideoFile ? 360 : 0,
					type: mediaViewerType,
					contentHash: attachment.content_hash,
					attachmentId: attachment.id,
					filename: attachment.filename,
					fileSize: attachment.size,
					duration: attachment.duration,
					expiresAt: attachment.expires_at ?? null,
					expired: attachment.expired ?? false,
				},
			],
			0,
			{
				channelId: message?.channelId,
				messageId: message?.id,
				message,
			},
		);
	};

	const handleDelete = useDeleteAttachment(message, attachment.id);
	const canDelete = canDeleteAttachmentUtil(message) && !isMobile;
	const showDeleteButton = canDelete && !isPreview;
	const messageViewContext = useMaybeMessageViewContext();

	const handleContextMenu = (e: React.MouseEvent) => {
		if (!message || isPreview) return;
		e.preventDefault();
		e.stopPropagation();

		ContextMenuActionCreators.openFromEvent(e, ({onClose}) => (
			<MediaContextMenu
				message={message}
				originalSrc={attachment.url ?? ''}
				proxyURL={attachment.proxy_url ?? undefined}
				type="file"
				contentHash={attachment.content_hash}
				attachmentId={attachment.id}
				defaultName={attachment.filename}
				defaultAltText={attachment.filename}
				onClose={onClose}
				onDelete={isPreview ? () => {} : (messageViewContext?.handleDelete ?? (() => {}))}
			/>
		));
	};

	if (storyPreview) {
		return <ForwardedStoryCard preview={storyPreview} messageId={message?.id} channelId={message?.channelId} />;
	}

	if (isTextFile && !checkedStoryPreview && !isPreview) {
		return null;
	}

	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: context menu on container is intentional
		<div style={containerStyles} className={attachmentFileStyles.container} onContextMenu={handleContextMenu}>
			{showDeleteButton && (
				<button
					type="button"
					onClick={handleDelete}
					className={clsx(messageStyles.hoverAction, attachmentFileStyles.deleteButton)}
					aria-label={t`Delete attachment`}
				>
					<TrashIcon size={16} weight="bold" />
				</button>
			)}
			<div
				className={clsx(attachmentFileStyles.attachmentContainer, canOpenPreview && attachmentFileStyles.previewableContainer)}
				onClick={handleOpenPreview}
				onKeyDown={handleOpenPreview}
				role={canOpenPreview ? 'button' : undefined}
				tabIndex={canOpenPreview ? 0 : undefined}
				aria-label={canOpenPreview ? t`Open media in full view` : undefined}
			>
				<div className={attachmentFileStyles.iconContainer}>{getFileTypeIcon()}</div>
				<div className={attachmentFileStyles.fileInfoContainer}>
					<p className={attachmentFileStyles.fileName}>
						<span className={attachmentFileStyles.fileNameTruncate}>{fileNameWithoutExt}</span>
						<span className={attachmentFileStyles.fileExtension}>{fileExt}</span>
					</p>
					<p className={attachmentFileStyles.fileSize}>{fileSize}</p>
				</div>
				{isExpired ? (
					<Tooltip text={t`Attachment expired`}>
						<div className={clsx(attachmentFileStyles.downloadButton, attachmentFileStyles.downloadButtonDisabled)}>
							<WarningCircleIcon size={20} weight="bold" />
						</div>
					</Tooltip>
				) : (
					<button
						type="button"
						onClick={handleDownload}
						className={attachmentFileStyles.downloadButton}
						aria-label={t`Download`}
						disabled={!attachment.url}
					>
						<DownloadSimpleIcon size={20} weight="bold" />
					</button>
				)}
			</div>
		</div>
	);
});
