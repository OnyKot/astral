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

export interface GrokContentAnalysis {
	flagged: boolean;
	categories: {
		harassment: boolean;
		hate: boolean;
		sexual: boolean;
		violence: boolean;
		selfHarm: boolean;
		spam: boolean;
	};
	severity: 'none' | 'low' | 'medium' | 'high';
	reason: string | null;
}

export interface GrokSearchExpansion {
	expandedQuery: string;
	suggestedFilters: Record<string, unknown>;
	intent: string;
}

export interface GrokMessageSummary {
	summary: string;
	topics: Array<string>;
	sentiment: 'positive' | 'neutral' | 'negative';
}

export interface GrokReportAnalysis {
	suggestedCategory: string;
	severity: 'low' | 'medium' | 'high' | 'critical';
	summary: string;
	confidence: number;
}

export interface GrokChatMessage {
	role: 'system' | 'user' | 'assistant';
	content: string;
}

export interface GrokChatCompletion {
	content: string;
	finishReason: string;
	usage: {
		promptTokens: number;
		completionTokens: number;
		totalTokens: number;
	};
}

export abstract class IGrokService {
	abstract isEnabled(): boolean;
	abstract chat(messages: Array<GrokChatMessage>, options?: {temperature?: number; maxTokens?: number}): Promise<GrokChatCompletion>;
	abstract moderateContent(content: string): Promise<GrokContentAnalysis>;
	abstract expandSearchQuery(query: string, context?: string): Promise<GrokSearchExpansion>;
	abstract summarizeMessages(contents: Array<string>): Promise<GrokMessageSummary>;
	abstract analyzeReport(reportContent: string, messageContent: string, context?: string): Promise<GrokReportAnalysis>;
}
