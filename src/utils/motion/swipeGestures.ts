/*
 * Shared helpers for horizontal swipe gestures (reply, row actions, edge back).
 */

export const SWIPE_RELEASE_EASE = 'cubic-bezier(0.18, 0.88, 0.24, 1)';

export interface VelocitySample {
	x: number;
	y: number;
	timestamp: number;
}

export function applySwipeResistance(rawOffset: number, maxOffset: number, factor = 0.3): number {
	if (rawOffset <= maxOffset) {
		return rawOffset;
	}
	const overflow = rawOffset - maxOffset;
	return maxOffset + overflow * factor;
}

export function computeSwipeProgress(offset: number, threshold: number): number {
	if (threshold <= 0) {
		return 0;
	}
	return Math.min(1, Math.max(0, offset / threshold));
}

export interface SwipeCommitInput {
	offset: number;
	threshold: number;
	velocity: number;
	minFlickOffset?: number;
	minFlickVelocity?: number;
}

export function shouldCommitSwipe({
	offset,
	threshold,
	velocity,
	minFlickOffset,
	minFlickVelocity = 0.52,
}: SwipeCommitInput): boolean {
	const flickOffset = minFlickOffset ?? threshold * 0.68;
	return offset >= threshold || (offset >= flickOffset && velocity >= minFlickVelocity);
}

export function trackVelocitySample(
	samples: VelocitySample[],
	x: number,
	y: number,
	maxSamples = 8,
): VelocitySample[] {
	return [...samples, {x, y, timestamp: performance.now()}].slice(-maxSamples);
}

export function computeAxisVelocity(samples: VelocitySample[], axis: 'x' | 'y', windowMs = 100): number {
	if (samples.length < 2) {
		return 0;
	}

	const now = performance.now();
	const recent = samples.filter((sample) => now - sample.timestamp <= windowMs);
	if (recent.length < 2) {
		return 0;
	}

	const first = recent[0];
	const last = recent[recent.length - 1];
	const dt = last.timestamp - first.timestamp;
	if (dt <= 0) {
		return 0;
	}

	return axis === 'x' ? (last.x - first.x) / dt : (last.y - first.y) / dt;
}

export function scheduleSwipeRelease(update: () => void): void {
	requestAnimationFrame(() => {
		requestAnimationFrame(update);
	});
}
