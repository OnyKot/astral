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

import type {LocalAudioTrack, Room} from 'livekit-client';
import {Track} from 'livekit-client';
import {Logger} from '~/lib/Logger';
import KeybindStore from '~/stores/KeybindStore';
import LocalVoiceStateStore from '~/stores/LocalVoiceStateStore';
import VoiceSettingsStore from '~/stores/VoiceSettingsStore';
import VoiceDevicePermissionStore from '~/stores/voice/VoiceDevicePermissionStore';
import {VoiceActivityDetector} from '~/utils/voice/VoiceActivityDetector';

const logger = new Logger('VoiceActivityManager');

interface MediaEngineWindow {
	_mediaEngineStore?: {
		room?: Room | null;
		getCurrentUserVoiceState?: () => {suppress?: boolean; mute?: boolean} | null;
	};
}

/**
 * Drives voice-activity detection for the `voice_activity` transmit mode.
 *
 * When active, it captures a dedicated analysis stream from the configured
 * input device and gates the published LiveKit microphone track: audio is only
 * transmitted while the user is actually speaking. Push-to-talk, self-mute,
 * deafen and stage-suppress all take precedence and disable the detector.
 *
 * Gating is done by toggling the sent track's `MediaStreamTrack.enabled` flag,
 * which is cheap and requires no renegotiation. The analysis stream is a
 * separate capture, so closing the gate never blinds detection.
 */
class VoiceActivityManager {
	private detector: VoiceActivityDetector | null = null;
	private analysisStream: MediaStream | null = null;
	private running = false;
	private starting = false;
	private captureSignature = '';

	private buildConstraints(): MediaStreamConstraints {
		const requestedDeviceId = VoiceSettingsStore.getInputDeviceId() || 'default';
		const availableDevices = VoiceDevicePermissionStore.getState().inputDevices;
		const deviceExists =
			requestedDeviceId === 'default' || availableDevices.some((d) => d.deviceId === requestedDeviceId);
		const deviceId = deviceExists ? requestedDeviceId : 'default';

		return {
			audio: {
				deviceId: deviceId !== 'default' ? {ideal: deviceId} : undefined,
				echoCancellation: VoiceSettingsStore.getEchoCancellation(),
				noiseSuppression: VoiceSettingsStore.getNoiseSuppression(),
				autoGainControl: VoiceSettingsStore.getAutoGainControl(),
			},
		};
	}

	private buildSignature(): string {
		return JSON.stringify(this.buildConstraints().audio);
	}

	private detectorOptions() {
		return {
			thresholdDb: VoiceSettingsStore.getVoiceActivityThreshold(),
			auto: VoiceSettingsStore.getVoiceActivityAutoThreshold(),
		};
	}

	private getMediaEngine(): MediaEngineWindow['_mediaEngineStore'] | undefined {
		return (window as unknown as MediaEngineWindow)._mediaEngineStore;
	}

	private getLocalMicTrack(): LocalAudioTrack | null {
		const room = this.getMediaEngine()?.room;
		const localParticipant = room?.localParticipant;
		if (!localParticipant) return null;

		for (const publication of localParticipant.audioTrackPublications.values()) {
			const track = publication.track;
			if (track && track.kind === Track.Kind.Audio && track.source === Track.Source.Microphone) {
				return track as LocalAudioTrack;
			}
		}
		return null;
	}

	private computeShouldRun(): boolean {
		if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) return false;

		const engine = this.getMediaEngine();
		const room = engine?.room;
		const localParticipant = room?.localParticipant;
		if (!localParticipant?.isMicrophoneEnabled) return false;

		if (KeybindStore.transmitMode !== 'voice_activity') return false;
		if (LocalVoiceStateStore.getSelfMute() || LocalVoiceStateStore.getSelfDeaf()) return false;

		const voiceState = engine?.getCurrentUserVoiceState?.();
		if (voiceState?.suppress || voiceState?.mute) return false;

		return true;
	}

	/** Apply the gate to the currently published, unmuted mic track. */
	private applyGate(speaking: boolean): void {
		const track = this.getLocalMicTrack();
		if (!track || track.isMuted) return;
		const mediaStreamTrack = track.mediaStreamTrack;
		if (mediaStreamTrack && mediaStreamTrack.enabled !== speaking) {
			mediaStreamTrack.enabled = speaking;
		}
	}

	/** Re-open the gate on the live track (respecting LiveKit's mute state). */
	private openGate(): void {
		const track = this.getLocalMicTrack();
		if (!track) return;
		const mediaStreamTrack = track.mediaStreamTrack;
		if (mediaStreamTrack) {
			mediaStreamTrack.enabled = !track.isMuted;
		}
	}

	/** Recompute whether the detector should be running and start/stop it. */
	refresh(): void {
		const shouldRun = this.computeShouldRun();
		if (shouldRun && !this.running && !this.starting) {
			void this.start();
		} else if (!shouldRun && (this.running || this.starting)) {
			this.stop();
		} else if (shouldRun && this.running) {
			// Track may have been re-created (device/settings change); re-assert gate.
			this.applyGate(this.detector?.isSpeaking ?? false);
		}
	}

	/** React to changed VAD/mic settings without necessarily toggling run state. */
	refreshSettings(): void {
		if (this.detector) {
			this.detector.setOptions(this.detectorOptions());
		}
		if (this.running && this.buildSignature() !== this.captureSignature) {
			void this.restartCapture();
			return;
		}
		this.refresh();
	}

	private async start(): Promise<void> {
		if (this.running || this.starting) return;
		this.starting = true;
		try {
			const constraints = this.buildConstraints();
			this.captureSignature = JSON.stringify(constraints.audio);
			const stream = await navigator.mediaDevices.getUserMedia(constraints);

			// State may have changed while awaiting the capture.
			if (!this.computeShouldRun()) {
				stream.getTracks().forEach((track) => track.stop());
				this.starting = false;
				return;
			}

			this.analysisStream = stream;
			this.detector = new VoiceActivityDetector(this.detectorOptions(), {
				onSpeakingChange: (speaking) => this.applyGate(speaking),
			});
			await this.detector.start(stream);
			this.running = true;
			this.starting = false;
			// Start with the gate closed until speech is detected.
			this.applyGate(false);
			logger.debug('[VoiceActivityManager] Started voice-activity gating');
		} catch (error) {
			this.starting = false;
			this.cleanupCapture();
			logger.warn('[VoiceActivityManager] Failed to start voice-activity detection', {error});
		}
	}

	private async restartCapture(): Promise<void> {
		const wasSpeaking = this.detector?.isSpeaking ?? false;
		this.cleanupCapture();
		this.running = false;
		await this.start();
		if (!this.running) return;
		this.applyGate(wasSpeaking && this.detector?.isSpeaking === true);
	}

	private cleanupCapture(): void {
		this.detector?.stop();
		this.detector = null;
		if (this.analysisStream) {
			this.analysisStream.getTracks().forEach((track) => track.stop());
			this.analysisStream = null;
		}
	}

	stop(): void {
		if (!this.running && !this.starting) return;
		this.cleanupCapture();
		this.running = false;
		this.starting = false;
		this.openGate();
		logger.debug('[VoiceActivityManager] Stopped voice-activity gating');
	}
}

export default new VoiceActivityManager();
