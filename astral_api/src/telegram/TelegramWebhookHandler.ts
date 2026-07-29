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

import {Logger} from '~/Logger';
import {TelegramBotClient} from '~/telegram/TelegramBotClient';
import {DEFAULT_TELEGRAM_PREFERENCES} from '~/telegram/TelegramModel';
import {TelegramRepository} from '~/telegram/TelegramRepository';

/**
 * Subset of the Telegram Bot API Update payload that we care about.
 * Reference: https://core.telegram.org/bots/api#update
 */
export interface TelegramUpdate {
	update_id: number;
	message?: {
		message_id: number;
		from?: {id: number; first_name?: string; username?: string};
		chat: {id: number; type: string};
		date: number;
		text?: string;
		entities?: Array<{offset: number; length: number; type: string}>;
	};
	callback_query?: {
		id: string;
		from: {id: number; first_name?: string; username?: string};
		data?: string;
		message?: {message_id: number; chat: {id: number}};
	};
}

const HELP_TEXT = [
	'<b>Astral Notify Bot</b>',
	'',
	'Команды:',
	'/start — приветственное меню',
	'/settings — управление уведомлениями',
	'/help — это сообщение',
	'/disconnect — отвязать аккаунт от Astral',
	'',
	'Кнопка <i>«Открыть Astral»</i> ведёт прямо в приложение.',
].join('\n');

const SETTINGS_PROMPT = [
	'<b>Настройки уведомлений</b>',
	'',
	'Выберите категории, которые будете получать в Telegram:',
].join('\n');

export class TelegramWebhookHandler {
	private readonly repository = new TelegramRepository();

	constructor(private readonly botClient: TelegramBotClient) {}

	async handle(update: TelegramUpdate): Promise<void> {
		try {
			if (update.message?.text) {
				await this.handleMessage(update.message);
				return;
			}
			if (update.callback_query) {
				await this.handleCallback(update.callback_query);
				return;
			}
		} catch (error) {
			Logger.warn({error, update_id: update.update_id}, '[Telegram] webhook handler failed');
		}
	}

	private async handleMessage(message: NonNullable<TelegramUpdate['message']>): Promise<void> {
		const text = (message.text ?? '').trim();
		const chatId = BigInt(message.chat.id);
		const command = text.split(/\s+/, 1)[0]?.replace(/@\S+$/, '').toLowerCase() ?? '';

		switch (command) {
			case '/start':
				await this.sendStart(chatId);
				return;
			case '/help':
				await this.botClient.sendMessage({chatId, text: HELP_TEXT, parseMode: 'HTML'});
				return;
			case '/settings':
				await this.sendSettings(chatId);
				return;
			case '/disconnect':
				await this.handleDisconnect(chatId);
				return;
			default:
				await this.botClient.sendMessage({
					chatId,
					text: 'Неизвестная команда. Используйте /help для списка команд.',
				});
		}
	}

	private async handleCallback(query: NonNullable<TelegramUpdate['callback_query']>): Promise<void> {
		const data = query.data ?? '';
		const chatId = BigInt(query.message?.chat.id ?? query.from.id);

		if (data === 'astral:notifications:off') {
			const row = await this.repository.getConnectionByTelegramUserId(BigInt(query.from.id));
			if (!row) {
				await this.botClient.sendMessage({chatId, text: 'Аккаунт не привязан к Astral.'});
				return;
			}
			await this.repository.upsertConnection({...row, notifications_enabled: false, updated_at: new Date()}, row.telegram_user_id);
			await this.botClient.sendMessage({
				chatId,
				text: '🔕 Уведомления выключены. Включить обратно: /settings',
			});
			return;
		}
		if (data === 'astral:notifications:on') {
			const row = await this.repository.getConnectionByTelegramUserId(BigInt(query.from.id));
			if (!row) return;
			await this.repository.upsertConnection({...row, notifications_enabled: true, updated_at: new Date()}, row.telegram_user_id);
			await this.botClient.sendMessage({chatId, text: '🔔 Уведомления включены.'});
			return;
		}
		if (data === 'astral:settings:open') {
			await this.sendSettings(chatId);
			return;
		}
		if (data.startsWith('astral:pref:')) {
			const category = data.slice('astral:pref:'.length);
			await this.togglePreference(chatId, BigInt(query.from.id), category);
			return;
		}
	}

