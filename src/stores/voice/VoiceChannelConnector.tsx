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

import {VoiceChannelFullModal} from '~/components/alerts/VoiceChannelFullModal';
import {modal} from '~/actions/ModalActionCreators';
import * as ModalActionCreators from '~/actions/ModalActionCreators';
import {ME} from '~/Constants';
import {Logger} from '~/lib/Logger';
import ChannelStore from '~/stores/ChannelStore';
import ConnectionStore from '~/stores/ConnectionStore';
import LocalVoiceStateStore from '~/stores/LocalVoiceStateStore';
import UserStore from '~/stores/UserStore';
import VoiceConnectionManager from './VoiceConnectionManager';
import VoiceStateManager from './VoiceStateManager';

const logger = new Logger('VoiceChannelConnector');

export function checkChannelLimit(guildId: string | null, channelId: string): boolean {
	if (!guildId) return true;

	const channel = ChannelStore.getChannel(channelId);
	if (!channel?.userLimit || channel.userLimit <= 0) return true;

	const voiceStates = VoiceStateManager.getAllVoiceStatesInChannel(guildId, channelId);
	const connectedUserIds = new Set(Object.values(voiceStates).map((voiceState) => voiceState.user_id));
	const count = connectedUserIds.size;
	const user = UserStore.getCurrentUser();
	const already = user && connectedUserIds.has(user.id);
	const adjusted = already ? count - 1 : count;

	if (adjusted >= channel.userLimit) {
		ModalActionCreators.push(modal(() => <VoiceChannelFullModal />));
		return false;
	}

	return true;
}

export function disconnectOtherCurrentUserVoiceConnections(): void {
	const user = UserStore.getCurrentUser();
	if (!user) return;

	const socket = ConnectionStore.socket;
	if (!socket) return;

	const currentConnectionId = VoiceConnectionManager.connectionId;
	const allVoiceStates = VoiceStateManager.getAllVoiceStates();
	const userStates = Object.values(allVoiceStates).flatMap((guildStates) =>
		Object.values(guildStates).flatMap((channelStates) => Object.values(channelStates)),
	).filter(
		(vs) => vs.user_id === user.id && vs.connection_id !== currentConnectionId,
	);

	for (const vs of userStates) {
		if (!vs.connection_id) {
			continue;
		}

		socket.updateVoiceState({
			guild_id: vs.guild_id === ME ? null : (vs.guild_id ?? null),
			channel_id: null,
			self_mute: true,
			self_deaf: true,
			self_video: false,
			self_stream: false,
			viewer_stream_key: null,
			connection_id: vs.connection_id,
		});
	}
}

export function sendVoiceStateConnect(guildId: string | null, channelId: string): void {
	const socket = ConnectionStore.socket;
	if (!socket) {
		logger.warn('[sendVoiceStateConnect] No socket');
		return;
	}

	LocalVoiceStateStore.ensurePermissionMute();

	/*
	 * Always send connection_id=null on a fresh JOIN. The "connect"
	 * intent must always force the gateway through the new-connection
	 * path (request a new LiveKit token, allocate a new connection_id).
	 *
	 * Previously this passed `VoiceConnectionManager.connectionId ?? null`
	 * which leaked the OLD connection_id when the user clicked a different
	 * voice channel without explicitly disconnecting first. The gateway
	 * would then take the in-place update branch and rewrite channel_id
	 * on the existing voice state without ever moving the LiveKit room —
	 * resulting in "switching channels doesn't work on the first try"
	 * (audio stayed in the old room, UI showed the new room).
	 *
	 * Per-call mute/deaf/video updates flow through syncVoiceStateToServer,
	 * which is the only path that should carry an existing connection_id.
	 */
	socket.updateVoiceState({
		guild_id: guildId,
		channel_id: channelId,
		self_mute: LocalVoiceStateStore.getSelfMute(),
		self_deaf: LocalVoiceStateStore.getSelfDeaf(),
		self_video: false,
		self_stream: false,
		viewer_stream_key: null,
		connection_id: null,
	});
}

export function sendVoiceStateDisconnect(guildId: string | null, connectionId: string): void {
	const socket = ConnectionStore.socket;
	if (!socket) {
		logger.warn('[sendVoiceStateDisconnect] No socket');
		return;
	}

	socket.updateVoiceState({
		guild_id: guildId,
		channel_id: null,
		self_mute: true,
		self_deaf: true,
		self_video: false,
		self_stream: false,
		viewer_stream_key: null,
		connection_id: connectionId,
	});
}

export function syncVoiceStateToServer(
	guildId: string | null,
	channelId: string,
	connectionId: string,
	partial?: {
		self_video?: boolean;
		self_stream?: boolean;
		self_mute?: boolean;
		self_deaf?: boolean;
		viewer_stream_key?: string | null;
	},
): void {
	const socket = ConnectionStore.socket;
	if (!socket) return;

	socket.updateVoiceState({
		guild_id: guildId,
		channel_id: channelId,
		self_mute: partial?.self_mute ?? LocalVoiceStateStore.getSelfMute(),
		self_deaf: partial?.self_deaf ?? LocalVoiceStateStore.getSelfDeaf(),
		self_video: partial?.self_video ?? LocalVoiceStateStore.getSelfVideo(),
		self_stream: partial?.self_stream ?? LocalVoiceStateStore.getSelfStream(),
		viewer_stream_key: partial?.viewer_stream_key ?? LocalVoiceStateStore.getViewerStreamKey(),
		connection_id: connectionId,
	});
}
