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

import {t} from '@lingui/core/macro';
import {useLingui} from '@lingui/react/macro';
import {
	BuildingsIcon,
	CameraIcon,
	CameraSlashIcon,
	CaretDownIcon,
	CaretUpIcon,
	DesktopIcon,
	DeviceMobileIcon,
	MicrophoneIcon,
	MicrophoneSlashIcon,
	LockSimpleIcon,
	MonitorIcon,
	PhoneXIcon,
	SpeakerHighIcon,
	SpeakerSlashIcon,
	SlidersHorizontalIcon,
	WaveformIcon,
	XIcon,
} from '@phosphor-icons/react';
import {clsx} from 'clsx';
import {AnimatePresence, motion, useReducedMotion} from 'framer-motion';
import {observer} from 'mobx-react-lite';
import {useCallback, useEffect, useId, useMemo, useRef, useState} from 'react';
import * as ContextMenuActionCreators from '~/actions/ContextMenuActionCreators';
import * as DeveloperOptionsActionCreators from '~/actions/DeveloperOptionsActionCreators';
import * as ModalActionCreators from '~/actions/ModalActionCreators';
import {modal} from '~/actions/ModalActionCreators';
import * as PopoutActionCreators from '~/actions/PopoutActionCreators';
import * as TextCopyActionCreators from '~/actions/TextCopyActionCreators';
import * as VoiceSettingsActionCreators from '~/actions/VoiceSettingsActionCreators';
import * as VoiceStateActionCreators from '~/actions/VoiceStateActionCreators';
import {CameraPreviewModalInRoom} from '~/components/modals/CameraPreviewModal';
import {ScreenShareSettingsModal} from '~/components/modals/ScreenShareSettingsModal';
import FocusRing from '~/components/uikit/FocusRing/FocusRing';
import {FocusRingWrapper} from '~/components/uikit/FocusRingWrapper';
import {Popout} from '~/components/uikit/Popout/Popout';
import {Tooltip} from '~/components/uikit/Tooltip/Tooltip';
import {VoiceAudioSettingsMenu} from '~/components/voice/VoiceSettingsMenus';
import {usePopout} from '~/hooks/usePopout';
import {useMediaDevices} from '~/hooks/useMediaDevices';
import {Link} from '~/lib/router';
import {Routes} from '~/Routes';
import ChannelStore from '~/stores/ChannelStore';
import DeveloperOptionsStore from '~/stores/DeveloperOptionsStore';
import GuildStore from '~/stores/GuildStore';
import MobileLayoutStore from '~/stores/MobileLayoutStore';
import LocalVoiceStateStore from '~/stores/LocalVoiceStateStore';
import VoiceSettingsStore from '~/stores/VoiceSettingsStore';
import VoicePanelLayoutStore from '~/stores/VoicePanelLayoutStore';
import MediaEngineStore from '~/stores/voice/MediaEngineFacade';
import type {LatencyDataPoint} from '~/stores/voice/VoiceStatsManager';
import * as ChannelUtils from '~/utils/ChannelUtils';
import {executeScreenShareOperation} from '~/utils/ScreenShareUtils';
import {
	getScreenShareQualityOptions,
	type ScreenShareStreamResolution,
} from '~/utils/voice/StreamQualityUtils';
import {SignalStrengthIcon} from './SignalStrengthIcon';
import styles from './VoiceConnectionStatus.module.css';

const TIMER_TICK_MS = 1000;
const ARC_EASE = [0.22, 1, 0.36, 1] as const;
const voiceConnectionStartedAtBySession = new Map<string, number>();
type VoicePanelDensity = 'comfortable' | 'compact';

function getEnterMotion(reducedMotion: boolean) {
	if (reducedMotion) {
		return {};
	}

	return {
		initial: {opacity: 0, y: 10},
		animate: {opacity: 1, y: 0},
		transition: {duration: 0.28, ease: ARC_EASE},
	};
}

function getItemMotion(reducedMotion: boolean, delay = 0) {
	if (reducedMotion) {
		return {};
	}

	return {
		initial: {opacity: 0, y: 8},
		animate: {opacity: 1, y: 0},
		transition: {duration: 0.22, ease: ARC_EASE, delay},
	};
}

function getPressMotion(reducedMotion: boolean) {
	if (reducedMotion) {
		return {};
	}

	return {
		whileHover: {y: -1, scale: 1.01},
		whileTap: {scale: 0.98},
		transition: {duration: 0.16, ease: ARC_EASE},
	};
}

function formatVoiceConnectionDuration(totalSeconds: number): string {
	const seconds = Math.max(0, totalSeconds);
	const hours = Math.floor(seconds / 3600);
	const minutes = Math.floor((seconds % 3600) / 60);
	const remainingSeconds = seconds % 60;

	if (hours > 0) {
		return `${hours}:${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`;
	}

	return `${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`;
}

