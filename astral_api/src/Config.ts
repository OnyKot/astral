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

import process from 'node:process';

import {z} from '~/Schema';

function required(key: string): string {
	const value = process.env[key];
	if (!value) {
		throw new Error(`Missing required environment variable: ${key}`);
	}
	return value;
}

function optional(key: string): string | undefined {
	return process.env[key] || undefined;
}

function optionalInt(key: string, defaultValue: number): number {
	const value = process.env[key];
	if (!value) return defaultValue;
	const parsed = Number.parseInt(value, 10);
	return Number.isNaN(parsed) ? defaultValue : parsed;
}

function optionalBool(key: string, defaultValue = false): boolean {
	const value = process.env[key];
	if (!value) return defaultValue;
	const normalized = value.trim().toLowerCase();
	return normalized === 'true' || normalized === '1';
}

function extractHostname(url: string): string {
	try {
		return new URL(url).hostname;
	} catch {
		throw new Error(`Invalid URL: ${url}`);
	}
}

function trimTrailingSlash(value: string): string {
	if (value.length > 1 && value.endsWith('/')) {
		return trimTrailingSlash(value.slice(0, -1));
	}
	return value;
}

function normalizePath(path: string): string {
	const trimmed = path.trim();
	if (trimmed === '' || trimmed === '/') return '';
	const withLeadingSlash = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
	return trimTrailingSlash(withLeadingSlash);
}

function appendPath(endpoint: string, path: string): string {
	const cleanEndpoint = trimTrailingSlash(endpoint);
	const normalizedPath = normalizePath(path);
	return normalizedPath ? `${cleanEndpoint}${normalizedPath}` : cleanEndpoint;
}

function parseCommaSeparated(value: string): Array<string> {
	return value
		.split(',')
		.map((item) => item.trim())
		.filter((item) => item.length > 0);
}

function optionalCsv(key: string): Array<string> {
	return parseCommaSeparated(optional(key) || '');
}

function optionalUpperCsv(key: string): Array<string> {
	return optionalCsv(key).map((item) => item.toUpperCase());
}

