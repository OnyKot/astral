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

import {NextRequest, NextResponse} from 'next/server';

const XAI_API_KEY = process.env.XAI_API_KEY ?? '';
const XAI_API_URL = 'https://api.x.ai/v1/chat/completions';
const MODEL = 'grok-3-mini-fast';
const MAX_BODY_BYTES = 12 * 1024;
const REQUEST_TIMEOUT_MS = 15_000;
const RATE_LIMIT_WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 8;
const requestBuckets = new Map<string, {count: number; resetAt: number}>();

const SYSTEM_PROMPT = `You are the Astral documentation assistant. Astral is an independent instant messaging and VoIP platform — think of it as an open-source Discord alternative.

Your role:
- Answer questions about the Astral API, bots, OAuth2, webhooks, gateway events, and self-hosting.
- Reference official docs at https://astraof.com/docs when relevant.
- Be concise: keep answers under 300 words unless the user asks for detail.
- If you don't know something specific to Astral, say so — don't make up endpoints or features.
- Respond in the same language the user writes in (Russian or English).

Key facts:
- Base API URL: https://astraof.com/api/v1
- Gateway: wss://astraof.com/gateway?v=1&encoding=json
- Auth header: "Authorization: Bot YOUR_TOKEN" for bots, "Authorization: Bearer TOKEN" for OAuth2
- The API is compatible with Discord's API surface (most Discord libraries work with minor tweaks)
- Stack: Hono (API), Erlang (Gateway), LiveKit (Voice), Cassandra + PostgreSQL (DB), Redis (Cache)
- Application Commands (slash commands) are supported: /applications/:id/commands endpoints`;

export async function POST(request: NextRequest) {
	if (!XAI_API_KEY) {
		return NextResponse.json({error: 'AI assistant is not configured'}, {status: 503});
	}

	const contentLength = Number(request.headers.get('content-length') ?? '0');
	if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
		return NextResponse.json({error: 'Request body too large'}, {status: 413});
	}

	const now = Date.now();
	const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
	const bucket = requestBuckets.get(ip);
	if (!bucket || bucket.resetAt <= now) {
		requestBuckets.set(ip, {count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS});
	} else {
		if (bucket.count >= MAX_REQUESTS_PER_WINDOW) {
			return NextResponse.json({error: 'Rate limit exceeded'}, {status: 429});
		}
		bucket.count += 1;
	}

	try {
		const body = await request.json();
		const userMessage = typeof body.message === 'string' ? body.message.slice(0, 2000) : '';
		const history = Array.isArray(body.history) ? body.history.slice(-6) : [];

		if (!userMessage.trim()) {
			return NextResponse.json({error: 'Message is required'}, {status: 400});
		}

		const messages = [
			{role: 'system', content: SYSTEM_PROMPT},
			...history.map((m: {role: string; content: string}) => ({
				role: m.role === 'assistant' ? 'assistant' : 'user',
				content: typeof m.content === 'string' ? m.content.slice(0, 2000) : '',
			})),
			{role: 'user', content: userMessage},
		];

		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

		let response: Response;
		try {
			response = await fetch(XAI_API_URL, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Authorization: `Bearer ${XAI_API_KEY}`,
				},
				body: JSON.stringify({
					model: MODEL,
					messages,
					max_tokens: 1024,
					temperature: 0.3,
				}),
				signal: controller.signal,
			});
		} finally {
			clearTimeout(timeoutId);
		}


		if (!response.ok) {
			const errorText = await response.text();
			console.error('xAI API error:', response.status, errorText);
			return NextResponse.json({error: 'AI service temporarily unavailable'}, {status: 502});
		}

		const data = await response.json();
		const reply = data.choices?.[0]?.message?.content ?? 'No response generated.';

		return NextResponse.json({reply});
	} catch (error) {
		if (error instanceof Error && error.name === 'AbortError') {
			return NextResponse.json({error: 'AI request timed out'}, {status: 504});
		}

		console.error('AI route error:', error);
		return NextResponse.json({error: 'Internal server error'}, {status: 500});
	}
}
