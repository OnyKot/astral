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

import {useCallback, useMemo, useState} from 'react';
import * as AuthenticationActionCreators from '~/actions/AuthenticationActionCreators';

export type DesktopHandoffMode = 'idle' | 'selecting' | 'login' | 'generating' | 'displaying' | 'error' | 'done';

type Options = {
	enabled: boolean;
	hasStoredAccounts: boolean;
	handoffCodeFromUrl?: string | null;
	initialMode?: DesktopHandoffMode;
};

function normalizeHandoffCode(raw: string): string {
	return raw.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
}

export function useDesktopHandoffFlow({enabled, hasStoredAccounts, handoffCodeFromUrl, initialMode}: Options) {
	const derivedInitial = useMemo<DesktopHandoffMode>(() => {
		if (!enabled) return 'idle';
		if (initialMode) return initialMode;
		return hasStoredAccounts ? 'selecting' : 'login';
	}, [enabled, hasStoredAccounts, initialMode]);

	const [mode, setMode] = useState<DesktopHandoffMode>(derivedInitial);
	const [code, setCode] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);

	const start = useCallback(
		async ({token, userId}: {token: string; userId: string}) => {
			if (!enabled) return;

			const rawCode = handoffCodeFromUrl?.trim() || '';
			const normalized = normalizeHandoffCode(rawCode);
			if (normalized.length !== 8) {
				setMode('error');
				setError('Missing handoff code from desktop. Open the browser link from the desktop app and try again.');
				return;
			}

			setMode('generating');
			setError(null);
			setCode(null);

			try {
				const formatted = `${normalized.slice(0, 4)}-${normalized.slice(4)}`;
				await AuthenticationActionCreators.completeDesktopHandoff({
					code: formatted,
					token,
					userId,
				});

				setCode(formatted);
				setMode('done');
			} catch (e) {
				setMode('error');
				setError(e instanceof Error ? e.message : String(e));
			}
		},
		[enabled, handoffCodeFromUrl],
	);

	const switchToLogin = useCallback(() => {
		setMode('login');
		setError(null);
	}, []);

	const retry = useCallback(() => {
		setError(null);
		setCode(null);
		setMode(hasStoredAccounts ? 'selecting' : 'login');
	}, [hasStoredAccounts]);

	return {
		mode,
		code,
		error,

		setMode,

		start,
		switchToLogin,
		retry,
	};
}
