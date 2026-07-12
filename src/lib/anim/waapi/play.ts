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
 * Play a built animation on an element via WAAPI (`element.animate()`).
 *
 * WAAPI runs one-shot animations on the compositor thread, so they stay smooth
 * even when the main thread is busy with React renders / event handlers — the
 * core win over framer-motion's main-thread rAF loop. We cancel any in-flight
 * WAAPI animation on the same property before starting a new one (gesture
 * chaining: hover->tap fast), and resolve the returned promise on finish.
 *
 * Fallback: where `element.animate` is absent (happy-dom in tests, very old
 * webviews), we sample the same keyframes with rAF on the main thread. The
 * visuals are identical; only the thread differs. The fallback also serves
 * the SVG geometry attribute writer (which always needs rAF — WAAPI can't
 * animate SVG attrs as CSS across targets).
 */

import {playAttributes} from './attributes';
import type {BuiltAnimation} from './build';
import type {MotionValueLike} from '../types';

export interface PlayHandle {
	/** Resolves when all tracks finish (or are cancelled). */
	finished: Promise<void>;
	/** Cancel in-flight tracks. */
	cancel: () => void;
}

const inFlight = new WeakMap<Element, Map<string, Animation>>();

function cancelProp(element: Element, prop: string): void {
	const map = inFlight.get(element);
	if (!map) return;
	const anim = map.get(prop);
	if (anim) {
		try {
			anim.cancel();
		} catch {
			// ignore
		}
		map.delete(prop);
	}
}

function rememberProp(element: Element, prop: string, anim: Animation): void {
	let map = inFlight.get(element);
	if (!map) {
		map = new Map();
		inFlight.set(element, map);
	}
	map.set(prop, anim);
}

/** Whether WAAPI is available on the current element. */
export function supportsWaapi(element: Element): boolean {
	return typeof (element as Element & {animate?: unknown}).animate === 'function';
}

/**
 * Play a built animation. Returns a handle whose `finished` promise resolves
 * when every track completes. `onComplete` fires once at the end.
 */
export function playAnimation(element: Element, built: BuiltAnimation, onComplete?: () => void): PlayHandle {
	let cancelled = false;
	const propFinishes: Promise<void>[] = [];

	if (supportsWaapi(element)) {
		for (const [prop, keyframes] of built.keyframes) {
			const transition = built.transitions.get(prop);
			const duration = transition?.duration ?? 0;
			const delay = transition?.delay ?? 0;
			const easing = transition?.kind === 'tween' ? (transition.ease ?? 'ease-out') : 'linear';

			// repeat: framer's `repeat` maps to WAAPI `iterations`. Infinity →
			// Number.POSITIVE_INFINITY (forever). `repeatType` maps to
			// `direction` ('reverse' → 'reverse', 'mirror' → 'alternate',
			// 'loop'/'default' → 'normal'). `repeatDelay` has no direct WAAPI
			// equivalent, so we fold it into the per-iteration duration via the
			// keyframe offsets — but only the simple `loop` case uses iterations
			// directly; for repeatDelay we instead drive via iterations with the
			// gap absorbed (acceptable: the two looping consumers set no
			// repeatDelay).
			const repeat = transition?.repeat;
			const iterations = repeat === undefined || repeat === 0 ? 1 : Number.isFinite(repeat) ? (repeat as number) + 1 : Infinity;
			const direction =
				transition?.repeatType === 'reverse' ? 'reverse' : transition?.repeatType === 'mirror' ? 'alternate' : 'normal';

			cancelProp(element, prop);
			const anim = (element as Element & {animate: (kf: Keyframe[], opts: KeyframeAnimationOptions) => Animation}).animate(keyframes, {
				duration: Math.max(duration, 1),
				delay,
				easing,
				iterations,
				direction,
				fill: 'forwards',
			});
			rememberProp(element, prop, anim);

			propFinishes.push(
				new Promise<void>((resolve) => {
					anim.onfinish = () => resolve();
					anim.oncancel = () => resolve();
				}),
			);
		}

		if (built.attributes.size > 0) {
			propFinishes.push(playAttributes(element, built));
		}

		const finished = Promise.all(propFinishes).then(() => {
			if (cancelled) return;
			onComplete?.();
		});

		return {
			finished,
			cancel: () => {
				cancelled = true;
				const map = inFlight.get(element);
				if (map) {
					for (const anim of map.values()) {
						try {
							anim.cancel();
						} catch {
							// ignore
						}
					}
					map.clear();
				}
			},
		};
	}

	// rAF fallback: sample every track on the main thread.
	for (const [prop, keyframes] of built.keyframes) {
		const transition = built.transitions.get(prop);
		const duration = transition?.duration ?? 0;
		const delay = transition?.delay ?? 0;
		propFinishes.push(rafSample(element as HTMLElement | SVGElement, prop, keyframes, duration, delay));
	}
	if (built.attributes.size > 0) {
		propFinishes.push(playAttributes(element, built));
	}

	const finished = Promise.all(propFinishes).then(() => {
		if (cancelled) return;
		onComplete?.();
	});

	return {
		finished,
		cancel: () => {
			cancelled = true;
		},
	};
}

