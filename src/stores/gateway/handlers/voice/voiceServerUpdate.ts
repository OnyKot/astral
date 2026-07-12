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

import MediaEngineStore from '~/stores/voice/MediaEngineFacade';
import type {GatewayHandlerContext} from '../index';

interface IceServer {
	urls: Array<string>;
	username?: string;
	credential?: string;
}

interface VoiceServerUpdatePayload {
	token: string;
	endpoint: string;
	connection_id: string;
	guild_id?: string;
	channel_id?: string;
	ice_servers?: Array<IceServer>;
}

export function handleVoiceServerUpdate(data: VoiceServerUpdatePayload, _context: GatewayHandlerContext): void {
	MediaEngineStore.handleVoiceServerUpdate({
		token: data.token,
		endpoint: data.endpoint,
		connection_id: data.connection_id,
		guild_id: data.guild_id,
		channel_id: data.channel_id,
		ice_servers: data.ice_servers,
	});
}
