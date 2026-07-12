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

import React from 'react';
import * as DraftActionCreators from '~/actions/DraftActionCreators';
import * as ReplaceCommandUtils from '~/utils/ReplaceCommandUtils';
import {TypingUtils} from '~/utils/TypingUtils';

interface UseTextareaDraftAndTypingOptions {
	channelId: string;
	value: string;
	setValue: React.Dispatch<React.SetStateAction<string>>;
	draft: string | null;
	previousValueRef: React.MutableRefObject<string>;
	isAutocompleteAttached: boolean;
	enabled: boolean;
}

export const useTextareaDraftAndTyping = ({
	channelId,
	value,
	setValue,
	draft,
	previousValueRef,
	isAutocompleteAttached,
	enabled,
}: UseTextareaDraftAndTypingOptions) => {
	const isRestoringDraftRef = React.useRef(false);
	const draftFlushTimeoutRef = React.useRef<number | null>(null);
	const pendingDraftRef = React.useRef<string | null>(null);
	const typingTimeoutRef = React.useRef<number | null>(null);
	const lastPersistedDraftRef = React.useRef<string | null>(draft ?? null);

	const clearDraftFlush = React.useCallback(() => {
		if (draftFlushTimeoutRef.current != null) {
			window.clearTimeout(draftFlushTimeoutRef.current);
			draftFlushTimeoutRef.current = null;
		}
	}, []);

	const flushDraft = React.useCallback(() => {
		clearDraftFlush();
		const nextDraft = pendingDraftRef.current;
		pendingDraftRef.current = null;

		if (nextDraft === lastPersistedDraftRef.current) {
			return;
		}

		if (nextDraft) {
			DraftActionCreators.createDraft(channelId, nextDraft);
		} else {
			DraftActionCreators.deleteDraft(channelId);
		}
		lastPersistedDraftRef.current = nextDraft;
	}, [channelId, clearDraftFlush]);

	React.useEffect(() => {
		if (!enabled) {
			TypingUtils.clear(channelId);
		}
	}, [channelId, enabled]);

	React.useLayoutEffect(() => {
		if (draft && previousValueRef.current !== undefined) {
			isRestoringDraftRef.current = true;
			setValue(draft);
			if (previousValueRef.current !== null) {
				previousValueRef.current = draft;
			}
			lastPersistedDraftRef.current = draft;
			setTimeout(() => {
				isRestoringDraftRef.current = false;
			}, 0);
		}
	}, [draft, previousValueRef, setValue]);

	React.useEffect(() => {
		if (isRestoringDraftRef.current) {
			return;
		}

		pendingDraftRef.current = value || null;
		clearDraftFlush();

		if (!value) {
			flushDraft();
			return;
		}

		draftFlushTimeoutRef.current = window.setTimeout(flushDraft, 220);

		return clearDraftFlush;
	}, [clearDraftFlush, flushDraft, value]);

	React.useEffect(() => flushDraft, [flushDraft]);

	React.useEffect(() => {
		if (typingTimeoutRef.current != null) {
			window.clearTimeout(typingTimeoutRef.current);
			typingTimeoutRef.current = null;
		}

		if (isRestoringDraftRef.current) {
			return;
		}
		if (!enabled) {
			TypingUtils.clear(channelId);
			return;
		}

		const content = value.trim();
		const isInReplaceMode = ReplaceCommandUtils.isReplaceCommand(content);
		const isSlashCommand = content.startsWith('/');
		if (content && !isAutocompleteAttached && !isInReplaceMode && !isSlashCommand) {
			typingTimeoutRef.current = window.setTimeout(() => {
				typingTimeoutRef.current = null;
				TypingUtils.typing(channelId);
			}, 120);
		} else {
			TypingUtils.clear(channelId);
		}

		return () => {
			if (typingTimeoutRef.current != null) {
				window.clearTimeout(typingTimeoutRef.current);
				typingTimeoutRef.current = null;
			}
		};
	}, [channelId, enabled, value, isAutocompleteAttached]);
};
