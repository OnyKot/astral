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

import type {Participant, Room} from 'livekit-client';
import {RoomEvent, Track} from 'livekit-client';
import * as SoundActionCreators from '~/actions/SoundActionCreators';
import {Logger} from '~/lib/Logger';
import LocalVoiceStateStore from '~/stores/LocalVoiceStateStore';
import ParticipantVolumeStore from '~/stores/ParticipantVolumeStore';
import UserStore from '~/stores/UserStore';
import {SoundType} from '~/utils/SoundUtils';
import {sendVoiceStateDisconnect} from './VoiceChannelConnector';
import VoiceConnectionManager from './VoiceConnectionManager';
import VoiceMediaManager from './VoiceMediaManager';
import VoiceParticipantManager from './VoiceParticipantManager';
import VoicePermissionManager from './VoicePermissionManager';

const logger = new Logger('VoiceRoomEventBinder');

const isRemoteAudioTrack = (track: unknown): track is {setVolume: (v: number) => void; kind: string} =>
	track != null && typeof track === 'object' && 'kind' in track && (track as {kind: string}).kind === Track.Kind.Audio;

const extractUserId = (identity: string): string | null => {
	const match = identity.match(/^user_(\d+)(?:_(.+))?$/);
	return match ? match[1] : null;
};
const duplicateDisconnectCooldown = new Map<string, number>();

export interface RoomEventCallbacks {
	onConnected: () => Promise<void>;
	onDisconnected: () => void;
	onReconnecting: () => void;
	onReconnected: () => void;
}

function abortRoomAfterSetupError(room: Room, callbacks: RoomEventCallbacks, error: unknown): void {
	logger.error('Room setup failed after LiveKit connected', {
		error,
		errorName: error instanceof Error ? error.name : 'unknown',
		errorMessage: error instanceof Error ? error.message : String(error),
	});

	LocalVoiceStateStore.updateSelfVideo(false);
	LocalVoiceStateStore.updateSelfStream(false);
	VoiceMediaManager.resetStreamTracking();
	callbacks.onDisconnected();
	VoiceParticipantManager.clear();
	VoiceConnectionManager.disconnectFromVoiceChannel('error');

	try {
		room.disconnect();
	} catch (disconnectError) {
		logger.warn('Failed to disconnect room after setup error', {error: disconnectError});
	}
}

