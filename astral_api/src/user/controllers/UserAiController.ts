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
import {FeatureTemporarilyDisabledError} from '~/Errors';
import {DefaultUserOnly, LoginRequired} from '~/middleware/AuthMiddleware';
import {RateLimitMiddleware} from '~/middleware/RateLimitMiddleware';
import {RateLimitConfigs} from '~/RateLimitConfig';
import {createStringType, z} from '~/Schema';
import {Validator} from '~/Validator';
import {grokChatService} from '../services/GrokChatService';

const UserAiMessageSchema = z.object({
	role: z.enum(['user', 'assistant']),
	content: createStringType(1, 4000),
});

const UserAiChatSchema = z
	.object({
		prompt: createStringType(1, 2000).optional(),
		messages: z.array(UserAiMessageSchema).max(20).optional(),
	})
	.refine((value) => Boolean(value.prompt) || Boolean(value.messages?.length), {
		message: 'Either prompt or messages is required',
		path: ['prompt'],
	});

const UserAiImageSchema = z.object({
	prompt: createStringType(1, 500),
	mode: z.enum(['chat', 'avatar']).optional(),
});

export const UserAiController = (app: HonoApp) => {
	app.post(
		'/users/@me/ai/chat',
		RateLimitMiddleware(RateLimitConfigs.USER_AI_CHAT),
		LoginRequired,
		DefaultUserOnly,
		Validator('json', UserAiChatSchema),
		async (ctx) => {
			const {prompt, messages} = ctx.req.valid('json');
			const conversation = messages?.length ? messages : [{role: 'user' as const, content: prompt!}];

			try {
				const result = await grokChatService.completeConversation(conversation);
				return ctx.json(result);
			} catch (error) {
				if (error instanceof FeatureTemporarilyDisabledError) {
					throw error;
				}

				return ctx.json(
					{
						error: 'ai_chat_failed',
						message: error instanceof Error ? error.message : 'AI request failed',
					},
					502,
				);
			}
		},
	);

	app.post(
		'/users/@me/ai/images',
		RateLimitMiddleware(RateLimitConfigs.USER_AI_IMAGE),
		LoginRequired,
		DefaultUserOnly,
		Validator('json', UserAiImageSchema),
		async (ctx) => {
			const {prompt, mode} = ctx.req.valid('json');

			try {
				const result = await grokChatService.generateImage(prompt, {avatarMode: mode === 'avatar'});
				return ctx.json(result);
			} catch (error) {
				if (error instanceof FeatureTemporarilyDisabledError) {
					throw error;
				}

				return ctx.json(
					{
						error: 'ai_image_failed',
						message: error instanceof Error ? error.message : 'AI image request failed',
					},
					502,
				);
			}
		},
	);
};
