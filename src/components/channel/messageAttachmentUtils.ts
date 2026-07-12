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

import type {MessageAttachment} from '~/records/MessageRecord';
import {MessageAttachmentFlags} from '~/Constants';

const normalizeContentType = (contentType?: string): string => contentType?.toLowerCase() ?? '';

export const isImageType = (contentType?: string): boolean => normalizeContentType(contentType).startsWith('image/');

export const isVideoType = (contentType?: string): boolean => normalizeContentType(contentType).startsWith('video/');

export const isAudioType = (contentType?: string): boolean => normalizeContentType(contentType).startsWith('audio/');

export const isGifType = (contentType?: string): boolean => normalizeContentType(contentType) === 'image/gif';

const AUDIO_FILE_EXTENSION_RE = /\.(wav|waw|wave|mp3|m4a|aac|flac|opus|oga|ogg|amr|3gp|3gpp)(?:[?#].*)?$/i;
const AUDIO_WEBM_FILE_EXTENSION_RE = /\.webm(?:[?#].*)?$/i;
const VIDEO_FILE_EXTENSION_RE = /\.(mp4|m4v|mov|webm|ogv|mkv|avi)(?:[?#].*)?$/i;
const VOICE_LIKE_ATTACHMENT_RE = /(^|[-_\s.])(voice|voicemessage|voice-message|audio-message|audiomessage|recording|recorded-audio|ptt)([-_\s.]|$)/i;

const hasVideoFileExtension = (value?: string | null): boolean => !!value && VIDEO_FILE_EXTENSION_RE.test(value);

const hasAudioFileExtension = (value?: string | null): boolean => !!value && AUDIO_FILE_EXTENSION_RE.test(value);

const hasAudioWebmFileExtension = (value?: string | null): boolean => !!value && AUDIO_WEBM_FILE_EXTENSION_RE.test(value);

const hasVoiceLikeDescriptor = (attachment: MessageAttachment): boolean =>
	VOICE_LIKE_ATTACHMENT_RE.test(attachment.filename ?? '') ||
	VOICE_LIKE_ATTACHMENT_RE.test(attachment.title ?? '') ||
	VOICE_LIKE_ATTACHMENT_RE.test(attachment.description ?? '') ||
	VOICE_LIKE_ATTACHMENT_RE.test(attachment.url ?? '') ||
	VOICE_LIKE_ATTACHMENT_RE.test(attachment.proxy_url ?? '');

const hasVoiceMessageFlag = (flags: number): boolean =>
	(flags & MessageAttachmentFlags.IS_VOICE_MESSAGE) === MessageAttachmentFlags.IS_VOICE_MESSAGE;

export const isAudioAttachment = (attachment: MessageAttachment): boolean =>
	hasVoiceMessageFlag(attachment.flags) ||
	Boolean(attachment.waveform) ||
	isAudioType(attachment.content_type) ||
	hasAudioFileExtension(attachment.filename) ||
	hasAudioFileExtension(attachment.title) ||
	hasAudioFileExtension(attachment.url) ||
	hasAudioFileExtension(attachment.proxy_url) ||
	(hasVoiceLikeDescriptor(attachment) &&
		(hasAudioWebmFileExtension(attachment.filename) ||
			hasAudioWebmFileExtension(attachment.title) ||
			hasAudioWebmFileExtension(attachment.url) ||
			hasAudioWebmFileExtension(attachment.proxy_url) ||
			normalizeContentType(attachment.content_type) === 'video/webm' ||
			normalizeContentType(attachment.content_type) === 'application/octet-stream')) ||
	(normalizeContentType(attachment.content_type) === 'application/octet-stream' &&
		(hasAudioFileExtension(attachment.filename) ||
			hasAudioFileExtension(attachment.title) ||
			hasAudioFileExtension(attachment.url) ||
			hasAudioFileExtension(attachment.proxy_url)));

export const isVoiceLikeAttachment = (attachment: MessageAttachment): boolean =>
	hasVoiceMessageFlag(attachment.flags) || isAudioAttachment(attachment);

export const isVideoAttachment = (attachment: MessageAttachment): boolean =>
	!isAudioAttachment(attachment) &&
	(isVideoType(attachment.content_type) ||
		hasVideoFileExtension(attachment.filename) ||
		hasVideoFileExtension(attachment.title) ||
		hasVideoFileExtension(attachment.url) ||
		hasVideoFileExtension(attachment.proxy_url));

const hasDimensions = (attachment: MessageAttachment): boolean =>
	typeof attachment.width === 'number' && typeof attachment.height === 'number';

export const isMediaAttachment = (attachment: MessageAttachment): boolean =>
	isVideoAttachment(attachment) ||
	isAudioAttachment(attachment) ||
	(hasDimensions(attachment) && isImageType(attachment.content_type));

export function splitMediaAndFileAttachments(attachments: ReadonlyArray<MessageAttachment>): {
	mediaAttachments: Array<MessageAttachment>;
	fileAttachments: Array<MessageAttachment>;
} {
	const mediaAttachments: Array<MessageAttachment> = [];
	const fileAttachments: Array<MessageAttachment> = [];

	for (const attachment of attachments) {
		if (isMediaAttachment(attachment)) {
			mediaAttachments.push(attachment);
		} else {
			fileAttachments.push(attachment);
		}
	}

	return {mediaAttachments, fileAttachments};
}
