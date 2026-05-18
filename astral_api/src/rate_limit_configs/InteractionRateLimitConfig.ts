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

import type {RouteRateLimitConfig} from '~/middleware/RateLimitMiddleware';

export const InteractionRateLimitConfigs = {
	/*
	 * Per-user clicks. We bucket on user_id rather than message_id so a
	 * misbehaving bot's UI that puts buttons everywhere can't be turned
	 * into a DoS by spam-clicking. 60/min is generous for legitimate UX
	 * (one click every second on average).
	 */
	INTERACTION_CLICK: {
		bucket: 'interaction:click::user_id',
		config: {limit: 60, windowMs: 60000},
	} as RouteRateLimitConfig,
} as const;