const ConfigSchema = z.object({
	nodeEnv: z.enum(['development', 'production']),
	port: z.number(),

	postgres: z.object({
		url: z.string(),
	}),

	cassandra: z.object({
		hosts: z.string(),
		keyspace: z.string(),
		localDc: z.string(),
		username: z.string(),
		password: z.string(),
	}),

	redis: z.object({
		url: z.string(),
	}),

	gateway: z.object({
		rpcHost: z.string(),
		rpcPort: z.number(),
		rpcSecret: z.string(),
	}),

	mediaProxy: z.object({
		host: z.string(),
		port: z.number(),
		secretKey: z.string(),
	}),

	geoip: z.object({
		maxmindDbPath: z.string().optional(),
	}),

	legalHold: z.object({
		enabled: z.boolean(),
		dryRun: z.boolean(),
		defaultAction: z.enum(['allow', 'warn']),
		policyName: z.string().optional(),
		supportUrl: z.string().optional(),
		exemptPaths: z.array(z.string()),
		allowCountries: z.array(z.string()),
		warnCountries: z.array(z.string()),
		challengeCountries: z.array(z.string()),
		blockCountries: z.array(z.string()),
	}),

	endpoints: z.object({
		apiPublic: z.string(),
		apiClient: z.string(),
		webApp: z.string(),
		gateway: z.string(),
		media: z.string(),
		cdn: z.string(),
		marketing: z.string(),
		admin: z.string(),
		invite: z.string(),
		gift: z.string(),
	}),

	hosts: z.object({
		invite: z.string(),
		gift: z.string(),
		marketing: z.string(),
		unfurlIgnored: z.array(z.string()),
	}),

	s3: z.object({
		endpoint: z.string(),
		accessKeyId: z.string(),
		secretAccessKey: z.string(),
		buckets: z.object({
			cdn: z.string(),
			uploads: z.string(),
			reports: z.string(),
			harvests: z.string(),
			downloads: z.string(),
		}),
	}),

	email: z.object({
		enabled: z.boolean(),
		apiKey: z.string().optional(),
		webhookPublicKey: z.string().optional(),
		fromEmail: z.string(),
		fromName: z.string(),
		smtp: z
			.object({
				host: z.string(),
				port: z.number(),
				secure: z.boolean(),
				user: z.string(),
				pass: z.string(),
			})
			.optional(),
	}),

	sms: z.object({
		enabled: z.boolean(),
		provider: z.enum(['twilio', 'prelude']),
		accountSid: z.string().optional(),
		authToken: z.string().optional(),
		verifyServiceSid: z.string().optional(),
		preludeApiKey: z.string().optional(),
		preludeApiUrl: z.string(),
	}),

	captcha: z.object({
		enabled: z.boolean(),
		provider: z.enum(['hcaptcha', 'turnstile', 'none']),
		hcaptcha: z
			.object({
				siteKey: z.string(),
				secretKey: z.string(),
			})
			.optional(),
		turnstile: z
			.object({
				siteKey: z.string(),
				secretKey: z.string(),
			})
			.optional(),
	}),

	voice: z.object({
		enabled: z.boolean(),
		apiKey: z.string().optional(),
		apiSecret: z.string().optional(),
		webhookUrl: z.string().optional(),
		url: z.string().optional(),
		internalUrl: z.string().optional(),
		autoCreateDummyData: z.boolean(),
	}),

	search: z.object({
		enabled: z.boolean(),
		url: z.string().optional(),
		apiKey: z.string().optional(),
	}),

	stripe: z.object({
		enabled: z.boolean(),
		secretKey: z.string().optional(),
		webhookSecret: z.string().optional(),
		prices: z
			.object({
				monthlyUsd: z.string().optional(),
				monthlyEur: z.string().optional(),
				yearlyUsd: z.string().optional(),
				yearlyEur: z.string().optional(),
				visionaryUsd: z.string().optional(),
				visionaryEur: z.string().optional(),
				giftVisionaryUsd: z.string().optional(),
				giftVisionaryEur: z.string().optional(),
				gift1MonthUsd: z.string().optional(),
				gift1MonthEur: z.string().optional(),
				gift1YearUsd: z.string().optional(),
				gift1YearEur: z.string().optional(),
			})
			.optional(),
	}),

	tbank: z.object({
		enabled: z.boolean(),
		terminalKey: z.string().optional(),
		password: z.string().optional(),
		apiUrl: z.string(),
		notificationUrl: z.string().optional(),
		successUrl: z.string().optional(),
		failUrl: z.string().optional(),
		prices: z
			.object({
				monthlyId: z.string(),
				yearlyId: z.string(),
				visionaryId: z.string(),
				giftVisionaryId: z.string(),
				gift1MonthId: z.string(),
				gift1YearId: z.string(),
				monthlyAmountKopeks: z.number().int().positive(),
				yearlyAmountKopeks: z.number().int().positive(),
				visionaryAmountKopeks: z.number().int().positive(),
				giftVisionaryAmountKopeks: z.number().int().positive(),
				gift1MonthAmountKopeks: z.number().int().positive(),
				gift1YearAmountKopeks: z.number().int().positive(),
			})
			.optional(),
	}),

	cloudpayments: z.object({
		enabled: z.boolean(),
		publicId: z.string().optional(),
		apiSecret: z.string().optional(),
		apiUrl: z.string(),
		notificationUrl: z.string().optional(),
		successUrl: z.string().optional(),
		failUrl: z.string().optional(),
		prices: z
			.object({
				monthlyId: z.string(),
				yearlyId: z.string(),
				visionaryId: z.string(),
				giftVisionaryId: z.string(),
				gift1MonthId: z.string(),
				gift1YearId: z.string(),
				monthlyAmountKopeks: z.number().int().positive(),
				yearlyAmountKopeks: z.number().int().positive(),
				visionaryAmountKopeks: z.number().int().positive(),
				giftVisionaryAmountKopeks: z.number().int().positive(),
				gift1MonthAmountKopeks: z.number().int().positive(),
				gift1YearAmountKopeks: z.number().int().positive(),
			})
			.optional(),
	}),

	intellectmoney: z.object({
		enabled: z.boolean(),
		eshopId: z.string().optional(),
		apiToken: z.string().optional(),
		signingKey: z.string().optional(),
		notificationSecret: z.string().optional(),
		apiUrl: z.string(),
		notificationUrl: z.string().optional(),
		successUrl: z.string().optional(),
		failUrl: z.string().optional(),
		prices: z
			.object({
				monthlyId: z.string(),
				yearlyId: z.string(),
				visionaryId: z.string(),
				giftVisionaryId: z.string(),
				gift1MonthId: z.string(),
				gift1YearId: z.string(),
				monthlyAmountKopeks: z.number().int().positive(),
				yearlyAmountKopeks: z.number().int().positive(),
				visionaryAmountKopeks: z.number().int().positive(),
				giftVisionaryAmountKopeks: z.number().int().positive(),
				gift1MonthAmountKopeks: z.number().int().positive(),
				gift1YearAmountKopeks: z.number().int().positive(),
			})
			.optional(),
	}),

	wata: z.object({
		enabled: z.boolean(),
		terminalId: z.string().optional(),
		publicId: z.string().optional(),
		accessToken: z.string().optional(),
		directSbpEnabled: z.boolean(),
		apiUrl: z.string(),
		publicKeyUrl: z.string(),
		notificationUrl: z.string().optional(),
		successUrl: z.string().optional(),
		failUrl: z.string().optional(),
		prices: z
			.object({
				monthlyId: z.string(),
				yearlyId: z.string(),
				visionaryId: z.string(),
				giftVisionaryId: z.string(),
				gift1MonthId: z.string(),
				gift1YearId: z.string(),
				monthlyAmountKopeks: z.number().int().positive(),
				yearlyAmountKopeks: z.number().int().positive(),
				visionaryAmountKopeks: z.number().int().positive(),
				giftVisionaryAmountKopeks: z.number().int().positive(),
				gift1MonthAmountKopeks: z.number().int().positive(),
				gift1YearAmountKopeks: z.number().int().positive(),
			})
			.optional(),
	}),

	cloudflare: z.object({
		purgeEnabled: z.boolean(),
		zoneId: z.string().optional(),
		apiToken: z.string().optional(),
	}),

	alerts: z.object({
		webhookUrl: z.string().url().optional(),
	}),

	clamav: z.object({
		enabled: z.boolean(),
		host: z.string(),
		port: z.number(),
		failOpen: z.boolean(),
	}),

	adminOauth2: z.object({
		clientId: z.string().optional(),
		clientSecret: z.string().optional(),
		redirectUri: z.string(),
		autoCreate: z.boolean(),
	}),

	musicOauth2: z.object({
		clientId: z.string().optional(),
		clientSecret: z.string().optional(),
		redirectUri: z.string(),
		appEndpoint: z.string(),
		autoCreate: z.boolean(),
	}),

	musicSearch: z.object({
		enabled: z.boolean(),
		upstreams: z.array(z.string()),
		cacheTtlSeconds: z.number().int().nonnegative(),
		sectionLimit: z.number().int().positive(),
		minIndexedHits: z.number().int().nonnegative(),
		upstreamTimeoutMs: z.number().int().positive(),
		typesense: z.object({
			url: z.string().optional(),
			apiKey: z.string().optional(),
			collection: z.string(),
			timeoutMs: z.number().int().positive(),
		}),
	}),

	grok: z.object({
		enabled: z.boolean(),
		apiKey: z.string().optional(),
		apiUrl: z.string(),
		model: z.string(),
		imageModel: z.string(),
		moderationEnabled: z.boolean(),
		searchEnhancementEnabled: z.boolean(),
	}),

	adminBootstrap: z.object({
		userIds: z.array(z.string()),
		emails: z.array(z.string()),
		acls: z.array(z.string()),
	}),

	auth: z.object({
		sudoModeSecret: z.string(),
		passkeys: z.object({
			rpName: z.string(),
			rpId: z.string(),
			allowedOrigins: z.array(z.string()),
		}),
	}),

	cookie: z.object({
		domain: z.string(),
		secure: z.boolean(),
	}),

	tenor: z.object({
		apiKey: z.string().optional(),
	}),

	youtube: z.object({
		apiKey: z.string().optional(),
	}),

	instance: z.object({
		selfHosted: z.boolean(),
		freePremium: z.boolean(),
		autoJoinInviteCode: z.string().optional(),
		requireInviteCodeForRegistration: z.boolean(),
		visionariesGuildId: z.string().optional(),
		operatorsGuildId: z.string().optional(),
		visionarySlotCount: z.number().int().positive(),
	}),

	dev: z.object({
		relaxRegistrationRateLimits: z.boolean(),
		disableRateLimits: z.boolean(),
		grantStaffOnRegistration: z.boolean(),
		testModeEnabled: z.boolean(),
		testHarnessToken: z.string().optional(),
	}),

	attachmentDecayEnabled: z.boolean(),

	deletionGracePeriodHours: z.number(),
	inactivityDeletionThresholdDays: z.number().optional(),

	push: z.object({
		publicVapidKey: z.string().optional(),
	}),

	music: z.object({
		spotifyClientId: z.string().optional(),
	}),

	metrics: z.object({
		host: z.string().optional(),
	}),
});

