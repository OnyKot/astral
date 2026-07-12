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
import {DownloadSimpleIcon, PauseIcon, PlayIcon, StarIcon} from '@phosphor-icons/react';
import {clsx} from 'clsx';
import type React from 'react';
import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {Tooltip} from '~/components/uikit/Tooltip/Tooltip';
import MobileLayoutStore from '~/stores/MobileLayoutStore';
import {useMediaPlayer} from '../hooks/useMediaPlayer';
import {useMediaProgress} from '../hooks/useMediaProgress';
import {useMediaVolume} from '../hooks/useMediaVolume';
import {formatTime} from '../utils/formatTime';
import styles from './InlineAudioPlayer.module.css';
import {MediaProgressBar} from './MediaProgressBar';
import {MediaVolumeControl} from './MediaVolumeControl';

export interface InlineAudioPlayerProps {
	src: string;
	title?: string;
	fileSize?: number;
	duration?: number;
	waveform?: string;
	extension?: string;
	isFavorited?: boolean;
	canFavorite?: boolean;
	onFavoriteClick?: (e: React.MouseEvent) => void;
	onDownloadClick?: (e: React.MouseEvent) => void;
	onContextMenu?: (e: React.MouseEvent) => void;
	className?: string;
	isVoiceMessage?: boolean;
}

function formatFileSize(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function splitFilename(filename: string): {name: string; extension: string} {
	const lastDot = filename.lastIndexOf('.');
	if (lastDot === -1 || lastDot === 0) {
		return {name: filename, extension: ''};
	}
	return {
		name: filename.substring(0, lastDot),
		extension: filename.substring(lastDot),
	};
}

function decodeVoiceWaveform(waveform?: string): Array<number> | null {
	const value = waveform?.trim();
	if (!value) return null;

	try {
		const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
		const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), '=');
		const raw = atob(padded);
		if (!raw) return null;

		const envelope = Array.from(raw, (char) => char.charCodeAt(0) / 255);
		return envelope.length > 0 ? envelope : null;
	} catch {
		return null;
	}
}

