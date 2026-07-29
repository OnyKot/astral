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

import {ASTRAL_USER_AGENT} from '~/Constants';
import type {
	BatchMetric,
	CounterParams,
	CrashParams,
	GaugeParams,
	HistogramParams,
	IMetricsService,
} from '~/infrastructure/IMetricsService';
import {Logger} from '~/Logger';

/** Upper bound on how long a metric sits in the buffer before it ships. */
const FLUSH_INTERVAL_MS = 1_000;

/**
 * Ship early when a burst fills the buffer, so a busy process does not sit on a
 * large payload (and a large JSON.stringify) for the whole interval.
 */
const FLUSH_THRESHOLD = 100;

/**
 * Hard ceiling on buffered metrics. If the metrics host is unreachable the
 * buffer must not grow without bound — metrics are observability, never worth
 * an OOM, so we drop and say so once per flush.
 */
const MAX_BUFFERED_METRICS = 10_000;

interface CounterPayload {
	name: string;
	dimensions: Record<string, string>;
	value: number;
}

interface GaugePayload {
	name: string;
	dimensions: Record<string, string>;
	value: number;
}

interface HistogramPayload {
	name: string;
	dimensions: Record<string, string>;
	value_ms: number;
}

/**
 * A single message fetch emits ~20 metrics, and every one of them used to race
 * the response with its own `fetch()` (plus a retry on failure) — twenty
 * outbound connections and twenty JSON bodies competing with the request they
 * were measuring. Counters/gauges/histograms are now buffered in memory and
 * shipped together through the batch endpoint, so the request path only ever
 * does an array push.
 */
export class MetricsService implements IMetricsService {
	private readonly endpoint: string | null;
	private readonly enabled: boolean;

	private counters: Array<CounterPayload> = [];
	private gauges: Array<GaugePayload> = [];
	private histograms: Array<HistogramPayload> = [];
	private buffered = 0;
	private dropped = 0;

	constructor(endpoint: string | null) {
		this.endpoint = MetricsService.normalizeEndpoint(endpoint);
		this.enabled = !!this.endpoint;

		if (this.enabled) {
			const timer = setInterval(() => {
				this.flush();
			}, FLUSH_INTERVAL_MS);
			// A buffered metric must never keep the process alive on shutdown.
			timer.unref?.();
			Logger.info({endpoint: this.endpoint}, 'Metrics service initialized');
		} else {
			Logger.info('Metrics service disabled (ASTRAL_METRICS_HOST not set)');
		}
	}

	isEnabled(): boolean {
		return this.enabled;
	}

	counter({name, dimensions, value = 1}: CounterParams): void {
		if (!this.enabled || !this.reserveSlot()) return;
		this.counters.push({name, dimensions: dimensions ?? {}, value});
		this.flushIfFull();
	}

	gauge({name, dimensions, value}: GaugeParams): void {
		if (!this.enabled || !this.reserveSlot()) return;
		this.gauges.push({name, dimensions: dimensions ?? {}, value});
		this.flushIfFull();
	}

	histogram({name, dimensions, valueMs}: HistogramParams): void {
		if (!this.enabled || !this.reserveSlot()) return;
		this.histograms.push({name, dimensions: dimensions ?? {}, value_ms: valueMs});
		this.flushIfFull();
	}

	crash({guildId, stacktrace}: CrashParams): void {
		if (!this.enabled) return;
		// Crashes stay on their own endpoint: they are rare, they carry an
		// alerting side effect on the receiving end, and the batch endpoint has
		// no crash channel at all.
		this.fireAndForget(`${this.endpoint}/metrics/crash`, {
			guild_id: guildId,
			stacktrace,
		});
	}

	batch(metrics: Array<BatchMetric>): void {
		if (!this.enabled || metrics.length === 0) return;

		for (const metric of metrics) {
			if (!this.reserveSlot()) break;

			const dimensions = metric.dimensions ?? {};
			if (metric.type === 'counter') {
				this.counters.push({name: metric.name, dimensions, value: metric.value ?? 1});
			} else if (metric.type === 'gauge') {
				this.gauges.push({name: metric.name, dimensions, value: metric.value ?? 0});
			} else {
				this.histograms.push({name: metric.name, dimensions, value_ms: metric.valueMs ?? 0});
			}

			// Checked per metric, not once at the end: a large caller-supplied batch
			// must still leave the wire payload bounded by FLUSH_THRESHOLD.
			this.flushIfFull();
		}
	}