function useVoiceConnectionDuration(
	isActive: boolean,
	sessionKey: string | null,
	initialElapsedSeconds: number = 0,
): string | null {
	const [connectedSince, setConnectedSince] = useState<number | null>(null);
	const [nowMs, setNowMs] = useState(() => Date.now());
	const previousSessionRef = useRef<string | null>(null);

	useEffect(() => {
		if (!isActive || !sessionKey) {
			if (previousSessionRef.current) {
				voiceConnectionStartedAtBySession.delete(previousSessionRef.current);
				previousSessionRef.current = null;
			}
			setConnectedSince(null);
			return;
		}

		if (previousSessionRef.current && previousSessionRef.current !== sessionKey) {
			voiceConnectionStartedAtBySession.delete(previousSessionRef.current);
		}
		previousSessionRef.current = sessionKey;

		const persistedConnectedSince = voiceConnectionStartedAtBySession.get(sessionKey);
		if (persistedConnectedSince !== undefined) {
			setConnectedSince(persistedConnectedSince);
			return;
		}

		const initialConnectedSince = Date.now() - initialElapsedSeconds * TIMER_TICK_MS;
		voiceConnectionStartedAtBySession.set(sessionKey, initialConnectedSince);
		setConnectedSince(initialConnectedSince);
	}, [initialElapsedSeconds, isActive, sessionKey]);

	useEffect(() => {
		if (!connectedSince) {
			return;
		}

		setNowMs(Date.now());
		const intervalId = setInterval(() => {
			setNowMs(Date.now());
		}, TIMER_TICK_MS);

		return () => clearInterval(intervalId);
	}, [connectedSince]);

	if (!connectedSince) {
		return null;
	}

	const elapsedSeconds = Math.floor((nowMs - connectedSince) / TIMER_TICK_MS);
	return formatVoiceConnectionDuration(elapsedSeconds);
}

interface VoiceLatencySample {
	timestamp: number;
	latency: number;
}

interface VoiceLatencyChartPoint {
	x: number;
	y: number;
	timestamp: number;
}

interface VoiceLatencyChartPadding {
	top: number;
	right: number;
	bottom: number;
	left: number;
}

function createSmoothLinePath(points: VoiceLatencyChartPoint[]): string {
	if (points.length === 0) {
		return '';
	}

	if (points.length === 1) {
		return `M ${points[0].x} ${points[0].y}`;
	}

	const path: string[] = [`M ${points[0].x} ${points[0].y}`];

	for (let index = 0; index < points.length - 1; index++) {
		const p0 = points[Math.max(0, index - 1)];
		const p1 = points[index];
		const p2 = points[index + 1];
		const p3 = points[Math.min(points.length - 1, index + 2)];

		const cp1x = p1.x + (p2.x - p0.x) / 6;
		const cp1y = p1.y + (p2.y - p0.y) / 6;
		const cp2x = p2.x - (p3.x - p1.x) / 6;
		const cp2y = p2.y - (p3.y - p1.y) / 6;

		path.push(`C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`);
	}

	return path.join(' ');
}

function createAreaPath(points: VoiceLatencyChartPoint[], baselineY: number): string {
	if (points.length === 0) {
		return '';
	}

	const linePath = createSmoothLinePath(points);
	const firstPoint = points[0];
	const lastPoint = points[points.length - 1];
	return `${linePath} L ${lastPoint.x} ${baselineY} L ${firstPoint.x} ${baselineY} Z`;
}

function getChartLineMotion(reducedMotion: boolean) {
	if (reducedMotion) {
		return {};
	}

	return {
		initial: {pathLength: 0.2, opacity: 0.5},
		animate: {pathLength: 1, opacity: 1},
		transition: {duration: 0.7, ease: ARC_EASE},
	};
}

interface VoiceLatencyChartProps {
	chartData: VoiceLatencySample[];
	maxLatency: number;
	reducedMotion: boolean;
	chartWidth?: number;
	chartHeight?: number;
}

const VoiceLatencyChart = ({chartData, maxLatency, reducedMotion, chartWidth = 300, chartHeight = 120}: VoiceLatencyChartProps) => {
	const chartId = useId().replace(/:/g, '');
	const padding = useMemo<VoiceLatencyChartPadding>(() => ({top: 10, right: 10, bottom: 20, left: 40}), []);
	const graphWidth = chartWidth - padding.left - padding.right;
	const graphHeight = chartHeight - padding.top - padding.bottom;
	const baselineY = chartHeight - padding.bottom;

	const points = useMemo<VoiceLatencyChartPoint[]>(() => {
		return chartData.map((point, index) => {
			const x = padding.left + (index / Math.max(chartData.length - 1, 1)) * graphWidth;
			const y = padding.top + graphHeight - (point.latency / Math.max(maxLatency, 1)) * graphHeight;
			return {x, y, timestamp: point.timestamp};
		});
	}, [chartData, graphHeight, graphWidth, maxLatency, padding.left, padding.top]);

	const smoothPath = useMemo(() => createSmoothLinePath(points), [points]);
	const areaPath = useMemo(() => createAreaPath(points, baselineY), [baselineY, points]);
	const latestPoint = points.length > 0 ? points[points.length - 1] : null;
	const gridValues = useMemo(() => Array.from({length: 5}, (_, i) => Math.round((maxLatency / 4) * i)), [maxLatency]);

	return (
		<svg
			viewBox={`0 0 ${chartWidth} ${chartHeight}`}
			className={styles.chartSvg}
			style={{width: '100%'}}
			role="img"
			aria-label={t`Latency graph`}
		>
			<defs>
				<linearGradient id={`voice-chart-area-${chartId}`} x1="0" y1="0" x2="0" y2="1">
					<stop offset="0%" stopColor="rgb(34 197 94 / 0.32)" />
					<stop offset="100%" stopColor="rgb(34 197 94 / 0.03)" />
				</linearGradient>
			</defs>

			{gridValues.map((value) => {
				const y = padding.top + graphHeight - (value / Math.max(maxLatency, 1)) * graphHeight;
				return (
					<g key={value}>
						<line
							x1={padding.left}
							y1={y}
							x2={chartWidth - padding.right}
							y2={y}
							className={`${styles.gridLine} ${styles.gridLineHorizontal} ${styles.textBackgroundModifierHover}`}
						/>
						<text x={padding.left - 5} y={y} className={styles.gridText}>
							{value}ms
						</text>
					</g>
				);
			})}

			<line
				x1={padding.left}
				y1={baselineY}
				x2={chartWidth - padding.right}
				y2={baselineY}
				className={`${styles.gridLine} ${styles.textBackgroundModifierHover}`}
			/>
			<line
				x1={padding.left}
				y1={padding.top}
				x2={padding.left}
				y2={baselineY}
				className={`${styles.gridLine} ${styles.gridLineVertical} ${styles.textBackgroundModifierHover}`}
			/>

			{areaPath && (
				<path d={areaPath} className={styles.chartArea} fill={`url(#voice-chart-area-${chartId})`} />
			)}

			{smoothPath && (
				<>
					<motion.path d={smoothPath} className={styles.chartLineGlow} {...getChartLineMotion(reducedMotion)} />
					<motion.path d={smoothPath} className={`${styles.chartLine} ${styles.textGreen}`} {...getChartLineMotion(reducedMotion)} />
				</>
			)}

			{points.map((point) => (
				<circle key={point.timestamp} cx={point.x} cy={point.y} r="2" className={`${styles.chartPoint} ${styles.textGreen}`} />
			))}

			{latestPoint && (
				<circle
					cx={latestPoint.x}
					cy={latestPoint.y}
					r="3.25"
					className={`${styles.chartPointLatest} ${styles.textGreen}`}
				/>
			)}
		</svg>
	);
};

