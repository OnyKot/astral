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

/*
 * deliverInteraction — Graphile Worker task that POSTs an interaction
 * payload (a button click or select-menu submit) to the URL stored in
 * `webhooks.interaction_url`. This is the only outbound HTTP delivery
 * we currently do for interactions; bots reply by calling the existing
 * webhook execute endpoint (POST /webhooks/{id}/{token}) with their
 * response message, just like normal webhook output.
 *
 * Failure handling: thrown errors trigger Graphile Worker's exponential
 * backoff. We deliberately keep maxAttempts low (5) — a bot that's down
 * for an hour usually means the user has long since given up clicking
 * the button, and retrying for hours just to deliver a stale click
 * isn't useful. Each retry doubles the delay; total max wait ~30 min.
 */

import {lookup} from 'node:dns/promises';
import {isIP} from 'node:net';
import type {Task} from 'graphile-worker';
import {getMetricsService} from '~/infrastructure/MetricsService';
import {Logger} from '~/Logger';
import {validatePayload} from '~/worker/utils/TaskPayloadValidator';

interface DeliverInteractionPayload {
	url: string;
	body: string; // pre-serialised JSON
	signature?: string;
	timestamp?: string;
}

const payloadSchema = {
	url: {type: 'string' as const, requirement: 'required' as const},
	body: {type: 'string' as const, requirement: 'required' as const},
	signature: {type: 'string' as const, requirement: 'optional' as const},
	timestamp: {type: 'string' as const, requirement: 'optional' as const},
};


const REQUEST_TIMEOUT_MS = 15_000;
const ERROR_BODY_LOG_LIMIT_CHARS = 512;

async function readResponseBodySnippet(response: Response, maxChars: number): Promise<string> {
	try {
		if (!response.body) return '';
		const reader = response.body.getReader();
		const decoder = new TextDecoder();
		let out = '';
		while (out.length < maxChars) {
			const {done, value} = await reader.read();
			if (done) break;
			out += decoder.decode(value, {stream: true});
			if (out.length >= maxChars) break;
		}
		out += decoder.decode();
		await reader.cancel();
		return out.slice(0, maxChars);
	} catch {
		return '';
	}
}

function isBlockedIp(ip: string): boolean {
	if (ip.startsWith('127.') || ip === '0.0.0.0') return true;
	if (ip.startsWith('10.') || ip.startsWith('192.168.')) return true;
	const secondOctet = Number.parseInt(ip.split('.')[1] ?? '', 10);
	if (ip.startsWith('172.') && secondOctet >= 16 && secondOctet <= 31) return true;
	if (ip.startsWith('169.254.')) return true;
	if (ip === '::1' || ip === '::') return true;
	if (ip.toLowerCase().startsWith('fc') || ip.toLowerCase().startsWith('fd')) return true;
	if (ip.toLowerCase().startsWith('fe80:')) return true;
	if (ip.toLowerCase().startsWith('::ffff:')) {
		return isBlockedIp(ip.slice(7));
	}
	return false;
}

async function assertSafeInteractionUrl(rawUrl: string): Promise<URL> {
	let parsed: URL;
	try {
		parsed = new URL(rawUrl);
	} catch {
		throw new Error('Invalid interaction URL');
	}

	if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
		throw new Error('Interaction URL must use http or https');
	}

	const hostname = parsed.hostname.toLowerCase();
	if (hostname === 'localhost' || hostname.endsWith('.localhost')) {
		throw new Error('Interaction URL cannot target localhost');
	}

	if (isIP(hostname) && isBlockedIp(hostname)) {
		throw new Error('Interaction URL targets a private or loopback IP');
	}

	const lookupResult = await lookup(hostname, {all: true});
	if (!lookupResult.length) {
		throw new Error('Interaction URL host did not resolve');
	}

	for (const entry of lookupResult) {
		if (isBlockedIp(entry.address)) {
			throw new Error('Interaction URL resolved to a private or loopback IP');
		}
	}

	return parsed;
}

/**
 * Normalised category string for observability — translates raw HTTP
 * statuses and error names into one of a small, well-defined bucket
 * per (permanent | transient | unknown). Dashboard can now split the
 * per-task error counter by category instead of seeing one opaque
 * "322 errors" bar.
 */
