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
	MicrophoneIcon,
	MicrophoneSlashIcon,
	PhoneXIcon,
	SpeakerHighIcon,
	SpeakerSlashIcon,
} from '@phosphor-icons/react';
import {clsx} from 'clsx';
import {observer} from 'mobx-react-lite';
import {useMemo} from 'react';
import * as LayoutActionCreators from '~/actions/LayoutActionCreators';
import * as ModalActionCreators from '~/actions/ModalActionCreators';
import {modal} from '~/actions/ModalActionCreators';
import * as VoiceSettingsActionCreators from '~/actions/VoiceSettingsActionCreators';
import * as VoiceStateActionCreators from '~/actions/VoiceStateActionCreators';
import {Permissions} from '~/Constants';
import {UserSettingsModal} from '~/components/modals/UserSettingsModal';
import {BottomSheet} from '~/components/uikit/BottomSheet/BottomSheet';
import {Button} from '~/components/uikit/Button/Button';
import {useMediaDevices} from '~/hooks/useMediaDevices';
import {Routes} from '~/Routes';
import type {ChannelRecord} from '~/records/ChannelRecord';
import type {GuildRecord} from '~/records/GuildRecord';
import LocalVoiceStateStore from '~/stores/LocalVoiceStateStore';
import MobileLayoutStore from '~/stores/MobileLayoutStore';
import PermissionStore from '~/stores/PermissionStore';
import VoiceSettingsStore from '~/stores/VoiceSettingsStore';
import MediaEngineStore from '~/stores/voice/MediaEngineFacade';
import {navigateToWithMobileHistory} from '~/utils/MobileNavigation';
import {hasDeviceLabels, resolveEffectiveDeviceId} from '~/utils/VoiceDeviceManager';
import {isBroadcastVoiceChannel} from '~/utils/channelVoiceMode';
import styles from './VoiceLobbyBottomSheet.module.css';

interface VoiceLobbyBottomSheetProps {
	isOpen: boolean;
	onClose: () => void;
	channel: ChannelRecord;
	guild: GuildRecord;
}