interface VoiceDetailsPanelProps {
	reducedMotion: boolean;
	latency: number | null;
	averageLatency: number | null | undefined;
	chartData: VoiceLatencySample[];
	connectionId: string | null;
	isMobile: boolean;
	strippedEndpoint: string | null;
	onCopyEndpoint: (value: string) => Promise<unknown>;
}

const VoiceDetailsPanel = ({
	reducedMotion,
	latency,
	averageLatency,
	chartData,
	connectionId,
	isMobile,
	strippedEndpoint,
	onCopyEndpoint,
}: VoiceDetailsPanelProps) => {
	const [detailsCollapsed, setDetailsCollapsed] = useState(true);
	const maxLatency = Math.max(...chartData.map((point) => point.latency), 20) + 10;

	return (
		<motion.div className={styles.popoutContainer} {...getEnterMotion(reducedMotion)}>
			<motion.div className={styles.popoutHeader} {...getItemMotion(reducedMotion)}>
				<span className={styles.popoutTitle}>{t`Voice Connection`}</span>
				<div className={styles.popoutHeaderActions}>
					<FocusRing offset={-2}>
						<motion.button
							type="button"
							className={styles.popoutToggleButton}
							onClick={() => setDetailsCollapsed((prev) => !prev)}
							aria-label={detailsCollapsed ? t`Show connection details` : t`Hide connection details`}
							{...getPressMotion(reducedMotion)}
						>
							{detailsCollapsed ? (
								<CaretDownIcon weight="bold" className={styles.iconSmall} />
							) : (
								<CaretUpIcon weight="bold" className={styles.iconSmall} />
							)}
						</motion.button>
					</FocusRing>
					<FocusRing offset={-2}>
						<motion.button
							type="button"
							className={styles.popoutCloseButton}
							onClick={() => PopoutActionCreators.close()}
							aria-label={t`Close`}
							{...getPressMotion(reducedMotion)}
						>
							<XIcon weight="bold" className={styles.iconSmall} />
						</motion.button>
					</FocusRing>
				</div>
			</motion.div>

			<motion.div className={styles.popoutSummaryRow} {...getItemMotion(reducedMotion, 0.04)}>
				<span className={styles.popoutStatLabel}>{t`Current ping:`}</span>
				<span className={clsx(styles.popoutStatValue, latency === null && styles.pingSearchingValue)}>
					{latency !== null ? `${latency}ms` : t`Searching network...`}
				</span>
			</motion.div>

			<AnimatePresence initial={false}>
				{!detailsCollapsed && (
					<motion.div
						className={styles.popoutDetailsCollapse}
						initial={reducedMotion ? undefined : {height: 0, opacity: 0}}
						animate={reducedMotion ? undefined : {height: 'auto', opacity: 1}}
						exit={reducedMotion ? undefined : {height: 0, opacity: 0}}
						transition={reducedMotion ? undefined : {duration: 0.24, ease: ARC_EASE}}
					>
						<div className={styles.popoutDetailsInner}>
							{chartData.length > 0 && (
								<motion.div className={styles.chartContainer} {...getItemMotion(reducedMotion, 0.06)}>
									<VoiceLatencyChart chartData={chartData} maxLatency={maxLatency} reducedMotion={reducedMotion} />
								</motion.div>
							)}

							<motion.div className={styles.popoutStats} {...getItemMotion(reducedMotion, 0.1)}>
								{connectionId && (
									<motion.div className={styles.popoutStatRow} {...getItemMotion(reducedMotion, 0.12)}>
										<span className={styles.popoutStatLabel}>{t`Device:`}</span>
										<Tooltip text={connectionId}>
											<div className={styles.deviceBadge}>
												{isMobile ? (
													<DeviceMobileIcon weight="regular" className={styles.deviceIcon} />
												) : (
													<DesktopIcon weight="regular" className={styles.deviceIcon} />
												)}
												<span className={styles.deviceBadgeText}>{connectionId}</span>
											</div>
										</Tooltip>
									</motion.div>
								)}
								{averageLatency !== null && averageLatency !== undefined && (
									<motion.div className={styles.popoutStatRow} {...getItemMotion(reducedMotion, 0.14)}>
										<span className={styles.popoutStatLabel}>{t`Average ping:`}</span>
										<span className={styles.popoutStatValue}>{averageLatency}ms</span>
									</motion.div>
								)}
								{strippedEndpoint && (
									<motion.div className={styles.popoutStatRow} {...getItemMotion(reducedMotion, 0.16)}>
										<span className={styles.popoutStatLabel}>{t`Endpoint:`}</span>
										<Tooltip text={strippedEndpoint}>
											<FocusRing offset={-2}>
												<motion.div
													className={styles.endpointBadge}
													role="button"
													tabIndex={0}
													aria-label={t`Copy endpoint`}
													{...getPressMotion(reducedMotion)}
													onClick={async (e) => {
														e.stopPropagation();
														await onCopyEndpoint(strippedEndpoint);
													}}
													onKeyDown={async (e) => {
														if (e.key === 'Enter' || e.key === ' ') {
															e.preventDefault();
															e.stopPropagation();
															await onCopyEndpoint(strippedEndpoint);
														}
													}}
												>
													<LockSimpleIcon weight="fill" className={styles.lockIcon} style={{color: 'var(--status-online)'}} />
													<span className={styles.endpointBadgeText}>{strippedEndpoint}</span>
												</motion.div>
											</FocusRing>
										</Tooltip>
									</motion.div>
								)}
							</motion.div>
						</div>
					</motion.div>
				)}
			</AnimatePresence>
		</motion.div>
	);
};

