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
 * Unit tests for the WAAPI animation engine.
 *
 * happy-dom doesn't ship `element.animate()`, so `src/test/setup.ts` installs
 * a fake whose `onfinish` fires on the next microtask — that lets us assert
 * exit-unmount + completion synchronously without waiting on rAF. The pure
 * modules (spring solver, keyframe/ease mapping, build) are tested directly
 * with no DOM timing concerns.
 */

import {act} from 'react';
import {createRoot} from 'react-dom/client';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import {AnimatePresence, motion, useMotionValue, useReducedMotion, type MotionValue} from './index';
import {clearSpringCache, springCacheSize} from './springs/cache';
import {solveSpring} from './springs/solver';
import {buildAnimation} from './waapi/build';
import {resolveEase} from './waapi/keyframes';

beforeEach(() => {
	clearSpringCache();
});

afterEach(() => {
	vi.restoreAllMocks();
});

/** Render React into a fresh container, returns (rerender, unmount). */
function renderTree(node: React.ReactNode): {container: HTMLElement; rerender: (n: React.ReactNode) => void; unmount: () => void} {
	const container = document.createElement('div');
	document.body.appendChild(container);
	const root = createRoot(container);
	act(() => {
		root.render(node);
	});
	return {
		container,
		rerender: (next) => act(() => root.render(next)),
		unmount: () =>
			act(() => {
				root.unmount();
				container.remove();
			}),
	};
}

/** Flush the microtask queue so the fake WAAPI's onfinish (and thus exit-complete) fires. */
function flushMicrotasks(): Promise<void> {
	return act(async () => {
		await Promise.resolve();
		await Promise.resolve();
	});
}

describe('spring solver', () => {
	it('over-damped spring settles monotonically to the target', () => {
		const result = solveSpring(0, 100, {stiffness: 100, damping: 40, mass: 1, fps: 120});
		const last = result.samples[result.samples.length - 1];
		expect(last).toBeCloseTo(100, 1);
		for (let i = 1; i < result.samples.length; i++) {
			expect(result.samples[i]).toBeGreaterThanOrEqual(result.samples[i - 1] - 0.001);
		}
	});

	it('under-damped spring overshoots the target', () => {
		const result = solveSpring(0, 100, {stiffness: 320, damping: 8, mass: 1, fps: 120});
		const max = Math.max(...result.samples);
		expect(max).toBeGreaterThan(100);
		const last = result.samples[result.samples.length - 1];
		expect(last).toBeCloseTo(100, 1);
	});

	it('terminates via rest detection (duration is finite, not the 10s ceiling)', () => {
		const result = solveSpring(0, 100, {stiffness: 200, damping: 26, mass: 1, fps: 120});
		expect(result.duration).toBeLessThan(3000);
		expect(result.samples.length).toBeLessThan(120 * 10);
	});

	it('final sample equals the target exactly (clean tail snap)', () => {
		const result = solveSpring(0, 42, {stiffness: 300, damping: 20, mass: 1, fps: 120});
		expect(result.samples[result.samples.length - 1]).toBe(42);
	});
});

describe('spring cache', () => {
	it('returns equal results for an identical signature and caches once', () => {
		const cfg = {stiffness: 280, damping: 22, mass: 1, fps: 120};
		const a = solveSpring(0, 50, cfg);
		const b = solveSpring(0, 50, cfg);
		expect(b.samples).toEqual(a.samples);
		expect(springCacheSize()).toBe(1);
	});

	it('caches distinct signatures separately', () => {
		solveSpring(0, 50, {stiffness: 280, damping: 22, mass: 1, fps: 120});
		solveSpring(0, 50, {stiffness: 500, damping: 30, mass: 1, fps: 120});
		expect(springCacheSize()).toBe(2);
	});
});

describe('resolveEase', () => {
	it('maps framer named eases to WAAPI easing strings', () => {
		expect(resolveEase('linear')).toBe('linear');
		expect(resolveEase('easeIn')).toBe('ease-in');
		expect(resolveEase('easeOut')).toBe('ease-out');
		expect(resolveEase('easeInOut')).toBe('ease-in-out');
	});

	it('maps cubic-bezier arrays', () => {
		expect(resolveEase([0.22, 1, 0.36, 1])).toBe('cubic-bezier(0.22, 1, 0.36, 1)');
		expect(resolveEase([0.4, 0, 0.2, 1])).toBe('cubic-bezier(0.4, 0, 0.2, 1)');
	});
});

