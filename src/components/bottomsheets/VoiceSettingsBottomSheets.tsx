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

import {useLingui} from '@lingui/react/macro';
import {
	ArrowsClockwiseIcon,
	GearIcon,
	GridFourIcon,
	MicrophoneIcon,
	SpeakerHighIcon,
	SpeakerSimpleSlashIcon,
	SpeakerSlashIcon,
	UsersIcon,
	VideoIcon,
} from '@phosphor-icons/react';
import {observer} from 'mobx-react-lite';
import type React from 'react';
import * as ModalActionCreators from '~/actions/ModalActionCreators';
import {modal} from '~/actions/ModalActionCreators';
import * as VoiceCallLayoutActionCreators from '~/actions/VoiceCallLayoutActionCreators';
import * as VoiceSettingsActionCreators from '~/actions/VoiceSettingsActionCreators';
import * as VoiceStateActionCreators from '~/actions/VoiceStateActionCreators';
import {CameraPreviewModalInRoom} from '~/components/modals/CameraPreviewModal';
import {UserSettingsModal} from '~/components/modals/UserSettingsModal';
import type {MenuGroupType, MenuRadioType} from '~/components/uikit/MenuBottomSheet/MenuBottomSheet';
import {MenuBottomSheet} from '~/components/uikit/MenuBottomSheet/MenuBottomSheet';
import {useMediaDevices} from '~/hooks/useMediaDevices';
import VoiceCallLayoutStore from '~/stores/VoiceCallLayoutStore';
import VoiceSettingsStore from '~/stores/VoiceSettingsStore';
import MediaEngineStore from '~/stores/voice/MediaEngineFacade';
import {hasDeviceLabels, resolveEffectiveDeviceId} from '~/utils/VoiceDeviceManager';
import sharedStyles from './shared.module.css';

interface VoiceAudioSettingsBottomSheetProps {
	isOpen: boolean;
	onClose: () => void;
}