export const VoiceLobbyBottomSheet = observer(function VoiceLobbyBottomSheet({
	isOpen,
	onClose,
	channel,
	guild,
}: VoiceLobbyBottomSheetProps) {
	const {t} = useLingui();
	const connectedGuildId = MediaEngineStore.guildId;
	const connectedChannelId = MediaEngineStore.channelId;
	const voiceState = MediaEngineStore.getCurrentUserVoiceState(connectedGuildId);
	const isConnectingGlobal = MediaEngineStore.connecting;
	const isConnectedGlobal = MediaEngineStore.connected;
	const localSelfMute = LocalVoiceStateStore.selfMute;
	const localSelfDeaf = LocalVoiceStateStore.selfDeaf;
	const currentLatency = MediaEngineStore.currentLatency;
	const voiceStats = MediaEngineStore.voiceStats;
	const voiceServerEndpoint = MediaEngineStore.voiceServerEndpoint;
	const connectionId = MediaEngineStore.connectionId;
	const voiceSettings = VoiceSettingsStore;
	const {inputDevices, outputDevices, permissionStatus, refreshDevices} = useMediaDevices({
		autoRefresh: isOpen,
		requestPermissions: false,
	});

	const isInThisChannel = connectedGuildId === guild.id && connectedChannelId === channel.id;
	const isConnected = isInThisChannel && isConnectedGlobal;
	const isConnecting = isInThisChannel && isConnectingGlobal && !isConnectedGlobal;
	const isMuted = voiceState ? voiceState.self_mute : localSelfMute;
	const isDeafened = voiceState ? voiceState.self_deaf : localSelfDeaf;
	const canSpeakInChannel = PermissionStore.can(Permissions.SPEAK, channel);
	const isBroadcastMode = isBroadcastVoiceChannel(channel) || MediaEngineStore.isVoiceChannelStageLike(channel.id);
	const isSuppressedListener = isBroadcastMode && MediaEngineStore.isCurrentUserInBroadcastListenerMode();
	const isStageListenerLocked = isBroadcastMode && (isSuppressedListener || !canSpeakInChannel);
	const inputHasLabels = hasDeviceLabels(inputDevices);
	const outputHasLabels = hasDeviceLabels(outputDevices);
	const effectiveInputDeviceId = resolveEffectiveDeviceId(voiceSettings.inputDeviceId, inputDevices) ?? 'default';
	const effectiveOutputDeviceId = resolveEffectiveDeviceId(voiceSettings.outputDeviceId, outputDevices) ?? 'default';

	const handleToggleMute = () => {
		void VoiceStateActionCreators.toggleSelfMute(null);
	};

	const handleToggleDeafen = () => {
		void VoiceStateActionCreators.toggleSelfDeaf(null);
	};

	const handleOpenVoiceSettings = () => {
		onClose();
		ModalActionCreators.push(modal(() => <UserSettingsModal initialTab="voice_video" />));
	};

	const handleEnterCall = () => {
		onClose();
		const isMobile = MobileLayoutStore.isMobileLayout();
		const targetRoute = Routes.guildChannel(guild.id, channel.id);
		if (window.location.pathname !== targetRoute) {
			navigateToWithMobileHistory(targetRoute, isMobile);
		}
		if (isMobile) {
			LayoutActionCreators.updateMobileLayoutState(false, true);
		}
	};

	const handleDisconnect = () => {
		onClose();
		void MediaEngineStore.disconnectFromVoiceChannel('user');
	};

	const handleConnect = () => {
		void MediaEngineStore.connectToVoiceChannel(guild.id, channel.id);
	};

	const prettyEndpoint = (() => {
		if (!voiceServerEndpoint) return null;
		try {
			const url = new URL(voiceServerEndpoint);
			return url.port ? `${url.hostname}:${url.port}` : url.hostname;
		} catch {
			return voiceServerEndpoint;
		}
	})();

	const connectionBadgeLabel = isConnected ? t`Connected` : isConnecting ? t`Connecting...` : t`Ready to join`;

	const deviceHint = useMemo(() => {
		if (permissionStatus === 'loading') return t`Detecting audio devices...`;
		if (permissionStatus === 'denied') return t`Microphone permission denied. Allow access and refresh devices.`;
		return t`Choose your microphone and speaker before joining`;
	}, [permissionStatus, t]);

	return (
		<BottomSheet isOpen={isOpen} onClose={onClose} title={channel.name} initialSnap={null}>
			<div className={styles.container}>
				<div className={styles.heroCard}>
					<div className={styles.heroTopRow}>
						<div className={styles.heroTitleWrap}>
							<div className={styles.heroTitle}>{channel.name}</div>
							<div className={styles.heroSubtitle}>{guild.name}</div>
						</div>
						<div
							className={clsx(
								styles.connectionBadge,
								isConnected && styles.connectionBadgeConnected,
								isConnecting && styles.connectionBadgeConnecting,
							)}
						>
							{connectionBadgeLabel}
						</div>
					</div>
					<div className={styles.heroHint}>{deviceHint}</div>
				</div>

				<div className={styles.buttonRow}>
					{isConnected ? (
						<>
							<Button variant="primary" onClick={handleEnterCall} className={styles.fullWidth}>
								{t`Open Call View`}
							</Button>
							<Button
								variant="danger-primary"
								onClick={handleDisconnect}
								leftIcon={<PhoneXIcon weight="fill" size={18} />}
								className={styles.fullWidth}
							>
								{t`Disconnect`}
							</Button>
						</>
					) : (
						<Button variant="primary" onClick={handleConnect} className={styles.fullWidth} disabled={isConnecting}>
							{isConnecting ? t`Connecting...` : t`Connect to Voice`}
						</Button>
					)}
				</div>

				<div className={styles.actionButtons}>
					<button type="button" className={styles.actionButton} onClick={handleToggleMute} disabled={isStageListenerLocked}>
						<div
							className={clsx(styles.iconContainer, isMuted ? styles.iconContainerDanger : styles.iconContainerBrand)}
						>
							{isMuted ? (
								<MicrophoneSlashIcon weight="fill" className={styles.actionIcon} size={24} />
							) : (
								<MicrophoneIcon weight="fill" className={styles.actionIcon} size={24} />
							)}
						</div>
						<span className={styles.actionText}>{isStageListenerLocked ? t`Join stage to speak` : isMuted ? t`Unmute` : t`Mute`}</span>
					</button>

					<button type="button" className={styles.actionButton} onClick={handleToggleDeafen}>
						<div
							className={clsx(
								styles.iconContainer,
								isDeafened ? styles.iconContainerDanger : styles.iconContainerTertiary,
							)}
						>
							{isDeafened ? (
								<SpeakerSlashIcon weight="fill" className={styles.actionIconSecondary} size={24} />
							) : (
								<SpeakerHighIcon weight="fill" className={styles.actionIconSecondary} size={24} />
							)}
						</div>
						<span className={styles.actionText}>{isDeafened ? t`Undeafen` : t`Deafen`}</span>
					</button>

					<button type="button" className={styles.actionButton} onClick={handleOpenVoiceSettings}>
						<div className={clsx(styles.iconContainer, styles.iconContainerTertiary)}>
							<GearIcon weight="fill" className={styles.actionIconSecondary} size={24} />
						</div>
						<span className={styles.actionText}>{t`Settings`}</span>
					</button>
				</div>

				<div className={styles.devicesSection}>
					<div className={styles.devicesHeader}>
						<div className={styles.devicesHeaderText}>
							<div className={styles.devicesTitle}>{t`Input Device`}</div>
							<div className={styles.devicesDescription}>{t`Microphone`}</div>
						</div>
						<button
							type="button"
							className={styles.refreshButton}
							onClick={() => {
								void refreshDevices({requestPermissions: true});
							}}
							disabled={permissionStatus === 'loading'}
						>
							<ArrowsClockwiseIcon weight="bold" size={14} />
							<span>{permissionStatus === 'loading' ? t`Refreshing...` : t`Refresh`}</span>
						</button>
					</div>
					<div className={styles.deviceList}>
						{inputDevices.length > 0 ? (
							inputDevices.map((device) => {
								const shortDeviceId = device.deviceId.slice(0, 8);
								const label = inputHasLabels
									? device.label || t`Microphone ${shortDeviceId}`
									: t`Microphone ${shortDeviceId}`;
								const selected = effectiveInputDeviceId === device.deviceId;
								return (
									<button
										key={device.deviceId}
										type="button"
										className={clsx(styles.deviceButton, selected && styles.deviceButtonSelected)}
										onClick={() => VoiceSettingsActionCreators.update({inputDeviceId: device.deviceId})}
									>
										<span className={styles.deviceButtonLabel}>{label}</span>
										{device.deviceId === 'default' && <span className={styles.deviceButtonMeta}>{t`System default`}</span>}
									</button>
								);
							})
						) : (
							<div className={styles.deviceEmpty}>{t`No input devices detected`}</div>
						)}
					</div>
				</div>

				<div className={styles.devicesSection}>
					<div className={styles.devicesHeader}>
						<div className={styles.devicesHeaderText}>
							<div className={styles.devicesTitle}>{t`Output Device`}</div>
							<div className={styles.devicesDescription}>{t`Speaker / Headphones`}</div>
						</div>
					</div>
					<div className={styles.deviceList}>
						{outputDevices.length > 0 ? (
							outputDevices.map((device) => {
								const shortDeviceId = device.deviceId.slice(0, 8);
								const label = outputHasLabels ? device.label || t`Speaker ${shortDeviceId}` : t`Speaker ${shortDeviceId}`;
								const selected = effectiveOutputDeviceId === device.deviceId;
								return (
									<button
										key={device.deviceId}
										type="button"
										className={clsx(styles.deviceButton, selected && styles.deviceButtonSelected)}
										onClick={() => VoiceSettingsActionCreators.update({outputDeviceId: device.deviceId})}
									>
										<span className={styles.deviceButtonLabel}>{label}</span>
										{device.deviceId === 'default' && <span className={styles.deviceButtonMeta}>{t`System default`}</span>}
									</button>
								);
							})
						) : (
							<div className={styles.deviceEmpty}>{t`No output devices detected`}</div>
						)}
					</div>
				</div>

				{isConnected && (
					<div className={styles.connectionInfo}>
						<div className={styles.connectionHeader}>
							<div className={styles.connectionStatusInfo}>
								<div className={styles.connectionTitle}>{t`Connected to Voice`}</div>
								<div className={styles.connectionSubtitle}>{t`You're in the voice channel`}</div>
							</div>
							<div className={styles.connectionStatusDot} />
						</div>

						<div className={styles.statsGrid}>
							{currentLatency !== null && <div className={styles.statItem}>{t`Ping: ${currentLatency}ms`}</div>}

							{prettyEndpoint && (
								<div className={styles.statItem}>
									<span className={styles.statItemLabel}>{t`Endpoint:`}</span>{' '}
									<span className={styles.endpointValue}>{prettyEndpoint}</span>
								</div>
							)}

							{connectionId && (
								<div className={styles.statItem}>
									<span className={styles.statItemLabel}>{t`Connection:`}</span>{' '}
									<span className={styles.connectionIdValue}>{connectionId}</span>
								</div>
							)}

							{typeof voiceStats?.audioPacketLoss === 'number' && voiceStats.audioPacketLoss > 0 && (
								<div className={styles.statItem}>{t`Packet loss: ${voiceStats.audioPacketLoss.toFixed(1)}%`}</div>
							)}

							{typeof voiceStats?.jitter === 'number' && voiceStats.jitter > 0 && (
								<div className={styles.statItem}>{t`Jitter: ${voiceStats.jitter.toFixed(1)}ms`}</div>
							)}
						</div>
					</div>
				)}
			</div>
		</BottomSheet>
	);
});
