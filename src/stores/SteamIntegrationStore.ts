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

import {makeAutoObservable, runInAction} from 'mobx';
import {Endpoints} from '~/Endpoints';
import http from '~/lib/HttpClient';
import {Logger} from '~/lib/Logger';

export const STEAM_OPENID_RESULT_KEY = 'astral.steam.connect.result';

export interface SteamConnection {
	steamId: string;
	personaName: string;
	profileUrl: string | null;
	avatarUrl: string | null;
	visibility: number | null;
	realName: string | null;
	primaryClanId: string | null;
	countryCode: string | null;
	lastLogoffAt: number | null;
	connectedAt: number;
	updatedAt: number;
	currentGameId: string | null;
	currentGameName: string | null;
	currentGameStartedAt: number | null;
	personaState: number | null;
	presenceSyncedAt: number | null;
	presenceVisible: boolean;
}

interface StatusResponse {
	configured: boolean;
	connection: SteamConnection | null;
}

interface OpenIDStartResponse {
	configured: boolean;
	url: string | null;
	state: string | null;
}

function safeWindow(): Window | null {
	return typeof window !== 'undefined' ? window : null;
}

class SteamIntegrationStoreImpl {
	configured = false;
	connection: SteamConnection | null = null;
	status: 'idle' | 'loading' | 'ready' | 'error' = 'idle';
	error: string | null = null;
	private bootstrapped = false;
	private readonly logger = new Logger('SteamIntegrationStore');

	constructor() {
		makeAutoObservable(this);
		this.installPostMessageBridge();
		this.installStorageBridge();
	}

	get isConnected(): boolean {
		return this.connection !== null;
	}

	async ensureBootstrapped(): Promise<void> {
		if (this.bootstrapped) return;
		this.bootstrapped = true;
		await this.refresh();
	}

	async refresh(): Promise<void> {
		runInAction(() => {
			if (this.status !== 'loading') this.status = 'loading';
			this.error = null;
		});
		try {
			const response = await http.get<StatusResponse>({
				url: Endpoints.STEAM_CONNECTION,
				rejectWithError: false,
			});
			runInAction(() => {
				if (response.ok) {
					this.configured = response.body.configured;
					this.connection = response.body.connection;
					this.status = 'ready';
				} else if (response.status === 401) {
					this.status = 'idle';
				} else {
					this.status = 'error';
					this.error = 'Failed to load Steam connection.';
				}
			});
		} catch (error) {
			this.logger.error('Failed to refresh Steam connection', error);
			runInAction(() => {
				this.status = 'error';
				this.error = error instanceof Error ? error.message : 'Failed to refresh.';
			});
		}
	}

	async startConnect(): Promise<void> {
		runInAction(() => {
			this.status = 'loading';
			this.error = null;
		});
		try {
			const response = await http.post<OpenIDStartResponse>({
				url: Endpoints.STEAM_OPENID_START,
				body: {},
				rejectWithError: false,
			});
			if (!response.ok || !response.body.url) {
				runInAction(() => {
					this.configured = Boolean((response.body as Partial<OpenIDStartResponse> | undefined)?.configured);
					this.status = 'error';
					this.error =
						response.status === 503 ? 'Steam app is not configured on this server.' : 'Failed to start Steam OpenID.';
				});
				return;
			}
			runInAction(() => {
				this.configured = true;
				this.status = 'ready';
			});
			const win = safeWindow();
			win?.open(response.body.url, 'astral-steam-connect', 'width=900,height=720');
		} catch (error) {
			this.logger.error('Failed to start Steam OpenID', error);
			runInAction(() => {
				this.status = 'error';
				this.error = error instanceof Error ? error.message : 'Failed to start Steam OpenID.';
			});
		}
	}

	async disconnect(): Promise<void> {
		runInAction(() => {
			this.status = 'loading';
			this.error = null;
		});
		try {
			await http.delete({url: Endpoints.STEAM_CONNECTION, rejectWithError: false});
			runInAction(() => {
				this.connection = null;
				this.status = 'ready';
			});
		} catch (error) {
			this.logger.error('Failed to disconnect Steam', error);
			runInAction(() => {
				this.status = 'error';
				this.error = error instanceof Error ? error.message : 'Failed to disconnect Steam.';
			});
		}
	}

	async setPresenceVisible(visible: boolean): Promise<void> {
		try {
			const response = await http.patch<{connection: SteamConnection | null}>({
				url: Endpoints.STEAM_PRESENCE_PRIVACY,
				body: {visible},
				rejectWithError: false,
			});
			runInAction(() => {
				if (response.ok && response.body.connection) {
					this.connection = response.body.connection;
				}
			});
		} catch (error) {
			this.logger.warn('Failed to set Steam presence visibility', error);
		}
	}

	private installPostMessageBridge(): void {
		const win = safeWindow();
		if (!win) return;
		win.addEventListener('message', (event) => {
			if (event?.data?.type !== 'astral:steam:openid') return;
			void this.refresh();
		});
	}

	private installStorageBridge(): void {
		const win = safeWindow();
		if (!win) return;
		win.addEventListener('storage', (event) => {
			if (event.key !== STEAM_OPENID_RESULT_KEY || !event.newValue) return;
			void this.refresh();
			try {
				win.localStorage.removeItem(STEAM_OPENID_RESULT_KEY);
			} catch {
				/* ignore */
			}
		});
	}
}

const SteamIntegrationStore = new SteamIntegrationStoreImpl();
export default SteamIntegrationStore;