export const VoiceAudioSettingsBottomSheet: React.FC<VoiceAudioSettingsBottomSheetProps> = observer(
	({isOpen, onClose}) => {
		const {t} = useLingui();
		const voiceSettings = VoiceSettingsStore;
		const voiceState = MediaEngineStore.getCurrentUserVoiceState();
		const isDeafened = voiceState?.self_deaf ?? false;
		const {inputDevices, outputDevices, permissionStatus, refreshDevices} = useMediaDevices({
			autoRefresh: isOpen,
			requestPermissions: false,
		});

		const inputHasLabels = hasDeviceLabels(inputDevices);
		const outputHasLabels = hasDeviceLabels(outputDevices);
		const effectiveInputDeviceId = resolveEffectiveDeviceId(voiceSettings.inputDeviceId, inputDevices) ?? 'default';
		const effectiveOutputDeviceId = resolveEffectiveDeviceId(voiceSettings.outputDeviceId, outputDevices) ?? 'default';

		const inputDeviceOptions: Array<MenuRadioType> =
			inputDevices.length > 0
				? inputDevices.map((device) => {
						const shortDeviceId = device.deviceId.slice(0, 8);
						return {
							label: inputHasLabels ? device.label || t`Microphone ${shortDeviceId}` : t`Microphone ${shortDeviceId}`,
							subtext: device.deviceId === 'default' ? t`System default` : undefined,
							selected: effectiveInputDeviceId === device.deviceId,
							onSelect: () => {
								VoiceSettingsActionCreators.update({inputDeviceId: device.deviceId});
							},
						};
					})
				: [
						{
							label: t`Default microphone`,
							subtext:
								permissionStatus === 'loading'
									? t`Detecting devices...`
									: t`No explicit input devices detected`,
							selected: true,
							onSelect: () => VoiceSettingsActionCreators.update({inputDeviceId: 'default'}),
							disabled: permissionStatus === 'loading',
						},
					];

		const outputDeviceOptions: Array<MenuRadioType> =
			outputDevices.length > 0
				? outputDevices.map((device) => {
						const shortDeviceId = device.deviceId.slice(0, 8);
						return {
							label: outputHasLabels ? device.label || t`Speaker ${shortDeviceId}` : t`Speaker ${shortDeviceId}`,
							subtext: device.deviceId === 'default' ? t`System default` : undefined,
							selected: effectiveOutputDeviceId === device.deviceId,
							onSelect: () => {
								VoiceSettingsActionCreators.update({outputDeviceId: device.deviceId});
							},
						};
					})
				: [
						{
							label: t`Default speaker`,
							subtext:
								permissionStatus === 'loading'
									? t`Detecting devices...`
									: t`No explicit output devices detected`,
							selected: true,
							onSelect: () => VoiceSettingsActionCreators.update({outputDeviceId: 'default'}),
							disabled: permissionStatus === 'loading',
						},
					];

		const handleToggleDeafen = () => {
			VoiceStateActionCreators.toggleSelfDeaf(null);
			onClose();
		};

		const handleOpenVoiceSettings = () => {
			onClose();
			ModalActionCreators.push(modal(() => <UserSettingsModal initialTab="voice_video" />));
		};

		const menuGroups: Array<MenuGroupType> = [];

		const deviceActions = [
			{
				icon: <ArrowsClockwiseIcon weight="bold" className={sharedStyles.icon} />,
				label: permissionStatus === 'loading' ? t`Refreshing devices...` : t`Refresh Devices`,
				onClick: () => {
					void refreshDevices({requestPermissions: true});
				},
				disabled: permissionStatus === 'loading',
			},
		];

		menuGroups.push({
			items: deviceActions,
		});

		menuGroups.push({
			items: inputDeviceOptions,
		});

		menuGroups.push({
			items: outputDeviceOptions,
		});

		const volumeItems = [
			{
				label: t`Input Volume`,
				value: voiceSettings.inputVolume,
				minValue: 0,
				maxValue: 100,
				onChange: (value: number) => {
					VoiceSettingsActionCreators.update({inputVolume: value});
				},
				onFormat: (value: number) => `${Math.round(value)}%`,
				factoryDefaultValue: 100,
			},
			{
				label: t`Output Volume`,
				value: voiceSettings.outputVolume,
				minValue: 0,
				maxValue: 100,
				onChange: (value: number) => {
					VoiceSettingsActionCreators.update({outputVolume: value});
				},
				onFormat: (value: number) => `${Math.round(value)}%`,
				factoryDefaultValue: 100,
			},
		];

		menuGroups.push({
			items: volumeItems,
		});

		const processingItems = [
			{
				icon: <SpeakerSimpleSlashIcon weight="fill" className={sharedStyles.icon} />,
				label: t`Echo Cancellation`,
				onClick: () => {
					VoiceSettingsActionCreators.update({echoCancellation: !voiceSettings.echoCancellation});
				},
			},
			{
				icon: <SpeakerSimpleSlashIcon weight="fill" className={sharedStyles.icon} />,
				label: t`Noise Suppression`,
				onClick: () => {
					VoiceSettingsActionCreators.update({noiseSuppression: !voiceSettings.noiseSuppression});
				},
			},
			{
				icon: <MicrophoneIcon weight="fill" className={sharedStyles.icon} />,
				label: t`Auto Gain Control`,
				onClick: () => {
					VoiceSettingsActionCreators.update({autoGainControl: !voiceSettings.autoGainControl});
				},
			},
		];

		menuGroups.push({
			items: processingItems,
		});

		menuGroups.push({
			items: [
				{
					icon: <SpeakerSlashIcon weight="fill" className={sharedStyles.icon} />,
					label: isDeafened ? t`Undeafen` : t`Deafen`,
					onClick: handleToggleDeafen,
				},
			],
		});

		menuGroups.push({
			items: [
				{
					icon: <GearIcon weight="fill" className={sharedStyles.icon} />,
					label: t`Voice Settings`,
					onClick: handleOpenVoiceSettings,
				},
			],
		});

		return <MenuBottomSheet isOpen={isOpen} onClose={onClose} groups={menuGroups} />;
	},
);

