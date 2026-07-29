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
import {Logger} from '~/Logger';
import {TelegramBotClient} from '~/telegram/TelegramBotClient';
import {DEFAULT_TELEGRAM_PREFERENCES, type TelegramNotificationPreferences} from '~/telegram/TelegramModel';
import {TelegramRepository} from '~/telegram/TelegramRepository';

export type TelegramNotificationKind =
	| 'dms'
	| 'mentions'
	| 'calls'
	| 'friend_requests'
	| 'billing'
	| 'announcements'
	| 'security';

export interface TelegramNotificationPayload {
	kind: TelegramNotificationKind;
	title: string;
	body: string;
	url?: string;
	/** Optional override — if given, sends without consulting preferences (used for security alerts). */
	bypassPreferences?: boolean;
}

/**
 * Single entry point that the rest of the system calls when something
 * happens that the user might want to know about in Telegram. The dispatcher
 * checks per-user preferences and the master notifications_enabled toggle
 * before actually hitting the Bot API.
 *
 * The 'security' kind always bypasses preferences (login alerts, 2FA codes,
 * suspicious-activity warnings — the user can't opt out of these without
 * disconnecting Telegram entirely).
 */
export class TelegramNotificationsService {
	private static instance: TelegramNotificationsService | null = null;
	private readonly repository = new TelegramRepository();

	static getInstance(): TelegramNotificationsService {
		if (!this.instance) this.instance = new TelegramNotificationsService();
		return this.instance;
	}

	async notifyUser(userId: UserID, payload: TelegramNotificationPayload): Promise<boolean> {
		const botToken = Config.telegram.botToken;
		if (!Config.telegram.enabled || !botToken) return false;

		const row = await this.repository.getConnection(userId);
		if (!row) return false;
		if (!row.notifications_enabled && !payload.bypassPreferences) return false;

		// Security-kind always passes; other kinds are subject to per-category prefs
		if (!payload.bypassPreferences && payload.kind !== 'security') {
			const prefs: TelegramNotificationPreferences = row.notification_preferences_json
				? safeParse(row.notification_preferences_json)
				: DEFAULT_TELEGRAM_PREFERENCES;
			if (prefs[payload.kind] === false) return false;
		}

		const text = this.formatMessage(payload);
		const client = new TelegramBotClient(botToken);
		return client.sendMessage({
			chatId: row.telegram_user_id,
			text,
			parseMode: 'HTML',
			disableWebPagePreview: true,
			replyMarkup: payload.url
				? {
						inline_keyboard: [[{text: 'Открыть Astral', url: payload.url}]],
					}
				: undefined,
		});
	}

	/**
	 * Send a 6-digit security code via Telegram. Used for new-device login
	 * confirmation and 2FA flows. Returns true if the send was at least
	 * dispatched to the Bot API; the caller still needs to verify the code
	 * the user types matches what was sent.
	 */
	async sendSecurityCode(userId: UserID, params: {code: string; reason: string}): Promise<boolean> {
		return this.notifyUser(userId, {
			kind: 'security',
			title: '🔐 Код подтверждения',
			body: [
				`Ваш код: <b>${params.code}</b>`,
				``,
				`Причина: ${escapeHtml(params.reason)}`,
				``,
				`Если это не вы — игнорируйте сообщение и сменить пароль.`,
			].join('\n'),
			bypassPreferences: true,
		});
	}

	private formatMessage(payload: TelegramNotificationPayload): string {
		return [
			`<b>${escapeHtml(payload.title)}</b>`,
			'',
			payload.body,
		].join('\n');
	}
}

function safeParse(json: string): TelegramNotificationPreferences {
	try {
		return {...DEFAULT_TELEGRAM_PREFERENCES, ...JSON.parse(json)};
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

export function notifyTelegram(userId: UserID, payload: TelegramNotificationPayload): Promise<boolean> {
	try {
		return TelegramNotificationsService.getInstance().notifyUser(userId, payload);
	} catch (error) {
		Logger.warn({error}, '[Telegram] notifyTelegram entry-point failed');
		return Promise.resolve(false);
	}
}
