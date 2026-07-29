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

import type {UserID} from '~/BrandedTypes';
import {Config} from '~/Config';
import type {ICacheService} from '~/infrastructure/ICacheService';
import {Logger} from '~/Logger';
import {extractRawPayload, verifyTelegramLoginPayload} from '~/telegram/TelegramAuthVerifier';
import {TelegramBotClient} from '~/telegram/TelegramBotClient';
import {
	DEFAULT_TELEGRAM_PREFERENCES,
	type TelegramConnectionResponse,
	type TelegramLoginPayload,
	type TelegramNotificationPreferences,
	type TelegramNotificationPreferencesRequest,
	type TelegramStatusResponse,
	rowToConnectionResponse,
} from '~/telegram/TelegramModel';
import {TelegramRepository} from '~/telegram/TelegramRepository';

export class TelegramService {
	private readonly repository = new TelegramRepository();

	private isConfigured(): boolean {
		return Boolean(Config.telegram.enabled && Config.telegram.botToken);
	}

	async getStatus(userId: UserID): Promise<TelegramStatusResponse> {
		const row = await this.repository.getConnection(userId);
		return {
			configured: this.isConfigured(),
			botUsername: Config.telegram.botUsername ?? null,
			connection: row ? rowToConnectionResponse(row) : null,
		};
	}

	async verifyAndConnect(params: {
		userId: UserID;
		payload: TelegramLoginPayload;
	}): Promise<{ok: true; connection: TelegramConnectionResponse} | {ok: false; error: string}> {
		const botToken = Config.telegram.botToken;
		if (!Config.telegram.enabled || !botToken) {
			return {ok: false, error: 'telegram_not_configured'};
		}

		const raw = extractRawPayload(params.payload);
		const isValid = verifyTelegramLoginPayload({
			rawPayload: raw,
			botToken,
			maxAgeSeconds: Config.telegram.loginMaxAgeSeconds,
		});
		if (!isValid) {
			return {ok: false, error: 'telegram_signature_invalid'};
		}

		const telegramUserId = BigInt(params.payload.id);

		// Refuse to relink someone else's Telegram to a different Astral account.
		const existingForTg = await this.repository.getConnectionByTelegramUserId(telegramUserId);
		if (existingForTg && existingForTg.user_id !== params.userId) {
			return {ok: false, error: 'telegram_account_already_linked'};
		}

		const previous = await this.repository.getConnection(params.userId);
		const now = new Date();
		const row = {
			user_id: params.userId,
			telegram_user_id: telegramUserId,
			username: params.payload.username ?? null,
			first_name: params.payload.first_name,
			last_name: params.payload.last_name ?? null,
			photo_url: params.payload.photo_url ?? null,
			language_code: previous?.language_code ?? null,
			is_premium: previous?.is_premium ?? null,
			auth_date: new Date(params.payload.auth_date * 1000),
			notifications_enabled: previous?.notifications_enabled ?? true,
			notification_preferences_json:
				previous?.notification_preferences_json ?? JSON.stringify(DEFAULT_TELEGRAM_PREFERENCES),
			connected_at: previous?.connected_at ?? now,
			updated_at: now,
			telegram_2fa_enabled: previous?.telegram_2fa_enabled ?? false,
		};
		try {
			await this.repository.upsertConnection(row, previous?.telegram_user_id ?? null);
		} catch (error) {
			Logger.warn({error, telegramUserId: telegramUserId.toString()}, '[Telegram] upsertConnection failed');
			return {ok: false, error: 'telegram_persist_failed'};
		}

		// Send a welcome / re-link confirmation message in the background.
		// We do this only on a fresh link (no previous row) OR when the linked
		// Telegram id changed — re-link to the same id should not spam.
		const isFreshLink = !previous || previous.telegram_user_id !== telegramUserId;
		if (isFreshLink) {
			void this.sendWelcomeMessage({
				chatId: telegramUserId,
				firstName: params.payload.first_name,
				botToken,
			}).catch((error: unknown) => {
				Logger.warn({error}, '[Telegram] welcome message failed');
			});
		}

		return {ok: true, connection: rowToConnectionResponse(row)};
	}

	private async sendWelcomeMessage(params: {
		chatId: bigint;
		firstName: string;
		botToken: string;
	}): Promise<void> {
		const client = new TelegramBotClient(params.botToken);
		const text = [
			`👋 Привет, <b>${escapeHtml(params.firstName)}</b>!`,
			``,
			`Это <b>Astral Notify Bot</b>. Ваш аккаунт успешно привязан.`,
			``,
			`Сюда я буду присылать уведомления, которые вы сами выберете в настройках:`,
			`• 💬 новые личные сообщения`,
			`• 🔔 упоминания в гильдиях`,
			`• 📞 пропущенные звонки`,
			`• 👥 запросы в друзья`,
			`• 💎 уведомления о подписке`,
			``,
			`Никаких автоматических напоминаний &mdash; всё под вашим контролем.`,
			``,
			`Используйте кнопки ниже или команды:`,
			`/settings &mdash; настроить уведомления`,
			`/help &mdash; список команд`,
			`/disconnect &mdash; отвязать аккаунт`,
		].join('\n');
		await client.sendMessage({
			chatId: params.chatId,
			text,
			parseMode: 'HTML',
			disableWebPagePreview: true,
			replyMarkup: {
				inline_keyboard: [
					[
						{text: '🌐 Открыть Astral', url: 'https://astraof.com/channels/@me'},
					],
					[
						{text: '⚙️ Настройки уведомлений', callback_data: 'astral:settings:open'},
						{text: '🔕 Выключить', callback_data: 'astral:notifications:off'},
					],
				],
			},
		});
	}