	private async sendStart(chatId: bigint): Promise<void> {
		await this.botClient.sendMessage({
			chatId,
			text: [
				'👋 Привет! Это <b>Astral Notify Bot</b>.',
				'',
				'Если вы видите это сообщение, ваш аккаунт привязан и я буду присылать выбранные вами уведомления.',
				'Команды: /settings, /help, /disconnect.',
			].join('\n'),
			parseMode: 'HTML',
			replyMarkup: {
				inline_keyboard: [
					[{text: '⚙️ Настройки', callback_data: 'astral:settings:open'}],
					[{text: '🌐 Открыть Astral', url: 'https://astraof.com/channels/@me'}],
				],
			},
		});
	}

	private async sendSettings(chatId: bigint): Promise<void> {
		// Determine current per-category state
		const row = await this.repository.getConnectionByTelegramUserId(BigInt(chatId));
		let prefs = DEFAULT_TELEGRAM_PREFERENCES;
		if (row?.notification_preferences_json) {
			try {
				prefs = {...DEFAULT_TELEGRAM_PREFERENCES, ...JSON.parse(row.notification_preferences_json)};
			} catch {
				/* ignore */
			}
		}
		const tick = (on: boolean) => (on ? '✅' : '⬜️');
		await this.botClient.sendMessage({
			chatId,
			text: SETTINGS_PROMPT,
			parseMode: 'HTML',
			replyMarkup: {
				inline_keyboard: [
					[{text: `${tick(prefs.dms ?? true)} Личные сообщения`, callback_data: 'astral:pref:dms'}],
					[{text: `${tick(prefs.mentions ?? true)} Упоминания (@you)`, callback_data: 'astral:pref:mentions'}],
					[{text: `${tick(prefs.calls ?? true)} Пропущенные звонки`, callback_data: 'astral:pref:calls'}],
					[{text: `${tick(prefs.friend_requests ?? true)} Запросы в друзья`, callback_data: 'astral:pref:friend_requests'}],
					[{text: `${tick(prefs.billing ?? true)} Billing / Premium`, callback_data: 'astral:pref:billing'}],
					[{text: `${tick(prefs.announcements ?? false)} Анонсы Astral`, callback_data: 'astral:pref:announcements'}],
					[
						{
							text: row?.notifications_enabled === false ? '🔔 Включить все' : '🔕 Выключить все',
							callback_data: row?.notifications_enabled === false ? 'astral:notifications:on' : 'astral:notifications:off',
						},
					],
				],
			},
		});
	}

	private async togglePreference(chatId: bigint, telegramUserId: bigint, category: string): Promise<void> {
		const row = await this.repository.getConnectionByTelegramUserId(telegramUserId);
		if (!row) {
			await this.botClient.sendMessage({chatId, text: 'Аккаунт не привязан к Astral.'});
			return;
		}
		let prefs: Record<string, boolean | undefined> = {...DEFAULT_TELEGRAM_PREFERENCES};
		if (row.notification_preferences_json) {
			try {
				prefs = {...prefs, ...JSON.parse(row.notification_preferences_json)};
			} catch {
				/* ignore */
			}
		}
		const allowed = ['dms', 'mentions', 'calls', 'friend_requests', 'billing', 'announcements'];
		if (!allowed.includes(category)) {
			await this.botClient.sendMessage({chatId, text: 'Неизвестная категория.'});
			return;
		}
		prefs[category] = !prefs[category];
		await this.repository.upsertConnection(
			{
				...row,
				notification_preferences_json: JSON.stringify(prefs),
				updated_at: new Date(),
			},
			row.telegram_user_id,
		);
		await this.sendSettings(chatId);
	}

	private async handleDisconnect(chatId: bigint): Promise<void> {
		const row = await this.repository.getConnectionByTelegramUserId(BigInt(chatId));
		if (!row) {
			await this.botClient.sendMessage({chatId, text: 'Аккаунт уже отвязан.'});
			return;
		}
		await this.repository.deleteConnection(row.user_id);
		await this.botClient.sendMessage({
			chatId,
			text: '✅ Аккаунт отвязан от Astral. Вы больше не получите уведомления.\n\nЧтобы привязать снова — откройте Astral → Settings → Integrations → Telegram.',
		});
	}
}
