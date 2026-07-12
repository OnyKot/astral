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

export interface TelegramNotificationPreferences {
	dms?: boolean;
	mentions?: boolean;
	calls?: boolean;
	friend_requests?: boolean;
	billing?: boolean;
	announcements?: boolean;
}

export interface TelegramConnection {
	telegramUserId: string;
	username: string | null;
	firstName: string | null;
	lastName: string | null;
	photoUrl: string | null;
	languageCode: string | null;
	isPremium: boolean | null;
	authDate: number;
	notificationsEnabled: boolean;
	preferences: TelegramNotificationPreferences;
	connectedAt: number;
	updatedAt: number;
	twoFactorEnabled: boolean;
}

interface StatusResponse {
	configured: boolean;
	botUsername: string | null;
	connection: TelegramConnection | null;
}

export interface TelegramLoginPayload {
	id: number;
	first_name: string;
	last_name?: string;
	username?: string;
	photo_url?: string;
	auth_date: number;
	hash: string;
}

class TelegramIntegrationStoreImpl {
	configured = false;
	botUsername: string | null = null;
	connection: TelegramConnection | null = null;
	status: 'idle' | 'loading' | 'ready' | 'error' = 'idle';
	error: string | null = null;
	private bootstrapped = false;
	private readonly logger = new Logger('TelegramIntegrationStore');

	constructor() {
		makeAutoObservable(this);
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
				url: Endpoints.TELEGRAM_CONNECTION,
				rejectWithError: false,
			});
			runInAction(() => {
				if (response.ok) {
					this.configured = response.body.configured;
					this.botUsername = response.body.botUsername;
					this.connection = response.body.connection;
					this.status = 'ready';
				} else if (response.status === 401) {
					this.status = 'idle';
				} else {
					this.status = 'error';
					this.error = 'Failed to load Telegram connection.';
				}
			});
		} catch (error) {
			this.logger.error('Failed to refresh Telegram connection', error);
			runInAction(() => {
				this.status = 'error';
				this.error = error instanceof Error ? error.message : 'Failed to refresh.';
			});
		}
	}

	async verifyAndConnect(payload: TelegramLoginPayload): Promise<boolean> {
		runInAction(() => {
			this.status = 'loading';
			this.error = null;
		});
		try {
			const response = await http.post<{ok: boolean; connection?: TelegramConnection; error?: string}>({
				url: Endpoints.TELEGRAM_VERIFY,
				body: payload as unknown as Record<string, unknown>,
				rejectWithError: false,
			});
			runInAction(() => {
				if (response.ok && response.body.ok && response.body.connection) {
					this.connection = response.body.connection;
					this.status = 'ready';
				} else {
					this.status = 'error';
					this.error =
						(response.body as {error?: string} | undefined)?.error || 'Failed to verify Telegram login.';
				}
			});
			return response.ok && Boolean(response.body.ok);
		} catch (error) {
			this.logger.error('Failed to verify Telegram login', error);
			runInAction(() => {
				this.status = 'error';
				this.error = error instanceof Error ? error.message : 'Failed to verify Telegram login.';
			});
			return false;
		}
	}

	async updatePreferences(input: {
		notifications_enabled?: boolean;
		preferences?: TelegramNotificationPreferences;
	}): Promise<void> {
		try {
			const response = await http.patch<{ok: boolean; connection: TelegramConnection | null}>({
				url: Endpoints.TELEGRAM_PREFERENCES,
				body: input as Record<string, unknown>,
				rejectWithError: false,
			});
			runInAction(() => {
				if (response.ok && response.body.connection) {
					this.connection = response.body.connection;
				}
			});
		} catch (error) {
			this.logger.warn('Failed to update Telegram preferences', error);
		}
	}

	async disconnect(): Promise<void> {
		runInAction(() => {
			this.status = 'loading';
			this.error = null;
		});
		try {
			await http.delete({url: Endpoints.TELEGRAM_CONNECTION, rejectWithError: false});
			runInAction(() => {
				this.connection = null;
				this.status = 'ready';
			});
		} catch (error) {
			this.logger.error('Failed to disconnect Telegram', error);
			runInAction(() => {
				this.status = 'error';
				this.error = error instanceof Error ? error.message : 'Failed to disconnect Telegram.';
			});
		}
	}

	async setupTwoFactor(): Promise<{ok: boolean; error?: string}> {
		try {
			const response = await http.post<{ok: boolean; error?: string}>({
				url: Endpoints.TELEGRAM_2FA_SETUP,
				body: {},
				rejectWithError: false,
			});
			return response.body;
		} catch (error) {
			this.logger.warn('2FA setup failed', error);
			return {ok: false, error: error instanceof Error ? error.message : 'unknown'};
		}
	}

	async enableTwoFactor(code: string): Promise<{ok: boolean; error?: string}> {
		try {
			const response = await http.post<{ok: boolean; error?: string}>({
				url: Endpoints.TELEGRAM_2FA_ENABLE,
				body: {code},
				rejectWithError: false,
			});
			if (response.ok && response.body.ok && this.connection) {
				runInAction(() => {
					if (this.connection) this.connection.twoFactorEnabled = true;
				});
			}
			return response.body;
		} catch (error) {
			this.logger.warn('2FA enable failed', error);
			return {ok: false, error: error instanceof Error ? error.message : 'unknown'};
		}
	}

	async disableTwoFactor(): Promise<void> {
		try {
			await http.post({url: Endpoints.TELEGRAM_2FA_DISABLE, body: {}, rejectWithError: false});
			runInAction(() => {
				if (this.connection) this.connection.twoFactorEnabled = false;
			});
		} catch (error) {
			this.logger.warn('2FA disable failed', error);
		}
	}
}

const TelegramIntegrationStore = new TelegramIntegrationStoreImpl();
export default TelegramIntegrationStore;
