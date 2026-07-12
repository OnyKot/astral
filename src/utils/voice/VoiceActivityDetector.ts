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

/**
 * Lightweight client-side voice-activity detector.
 *
 * It analyses a microphone {@link MediaStream} with a Web Audio `AnalyserNode`,
 * computes the RMS level in dBFS every animation frame, and reports a boolean
 * "speaking" state with configurable attack/release timing (hangover) so the
 * mic gate does not chatter on every syllable.
 *
 * The detector never touches the transmitted track itself — callers decide what
 * to do with the `onSpeakingChange` signal (e.g. gate a LiveKit track).
 */

export interface VoiceActivityDetectorCallbacks {
	/** Instantaneous RMS level in dBFS (-Infinity..0). Fired every frame. */
	onLevel?: (db: number) => void;
	/** Fired only when the debounced speaking state flips. */
	onSpeakingChange?: (speaking: boolean) => void;
}

export interface VoiceActivityDetectorOptions {
	/** Manual gate threshold in dBFS. Ignored while `auto` is true. */
	thresholdDb: number;
	/** Auto-track the ambient noise floor and derive the threshold from it. */
	auto: boolean;
	/** Time the level must stay above threshold before opening the gate. */
	attackMs?: number;
	/** Hangover: keep the gate open this long after dropping below threshold. */
	releaseMs?: number;
}

const DEFAULT_ATTACK_MS = 40;
const DEFAULT_RELEASE_MS = 250;
// How far above the tracked noise floor the auto threshold sits.
const AUTO_MARGIN_DB = 14;
// Bounds so auto mode can never wedge the gate fully open or fully shut.
const AUTO_MIN_THRESHOLD_DB = -75;
const AUTO_MAX_THRESHOLD_DB = -20;
// Noise-floor smoothing: rises quickly toward louder quiet, decays slowly.
const NOISE_FLOOR_RISE = 0.15;
const NOISE_FLOOR_DECAY = 0.01;

export class VoiceActivityDetector {
	private audioContext: AudioContext | null = null;
	private analyser: AnalyserNode | null = null;
	private source: MediaStreamAudioSourceNode | null = null;
	private floatBuffer: Float32Array | null = null;
	private byteBuffer: Uint8Array | null = null;
	private canUseFloat = false;
	private rafId: number | null = null;

	private options: Required<VoiceActivityDetectorOptions>;
	private readonly callbacks: VoiceActivityDetectorCallbacks;

	private speaking = false;
	private aboveSince: number | null = null;
	private belowSince: number | null = null;
	private noiseFloorDb = -90;

	constructor(options: VoiceActivityDetectorOptions, callbacks: VoiceActivityDetectorCallbacks = {}) {
		this.options = {
			attackMs: DEFAULT_ATTACK_MS,
			releaseMs: DEFAULT_RELEASE_MS,
			...options,
		};
		this.callbacks = callbacks;
	}

	get isSpeaking(): boolean {
		return this.speaking;
	}

	setOptions(partial: Partial<VoiceActivityDetectorOptions>): void {
		this.options = {...this.options, ...partial};
	}

	async start(stream: MediaStream): Promise<void> {
		this.stop();

		const AudioContextClass = window.AudioContext || (window as unknown as {webkitAudioContext: typeof AudioContext}).webkitAudioContext;
		const audioContext = new AudioContextClass();
		this.audioContext = audioContext;

		if (audioContext.state === 'suspended') {
			await audioContext.resume().catch(() => {});
		}

		const analyser = audioContext.createAnalyser();
		analyser.fftSize = 1024;
		analyser.smoothingTimeConstant = 0.2;
		this.analyser = analyser;

		this.canUseFloat = typeof analyser.getFloatTimeDomainData === 'function';
		if (this.canUseFloat) {
			this.floatBuffer = new Float32Array(analyser.fftSize);
		} else {
			this.byteBuffer = new Uint8Array(analyser.fftSize);
		}

		this.source = audioContext.createMediaStreamSource(stream);
		this.source.connect(analyser);

		this.speaking = false;
		this.aboveSince = null;
		this.belowSince = null;
		this.noiseFloorDb = -90;

		this.tick();
	}

	stop(): void {
		if (this.rafId != null) {
			cancelAnimationFrame(this.rafId);
			this.rafId = null;
		}
		this.source?.disconnect();
		this.source = null;
		this.analyser?.disconnect();
		this.analyser = null;
		this.floatBuffer = null;
		this.byteBuffer = null;
		if (this.audioContext && this.audioContext.state !== 'closed') {
			void this.audioContext.close().catch(() => {});
		}
		this.audioContext = null;

		if (this.speaking) {
			this.speaking = false;
			this.callbacks.onSpeakingChange?.(false);
		}
		this.aboveSince = null;
		this.belowSince = null;
	}

	private computeLevelDb(): number {
		const analyser = this.analyser;
		if (!analyser) return Number.NEGATIVE_INFINITY;

		let sumOfSquares = 0;
		let count = 0;

		if (this.canUseFloat && this.floatBuffer) {
			analyser.getFloatTimeDomainData(this.floatBuffer as Float32Array<ArrayBuffer>);
			for (let i = 0; i < this.floatBuffer.length; i++) {
				const s = this.floatBuffer[i];
				sumOfSquares += s * s;
				count++;
			}
		} else if (this.byteBuffer) {
			analyser.getByteTimeDomainData(this.byteBuffer as Uint8Array<ArrayBuffer>);
			for (let i = 0; i < this.byteBuffer.length; i++) {
				const s = (this.byteBuffer[i] - 128) / 128;
				sumOfSquares += s * s;
				count++;
			}
		}

		const meanSquare = count > 0 ? sumOfSquares / count : 0;
		return meanSquare > 0 ? 10 * Math.log10(meanSquare) : Number.NEGATIVE_INFINITY;
	}

	private effectiveThreshold(levelDb: number): number {
		if (!this.options.auto) {
			return this.options.thresholdDb;
		}

		// Track the ambient noise floor while the gate is closed.
		if (!this.speaking && Number.isFinite(levelDb)) {
			const alpha = levelDb > this.noiseFloorDb ? NOISE_FLOOR_RISE : NOISE_FLOOR_DECAY;
			this.noiseFloorDb += (levelDb - this.noiseFloorDb) * alpha;
		}

		const derived = this.noiseFloorDb + AUTO_MARGIN_DB;
		return Math.max(AUTO_MIN_THRESHOLD_DB, Math.min(AUTO_MAX_THRESHOLD_DB, derived));
	}

	private tick = (): void => {
		const levelDb = this.computeLevelDb();
		this.callbacks.onLevel?.(levelDb);

		const threshold = this.effectiveThreshold(levelDb);
		const now = performance.now();
		const isAbove = Number.isFinite(levelDb) && levelDb >= threshold;

		if (isAbove) {
			this.belowSince = null;
			if (this.aboveSince == null) this.aboveSince = now;
			if (!this.speaking && now - this.aboveSince >= this.options.attackMs) {
				this.speaking = true;
				this.callbacks.onSpeakingChange?.(true);
			}
		} else {
			this.aboveSince = null;
			if (this.belowSince == null) this.belowSince = now;
			if (this.speaking && now - this.belowSince >= this.options.releaseMs) {
				this.speaking = false;
				this.callbacks.onSpeakingChange?.(false);
			}
		}

		this.rafId = requestAnimationFrame(this.tick);
	};
}