const VoiceDetailsPopout = observer(() => {
	const {i18n} = useLingui();
	const reducedMotion = useReducedMotion() ?? false;
	const latency = MediaEngineStore.currentLatency;
	const averageLatency = MediaEngineStore.averageLatency;
	const latencyHistory = MediaEngineStore.latencyHistory;
	const voiceServerEndpoint = MediaEngineStore.voiceServerEndpoint;
	const connectionId = MediaEngineStore.connectionId;
	const voiceState = MediaEngineStore.getCurrentUserVoiceState();
	const isMobile = voiceState?.is_mobile ?? false;

	const strippedEndpoint = voiceServerEndpoint
		? (() => {
				try {
					const url = new URL(voiceServerEndpoint);
					return url.port ? `${url.hostname}:${url.port}` : url.hostname;
				} catch {
					return voiceServerEndpoint;
				}
			})()
		: null;

	const chartData: VoiceLatencySample[] = latencyHistory
		.slice(-30)
		.map((point: LatencyDataPoint) => ({timestamp: point.timestamp, latency: point.latency}));

	return (
		<VoiceDetailsPanel
			reducedMotion={reducedMotion}
			latency={latency}
			averageLatency={averageLatency}
			chartData={chartData}
			connectionId={connectionId}
			isMobile={isMobile}
			strippedEndpoint={strippedEndpoint}
			onCopyEndpoint={async (value) => TextCopyActionCreators.copy(i18n, value)}
		/>
	);
});

const useCenteredVoiceDetailsPopoutOffset = (enabled: boolean, deps: unknown[] = []) => {
	const statusRowRef = useRef<HTMLDivElement | null>(null);
	const statusButtonRef = useRef<HTMLButtonElement | null>(null);
	const [offsetCrossAxis, setOffsetCrossAxis] = useState(0);

	useEffect(() => {
		if (!enabled) {
			setOffsetCrossAxis(0);
			return;
		}

		const statusRowElement = statusRowRef.current;
		const statusButtonElement = statusButtonRef.current;

		if (!statusRowElement || !statusButtonElement) {
			return;
		}

		const updateOffset = () => {
			const rowRect = statusRowElement.getBoundingClientRect();
			const buttonRect = statusButtonElement.getBoundingClientRect();
			const nextOffset = rowRect.left + rowRect.width / 2 - (buttonRect.left + buttonRect.width / 2);
			setOffsetCrossAxis((previousOffset) => (Math.abs(previousOffset - nextOffset) < 0.5 ? previousOffset : nextOffset));
		};

		updateOffset();

		const resizeObserver = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(updateOffset) : null;
		resizeObserver?.observe(statusRowElement);
		resizeObserver?.observe(statusButtonElement);
		window.addEventListener('resize', updateOffset);

		return () => {
			resizeObserver?.disconnect();
			window.removeEventListener('resize', updateOffset);
		};
	}, [enabled, ...deps]);

	return {
		statusRowRef,
		statusButtonRef,
		offsetCrossAxis,
	};
};

