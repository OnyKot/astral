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
import React from 'react';
import * as ModalActionCreators from '~/actions/ModalActionCreators';
import {modal} from '~/actions/ModalActionCreators';
import type {PremiumWaitlistEntry} from '~/actions/PremiumActionCreators';
import * as PremiumActionCreators from '~/actions/PremiumActionCreators';
import * as ToastActionCreators from '~/actions/ToastActionCreators';
import {Logger} from '~/lib/Logger';
import {WaitlistJoinModal} from '../WaitlistJoinModal';

const logger = new Logger('useWaitlistActions');

export const useWaitlistActions = () => {
	const {t} = useLingui();
	const [entry, setEntry] = React.useState<PremiumWaitlistEntry | null>(null);
	const [loading, setLoading] = React.useState(false);

	React.useEffect(() => {
		let mounted = true;
		(async () => {
			try {
				const current = await PremiumActionCreators.fetchPremiumWaitlist();
				if (mounted) setEntry(current);
			} catch (error) {
				logger.error('Failed to load waitlist entry', error);
			}
		})();
		return () => {
			mounted = false;
		};
	}, []);

	const handleSelectWaitlistPlan = React.useCallback(
		(plan: 'monthly' | 'yearly' | 'visionary') => {
			ModalActionCreators.push(
				modal(() => (
					<WaitlistJoinModal
						plan={plan}
						initialComment={entry?.plan === plan ? (entry.comment ?? '') : ''}
						onJoined={(next) => {
							setEntry(next);
							ToastActionCreators.success(t`You're on the waitlist.`);
						}}
					/>
				)),
			);
		},
		[entry, t],
	);

	return {entry, loading, setLoading, handleSelectWaitlistPlan};
};
