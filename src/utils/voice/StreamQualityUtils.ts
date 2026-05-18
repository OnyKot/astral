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

import type {ScreenShareCaptureOptions, TrackPublishOptions, VideoResolution} from 'livekit-client';
import {ScreenSharePresets, VideoPreset, VideoPresets} from 'livekit-client';

export type CameraStreamResolution = 'low' | 'medium' | 'high';
export type ScreenShareStreamResolution = 'low' | 'medium' | 'high' | 'ultra' | '4k';

const SCREEN_SHARE_ULTRA_PRESET = new VideoPreset(2560, 1440, 8_000_000, 30, 'medium');
const SCREEN_SHARE_4K_PRESET = new VideoPreset(3840, 2160, 12_000_000, 30, 'medium');

const CAMERA_PRESETS: Record<CameraStreamResolution, VideoPreset> = {
	low: VideoPresets.h360,
	medium: VideoPresets.h720,
	high: VideoPresets.h1080,
};

const SCREEN_SHARE_PRESETS: Record<ScreenShareStreamResolution, VideoPreset> = {
	low: ScreenSharePresets.h360fps15,
	medium: ScreenSharePresets.h720fps30,
	high: ScreenSharePresets.h1080fps30,
	ultra: SCREEN_SHARE_ULTRA_PRESET,
	'4k': SCREEN_SHARE_4K_PRESET,
};

export function getCameraVideoPreset(resolution: CameraStreamResolution): VideoPreset {
	return CAMERA_PRESETS[resolution] ?? CAMERA_PRESETS.medium;
}

export function getCameraCaptureResolution(
	resolution: CameraStreamResolution,
	frameRate: number,
): VideoResolution {
	const preset = getCameraVideoPreset(resolution);
	return {
		...preset.resolution,
		frameRate,
		aspectRatio: 16 / 9,
	};
}

export function getCameraPublishOptions(resolution: CameraStreamResolution): TrackPublishOptions {
	return {
		videoEncoding: getCameraVideoPreset(resolution).encoding,
		simulcast: true,
		degradationPreference: 'maintain-resolution',
	};
}

export function getScreenShareVideoPreset(resolution: ScreenShareStreamResolution): VideoPreset {
	return SCREEN_SHARE_PRESETS[resolution] ?? SCREEN_SHARE_PRESETS.medium;
}

export function getScreenShareQualityOptions(
	resolution: ScreenShareStreamResolution,
	frameRate: number,
): {captureOptions: ScreenShareCaptureOptions; publishOptions: TrackPublishOptions} {
	const preset = getScreenShareVideoPreset(resolution);
	return {
		captureOptions: {
			audio: true,
			selfBrowserSurface: 'include',
			surfaceSwitching: 'include',
			systemAudio: 'include',
			contentHint: 'detail',
			resolution: {
				...preset.resolution,
				frameRate,
			},
		},
		publishOptions: {
			screenShareEncoding: {
				...preset.encoding,
				maxFramerate: frameRate,
			},
			simulcast: true,
			screenShareSimulcastLayers: [new VideoPreset(1280, 720, 2_000_000, Math.min(frameRate, 30), 'medium')],
			degradationPreference: 'maintain-resolution',
		},
	};
}
