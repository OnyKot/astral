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
import {useLocalParticipant} from '@livekit/components-react';
import {
	CameraIcon,
	CameraSlashIcon,
	CaretDownIcon,
	DotsThreeIcon,
	MicrophoneIcon,
	MicrophoneSlashIcon,
	MonitorIcon,
	PauseIcon,
	PhoneXIcon,
	PlayIcon,
	SpeakerHighIcon,
	SpeakerSlashIcon,
} from '@phosphor-icons/react';
import {clsx} from 'clsx';
import {observer} from 'mobx-react-lite';
import type React from 'react';
import {useCallback, useEffect, useRef, useState} from 'react';
import * as ContextMenuActionCreators from '~/actions/ContextMenuActionCreators';
import * as ModalActionCreators from '~/actions/ModalActionCreators';
import {modal} from '~/actions/ModalActionCreators';
import * as PremiumModalActionCreators from '~/actions/PremiumModalActionCreators';
import * as VoiceSettingsActionCreators from '~/actions/VoiceSettingsActionCreators';
import * as VoiceStateActionCreators from '~/actions/VoiceStateActionCreators';
import {
	VoiceAudioSettingsBottomSheet,
	VoiceCameraSettingsBottomSheet,
	VoiceMoreOptionsBottomSheet,
} from '~/components/bottomsheets/VoiceSettingsBottomSheets';
import {CameraPreviewModalInRoom} from '~/components/modals/CameraPreviewModal';
import {ScreenShareSettingsModal} from '~/components/modals/ScreenShareSettingsModal';
import {MenuGroup} from '~/components/uikit/ContextMenu/MenuGroup';
import {MenuItemCheckbox} from '~/components/uikit/ContextMenu/MenuItemCheckbox';
import {MenuItemRadio} from '~/components/uikit/ContextMenu/MenuItemRadio';
import FocusRing from '~/components/uikit/FocusRing/FocusRing';
import {TooltipWithKeybind} from '~/components/uikit/KeybindHint/KeybindHint';
import {Tooltip} from '~/components/uikit/Tooltip/Tooltip';
import {useAudioSettingsMenu} from '~/hooks/useAudioSettingsMenu';
import {useMediaDevices} from '~/hooks/useMediaDevices';
import KeybindStore from '~/stores/KeybindStore';
import LocalVoiceStateStore from '~/stores/LocalVoiceStateStore';
import LocalScreenSharePreviewStore from '~/stores/LocalScreenSharePreviewStore';
import MobileLayoutStore from '~/stores/MobileLayoutStore';
import VoiceSettingsStore from '~/stores/VoiceSettingsStore';
import MediaEngineStore from '~/stores/voice/MediaEngineFacade';
import {hapticSelection, hapticWarning} from '~/utils/haptics';
import {formatKeyCombo} from '~/utils/KeybindUtils';
import {FRAMERATE_OPTIONS, RESOLUTION_OPTIONS} from '~/utils/modals/ScreenShareSettingsModalUtils';
import {executeScreenShareOperation} from '~/utils/ScreenShareUtils';
import {
	getCameraCaptureResolution,
	getCameraPublishOptions,
	getScreenShareQualityOptions,
	type ScreenShareStreamResolution,
} from '~/utils/voice/StreamQualityUtils';
import styles from './VoiceControlBar.module.css';
import {VoiceCameraSettingsMenu, VoiceMoreOptionsMenu} from './VoiceSettingsMenus';

