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
 * but WITHOUT ANY WARRANTY; without even implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with Astral. If not, see <https://www.gnu.org/licenses/>.
 */

/*
 * Spring physics solver.
 *
 * A damped harmonic oscillator: x'' = -k/m * (x - target) - c/m * v.
 * We integrate it with RK4 at a fixed sub-step (1ms) and sample at a fixed
 * frame rate (default 120 fps) so the result can be baked into a WAAPI
 * keyframe array with `easing: 'linear'` — the curve lives in the sampled
 * values, not in the CSS easing. That puts the animation on the compositor
 * thread (the whole point of this engine): no rAF on the main thread.
 *
 * Rest is declared when the position is within `restDelta` of the target and
 * the velocity is under `restSpeed` for a few consecutive samples, so the
 * sampled duration tracks the real settle time instead of a fixed guess.
 */

import {getCachedSpring} from './cache';

export interface SpringConfig {
	stiffness: number;
	damping: number;
	mass: number;
	/** Initial velocity (units/sec). Usually 0 for entrance anims. */
	velocity?: number;
	/** Stop when |x - target| < restDelta AND |v| < restSpeed. */
	restDelta?: number;
	restSpeed?: number;
	/** Sample rate (samples per second). Higher = smoother curve, bigger keyframe array. */
	fps?: number;
}

export interface SpringSample {
	t: number;
	value: number;
}

export interface SpringResult {
	/** Sampled value at each frame, t = i / fps. */
	samples: number[];
	/** Total duration in milliseconds (last sample time + one frame). */
	duration: number;
	/** Sample rate used. */
	fps: number;
	/** Final value (== target, clamped by rest detection). */
	to: number;
	from: number;
}

interface SpringState {
	position: number;
	velocity: number;
}

/** Acceleration at a given (position, velocity) for the damped oscillator. */
function acceleration(state: SpringState, target: number, cfg: SpringConfig): number {
	const k = cfg.stiffness;
	const c = cfg.damping;
	const m = cfg.mass;
	return (-k * (state.position - target) - c * state.velocity) / m;
}

/** One RK4 step of length `h` (seconds). */
function rk4Step(state: SpringState, target: number, cfg: SpringConfig, h: number): SpringState {
	const a1 = acceleration(state, target, cfg);
	const s1: SpringState = {position: state.position, velocity: state.velocity};

	const s2: SpringState = {
		position: state.position + (s1.velocity * h) / 2,
		velocity: state.velocity + (a1 * h) / 2,
	};
	const a2 = acceleration(s2, target, cfg);

	const s3: SpringState = {
		position: state.position + (s2.velocity * h) / 2,
		velocity: state.velocity + (a2 * h) / 2,
	};
	const a3 = acceleration(s3, target, cfg);

	const s4: SpringState = {
		position: state.position + s3.velocity * h,
		velocity: state.velocity + a3 * h,
	};
	const a4 = acceleration(s4, target, cfg);

	return {
		position: state.position + (h / 6) * (s1.velocity + 2 * s2.velocity + 2 * s3.velocity + s4.velocity),
		velocity: state.velocity + (h / 6) * (a1 + 2 * a2 + 2 * a3 + a4),
	};
}

/**
 * Solve a spring from `from` to `to`. Returns sampled values + duration.
 * Over-damped springs settle monotonically; under-damped springs overshoot
 * (the overshoot emerges naturally from the integration — no special-casing).
 *
 * Results are memoized by signature (see `cache.ts`) so the 40+ staggered
 * elements in VoiceConnectionStatus don't re-integrate the same curve each.
 */
export function solveSpring(from: number, to: number, cfg: SpringConfig): SpringResult {
	return getCachedSpring({from, to, config: cfg}, (k) => solveSpringUncached(k.from, k.to, k.config));
}

/** The actual RK4 integration — called on cache miss. */
function solveSpringUncached(from: number, to: number, cfg: SpringConfig): SpringResult {
	const fps = cfg.fps ?? 120;
	const restDelta = cfg.restDelta ?? 0.001;
	const restSpeed = cfg.restSpeed ?? 0.001;
	const initialVelocity = cfg.velocity ?? 0;

	const frameDt = 1 / fps; // seconds between samples
	const subSteps = Math.max(1, Math.round(frameDt / (1 / 1000))); // sub-step to ~1ms
	const h = frameDt / subSteps;

	let state: SpringState = {position: from, velocity: initialVelocity};
	const samples: number[] = [from];

	// Hard ceiling so a pathological config can't loop forever.
	const maxFrames = Math.ceil(fps * 10); // 10 seconds
	let restCount = 0;
	const restNeeded = 3;

	for (let i = 1; i <= maxFrames; i++) {
		for (let s = 0; s < subSteps; s++) {
			state = rk4Step(state, to, cfg, h);
		}
		samples.push(state.position);

		const distToTarget = Math.abs(state.position - to);
		const speed = Math.abs(state.velocity);
		if (distToTarget < restDelta && speed < restSpeed) {
			restCount++;
			if (restCount >= restNeeded) {
				// Snap the tail to the exact target so the final keyframe is clean.
				samples[samples.length - 1] = to;
				break;
			}
		} else {
			restCount = 0;
		}
	}

	const lastFrame = samples.length - 1;
	const duration = (lastFrame / fps) * 1000;

	return {samples, duration, fps, to, from};
}