function loadConfig() {
	const apiPublicEndpoint = required('ASTRAL_API_PUBLIC_ENDPOINT');
	const apiClientEndpoint = optional('ASTRAL_API_CLIENT_ENDPOINT') || apiPublicEndpoint;
	const webAppEndpoint = required('ASTRAL_APP_ENDPOINT');
	const gatewayEndpoint = required('ASTRAL_GATEWAY_ENDPOINT');
	const mediaEndpoint = required('ASTRAL_MEDIA_ENDPOINT');
	const cdnEndpoint = required('ASTRAL_CDN_ENDPOINT');
	const marketingEndpoint = appendPath(required('ASTRAL_MARKETING_ENDPOINT'), required('ASTRAL_PATH_MARKETING'));
	const adminEndpoint = appendPath(required('ASTRAL_ADMIN_ENDPOINT'), required('ASTRAL_PATH_ADMIN'));
	const inviteEndpoint = required('ASTRAL_INVITE_ENDPOINT');
	const giftEndpoint = required('ASTRAL_GIFT_ENDPOINT');

	const passkeyOriginsEnv = optional('PASSKEY_ALLOWED_ORIGINS');
	const passkeyAllowedOrigins = passkeyOriginsEnv
		? parseCommaSeparated(passkeyOriginsEnv)
		: Array.from(new Set([apiPublicEndpoint, webAppEndpoint, apiClientEndpoint]));

	const testModeEnabled = optionalBool('ASTRAL_TEST_MODE');
	const maxmindDbPath = optional('MAXMIND_DB_PATH');
	const legalHoldExemptPaths = Array.from(
		new Set(
			optionalCsv('ASTRAL_LEGAL_HOLD_EXEMPT_PATHS').concat([
				'/_health',
				'/status/summary',
				'/v1/status/summary',
				'/_rpc',
				'/webhooks/livekit',
			]),
		),
	);

	return ConfigSchema.parse({
		nodeEnv: optional('NODE_ENV') || 'development',
		port: optionalInt('ASTRAL_API_PORT', 8080),

		postgres: {
			url: required('DATABASE_URL'),
		},

		cassandra: {
			hosts: required('CASSANDRA_HOSTS'),
			keyspace: required('CASSANDRA_KEYSPACE'),
			localDc: optional('CASSANDRA_LOCAL_DC'),
			username: required('CASSANDRA_USERNAME'),
			password: required('CASSANDRA_PASSWORD'),
		},

		redis: {
			url: required('REDIS_URL'),
		},

		gateway: {
			rpcHost: optional('ASTRAL_GATEWAY_RPC_HOST') || 'gateway',
			rpcPort: optionalInt('ASTRAL_GATEWAY_RPC_PORT', 8081),
			rpcSecret: required('GATEWAY_RPC_SECRET'),
		},

		mediaProxy: {
			host: optional('ASTRAL_MEDIA_PROXY_HOST') || 'media',
			port: optionalInt('ASTRAL_MEDIA_PROXY_PORT', 8080),
			secretKey: required('MEDIA_PROXY_SECRET_KEY'),
		},

		geoip: {
			maxmindDbPath,
		},

		legalHold: {
			enabled: optionalBool('ASTRAL_LEGAL_HOLD_ENABLED'),
			dryRun: optionalBool('ASTRAL_LEGAL_HOLD_DRY_RUN', true),
			defaultAction: optional('ASTRAL_LEGAL_HOLD_DEFAULT_ACTION') === 'warn' ? 'warn' : 'allow',
			policyName: optional('ASTRAL_LEGAL_HOLD_POLICY_NAME'),
			supportUrl: optional('ASTRAL_LEGAL_HOLD_SUPPORT_URL'),
			exemptPaths: legalHoldExemptPaths,
			allowCountries: optionalUpperCsv('ASTRAL_LEGAL_HOLD_ALLOW_COUNTRIES'),
			warnCountries: optionalUpperCsv('ASTRAL_LEGAL_HOLD_WARN_COUNTRIES'),
			challengeCountries: optionalUpperCsv('ASTRAL_LEGAL_HOLD_CHALLENGE_COUNTRIES'),
			blockCountries: optionalUpperCsv('ASTRAL_LEGAL_HOLD_BLOCK_COUNTRIES'),
		},

		endpoints: {
			apiPublic: apiPublicEndpoint,
			apiClient: apiClientEndpoint,
			webApp: webAppEndpoint,
			gateway: gatewayEndpoint,
			media: mediaEndpoint,
			cdn: cdnEndpoint,
			marketing: marketingEndpoint,
			admin: adminEndpoint,
			invite: inviteEndpoint,
			gift: giftEndpoint,
		},

		hosts: {
			invite: extractHostname(inviteEndpoint),
			gift: extractHostname(giftEndpoint),
			marketing: extractHostname(marketingEndpoint),
			unfurlIgnored: Array.from(
				new Set(parseCommaSeparated(optional('ASTRAL_UNFURL_IGNORED_HOSTS') || '').concat(['asrtal.ru'])),
			),
		},

		s3: {
			endpoint: required('AWS_S3_ENDPOINT'),
			accessKeyId: required('AWS_ACCESS_KEY_ID'),
			secretAccessKey: required('AWS_SECRET_ACCESS_KEY'),
			buckets: {
				cdn: required('AWS_S3_BUCKET_CDN'),
				uploads: required('AWS_S3_BUCKET_UPLOADS'),
				reports: required('AWS_S3_BUCKET_REPORTS'),
				harvests: required('AWS_S3_BUCKET_HARVESTS'),
				downloads: required('AWS_S3_BUCKET_DOWNLOADS'),
			},
		},

		email: {
			enabled: optionalBool('EMAIL_ENABLED'),
			apiKey: optional('SENDGRID_API_KEY'),
			webhookPublicKey: optional('SENDGRID_WEBHOOK_PUBLIC_KEY'),
			fromEmail: optional('SENDGRID_FROM_EMAIL') || 'noreply@astraof.com',
			fromName: optional('SENDGRID_FROM_NAME') || 'Astral',
			smtp:
				optional('SMTP_HOST') && optional('SMTP_USER') && optional('SMTP_PASS')
					? {
							host: required('SMTP_HOST'),
							port: optionalInt('SMTP_PORT', 465),
							secure: optionalBool('SMTP_SECURE', true),
							user: required('SMTP_USER'),
							pass: required('SMTP_PASS'),
						}
					: undefined,
		},

		sms: {
			enabled: optionalBool('SMS_ENABLED'),
			provider: (optional('SMS_PROVIDER') as 'twilio' | 'prelude') || (optional('PRELUDE_API_KEY') ? 'prelude' : 'twilio'),
			accountSid: optional('TWILIO_ACCOUNT_SID'),
			authToken: optional('TWILIO_AUTH_TOKEN'),
			verifyServiceSid: optional('TWILIO_VERIFY_SERVICE_SID'),
			preludeApiKey: optional('PRELUDE_API_KEY'),
			preludeApiUrl: trimTrailingSlash(optional('PRELUDE_API_URL') || 'https://api.prelude.dev/v2'),
		},

		captcha: {
			enabled: optionalBool('CAPTCHA_ENABLED'),
			provider: (optional('CAPTCHA_PRIMARY_PROVIDER') as 'hcaptcha' | 'turnstile' | 'none') || 'none',
			hcaptcha:
				optional('HCAPTCHA_SITE_KEY') && optional('HCAPTCHA_SECRET_KEY')
					? {
							siteKey: required('HCAPTCHA_SITE_KEY'),
							secretKey: required('HCAPTCHA_SECRET_KEY'),
						}
					: undefined,
			turnstile:
				optional('TURNSTILE_SITE_KEY') && optional('TURNSTILE_SECRET_KEY')
					? {
							siteKey: required('TURNSTILE_SITE_KEY'),
							secretKey: required('TURNSTILE_SECRET_KEY'),
						}
					: undefined,
		},

		voice: {
			enabled: optionalBool('VOICE_ENABLED'),
			apiKey: optional('LIVEKIT_API_KEY'),
			apiSecret: optional('LIVEKIT_API_SECRET'),
			webhookUrl: optional('LIVEKIT_WEBHOOK_URL'),
			url: optional('LIVEKIT_URL'),
			internalUrl: optional('LIVEKIT_INTERNAL_URL') || optional('LIVEKIT_ADMIN_URL'),
			autoCreateDummyData: optionalBool('LIVEKIT_AUTO_CREATE_DUMMY_DATA'),
		},

		search: {
			enabled: optionalBool('SEARCH_ENABLED'),
			url: optional('MEILISEARCH_URL'),
			apiKey: optional('MEILISEARCH_API_KEY'),
		},

		stripe: {
			enabled: optionalBool('STRIPE_ENABLED'),
			secretKey: optional('STRIPE_SECRET_KEY'),
			webhookSecret: optional('STRIPE_WEBHOOK_SECRET'),
			prices: optionalBool('STRIPE_ENABLED')
				? {
						monthlyUsd: optional('STRIPE_PRICE_ID_MONTHLY_USD'),
						monthlyEur: optional('STRIPE_PRICE_ID_MONTHLY_EUR'),
						yearlyUsd: optional('STRIPE_PRICE_ID_YEARLY_USD'),
						yearlyEur: optional('STRIPE_PRICE_ID_YEARLY_EUR'),
						visionaryUsd: optional('STRIPE_PRICE_ID_VISIONARY_USD'),
						visionaryEur: optional('STRIPE_PRICE_ID_VISIONARY_EUR'),
						giftVisionaryUsd: optional('STRIPE_PRICE_ID_GIFT_VISIONARY_USD'),
						giftVisionaryEur: optional('STRIPE_PRICE_ID_GIFT_VISIONARY_EUR'),
						gift1MonthUsd: optional('STRIPE_PRICE_ID_GIFT_1_MONTH_USD'),
						gift1MonthEur: optional('STRIPE_PRICE_ID_GIFT_1_MONTH_EUR'),
						gift1YearUsd: optional('STRIPE_PRICE_ID_GIFT_1_YEAR_USD'),
						gift1YearEur: optional('STRIPE_PRICE_ID_GIFT_1_YEAR_EUR'),
					}
				: undefined,
		},

		tbank: {
			enabled: optionalBool('TBANK_ACQUIRING_ENABLED'),
			terminalKey: optional('TBANK_TERMINAL_KEY'),
			password: optional('TBANK_PASSWORD'),
			apiUrl: optional('TBANK_API_URL') || 'https://securepay.tinkoff.ru/v2',
			notificationUrl: optional('TBANK_NOTIFICATION_URL'),
			successUrl: optional('TBANK_SUCCESS_URL'),
			failUrl: optional('TBANK_FAIL_URL'),
			prices: optionalBool('TBANK_ACQUIRING_ENABLED')
				? {
						monthlyId: optional('TBANK_PRICE_ID_MONTHLY_RUB') || 'tbank_monthly_rub',
						yearlyId: optional('TBANK_PRICE_ID_YEARLY_RUB') || 'tbank_yearly_rub',
						visionaryId: optional('TBANK_PRICE_ID_VISIONARY_RUB') || 'tbank_visionary_rub',
						giftVisionaryId:
							optional('TBANK_PRICE_ID_GIFT_VISIONARY_RUB') || 'tbank_gift_visionary_rub',
						gift1MonthId: optional('TBANK_PRICE_ID_GIFT_1_MONTH_RUB') || 'tbank_gift_1_month_rub',
						gift1YearId: optional('TBANK_PRICE_ID_GIFT_1_YEAR_RUB') || 'tbank_gift_1_year_rub',
						monthlyAmountKopeks: optionalInt('TBANK_PRICE_AMOUNT_MONTHLY_KOPEKS', 49_000),
						yearlyAmountKopeks: optionalInt('TBANK_PRICE_AMOUNT_YEARLY_KOPEKS', 490_000),
						visionaryAmountKopeks: optionalInt('TBANK_PRICE_AMOUNT_VISIONARY_KOPEKS', 2_990_000),
						giftVisionaryAmountKopeks: optionalInt(
							'TBANK_PRICE_AMOUNT_GIFT_VISIONARY_KOPEKS',
							2_990_000,
						),
						gift1MonthAmountKopeks: optionalInt('TBANK_PRICE_AMOUNT_GIFT_1_MONTH_KOPEKS', 49_000),
						gift1YearAmountKopeks: optionalInt('TBANK_PRICE_AMOUNT_GIFT_1_YEAR_KOPEKS', 490_000),
					}
				: undefined,
		},

		cloudpayments: {
			enabled: optionalBool('CLOUDPAYMENTS_ENABLED'),
			publicId: optional('CLOUDPAYMENTS_PUBLIC_ID'),
			apiSecret: optional('CLOUDPAYMENTS_API_SECRET'),
			apiUrl: optional('CLOUDPAYMENTS_API_URL') || 'https://api.cloudpayments.ru',
			notificationUrl: optional('CLOUDPAYMENTS_NOTIFICATION_URL'),
			successUrl: optional('CLOUDPAYMENTS_SUCCESS_URL'),
			failUrl: optional('CLOUDPAYMENTS_FAIL_URL'),
			prices: optionalBool('CLOUDPAYMENTS_ENABLED')
				? {
						monthlyId: optional('CLOUDPAYMENTS_PRICE_ID_MONTHLY_RUB') || 'cloudpayments_monthly_rub',
						yearlyId: optional('CLOUDPAYMENTS_PRICE_ID_YEARLY_RUB') || 'cloudpayments_yearly_rub',
						visionaryId: optional('CLOUDPAYMENTS_PRICE_ID_VISIONARY_RUB') || 'cloudpayments_visionary_rub',
						giftVisionaryId:
							optional('CLOUDPAYMENTS_PRICE_ID_GIFT_VISIONARY_RUB') || 'cloudpayments_gift_visionary_rub',
						gift1MonthId:
							optional('CLOUDPAYMENTS_PRICE_ID_GIFT_1_MONTH_RUB') || 'cloudpayments_gift_1_month_rub',
						gift1YearId:
							optional('CLOUDPAYMENTS_PRICE_ID_GIFT_1_YEAR_RUB') || 'cloudpayments_gift_1_year_rub',
						monthlyAmountKopeks: optionalInt('CLOUDPAYMENTS_PRICE_AMOUNT_MONTHLY_KOPEKS', 49_000),
						yearlyAmountKopeks: optionalInt('CLOUDPAYMENTS_PRICE_AMOUNT_YEARLY_KOPEKS', 490_000),
						visionaryAmountKopeks: optionalInt('CLOUDPAYMENTS_PRICE_AMOUNT_VISIONARY_KOPEKS', 2_990_000),
						giftVisionaryAmountKopeks: optionalInt(
							'CLOUDPAYMENTS_PRICE_AMOUNT_GIFT_VISIONARY_KOPEKS',
							2_990_000,
						),
						gift1MonthAmountKopeks: optionalInt('CLOUDPAYMENTS_PRICE_AMOUNT_GIFT_1_MONTH_KOPEKS', 49_000),
						gift1YearAmountKopeks: optionalInt('CLOUDPAYMENTS_PRICE_AMOUNT_GIFT_1_YEAR_KOPEKS', 490_000),
					}
				: undefined,
		},

		intellectmoney: {
			enabled: optionalBool('INTELLECTMONEY_ENABLED'),
			eshopId: optional('INTELLECTMONEY_ESHOP_ID'),
			apiToken: optional('INTELLECTMONEY_API_TOKEN'),
			signingKey: optional('INTELLECTMONEY_SIGNING_KEY'),
			notificationSecret: optional('INTELLECTMONEY_NOTIFICATION_SECRET'),
			apiUrl: optional('INTELLECTMONEY_API_URL') || 'https://api.intellectmoney.ru',
			notificationUrl: optional('INTELLECTMONEY_NOTIFICATION_URL'),
			successUrl: optional('INTELLECTMONEY_SUCCESS_URL'),
			failUrl: optional('INTELLECTMONEY_FAIL_URL'),
			prices: optionalBool('INTELLECTMONEY_ENABLED')
				? {
						monthlyId: optional('INTELLECTMONEY_PRICE_ID_MONTHLY_RUB') || 'intellectmoney_monthly_rub',
						yearlyId: optional('INTELLECTMONEY_PRICE_ID_YEARLY_RUB') || 'intellectmoney_yearly_rub',
						visionaryId: optional('INTELLECTMONEY_PRICE_ID_VISIONARY_RUB') || 'intellectmoney_visionary_rub',
						giftVisionaryId:
							optional('INTELLECTMONEY_PRICE_ID_GIFT_VISIONARY_RUB') || 'intellectmoney_gift_visionary_rub',
						gift1MonthId:
							optional('INTELLECTMONEY_PRICE_ID_GIFT_1_MONTH_RUB') || 'intellectmoney_gift_1_month_rub',
						gift1YearId:
							optional('INTELLECTMONEY_PRICE_ID_GIFT_1_YEAR_RUB') || 'intellectmoney_gift_1_year_rub',
						monthlyAmountKopeks: optionalInt('INTELLECTMONEY_PRICE_AMOUNT_MONTHLY_KOPEKS', 49_000),
						yearlyAmountKopeks: optionalInt('INTELLECTMONEY_PRICE_AMOUNT_YEARLY_KOPEKS', 490_000),
						visionaryAmountKopeks: optionalInt('INTELLECTMONEY_PRICE_AMOUNT_VISIONARY_KOPEKS', 2_990_000),
						giftVisionaryAmountKopeks: optionalInt(
							'INTELLECTMONEY_PRICE_AMOUNT_GIFT_VISIONARY_KOPEKS',
							2_990_000,
						),
						gift1MonthAmountKopeks: optionalInt(
							'INTELLECTMONEY_PRICE_AMOUNT_GIFT_1_MONTH_KOPEKS',
							49_000,
						),
						gift1YearAmountKopeks: optionalInt('INTELLECTMONEY_PRICE_AMOUNT_GIFT_1_YEAR_KOPEKS', 490_000),
				  }
				: undefined,
		},

		wata: {
			enabled: optionalBool('WATA_ENABLED'),
			terminalId: optional('WATA_TERMINAL_ID'),
			publicId: optional('WATA_PUBLIC_ID'),
			accessToken: optional('WATA_ACCESS_TOKEN'),
			directSbpEnabled: optionalBool('WATA_DIRECT_SBP_ENABLED'),
			apiUrl: optional('WATA_API_URL') || 'https://api.wata.pro/api/h2h',
			publicKeyUrl: optional('WATA_PUBLIC_KEY_URL') || 'https://api.wata.pro/api/h2h/public-key',
			notificationUrl: optional('WATA_NOTIFICATION_URL'),
			successUrl: optional('WATA_SUCCESS_URL'),
			failUrl: optional('WATA_FAIL_URL'),
			prices: optionalBool('WATA_ENABLED')
				? {
						monthlyId: optional('WATA_PRICE_ID_MONTHLY_RUB') || 'wata_monthly_rub',
						yearlyId: optional('WATA_PRICE_ID_YEARLY_RUB') || 'wata_yearly_rub',
						visionaryId: optional('WATA_PRICE_ID_VISIONARY_RUB') || 'wata_visionary_rub',
						giftVisionaryId: optional('WATA_PRICE_ID_GIFT_VISIONARY_RUB') || 'wata_gift_visionary_rub',
						gift1MonthId: optional('WATA_PRICE_ID_GIFT_1_MONTH_RUB') || 'wata_gift_1_month_rub',
						gift1YearId: optional('WATA_PRICE_ID_GIFT_1_YEAR_RUB') || 'wata_gift_1_year_rub',
						monthlyAmountKopeks: optionalInt('WATA_PRICE_AMOUNT_MONTHLY_KOPEKS', 49_000),
						yearlyAmountKopeks: optionalInt('WATA_PRICE_AMOUNT_YEARLY_KOPEKS', 490_000),
						visionaryAmountKopeks: optionalInt('WATA_PRICE_AMOUNT_VISIONARY_KOPEKS', 2_990_000),
						giftVisionaryAmountKopeks: optionalInt('WATA_PRICE_AMOUNT_GIFT_VISIONARY_KOPEKS', 2_990_000),
						gift1MonthAmountKopeks: optionalInt('WATA_PRICE_AMOUNT_GIFT_1_MONTH_KOPEKS', 49_000),
						gift1YearAmountKopeks: optionalInt('WATA_PRICE_AMOUNT_GIFT_1_YEAR_KOPEKS', 490_000),
				  }
				: undefined,
		},

		cloudflare: {
			purgeEnabled: optionalBool('CLOUDFLARE_PURGE_ENABLED'),
			zoneId: optional('CLOUDFLARE_ZONE_ID'),
			apiToken: optional('CLOUDFLARE_API_TOKEN'),
		},

		alerts: {
			webhookUrl: optional('ALERT_WEBHOOK_URL'),
		},

		clamav: {
			enabled: optionalBool('CLAMAV_ENABLED'),
			host: optional('CLAMAV_HOST') || 'clamav',
			port: optionalInt('CLAMAV_PORT', 3310),
			failOpen: optionalBool('CLAMAV_FAIL_OPEN', true),
		},

		adminOauth2: {
			clientId: optional('ADMIN_OAUTH2_CLIENT_ID'),
			clientSecret: optional('ADMIN_OAUTH2_CLIENT_SECRET'),
			redirectUri: `${adminEndpoint}/oauth2_callback`,
			autoCreate: optionalBool('ADMIN_OAUTH2_AUTO_CREATE'),
		},

		musicOauth2: {
			clientId: optional('MUSIC_OAUTH2_CLIENT_ID'),
			clientSecret: optional('MUSIC_OAUTH2_CLIENT_SECRET'),
			redirectUri:
				optional('MUSIC_OAUTH2_REDIRECT_URI') ||
				`${trimTrailingSlash(optional('ASTRAL_MUSIC_APP_ENDPOINT') || 'https://music.astraof.com')}/api/music/auth/callback`,
			appEndpoint: trimTrailingSlash(optional('ASTRAL_MUSIC_APP_ENDPOINT') || 'https://music.astraof.com'),
			autoCreate: optionalBool('MUSIC_OAUTH2_AUTO_CREATE', true),
		},

		musicSearch: {
			enabled: optionalBool('MUSIC_SEARCH_ENABLED', true),
			upstreams:
				optionalCsv('MUSIC_SEARCH_UPSTREAMS').length > 0
					? optionalCsv('MUSIC_SEARCH_UPSTREAMS')
					: [
							'https://triton.squid.wtf',
							'https://wolf.qqdl.site',
							'https://maus.qqdl.site',
							'https://vogel.qqdl.site',
							'https://hund.qqdl.site',
							'https://tidal.kinoplus.online',
					  ],
			cacheTtlSeconds: optionalInt('MUSIC_SEARCH_CACHE_TTL_SECONDS', 300),
			sectionLimit: optionalInt('MUSIC_SEARCH_SECTION_LIMIT', 12),
			minIndexedHits: optionalInt('MUSIC_SEARCH_MIN_INDEXED_HITS', 8),
			upstreamTimeoutMs: optionalInt('MUSIC_SEARCH_UPSTREAM_TIMEOUT_MS', 4500),
			typesense: {
				url: optional('MUSIC_TYPESENSE_URL'),
				apiKey: optional('MUSIC_TYPESENSE_API_KEY'),
				collection: optional('MUSIC_TYPESENSE_COLLECTION') || 'astramusic_music_catalog',
				timeoutMs: optionalInt('MUSIC_TYPESENSE_TIMEOUT_MS', 1800),
			},
		},

		grok: {
			enabled: optionalBool('GROK_ENABLED'),
			apiKey: optional('GROK_API_KEY'),
			apiUrl: optional('GROK_API_URL') || optional('GROK_BASE_URL') || 'https://api.x.ai/v1',
			model: optional('GROK_MODEL') || 'grok-4',
			imageModel: optional('GROK_IMAGE_MODEL') || 'grok-2-image-1212',
			moderationEnabled: optionalBool('GROK_MODERATION_ENABLED'),
			searchEnhancementEnabled: optionalBool('GROK_SEARCH_ENHANCEMENT_ENABLED'),
		},

		adminBootstrap: {
			userIds: optionalCsv('ADMIN_BOOTSTRAP_USER_IDS'),
			emails: optionalCsv('ADMIN_BOOTSTRAP_EMAILS'),
			acls: optionalCsv('ADMIN_BOOTSTRAP_ACLS'),
		},

		auth: {
			sudoModeSecret: required('SUDO_MODE_SECRET'),
			passkeys: {
				rpName: optional('PASSKEY_RP_NAME') || 'Astral',
				rpId: optional('PASSKEY_RP_ID') || extractHostname(webAppEndpoint),
				allowedOrigins: passkeyAllowedOrigins,
			},
		},

		cookie: {
			domain: optional('ASTRAL_COOKIE_DOMAIN') || '',
			secure: optionalBool('ASTRAL_COOKIE_SECURE', true),
		},

		tenor: {
			apiKey: optional('TENOR_API_KEY'),
		},

		youtube: {
			apiKey: optional('YOUTUBE_API_KEY'),
		},

		instance: {
			selfHosted: optionalBool('SELF_HOSTED'),
			freePremium: optionalBool('FREE_PREMIUM'),
			autoJoinInviteCode: optional('AUTO_JOIN_INVITE_CODE'),
			requireInviteCodeForRegistration: optionalBool('REQUIRE_INVITE_CODE_FOR_REGISTRATION'),
			visionariesGuildId: optional('ASTRAL_VISIONARIES_GUILD_ID'),
			operatorsGuildId: optional('ASTRAL_OPERATORS_GUILD_ID'),
			visionarySlotCount: optionalInt('VISIONARY_SLOT_COUNT', 5),
		},

		dev: {
			relaxRegistrationRateLimits: optionalBool('RELAX_REGISTRATION_RATE_LIMITS'),
			disableRateLimits: optionalBool('DISABLE_RATE_LIMITS'),
			grantStaffOnRegistration: optionalBool('DEV_GRANT_STAFF_ON_REGISTRATION'),
			testModeEnabled,
			testHarnessToken: optional('ASTRAL_TEST_TOKEN'),
		},

		attachmentDecayEnabled: optionalBool('ATTACHMENT_DECAY_ENABLED', true),

		deletionGracePeriodHours: testModeEnabled ? 0.01 : 336,
		inactivityDeletionThresholdDays: optionalInt('INACTIVITY_DELETION_THRESHOLD_DAYS', 365 * 2),

		push: {
			publicVapidKey: optional('VAPID_PUBLIC_KEY'),
		},

		music: {
			spotifyClientId: optional('SPOTIFY_CLIENT_ID'),
		},

		metrics: {
			host: optional('ASTRAL_METRICS_HOST'),
		},
	});
}

export const Config = loadConfig();

export type Config = z.infer<typeof ConfigSchema>;
