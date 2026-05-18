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

import {msg} from '@lingui/core/macro';
import React from 'react';
import * as ModalActionCreators from '~/actions/ModalActionCreators';
import * as PremiumModalActionCreators from '~/actions/PremiumModalActionCreators';
import * as VoiceSettingsActionCreators from '~/actions/VoiceSettingsActionCreators';
import LocalVoiceStateStore from '~/stores/LocalVoiceStateStore';
import UserStore from '~/stores/UserStore';
import VoiceSettingsStore from '~/stores/VoiceSettingsStore';

export interface ScreenShareSettingsModalSharedProps {
	onStartShare: (
		resolution: 'low' | 'medium' | 'high' | 'ultra' | '4k',
		frameRate: number,
		includeAudio: boolean,
	) => Promise<void>;
}

export const RESOLUTION_OPTIONS = [
	{value: 'low' as const, label: msg`480p`, isPremium: false},
	{value: 'medium' as const, label: msg`720p`, isPremium: false},
	{value: 'high' as const, label: msg`1080p`, isPremium: false},
	{value: 'ultra' as const, label: msg`1440p`, isPremium: true},
	{value: '4k' as const, label: msg`4K`, isPremium: true},
];

export const FRAMERATE_OPTIONS = [
	{value: 15, label: msg`15 fps`, isPremium: false},
	{value: 24, label: msg`24 fps`, isPremium: false},
	{value: 30, label: msg`30 fps`, isPremium: false},
	{value: 60, label: msg`60 fps`, isPremium: false},
];

export const useScreenShareSettingsModal = ({onStartShare}: ScreenShareSettingsModalSharedProps) => {
	const user = UserStore.currentUser;
	const voiceSettings = VoiceSettingsStore;
	const hasPremium = user?.isPremium() ?? false;
	const [isSharing, setIsSharing] = React.useState(false);
	const [selectedResolution, setSelectedResolution] = React.useState<'low' | 'medium' | 'high' | 'ultra' | '4k'>(
		!hasPremium &&
			(voiceSettings.screenshareResolution === 'ultra' ||
				voiceSettings.screenshareResolution === '4k')
			? 'medium'
			: voiceSettings.screenshareResolution,
	);
	const [selectedFrameRate, setSelectedFrameRate] = React.useState<number>(voiceSettings.videoFrameRate);
	const [includeAudio, setIncludeAudio] = React.useState<boolean>(LocalVoiceStateStore.getSelfStreamAudio());
	const isFrameRateLocked = React.useCallback(
		(
			frameRate: number,
			resolution: 'low' | 'medium' | 'high' | 'ultra' | '4k' = selectedResolution,
		) => !hasPremium && resolution === 'high' && frameRate > 30,
		[hasPremium, selectedResolution],
	);

	const handleStartShare = React.useCallback(async () => {
		setIsSharing(true);
		try {
			const effectiveFrameRate = isFrameRateLocked(selectedFrameRate) ? 30 : selectedFrameRate;
			LocalVoiceStateStore.updateSelfStreamAudio(includeAudio);
			VoiceSettingsActionCreators.update({
				screenshareResolution: selectedResolution,
				videoFrameRate: effectiveFrameRate,
			});
			await onStartShare(selectedResolution, effectiveFrameRate, includeAudio);
			ModalActionCreators.pop();
		} catch (error) {
			console.error('Failed to start screen share:', error);
			setIsSharing(false);
		}
	}, [selectedResolution, selectedFrameRate, includeAudio, onStartShare, isFrameRateLocked]);

	const handleCancel = React.useCallback(() => {
		ModalActionCreators.pop();
	}, []);

	const handleResolutionClick = React.useCallback(
		(value: 'low' | 'medium' | 'high' | 'ultra' | '4k', isPremium: boolean) => {
			if (isPremium && !hasPremium) {
				PremiumModalActionCreators.open();
				return;
			}
			setSelectedResolution(value);
			if (!hasPremium && value === 'high' && selectedFrameRate > 30) {
				setSelectedFrameRate(30);
			}
		},
		[hasPremium, selectedFrameRate],
	);

	const handleFrameRateClick = React.useCallback(
		(value: number, isPremium: boolean) => {
			if ((isPremium && !hasPremium) || isFrameRateLocked(value)) {
				PremiumModalActionCreators.open();
				return;
			}
			setSelectedFrameRate(value);
		},
		[hasPremium, isFrameRateLocked],
	);

	return {
		hasPremium,
		isSharing,
		selectedResolution,
		selectedFrameRate,
		includeAudio,
		setIncludeAudio,
		handleStartShare,
		handleCancel,
		handleResolutionClick,
		handleFrameRateClick,
		isFrameRateLocked,
		RESOLUTION_OPTIONS,
		FRAMERATE_OPTIONS,
	};
};
