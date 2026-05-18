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

import type {HonoApp} from '~/App';
import {InputValidationError} from '~/Errors';
import {DefaultUserOnly, LoginRequired} from '~/middleware/AuthMiddleware';
import {RateLimitMiddleware} from '~/middleware/RateLimitMiddleware';
import {RateLimitConfigs} from '~/RateLimitConfig';
import {createStringType, Int64Type, z} from '~/Schema';
import {Validator} from '~/Validator';

const SummarizeMessagesRequest = z.object({
	channel_id: Int64Type,
	message_contents: z.array(createStringType(1, 4000)).min(1).max(50),
});

const AnalyzeContentRequest = z.object({
	content: createStringType(1, 4000),
});

const ExpandSearchRequest = z.object({
	query: createStringType(1, 500),
	context: createStringType(0, 500).optional(),
});

export const AiController = (app: HonoApp) => {
	app.post(
		'/ai/summarize',
		RateLimitMiddleware(RateLimitConfigs.AI_SUMMARIZE),
		LoginRequired,
		DefaultUserOnly,
		Validator('json', SummarizeMessagesRequest),
		async (ctx) => {
			const grokService = ctx.get('grokService');
			if (!grokService.isEnabled()) {
				throw InputValidationError.create('ai', 'AI features are not enabled on this instance');
			}

			const body = ctx.req.valid('json');
			const summary = await grokService.summarizeMessages(body.message_contents);
			return ctx.json(summary);
		},
	);

	app.post(
		'/ai/analyze',
		RateLimitMiddleware(RateLimitConfigs.AI_ANALYZE),
		LoginRequired,
		DefaultUserOnly,
		Validator('json', AnalyzeContentRequest),
		async (ctx) => {
			const grokService = ctx.get('grokService');
			if (!grokService.isEnabled()) {
				throw InputValidationError.create('ai', 'AI features are not enabled on this instance');
			}

			const body = ctx.req.valid('json');
			const analysis = await grokService.moderateContent(body.content);
			return ctx.json(analysis);
		},
	);

	app.post(
		'/ai/search/expand',
		RateLimitMiddleware(RateLimitConfigs.AI_SEARCH_EXPAND),
		LoginRequired,
		DefaultUserOnly,
		Validator('json', ExpandSearchRequest),
		async (ctx) => {
			const grokService = ctx.get('grokService');
			if (!grokService.isEnabled()) {
				throw InputValidationError.create('ai', 'AI features are not enabled on this instance');
			}

			const body = ctx.req.valid('json');
			const expansion = await grokService.expandSearchQuery(body.query, body.context);
			return ctx.json(expansion);
		},
	);
};
