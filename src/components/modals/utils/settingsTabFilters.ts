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

import type {SettingsTab} from './settingsConstants';
import {getMatchedTabTypes, type SettingsSearchResult, searchSettings} from './settingsSearchIndex';

const HIDDEN_FOR_REGULAR_USERS_CATEGORIES = new Set<SettingsTab['category']>(['developer', 'staff_only']);

interface SettingsTabAccessOptions {
	isDeveloper: boolean;
	hasExpressionPackAccess?: boolean;
}

export interface FilteredSettingsResult {
	groupedTabs: Record<string, Array<SettingsTab>>;
	searchResults: Array<SettingsSearchResult>;
}

export const isSettingsTabVisible = (
	tab: SettingsTab,
	{isDeveloper, hasExpressionPackAccess = true}: SettingsTabAccessOptions,
): boolean => {
	if (!isDeveloper && HIDDEN_FOR_REGULAR_USERS_CATEGORIES.has(tab.category)) {
		return false;
	}

	if (!hasExpressionPackAccess && tab.type === 'expression_packs') {
		return false;
	}

	return true;
};

export const filterSettingsTabsByAccess = (
	tabs: ReadonlyArray<SettingsTab>,
	options: SettingsTabAccessOptions,
): Array<SettingsTab> => tabs.filter((tab) => isSettingsTabVisible(tab, options));

export const filterGroupedSettingsTabsByAccess = (
	groupedTabs: Record<string, Array<SettingsTab>>,
	options: SettingsTabAccessOptions,
): Record<string, Array<SettingsTab>> => {
	const filtered: Record<string, Array<SettingsTab>> = {};
	Object.entries(groupedTabs).forEach(([category, tabs]) => {
		const visibleTabs = filterSettingsTabsByAccess(tabs, options);
		if (visibleTabs.length > 0) {
			filtered[category] = visibleTabs;
		}
	});

	return filtered;
};

export const filterSettingsTabsForDeveloperMode = (
	groupedTabs: Record<string, Array<SettingsTab>>,
	isDeveloper: boolean,
) => filterGroupedSettingsTabsByAccess(groupedTabs, {isDeveloper});

export const filterSettingsTabsByQuery = (
	groupedTabs: Record<string, Array<SettingsTab>>,
	query: string,
): FilteredSettingsResult => {
	const trimmedQuery = query.trim();
	if (trimmedQuery.length === 0) {
		return {groupedTabs, searchResults: []};
	}

	const allTabs = Object.values(groupedTabs).flat();
	const searchResults = searchSettings(trimmedQuery, allTabs);
	const matchedTabTypes = getMatchedTabTypes(searchResults);

	const filtered: Record<string, Array<SettingsTab>> = {};

	Object.entries(groupedTabs).forEach(([category, tabs]) => {
		const matchedTabs = tabs.filter((tab) => matchedTabTypes.has(tab.type));

		if (matchedTabs.length > 0) {
			filtered[category] = matchedTabs;
		}
	});

	return {groupedTabs: filtered, searchResults};
};
