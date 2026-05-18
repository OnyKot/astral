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

import {SuspiciousActivityFlags} from '~/Constants';

interface UserRequiredActionSource {
	phone: string | null;
	isBot: boolean;
	isSystem: boolean;
	suspiciousActivityFlags: number;
}

export const getEffectiveRequiredActionFlags = (user: UserRequiredActionSource): number => {
	const flags = user.suspiciousActivityFlags ?? 0;

	if (user.isBot || user.isSystem) {
		return flags;
	}

	return (
		flags &
		~(
			SuspiciousActivityFlags.REQUIRE_VERIFIED_PHONE |
			SuspiciousActivityFlags.REQUIRE_REVERIFIED_PHONE |
			SuspiciousActivityFlags.REQUIRE_VERIFIED_EMAIL_OR_VERIFIED_PHONE |
			SuspiciousActivityFlags.REQUIRE_REVERIFIED_EMAIL_OR_VERIFIED_PHONE |
			SuspiciousActivityFlags.REQUIRE_VERIFIED_EMAIL_OR_REVERIFIED_PHONE |
			SuspiciousActivityFlags.REQUIRE_REVERIFIED_EMAIL_OR_REVERIFIED_PHONE
		)
	);
};

export const getRequiredActionNames = (user: UserRequiredActionSource): Array<string> | null => {
	const flags = getEffectiveRequiredActionFlags(user);
	if (flags === 0) {
		return null;
	}

	const actions: Array<string> = [];
	for (const [key, value] of Object.entries(SuspiciousActivityFlags)) {
		if (flags & value) {
			actions.push(key);
		}
	}

	return actions.length > 0 ? actions : null;
};
