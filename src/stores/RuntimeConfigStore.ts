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

import {makeAutoObservable, reaction, runInAction} from 'mobx';
import Config from '~/Config';
import {API_CODE_VERSION} from '~/Constants';
import type {HttpRequestConfig} from '~/lib/HttpClient';
import HttpClient from '~/lib/HttpClient';
import {makePersistent} from '~/lib/MobXPersistence';
import {wrapUrlWithElectronApiProxy} from '~/utils/ApiProxyUtils';
import {isFirstPartyHost, normalizeHostname} from '~/utils/FirstPartyHosts';
import DeveloperOptionsStore from './DeveloperOptionsStore';

export interface InstanceFeatures {
	sms_mfa_enabled: boolean;
	voice_enabled: boolean;
	stripe_enabled: boolean;
	self_hosted: boolean;
}

export interface InstanceEndpoints {
	api_client?: string;
	api_public?: string;
	gateway: string;
	media: string;
	cdn: string;
	marketing: string;
	invite: string;
	gift: string;
	webapp: string;
}

export interface InstanceCaptcha {
	provider: 'hcaptcha' | 'turnstile' | 'none';
	hcaptcha_site_key: string | null;
	turnstile_site_key: string | null;
}

export interface InstancePush {
	public_vapid_key: string | null;
}

export interface InstanceMusic {
	spotify_client_id: string | null;
}

export interface InstanceDiscoveryResponse {
	api_code_version: number;
	endpoints: InstanceEndpoints;
	captcha: InstanceCaptcha;
	features: InstanceFeatures;
	push?: InstancePush;
	music?: InstanceMusic;
}

export interface RuntimeConfigSnapshot {
	apiEndpoint: string;
	apiPublicEndpoint: string;
	gatewayEndpoint: string;
	mediaEndpoint: string;
	cdnEndpoint: string;
	marketingEndpoint: string;
	adminEndpoint: string;
	inviteEndpoint: string;
	giftEndpoint: string;
	webAppEndpoint: string;
	captchaProvider: 'hcaptcha' | 'turnstile' | 'none';
	hcaptchaSiteKey: string | null;
	turnstileSiteKey: string | null;
	apiCodeVersion: number;
	features: InstanceFeatures;
	publicPushVapidKey: string | null;
	spotifyClientId: string | null;
}

type InitState = 'initializing' | 'ready' | 'error';

class RuntimeConfigStore {
	private _initState: InitState = 'initializing';
	private _initError: Error | null = null;

	private _initPromise: Promise<void>;
	private _resolveInit!: () => void;
	private _rejectInit!: (err: Error) => void;

	private _connectSeq = 0;

	apiEndpoint: string = '';
	apiPublicEndpoint: string = '';
	gatewayEndpoint: string = '';
	mediaEndpoint: string = '';
	cdnEndpoint: string = '';
	marketingEndpoint: string = '';
	adminEndpoint: string = '';
	inviteEndpoint: string = '';
	giftEndpoint: string = '';
	webAppEndpoint: string = '';

	captchaProvider: 'hcaptcha' | 'turnstile' | 'none' = 'none';
	hcaptchaSiteKey: string | null = null;
	turnstileSiteKey: string | null = null;

	apiCodeVersion: number = API_CODE_VERSION;
	features: InstanceFeatures = {
		sms_mfa_enabled: false,
		voice_enabled: false,
		stripe_enabled: false,
		self_hosted: false,
	};
	publicPushVapidKey: string | null = null;
	spotifyClientId: string | null = null;

	constructor() {
		this._initPromise = new Promise<void>((resolve, reject) => {
			this._resolveInit = resolve;
			this._rejectInit = reject;
		});

		makeAutoObservable(this, {}, {autoBind: true});

		this.initialize().catch(() => {});

		reaction(
			() => this.apiEndpoint,
			(endpoint) => {
				if (endpoint) {
					HttpClient.setBaseUrl(endpoint, Config.PUBLIC_API_VERSION);
				}
			},
			{fireImmediately: true},
		);
	}

