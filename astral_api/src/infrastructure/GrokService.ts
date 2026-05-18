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

import {Logger} from '~/Logger';
import {
	type GrokChatCompletion,
	type GrokChatMessage,
	type GrokContentAnalysis,
	type GrokMessageSummary,
	type GrokReportAnalysis,
	type GrokSearchExpansion,
	IGrokService,
} from './IGrokService';

interface GrokServiceConfig {
	enabled: boolean;
	apiKey: string | undefined;
	baseUrl: string;
	model: string;
}

interface XAIResponse {
	choices: Array<{
		message: {content: string};
		finish_reason: string;
	}>;
	usage: {
		prompt_tokens: number;
		completion_tokens: number;
		total_tokens: number;
	};
}

interface GrokStats {
	requests_total: number;
	requests_success: number;
	requests_failed: number;
	tokens_prompt: number;
	tokens_completion: number;
	moderation_calls: number;
	moderation_blocks: number;
	search_expansion_calls: number;
	summarize_calls: number;
	report_analysis_calls: number;
	last_request_at: string | null;
	last_error: string | null;
}

/**
 * Simple circuit breaker for outbound Grok requests. If the service
 * returns N consecutive failures we stop trying for `cooldownMs` and
 * short-circuit to a quick rejection — this keeps message moderation,
 * summarisation, and search-expansion requests from piling up waiting
 * on a dead upstream.
 */
const CIRCUIT_FAILURE_THRESHOLD = 5;
const CIRCUIT_COOLDOWN_MS = 60_000;
const GROK_REQUEST_TIMEOUT_MS = 30_000;

export class GrokService extends IGrokService {
	private readonly enabled: boolean;
	private readonly apiKey: string | undefined;
	private readonly baseUrl: string;
	private readonly model: string;
	private consecutiveFailures = 0;
	private circuitOpenUntil = 0;
	private readonly stats: GrokStats = {
		requests_total: 0,
		requests_success: 0,
		requests_failed: 0,
		tokens_prompt: 0,
		tokens_completion: 0,
		moderation_calls: 0,
		moderation_blocks: 0,
		search_expansion_calls: 0,
		summarize_calls: 0,
		report_analysis_calls: 0,
		last_request_at: null,
		last_error: null,
	};

	public getStats(): GrokStats & {enabled: boolean; model: string} {
		return {...this.stats, enabled: this.enabled, model: this.model};
	}

	constructor(config: GrokServiceConfig) {
		super();
		this.enabled = config.enabled && !!config.apiKey;
		this.apiKey = config.apiKey;
		this.baseUrl = config.baseUrl;
		this.model = config.model;
	}

	isEnabled(): boolean {
		return this.enabled;
	}

	private recordSuccess(): void {
		this.consecutiveFailures = 0;
		this.circuitOpenUntil = 0;
	}

	private recordFailure(reason: string): void {
		this.consecutiveFailures += 1;
		if (this.consecutiveFailures >= CIRCUIT_FAILURE_THRESHOLD) {
			this.circuitOpenUntil = Date.now() + CIRCUIT_COOLDOWN_MS;
			Logger.warn(
				{consecutiveFailures: this.consecutiveFailures, cooldownMs: CIRCUIT_COOLDOWN_MS, reason},
				'Grok circuit breaker opened',
			);
		}
	}

	private ensureCircuitClosed(): void {
		if (this.circuitOpenUntil && Date.now() < this.circuitOpenUntil) {
			throw new Error('Grok circuit breaker open — upstream is failing');
		}
		if (this.circuitOpenUntil && Date.now() >= this.circuitOpenUntil) {
			// Half-open: clear the gate and let one request through. If it
			// succeeds recordSuccess() resets; if it fails recordFailure()
			// re-opens.
			this.circuitOpenUntil = 0;
		}
	}

