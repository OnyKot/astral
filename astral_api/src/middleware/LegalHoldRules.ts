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

export type LegalHoldAction = 'allow' | 'warn' | 'challenge' | 'block';

export interface CountryRuleSet {
	allow: Array<string>;
	warn: Array<string>;
	challenge: Array<string>;
	block: Array<string>;
}

export interface LegalHoldDecision {
	action: LegalHoldAction;
	countryCode: string | null;
	ruleId: string;
	reason: string;
}

function matchesCountry(list: Array<string>, countryCode: string | null): boolean {
	return !!countryCode && list.includes(countryCode.toUpperCase());
}

export function shouldBypassLegalHold(path: string, exemptPaths: Array<string>): boolean {
	return exemptPaths.some((prefix) => path === prefix || path.startsWith(prefix));
}

export function resolveLegalHoldDecision(
	countryCode: string | null,
	rules: CountryRuleSet,
	defaultAction: LegalHoldAction,
): LegalHoldDecision {
	const normalizedCountryCode = countryCode?.toUpperCase() ?? null;

	if (matchesCountry(rules.allow, normalizedCountryCode)) {
		return {
			action: 'allow',
			countryCode: normalizedCountryCode,
			ruleId: `country:allow:${normalizedCountryCode}`,
			reason: `Country ${normalizedCountryCode} is explicitly allowed by policy.`,
		};
	}

	if (matchesCountry(rules.block, normalizedCountryCode)) {
		return {
			action: 'block',
			countryCode: normalizedCountryCode,
			ruleId: `country:block:${normalizedCountryCode}`,
			reason: `Country ${normalizedCountryCode} is blocked by policy.`,
		};
	}

	if (matchesCountry(rules.challenge, normalizedCountryCode)) {
		return {
			action: 'challenge',
			countryCode: normalizedCountryCode,
			ruleId: `country:challenge:${normalizedCountryCode}`,
			reason: `Country ${normalizedCountryCode} requires additional verification by policy.`,
		};
	}

	if (matchesCountry(rules.warn, normalizedCountryCode)) {
		return {
			action: 'warn',
			countryCode: normalizedCountryCode,
			ruleId: `country:warn:${normalizedCountryCode}`,
			reason: `Country ${normalizedCountryCode} is under policy warning mode.`,
		};
	}

	return {
		action: defaultAction,
		countryCode: normalizedCountryCode,
		ruleId: 'default',
		reason: 'No country-specific legal hold rule matched.',
	};
}

export function prefersHtml(request: Request): boolean {
	const accept = request.headers.get('accept')?.toLowerCase() ?? '';
	return accept.includes('text/html');
}
