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
import {FeatureTemporarilyDisabledError} from '~/Errors';
import {Logger} from '~/Logger';

const REQUEST_TIMEOUT_MS = 15000;
const SYSTEM_PROMPT =
	'You are Astral AI, the built-in assistant inside Astral. Keep replies concise, useful, and chat-ready. If a request is unsafe or abusive, refuse briefly and redirect to a safer alternative.';
const AVATAR_PROMPT_PREFIX =
	'Create a polished square profile image for use as an avatar. Keep the subject centered, readable at small sizes, visually distinctive, and free of text, watermarks, UI, or collage layouts.';

export interface GrokConversationMessage {
	role: 'user' | 'assistant';
	content: string;
}

interface GrokChatMessage {
	role: 'system' | 'user';
	content: string;
}

interface GrokConversationRequestMessage {
	role: 'user' | 'assistant';
	content: string;
}

interface GrokChatRequest {
	model: string;
	messages: Array<GrokChatMessage | GrokConversationRequestMessage>;
	stream: false;
}

interface GrokChatChoice {
	message?: {
		content?:
			| string
			| Array<{
					type?: string;
					text?: string;
					content?: string;
			  }>;
	};
	text?: string;
}

interface GrokChatResponse {
	error?: {
		message?: string;
	};
	model?: string;
	choices?: Array<GrokChatChoice>;
}

interface GrokImageRequest {
	model: string;
	prompt: string;
	n: number;
	response_format?: 'url' | 'b64_json';
}

interface GrokImageData {
	url?: string;
	b64_json?: string;
	revised_prompt?: string;
	mime_type?: string;
}

interface GrokImageResponse {
	error?: {
		message?: string;
	};
	data?: Array<GrokImageData>;
}

function trimTrailingSlash(value: string): string {
	if (value.length > 1 && value.endsWith('/')) {
		return trimTrailingSlash(value.slice(0, -1));
	}
	return value;
}

function parseChoiceContent(choice: GrokChatChoice | undefined): string {
	if (!choice) return '';

	if (typeof choice.text === 'string') {
		return choice.text.trim();
	}

	const content = choice.message?.content;
	if (typeof content === 'string') {
		return content.trim();
	}

	if (!Array.isArray(content)) {
		return '';
	}

	return content
		.map((chunk) => {
			if (!chunk || typeof chunk !== 'object') return '';
			if (typeof chunk.text === 'string') return chunk.text;
			if (typeof chunk.content === 'string') return chunk.content;
			return '';
		})
		.join('')
		.trim();
}

export class GrokChatService {
	private readonly logger = Logger.child({module: 'GrokChatService'});

	private ensureConfigured(): {apiKey: string; apiUrl: string; model: string; imageModel: string} {
		if (!Config.grok.enabled || !Config.grok.apiKey) {
			throw new FeatureTemporarilyDisabledError();
		}

		return {
			apiKey: Config.grok.apiKey,
			apiUrl: trimTrailingSlash(Config.grok.apiUrl),
			model: Config.grok.model,
			imageModel: Config.grok.imageModel,
		};
	}

	private async parseJsonResponse<T extends {error?: {message?: string}}>(response: Response): Promise<T> {
		const responseText = await response.text();

		try {
			return responseText ? (JSON.parse(responseText) as T) : ({} as T);
		} catch {
			return {
				error: {
					message: responseText || `xAI responded with HTTP ${response.status}`,
				},
			} as T;
		}
	}

	async complete(prompt: string): Promise<{content: string; model: string}> {
		return this.completeConversation([{role: 'user', content: prompt}]);
	}

	async completeConversation(messages: Array<GrokConversationMessage>): Promise<{content: string; model: string}> {
		const normalizedMessages = messages
			.map((message) => ({
				role: message.role,
				content: message.content.trim(),
			}))
			.filter((message) => message.content.length > 0);

		if (normalizedMessages.length === 0) {
			throw new Error('Prompt is empty.');
		}

		const {apiKey, apiUrl, model} = this.ensureConfigured();
		const requestBody: GrokChatRequest = {
			model,
			messages: [
				{role: 'system', content: SYSTEM_PROMPT},
				...normalizedMessages,
			],
			stream: false,
		};

		try {
			const response = await fetch(`${apiUrl}/chat/completions`, {
				method: 'POST',
				headers: {
					Accept: 'application/json',
					Authorization: `Bearer ${apiKey}`,
					'Content-Type': 'application/json',
				},
				body: JSON.stringify(requestBody),
				signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
			});

			const responseBody = await this.parseJsonResponse<GrokChatResponse>(response);

			if (!response.ok) {
				const message = responseBody.error?.message || `xAI responded with HTTP ${response.status}`;
				this.logger.error({status: response.status, message}, 'Grok request failed');
				throw new Error(message);
			}

			const content = parseChoiceContent(responseBody.choices?.[0]);
			if (!content) {
				throw new Error('Grok returned an empty response.');
			}

			return {
				content,
				model: responseBody.model || model,
			};
		} catch (error) {
			if (error instanceof FeatureTemporarilyDisabledError) {
				throw error;
			}

			this.logger.error({error}, 'Failed to complete Grok chat request');
			throw error instanceof Error ? error : new Error('Failed to reach Grok.');
		}
	}

	async generateImage(
		prompt: string,
		options?: {avatarMode?: boolean},
	): Promise<{imageUrl?: string; imageDataUrl?: string; model: string; revisedPrompt?: string}> {
		const trimmedPrompt = prompt.trim();
		if (!trimmedPrompt) {
			throw new Error('Prompt is empty.');
		}

		const {apiKey, apiUrl, imageModel} = this.ensureConfigured();
		const requestBody: GrokImageRequest = {
			model: imageModel,
			prompt: options?.avatarMode ? `${AVATAR_PROMPT_PREFIX}\n\n${trimmedPrompt}` : trimmedPrompt,
			n: 1,
			response_format: 'b64_json',
		};

		try {
			const response = await fetch(`${apiUrl}/images/generations`, {
				method: 'POST',
				headers: {
					Accept: 'application/json',
					Authorization: `Bearer ${apiKey}`,
					'Content-Type': 'application/json',
				},
				body: JSON.stringify(requestBody),
				signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
			});

			const responseBody = await this.parseJsonResponse<GrokImageResponse>(response);

			if (!response.ok) {
				const message = responseBody.error?.message || `xAI responded with HTTP ${response.status}`;
				this.logger.error({status: response.status, message}, 'Grok image request failed');
				throw new Error(message);
			}

			const image = responseBody.data?.[0];
			if (!image) {
				throw new Error('Grok returned no image.');
			}

			const imageDataUrl =
				typeof image.b64_json === 'string' && image.b64_json.length > 0
					? `data:${image.mime_type || 'image/jpeg'};base64,${image.b64_json}`
					: undefined;

			if (!image.url && !imageDataUrl) {
				throw new Error('Grok returned no usable image payload.');
			}

			return {
				imageUrl: image.url,
				imageDataUrl,
				model: imageModel,
				revisedPrompt: image.revised_prompt,
			};
		} catch (error) {
			if (error instanceof FeatureTemporarilyDisabledError) {
				throw error;
			}

			this.logger.error({error}, 'Failed to generate Grok image');
			throw error instanceof Error ? error : new Error('Failed to generate image.');
		}
	}
}

export const grokChatService = new GrokChatService();