	async chat(
		messages: Array<GrokChatMessage>,
		options?: {temperature?: number; maxTokens?: number},
	): Promise<GrokChatCompletion> {
		if (!this.enabled || !this.apiKey) {
			throw new Error('Grok service is not enabled');
		}

		this.ensureCircuitClosed();

		this.stats.requests_total++;
		this.stats.last_request_at = new Date().toISOString();

		try {
			const response = await fetch(`${this.baseUrl}/chat/completions`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Authorization: `Bearer ${this.apiKey}`,
				},
				body: JSON.stringify({
					model: this.model,
					messages,
					temperature: options?.temperature ?? 0,
					max_tokens: options?.maxTokens ?? 1024,
				}),
				// Hard cap on wall-clock time per request. Without this,
				// a Grok outage produced unbounded hangs on moderation
				// and search-expansion calls — message sends would stall
				// waiting on AI that never answered.
				signal: AbortSignal.timeout(GROK_REQUEST_TIMEOUT_MS),
			});

			if (!response.ok) {
				const errorBody = await response.text().catch(() => 'unknown');
				Logger.error({status: response.status, body: errorBody}, 'Grok API request failed');
				this.stats.requests_failed++;
				this.stats.last_error = `${response.status}: ${errorBody.slice(0, 120)}`;
				this.recordFailure(`http_${response.status}`);
				throw new Error(`Grok API error: ${response.status}`);
			}

			const data = (await response.json()) as XAIResponse;

			const choice = data.choices[0];
			if (!choice) {
				this.stats.requests_failed++;
				this.stats.last_error = 'Empty response';
				this.recordFailure('empty_response');
				throw new Error('Grok API returned empty response');
			}

			this.stats.requests_success++;
			this.stats.tokens_prompt += data.usage.prompt_tokens;
			this.stats.tokens_completion += data.usage.completion_tokens;
			this.recordSuccess();

