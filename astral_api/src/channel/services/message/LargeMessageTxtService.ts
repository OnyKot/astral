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

import {Config} from '~/Config';
import {
	MAX_MESSAGE_LENGTH_NON_PREMIUM,
	MAX_MESSAGE_LENGTH_PREMIUM,
	MAX_TXT_MESSAGE_BYTES,
	TXT_MESSAGE_CONTENT_TYPE,
	TXT_MESSAGE_FILENAME,
	TXT_MESSAGE_PREFIX_LENGTH,
} from '~/Constants';
import type {AttachmentToProcess} from '~/channel/AttachmentDTOs';
import type {IStorageService} from '~/infrastructure/IStorageService';
import type {User} from '~/Models';

export interface TxtConversionResult {
	/*
	 * Replacement in-message content: a short prefix of the original text
	 * plus a note that the full text was attached as a TXT file. Always
	 * within the user's normal message length limit.
	 */
	content: string;
	/*
	 * The TXT attachment expressed as an AttachmentToProcess so it flows
	 * through the existing attachment pipeline (virus scan, CDN copy,
	 * metadata). The id is chosen by the caller to avoid collisions with
	 * any client-supplied attachment ids.
	 */
	attachment: AttachmentToProcess;
	/*
	 * True when the original content exceeded MAX_TXT_MESSAGE_BYTES and
	 * was truncated before being written to the file.
	 */
	truncated: boolean;
}

export class LargeMessageTxtService {
	constructor(private storageService: IStorageService) {}

	/*
	 * Returns the user's effective max in-message content length. With
	 * FREE_PREMIUM / self-hosted, every user is premium.
	 */
	private maxLengthFor(user: User | null): number {
		return user?.isPremium() ? MAX_MESSAGE_LENGTH_PREMIUM : MAX_MESSAGE_LENGTH_NON_PREMIUM;
	}

	/*
	 * True when `content` exceeds the user's in-message limit and should
	 * be converted to a TXT attachment instead of being rejected.
	 */
	shouldConvert(content: string | null | undefined, user: User | null): boolean {
		if (content == null) return false;
		return content.length > this.maxLengthFor(user);
	}

	async convert({
		content,
		user,
		attachmentId,
	}: {
		content: string;
		user: User | null;
		attachmentId: number;
	}): Promise<TxtConversionResult> {
		const maxLength = this.maxLengthFor(user);

		// Encode the full content as UTF-8 and cap at MAX_TXT_MESSAGE_BYTES
		// so a single message cannot exhaust server memory/disk. Truncate on
		// a UTF-8 boundary to avoid producing invalid byte sequences.
		const fullBytes = Buffer.from(content, 'utf8');
		let bodyBytes = fullBytes;
		let truncated = false;
		if (bodyBytes.length > MAX_TXT_MESSAGE_BYTES) {
			truncated = true;
			bodyBytes = bodyBytes.subarray(0, MAX_TXT_MESSAGE_BYTES);
			// Walk back to the last UTF-8 lead byte so we don't cut a
			// multi-byte sequence in half.
			let cut = bodyBytes.length;
			while (cut > 0 && (bodyBytes[cut - 1] & 0xc0) === 0x80) cut--;
			if (cut > 0 && (bodyBytes[cut - 1] & 0xe0) === 0xc0) cut--; // 2-byte lead
			if (cut > 0 && (bodyBytes[cut - 1] & 0xf0) === 0xe0) cut--; // 3-byte lead
			if (cut > 0 && (bodyBytes[cut - 1] & 0xf8) === 0xf0) cut--; // 4-byte lead
			bodyBytes = bodyBytes.subarray(0, cut);
		}

		const uploadKey = crypto.randomUUID();
		await this.storageService.uploadObject({
			bucket: Config.s3.buckets.uploads,
			key: uploadKey,
			body: new Uint8Array(bodyBytes),
			contentType: TXT_MESSAGE_CONTENT_TYPE,
		});

		// In-message content: a prefix of the original text plus a note.
		// Keep the prefix well under the limit so the appended note fits.
		const prefixBudget = Math.min(TXT_MESSAGE_PREFIX_LENGTH, maxLength - 80);
		let prefix = content.slice(0, Math.max(0, prefixBudget)).trim();
		if (content.length > prefix.length + 1) {
			prefix = `${prefix}…`;
		}
		const note = truncated
			? `\n\n*(полный текст (${content.length} символов) превышает лимит файла — прикреплён частично как ${TXT_MESSAGE_FILENAME})*`
			: `\n\n*(полный текст (${content.length} символов) прикреплён как ${TXT_MESSAGE_FILENAME})*`;
		const replacementContent = `${prefix}${note}`;

		const attachment: AttachmentToProcess = {
			id: attachmentId,
			filename: TXT_MESSAGE_FILENAME,
			upload_filename: uploadKey,
			title: null,
			description: null,
			flags: 0,
			file_size: bodyBytes.length,
			content_type: TXT_MESSAGE_CONTENT_TYPE,
		};

		return {content: replacementContent, attachment, truncated};
	}
}
