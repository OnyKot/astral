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

import {Trans, useLingui} from '@lingui/react/macro';
import {observer} from 'mobx-react-lite';
import React from 'react';
import * as VoiceSettingsActionCreators from '~/actions/VoiceSettingsActionCreators';
import {Switch} from '~/components/form/Switch';
import {Slider} from '~/components/uikit/Slider';
import type VoiceSettingsStore from '~/stores/VoiceSettingsStore';
import {VAD_MAX_THRESHOLD_DB, VAD_MIN_THRESHOLD_DB} from '~/stores/VoiceSettingsStore';
import {VoiceActivityDetector} from '~/utils/voice/VoiceActivityDetector';
import styles from './VoiceActivitySection.module.css';

interface VoiceActivitySectionProps {
	settings: typeof VoiceSettingsStore;
}

const dbToFraction = (db: number): number => {
	if (!Number.isFinite(db)) return 0;
	const clamped = Math.max(VAD_MIN_THRESHOLD_DB, Math.min(VAD_MAX_THRESHOLD_DB, db));
	return (clamped - VAD_MIN_THRESHOLD_DB) / (VAD_MAX_THRESHOLD_DB - VAD_MIN_THRESHOLD_DB);
};

const thresholdToSliderValue = (db: number): number => VAD_MAX_THRESHOLD_DB - db;
const sliderValueToThreshold = (value: number): number => VAD_MAX_THRESHOLD_DB - value;
const sliderValueToLabel = (value: number): string => `${sliderValueToThreshold(value)} dB`;

export const VoiceActivitySection: React.FC<VoiceActivitySectionProps> = observer(({settings}) => {
	const {t} = useLingui();
	const threshold = settings.voiceActivityThreshold;
	const auto = settings.voiceActivityAutoThreshold;

	const meterFillRef = React.useRef<HTMLDivElement | null>(null);
	const meterRef = React.useRef<HTMLDivElement | null>(null);
	const detectorRef = React.useRef<VoiceActivityDetector | null>(null);
	const streamRef = React.useRef<MediaStream | null>(null);
	const smoothedLevelRef = React.useRef(VAD_MIN_THRESHOLD_DB);
	const [speaking, setSpeaking] = React.useState(false);

	const inputDeviceId = settings.inputDeviceId;
	const echoCancellation = settings.echoCancellation;
	const noiseSuppression = settings.noiseSuppression;
	const autoGainControl = settings.autoGainControl;

	React.useEffect(() => {
		let cancelled = false;

		const startMeter = async () => {
			try {
				const stream = await navigator.mediaDevices.getUserMedia({
					audio: {
						deviceId: inputDeviceId !== 'default' ? {ideal: inputDeviceId} : undefined,
						echoCancellation,
						noiseSuppression,
						autoGainControl,
					},
				});
				if (cancelled) {
					stream.getTracks().forEach((track) => track.stop());
					return;
				}
				streamRef.current = stream;
				const detector = new VoiceActivityDetector(
					{thresholdDb: threshold, auto},
					{
						onLevel: (db) => {
							const safeDb = Number.isFinite(db) ? db : VAD_MIN_THRESHOLD_DB;
							const previous = smoothedLevelRef.current;
							const alpha = safeDb > previous ? 0.22 : 0.08;
							const smoothedDb = previous + (safeDb - previous) * alpha;
							smoothedLevelRef.current = smoothedDb;
							if (meterFillRef.current) {
								meterFillRef.current.style.transform = `scaleX(${dbToFraction(smoothedDb)})`;
							}
						},
						onSpeakingChange: (isSpeaking) => setSpeaking(isSpeaking),
					},
				);
				detectorRef.current = detector;
				await detector.start(stream);
			} catch {
				// Meter is best-effort; a denied mic just leaves it idle.
			}
		};

		void startMeter();

		return () => {
			cancelled = true;
			detectorRef.current?.stop();
			detectorRef.current = null;
			if (streamRef.current) {
				streamRef.current.getTracks().forEach((track) => track.stop());
				streamRef.current = null;
			}
		};
		// Re-acquire the meter capture when the device/processing settings change.
	}, [inputDeviceId, echoCancellation, noiseSuppression, autoGainControl]);

	React.useEffect(() => {
		detectorRef.current?.setOptions({thresholdDb: threshold, auto});
	}, [threshold, auto]);

	const thresholdFraction = dbToFraction(threshold);

	return (
		<div className={styles.section}>
			<div className={styles.header}>
				<div className={styles.title}>
					<Trans>Input Sensitivity</Trans>
				</div>
				<Switch
					label={<Trans>Automatically determine input sensitivity</Trans>}
					value={auto}
					onChange={(value) => VoiceSettingsActionCreators.update({voiceActivityAutoThreshold: value})}
					ariaLabel={t`Automatically determine input sensitivity`}
				/>
			</div>

			<div
				ref={meterRef}
				className={`${styles.meter} ${speaking ? styles.meterActive : ''}`}
				role="meter"
				aria-label={t`Microphone input level`}
			>
				<div ref={meterFillRef} className={styles.meterFill} />
				{!auto && (
					<div
						className={styles.thresholdMarker}
						style={{left: `${thresholdFraction * 100}%`}}
						aria-hidden={true}
					/>
				)}
			</div>

			{auto ? (
				<p className={styles.hint}>
					<Trans>Astral adjusts the threshold to your background noise. Turn this off to set it yourself.</Trans>
				</p>
			) : (
				<Slider
					defaultValue={thresholdToSliderValue(threshold)}
					factoryDefaultValue={thresholdToSliderValue(-50)}
					minValue={0}
					maxValue={Math.abs(VAD_MIN_THRESHOLD_DB)}
					step={1}
					markers={[0, 25, 50, 75, 100]}
					stickToMarkers={false}
					onMarkerRender={sliderValueToLabel}
					onValueRender={(value) => <Trans>{sliderValueToThreshold(value)} dB</Trans>}
					onValueChange={(value) =>
						VoiceSettingsActionCreators.update({voiceActivityThreshold: sliderValueToThreshold(value)})
					}
				/>
			)}
		</div>
	);
});
