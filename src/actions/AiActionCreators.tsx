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

import {Endpoints} from '~/Endpoints';
import http from '~/lib/HttpClient';

export type AiChatMessagePayload = {
	role: 'user' | 'assistant';
	content: string;
};

export interface AiChatCompletionResponse {
	content: string;
	model: string;
}

export interface AiImageGenerationResponse {
	imageUrl?: string;
	imageDataUrl?: string;
	model: string;
	revisedPrompt?: string;
}

export const requestAiAssistantReply = async (
	messages: Array<AiChatMessagePayload>,
): Promise<AiChatCompletionResponse> => {
	const response = await http.post<AiChatCompletionResponse>(Endpoints.USER_AI_CHAT, {messages});
	return response.body;
};

export const requestAiChatCompletion = async (prompt: string): Promise<AiChatCompletionResponse> =>
	requestAiAssistantReply([{role: 'user', content: prompt}]);

export const requestAiImageGeneration = async ({
	prompt,
	mode = 'chat',
}: {
	prompt: string;
	mode?: 'chat' | 'avatar';
}): Promise<AiImageGenerationResponse> => {
	const response = await http.post<AiImageGenerationResponse>(Endpoints.USER_AI_IMAGES, {prompt, mode});
	return response.body;
};

export const fetchImageDataUrl = async (imageUrl: string): Promise<string> => {
	const response = await fetch(imageUrl);
	if (!response.ok) {
		throw new Error(`Failed to fetch generated image: HTTP ${response.status}`);
	}

	const blob = await response.blob();

	return await new Promise<string>((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => resolve(reader.result as string);
		reader.onerror = () => reject(new Error('Failed to read generated image.'));
		reader.readAsDataURL(blob);
	});
};
