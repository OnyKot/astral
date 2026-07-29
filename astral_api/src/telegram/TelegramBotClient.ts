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

export interface TelegramInlineKeyboardButton {
	text: string;
	callback_data?: string;
	url?: string;
}

export type TelegramInlineKeyboard = ReadonlyArray<ReadonlyArray<TelegramInlineKeyboardButton>>;

interface SendMessageOptions {
	chatId: bigint | string | number;
	text: string;
	parseMode?: 'HTML' | 'MarkdownV2';
	disableWebPagePreview?: boolean;
	replyMarkup?: {inline_keyboard: TelegramInlineKeyboard};
}

export class TelegramBotClient {
	constructor(private readonly botToken: string) {}

	private endpoint(method: string): string {
		return `https://api.telegram.org/bot${this.botToken}/${method}`;
	}

	/**
	 * Send a message via the Telegram Bot API to a single chat.
	 *
	 * Returns true on success, false on any failure (network, 4xx, 5xx).
	 * Failures are logged but never throw — sending a notification must
	 * never block the request that triggered it.
	 */
	async sendMessage(options: SendMessageOptions): Promise<boolean> {
		const body: Record<string, unknown> = {
			chat_id: typeof options.chatId === 'bigint' ? options.chatId.toString() : options.chatId,
			text: options.text,
		};
		if (options.parseMode) body.parse_mode = options.parseMode;
		if (options.disableWebPagePreview !== undefined) body.disable_web_page_preview = options.disableWebPagePreview;
		if (options.replyMarkup) body.reply_markup = options.replyMarkup;

		try {
			const response = await fetch(this.endpoint('sendMessage'), {
				method: 'POST',
				headers: {'Content-Type': 'application/json'},
				body: JSON.stringify(body),
			});
			if (!response.ok) {
				const errBody = await response.text().catch(() => '');
				Logger.warn({status: response.status, body: errBody.slice(0, 200)}, '[Telegram] sendMessage non-2xx');
				return false;
			}
			return true;
		} catch (error) {
			Logger.warn({error}, '[Telegram] sendMessage network error');
			return false;
		}
	}

	/**
	 * Send a "command menu" by registering the bot's command list. This shows
	 * up as a "/" hint in the Telegram client. Idempotent — safe to call on
	 * every restart.
	 */
	async setMyCommands(commands: ReadonlyArray<{command: string; description: string}>): Promise<boolean> {
		try {
			const response = await fetch(this.endpoint('setMyCommands'), {
				method: 'POST',
				headers: {'Content-Type': 'application/json'},
				body: JSON.stringify({commands}),
			});
			return response.ok;
		} catch (error) {
			Logger.warn({error}, '[Telegram] setMyCommands network error');
			return false;
		}
	}
}
