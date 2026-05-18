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

export const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';
export const DEFAULT_OPENROUTER_MODEL = 'openai/gpt-4o-mini';
export const OPENROUTER_MODEL_PRESETS: ReadonlyArray<string> = [
	DEFAULT_OPENROUTER_MODEL,
	'openai/gpt-4.1-mini',
	'anthropic/claude-3.5-haiku',
	'google/gemini-2.0-flash-001',
];

interface OpenRouterMessage {
	role: 'user' | 'assistant' | 'system';
	content: string;
}

interface OpenRouterRequest {
	model: string;
	messages: Array<OpenRouterMessage>;
	temperature?: number;
	max_tokens?: number;
}

interface OpenRouterChoice {
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

interface OpenRouterResponse {
	error?: {
		message?: string;
	};
	choices?: Array<OpenRouterChoice>;
}

export interface RequestOpenRouterCompletionParams {
	apiKey: string;
	model: string;
	prompt: string;
}

function parseChoiceContent(choice: OpenRouterChoice | undefined): string {
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

export async function requestOpenRouterCompletion({
	apiKey,
	model,
	prompt,
}: RequestOpenRouterCompletionParams): Promise<string> {
	const trimmedKey = apiKey.trim();
	if (!trimmedKey) {
		throw new Error('OpenRouter API key is empty.');
	}

	const trimmedPrompt = prompt.trim();
	if (!trimmedPrompt) {
		throw new Error('Prompt is empty.');
	}

	const selectedModel = model.trim() || DEFAULT_OPENROUTER_MODEL;
	const requestBody: OpenRouterRequest = {
		model: selectedModel,
		messages: [{role: 'user', content: trimmedPrompt}],
		temperature: 0.7,
		max_tokens: 700,
	};

	const response = await fetch(OPENROUTER_API_URL, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${trimmedKey}`,
			'HTTP-Referer': window.location.origin,
			'X-Title': 'Astral',
		},
		body: JSON.stringify(requestBody),
	});

	const data = (await response.json().catch(() => ({}))) as OpenRouterResponse;

	if (!response.ok) {
		const message = data.error?.message || `OpenRouter request failed (${response.status})`;
		throw new Error(message);
	}

	const content = parseChoiceContent(data.choices?.[0]);
	if (!content) {
		throw new Error('OpenRouter returned an empty response.');
	}

	return content;
}