	private async initialize(): Promise<void> {
		try {
			await makePersistent(this, 'runtimeConfig', [
				'apiEndpoint',
				'apiPublicEndpoint',
				'gatewayEndpoint',
				'mediaEndpoint',
				'cdnEndpoint',
				'marketingEndpoint',
				'adminEndpoint',
				'inviteEndpoint',
				'giftEndpoint',
				'webAppEndpoint',
				'captchaProvider',
				'hcaptchaSiteKey',
				'turnstileSiteKey',
				'apiCodeVersion',
				'features',
				'publicPushVapidKey',
				'spotifyClientId',
			]);

			const bootstrapEndpoint = this.apiEndpoint || Config.PUBLIC_BOOTSTRAP_API_ENDPOINT;

			await this.connectToEndpoint(bootstrapEndpoint);

			runInAction(() => {
				this._initState = 'ready';
				this._initError = null;
			});

			this._resolveInit();
		} catch (error) {
			const err = error instanceof Error ? error : new Error(String(error));
			runInAction(() => {
				this._initState = 'error';
				this._initError = err;
			});
			this._rejectInit(err);
		}
	}

	waitForInit(): Promise<void> {
		return this._initPromise;
	}

	get initialized(): boolean {
		return this._initState === 'ready';
	}

	get initError(): Error | null {
		return this._initError;
	}

	applySnapshot(snapshot: RuntimeConfigSnapshot): void {
		this.apiEndpoint = snapshot.apiEndpoint;
		this.apiPublicEndpoint = snapshot.apiPublicEndpoint;
		this.gatewayEndpoint = snapshot.gatewayEndpoint;
		this.mediaEndpoint = snapshot.mediaEndpoint;
		this.cdnEndpoint = snapshot.cdnEndpoint;
		this.marketingEndpoint = snapshot.marketingEndpoint;
		this.adminEndpoint = snapshot.adminEndpoint;
		this.inviteEndpoint = snapshot.inviteEndpoint;
		this.giftEndpoint = snapshot.giftEndpoint;
		this.webAppEndpoint = snapshot.webAppEndpoint;

		this.captchaProvider = snapshot.captchaProvider;
		this.hcaptchaSiteKey = snapshot.hcaptchaSiteKey;
		this.turnstileSiteKey = snapshot.turnstileSiteKey;

		this.apiCodeVersion = snapshot.apiCodeVersion;
		this.features = snapshot.features;
		this.publicPushVapidKey = snapshot.publicPushVapidKey;
		this.spotifyClientId = snapshot.spotifyClientId;
	}

	getSnapshot(): RuntimeConfigSnapshot {
		return {
			apiEndpoint: this.apiEndpoint,
			apiPublicEndpoint: this.apiPublicEndpoint,
			gatewayEndpoint: this.gatewayEndpoint,
			mediaEndpoint: this.mediaEndpoint,
			cdnEndpoint: this.cdnEndpoint,
			marketingEndpoint: this.marketingEndpoint,
			adminEndpoint: this.adminEndpoint,
			inviteEndpoint: this.inviteEndpoint,
			giftEndpoint: this.giftEndpoint,
			webAppEndpoint: this.webAppEndpoint,
			captchaProvider: this.captchaProvider,
			hcaptchaSiteKey: this.hcaptchaSiteKey,
			turnstileSiteKey: this.turnstileSiteKey,
			apiCodeVersion: this.apiCodeVersion,
			features: {...this.features},
			publicPushVapidKey: this.publicPushVapidKey,
			spotifyClientId: this.spotifyClientId,
		};
	}

	async withSnapshot<T>(snapshot: RuntimeConfigSnapshot, fn: () => Promise<T>): Promise<T> {
		const before = this.getSnapshot();
		this.applySnapshot(snapshot);

		try {
			return await fn();
		} finally {
			this.applySnapshot(before);
		}
	}

	async resetToDefaults(): Promise<void> {
		await this.connectToEndpoint(Config.PUBLIC_BOOTSTRAP_API_ENDPOINT);
	}

	async connectToEndpoint(input: string): Promise<void> {
		const connectId = ++this._connectSeq;

		const apiEndpoint = this.normalizeEndpoint(input);
		const instanceUrl = `${apiEndpoint}/instance`;

		const requestUrl = wrapUrlWithElectronApiProxy(instanceUrl);
		const request: HttpRequestConfig = {url: requestUrl};

		const response = await HttpClient.get<InstanceDiscoveryResponse>(request);

		if (connectId !== this._connectSeq) {
			return;
		}

		if (!response.ok) {
			throw new Error(`Failed to reach ${instanceUrl} (${response.status})`);
		}

		this.updateFromInstance(response.body);
	}