	async disconnect(userId: UserID): Promise<{ok: boolean}> {
		await this.repository.deleteConnection(userId);
		return {ok: true};
	}

	/**
	 * 2FA setup: generate a 6-digit code, send it to the user's Telegram
	 * (via TelegramNotificationsService.sendSecurityCode), and cache it
	 * in Redis for 5 minutes. The user then types this code to confirm
	 * via the enable() endpoint.
	 */
	async setupTwoFactor(params: {
		userId: UserID;
		cacheService: ICacheService;
	}): Promise<{ok: boolean; error?: string}> {
		const row = await this.repository.getConnection(params.userId);
		if (!row) return {ok: false, error: 'telegram_not_linked'};
		if (!Config.telegram.botToken) return {ok: false, error: 'telegram_not_configured'};

		const code = generateSixDigitCode();
		await params.cacheService.set<{code: string}>(
			twoFactorSetupCacheKey(params.userId),
			{code},
			5 * 60, // 5 min
		);

		const {TelegramNotificationsService} = await import('~/telegram/TelegramNotificationsService');
		const dispatched = await TelegramNotificationsService.getInstance().sendSecurityCode(params.userId, {
			code,
			reason: 'Включение 2FA через Telegram',
		});
		if (!dispatched) return {ok: false, error: 'telegram_send_failed'};
		return {ok: true};
	}

	async enableTwoFactor(params: {
		userId: UserID;
		cacheService: ICacheService;
		code: string;
	}): Promise<{ok: boolean; error?: string}> {
		const cached = await params.cacheService.getAndDelete<{code: string}>(twoFactorSetupCacheKey(params.userId));
		if (!cached || cached.code !== params.code) {
			return {ok: false, error: 'invalid_code'};
		}
		const row = await this.repository.getConnection(params.userId);
		if (!row) return {ok: false, error: 'telegram_not_linked'};
		await this.repository.upsertConnection(
			{...row, telegram_2fa_enabled: true, updated_at: new Date()},
			row.telegram_user_id,
		);
		return {ok: true};
	}

	async disableTwoFactor(userId: UserID): Promise<{ok: boolean}> {
		const row = await this.repository.getConnection(userId);
		if (!row) return {ok: false};
		await this.repository.upsertConnection(
			{...row, telegram_2fa_enabled: false, updated_at: new Date()},
			row.telegram_user_id,
		);
		return {ok: true};
	}

	async updatePreferences(
		userId: UserID,
		req: TelegramNotificationPreferencesRequest,
	): Promise<{ok: boolean; connection: TelegramConnectionResponse | null}> {
		const row = await this.repository.getConnection(userId);
		if (!row) return {ok: false, connection: null};

		const currentPrefs: TelegramNotificationPreferences = row.notification_preferences_json
			? safeParsePrefs(row.notification_preferences_json)
			: DEFAULT_TELEGRAM_PREFERENCES;
		const merged: TelegramNotificationPreferences = {
			...DEFAULT_TELEGRAM_PREFERENCES,
			...currentPrefs,
			...(req.preferences ?? {}),
		};

		const now = new Date();
		const updated = {
			...row,
			notifications_enabled: req.notifications_enabled ?? row.notifications_enabled,
			notification_preferences_json: JSON.stringify(merged),
			updated_at: now,
		};
		await this.repository.upsertConnection(updated, row.telegram_user_id);
		return {ok: true, connection: rowToConnectionResponse(updated)};
	}
}

function safeParsePrefs(json: string): TelegramNotificationPreferences {
	try {
		const parsed = JSON.parse(json) as Partial<TelegramNotificationPreferences>;
		return {...DEFAULT_TELEGRAM_PREFERENCES, ...parsed};
	} catch {
		return DEFAULT_TELEGRAM_PREFERENCES;
	}
}

function escapeHtml(input: string): string {
	return input
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}

function generateSixDigitCode(): string {
	// 6 digits, leading-zero preserving — matches the regex in TelegramTwoFactorEnableRequest.
	const n = Math.floor(Math.random() * 1_000_000);
	return n.toString().padStart(6, '0');
}

function twoFactorSetupCacheKey(userId: UserID): string {
	return `telegram:2fa:setup:${userId.toString()}`;
}

export function twoFactorChallengeCacheKey(userId: UserID): string {
	return `telegram:2fa:login:${userId.toString()}`;
}
