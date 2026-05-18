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

import {AVATAR_MAX_SIZE} from '~/Constants';
import {MessageRequest} from '~/channel/ChannelModel';
import type {UserCacheService} from '~/infrastructure/UserCacheService';
import type {Webhook} from '~/Models';
import type {RequestCache} from '~/middleware/RequestCacheMiddleware';
import {createBase64StringType, Int64Type, URLType, WebhookNameType, z} from '~/Schema';
import {getCachedUserPartialResponse} from '~/user/UserCacheHelpers';
import {UserPartialResponse} from '~/user/UserModel';

export const WebhookResponse = z.object({
	id: z.string(),
	guild_id: z.string(),
	channel_id: z.string(),
	user: z.lazy(() => UserPartialResponse),
	name: z.string(),
	avatar: z.string().nullish(),
	token: z.string(),
	interaction_url: z.string().nullish(),
});

export type WebhookResponse = z.infer<typeof WebhookResponse>;

export const WebhookCreateRequest = z.object({
	name: WebhookNameType,
	avatar: createBase64StringType(1, AVATAR_MAX_SIZE * 1.33).nullish(),
	interaction_url: z.string().url().max(2048).nullish(),
});

export type WebhookCreateRequest = z.infer<typeof WebhookCreateRequest>;

export const WebhookUpdateRequest = z
	.object({
		name: WebhookNameType,
		avatar: createBase64StringType(1, AVATAR_MAX_SIZE * 1.33).nullish(),
		channel_id: Int64Type,
		interaction_url: z.string().url().max(2048).nullable(),
	})
	.partial();

export type WebhookUpdateRequest = z.infer<typeof WebhookUpdateRequest>;

export const WebhookMessageRequest = z.object({
	...MessageRequest.shape,
	username: WebhookNameType.nullish(),
	avatar_url: URLType.nullish(),
});

export type WebhookMessageRequest = z.infer<typeof WebhookMessageRequest>;

export async function mapWebhookToResponseWithCache({
	webhook,
	userCacheService,
	requestCache,
}: {
	webhook: Webhook;
	userCacheService: UserCacheService;
	requestCache: RequestCache;
}): Promise<WebhookResponse> {
	// Webhook rows occasionally point at a creator user that's been
	// deleted since the webhook was minted. Previously we threw —
	// which propagated as a 500 on the admin "list webhooks" endpoint
	// and killed whichever session awaited it. Now we substitute a
	// "Deleted User" placeholder so the response still renders and
	// the UI can show the webhook row with a muted author slot.
	let creatorPartial;
	try {
		creatorPartial = await getCachedUserPartialResponse({
			userId: webhook.creatorId!,
			userCacheService,
			requestCache,
		});
	} catch {
		creatorPartial = {
			id: webhook.creatorId?.toString() ?? '0',
			username: 'Deleted User',
			discriminator: '0000',
			avatar: null,
			bot: false,
			flags: 0,
		};
	}
	return {
		id: webhook.id.toString(),
		guild_id: webhook.guildId?.toString() || '',
		channel_id: webhook.channelId?.toString() || '',
		user: creatorPartial,
		name: webhook.name || '',
		avatar: webhook.avatarHash,
		token: webhook.token,
		interaction_url: webhook.interactionUrl,
	};
}

export async function mapWebhooksToResponse({
	webhooks,
	userCacheService,
	requestCache,
}: {
	webhooks: Array<Webhook>;
	userCacheService: UserCacheService;
	requestCache: RequestCache;
}): Promise<Array<WebhookResponse>> {
	return await Promise.all(
		webhooks.map((webhook) => mapWebhookToResponseWithCache({webhook, userCacheService, requestCache})),
	);
}