export function InlineAudioPlayer({
	src,
	title = 'Audio',
	fileSize,
	duration: initialDuration,
	waveform,
	extension,
	isFavorited = false,
	canFavorite = false,
	onFavoriteClick,
	onDownloadClick,
	onContextMenu,
	className,
	isVoiceMessage = false,
}: InlineAudioPlayerProps) {
	const {t} = useLingui();
	const isMobileLayout = MobileLayoutStore.isMobileLayout();
	const containerRef = useRef<HTMLDivElement>(null);
	const voiceWaveRef = useRef<HTMLButtonElement>(null);

	const [hasStarted, setHasStarted] = useState(false);
	const [voiceEnvelope, setVoiceEnvelope] = useState<Array<number>>([]);
	const [waveBarCount, setWaveBarCount] = useState(() => (isMobileLayout ? 52 : 56));
	const [pendingSeekRatio, setPendingSeekRatio] = useState<number | null>(null);
	const wavePointerIdRef = useRef<number | null>(null);
	const waveSeekBootstrapRef = useRef(false);

	const {mediaRef, state, play, toggle, setPlaybackRate} = useMediaPlayer({
		persistVolume: true,
		persistPlaybackRate: true,
	});

	useEffect(() => {
		if (!state.isPlaying) {
			return;
		}

		const currentAudio = mediaRef.current;
		if (!currentAudio) {
			return;
		}

		const activePlayers = document.querySelectorAll<HTMLAudioElement>('audio[data-inline-audio-player]');
		for (const player of activePlayers) {
			if (player === currentAudio || player.paused) {
				continue;
			}
			player.pause();
		}
	}, [mediaRef, state.isPlaying]);

	const {currentTime, duration, progress, buffered, seekToPercentage, startSeeking, endSeeking} = useMediaProgress({
		mediaRef,
		initialDuration,
	});

	const {volume, isMuted, setVolume, toggleMute} = useMediaVolume({
		mediaRef,
	});

	const speedOptions = useMemo(() => [1, 1.2, 1.4, 2] as const, []);
	const effectivePlaybackRate = state.playbackRate > 0 ? state.playbackRate : 1;
	const currentSpeedIndex = useMemo(() => {
		const epsilon = 0.01;
		const index = speedOptions.findIndex((speed) => Math.abs(speed - effectivePlaybackRate) <= epsilon);
		return index === -1 ? 0 : index;
	}, [effectivePlaybackRate, speedOptions]);
	const speedLabel = useMemo(() => `x${speedOptions[currentSpeedIndex]}`, [currentSpeedIndex, speedOptions]);
	const [isSpeedShadeActive, setIsSpeedShadeActive] = useState(false);
	const speedShadeTimerRef = useRef<number | null>(null);

	const hasAutoPlayedRef = useRef(false);
	useEffect(() => {
		if (hasStarted && !hasAutoPlayedRef.current) {
			hasAutoPlayedRef.current = true;
			if (waveSeekBootstrapRef.current) {
				return undefined;
			}
			const timer = setTimeout(() => {
				play();
			}, 0);
			return () => clearTimeout(timer);
		}
		return undefined;
	}, [hasStarted, play]);

	useEffect(() => {
		if (!isVoiceMessage || !src) {
			setVoiceEnvelope([]);
			return;
		}

		const decodedWaveform = decodeVoiceWaveform(waveform);
		setVoiceEnvelope(decodedWaveform ?? []);
	}, [isVoiceMessage, src, waveform]);

	useEffect(() => {
		if (!isVoiceMessage) {
			setWaveBarCount(56);
			return;
		}

		const element = voiceWaveRef.current;
		if (!element || typeof ResizeObserver === 'undefined') {
			setWaveBarCount(isMobileLayout ? 52 : 56);
			return;
		}

		const updateBarCount = (width: number) => {
			const safeWidth = Math.max(1, width);
			const gapPx = 1;
			const minBarWidthPx = 2;
			const maxBarsByWidth = Math.max(10, Math.floor((safeWidth + gapPx) / (minBarWidthPx + gapPx)));
			const targetBars = Math.floor(
				safeWidth / (isMobileLayout ? (safeWidth < 300 ? 4.2 : 3.9) : safeWidth < 300 ? 5.6 : 4.6),
			);
			const maxBars = isMobileLayout ? 68 : 72;
			const minBars = Math.min(isMobileLayout ? 26 : 10, maxBarsByWidth);
			const next = Math.max(minBars, Math.min(maxBars, Math.min(maxBarsByWidth, targetBars)));
			setWaveBarCount((current) => (current === next ? current : next));
		};

		updateBarCount(element.clientWidth);

		const observer = new ResizeObserver((entries) => {
			const entry = entries[0];
			if (!entry) return;
			updateBarCount(entry.contentRect.width);
		});

		observer.observe(element);
		return () => observer.disconnect();
	}, [isMobileLayout, isVoiceMessage]);

	useEffect(() => {
		return () => {
			if (speedShadeTimerRef.current != null) {
				window.clearTimeout(speedShadeTimerRef.current);
				speedShadeTimerRef.current = null;
			}
		};
	}, []);

	const displayDuration = initialDuration || duration;

	useEffect(() => {
		if (pendingSeekRatio == null || !hasStarted) {
			return;
		}

		const media = mediaRef.current;
		if (!media) {
			return;
		}

		const durationValue = media.duration;
		if (!Number.isFinite(durationValue) || durationValue <= 0) {
			return;
		}

		media.currentTime = Math.max(0, Math.min(durationValue, durationValue * pendingSeekRatio));
		setPendingSeekRatio(null);
		waveSeekBootstrapRef.current = false;
	}, [hasStarted, mediaRef, pendingSeekRatio]);

	const applyPendingWaveSeek = useCallback(() => {
		const element = mediaRef.current;
		if (!element || pendingSeekRatio == null) {
			return false;
		}

		const durationValue = element.duration;
		if (!Number.isFinite(durationValue) || durationValue <= 0) {
			return false;
		}

		element.currentTime = Math.max(0, Math.min(durationValue, durationValue * pendingSeekRatio));
		setPendingSeekRatio(null);
		waveSeekBootstrapRef.current = false;
		return true;
	}, [mediaRef, pendingSeekRatio]);

	const {name: fileName, extension: fileExtension} = extension
		? {name: title, extension: `.${extension}`}
		: splitFilename(title);

	const metaString = fileSize
		? `${formatFileSize(fileSize)}${displayDuration ? ` - ${formatTime(displayDuration)}` : ''}`
		: displayDuration
			? formatTime(displayDuration)
			: '';
	const voiceMetaString = displayDuration
		? state.isPlaying || currentTime > 0
			? `${formatTime(currentTime)} / ${formatTime(displayDuration)}`
			: formatTime(displayDuration)
		: formatTime(currentTime);
	const headerWaveBars = useMemo(() => {
		const barCount = waveBarCount;
		const normalizedProgress = Math.max(0, Math.min(1, progress / 100));
		if (voiceEnvelope.length === 0) {
			return Array.from({length: barCount}, (_, index) => ({
				id: index,
				height: 6,
				silent: false,
				played: normalizedProgress >= (index + 1) / barCount,
			}));
		}

		return Array.from({length: barCount}, (_, index) => {
			const startRatio = index / barCount;
			const endRatio = (index + 1) / barCount;
			const start = Math.floor(startRatio * voiceEnvelope.length);
			const end = Math.max(start + 1, Math.floor(endRatio * voiceEnvelope.length));
			let sum = 0;
			for (let i = start; i < end; i += 1) {
				sum += voiceEnvelope[i] ?? 0;
			}
			const amplitude = sum / Math.max(1, end - start);
			const gated = amplitude < 0.035 ? 0 : amplitude;
			const silent = gated < 0.08;
			return {
				id: index,
				height: silent ? 5 : Math.max(3, Math.round(gated * 18)),
				silent,
				played: normalizedProgress >= endRatio,
			};
		});
	}, [progress, voiceEnvelope, waveBarCount]);

	const handlePlayClick = useCallback(
		(e: React.MouseEvent) => {
			e.preventDefault();
			e.stopPropagation();
			if (!hasStarted) {
				setHasStarted(true);
			} else {
				toggle();
			}
		},
		[hasStarted, toggle],
	);

	const handleSeek = useCallback(
		(percentage: number) => {
			seekToPercentage(percentage);
		},
		[seekToPercentage],
	);

	const seekFromWavePosition = useCallback(
		(clientX: number, element: HTMLButtonElement) => {
			const rect = element.getBoundingClientRect();
			if (rect.width <= 0) {
				return;
			}

			const x = clientX - rect.left;
			const ratio = Math.max(0, Math.min(1, x / rect.width));

			if (!hasStarted) {
				waveSeekBootstrapRef.current = true;
				setPendingSeekRatio(ratio);
				setHasStarted(true);
				return;
			}

			seekToPercentage(ratio * 100);
		},
		[hasStarted, seekToPercentage],
	);

	const handleVoiceWavePointerDown = useCallback(
		(event: React.PointerEvent<HTMLButtonElement>) => {
			if (!isVoiceMessage) {
				return;
			}
			if (event.pointerType === 'mouse' && event.button !== 0) {
				return;
			}

			event.preventDefault();
			event.stopPropagation();

			wavePointerIdRef.current = event.pointerId;
			startSeeking();
			event.currentTarget.setPointerCapture(event.pointerId);
			seekFromWavePosition(event.clientX, event.currentTarget);
		},
		[isVoiceMessage, seekFromWavePosition, startSeeking],
	);

	const handleVoiceWavePointerMove = useCallback(
		(event: React.PointerEvent<HTMLButtonElement>) => {
			if (wavePointerIdRef.current !== event.pointerId) {
				return;
			}
			event.preventDefault();
			seekFromWavePosition(event.clientX, event.currentTarget);
		},
		[seekFromWavePosition],
	);

	const handleVoiceWavePointerUp = useCallback(
		(event: React.PointerEvent<HTMLButtonElement>) => {
			if (wavePointerIdRef.current !== event.pointerId) {
				return;
			}

			if (event.currentTarget.hasPointerCapture(event.pointerId)) {
				event.currentTarget.releasePointerCapture(event.pointerId);
			}
			wavePointerIdRef.current = null;
			endSeeking();

			if (hasStarted && !state.isPlaying) {
				play();
			}
		},
		[endSeeking, hasStarted, play, state.isPlaying],
	);

	const handleVoiceWavePointerCancel = useCallback(
		(event: React.PointerEvent<HTMLButtonElement>) => {
			if (wavePointerIdRef.current !== event.pointerId) {
				return;
			}
			if (event.currentTarget.hasPointerCapture(event.pointerId)) {
				event.currentTarget.releasePointerCapture(event.pointerId);
			}
			wavePointerIdRef.current = null;
			endSeeking();
		},
		[endSeeking],
	);

	const handleAudioLoadedMetadata = useCallback(() => {
		if (applyPendingWaveSeek() && !state.isPlaying) {
			play();
		}
	}, [applyPendingWaveSeek, play, state.isPlaying]);

	const handleSpeedToggle = useCallback(
		(event: React.MouseEvent) => {
			event.preventDefault();
			event.stopPropagation();
			const nextIndex = (currentSpeedIndex + 1) % speedOptions.length;
			setPlaybackRate(speedOptions[nextIndex]);
			setIsSpeedShadeActive(false);
			if (speedShadeTimerRef.current != null) {
				window.clearTimeout(speedShadeTimerRef.current);
			}
			setIsSpeedShadeActive(true);
			speedShadeTimerRef.current = window.setTimeout(() => {
				setIsSpeedShadeActive(false);
				speedShadeTimerRef.current = null;
			}, 220);
		},
		[currentSpeedIndex, setPlaybackRate, speedOptions],
	);

	return (
		<div
			ref={containerRef}
			className={clsx(
				styles.container,
				isVoiceMessage && styles.voiceContainer,
				isVoiceMessage && isMobileLayout && styles.voiceContainerMobile,
				className,
			)}
			onContextMenu={onContextMenu}
			role="group"
			aria-label={isVoiceMessage ? t`Voice Message Player` : t`Audio Player`}
		>
			{/* biome-ignore lint/a11y/useMediaCaption: Audio player doesn't require captions */}
			<audio
				ref={mediaRef as React.RefObject<HTMLAudioElement>}
				src={hasStarted ? src : undefined}
				preload="none"
				data-inline-audio-player
				onLoadedMetadata={handleAudioLoadedMetadata}
			/>

			<div className={styles.header}>
				{!isVoiceMessage && (
					<>
						<div className={clsx(styles.iconContainer, isVoiceMessage && styles.voiceIconContainer)}>
							<span className={styles.audioGlyph} />
						</div>

						<div className={styles.fileInfo}>
							<p className={styles.fileName}>
								<span className={styles.fileNameTruncate}>{fileName}</span>
								<span className={styles.fileExtension}>{fileExtension}</span>
							</p>
							{metaString && <p className={styles.fileMeta}>{metaString}</p>}
						</div>
					</>
				)}
				{isVoiceMessage && (
					<div className={styles.voiceHeader}>
						<button
							ref={voiceWaveRef}
							type="button"
							className={clsx(styles.voiceHeaderWave, isMobileLayout && styles.voiceHeaderWaveMobile)}
							aria-label={t`Seek voice message`}
							onPointerDown={handleVoiceWavePointerDown}
							onPointerMove={handleVoiceWavePointerMove}
							onPointerUp={handleVoiceWavePointerUp}
							onPointerCancel={handleVoiceWavePointerCancel}
						>
							{headerWaveBars.map((bar) => (
								<span
									key={bar.id}
									className={clsx(
										styles.voiceHeaderBar,
										isMobileLayout && styles.voiceHeaderBarMobile,
										bar.silent && styles.voiceHeaderBarSilent,
										bar.played && styles.voiceHeaderBarPlayed,
									)}
									style={{height: `${bar.height}px`}}
								/>
							))}
						</button>
						{voiceMetaString && (
							<span className={clsx(styles.voiceHeaderMeta, isMobileLayout && styles.voiceHeaderMetaMobile)}>
								{voiceMetaString}
							</span>
						)}
						<button
							type="button"
							onClick={handleSpeedToggle}
							className={clsx(styles.voiceSpeedPill, isSpeedShadeActive && styles.voiceSpeedPillShade)}
							aria-label={t`Change playback speed`}
						>
							<span className={styles.voiceSpeedPillValue}>{speedLabel}</span>
						</button>
					</div>
				)}

				<button
					type="button"
					onClick={handlePlayClick}
					className={clsx(styles.playButton, isVoiceMessage && styles.voicePlayButton)}
					aria-label={state.isPlaying ? t`Pause` : t`Play`}
				>
					{state.isPlaying ? <PauseIcon size={20} weight="fill" /> : <PlayIcon size={20} weight="fill" />}
				</button>
			</div>

			{!isVoiceMessage && (
				<div className={styles.progressSection}>
					<MediaProgressBar
						progress={progress}
						buffered={buffered}
						currentTime={currentTime}
						duration={displayDuration}
						onSeek={handleSeek}
						onSeekStart={startSeeking}
						onSeekEnd={endSeeking}
						compact
						className={styles.progressBar}
					/>
					<span className={styles.time}>
						{formatTime(currentTime)} / {formatTime(displayDuration)}
					</span>
				</div>
			)}

			{!isVoiceMessage && (
				<div className={styles.controls}>
					<div className={styles.controlsLeft}>
						<MediaVolumeControl
							volume={volume}
							isMuted={isMuted}
							onVolumeChange={setVolume}
							onToggleMute={toggleMute}
							compact
							iconSize={18}
							className={styles.volumeControl}
						/>
					</div>

					<div className={styles.controlsRight}>
						{canFavorite && onFavoriteClick && (
							<Tooltip text={isFavorited ? t`Remove from favorites` : t`Add to favorites`} position="top">
								<button
									type="button"
									onClick={(e) => onFavoriteClick(e)}
									className={styles.actionButton}
									aria-label={isFavorited ? t`Remove from favorites` : t`Add to favorites`}
								>
									<StarIcon size={18} weight={isFavorited ? 'fill' : 'regular'} />
								</button>
							</Tooltip>
						)}

						{onDownloadClick && (
							<Tooltip text={t`Download`} position="top">
								<button
									type="button"
									onClick={(e) => onDownloadClick(e)}
									className={styles.actionButton}
									aria-label={t`Download`}
								>
									<DownloadSimpleIcon size={18} weight="bold" />
								</button>
							</Tooltip>
						)}
					</div>
				</div>
			)}
		</div>
	);
}

