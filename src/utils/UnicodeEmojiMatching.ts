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

import UnicodeEmojis from '~/lib/UnicodeEmojis';
import * as RegexUtils from '~/utils/RegexUtils';

const VARIATION_SELECTOR_16 = '\uFE0F';
const VARIATION_SELECTOR_16_RE = /\uFE0F/g;

function stripVariationSelector(value: string): string {
	return value.replace(VARIATION_SELECTOR_16_RE, '');
}

function addSingleCodePointVariationSelector(value: string): string {
	if (!value || value.includes('\u200D') || value.includes(VARIATION_SELECTOR_16)) {
		return value;
	}

	const chars = Array.from(value);
	if (chars.length !== 1) {
		return value;
	}

	return `${value}${VARIATION_SELECTOR_16}`;
}

const VARIANT_TO_CANONICAL_SURROGATE = (() => {
	const canonicalSurrogates = Array.from(new Set(UnicodeEmojis.all().map((emoji) => emoji.surrogates)));
	const map = new Map<string, string>();

	const registerVariant = (variant: string, canonicalSurrogate: string) => {
		if (!variant) {
			return;
		}

		const existingCanonical = map.get(variant);
		if (existingCanonical) {
			const existingHasVariation = existingCanonical.includes(VARIATION_SELECTOR_16);
			const candidateHasVariation = canonicalSurrogate.includes(VARIATION_SELECTOR_16);
			if (existingHasVariation && !candidateHasVariation) {
				return;
			}
			if (existingHasVariation === candidateHasVariation && existingCanonical.length >= canonicalSurrogate.length) {
				return;
			}
		}

		map.set(variant, canonicalSurrogate);
	};

	for (const surrogate of canonicalSurrogates) {
		registerVariant(surrogate, surrogate);

		const stripped = stripVariationSelector(surrogate);
		registerVariant(stripped, surrogate);
		registerVariant(addSingleCodePointVariationSelector(stripped), surrogate);
	}

	return map;
})();

const UNICODE_EMOJI_VARIANTS = Array.from(VARIANT_TO_CANONICAL_SURROGATE.keys()).sort((a, b) => b.length - a.length);

export const UNICODE_EMOJI_SURROGATE_RE =
	UNICODE_EMOJI_VARIANTS.length > 0
		? new RegExp(`(${UNICODE_EMOJI_VARIANTS.map(RegexUtils.escapeRegex).join('|')})`, 'g')
		: null;

export function getCanonicalUnicodeEmojiSurrogate(surrogate: string): string | null {
	if (!surrogate) {
		return null;
	}

	const direct = VARIANT_TO_CANONICAL_SURROGATE.get(surrogate);
	if (direct) {
		return direct;
	}

	return VARIANT_TO_CANONICAL_SURROGATE.get(stripVariationSelector(surrogate)) ?? null;
}

export function convertUnicodeSurrogateToName(
	surrogate: string,
	includeColons = true,
	defaultName = '',
): string {
	if (!surrogate) {
		return defaultName;
	}

	const canonicalSurrogate = getCanonicalUnicodeEmojiSurrogate(surrogate) ?? surrogate;
	const fromCanonical = UnicodeEmojis.convertSurrogateToName(canonicalSurrogate, includeColons, '');
	if (fromCanonical) {
		return fromCanonical;
	}

	return UnicodeEmojis.convertSurrogateToName(surrogate, includeColons, defaultName);
}