describe('buildAnimation', () => {
	it('emits a transform track for x/y/scale tokens', () => {
		const el = document.createElement('div');
		const built = buildAnimation({opacity: 0, y: 24, scale: 0.9}, {opacity: 1, y: 0, scale: 1}, {element: el, reducedMotion: false, transition: {duration: 0.2, ease: 'easeOut'}});
		expect(built.keyframes.has('transform')).toBe(true);
		expect(built.keyframes.has('opacity')).toBe(true);
		const tf = built.keyframes.get('transform')!;
		expect(typeof (tf[0] as {value: unknown}).value).toBe('string');
	});

	it('collapses to duration 0 under reduced motion', () => {
		const el = document.createElement('div');
		const built = buildAnimation({opacity: 0}, {opacity: 1}, {element: el, reducedMotion: true, transition: {type: 'spring', stiffness: 280, damping: 22}});
		expect(built.transitions.get('opacity')?.duration).toBe(0);
	});

	it('converts pathLength to stroke-dasharray/dashoffset', () => {
		const svg = document.createElementNS('http://www.w3.org/2000/svg', 'path');
		const built = buildAnimation({pathLength: 0.2, opacity: 0.5}, {pathLength: 1, opacity: 1}, {element: svg, reducedMotion: false, transition: {duration: 0.7, ease: [0.22, 1, 0.36, 1]}});
		expect(built.keyframes.has('strokeDashoffset')).toBe(true);
		expect(built.keyframes.has('strokeDasharray')).toBe(true);
		const offset = built.keyframes.get('strokeDashoffset')!;
		const first = (offset[0] as {value: number}).value;
		const last = (offset[offset.length - 1] as {value: number}).value;
		expect(first).toBeCloseTo(80, 1);
		expect(last).toBeCloseTo(0, 1);
	});

	it('routes SVG geometry attrs to the attribute writer', () => {
		const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
		const built = buildAnimation({x: 0, width: 10}, {x: 20, width: 30}, {element: rect, reducedMotion: false, transition: {duration: 0.16, ease: 'easeOut'}});
		expect(built.attributes.has('x')).toBe(true);
		expect(built.attributes.has('width')).toBe(true);
		expect(built.keyframes.has('x')).toBe(false);
	});

	it('emits a keyframe list when the target value is an array', () => {
		const el = document.createElement('div');
		const built = buildAnimation({scale: 1}, {scale: [1, 1.2, 1]}, {element: el, reducedMotion: false, transition: {duration: 0.7, ease: 'easeInOut'}});
		const kf = built.keyframes.get('transform')!;
		// transform collapses the scale token into one track; the array target
		// yields a multi-frame list rather than a 2-point tween.
		expect(kf.length).toBeGreaterThan(2);
		const values = kf.map((k) => (k as {value: unknown}).value);
		expect(values[0]).toContain('scale(1)');
		expect(values[values.length - 1]).toContain('scale(1)');
	});

	it('emits a keyframe list for a string-array target like boxShadow rings', () => {
		const el = document.createElement('div');
		const built = buildAnimation({}, {boxShadow: ['a', 'b', 'c']}, {element: el, reducedMotion: false, transition: {duration: 1.6, ease: 'easeOut'}});
		const kf = built.keyframes.get('boxShadow')!;
		expect(kf.length).toBe(3);
		expect((kf[0] as {value: string}).value).toBe('a');
		expect((kf[2] as {value: string}).value).toBe('c');
	});

	it('carries repeat / repeatType through the resolved transition', () => {
		const el = document.createElement('div');
		const built = buildAnimation({opacity: 0}, {opacity: 1}, {element: el, reducedMotion: false, transition: {duration: 2.8, ease: 'easeInOut', repeat: Infinity, repeatType: 'mirror'}});
		const t = built.transitions.get('opacity')!;
		expect(t.repeat).toBe(Infinity);
		expect(t.repeatType).toBe('mirror');
	});
});