interface VoiceCameraSettingsBottomSheetProps {
	isOpen: boolean;
	onClose: () => void;
}

export const VoiceCameraSettingsBottomSheet: React.FC<VoiceCameraSettingsBottomSheetProps> = observer(
	({isOpen, onClose}) => {
		const {t} = useLingui();

		const handlePreviewCamera = () => {
			onClose();
			ModalActionCreators.push(modal(() => <CameraPreviewModalInRoom />));
		};

		const handleOpenVideoSettings = () => {
			onClose();
			ModalActionCreators.push(modal(() => <UserSettingsModal initialTab="voice_video" />));
		};

		const menuGroups: Array<MenuGroupType> = [];

		const cameraItems = [
			{
				icon: <VideoIcon weight="fill" className={sharedStyles.icon} />,
				label: t`Camera Device`,
				onClick: () => {
					onClose();
					ModalActionCreators.push(modal(() => <UserSettingsModal initialTab="voice_video" />));
				},
			},
		];

		menuGroups.push({
			items: cameraItems,
		});

		const cameraActions = [
			{
				icon: <VideoIcon weight="fill" className={sharedStyles.icon} />,
				label: t`Preview Camera`,
				onClick: handlePreviewCamera,
			},
		];

		menuGroups.push({
			items: cameraActions,
		});

		menuGroups.push({
			items: [
				{
					icon: <GearIcon weight="fill" className={sharedStyles.icon} />,
					label: t`Video Settings`,
					onClick: handleOpenVideoSettings,
				},
			],
		});

		return <MenuBottomSheet isOpen={isOpen} onClose={onClose} groups={menuGroups} />;
	},
);

interface VoiceMoreOptionsBottomSheetProps {
	isOpen: boolean;
	onClose: () => void;
}

export const VoiceMoreOptionsBottomSheet: React.FC<VoiceMoreOptionsBottomSheetProps> = observer(({isOpen, onClose}) => {
	const {t} = useLingui();
	const voiceSettings = VoiceSettingsStore;
	const layoutMode = VoiceCallLayoutStore.layoutMode;
	const isGrid = layoutMode === 'grid';

	const handleToggleGrid = () => {
		if (isGrid) VoiceCallLayoutActionCreators.setLayoutMode('focus');
		else VoiceCallLayoutActionCreators.setLayoutMode('grid');
	};

	const menuGroups: Array<MenuGroupType> = [];

	const displayItems = [
		{
			icon: <GridFourIcon weight="fill" className={sharedStyles.icon} />,
			label: t`Grid View`,
			onClick: () => {
				handleToggleGrid();
				onClose();
			},
		},
		{
			icon: <UsersIcon weight="fill" className={sharedStyles.icon} />,
			label: t`Show My Own Camera`,
			onClick: () => {
				VoiceSettingsActionCreators.update({showMyOwnCamera: !voiceSettings.showMyOwnCamera});
			},
		},
		{
			icon: <UsersIcon weight="fill" className={sharedStyles.icon} />,
			label: t`Show Non-Video Participants`,
			onClick: () => {
				VoiceSettingsActionCreators.update({showNonVideoParticipants: !voiceSettings.showNonVideoParticipants});
			},
		},
	];

	menuGroups.push({
		items: displayItems,
	});

	menuGroups.push({
		items: [
			{
				icon: <GearIcon weight="fill" className={sharedStyles.icon} />,
				label: t`Voice & Video Settings`,
				onClick: () => {
					onClose();
					ModalActionCreators.push(modal(() => <UserSettingsModal initialTab="voice_video" />));
				},
			},
		],
	});

	return <MenuBottomSheet isOpen={isOpen} onClose={onClose} groups={menuGroups} />;
});
