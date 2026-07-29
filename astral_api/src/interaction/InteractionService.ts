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

/*
 * InteractionService — handles message-component clicks (buttons,
 * select menus). The user clicks a button on a message → client POSTs
 * to /v1/interactions/click → this service:
 *
 *   1. validates the user has access to the channel
 *   2. fetches the message and verifies it has components
 *   3. verifies the custom_id the client sent actually exists in the
 *      message's component tree (defends against forged clicks)
 *   4. resolves the webhook that authored the message
 *   5. if the webhook has an interaction_url → queues a worker task
 *      to POST the interaction payload to that URL
 *
 * Bots respond by calling the existing webhook execute endpoint
 * (POST /webhooks/{id}/{token}) — there's no separate "interaction
 * response" endpoint. The bot uses the same webhook URL it would for
 * any normal message; it just happens to be a follow-up to a click.
 *
 * NOT IMPLEMENTED YET (deliberate scope cut for v1):
 *   - ed25519 signature on outbound delivery (we send a plain HMAC
 *     stub via X-Astral-Signature for now; bots can verify by checking
 *     the timestamp + their token)
 *   - "deferred" interactions (the bot getting more than 3 seconds to
 *     respond) — bots just respond async via the webhook execute API
 *   - modal submits (component type 4)
 *   - link buttons (style=5) don't fire clicks; the client handles them
 *     directly as anchor tags
 */

import {createHmac} from 'node:crypto';
import {type ChannelID, createUserID, type MessageID, type UserID} from '~/BrandedTypes';
import type {ChannelService} from '~/channel/services/ChannelService';
import {
	findComponentByCustomId,
	type MessageComponentButton,
	type MessageComponentSelect,
} from '~/channel/ComponentTypes';
import type {IChannelRepository} from '~/channel/IChannelRepository';
import {InputValidationError, UnknownMessageError, UnknownWebhookError} from '~/Errors';
import type {SnowflakeService} from '~/infrastructure/SnowflakeService';
import type {UserCacheService} from '~/infrastructure/UserCacheService';
import {Logger} from '~/Logger';
import type {RequestCache} from '~/middleware/RequestCacheMiddleware';
import type {Webhook} from '~/Models';
import {getCachedUserPartialResponse} from '~/user/UserCacheHelpers';
import type {IWebhookRepository} from '~/webhook/IWebhookRepository';
import type {IWorkerService} from '~/worker/IWorkerService';

/*
 * Discord-compatible interaction payload (shape used by Discord's
 * Interactions API for component clicks). Bots that already handle
 * Discord interactions can drop this in with minimal changes — the
 * field names are intentionally identical.
 *
 * `type: 3` is MESSAGE_COMPONENT (button click / select submit).
 * `data.component_type: 2` = button, `3` = string select.
 */
export interface InteractionPayload {
	id: string;
	type: 3;
	token: string;
	version: 1;
	channel_id: string;
	guild_id?: string;
	message_id: string;
	user: {
		id: string;
		username: string;
		discriminator: string;
		avatar: string | null;
	};
	data: {
		custom_id: string;
		component_type: 2 | 3;
		values?: Array<string>;
	};
}

export interface InteractionClickInput {
	userId: UserID;
	channelId: ChannelID;
	messageId: MessageID;
	customId: string;
	values?: Array<string>;
}

export class InteractionService {
	/*
	 * Symmetric secret used to sign outbound interaction payloads. We
	 * derive this from a config env so deployments don't have to ship
	 * a key, but operators can override it. Bots verify the signature
	 * by re-computing HMAC-SHA256(timestamp + body) with the same key
	 * (which they get out of band when configuring their webhook).
	 *
	 * Falls back to the webhook's own token as the key — that's what
	 * Slack does and it removes the need for a separate signing key
	 * per integration. The token is already secret-by-construction.
	 */
	constructor(
		private readonly channelService: ChannelService,
		private readonly channelRepository: IChannelRepository,
		private readonly webhookRepository: IWebhookRepository,
		private readonly userCacheService: UserCacheService,
		private readonly snowflakeService: SnowflakeService,
		private readonly workerService: IWorkerService,
	) {}