describe('useReducedMotion', () => {
	it('returns a boolean (or null when matchMedia is absent) and stays stable', () => {
		let captured: boolean | null = null;
		function Probe() {
			captured = useReducedMotion();
			return null;
		}
		const {unmount} = renderTree(<Probe />);
		// In a browser-like env (happy-dom) the client snapshot is used, so the
		// first render already yields a boolean. Under SSR it would be null.
		expect(typeof captured === 'boolean' || captured === null).toBe(true);
		unmount();
	});
});

describe('useMotionValue', () => {
	it('get/set and change subscription with unsubscribe', () => {
		let mv: MotionValue<number> | null = null;
		function Probe() {
			mv = useMotionValue(0);
			return null;
		}
		renderTree(<Probe />);
		expect(mv!.get()).toBe(0);
		const calls: number[] = [];
		const unsub = mv!.on('change', (v) => calls.push(v));
		mv!.set(5);
		mv!.set(10);
		expect(calls).toEqual([5, 10]);
		expect(mv!.get()).toBe(10);

		unsub();
		mv!.set(20);
		expect(calls).toEqual([5, 10]);
	});

	it('does not emit when set to the same value', () => {
		let mv: MotionValue<number> | null = null;
		function Probe() {
			mv = useMotionValue(7);
			return null;
		}
		renderTree(<Probe />);
		const calls: number[] = [];
		mv!.on('change', (v) => calls.push(v));
		mv!.set(7);
		expect(calls).toEqual([]);
	});
});

describe('AnimatePresence', () => {
	it('keeps a removed child mounted until its exit finishes, then unmounts', async () => {
		const onExitComplete = vi.fn();
		function App({show}: {show: boolean}) {
			return (
				<AnimatePresence onExitComplete={onExitComplete}>
					{show ? (
						<motion.div key="a" initial={{opacity: 0}} animate={{opacity: 1}} exit={{opacity: 0}} transition={{duration: 0.05, ease: 'linear'}}>
							here
						</motion.div>
					) : null}
				</AnimatePresence>
			);
		}
		const {container, rerender, unmount} = renderTree(<App show={true} />);
		expect(container.textContent).toContain('here');

		rerender(<App show={false} />);
		await flushMicrotasks();

		expect(container.textContent).not.toContain('here');
		expect(onExitComplete).toHaveBeenCalled();
		unmount();
	});

	it('initial={false} skips the enter animation on first mount', () => {
		function App() {
			return (
				<AnimatePresence initial={false}>
					<motion.div key="a" initial={{opacity: 0}} animate={{opacity: 1}} transition={{duration: 0.2}}>
						x
					</motion.div>
				</AnimatePresence>
			);
		}
		const {container, unmount} = renderTree(<App />);
		const el = container.firstChild as HTMLElement;
		expect(el.style.opacity).toBe('1');
		unmount();
	});

	it('passes custom to variant functions without crashing', () => {
		const animateSpy = vi.spyOn(HTMLElement.prototype, 'animate');
		const variants = {
			enter: (dir: number) => ({opacity: 0, x: dir > 0 ? 20 : -20}),
			center: {opacity: 1, x: 0},
			exit: (dir: number) => ({opacity: 0, x: dir > 0 ? -20 : 20}),
		};
		function App({dir}: {dir: number}) {
			return (
				<AnimatePresence mode="wait" custom={dir}>
					<motion.div key="a" variants={variants} custom={dir} initial="enter" animate="center" exit="exit" transition={{duration: 0.05}}>
						step
					</motion.div>
				</AnimatePresence>
			);
		}
		const {container, rerender, unmount} = renderTree(<App dir={1} />);
		expect(container.textContent).toContain('step');
		// The enter animation (initial="enter" -> animate="center") was played via WAAPI.
		expect(animateSpy).toHaveBeenCalled();
		// Re-render with the opposite direction; custom propagates, no crash.
		rerender(<App dir={-1} />);
		expect(container.firstChild).toBeTruthy();
		expect(container.textContent).toContain('step');
		unmount();
		animateSpy.mockRestore();
	});
});
