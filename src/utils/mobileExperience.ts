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

import MobileLayoutStore from '~/stores/MobileLayoutStore';

export const isMobileExperienceEnabled = (): boolean => {
	return MobileLayoutStore.platformMobileDetected || MobileLayoutStore.isMobileLayout();
};

export const isLowEndMobileExperience = (): boolean => {
	if (!isMobileExperienceEnabled() || typeof navigator === 'undefined') {
		return false;
	}

	const nav = navigator as Navigator & {
		connection?: {
			saveData?: boolean;
			effectiveType?: string;
		};
		deviceMemory?: number;
		hardwareConcurrency?: number;
	};

	if (nav.connection?.saveData) return true;
	if (nav.connection?.effectiveType === 'slow-2g' || nav.connection?.effectiveType === '2g') return true;
	if (typeof nav.deviceMemory === 'number' && nav.deviceMemory <= 3) return true;
	if (typeof nav.hardwareConcurrency === 'number' && nav.hardwareConcurrency <= 4) return true;
	return false;
};
