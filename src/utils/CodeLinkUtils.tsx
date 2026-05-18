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

import {isLinkWrappedInAngleBrackets} from '~/utils/linkSuppressionUtils';
import * as RegexUtils from '~/utils/RegexUtils';

export interface CodeLinkConfig {
	shortHost: string;
	path: string;
}

/*
 * Astral first-party paths that look like they could be invite or gift
 * codes when matched against the short-host pattern (e.g.
 * `astraof.com/admin`). Without this list, every visit to
 * https://astraof.com/admin or /marketing or /gifts triggered a
 * background `GET /api/v1/invites/admin` (and `/gifts/admin`) lookup
 * that 404'd and spammed the network panel. Stripped to lowercase
 * comparison so URL casing doesn't matter.
 */
const RESERVED_FIRST_PARTY_PATHS = new Set<string>([
	'admin',
	'api',
	'app',
	'blog',
	'channels',
	'connections',
	'dl',
	'docs',
	'download',
	'gifts',
	'guild-discovery',
	'help',
	'home',
	'invite',
	'invites',
	'login',
	'logout',
	'marketing',
	'me',
	'oauth',
	'oauth2',
	'pages',
	'partners',
	'press',
	'privacy',
	'register',
	'reset',
	'safety',
	'settings',
	'sso',
	'static',
	'status',
	'store',
	'terms',
	'tos',
	'verify',
]);

function isReservedCode(code: string | null | undefined): boolean {
	if (!code) return false;
	return RESERVED_FIRST_PARTY_PATHS.has(code.toLowerCase());
}

const patternCache = new Map<string, RegExp>();

function createPattern(config: CodeLinkConfig): RegExp {
	const cacheKey = `${config.shortHost}:${config.path}`;

	let pattern = patternCache.get(cacheKey);
	if (pattern) {
		return pattern;
	}

	// The `(?<!\.)` lookbehind in front of each hostname is critical: it makes
	// sure we do not match subdomains of the short host or the current web-app
	// host. Without it, a URL like `https://music.astraof.com/track/288115399`
	// would match `astraof.com/track/...` and capture `track` as an invite or
	// gift code, producing bogus "Unknown invite" / "Unknown gift" embeds.
	pattern = new RegExp(
		[
			'(?:https?:\\/\\/)?',
			'(?:',
			`(?<!\\.)${RegexUtils.escapeRegex(config.shortHost)}(?:\\/#)?\\/(?!${config.path}\\/)([a-zA-Z0-9\\-]{2,32})(?![a-zA-Z0-9\\-])`,
			'|',
			`(?<!\\.)${RegexUtils.escapeRegex(location.host)}(?:\\/#)?\\/${config.path}\\/([a-zA-Z0-9\\-]{2,32})(?![a-zA-Z0-9\\-])`,
			')',
		].join(''),
		'gi',
	);

	patternCache.set(cacheKey, pattern);
	return pattern;
}

export function findCodes(content: string | null, config: CodeLinkConfig): Array<string> {
	if (!content) return [];

	const codes: Array<string> = [];
	const seenCodes = new Set<string>();
	const pattern = createPattern(config);

	pattern.lastIndex = 0;

	let match: RegExpExecArray | null;
	while ((match = pattern.exec(content)) !== null && codes.length < 10) {
		const matchedText = match[0];
		if (isLinkWrappedInAngleBrackets(content, match.index ?? 0, matchedText.length)) {
			continue;
		}
		const code = match[1] || match[2];
		if (code && !seenCodes.has(code) && !isReservedCode(code)) {
			seenCodes.add(code);
			codes.push(code);
		}
	}

	return codes;
}

export function findCode(content: string | null, config: CodeLinkConfig): string | null {
	if (!content) return null;

	const pattern = createPattern(config);
	pattern.lastIndex = 0;
	let match: RegExpExecArray | null;
	while ((match = pattern.exec(content)) !== null) {
		const matchedText = match[0];
		if (isLinkWrappedInAngleBrackets(content, match.index ?? 0, matchedText.length)) {
			continue;
		}

		const code = match[1] || match[2];
		if (code && !isReservedCode(code)) {
			return code;
		}
	}

	return null;
}