const VoiceConnectionStatusInner = observer(
	({
		embedded = false,
		density = 'comfortable',
	}: {
		embedded?: boolean;
		density?: VoicePanelDensity;
	}) => {
	const {t} = useLingui();
	const reducedMotion = useReducedMotion() ?? false;
	const voiceState = MediaEngineStore.getCurrentUserVoiceState();
	const storeConnectedGuildId = MediaEngineStore.guildId;
	const storeConnectedChannelId = MediaEngineStore.channelId;
	const isConnecting = MediaEngineStore.connecting;
	const storeIsConnected = MediaEngineStore.connected;
	const isSelfMuted = LocalVoiceStateStore.selfMute;
	const isSelfDeafened = LocalVoiceStateStore.selfDeaf;
	const isGuildMuted = voiceState?.mute ?? false;
	const isGuildDeafened = voiceState?.deaf ?? false;

	const currentLatency = MediaEngineStore.currentLatency;
	const isPingSearching = isConnecting || currentLatency === null;
	const latencyForSignal = isPingSearching ? null : currentLatency;
	const connectionId = MediaEngineStore.connectionId;
	const isMobile = voiceState?.is_mobile ?? false;
	const [isConnectionInfoCollapsed, setIsConnectionInfoCollapsed] = useState(true);
	const {statusRowRef, statusButtonRef, offsetCrossAxis} = useCenteredVoiceDetailsPopoutOffset(
		!MobileLayoutStore.enabled,
		[isConnectionInfoCollapsed],
	);

	const {openProps: popoutProps} = usePopout('voice-details-popout');

	const connectedGuildId = storeConnectedGuildId;
	const connectedChannelId = storeConnectedChannelId;
	const isConnected = storeIsConnected;
	const showConnectionInfo = !isConnectionInfoCollapsed;
	const voiceSessionKey =
		isConnected && connectedChannelId ? `${connectedGuildId ?? 'dm'}:${connectedChannelId}` : null;
	const voiceConnectionDuration = useVoiceConnectionDuration(isConnected, voiceSessionKey);

	if (!connectedChannelId) {
		return null;
	}

	const channel = ChannelStore.getChannel(connectedChannelId);
	const resolvedGuildId = connectedGuildId ?? channel?.guildId ?? null;
	const guild = resolvedGuildId ? GuildStore.getGuild(resolvedGuildId) : null;
	const channelDisplayName = channel ? (channel.name || ChannelUtils.getDMDisplayName(channel)) : '';

	if (!channel || (resolvedGuildId && !guild)) {
		return null;
	}

	const getStatusText = () => {
		if (isConnecting) return t`Connecting...`;
		if (isConnected) return t`Voice Connected`;
		return t`Disconnected`;
	};

	const getStatusClass = () => {
		if (isConnecting) return styles.statusConnecting;
		if (isConnected) return styles.statusConnected;
		return styles.statusDisconnected;
	};

	const handleToggleExpand = (event: React.MouseEvent) => {
		event.preventDefault();
		event.stopPropagation();
		setIsConnectionInfoCollapsed((prev) => !prev);
	};

	useEffect(() => {
		if (!embedded) {
			return;
		}

		if (isConnectionInfoCollapsed) {
			VoicePanelLayoutStore.setCompactSize();
			return;
		}

		VoicePanelLayoutStore.setExpandedSize();
	}, [embedded, isConnectionInfoCollapsed]);

	return (
		<motion.div
			className={clsx(
				styles.voiceConnectionContainer,
				embedded && styles.voiceConnectionEmbedded,
				embedded && isConnectionInfoCollapsed && styles.voiceConnectionEmbeddedCollapsed,
				!embedded && density === 'compact' && styles.voiceConnectionCompact,
				!embedded && isConnectionInfoCollapsed && styles.voiceConnectionCollapsed,
			)}
			{...getEnterMotion(reducedMotion)}
		>
			<motion.div className={styles.mediaSection} {...getItemMotion(reducedMotion, 0.04)}>
				<LocalParticipantControls />
			</motion.div>

			<motion.div ref={statusRowRef} className={styles.statusRow} {...getItemMotion(reducedMotion)}>
				{(isConnected || isConnecting) && (
					<Tooltip text={isPingSearching ? t`Searching network...` : t`Ping: ${currentLatency}ms`}>
						<motion.div
							className={clsx(styles.signalIcon, isPingSearching && styles.signalIconSearching)}
							animate={reducedMotion ? undefined : {scale: [1, 1.03, 1]}}
							transition={reducedMotion ? undefined : {duration: 2.8, ease: 'easeInOut', repeat: Number.POSITIVE_INFINITY}}
						>
							<SignalStrengthIcon latency={latencyForSignal} size={18} />
						</motion.div>
					</Tooltip>
				)}
				<Popout
					{...popoutProps}
					position="top"
					offsetMainAxis={16}
					offsetCrossAxis={offsetCrossAxis}
					render={() => <VoiceDetailsPopout />}
				>
					<FocusRingWrapper focusRingOffset={-2}>
						<motion.button
							ref={statusButtonRef}
							type="button"
							className={clsx(styles.statusButton, getStatusClass(), isConnecting && styles.statusButtonConnecting)}
							{...getPressMotion(reducedMotion)}
						>
							<span className={clsx(styles.statusIndicator, isConnecting && styles.statusIndicatorFast)} aria-hidden="true" />
							{embedded && isConnectionInfoCollapsed && (
								<span className={styles.compactPing}>
									{currentLatency !== null ? `${currentLatency}ms` : t`--ms`}
								</span>
							)}
							<span className={styles.statusMeta}>
								<span className={styles.statusLabel}>{getStatusText()}</span>
								{voiceConnectionDuration && (
									<span className={styles.statusTimer}>{voiceConnectionDuration}</span>
								)}
							</span>
						</motion.button>
					</FocusRingWrapper>
				</Popout>
				<div className={styles.controls}>
					{embedded ? (
						<Tooltip text={isConnectionInfoCollapsed ? t`Show server and room info` : t`Hide server and room info`}>
							<FocusRing offset={-2}>
								<motion.button
									type="button"
									className={clsx(styles.controlButton, !isConnectionInfoCollapsed && styles.selected)}
									onClick={handleToggleExpand}
									aria-label={isConnectionInfoCollapsed ? t`Show server and room info` : t`Hide server and room info`}
									{...getPressMotion(reducedMotion)}
								>
									{isConnectionInfoCollapsed ? (
										<CaretDownIcon weight="bold" className={styles.icon} />
									) : (
										<CaretUpIcon weight="bold" className={styles.icon} />
									)}
								</motion.button>
							</FocusRing>
						</Tooltip>
					) : (
						<Tooltip text={isConnectionInfoCollapsed ? t`Show server and room info` : t`Hide server and room info`}>
							<FocusRing offset={-2}>
								<motion.button
									type="button"
									className={clsx(styles.controlButton, !isConnectionInfoCollapsed && styles.selected)}
									onClick={handleToggleExpand}
									aria-label={isConnectionInfoCollapsed ? t`Show server and room info` : t`Hide server and room info`}
									{...getPressMotion(reducedMotion)}
								>
									{isConnectionInfoCollapsed ? (
										<CaretDownIcon weight="bold" className={styles.icon} />
									) : (
										<CaretUpIcon weight="bold" className={styles.icon} />
									)}
								</motion.button>
							</FocusRing>
						</Tooltip>
					)}
					<Tooltip text={isGuildMuted ? t`Community Muted` : isSelfMuted ? t`Unmute` : t`Mute`}>
						<FocusRing offset={-2} enabled={!isGuildMuted}>
							<motion.button
								type="button"
								className={clsx(styles.controlButton, (isSelfMuted || isGuildMuted) && styles.selected, isGuildMuted && styles.disabled)}
								onClick={isGuildMuted ? undefined : () => VoiceStateActionCreators.toggleSelfMute(null)}
								aria-label={isGuildMuted ? t`Community Muted` : isSelfMuted ? t`Unmute` : t`Mute`}
								disabled={isGuildMuted}
								{...getPressMotion(reducedMotion)}
							>
								{isSelfMuted || isGuildMuted ? (
									<MicrophoneSlashIcon weight="fill" className={styles.icon} />
								) : (
									<MicrophoneIcon weight="fill" className={styles.icon} />
								)}
							</motion.button>
						</FocusRing>
					</Tooltip>
					<Tooltip text={isGuildDeafened ? t`Community Deafened` : isSelfDeafened ? t`Undeafen` : t`Deafen`}>
						<FocusRing offset={-2} enabled={!isGuildDeafened}>
							<motion.button
								type="button"
								className={clsx(styles.controlButton, (isSelfDeafened || isGuildDeafened) && styles.selected, isGuildDeafened && styles.disabled)}
								onClick={isGuildDeafened ? undefined : () => VoiceStateActionCreators.toggleSelfDeaf(null)}
								aria-label={isGuildDeafened ? t`Community Deafened` : isSelfDeafened ? t`Undeafen` : t`Deafen`}
								disabled={isGuildDeafened}
								{...getPressMotion(reducedMotion)}
							>
								{isSelfDeafened || isGuildDeafened ? (
									<SpeakerSlashIcon className={styles.icon} />
								) : (
									<SpeakerHighIcon className={styles.icon} />
								)}
							</motion.button>
						</FocusRing>
					</Tooltip>
					<Tooltip text={t`Disconnect`}>
						<FocusRing offset={-2}>
							<motion.button
								type="button"
								className={styles.controlButton}
								onClick={async () => {
									await MediaEngineStore.disconnectFromVoiceChannel();
								}}
								aria-label={t`Disconnect`}
								{...getPressMotion(reducedMotion)}
							>
								<PhoneXIcon weight="fill" className={styles.icon} />
							</motion.button>
						</FocusRing>
					</Tooltip>
				</div>
			</motion.div>

			<AnimatePresence initial={false}>
				{showConnectionInfo && (
					<motion.div
						className={styles.collapsibleSection}
						initial={reducedMotion ? undefined : {height: 0, opacity: 0}}
						animate={reducedMotion ? undefined : {height: 'auto', opacity: 1}}
						exit={reducedMotion ? undefined : {height: 0, opacity: 0}}
						transition={reducedMotion ? undefined : {duration: 0.24, ease: ARC_EASE}}
					>
						<motion.div className={styles.connectionInfo} {...getItemMotion(reducedMotion, 0.06)}>
							{connectionId && (
								<motion.div className={styles.infoRow} {...getItemMotion(reducedMotion, 0.08)}>
									{isMobile ? (
										<DeviceMobileIcon weight="regular" className={styles.infoIcon} />
									) : (
										<DesktopIcon weight="regular" className={styles.infoIcon} />
									)}
									<div>
										<Tooltip text={connectionId}>
											<span className={styles.infoText}>{connectionId}</span>
										</Tooltip>
									</div>
								</motion.div>
							)}
							<FocusRing offset={-2}>
								<motion.div {...getPressMotion(reducedMotion)}>
									<Link
										to={resolvedGuildId ? Routes.guildChannel(resolvedGuildId, channel.id) : Routes.dmChannel(channel.id)}
										className={styles.channelInfo}
									>
										<div className={styles.channelIcon}>
											{ChannelUtils.getIcon(channel, {className: styles.channelIconSize})}
										</div>
										<div className={styles.channelText}>
											<span className={styles.channelName}>{channelDisplayName}</span>
											{guild && (
												<>
													<span className={styles.guildSeparator} aria-hidden="true">
														<BuildingsIcon weight="duotone" className={styles.deviceIcon} />
													</span>
													<span className={styles.guildName}>{guild.name}</span>
												</>
											)}
										</div>
									</Link>
								</motion.div>
							</FocusRing>
						</motion.div>
					</motion.div>
				)}
			</AnimatePresence>
		</motion.div>
	);
});

