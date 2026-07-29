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

import {DateTime} from 'luxon';

export function formatDmListTimestamp(timestamp: number, locale?: string): string {
	const date = DateTime.fromMillis(timestamp);
	if (!date.isValid) {
		return '';
	}

	const now = DateTime.now();
	if (date.hasSame(now, 'day')) {
		return date.toFormat('HH:mm');
	}

	const dayDiff = now.startOf('day').diff(date.startOf('day'), 'days').days;
	if (dayDiff > 0 && dayDiff < 7) {
		return date
			.setLocale(locale || DateTime.local().locale)
			.toLocaleString({weekday: 'short'})
			.replace(/\.$/, '');
	}

	return date.toFormat('dd.MM.yyyy');
}

export function formatShortRelativeTime(timestamp: number): string {
	const date = DateTime.fromMillis(timestamp);
	const now = DateTime.now();
	const diff = now.diff(date);

	const minutes = diff.as('minutes');
	const hours = diff.as('hours');
	const days = diff.as('days');
	const weeks = diff.as('weeks');
	const months = diff.as('months');
	const years = diff.as('years');

	if (minutes < 1) {
		return '1m';
	}
	if (minutes < 60) {
		return `${Math.floor(minutes)}m`;
	}
	if (hours < 24) {
		return `${Math.floor(hours)}h`;
	}
	if (days < 7) {
		return `${Math.floor(days)}d`;
	}
	if (weeks < 4) {
		return `${Math.floor(weeks)}w`;
	}
	if (months < 12) {
		return `${Math.floor(months)}mo`;
	}
	return `${Math.floor(years)}y`;
}