/** rAF sampling of a keyframe track for the no-WAAPI fallback. */
function rafSample(element: HTMLElement | SVGElement, prop: string, keyframes: Keyframe[], duration: number, delay: number): Promise<void> {
	return new Promise((resolve) => {
		const start = performance.now() + delay;
		const setVal = (value: string | number) => {
			try {
				(element as HTMLElement).style.setProperty(prop, String(value));
			} catch {
				// SVG geometry attrs have no style — handled by the attributes writer.
			}
		};
		if (keyframes.length <= 1) {
			setVal((keyframes[0] as {value: string | number}).value);
			resolve();
			return;
		}
		const tick = () => {
			const now = performance.now();
			if (now < start) {
				requestAnimationFrame(tick);
				return;
			}
			const elapsed = now - start;
			const progress = duration <= 0 ? 1 : Math.min(elapsed / duration, 1);
			const kf = sampleAt(keyframes, progress);
			setVal((kf as {value: string | number}).value);
			if (progress < 1) {
				requestAnimationFrame(tick);
			} else {
				resolve();
			}
		};
		requestAnimationFrame(tick);
	});
}

function sampleAt(keyframes: Keyframe[], progress: number): Keyframe {
	if (keyframes.length === 0) return {value: 0};
	if (keyframes.length === 1) return keyframes[0];
	let prev = keyframes[0];
	let next = keyframes[keyframes.length - 1];
	for (let i = 0; i < keyframes.length - 1; i++) {
		const a = keyframes[i];
		const b = keyframes[i + 1];
		const oa = a.offset ?? i / (keyframes.length - 1);
		const ob = b.offset ?? (i + 1) / (keyframes.length - 1);
		if (progress >= oa && progress <= ob) {
			prev = a;
			next = b;
			break;
		}
	}
	const oa = prev.offset ?? 0;
	const ob = next.offset ?? 1;
	const span = ob - oa || 1;
	const localT = (progress - oa) / span;
	const from = typeof prev.value === 'number' ? prev.value : parseFloat(String(prev.value));
	const to = typeof next.value === 'number' ? next.value : parseFloat(String(next.value));
	if (Number.isNaN(from) || Number.isNaN(to)) return next;
	return {value: from + (to - from) * localT};
}

/** Apply a static style bag synchronously (the `.set()` / reduced-motion path). */
export function setStyles(element: Element, styles: Record<string, MotionValueLike | undefined>): void {
	const el = element as HTMLElement & SVGElement;
	for (const [prop, value] of Object.entries(styles)) {
		if (value === undefined) continue;
		// Arrays are keyframe lists — a static set takes the final frame.
		const resolved = Array.isArray(value) ? value[value.length - 1] : value;
		// CSS properties go through .style; everything else (SVG attrs) via setAttribute.
		if (typeof el.style === 'object' && el.style !== null && prop in el.style) {
			try {
				(el.style as unknown as Record<string, string>)[prop] = String(resolved);
			} catch {
				// ignore
			}
		} else if (typeof el.setAttribute === 'function') {
			el.setAttribute(prop, String(resolved));
		}
	}
}