function categoriseStatus(status: number): {category: string; permanent: boolean} {
	if (status === 404) return {category: 'not_found', permanent: true};
	if (status === 401 || status === 403) return {category: 'unauthorized', permanent: true};
	if (status === 410) return {category: 'gone', permanent: true};
	if (status === 429) return {category: 'rate_limited', permanent: false};
	if (status >= 400 && status < 500) return {category: `client_${status}`, permanent: true};
	if (status >= 500) return {category: `server_${status}`, permanent: false};
	return {category: `unknown_${status}`, permanent: false};
}

const deliverInteraction: Task = async (payload, helpers) => {
	const validated = validatePayload<DeliverInteractionPayload>(payload, payloadSchema);
	const startedAt = Date.now();

	const safeUrl = await assertSafeInteractionUrl(validated.url);

	helpers.logger.debug('Delivering interaction', {url: safeUrl.toString(), attempts: helpers.job.attempts});

	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

	try {
		const headers: Record<string, string> = {
			'Content-Type': 'application/json',
			'User-Agent': 'Astral-Interactions/1.0',
		};
		if (validated.signature) {
			headers['X-Astral-Signature'] = validated.signature;
		}
		if (validated.timestamp) {
			headers['X-Astral-Timestamp'] = validated.timestamp;
		}

		const response = await fetch(safeUrl, {
			method: 'POST',
			headers,
			body: validated.body,
			redirect: 'error',
			signal: controller.signal,
		});
		const durationMs = Date.now() - startedAt;

		if (!response.ok) {
			const status = response.status;
			const {category, permanent} = categoriseStatus(status);
			// Read up to 512 chars of the response body — enough to
			// surface the bot's error message ("invalid signature",
			// "unknown interaction id") without flooding logs when a
			// broken bot returns a full HTML error page.
			const body = await readResponseBodySnippet(response, ERROR_BODY_LOG_LIMIT_CHARS);

			getMetricsService().counter({
				name: 'worker.deliver_interaction.failure',
				dimensions: {category, permanent: String(permanent)},
			});
			getMetricsService().histogram({
				name: 'worker.deliver_interaction.latency_ms',
				dimensions: {result: 'fail', category},
				valueMs: durationMs,
			});

			if (permanent) {
				// Permanent — log the body so ops can diagnose broken
				// bot URLs without digging further. Graphile Worker
				// treats our return-without-throw as success, so this
				// task will not consume another retry slot.
				Logger.warn(
					{url: validated.url, status, category, body, attempts: helpers.job.attempts},
					'Interaction delivery failed permanently (4xx); not retrying',
				);
				return;
			}

			// Transient — throw so the framework schedules a retry.
			Logger.error(
				{url: validated.url, status, category, body, attempts: helpers.job.attempts},
				'Interaction delivery failed (will retry)',
			);
			throw new Error(`Interaction delivery failed with HTTP ${status}`);
		}

		getMetricsService().counter({
			name: 'worker.deliver_interaction.success',
		});
		getMetricsService().histogram({
			name: 'worker.deliver_interaction.latency_ms',
			dimensions: {result: 'ok'},
			valueMs: durationMs,
		});
		Logger.debug({url: validated.url, status: response.status, durationMs}, 'Interaction delivered successfully');
	} catch (error) {
		const durationMs = Date.now() - startedAt;
		if ((error as Error).name === 'AbortError') {
			getMetricsService().counter({
				name: 'worker.deliver_interaction.failure',
				dimensions: {category: 'timeout', permanent: 'false'},
			});
			getMetricsService().histogram({
				name: 'worker.deliver_interaction.latency_ms',
				dimensions: {result: 'fail', category: 'timeout'},
				valueMs: durationMs,
			});
			Logger.warn({url: validated.url, attempts: helpers.job.attempts}, 'Interaction delivery timed out');
			throw new Error('Interaction delivery timed out');
		}
		// Already-categorised HTTP errors are re-thrown above; this
		// branch handles DNS / TCP / TLS failures which don't have an
		// HTTP status at all.
		const message = error instanceof Error ? error.message : String(error);
		if (!message.startsWith('Interaction delivery failed with HTTP')) {
			getMetricsService().counter({
				name: 'worker.deliver_interaction.failure',
				dimensions: {category: 'network', permanent: 'false'},
			});
			getMetricsService().histogram({
				name: 'worker.deliver_interaction.latency_ms',
				dimensions: {result: 'fail', category: 'network'},
				valueMs: durationMs,
			});
			Logger.error(
				{url: validated.url, error: message, attempts: helpers.job.attempts},
				'Interaction delivery network failure (will retry)',
			);
		}
		throw error;
	} finally {
		clearTimeout(timeout);
	}
};

export default deliverInteraction;
