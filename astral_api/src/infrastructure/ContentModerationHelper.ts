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
import {InputValidationError} from '~/Errors';
import {Logger} from '~/Logger';
import type {IGrokService} from './IGrokService';

export async function moderateText(
	grokService: IGrokService,
	content: string,
	fieldName: string,
	options?: {minSeverity?: 'medium' | 'high'},
): Promise<void> {
	if (!Config.grok.moderationEnabled || !grokService.isEnabled() || !content.trim()) {
		return;
	}

	const minSeverity = options?.minSeverity ?? 'high';
	const moderation = await grokService.moderateContent(content);

	if (!moderation.flagged) return;

	if (minSeverity === 'high' && moderation.severity === 'high') {
		throw InputValidationError.create(fieldName, 'Content was flagged by our moderation system. Please revise it.');
	}

	if (minSeverity === 'medium' && (moderation.severity === 'high' || moderation.severity === 'medium')) {
		throw InputValidationError.create(fieldName, 'Content was flagged by our moderation system. Please revise it.');
	}
}

/*
 * Fire-and-forget moderation: runs in background without blocking the
 * caller. Used for message send where we want the message to go out
 * immediately for responsiveness, then have moderation clean up
 * asynchronously if the content is flagged.
 *
 * Returns immediately. The caller can pass an `onFlagged` callback
 * that executes post-hoc if the content is flagged (e.g. to delete
 * the already-sent message).
 */
export function moderateTextAsync(
	grokService: IGrokService,
	content: string,
	options: {
		minSeverity?: 'medium' | 'high';
		onFlagged?: (severity: string, reason: string | null) => void | Promise<void>;
	} = {},
): void {
	if (!Config.grok.moderationEnabled || !grokService.isEnabled() || !content.trim()) {
		return;
	}

	const minSeverity = options.minSeverity ?? 'high';
	void (async () => {
		try {
			const moderation = await grokService.moderateContent(content);
			if (!moderation.flagged) return;
			const triggers =
				(minSeverity === 'high' && moderation.severity === 'high') ||
				(minSeverity === 'medium' && (moderation.severity === 'high' || moderation.severity === 'medium'));
			if (!triggers) return;
			if (options.onFlagged) {
				await options.onFlagged(moderation.severity, moderation.reason);
			}
		} catch (err) {
			Logger.warn({err, contentLength: content.length}, 'Async moderation failed');
		}
	})();
}