	private normalizeEndpoint(input: string): string {
		const trimmed = input.trim();
		if (!trimmed) {
			throw new Error('API endpoint is required');
		}

		let candidate = trimmed;

		if (candidate.startsWith('/')) {
			candidate = `${window.location.origin}${candidate}`;
		} else if (!/^[a-zA-Z][a-zA-Z0-9+\-.]*:\/\//.test(candidate)) {
			candidate = `https://${candidate}`;
		}

		const url = new URL(candidate);
		if (url.pathname === '' || url.pathname === '/') {
			url.pathname = '/api';
		}
		url.pathname = url.pathname.replace(/\/+$/, '');
		return this.rewriteLoopbackEndpointForBrowser(url.toString());
	}

	private updateFromInstance(instance: InstanceDiscoveryResponse): void {
		this.assertCodeVersion(instance.api_code_version);

		const instanceApiEndpoint = instance.endpoints.api_client ?? instance.endpoints.api_public ?? '';
		const instanceApiPublicEndpoint = instance.endpoints.api_public ?? instanceApiEndpoint;
		const {apiEndpoint, apiPublicEndpoint} = this.resolveBrowserApiEndpoints(
			instanceApiEndpoint,
			instanceApiPublicEndpoint,
		);
		const {mediaEndpoint, cdnEndpoint} = this.resolveBrowserAssetEndpoints(
			instance.endpoints.media,
			instance.endpoints.cdn,
			apiPublicEndpoint,
		);

		runInAction(() => {
			this.apiEndpoint = apiEndpoint;
			this.apiPublicEndpoint = apiPublicEndpoint;

			this.gatewayEndpoint = this.resolveBrowserGatewayEndpoint(instance.endpoints.gateway);
			this.mediaEndpoint = mediaEndpoint;
			this.cdnEndpoint = cdnEndpoint;
			this.marketingEndpoint = this.rewriteLoopbackEndpointForBrowser(instance.endpoints.marketing);
			this.inviteEndpoint = this.rewriteLoopbackEndpointForBrowser(instance.endpoints.invite);
			this.giftEndpoint = this.rewriteLoopbackEndpointForBrowser(instance.endpoints.gift);
			this.webAppEndpoint = this.rewriteLoopbackEndpointForBrowser(instance.endpoints.webapp);
			// The admin panel URL is no longer broadcast in the public /instance
			// response. Derive it from the webapp base (same host, /admin path).
			// Access to the panel itself is staff-gated server-side.
			this.adminEndpoint = this.webAppEndpoint ? `${this.webAppEndpoint.replace(/\/+$/, '')}/admin` : '';

			this.captchaProvider = instance.captcha.provider;
			this.hcaptchaSiteKey = instance.captcha.hcaptcha_site_key;
			this.turnstileSiteKey = instance.captcha.turnstile_site_key;

			this.apiCodeVersion = instance.api_code_version;
			this.features = instance.features;
			this.publicPushVapidKey = instance.push?.public_vapid_key ?? null;
			this.spotifyClientId = instance.music?.spotify_client_id ?? null;
		});
	}

	private isLoopbackHost(hostname: string): boolean {
		const host = hostname.toLowerCase();
		return host === 'localhost' || host === '127.0.0.1' || host === '::1';
	}