			return {
				content: choice.message.content,
				finishReason: choice.finish_reason,
				usage: {
					promptTokens: data.usage.prompt_tokens,
					completionTokens: data.usage.completion_tokens,
					totalTokens: data.usage.total_tokens,
				},
			};
		} catch (err) {
			if (this.stats.requests_failed === 0 || this.stats.last_error === null) {
				this.stats.requests_failed++;
				this.stats.last_error = (err as Error).message.slice(0, 120);
			}
			// Already recorded in the branches above for HTTP/empty
			// cases; catch here covers timeout / network / parse errors.
			if (this.consecutiveFailures === 0) {
				this.recordFailure('network');
			}
			throw err;
		}
	}

	async moderateContent(content: string): Promise<GrokContentAnalysis> {
		if (!this.enabled) {
			return {
				flagged: false,
				categories: {harassment: false, hate: false, sexual: false, violence: false, selfHarm: false, spam: false},
				severity: 'none',
				reason: null,
			};
		}

		try {
			const result = await this.chat(
				[
					{
						role: 'system',
						content: `You are a content moderation system. Analyze the following message and respond ONLY with a JSON object (no markdown, no explanation):
{"flagged":boolean,"categories":{"harassment":boolean,"hate":boolean,"sexual":boolean,"violence":boolean,"selfHarm":boolean,"spam":boolean},"severity":"none"|"low"|"medium"|"high","reason":string|null}
Be strict about genuinely harmful content but tolerant of casual language, jokes, gaming references, and normal conversation. Only flag content that is clearly harmful or violates platform rules.`,
					},
					{role: 'user', content},
				],
				{temperature: 0, maxTokens: 256},
			);

			return JSON.parse(result.content);
		} catch (error) {
			Logger.warn({error, contentLength: content.length}, 'Content moderation failed, allowing content');
			return {
				flagged: false,
				categories: {harassment: false, hate: false, sexual: false, violence: false, selfHarm: false, spam: false},
				severity: 'none',
				reason: null,
			};
		}
	}

	async expandSearchQuery(query: string, context?: string): Promise<GrokSearchExpansion> {
		if (!this.enabled) {
			return {expandedQuery: query, suggestedFilters: {}, intent: 'search'};
		}

		try {
			const contextPart = context ? `\nSearch context: ${context}` : '';
			const result = await this.chat(
				[
					{
						role: 'system',
						content: `You are a search query optimizer for a messaging platform. Given a user's search query, improve it for better results. Respond ONLY with a JSON object (no markdown):
{"expandedQuery":"improved search string","suggestedFilters":{},"intent":"what the user is looking for"}
Keep the expanded query concise. Only suggest filters like {"has":"link"}, {"has":"embed"}, {"has":"file"} if clearly relevant.`,
					},
					{role: 'user', content: `Query: "${query}"${contextPart}`},
				],
				{temperature: 0, maxTokens: 256},
			);

			return JSON.parse(result.content);
		} catch (error) {
			Logger.warn({error}, 'Search query expansion failed');
			return {expandedQuery: query, suggestedFilters: {}, intent: 'search'};
		}
	}

	async summarizeMessages(contents: Array<string>): Promise<GrokMessageSummary> {
		if (!this.enabled) {
			return {summary: '', topics: [], sentiment: 'neutral'};
		}

		try {
			const joined = contents.slice(0, 50).join('\n---\n');
			const result = await this.chat(
				[
					{
						role: 'system',
						content: `You are a message summarization system. Summarize the following conversation messages. Respond ONLY with a JSON object (no markdown):
{"summary":"brief summary in 2-3 sentences","topics":["topic1","topic2"],"sentiment":"positive"|"neutral"|"negative"}`,
					},
					{role: 'user', content: joined},
				],
				{temperature: 0.3, maxTokens: 512},
			);

			return JSON.parse(result.content);
		} catch (error) {
			Logger.warn({error}, 'Message summarization failed');
			return {summary: '', topics: [], sentiment: 'neutral'};
		}
	}

	async analyzeReport(reportContent: string, messageContent: string, context?: string): Promise<GrokReportAnalysis> {
		if (!this.enabled) {
			return {suggestedCategory: 'other', severity: 'low', summary: '', confidence: 0};
		}

		try {
			const contextPart = context ? `\nAdditional context: ${context}` : '';
			const result = await this.chat(
				[
					{
						role: 'system',
						content: `You are a report analysis system for a messaging platform. Analyze the reported content and categorize it. Respond ONLY with a JSON object (no markdown):
{"suggestedCategory":"harassment"|"spam"|"nsfw"|"hate_speech"|"threats"|"self_harm"|"misinformation"|"other","severity":"low"|"medium"|"high"|"critical","summary":"brief analysis","confidence":0.0-1.0}`,
					},
					{
						role: 'user',
						content: `Report reason: ${reportContent}\nReported message: ${messageContent}${contextPart}`,
					},
				],
				{temperature: 0, maxTokens: 256},
			);

			return JSON.parse(result.content);
		} catch (error) {
			Logger.warn({error}, 'Report analysis failed');
			return {suggestedCategory: 'other', severity: 'low', summary: '', confidence: 0};
		}
	}
}

export class DisabledGrokService extends IGrokService {
	isEnabled(): boolean {
		return false;
	}

	async chat(): Promise<GrokChatCompletion> {
		throw new Error('Grok service is not enabled');
	}

	async moderateContent(): Promise<GrokContentAnalysis> {
		return {
			flagged: false,
			categories: {harassment: false, hate: false, sexual: false, violence: false, selfHarm: false, spam: false},
			severity: 'none',
			reason: null,
		};
	}

	async expandSearchQuery(query: string): Promise<GrokSearchExpansion> {
		return {expandedQuery: query, suggestedFilters: {}, intent: 'search'};
	}

	async summarizeMessages(): Promise<GrokMessageSummary> {
		return {summary: '', topics: [], sentiment: 'neutral'};
	}

	async analyzeReport(): Promise<GrokReportAnalysis> {
		return {suggestedCategory: 'other', severity: 'low', summary: '', confidence: 0};
	}
}