const LocalParticipantControls = observer(() => {
	const {t} = useLingui();
	const reducedMotion = useReducedMotion() ?? false;
	const {inputDevices, outputDevices} = useMediaDevices();
	const room = MediaEngineStore.room;
	const localParticipant = room?.localParticipant;
	const participants = MediaEngineStore.participants;
	const localParticipantSnapshot = Object.values(participants).find((p) => p.isLocal);
	const isCameraEnabled = localParticipantSnapshot?.isCameraEnabled ?? false;
	const isScreenShareEnabled = localParticipantSnapshot?.isScreenShareEnabled ?? false;
	const isConnected = !!room && !!localParticipant;
	const noiseSuppressionEnabled = VoiceSettingsStore.noiseSuppression;

	const handleOpenAudioSettings = (event: React.MouseEvent) => {
		event.preventDefault();
		event.stopPropagation();
		ContextMenuActionCreators.openFromEvent(event, (props) => (
			<VoiceAudioSettingsMenu inputDevices={inputDevices} outputDevices={outputDevices} onClose={props.onClose} />
		));
	};

	const handleToggleCamera = useCallback(async () => {
		if (!localParticipant) return;

		try {
			if (isCameraEnabled) {
				await MediaEngineStore.setCameraEnabled(false);
			} else {
				ModalActionCreators.push(
					modal(() => (
						<CameraPreviewModalInRoom
							onEnabled={async () => {
								await MediaEngineStore.setCameraEnabled(
									true,
									{
										deviceId: VoiceSettingsStore.getVideoDeviceId() || undefined,
									},
								);
							}}
						/>
					)),
				);
			}
		} catch (error) {
			console.error('Failed to toggle camera:', error);
		}
	}, [isCameraEnabled, localParticipant]);

	const getScreenShareConstraints = useCallback(
		(resolution: ScreenShareStreamResolution, frameRate: number) => getScreenShareQualityOptions(resolution, frameRate),
		[],
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
									const constraints = getScreenShareConstraints(resolution, frameRate);
									await MediaEngineStore.setScreenShareEnabled(true, {
										...constraints.captureOptions,
										audio: includeAudio,
									}, constraints.publishOptions);
								});
							}}
						/>
					)),
				);
			}
		} catch (error) {
			console.error('Failed to toggle screen share:', error);
		}
	}, [isScreenShareEnabled, localParticipant, getScreenShareConstraints]);

	return (
		<>
			<Tooltip
				text={
					!isConnected ? t`Please wait for connection...` : isCameraEnabled ? t`Turn Off Camera` : t`Turn On Camera`
				}
			>
				<FocusRing offset={-2} enabled={isConnected}>
					<motion.button
						type="button"
						className={clsx(styles.mediaButton, isCameraEnabled && styles.cameraActive)}
						onClick={handleToggleCamera}
						disabled={!isConnected}
						aria-label={
							!isConnected ? t`Please wait for connection...` : isCameraEnabled ? t`Turn Off Camera` : t`Turn On Camera`
						}
						{...getPressMotion(reducedMotion)}
					>
						{isCameraEnabled ? (
							<CameraIcon weight="fill" className={styles.mediaIcon} />
						) : (
							<CameraSlashIcon weight="fill" className={styles.mediaIcon} />
						)}
					</motion.button>
				</FocusRing>
			</Tooltip>
			<Tooltip
				text={
					!isConnected
						? t`Please wait for connection...`
						: isScreenShareEnabled
							? t`Stop Sharing`
							: t`Share Your Screen`
				}
			>
				<FocusRing offset={-2} enabled={isConnected}>
					<motion.button
						type="button"
						className={clsx(styles.mediaButton, isScreenShareEnabled && styles.screenShareActive)}
						onClick={handleScreenShare}
						disabled={!isConnected}
						aria-label={
							!isConnected
								? t`Please wait for connection...`
								: isScreenShareEnabled
									? t`Stop Sharing`
									: t`Share Your Screen`
						}
						{...getPressMotion(reducedMotion)}
					>
						<MonitorIcon weight="fill" className={styles.mediaIcon} />
					</motion.button>
				</FocusRing>
			</Tooltip>
			<Tooltip text={noiseSuppressionEnabled ? t`Disable Noise Suppression` : t`Enable Noise Suppression`}>
				<FocusRing offset={-2}>
					<motion.button
						type="button"
						className={clsx(styles.mediaButton, noiseSuppressionEnabled && styles.noiseSuppressionActive)}
						onClick={() => VoiceSettingsActionCreators.update({noiseSuppression: !noiseSuppressionEnabled})}
						aria-label={noiseSuppressionEnabled ? t`Disable Noise Suppression` : t`Enable Noise Suppression`}
						{...getPressMotion(reducedMotion)}
					>
						<WaveformIcon weight="fill" className={styles.mediaIcon} />
					</motion.button>
				</FocusRing>
			</Tooltip>
			<Tooltip text={t`Audio Settings`}>
				<FocusRing offset={-2}>
					<motion.button
						type="button"
						className={styles.mediaButton}
						onClick={handleOpenAudioSettings}
						aria-label={t`Audio Settings`}
						{...getPressMotion(reducedMotion)}
					>
						<SlidersHorizontalIcon weight="fill" className={styles.mediaIcon} />
					</motion.button>
				</FocusRing>
			</Tooltip>
		</>
	);
});