	private resolveBrowserApiEndpoints(
		apiEndpointInput: string,
		apiPublicEndpointInput: string,
	): {apiEndpoint: string; apiPublicEndpoint: string} {
		const rewrittenApiEndpoint = this.rewriteLoopbackEndpointForBrowser(apiEndpointInput);
		const rewrittenApiPublicEndpoint = this.rewriteLoopbackEndpointForBrowser(apiPublicEndpointInput);

		if (typeof window === 'undefined') {
			return {apiEndpoint: rewrittenApiEndpoint, apiPublicEndpoint: rewrittenApiPublicEndpoint};
		}

		try {
			if (this.shouldForceLocalDevProxy()) {
				const fallbackApi = this.normalizeEndpoint(Config.PUBLIC_BOOTSTRAP_API_ENDPOINT);
				const fallbackPublicApi = this.normalizeEndpoint(Config.PUBLIC_BOOTSTRAP_API_PUBLIC_ENDPOINT);
				return {apiEndpoint: fallbackApi, apiPublicEndpoint: fallbackPublicApi};
			}

			const windowUrl = new URL(window.location.origin);
			const apiUrl = new URL(rewrittenApiEndpoint);
			const apiPublicUrl = new URL(rewrittenApiPublicEndpoint);

			// Keep same-origin in local dev: localhost and 127.0.0.1 are different origins for CORS.
			if (
				this.isLoopbackHost(windowUrl.hostname) &&
				this.isLoopbackHost(apiUrl.hostname) &&
				apiUrl.host !== windowUrl.host
			) {
				const fallbackApi = this.normalizeEndpoint(Config.PUBLIC_BOOTSTRAP_API_ENDPOINT);
				const fallbackPublicApi = this.normalizeEndpoint(Config.PUBLIC_BOOTSTRAP_API_PUBLIC_ENDPOINT);
				return {apiEndpoint: fallbackApi, apiPublicEndpoint: fallbackPublicApi};
			}

			if (
				this.isLoopbackHost(windowUrl.hostname) &&
				this.isLoopbackHost(apiPublicUrl.hostname) &&
				apiPublicUrl.host !== windowUrl.host
			) {
				const fallbackPublicApi = this.normalizeEndpoint(Config.PUBLIC_BOOTSTRAP_API_PUBLIC_ENDPOINT);
				return {apiEndpoint: rewrittenApiEndpoint, apiPublicEndpoint: fallbackPublicApi};
			}
		} catch {
			return {apiEndpoint: rewrittenApiEndpoint, apiPublicEndpoint: rewrittenApiPublicEndpoint};
		}

		return {apiEndpoint: rewrittenApiEndpoint, apiPublicEndpoint: rewrittenApiPublicEndpoint};
	}

	private resolveBrowserGatewayEndpoint(gatewayEndpointInput: string): string {
		const rewrittenGatewayEndpoint = this.rewriteLoopbackEndpointForBrowser(gatewayEndpointInput);

		if (typeof window === 'undefined') {
			return rewrittenGatewayEndpoint;
		}

		if (this.shouldForceLocalDevProxy()) {
			return `${window.location.origin}/gateway`;
		}

		return rewrittenGatewayEndpoint;
	}

	private assertCodeVersion(instanceVersion: number): void {
		if (instanceVersion < API_CODE_VERSION) {
			throw new Error(
				`Incompatible server (code version ${instanceVersion}); this client requires ${API_CODE_VERSION}.`,
			);
		}
	}

	private isLikelyInternalServiceHost(hostname: string): boolean {
		const host = hostname.toLowerCase();
		if (this.isLoopbackHost(host)) return true;
		if (!host.includes('.')) return true;
		return (
			host.endsWith('.local') ||
			host.endsWith('.internal') ||
			host.endsWith('.docker') ||
			host === 'media' ||
			host === 'minio'
		);
	}

	private resolveBrowserAssetEndpoints(
		mediaEndpointInput: string,
		cdnEndpointInput: string,
		apiPublicEndpoint: string,
	): {mediaEndpoint: string; cdnEndpoint: string} {
		const rewrittenMediaEndpoint = this.rewriteLoopbackEndpointForBrowser(mediaEndpointInput);
		const rewrittenCdnEndpoint = this.rewriteLoopbackEndpointForBrowser(cdnEndpointInput);

		if (typeof window === 'undefined') {
			return {mediaEndpoint: rewrittenMediaEndpoint, cdnEndpoint: rewrittenCdnEndpoint};
		}

		try {
			if (this.shouldForceLocalDevProxy()) {
				const origin = window.location.origin;
				return {
					mediaEndpoint: `${origin}/media`,
					cdnEndpoint: `${origin}/s3`,
				};
			}

			const windowUrl = new URL(window.location.origin);
			const publicApiUrl = new URL(apiPublicEndpoint);
			const mediaUrl = new URL(rewrittenMediaEndpoint);
			const cdnUrl = new URL(rewrittenCdnEndpoint);

			const publicOrigin = this.isLoopbackHost(windowUrl.hostname) ? publicApiUrl.origin : windowUrl.origin;
			const normalizedMediaEndpoint = this.isLikelyInternalServiceHost(mediaUrl.hostname)
				? `${publicOrigin}/media`
				: rewrittenMediaEndpoint;
			const normalizedCdnEndpoint = this.isLikelyInternalServiceHost(cdnUrl.hostname)
				? `${publicOrigin}/s3`
				: rewrittenCdnEndpoint;

			return {mediaEndpoint: normalizedMediaEndpoint, cdnEndpoint: normalizedCdnEndpoint};
		} catch {
			return {mediaEndpoint: rewrittenMediaEndpoint, cdnEndpoint: rewrittenCdnEndpoint};
		}
	}

