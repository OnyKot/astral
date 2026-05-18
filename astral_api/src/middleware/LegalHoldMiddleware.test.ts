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

import {describe, expect, it} from 'vitest';
import {prefersHtml, resolveLegalHoldDecision, shouldBypassLegalHold} from './LegalHoldRules';

describe('LegalHoldMiddleware helpers', () => {
	it('resolves explicit allow before restrictive rules', () => {
		const decision = resolveLegalHoldDecision(
			'UA',
			{
				allow: ['UA'],
				warn: [],
				challenge: ['UA'],
				block: ['UA'],
			},
			'allow',
		);

		expect(decision.action).toBe('allow');
		expect(decision.ruleId).toBe('country:allow:UA');
	});

	it('resolves block rules when no allow rule matches', () => {
		const decision = resolveLegalHoldDecision(
			'DE',
			{
				allow: [],
				warn: [],
				challenge: [],
				block: ['DE'],
			},
			'allow',
		);

		expect(decision.action).toBe('block');
		expect(decision.ruleId).toBe('country:block:DE');
	});

	it('uses default action when no specific rule matches', () => {
		const decision = resolveLegalHoldDecision(
			'US',
			{
				allow: [],
				warn: [],
				challenge: [],
				block: [],
			},
			'warn',
		);

		expect(decision.action).toBe('warn');
		expect(decision.ruleId).toBe('default');
	});

	it('detects html-capable requests', () => {
		const htmlRequest = new Request('https://example.com', {
			headers: {Accept: 'text/html,application/xhtml+xml'},
		});
		const apiRequest = new Request('https://example.com', {
			headers: {Accept: 'application/json'},
		});

		expect(prefersHtml(htmlRequest)).toBe(true);
		expect(prefersHtml(apiRequest)).toBe(false);
	});

	it('bypasses configured exempt path prefixes', () => {
		expect(shouldBypassLegalHold('/_health', ['/_health'])).toBe(true);
		expect(shouldBypassLegalHold('/v1/status/summary/live', ['/v1/status/summary'])).toBe(true);
		expect(shouldBypassLegalHold('/v1/auth/register', ['/_health'])).toBe(false);
	});
});