export function bindRoomEvents(
	room: Room,
	attemptId: number,
	guildId: string | null,
	channelId: string,
	callbacks: RoomEventCallbacks,
): void {
	const guard = VoiceConnectionManager.createGuardedHandler.bind(VoiceConnectionManager);
	const upsertAndEnforceSingleConnection = (p: Participant) => {
		VoiceParticipantManager.upsertParticipant(p);

		const currentUser = UserStore.getCurrentUser();
		const currentConnectionId = VoiceConnectionManager.connectionId;
		const currentChannelId = VoiceConnectionManager.channelId;
		if (!currentUser || !currentConnectionId || !currentChannelId) return;

		const now = Date.now();
		for (const snapshot of Object.values(VoiceParticipantManager.participants)) {
			if (snapshot.userId !== currentUser.id) continue;
			if (!snapshot.connectionId || snapshot.connectionId === currentConnectionId) continue;

			const cooldownKey = `${guildId ?? 'dm'}:${snapshot.connectionId}`;
			const lastSentAt = duplicateDisconnectCooldown.get(cooldownKey) ?? 0;
			if (now - lastSentAt < 5000) continue;

			duplicateDisconnectCooldown.set(cooldownKey, now);
			sendVoiceStateDisconnect(guildId, snapshot.connectionId);
		}
	};

	room.on(
		RoomEvent.Connected,
		guard(attemptId, () => {
			void (async () => {
				try {
					VoiceParticipantManager.hydrateFromRoom(room);
					VoicePermissionManager.applyDeafen(room, LocalVoiceStateStore.getSelfDeaf());
					VoiceConnectionManager.markConnected();
					await callbacks.onConnected();
					await VoiceMediaManager.playEntranceSound();
					await VoiceMediaManager.ensureMicrophone(room, channelId);
					if (guildId && channelId) {
						VoicePermissionManager.syncWithPermissionStore(guildId, channelId, room);
					}
				} catch (error) {
					abortRoomAfterSetupError(room, callbacks, error);
				}
			})();
		}),
	);

	room.on(
		RoomEvent.Disconnected,
		guard(attemptId, () => {
			LocalVoiceStateStore.updateSelfVideo(false);
			LocalVoiceStateStore.updateSelfStream(false);
			VoiceMediaManager.resetStreamTracking();
			callbacks.onDisconnected();
			VoiceParticipantManager.clear();
			VoiceConnectionManager.markDisconnected('error');
		}),
	);

	room.on(
		RoomEvent.Reconnecting,
		guard(attemptId, () => {
			callbacks.onReconnecting();
			VoiceConnectionManager.markReconnecting();
		}),
	);

	room.on(
		RoomEvent.Reconnected,
		guard(attemptId, () => {
			VoiceParticipantManager.hydrateFromRoom(room);
			VoicePermissionManager.applyDeafen(room, LocalVoiceStateStore.getSelfDeaf());
			VoiceConnectionManager.markReconnected();
			callbacks.onReconnected();
		}),
	);

	room.on(
		RoomEvent.ParticipantConnected,
		guard(attemptId, (p: Participant) => {
			upsertAndEnforceSingleConnection(p);
			if (p.identity.startsWith('user_')) {
				SoundActionCreators.playSound(SoundType.UserJoin);
			} else {
				SoundActionCreators.playSound(SoundType.ViewerJoin);
			}
		}),
	);

	room.on(
		RoomEvent.ParticipantDisconnected,
		guard(attemptId, (p: Participant) => {
			VoiceParticipantManager.removeParticipant(p.identity);
			if (VoiceConnectionManager.disconnecting) return;
			if (p.identity === room.localParticipant?.identity) return;
			if (p.identity.startsWith('user_')) {
				SoundActionCreators.playSound(SoundType.UserLeave);
			} else {
				SoundActionCreators.playSound(SoundType.ViewerLeave);
			}
		}),
	);

	room.on(
		RoomEvent.TrackSubscribed,
		guard(attemptId, (track, pub, participant: Participant) => {
			try {
				if (pub.kind === Track.Kind.Audio && isRemoteAudioTrack(track)) {
					const userId = extractUserId(participant.identity);
					if (userId) {
						const volume = ParticipantVolumeStore.getVolumeForAudioSource(userId, pub.source) / 100;
						track.setVolume(volume);
						const locallyMuted = ParticipantVolumeStore.isLocalMuted(userId);
						const selfDeaf = LocalVoiceStateStore.getSelfDeaf();
						pub.setEnabled(!locallyMuted && !selfDeaf);
					}
				}
			} catch {}
			upsertAndEnforceSingleConnection(participant);
		}),
	);

	room.on(
		RoomEvent.TrackUnsubscribed,
		guard(attemptId, (_t, _pub, p: Participant) => upsertAndEnforceSingleConnection(p)),
	);

	room.on(
		RoomEvent.TrackMuted,
		guard(attemptId, (_pub, p: Participant) => upsertAndEnforceSingleConnection(p)),
	);

	room.on(
		RoomEvent.TrackUnmuted,
		guard(attemptId, (_pub, p: Participant) => upsertAndEnforceSingleConnection(p)),
	);

	room.on(
		RoomEvent.ParticipantMetadataChanged,
		guard(attemptId, (_m, p: Participant) => upsertAndEnforceSingleConnection(p)),
	);

	room.on(
		RoomEvent.ParticipantAttributesChanged,
		guard(attemptId, (_a, p: Participant) => upsertAndEnforceSingleConnection(p)),
	);

	room.on(
		RoomEvent.ParticipantNameChanged,
		guard(attemptId, (_n, p: Participant) => upsertAndEnforceSingleConnection(p)),
	);

	room.on(
		RoomEvent.ConnectionQualityChanged,
		guard(attemptId, (_q, p: Participant) => upsertAndEnforceSingleConnection(p)),
	);

	room.on(
		RoomEvent.LocalTrackPublished,
		guard(attemptId, (_pub, p: Participant) => upsertAndEnforceSingleConnection(p)),
	);

	room.on(
		RoomEvent.LocalTrackUnpublished,
		guard(attemptId, (_pub, p: Participant) => upsertAndEnforceSingleConnection(p)),
	);

	room.on(
		RoomEvent.ActiveSpeakersChanged,
		guard(attemptId, (speakers: Array<Participant>) => VoiceParticipantManager.updateActiveSpeakers(speakers)),
	);

	room.on(
		RoomEvent.TrackPublished,
		guard(attemptId, (pub) => {
			try {
				if (pub.source === Track.Source.Microphone || pub.source === Track.Source.ScreenShareAudio) {
					pub.setSubscribed(!LocalVoiceStateStore.getSelfDeaf());
					return;
				}
				if (pub.source === Track.Source.Camera || pub.source === Track.Source.ScreenShare) {
					pub.setSubscribed(false);
				}
			} catch {}
		}),
	);
}