const MockedVoiceConnectionStatus = observer(({embedded = false, density = 'comfortable'}: {embedded?: boolean; density?: VoicePanelDensity}) => {
	const {i18n} = useLingui();
	const reducedMotion = useReducedMotion() ?? false;
	const {openProps: popoutProps} = usePopout('voice-details-popout');
	const latency = 42;
	const averageLatency = 45;
	const voiceConnectionDuration = useVoiceConnectionDuration(true, 'mocked-voice-session', 5 * 60 + 12);
	const [isConnectionInfoCollapsed, setIsConnectionInfoCollapsed] = useState(true);
	const {statusRowRef, statusButtonRef, offsetCrossAxis} = useCenteredVoiceDetailsPopoutOffset(
		!MobileLayoutStore.enabled,
		[isConnectionInfoCollapsed],
	);
	const chartData = useMemo<VoiceLatencySample[]>(() => {
		const data: VoiceLatencySample[] = [];
		const baseLatency = 45;
		for (let i = 0; i < 30; i++) {
			const variation = Math.sin(i / 3) * 15 + Math.random() * 10 - 5;
			data.push({
				timestamp: Date.now() - (30 - i) * 1000,
				latency: Math.max(20, Math.min(80, baseLatency + variation)),
			});
		}
		return data;
	}, []);

	return (
		<motion.div
			className={clsx(
				styles.voiceConnectionContainer,
				embedded && styles.voiceConnectionEmbedded,
				density === 'compact' && styles.voiceConnectionCompact,
				!embedded && isConnectionInfoCollapsed && styles.voiceConnectionCollapsed,
			)}
			{...getEnterMotion(reducedMotion)}
		>
			<motion.div className={styles.mediaSection} {...getItemMotion(reducedMotion, 0.04)}>
				<LocalParticipantControls />
			</motion.div>

			<motion.div ref={statusRowRef} className={styles.statusRow} {...getItemMotion(reducedMotion)}>
				<Tooltip text={t`Ping: ${latency}ms`}>
					<motion.div
						className={styles.signalIcon}
						animate={reducedMotion ? undefined : {scale: [1, 1.03, 1]}}
						transition={reducedMotion ? undefined : {duration: 2.8, ease: 'easeInOut', repeat: Number.POSITIVE_INFINITY}}
					>
						<SignalStrengthIcon latency={latency} size={18} />
					</motion.div>
				</Tooltip>
				<Popout
					{...popoutProps}
					position="top"
					offsetMainAxis={16}
					offsetCrossAxis={offsetCrossAxis}
					render={() => (
						<VoiceDetailsPanel
							reducedMotion={reducedMotion}
							latency={latency}
							averageLatency={averageLatency}
							chartData={chartData}
							connectionId="mock-device-1"
							isMobile={false}
							strippedEndpoint="mock.voice.server:443"
							onCopyEndpoint={async (value) => TextCopyActionCreators.copy(i18n, value)}
						/>
					)}
				>
					<FocusRingWrapper focusRingOffset={-2}>
						<motion.button
							ref={statusButtonRef}
							type="button"
							className={clsx(styles.statusButton, styles.statusConnected)}
							{...getPressMotion(reducedMotion)}
						>
							<span className={styles.statusIndicator} aria-hidden="true" />
							<span className={styles.statusMeta}>
								<span className={styles.statusLabel}>{t`Voice Connected`}</span>
								{voiceConnectionDuration && (
									<span className={styles.statusTimer}>{voiceConnectionDuration}</span>
								)}
							</span>
						</motion.button>
					</FocusRingWrapper>
				</Popout>
			<div className={styles.controls}>
				<Tooltip text={isConnectionInfoCollapsed ? t`Show server and room info` : t`Hide server and room info`}>
					<FocusRing offset={-2}>
						<motion.button
							type="button"
							className={clsx(styles.controlButton, !isConnectionInfoCollapsed && styles.selected)}
							onClick={() => setIsConnectionInfoCollapsed((prev) => !prev)}
							aria-label={isConnectionInfoCollapsed ? t`Show server and room info` : t`Hide server and room info`}
							{...getPressMotion(reducedMotion)}
						>
							{isConnectionInfoCollapsed ? (
								<CaretDownIcon weight="bold" className={styles.icon} />
							) : (
								<CaretUpIcon weight="bold" className={styles.icon} />
							)}
						</motion.button>
					</FocusRing>
				</Tooltip>
				<Tooltip text={t`Disconnect`}>
					<FocusRing offset={-2}>
						<motion.button
							type="button"
							className={styles.controlButton}
							onClick={() => {
								DeveloperOptionsActionCreators.updateOption('forceShowVoiceConnection', false);
							}}
							aria-label={t`Disconnect`}
							{...getPressMotion(reducedMotion)}
						>
							<PhoneXIcon weight="fill" className={styles.icon} />
						</motion.button>
					</FocusRing>
				</Tooltip>
			</div>
			</motion.div>

			<AnimatePresence initial={false}>
				{!isConnectionInfoCollapsed && (
					<motion.div
						className={styles.collapsibleSection}
						initial={reducedMotion ? undefined : {height: 0, opacity: 0}}
						animate={reducedMotion ? undefined : {height: 'auto', opacity: 1}}
						exit={reducedMotion ? undefined : {height: 0, opacity: 0}}
						transition={reducedMotion ? undefined : {duration: 0.24, ease: ARC_EASE}}
					>
						<div className={styles.connectionInfo}>
							<div className={styles.infoRow}>
								<DesktopIcon weight="regular" className={styles.infoIcon} />
								<div>
									<Tooltip text="mock-device-1">
										<span className={styles.infoText}>mock-device-1</span>
									</Tooltip>
								</div>
							</div>
							<div className={styles.channelInfo}>
								<div className={styles.channelIcon}>
									{ChannelUtils.getIcon({type: 2}, {className: styles.channelIconSize})}
								</div>
								<div className={styles.channelText}>
									<span className={styles.channelName}>general</span>
									<span className={styles.guildSeparator} aria-hidden="true">
										<BuildingsIcon weight="duotone" className={styles.deviceIcon} />
									</span>
									<span className={styles.guildName}>Mock Guild</span>
								</div>
							</div>
						</div>
					</motion.div>
				)}
			</AnimatePresence>
		</motion.div>
	);
});

export const VoiceConnectionStatus = observer(
	({
		embedded = false,
		density = 'comfortable',
	}: {
		embedded?: boolean;
		density?: VoicePanelDensity;
	}) => {
	const storeConnectedGuildId = MediaEngineStore.guildId;
	const storeConnectedChannelId = MediaEngineStore.channelId;
	const mobileLayout = MobileLayoutStore;
	const forceShowVoiceConnection = DeveloperOptionsStore.forceShowVoiceConnection;

	if (mobileLayout.enabled) {
		return null;
	}

	const connectedGuildId = storeConnectedGuildId;
	const connectedChannelId = storeConnectedChannelId;

	if (!connectedChannelId) {
		if (!forceShowVoiceConnection) {
			return null;
		}
		return <MockedVoiceConnectionStatus embedded={embedded} density={density} />;
	}

	return (
		<VoiceConnectionStatusInner
			embedded={embedded}
			density={density}
		/>
	);
	},
);