	private shouldForceLocalDevProxy(): boolean {
		if (typeof window === 'undefined') {
			return false;
		}

		if (!this.isLoopbackHost(window.location.hostname)) {
			return false;
		}

		return this.isLocalProxyBootstrapEndpoint(Config.PUBLIC_BOOTSTRAP_API_ENDPOINT);
	}

	private isLocalProxyBootstrapEndpoint(rawEndpoint: string): boolean {
		const endpoint = rawEndpoint.trim();
		if (!endpoint) {
			return false;
		}

		if (endpoint.startsWith('/')) {
			return true;
		}

		try {
			const parsed = new URL(endpoint);
			return this.isLoopbackHost(parsed.hostname);
		} catch {
			return false;
		}
	}

	private rewriteLoopbackEndpointForBrowser(endpoint: string): string {
		if (typeof window === 'undefined') {
			return endpoint;
		}

		try {
			const parsed = new URL(endpoint);
			const currentLocation = window.location;
			const currentHostIsLoopback = this.isLoopbackHost(currentLocation.hostname);

			if (!this.isLoopbackHost(parsed.hostname) || currentHostIsLoopback) {
				return endpoint;
			}

			parsed.hostname = currentLocation.hostname;

			if (!parsed.port && currentLocation.port) {
				parsed.port = currentLocation.port;
			}

			if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
				parsed.protocol = currentLocation.protocol === 'https:' ? 'https:' : 'http:';
			}

			if (parsed.protocol === 'ws:' || parsed.protocol === 'wss:') {
				parsed.protocol = currentLocation.protocol === 'https:' ? 'wss:' : 'ws:';
			}

			return parsed.toString();
		} catch {
			return endpoint;
		}
	}

	get webAppBaseUrl(): string {
		if (this.webAppEndpoint) {
			return this.webAppEndpoint.replace(/\/$/, '');
		}

		try {
			const url = new URL(this.apiEndpoint);
			if (url.pathname.endsWith('/api')) {
				url.pathname = url.pathname.slice(0, -4) || '/';
			}
			return url.toString().replace(/\/$/, '');
		} catch {
			return this.apiEndpoint.replace(/\/api$/, '');
		}
	}

	isSelfHosted(): boolean {
		return DeveloperOptionsStore.selfHostedModeOverride || this.features.self_hosted;
	}

	private normalizeHostname(hostname: string): string {
		return normalizeHostname(hostname);
	}

	private isFirstPartyGatewayHost(hostname: string): boolean {
		return isFirstPartyHost(this.normalizeHostname(hostname));
	}

	isThirdPartyGateway(): boolean {
		if (!this.gatewayEndpoint) return false;
		try {
			const url = new URL(this.gatewayEndpoint);
			return !this.isFirstPartyGatewayHost(url.hostname);
		} catch {
			return false;
		}
	}

	hasElectronWsProxy(): boolean {
		return typeof window.electron?.getWsProxyUrl === 'function';
	}

	private getWsProxyBaseUrl(): URL | null {
		if (!this.hasElectronWsProxy()) {
			return null;
		}

		const raw = window.electron?.getWsProxyUrl();
		if (!raw) return null;

		try {
			return new URL(raw);
		} catch {
			return null;
		}
	}

	wrapGatewayUrlWithProxy(url: string): string {
		try {
			const parsed = new URL(url);
			if (this.isFirstPartyGatewayHost(parsed.hostname)) {
				return url;
			}
		} catch {}

		if (!this.isThirdPartyGateway()) {
			return url;
		}

		const proxy = this.getWsProxyBaseUrl();
		if (!proxy) {
			return url;
		}

		proxy.searchParams.set('target', url);
		return proxy.toString();
	}

	get marketingHost(): string {
		try {
			return new URL(this.marketingEndpoint).host;
		} catch {
			return '';
		}
	}

	get inviteHost(): string {
		try {
			return new URL(this.inviteEndpoint).host;
		} catch {
			return '';
		}
	}

	get giftHost(): string {
		try {
			return new URL(this.giftEndpoint).host;
		} catch {
			return '';
		}
	}
}

export function describeApiEndpoint(endpoint: string): string {
	try {
		const url = new URL(endpoint);
		const path = url.pathname === '/api' ? '' : url.pathname;
		return `${url.host}${path}`;
	} catch {
		return endpoint;
	}
}

export default new RuntimeConfigStore();
