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
import * as ModalActionCreators from '~/actions/ModalActionCreators';
import {modal} from '~/actions/ModalActionCreators';
import {WhatsNewModal} from '~/components/modals/WhatsNewModal';
import {Logger} from '~/lib/Logger';

const SEEN_KEY = 'astral:whats_new:seen_sha';
const logger = new Logger('WhatsNewGate');

/**
 * Shows the release notes once per deployed build.
 *
 * Renders nothing — it exists only to open the modal after login. The notes come from
 * version.json, which the deploy regenerates from scripts/cicd/release-policy.json, so shipping a
 * new changelog needs no client change. Keyed by sha rather than version string so a hotfix that
 * keeps the same version number still gets its own notice.
 *
 * First-ever visit is deliberately silent: a brand new account has nothing to catch up on, so we
 * record the current sha without showing anything.
 */
export const WhatsNewGate: React.FC = () => {
	React.useEffect(() => {
		let cancelled = false;

		const run = async () => {
			try {
				const response = await fetch('/version.json', {cache: 'no-store'});
				if (!response.ok) return;

				const data = (await response.json()) as {sha?: string; notes?: string};
				const sha = data.sha;
				const notes = data.notes;
				if (cancelled || !sha || !notes?.trim()) return;

				const seen = localStorage.getItem(SEEN_KEY);
				localStorage.setItem(SEEN_KEY, sha);
				if (seen === null || seen === sha) return;

				ModalActionCreators.push(modal(() => <WhatsNewModal notes={notes} />));
			} catch (error) {
				// Never let a missing or malformed version.json break the app shell.
				logger.debug('Skipped release notes', error);
			}
		};

		// Let the client settle before interrupting with a modal.
		const timer = window.setTimeout(run, 2500);
		return () => {
			cancelled = true;
			window.clearTimeout(timer);
		};
	}, []);

	return null;
};
