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
import * as PremiumActionCreators from '~/actions/PremiumActionCreators';
import type {ReferralProgramSummary} from '~/actions/PremiumActionCreators';
import {Logger} from '~/lib/Logger';

const logger = new Logger('useReferralProgram');

export const useReferralProgram = () => {
	const [summary, setSummary] = React.useState<ReferralProgramSummary | null>(null);
	const [loading, setLoading] = React.useState(true);
	const [error, setError] = React.useState<string | null>(null);

	React.useEffect(() => {
		let mounted = true;

		void (async () => {
			try {
				setLoading(true);
				setError(null);
				const next = await PremiumActionCreators.fetchReferralProgramSummary();
				if (mounted) {
					setSummary(next);
				}
			} catch (err) {
				logger.error('Failed to load referral program summary', err);
				if (mounted) {
					setError('Не удалось загрузить реферальную программу.');
				}
			} finally {
				if (mounted) {
					setLoading(false);
				}
			}
		})();

		return () => {
			mounted = false;
		};
	}, []);

	return {summary, loading, error};
};