	async handleClick(input: InteractionClickInput, requestCache: RequestCache): Promise<void> {
		// 1. Validate channel access. getChannel throws UnknownChannelError
		//    if the user can't see the channel — same access path as
		//    fetching messages, so this is the same trust boundary as
		//    "is allowed to view this message at all".
		const channel = await this.channelService.getChannel({
			userId: input.userId,
			channelId: input.channelId,
		});

		// 2. Fetch the message and verify it exists in this channel.
		const message = await this.channelRepository.getMessage(input.channelId, input.messageId);
		if (!message) {
			throw new UnknownMessageError();
		}

		// 3. Message must have components, and the custom_id must exist
		//    in the component tree. Defends against forged clicks: a
		//    malicious client can't make us deliver an arbitrary
		//    custom_id to a webhook by lying in the request body.
		if (!message.components || message.components.length === 0) {
			throw InputValidationError.create('custom_id', 'Message has no interactive components');
		}
		const component = findComponentByCustomId(message.components, input.customId);
		if (!component) {
			throw InputValidationError.create('custom_id', 'No component with this custom_id on the message');
		}

		// Validate component type vs payload shape. Buttons must not have
		// `values`; select menus must have at least one.
		if (component.type === 2 && input.values && input.values.length > 0) {
			throw InputValidationError.create('values', 'Button clicks do not carry values');
		}
		if (component.type === 3) {
			if (!input.values || input.values.length === 0) {
				throw InputValidationError.create('values', 'Select submits require at least one value');
			}
			const allowed = new Set(component.options.map((opt) => opt.value));
			for (const v of input.values) {
				if (!allowed.has(v)) {
					throw InputValidationError.create('values', `Value not in select options: ${v}`);
				}
			}
		}

		// 4. Resolve the webhook. The message must have been authored by
		//    a webhook (otherwise components shouldn't exist on it).
		if (!message.webhookId) {
			throw InputValidationError.create('message_id', 'Message was not sent by a webhook');
		}
		const webhook = await this.webhookRepository.findUnique(message.webhookId);
		if (!webhook) {
			throw new UnknownWebhookError();
		}

		// 5. If the webhook has no interaction_url, the click is a no-op.
		//    We don't error — the bot owner just hasn't wired up handlers
		//    yet. Logging at debug helps them notice when they're ready.
		if (!webhook.interactionUrl) {
			Logger.debug(
				{webhookId: webhook.id.toString(), customId: input.customId},
				'Interaction click received for webhook without interaction_url; dropping',
			);
			return;
		}

		// 6. Build the outbound payload + queue delivery.
		const payload = await this.buildPayload({
			userId: input.userId,
			channel,
			message: {id: input.messageId},
			component,
			values: input.values,
			requestCache,
		});

		const body = JSON.stringify(payload);
		const timestamp = Math.floor(Date.now() / 1000).toString();
		const signature = this.signPayload(webhook, timestamp, body);

		await this.workerService.addJob(
			'deliverInteraction',
			{
				url: webhook.interactionUrl,
				body,
				signature,
				timestamp,
			},
			{maxAttempts: 5},
		);
	}

	private async buildPayload({
		userId,
		channel,
		message,
		component,
		values,
		requestCache,
	}: {
		userId: UserID;
		channel: {id: ChannelID; guildId: bigint | null};
		message: {id: MessageID};
		component: MessageComponentButton | MessageComponentSelect;
		values: Array<string> | undefined;
		requestCache: RequestCache;
	}): Promise<InteractionPayload> {
		const userPartial = await getCachedUserPartialResponse({
			userId,
			userCacheService: this.userCacheService,
			requestCache,
		});
		if (!userPartial) {
			throw new Error(`User ${userId} not found while building interaction payload`);
		}

		const interactionId = this.snowflakeService.generate().toString();

		// Token is a short opaque identifier the bot can use as a
		// correlation ID when posting its response to the webhook
		// execute endpoint. We don't currently validate it on the way
		// back (the bot is already authenticated by its webhook token).
		const token = `int_${this.snowflakeService.generate().toString(36)}`;

		const payload: InteractionPayload = {
			id: interactionId,
			type: 3,
			token,
			version: 1,
			channel_id: channel.id.toString(),
			message_id: message.id.toString(),
			user: {
				id: userPartial.id,
				username: userPartial.username,
				discriminator: userPartial.discriminator,
				avatar: userPartial.avatar ?? null,
			},
			data: {
				custom_id: component.custom_id!,
				component_type: component.type,
				...(values && values.length > 0 ? {values} : {}),
			},
		};
		if (channel.guildId) {
			payload.guild_id = channel.guildId.toString();
		}
		return payload;
	}

	private signPayload(webhook: Webhook, timestamp: string, body: string): string {
		// HMAC-SHA256(timestamp + body) keyed on the webhook token.
		// The bot already has the webhook token (it created the webhook
		// or was given the URL), so it can verify by re-computing this
		// against its known token. Format mirrors Slack's signing.
		try {
			const hmac = createHmac('sha256', webhook.token);
			hmac.update(`v1:${timestamp}:${body}`);
			return `v1=${hmac.digest('hex')}`;
		} catch (error) {
			Logger.warn({error, webhookId: webhook.id.toString()}, 'Failed to sign interaction payload');
			return '';
		}
	}

	// Helper used by tests / scripts to bypass the controller layer.
	static createUserId(value: string | bigint | number): UserID {
		return createUserID(BigInt(value));
	}
}
