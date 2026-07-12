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

import type {LocalTrackPublication, RemoteAudioTrack, Room} from 'livekit-client';
import {Track} from 'livekit-client';
import {Logger} from '~/lib/Logger';
import KeybindStore from '~/stores/KeybindStore';
import LocalVoiceStateStore from '~/stores/LocalVoiceStateStore';
import ParticipantVolumeStore from '~/stores/ParticipantVolumeStore';
import VoiceSettingsStore from '~/stores/VoiceSettingsStore';
import VoiceDevicePermissionStore from '~/stores/voice/VoiceDevicePermissionStore';
import VoiceActivityManager from '~/stores/voice/VoiceActivityManager';
import {clampMediaVolumePercent} from '~/utils/voice/audioVolume';
import type {VoiceState} from './VoiceStateManager';

const logger = new Logger('VoiceAudioManager');

const isRemoteAudioTrack = (track: unknown): track is RemoteAudioTrack =>
	track != null && typeof track === 'object' && 'kind' in track && (track as {kind: string}).kind === Track.Kind.Audio;

const extractUserId = (identity: string): string | null => {
	if (!identity.startsWith('user_')) return null;
	const value = identity.slice(5);
	const delimiterIndex = value.indexOf('_');
	return delimiterIndex === -1 ? value : value.slice(0, delimiterIndex);
};

export function applyLocalAudioPreferencesForUser(userId: string, room: Room | null): void {
	if (!room) {
		logger.warn('[applyLocalAudioPreferencesForUser] No room');
		return;
	}

	const selfDeaf = LocalVoiceStateStore.getSelfDeaf();

	room.remoteParticipants.forEach((p) => {
		if (extractUserId(p.identity) !== userId) return;

		p.audioTrackPublications.forEach((pub) => {
			try {
				const volume = ParticipantVolumeStore.getVolumeForAudioSource(userId, pub.source);
				const locallyMuted = ParticipantVolumeStore.isLocalMuted(userId);

				const track = pub.track;
				if (isRemoteAudioTrack(track)) {
					track.setVolume(clampMediaVolumePercent(volume));
				}

				const shouldDisable = locallyMuted || selfDeaf;
				if (pub.isSubscribed || pub.track) {
					pub.setEnabled(!shouldDisable);
				}
			} catch (error) {
				logger.warn(`[applyLocalAudioPreferencesForUser] Failed for user ${userId}`, {error});
			}
		});
	});
}

export function applyAllLocalAudioPreferences(room: Room | null): void {
	if (!room) {
		logger.warn('[applyAllLocalAudioPreferences] No room');
		return;
	}

	const selfDeaf = LocalVoiceStateStore.getSelfDeaf();
	ParticipantVolumeStore.applySettingsToRoom(room, selfDeaf);
}

export function applyPushToTalkHold(
	held: boolean,
	room: Room | null,
	getCurrentUserVoiceState: () => VoiceState | null,
	syncVoiceState: (partial: {self_mute?: boolean}) => void,
): void {
	KeybindStore.setPushToTalkHeld(held);
	if (!KeybindStore.isPushToTalkEnabled()) return;

	const serverVoiceState = getCurrentUserVoiceState();
	if (serverVoiceState?.mute || serverVoiceState?.suppress) return;

	// In push-to-talk mode, key hold state is the source of truth:
	// hold -> unmuted, release -> muted.
	const shouldMute = !held;

	applyLocalMuteState(shouldMute, room, syncVoiceState);
}

export function handlePushToTalkModeChange(
	room: Room | null,
	getCurrentUserVoiceState: () => VoiceState | null,
	syncVoiceState: (partial: {self_mute?: boolean}) => void,
): void {
	const serverVoiceState = getCurrentUserVoiceState();
	if (serverVoiceState?.mute || serverVoiceState?.suppress) return;

	// Push-to-talk means the mic stays closed until a key is held. Mute as soon
	// as the mode is selected — even before a key is bound — so the user is never
	// unexpectedly transmitting on an open mic while they think PTT is active.
	if (KeybindStore.isPushToTalkEnabled()) {
		KeybindStore.setPushToTalkHeld(false);
		KeybindStore.resetPushToTalkState();
		applyLocalMuteState(true, room, syncVoiceState);
	} else if (!LocalVoiceStateStore.getHasUserSetMute()) {
		applyLocalMuteState(false, room, syncVoiceState);
	}
}

export function getMuteReason(voiceState: VoiceState | null): 'guild' | 'push_to_talk' | 'self' | null {
	const isGuildMuted = voiceState?.mute ?? false;
	if (isGuildMuted) return 'guild';

	const selfMuted = voiceState?.self_mute ?? LocalVoiceStateStore.getSelfMute();
	if (KeybindStore.isPushToTalkEnabled() && KeybindStore.isPushToTalkMuted(selfMuted)) return 'push_to_talk';
	if (selfMuted) return 'self';
	return null;
}

export function applyLocalMuteState(
	muted: boolean,
	room: Room | null,
	syncVoiceState: (partial: {self_mute?: boolean}) => void,
): void {
	const targetMute = LocalVoiceStateStore.getSelfDeaf() ? true : muted;
	const currentMute = LocalVoiceStateStore.getSelfMute();

	if (!targetMute && room?.localParticipant) {
		const participant = room.localParticipant;
		const hasAudioTrack = participant.audioTrackPublications.size > 0;
		if (!hasAudioTrack || !participant.isMicrophoneEnabled) {
			let inputDeviceId = VoiceSettingsStore.getInputDeviceId() || 'default';
			const devices = VoiceDevicePermissionStore.getState().inputDevices;
			const hasRequestedInput =
				inputDeviceId === 'default' || devices.some((device) => device.deviceId === inputDeviceId);
			if (!hasRequestedInput && devices.length > 0) {
				inputDeviceId = 'default';
			}

			void participant
				.setMicrophoneEnabled(true, {
					deviceId: inputDeviceId,
					echoCancellation: VoiceSettingsStore.getEchoCancellation(),
					noiseSuppression: VoiceSettingsStore.getNoiseSuppression(),
					autoGainControl: VoiceSettingsStore.getAutoGainControl(),
				})
				.catch((error) => {
					logger.error('Failed to enable microphone while unmuting push-to-talk', {error});
					LocalVoiceStateStore.updateSelfMute(true);
					syncVoiceState({self_mute: true});
				});
		}
	}

	if (currentMute === targetMute) {
		VoiceActivityManager.refresh();
		return;
	}

	LocalVoiceStateStore.updateSelfMute(targetMute);

	if (room?.localParticipant) {
		room.localParticipant.audioTrackPublications.forEach((publication: LocalTrackPublication) => {
			const track = publication.track;
			if (!track) return;
			const operation = targetMute ? track.mute() : track.unmute();
			operation.catch((error) =>
				logger.error(targetMute ? 'Failed to mute local track' : 'Failed to unmute local track', {error}),
			);
		});
	}

	syncVoiceState({self_mute: targetMute});
	VoiceActivityManager.refresh();
}
