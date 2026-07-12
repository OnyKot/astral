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

import VoiceSettingsStore from '~/stores/VoiceSettingsStore';
import MediaEngineStore from '~/stores/voice/MediaEngineFacade';
import VoiceActivityManager from '~/stores/voice/VoiceActivityManager';

export const update = (
	settings: Partial<{
		inputDeviceId: string;
		outputDeviceId: string;
		videoDeviceId: string;
		inputVolume: number;
		outputVolume: number;
		echoCancellation: boolean;
		noiseSuppression: boolean;
		autoGainControl: boolean;
		voiceActivityThreshold: number;
		voiceActivityAutoThreshold: boolean;
		cameraResolution: 'low' | 'medium' | 'high';
		screenshareResolution: 'low' | 'medium' | 'high' | 'ultra' | '4k';
		videoFrameRate: number;
		backgroundImageId: string;
		backgroundImages: Array<{id: string; createdAt: number}>;
		showGridView: boolean;
		showMyOwnCamera: boolean;
		showNonVideoParticipants: boolean;
	}>,
): void => {
	VoiceSettingsStore.updateSettings(settings);

	if (
		settings.echoCancellation !== undefined ||
		settings.noiseSuppression !== undefined ||
		settings.autoGainControl !== undefined ||
		settings.inputDeviceId !== undefined
	) {
		void MediaEngineStore.applyLiveMicrophoneSettings();
	}

	if (
		settings.voiceActivityThreshold !== undefined ||
		settings.voiceActivityAutoThreshold !== undefined ||
		settings.echoCancellation !== undefined ||
		settings.noiseSuppression !== undefined ||
		settings.autoGainControl !== undefined ||
		settings.inputDeviceId !== undefined
	) {
		VoiceActivityManager.refreshSettings();
	}
};