	/**
	 * Accounts for one more buffered metric, or reports that the buffer is full.
	 */
	private reserveSlot(): boolean {
		if (this.buffered >= MAX_BUFFERED_METRICS) {
			this.dropped += 1;
			return false;
		}
		this.buffered += 1;
		return true;
	}

	private flushIfFull(): void {
		if (this.buffered >= FLUSH_THRESHOLD) {
			this.flush();
		}
	}

	/**
	 * Never throws: this runs inline on the request path (via `flushIfFull`) and
	 * a metrics problem must not surface as a failed request.
	 */
	private flush(): void {
		if (this.buffered === 0) {
			return;
		}

		const counters = this.counters;
		const gauges = this.gauges;
		const histograms = this.histograms;
		const dropped = this.dropped;
		this.counters = [];
		this.gauges = [];
		this.histograms = [];
		this.buffered = 0;
		this.dropped = 0;

		if (dropped > 0) {
			Logger.warn({dropped}, 'Dropped metrics: outbound buffer full');
		}

		try {
			// The ingest endpoint expects the three metric kinds as separate
			// arrays (astral_metrics `BatchRequest`); any other shape
			// deserializes into an empty batch and is silently discarded.
			this.fireAndForget(`${this.endpoint}/metrics/batch`, {counters, gauges, histograms});
		} catch (error) {
			Logger.warn({error}, 'Failed to serialize metrics batch');
		}
	}

	private fireAndForget(url: string, body: unknown): void {
		const jsonBody = JSON.stringify(body);
		this.sendMetricWithRetry(url, jsonBody, 0).catch(() => {});
	}

	private async sendMetricWithRetry(url: string, body: string, attempt: number): Promise<void> {
		const MAX_RETRIES = 1;
		try {
			const response = await fetch(url, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'User-Agent': ASTRAL_USER_AGENT,
				},
				body,
				signal: AbortSignal.timeout(5000),
			});
			if (!response.ok && attempt < MAX_RETRIES) {
				await this.sendMetricWithRetry(url, body, attempt + 1);
			} else if (!response.ok) {
				Logger.warn({url, status: response.status, attempts: attempt + 1}, 'Failed to send metric after retries');
			}
		} catch (error) {
			if (attempt < MAX_RETRIES) {
				await this.sendMetricWithRetry(url, body, attempt + 1);
			} else {
				Logger.warn({error, url, attempts: attempt + 1}, 'Failed to send metric after retries');
			}
		}
	}

	private static normalizeEndpoint(endpoint: string | null): string | null {
		if (!endpoint) {
			return null;
		}

		const trimmed = endpoint.trim().replace(/\/$/, '');
		if (trimmed === '') {
			return null;
		}

		if (/^[a-zA-Z][a-zA-Z\d+.-]*:\/\//.test(trimmed)) {
			return trimmed;
		}

		return `http://${trimmed}`;
	}
}

class NoopMetricsService implements IMetricsService {
	isEnabled(): boolean {
		return false;
	}
	counter(_params: CounterParams): void {}
	gauge(_params: GaugeParams): void {}
	histogram(_params: HistogramParams): void {}
	crash(_params: CrashParams): void {}
	batch(_metrics: Array<BatchMetric>): void {}
}

let metricsServiceInstance: IMetricsService | null = null;

export function initializeMetricsService(endpoint: string | null): IMetricsService {
	// Any early `getMetricsService()` caller (middleware import, circular
	// dep, whatever) would have parked a Noop here before App.ts:323 ran.
	// Previously we saw that, early-returned, and silently ran with metrics
	// disabled for the life of the process — `api.latency` was dark for
	// two days before anyone noticed. Now we only early-return when an
	// already-real MetricsService exists; Noop gets replaced.
	if (metricsServiceInstance && !(metricsServiceInstance instanceof NoopMetricsService)) {
		return metricsServiceInstance;
	}

	if (endpoint) {
		metricsServiceInstance = new MetricsService(endpoint);
	} else {
		metricsServiceInstance = new NoopMetricsService();
	}

	return metricsServiceInstance;
}

export function getMetricsService(): IMetricsService {
	if (!metricsServiceInstance) {
		metricsServiceInstance = new NoopMetricsService();
	}
	return metricsServiceInstance;
}
