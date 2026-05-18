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

export class MetricsService implements IMetricsService {
	private readonly endpoint: string | null;
	private readonly enabled: boolean;

	constructor(endpoint: string | null) {
		this.endpoint = MetricsService.normalizeEndpoint(endpoint);
		this.enabled = !!this.endpoint;

		if (this.enabled) {
			Logger.info({endpoint: this.endpoint}, 'Metrics service initialized');
		} else {
			Logger.info('Metrics service disabled (ASTRAL_METRICS_HOST not set)');
		}
	}

	isEnabled(): boolean {
		return this.enabled;
	}

	counter({name, dimensions, value = 1}: CounterParams): void {
		if (!this.enabled) return;
		this.fireAndForget(`${this.endpoint}/metrics/counter`, {
			name,
			dimensions: dimensions ?? {},
			value,
		});
	}

	gauge({name, dimensions, value}: GaugeParams): void {
		if (!this.enabled) return;
		this.fireAndForget(`${this.endpoint}/metrics/gauge`, {
			name,
			dimensions: dimensions ?? {},
			value,
		});
	}

	histogram({name, dimensions, valueMs}: HistogramParams): void {
		if (!this.enabled) return;
		this.fireAndForget(`${this.endpoint}/metrics/histogram`, {
			name,
			dimensions: dimensions ?? {},
			value_ms: valueMs,
		});
	}

	crash({guildId, stacktrace}: CrashParams): void {
		if (!this.enabled) return;
		this.fireAndForget(`${this.endpoint}/metrics/crash`, {
			guild_id: guildId,
			stacktrace,
		});
	}

	batch(metrics: Array<BatchMetric>): void {
		if (!this.enabled || metrics.length === 0) return;

		const payload = metrics.map((m) => {
			if (m.type === 'counter') {
				return {
					type: 'counter',
					name: m.name,
					dimensions: m.dimensions ?? {},
					value: m.value ?? 1,
				};
			}
			if (m.type === 'gauge') {
				return {
					type: 'gauge',
					name: m.name,
					dimensions: m.dimensions ?? {},
					value: m.value ?? 0,
				};
			}
			return {
				type: 'histogram',
				name: m.name,
				dimensions: m.dimensions ?? {},
				value_ms: m.valueMs ?? 0,
			};
		});

		this.fireAndForget(`${this.endpoint}/metrics/batch`, {metrics: payload});
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
