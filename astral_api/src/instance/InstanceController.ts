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

import type {Hono} from 'hono';
import type {HonoEnv} from '~/App';
import {Config} from '~/Config';
import {API_CODE_VERSION} from '~/Constants';
import {RateLimitMiddleware} from '~/middleware/RateLimitMiddleware';
import {RateLimitConfigs} from '~/RateLimitConfig';

type PublicServiceStatus = 'operational' | 'degraded' | 'outage' | 'unknown';

interface PublicStatusService {
	key: 'api' | 'gateway' | 'metrics' | 'database' | 'cache' | 'voice';
	label: string;
	status: PublicServiceStatus;
	uptime_seconds: number | null;
	details?: Record<string, number | string | null>;
}

function deriveOverallStatus(services: Array<PublicStatusService>): PublicServiceStatus {
	if (services.some((service) => service.status === 'outage')) {
		return 'outage';
	}

	if (services.some((service) => service.status === 'degraded')) {
		return 'degraded';
	}

	if (services.every((service) => service.status === 'operational')) {
		return 'operational';
	}

	return 'unknown';
}

function normalizeGatewayStatus(status: string): PublicServiceStatus {
	switch (status) {
		case 'ok':
		case 'healthy':
		case 'operational':
			return 'operational';
		case 'degraded':
			return 'degraded';
		case 'outage':
		case 'error':
			return 'outage';
		default:
			return 'unknown';
	}
}

function normalizeMetricsHost(host: string): string {
	if (host.startsWith('http://') || host.startsWith('https://')) {
		return host;
	}

	return `http://${host}`;
}

export function InstanceController(app: Hono<HonoEnv>) {
	app.get('/instance', RateLimitMiddleware(RateLimitConfigs.INSTANCE_INFO), async (ctx) => {
		ctx.header('Access-Control-Allow-Origin', '*');

		const apiClientEndpoint = Config.endpoints.apiClient;
		const apiPublicEndpoint = Config.endpoints.apiPublic;

		const response: Record<string, unknown> = {
			api_code_version: API_CODE_VERSION,
			endpoints: {
				api: apiClientEndpoint,
				api_client: apiClientEndpoint,
				api_public: apiPublicEndpoint,
				gateway: Config.endpoints.gateway,
				media: Config.endpoints.media,
				cdn: Config.endpoints.cdn,
				marketing: Config.endpoints.marketing,
				admin: Config.endpoints.admin,
				invite: Config.endpoints.invite,
				gift: Config.endpoints.gift,
				webapp: Config.endpoints.webApp,
			},
			captcha: {
				provider: Config.captcha.provider,
				hcaptcha_site_key: Config.captcha.hcaptcha?.siteKey ?? null,
				turnstile_site_key: Config.captcha.turnstile?.siteKey ?? null,
			},
			features: {
				sms_mfa_enabled: Config.sms.enabled,
				voice_enabled: Config.voice.enabled,
				stripe_enabled: Config.stripe.enabled,
				self_hosted: Config.instance.selfHosted,
			},
			push: {
				public_vapid_key: Config.push.publicVapidKey ?? null,
			},
			music: {
				spotify_client_id: Config.music.spotifyClientId ?? null,
			},
		};

		return ctx.json(response);
	});

	app.get('/status/summary', RateLimitMiddleware(RateLimitConfigs.INSTANCE_INFO), async (ctx) => {
		ctx.header('Access-Control-Allow-Origin', '*');

		const services: Array<PublicStatusService> = [
			{
				key: 'api',
				label: 'API',
				status: 'operational',
				uptime_seconds: Math.floor(process.uptime()),
				details: {
					version: API_CODE_VERSION,
				},
			},
		];

		try {
			const gatewayStats = await ctx.get('gatewayService').getNodeStats();
			const gatewayStatus = normalizeGatewayStatus(gatewayStats.status);

			services.push({
				key: 'gateway',
				label: 'Gateway',
				status: gatewayStatus,
				uptime_seconds: Math.floor(gatewayStats.uptime_seconds),
				details: {
					sessions: gatewayStats.sessions,
					guilds: gatewayStats.guilds,
					presences: gatewayStats.presences,
					calls: gatewayStats.calls,
					process_count: gatewayStats.process_count,
				},
			});
		} catch {
			services.push({
				key: 'gateway',
				label: 'Gateway',
				status: 'outage',
				uptime_seconds: null,
			});
		}

		if (Config.metrics.host) {
			try {
				const response = await fetch(`${normalizeMetricsHost(Config.metrics.host)}/_health`, {
					signal: AbortSignal.timeout(2000),
				});

				services.push({
					key: 'metrics',
					label: 'Metrics',
					status: response.ok ? 'operational' : 'outage',
					uptime_seconds: null,
				});
			} catch {
				services.push({
					key: 'metrics',
					label: 'Metrics',
					status: 'outage',
					uptime_seconds: null,
				});
			}
		} else {
			services.push({
				key: 'metrics',
				label: 'Metrics',
				status: 'unknown',
				uptime_seconds: null,
			});
		}

		// Cassandra health
		try {
			const cassClient = ctx.get('cassandraClient' as never) as {execute?: (q: string) => Promise<unknown>} | undefined;
			if (cassClient?.execute) {
				await cassClient.execute('SELECT now() FROM system.local');
				services.push({key: 'database', label: 'Cassandra', status: 'operational', uptime_seconds: null});
			}
		} catch {
			services.push({key: 'database', label: 'Cassandra', status: 'degraded', uptime_seconds: null});
		}

		// Redis health
		try {
			const redis = ctx.get('redisClient' as never) as {ping?: () => Promise<string>} | undefined;
			if (redis?.ping) {
				await redis.ping();
				services.push({key: 'cache', label: 'Redis', status: 'operational', uptime_seconds: null});
			}
		} catch {
			services.push({key: 'cache', label: 'Redis', status: 'degraded', uptime_seconds: null});
		}

		// Voice (LiveKit) health
		if (Config.voice.enabled) {
			try {
				const voiceService = ctx.get('voiceService' as never) as {listRooms?: () => Promise<unknown>} | undefined;
				if (voiceService?.listRooms) {
					await voiceService.listRooms();
					services.push({key: 'voice', label: 'Voice (LiveKit)', status: 'operational', uptime_seconds: null});
				} else {
					services.push({key: 'voice', label: 'Voice (LiveKit)', status: 'operational', uptime_seconds: null});
				}
			} catch {
				services.push({key: 'voice', label: 'Voice (LiveKit)', status: 'degraded', uptime_seconds: null});
			}
		}

		return ctx.json({
			generated_at: new Date().toISOString(),
			overall_status: deriveOverallStatus(services),
			services,
			system: {
				node_version: process.version,
				memory_mb: Math.round(process.memoryUsage().rss / 1048576),
				heap_used_mb: Math.round(process.memoryUsage().heapUsed / 1048576),
				heap_total_mb: Math.round(process.memoryUsage().heapTotal / 1048576),
				platform: process.platform,
				arch: process.arch,
			},
		});
	});
}