const VoiceControlBarInner = observer(function VoiceControlBarInner() {
	const {t} = useLingui();
	const {localParticipant, isCameraEnabled, isMicrophoneEnabled, isScreenShareEnabled} = useLocalParticipant();

	const voiceState = MediaEngineStore.getCurrentUserVoiceState();
	const localSelfMute = LocalVoiceStateStore.selfMute;
	const localSelfDeaf = LocalVoiceStateStore.selfDeaf;

	const voiceSettings = VoiceSettingsStore;
	const isMobile = MobileLayoutStore.isMobileLayout();

	const {inputDevices, outputDevices, videoDevices} = useMediaDevices();
	const currentCallId = MediaEngineStore.connectionId ?? '';
	const localParticipantIdentity = localParticipant?.identity ?? '';
	const hasPremium = voiceSettings.getHasPremium();
	const screenShareResolution = voiceSettings.screenshareResolution;
	const screenShareFrameRate = voiceSettings.videoFrameRate;
	const isLocalScreenSharePreviewPaused =
		Boolean(currentCallId) &&
		Boolean(localParticipantIdentity) &&
		LocalScreenSharePreviewStore.isPreviewPaused(currentCallId);

	const [audioSettingsOpen, setAudioSettingsOpen] = useState(false);
	const [cameraSettingsOpen, setCameraSettingsOpen] = useState(false);
	const [moreOptionsOpen, setMoreOptionsOpen] = useState(false);

	const isMuted = localSelfMute;
	const isDeafened = localSelfDeaf;
	const isGuildMuted = voiceState?.mute ?? false;
	const isGuildDeafened = voiceState?.deaf ?? false;

	const muteReason = MediaEngineStore.getMuteReason(voiceState);
	const effectiveMuted = muteReason !== null || isMuted;

	const isPushToTalkEffective = KeybindStore.isPushToTalkEffective();
	const pushToTalkCombo = KeybindStore.getByAction('push_to_talk').combo;
	const pushToTalkHint = isPushToTalkEffective ? formatKeyCombo(pushToTalkCombo) : '';

	const {renderAudioSettingsMenu, handleAudioSettingsContextMenu} = useAudioSettingsMenu({
		inputDevices,
		outputDevices,
		isMobile,
		onOpenMobile: () => setAudioSettingsOpen(true),
	});

	const micDeviceSyncQueueRef = useRef<Promise<void>>(Promise.resolve());
	const cameraDeviceSyncQueueRef = useRef<Promise<void>>(Promise.resolve());

	useEffect(() => {
		if (!localParticipant || !isMicrophoneEnabled) return;

		const requestedInputDeviceId = voiceSettings.inputDeviceId || 'default';
		const hasRequestedInputDevice =
			requestedInputDeviceId === 'default' || inputDevices.some((device) => device.deviceId === requestedInputDeviceId);
		const nextInputDeviceId = hasRequestedInputDevice ? requestedInputDeviceId : 'default';

		if (!hasRequestedInputDevice && requestedInputDeviceId !== 'default') {
			VoiceSettingsActionCreators.update({inputDeviceId: 'default'});
		}

		micDeviceSyncQueueRef.current = micDeviceSyncQueueRef.current
			.then(async () => {
				await localParticipant.setMicrophoneEnabled(true, {
					deviceId: nextInputDeviceId,
					echoCancellation: voiceSettings.echoCancellation,
					noiseSuppression: voiceSettings.noiseSuppression,
					autoGainControl: voiceSettings.autoGainControl,
				});
			})
			.catch((error) => {
				console.error('Failed to sync microphone device/settings:', error);
			});
	}, [
		inputDevices,
		isMicrophoneEnabled,
		localParticipant,
		voiceSettings.inputDeviceId,
		voiceSettings.echoCancellation,
		voiceSettings.noiseSuppression,
		voiceSettings.autoGainControl,
	]);

	useEffect(() => {
		if (!localParticipant || !isCameraEnabled) return;

		const requestedVideoDeviceId = voiceSettings.videoDeviceId || 'default';
		const hasRequestedVideoDevice =
			requestedVideoDeviceId === 'default' || videoDevices.some((device) => device.deviceId === requestedVideoDeviceId);
		const nextVideoDeviceId = hasRequestedVideoDevice ? requestedVideoDeviceId : 'default';

		if (!hasRequestedVideoDevice && requestedVideoDeviceId !== 'default') {
			VoiceSettingsActionCreators.update({videoDeviceId: 'default'});
		}

		cameraDeviceSyncQueueRef.current = cameraDeviceSyncQueueRef.current
			.then(async () => {
				const cameraResolution = voiceSettings.cameraResolution;
				await localParticipant.setCameraEnabled(true, {
					deviceId: nextVideoDeviceId,
					resolution: getCameraCaptureResolution(cameraResolution, voiceSettings.videoFrameRate),
				}, getCameraPublishOptions(cameraResolution));
			})
			.catch((error) => {
				console.error('Failed to sync camera device:', error);
			});
	}, [
		isCameraEnabled,
		localParticipant,
		videoDevices,
		voiceSettings.cameraResolution,
		voiceSettings.videoDeviceId,
		voiceSettings.videoFrameRate,
	]);

	const handleToggleMute = useCallback(() => {
		hapticSelection();
		VoiceStateActionCreators.toggleSelfMute(null);
	}, []);

	const handleToggleDeafen = useCallback(() => {
		hapticSelection();
		VoiceStateActionCreators.toggleSelfDeaf(null);
	}, []);

	const handleToggleVideo = useCallback(async () => {
		if (!localParticipant) return;

		try {
			if (isCameraEnabled) {
				await MediaEngineStore.setCameraEnabled(false);
			} else {
				ModalActionCreators.push(
					modal(() => (
						<CameraPreviewModalInRoom
							onEnabled={async () => {
								await MediaEngineStore.setCameraEnabled(true, {
									deviceId: VoiceSettingsStore.getVideoDeviceId() || undefined,
								});
							}}
						/>
					)),
				);
			}
		} catch (error) {
			console.error('Failed to toggle camera:', error);
		}
	}, [localParticipant, isCameraEnabled]);

	const getScreenShareOptions = useCallback(
		(resolution: ScreenShareStreamResolution, frameRate: number) =>
			getScreenShareQualityOptions(resolution, frameRate),
		[],
	);

	const applyScreenShareQuality = useCallback(
		async (resolution: ScreenShareStreamResolution, frameRate: number) => {
			VoiceSettingsActionCreators.update({
				screenshareResolution: resolution,
				videoFrameRate: frameRate,
			});

			if (!isScreenShareEnabled || !localParticipant) return;

			const includeAudio = LocalVoiceStateStore.getSelfStreamAudio();
			await executeScreenShareOperation(async () => {
				const {captureOptions, publishOptions} = getScreenShareOptions(resolution, frameRate);
				await MediaEngineStore.setScreenShareEnabled(false);
				await MediaEngineStore.setScreenShareEnabled(
					true,
					{
						...captureOptions,
						audio: includeAudio,
					},
					publishOptions,
				);
			});
		},
		[getScreenShareOptions, isScreenShareEnabled, localParticipant],
	);

	const handleScreenShareResolutionSelect = useCallback(
		(resolution: ScreenShareStreamResolution, isPremiumResolution: boolean) => {
			if (isPremiumResolution && !hasPremium) {
				PremiumModalActionCreators.open();
				return;
			}

			void applyScreenShareQuality(resolution, screenShareFrameRate);
		},
		[applyScreenShareQuality, hasPremium, screenShareFrameRate],
	);

	const handleScreenShareFrameRateSelect = useCallback(
		(frameRate: number, isPremiumFrameRate: boolean) => {
			if (isPremiumFrameRate && !hasPremium) {
				PremiumModalActionCreators.open();
				return;
			}

			void applyScreenShareQuality(screenShareResolution, frameRate);
		},
		[applyScreenShareQuality, hasPremium, screenShareResolution],
	);

	const handleScreenSharePreviewToggle = useCallback(
		(paused: boolean) => {
			if (!currentCallId) return;
			LocalScreenSharePreviewStore.setPreviewPaused(currentCallId, paused);
		},
		[currentCallId],
	);

	const renderScreenShareSettingsMenu = useCallback(
		(_menuContext: {onClose: () => void}) => (
			<>
				{isScreenShareEnabled && (
					<MenuGroup>
						<MenuItemCheckbox
							icon={
								isLocalScreenSharePreviewPaused ? (
									<PlayIcon weight="fill" className={styles.iconSmall} />
								) : (
									<PauseIcon weight="fill" className={styles.iconSmall} />
								)
							}
							checked={isLocalScreenSharePreviewPaused}
							onChange={handleScreenSharePreviewToggle}
						>
							{isLocalScreenSharePreviewPaused ? t`Preview Paused (Local)` : t`Pause Preview (Local)`}
						</MenuItemCheckbox>
					</MenuGroup>
				)}

				<MenuGroup>
					{RESOLUTION_OPTIONS.map((option) => {
						const isLocked = option.isPremium && !hasPremium;
						return (
							<MenuItemRadio
								key={option.value}
								selected={screenShareResolution === option.value}
								onSelect={() => {
									handleScreenShareResolutionSelect(option.value, option.isPremium);
								}}
								closeOnSelect={false}
							>
								{isLocked ? `${t(option.label)} - ${t`Plutonium`}` : t(option.label)}
							</MenuItemRadio>
						);
					})}
				</MenuGroup>

				<MenuGroup>
					{FRAMERATE_OPTIONS.map((option) => {
						const isLocked = option.isPremium && !hasPremium;
						return (
							<MenuItemRadio
								key={option.value}
								selected={screenShareFrameRate === option.value}
								onSelect={() => {
									handleScreenShareFrameRateSelect(option.value, option.isPremium);
								}}
								closeOnSelect={false}
							>
								{isLocked ? `${t(option.label)} - ${t`Plutonium`}` : t(option.label)}
							</MenuItemRadio>
						);
					})}
				</MenuGroup>

			</>
		),
		[
			handleScreenShareFrameRateSelect,
			handleScreenSharePreviewToggle,
			handleScreenShareResolutionSelect,
			hasPremium,
			isLocalScreenSharePreviewPaused,
			isScreenShareEnabled,
			screenShareFrameRate,
			screenShareResolution,
			t,
		],
	);

	const handleScreenShare = useCallback(async () => {
		if (!localParticipant) return;

		try {
			if (isScreenShareEnabled) {
				await MediaEngineStore.setScreenShareEnabled(false);
			} else {
				ModalActionCreators.push(
					modal(() => (
						<ScreenShareSettingsModal
							onStartShare={async (resolution, frameRate, includeAudio) => {
								await executeScreenShareOperation(async () => {
									const {captureOptions, publishOptions} = getScreenShareOptions(resolution, frameRate);
									await MediaEngineStore.setScreenShareEnabled(
										true,
										{
											...captureOptions,
											audio: includeAudio,
										},
										publishOptions,
									);
								});
							}}
						/>
					)),
				);
			}
		} catch (error) {
			console.error('Failed to toggle screen share:', error);
		}
	}, [localParticipant, isScreenShareEnabled, getScreenShareOptions]);

	const handleScreenShareSettingsClick = useCallback(
		(event: React.MouseEvent<HTMLButtonElement>) => {
			if (isMobile) {
				ModalActionCreators.push(
					modal(() => (
						<ScreenShareSettingsModal
							onStartShare={async (resolution, frameRate, includeAudio) => {
								await executeScreenShareOperation(async () => {
									const {captureOptions, publishOptions} = getScreenShareOptions(resolution, frameRate);
									await MediaEngineStore.setScreenShareEnabled(
										true,
										{
											...captureOptions,
											audio: includeAudio,
										},
										publishOptions,
									);
								});
							}}
						/>
					)),
				);
				return;
			}

			ContextMenuActionCreators.openFromEvent(event, renderScreenShareSettingsMenu);
		},
		[getScreenShareOptions, isMobile, renderScreenShareSettingsMenu],
	);

	const handleDisconnect = useCallback(async () => {
		hapticWarning();
		await MediaEngineStore.disconnectFromVoiceChannel('user');
	}, []);

	const handleAudioSettingsClick = useCallback(
		(event: React.MouseEvent<HTMLButtonElement>) => {
			if (isMobile) {
				setAudioSettingsOpen(true);
			} else {
				ContextMenuActionCreators.openFromEvent(event, renderAudioSettingsMenu);
			}
		},
		[isMobile, renderAudioSettingsMenu],
	);

	const handleCameraSettingsClick = useCallback(
		(event: React.MouseEvent<HTMLButtonElement>) => {
			if (isMobile) {
				setCameraSettingsOpen(true);
			} else {
				ContextMenuActionCreators.openFromEvent(event, ({onClose}) => (
					<VoiceCameraSettingsMenu videoDevices={videoDevices} onClose={onClose} />
				));
			}
		},
		[videoDevices, isMobile],
	);

	const handleMoreOptionsClick = useCallback(
		(event: React.MouseEvent<HTMLButtonElement>) => {
			if (isMobile) {
				setMoreOptionsOpen(true);
			} else {
				ContextMenuActionCreators.openFromEvent(event, ({onClose}) => <VoiceMoreOptionsMenu onClose={onClose} />);
			}
		},
		[isMobile],
	);

	const getMuteTooltipLabel = useCallback(() => {
		if (isGuildMuted) return t`Community Muted`;

		switch (muteReason) {
			case 'push_to_talk':
				return t`Push-to-talk enabled - hold ${pushToTalkHint} to speak`;
			default:
				return effectiveMuted ? t`Unmute` : t`Mute`;
		}
	}, [effectiveMuted, isGuildMuted, muteReason, pushToTalkHint, t]);

	const getDeafenTooltipLabel = useCallback(() => {
		if (isGuildDeafened) return t`Community Deafened`;

		switch (isDeafened) {
			case true:
				return t`Undeafen`;
			default:
				return t`Deafen`;
		}
	}, [isDeafened, isGuildDeafened, t]);

	return (
		<div className={styles.container}>
			<div className={styles.buttonContainer}>
				<Tooltip
					text={() => (
						<TooltipWithKeybind label={getMuteTooltipLabel()} action={isGuildMuted ? undefined : 'toggle_mute'} />
					)}
				>
					<FocusRing offset={-2}>
						<div>
							<button
								type="button"
								className={clsx(
									styles.button,
									effectiveMuted || isGuildMuted ? styles.buttonMuted : styles.buttonUnmuted,
									isGuildMuted && 'disabled',
								)}
								onClick={isGuildMuted ? undefined : handleToggleMute}
								onContextMenu={handleAudioSettingsContextMenu}
								disabled={isGuildMuted}
							>
								{effectiveMuted || isGuildMuted ? (
									<MicrophoneSlashIcon weight="fill" className={styles.icon} />
								) : (
									<MicrophoneIcon weight="fill" className={styles.icon} />
								)}
							</button>
						</div>
					</FocusRing>
				</Tooltip>

				<Tooltip text={t`Audio Settings`}>
					<FocusRing offset={-2}>
						<button type="button" className={styles.settingsButton} onClick={handleAudioSettingsClick}>
							<CaretDownIcon weight="bold" className={styles.iconSmall} />
						</button>
					</FocusRing>
				</Tooltip>
			</div>

			<div className={styles.buttonContainer}>
				<Tooltip
					text={() => (
						<TooltipWithKeybind label={getDeafenTooltipLabel()} action={isGuildDeafened ? undefined : 'toggle_deafen'} />
					)}
				>
					<FocusRing offset={-2}>
						<div>
							<button
								type="button"
								className={clsx(
									styles.button,
									isDeafened || isGuildDeafened ? styles.buttonDeafened : styles.buttonUndeafened,
									isGuildDeafened && 'disabled',
								)}
								onClick={isGuildDeafened ? undefined : handleToggleDeafen}
								onContextMenu={handleAudioSettingsContextMenu}
								disabled={isGuildDeafened}
							>
								{isDeafened || isGuildDeafened ? (
									<SpeakerSlashIcon weight="fill" className={styles.icon} />
								) : (
									<SpeakerHighIcon weight="fill" className={styles.icon} />
								)}
							</button>
						</div>
					</FocusRing>
				</Tooltip>

				<Tooltip text={t`Audio Settings`}>
					<FocusRing offset={-2}>
						<button type="button" className={styles.settingsButton} onClick={handleAudioSettingsClick}>
							<CaretDownIcon weight="bold" className={styles.iconSmall} />
						</button>
					</FocusRing>
				</Tooltip>
			</div>

			<div className={styles.buttonContainer}>
				<Tooltip text={isCameraEnabled ? t`Turn Off Camera` : t`Turn On Camera`}>
					<FocusRing offset={-2}>
						<button
							type="button"
							className={clsx(styles.button, isCameraEnabled ? styles.buttonCameraOn : styles.buttonCameraOff)}
							onClick={handleToggleVideo}
						>
							{isCameraEnabled ? (
								<CameraIcon weight="fill" className={styles.icon} />
							) : (
								<CameraSlashIcon weight="fill" className={styles.icon} />
							)}
						</button>
					</FocusRing>
				</Tooltip>

				<Tooltip text={t`Camera Settings`}>
					<FocusRing offset={-2}>
						<button type="button" className={styles.settingsButton} onClick={handleCameraSettingsClick}>
							<CaretDownIcon weight="bold" className={styles.iconSmall} />
						</button>
					</FocusRing>
				</Tooltip>
			</div>

			<div className={styles.buttonContainer}>
				<Tooltip text={isScreenShareEnabled ? t`Stop Sharing` : t`Share Your Screen`}>
					<FocusRing offset={-2}>
						<button
							type="button"
							className={clsx(
								styles.button,
								isScreenShareEnabled ? styles.buttonScreenShareOn : styles.buttonScreenShareOff,
							)}
							onClick={handleScreenShare}
							onContextMenu={(event) => {
								if (isMobile) return;
								event.preventDefault();
								ContextMenuActionCreators.openFromEvent(event, renderScreenShareSettingsMenu);
							}}
						>
							<MonitorIcon weight="fill" className={styles.icon} />
						</button>
					</FocusRing>
				</Tooltip>

				<Tooltip text={t`Screen Share Settings`}>
					<FocusRing offset={-2}>
						<button type="button" className={styles.settingsButton} onClick={handleScreenShareSettingsClick}>
							<CaretDownIcon weight="bold" className={styles.iconSmall} />
						</button>
					</FocusRing>
				</Tooltip>
			</div>

			<Tooltip text={t`More Options`}>
				<FocusRing offset={-2}>
					<button
						type="button"
						className={clsx(styles.button, styles.buttonMoreOptions)}
						onClick={handleMoreOptionsClick}
					>
						<DotsThreeIcon weight="bold" className={styles.icon} />
					</button>
				</FocusRing>
			</Tooltip>

			<Tooltip text={t`Disconnect`}>
				<FocusRing offset={-2}>
					<button type="button" className={clsx(styles.button, styles.buttonDisconnect)} onClick={handleDisconnect}>
						<PhoneXIcon weight="fill" className={styles.icon} />
					</button>
				</FocusRing>
			</Tooltip>

			{isMobile && (
				<>
					<VoiceAudioSettingsBottomSheet isOpen={audioSettingsOpen} onClose={() => setAudioSettingsOpen(false)} />
					<VoiceCameraSettingsBottomSheet isOpen={cameraSettingsOpen} onClose={() => setCameraSettingsOpen(false)} />
					<VoiceMoreOptionsBottomSheet isOpen={moreOptionsOpen} onClose={() => setMoreOptionsOpen(false)} />
				</>
			)}
		</div>
	);
});

export const VoiceControlBar = observer(() => {
	const room = MediaEngineStore.room;
	if (!room) return null;
return <VoiceControlBarInner />;
});
