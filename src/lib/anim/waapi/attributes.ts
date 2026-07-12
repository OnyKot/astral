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
 * rAF writer for SVG geometry attributes.
 *
 * WAAPI can't animate SVG geometry attributes (x, y, width, height, rx, ry,
 * cx, cy, r) as CSS across targets, so for the one consumer that does this
 * (BaseAvatar's typing-indicator rect/circle), we fall back to a short rAF
 * loop that writes `setAttribute` each frame. Sub-second, two elements only —
 * the main-thread cost is negligible, and it's the correct tool for the job.
 *
 * Springs are sampled via the same solver; tweens are linear-interpolated.
 */

import {getCachedSpring} from '../springs/cache';
import {solveSpring} from '../springs/solver';
import type {BuiltAnimation} from './build';

/** Play all SVG geometry attribute tracks in a built animation. Resolves when done. */
export function playAttributes(element: Element, built: BuiltAnimation): Promise<void> {
	const tracks = Array.from(built.attributes.entries());
	if (tracks.length === 0) return Promise.resolve();

	const el = element as SVGElement;
	const promises: Promise<void>[] = [];

	for (const [prop, {from, to, transition}] of tracks) {
		const fromN = typeof from === 'number' ? from : parseFloat(String(from));
		const toN = typeof to === 'number' ? to : parseFloat(String(to));
		const duration = transition.duration;
		const delay = transition.delay;

		if (transition.kind === 'spring') {
			const result = getCachedSpring(
				{
					from: fromN,
					to: toN,
					config: {
						stiffness: transition.stiffness ?? 100,
						damping: transition.damping ?? 10,
						mass: transition.mass ?? 1,
						velocity: transition.velocity ?? 0,
						restDelta: transition.restDelta ?? 0.001,
						restSpeed: transition.restSpeed ?? 0.001,
						fps: 120,
					},
				},
				(k) => solveSpring(k.from, k.to, k.config),
			);
			promises.push(animateSpringAttr(el, prop, result.samples, result.fps, delay));
		} else {
			promises.push(animateTweenAttr(el, prop, fromN, toN, duration, delay));
		}
	}

	return Promise.all(promises).then(() => undefined);
}

function animateSpringAttr(el: SVGElement, prop: string, samples: number[], fps: number, delay: number): Promise<void> {
	return new Promise((resolve) => {
		const frameMs = 1000 / fps;
		const start = performance.now() + delay;
		const tick = () => {
			const now = performance.now();
			if (now < start) {
				requestAnimationFrame(tick);
				return;
			}
			const elapsed = now - start;
			const frameIndex = Math.min(Math.floor(elapsed / frameMs), samples.length - 1);
			el.setAttribute(prop, String(samples[frameIndex]));
			if (frameIndex >= samples.length - 1) {
				resolve();
			} else {
				requestAnimationFrame(tick);
			}
		};
		requestAnimationFrame(tick);
	});
}

function animateTweenAttr(el: SVGElement, prop: string, from: number, to: number, duration: number, delay: number): Promise<void> {
	return new Promise((resolve) => {
		if (duration <= 0) {
			el.setAttribute(prop, String(to));
			resolve();
			return;
		}
		const start = performance.now() + delay;
		const tick = () => {
			const now = performance.now();
			if (now < start) {
				requestAnimationFrame(tick);
				return;
			}
			const elapsed = now - start;
			const progress = Math.min(elapsed / duration, 1);
			el.setAttribute(prop, String(from + (to - from) * progress));
			if (progress < 1) {
				requestAnimationFrame(tick);
			} else {
				resolve();
			}
		};
		requestAnimationFrame(tick);
	});
}
