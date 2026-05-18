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

import type {HonoApp} from '~/App';
import {createChannelID, createMessageID} from '~/BrandedTypes';
import {LoginRequired} from '~/middleware/AuthMiddleware';
import {RateLimitMiddleware} from '~/middleware/RateLimitMiddleware';
import {RateLimitConfigs} from '~/RateLimitConfig';
import {Int64Type, z} from '~/Schema';
import {Validator} from '~/Validator';

/*
 * POST /v1/interactions/click
 *
 * Body:
 *   {
 *     channel_id: snowflake,
 *     message_id: snowflake,
 *     custom_id:  string,
 *     values?:    Array<string>   // for select menus
 *   }
 *
 * Auth: requires LoginRequired (a Astral user session). Same trust
 * boundary as posting a message — if you can see the channel, you can
 * click a button on a message in it.
 *
 * Returns 204 No Content. Delivery to the bot's interaction_url is
 * fire-and-forget via Graphile Worker; clients can't observe failures.
 * If they need a confirmation, the bot's response message will arrive
 * via the gateway as a normal MESSAGE_CREATE event.
 */

const InteractionClickRequest = z.object({
	channel_id: Int64Type,
	message_id: Int64Type,
	custom_id: z.string().min(1).max(100),
	values: z.array(z.string().min(1).max(200)).max(25).optional(),
});

export const InteractionController = (app: HonoApp) => {
	app.post(
		'/interactions/click',
		RateLimitMiddleware(RateLimitConfigs.INTERACTION_CLICK),
		LoginRequired,
		Validator('json', InteractionClickRequest),
		async (ctx) => {
			const body = ctx.req.valid('json');
			const user = ctx.get('user');

			await ctx.get('interactionService').handleClick(
				{
					userId: user.id,
					channelId: createChannelID(body.channel_id),
					messageId: createMessageID(body.message_id),
					customId: body.custom_id,
					values: body.values,
				},
				ctx.get('requestCache'),
			);

			return ctx.body(null, 204);
		},
	);
};
