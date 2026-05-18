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
import * as RegexUtils from '~/utils/RegexUtils';

// The `(?<!\.)` lookbehind in front of each hostname is critical: it makes
// sure we do not match subdomains of the invite/web-app host. Without it,
// a URL like `https://music.astraof.com/track/288115399` would match
// `astraof.com/track/...` and incorrectly capture `track` as an invite code,
// producing a bogus "Unknown invite" embed. We only want the canonical host,
// not anything ending with `.astraof.com`.
const INVITE_PATTERN = new RegExp(
	[
		'(?:https?:\\/\\/)?',
		'(?:',
		`(?<!\\.)${RegexUtils.escapeRegex(Config.hosts.invite)}(?:\\/#)?\\/(?!invite\\/)([a-zA-Z0-9\\-]{2,32})(?![a-zA-Z0-9\\-])`,
		'|',
		`(?<!\\.)${RegexUtils.escapeRegex(new URL(Config.endpoints.webApp).hostname)}(?:\\/#)?\\/invite\\/([a-zA-Z0-9\\-]{2,32})(?![a-zA-Z0-9\\-])`,
		')',
	].join(''),
	'gi',
);

export function findInvites(content: string | null): Array<string> {
	if (!content) return [];

	const invites: Array<string> = [];
	const seenCodes = new Set<string>();

	INVITE_PATTERN.lastIndex = 0;

	let match: RegExpExecArray | null;
	while ((match = INVITE_PATTERN.exec(content)) !== null && invites.length < 10) {
		const code = match[1] || match[2];
		if (code && !seenCodes.has(code)) {
			seenCodes.add(code);
			invites.push(code);
		}
	}

	return invites;
}

export function findInvite(content: string | null): string | null {
	if (!content) return null;

	INVITE_PATTERN.lastIndex = 0;
	const match = INVITE_PATTERN.exec(content);

	if (match) {
		return match[1] || match[2];
	}

	return null;
}
