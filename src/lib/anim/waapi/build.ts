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
 * Build WAAPI keyframes from a resolved (from -> to) style pair.
 *
 * The transform tokens framer uses (`x`, `y`, `scale`, `scaleX`, `scaleY`,
 * `rotate`, `skewX`, `skewY`) are NOT real CSS properties, so they must be
 * combined into a single `transform` track. Everything else (`opacity`,
 * `width`, `height`, `borderRadius`, `right`, `bottom`, ...) maps 1:1 to a
 * CSS property. SVG geometry attrs (`x`, `y`, `width`, `height`, `rx`, `ry`,
 * `cx`, `cy`, `r`) are handled separately by the attribute writer — WAAPI
 * can't reliably animate them as CSS across targets.
 *
 * For springs, the curve is baked into sampled values with `easing: 'linear'`;
 * for tweens, we emit a 2-keyframe pair with the real easing. `pathLength`
 * is converted to `stroke-dasharray`/`stroke-dashoffset` here.
 */

import {getCachedSpring} from '../springs/cache';
import {solveSpring} from '../springs/solver';
import type {MotionStyle, MotionValueLike} from '../types';
import {instantTransition, makeTransitionResolver, type ResolvedPropTransition} from './keyframes';

/** Transform tokens that must collapse into one `transform` CSS property. */
const TRANSFORM_TOKENS = new Set(['x', 'y', 'z', 'scale', 'scaleX', 'scaleY', 'scaleZ', 'rotate', 'rotateX', 'rotateY', 'rotateZ', 'skewX', 'skewY', 'perspective']);

/** SVG geometry attributes that WAAPI can't animate as CSS — handled by the rAF attribute writer. */
export const SVG_GEOMETRY_ATTRS = new Set(['x', 'y', 'width', 'height', 'rx', 'ry', 'cx', 'cy', 'r']);

export interface BuiltAnimation {
	/** Property name -> WAAPI keyframes. Transform tokens are merged under `transform`. */
	keyframes: Map<string, Keyframe[]>;
	/** Per-property resolved transition (for duration/easing/delay aggregation). */
	transitions: Map<string, ResolvedPropTransition>;
	/** SVG geometry attrs to animate via the rAF writer (prop -> {from, to, transition}). */
	attributes: Map<string, {from: number | string; to: number | string; transition: ResolvedPropTransition}>;
	/** Total duration across all tracks (ms), including delay. */
	duration: number;
}

export interface BuildOptions {
	/** The element, used to detect SVG geometry targets and measure pathLength. */
	element: Element | null;
	/** Reduced-motion: collapse everything to duration 0. */
	reducedMotion: boolean;
	/** Top-level transition (may be per-property). */
	transition: import('../types').Transition | undefined;
	/** Custom value for variant function resolution (done by caller). */
}

/** Format a transform token's value into its CSS fragment. */
function transformFragment(prop: string, value: MotionValueLike): string {
	// Keyframe arrays aren't meaningful on the static transform-string path
	// (they're handled by the per-token sampling loop below); take the last frame.
	const scalar = Array.isArray(value) ? value[value.length - 1] : value;
	const n = typeof scalar === 'number' ? scalar : parseFloat(String(scalar));
	switch (prop) {
		case 'x':
			return `translateX(${n}px)`;
		case 'y':
			return `translateY(${n}px)`;
		case 'z':
			return `translateZ(${n}px)`;
		case 'scale':
		case 'scaleX':
		case 'scaleY':
		case 'scaleZ':
			return `${prop}(${n})`;
		case 'rotate':
			return `rotate(${n}deg)`;
		case 'rotateX':
		case 'rotateY':
		case 'rotateZ':
			return `${prop}(${n}deg)`;
		case 'skewX':
		case 'skewY':
			return `${prop}(${n}deg)`;
		case 'perspective':
			return `perspective(${n}px)`;
		default:
			return '';
	}
}

/** Build the full transform string for a given style bag (only transform tokens). */
function buildTransform(style: MotionStyle): string {
	const parts: string[] = [];
	// Deterministic order so the from/to strings align.
	const order = ['perspective', 'x', 'y', 'z', 'scale', 'scaleX', 'scaleY', 'scaleZ', 'rotate', 'rotateX', 'rotateY', 'rotateZ', 'skewX', 'skewY'];
	for (const key of order) {
		const v = style[key];
		if (v === undefined || v === null) continue;
		parts.push(transformFragment(key, v));
	}
	return parts.join(' ');
}

/** Whether a prop is an SVG geometry attribute on the given element. */
function isSvgGeometryAttr(prop: string, element: Element | null): boolean {
	if (!SVG_GEOMETRY_ATTRS.has(prop)) return false;
	if (!element) return false;
	// SVG geometry elements: rect, circle, ellipse, line, path, polyline, polygon, image, use.
	const tag = element.tagName.toLowerCase();
	return ['rect', 'circle', 'ellipse', 'line', 'path', 'polyline', 'polygon', 'image', 'use'].includes(tag);
}

/** Convert a spring transition + from/to into sampled keyframes (easing 'linear'). */
function springKeyframes(from: number, to: number, t: ResolvedPropTransition): {keyframes: Keyframe[]; duration: number} {
	const result = getCachedSpring(
		{
			from,
			to,
			config: {
				stiffness: t.stiffness ?? 100,
				damping: t.damping ?? 10,
				mass: t.mass ?? 1,
				velocity: t.velocity ?? 0,
				restDelta: t.restDelta ?? 0.001,
				restSpeed: t.restSpeed ?? 0.001,
				fps: 120,
			},
		},
		(k) => solveSpring(k.from, k.to, k.config),
	);
	// WAAPI keyframes: array of values. With easing 'linear' on the animation,
	// the curve is the sampled values themselves.
	const offset = result.samples.map((_, i) => (i === 0 ? 0 : i === result.samples.length - 1 ? 1 : i / (result.samples.length - 1)));
	return {
		keyframes: result.samples.map((v, i) => ({value: v, offset: offset[i], easing: 'linear'})),
		duration: result.duration,
	};
}

/** Convert a tween transition + from/to into a 2-keyframe pair with the real easing. */
function tweenKeyframes(from: number | string, to: number | string, t: ResolvedPropTransition): {keyframes: Keyframe[]; duration: number} {
	return {
		keyframes: [
			{value: from, easing: t.ease ?? 'ease-out'},
			{value: to},
		],
		duration: t.duration,
	};
}

/**
 * Build the animation plan for a from->to style pair under a transition.
 * `from` may be partial (missing keys default to the element's current value
 * or to `to` — see the factory for how initial is resolved).
 */
export function buildAnimation(
	from: MotionStyle,
	to: MotionStyle,
	opts: BuildOptions,
): BuiltAnimation {
	const keyframes = new Map<string, Keyframe[]>();
	const transitions = new Map<string, ResolvedPropTransition>();
	const attributes = new Map<string, {from: number | string; to: number | string; transition: ResolvedPropTransition}>();

	const resolve = makeTransitionResolver(opts.transition);
	let maxDuration = 0;

	// Collect the union of keys. Transform tokens are handled as one track.
	const allKeys = new Set<string>([...Object.keys(from), ...Object.keys(to)]);
	const transformKeys: string[] = [];

	for (const prop of allKeys) {
		// pathLength is special — convert to stroke-dasharray/dashoffset.
		if (prop === 'pathLength') {
			const fromLen = typeof from.pathLength === 'number' ? from.pathLength : 0;
			const toLen = typeof to.pathLength === 'number' ? to.pathLength : 1;
			const t = opts.reducedMotion ? instantTransition() : resolve(prop);
			const totalLength = opts.element && 'getTotalLength' in opts.element ? (opts.element as SVGPathElement).getTotalLength() : 1;
			const dasharray = String(totalLength);
			// dashoffset from length*(1-from) to length*(1-to).
			const fromOffset = totalLength * (1 - fromLen);
			const toOffset = totalLength * (1 - toLen);
			if (t.kind === 'spring') {
				const {keyframes: kf, duration} = springKeyframes(fromOffset, toOffset, t);
				keyframes.set('strokeDashoffset', kf);
				// strokeDasharray is constant.
				keyframes.set('strokeDasharray', [{value: dasharray}]);
				transitions.set('strokeDashoffset', {...t, duration});
				maxDuration = Math.max(maxDuration, duration + t.delay);
			} else {
				const {keyframes: kf, duration} = tweenKeyframes(fromOffset, toOffset, t);
				keyframes.set('strokeDashoffset', kf);
				keyframes.set('strokeDasharray', [{value: dasharray}]);
				transitions.set('strokeDashoffset', {...t, duration});
				maxDuration = Math.max(maxDuration, duration + t.delay);
			}
			continue;
		}

		// SVG geometry attrs (x/y/width/height/rx/ry/cx/cy/r) take precedence
		// over transform tokens: on an SVG <rect>, `x` is a geometry attribute,
		// not translateX. Route them to the rAF attribute writer before the
		// transform-token check below can claim them.
		if (isSvgGeometryAttr(prop, opts.element)) {
			const t = opts.reducedMotion ? instantTransition() : resolve(prop);
			const fromVal = from[prop];
			const toVal = to[prop];
			attributes.set(prop, {
				from: (fromVal as number | string) ?? (toVal as number | string),
				to: (toVal as number | string) ?? (fromVal as number | string),
				transition: t,
			});
			maxDuration = Math.max(maxDuration, t.duration + t.delay);
			continue;
		}

		if (TRANSFORM_TOKENS.has(prop)) {
			transformKeys.push(prop);
			continue;
		}

		const fromVal = from[prop];
		const toVal = to[prop];
		if (toVal === undefined && fromVal === undefined) continue;

		// Keyframe array target: `scale: [1, 1.2, 1]` or `boxShadow: [a, b, c]`.
		// framer plays the listed frames in sequence; WAAPI accepts the same
		// shape directly. We prepend the current `from` value so the first
		// segment interpolates from the element's present state, and apply the
		// transition's easing to each segment. Springs don't apply to a
		// multi-frame list — fall back to the transition's duration spread
		// evenly, or a default tween if the transition is a spring.
		if (Array.isArray(toVal) && toVal.length > 0) {
			const t = opts.reducedMotion ? instantTransition() : resolve(prop);
			const frames = toVal as (number | string)[];
			const kf: Keyframe[] = (fromVal === undefined ? frames : [fromVal as number | string, ...frames]).map((value, i, arr) => ({
				value,
				offset: i === 0 ? 0 : i === arr.length - 1 ? 1 : i / (arr.length - 1),
				easing: t.kind === 'tween' ? (t.ease ?? 'ease-out') : 'ease-out',
			}));
			const duration = t.kind === 'tween' ? t.duration : (t.duration || 300 * frames.length);
			const delay = t.delay;
			keyframes.set(prop, kf);
			transitions.set(prop, {...t, kind: 'tween', duration, delay, ease: t.kind === 'tween' ? t.ease : 'ease-out'});
			maxDuration = Math.max(maxDuration, duration + delay);
			continue;
		}

		// Regular CSS property.
		const t = opts.reducedMotion ? instantTransition() : resolve(prop);
		const fromNum = fromVal as number | string | undefined;
		const toNum = toVal as number | string | undefined;
		// If no `from`, just set the `to` (no animation track).
		if (fromNum === undefined) {
			keyframes.set(prop, [{value: toNum}]);
			transitions.set(prop, instantTransition());
			continue;
		}
		if (toNum === undefined) {
			continue;
		}

		if (t.kind === 'spring') {
			const fromN = typeof fromNum === 'number' ? fromNum : parseFloat(String(fromNum));
			const toN = typeof toNum === 'number' ? toNum : parseFloat(String(toNum));
			const {keyframes: kf, duration} = springKeyframes(fromN, toN, t);
			keyframes.set(prop, kf);
			transitions.set(prop, {...t, duration});
			maxDuration = Math.max(maxDuration, duration + t.delay);
		} else {
			const {keyframes: kf, duration} = tweenKeyframes(fromNum, toNum, t);
			keyframes.set(prop, kf);
			transitions.set(prop, {...t, duration});
			maxDuration = Math.max(maxDuration, duration + t.delay);
		}
	}

	// Merge transform tokens into one `transform` track.
	if (transformKeys.length > 0) {
		const t = opts.reducedMotion ? instantTransition() : resolve('transform');

		// If any transform token has a keyframe-array target (e.g. scale:
		// [1, 1.2, 1]), build a multi-frame transform list by combining the
		// per-frame value of each token. Tokens without an array use their
		// scalar `to` value on every frame.
		const arrayTokens = transformKeys.filter((tk) => Array.isArray(to[tk]));
		if (arrayTokens.length > 0) {
			const maxFrames = Math.max(...arrayTokens.map((tk) => (to[tk] as (number | string)[]).length));
			const kf: Keyframe[] = [];
			for (let i = 0; i < maxFrames; i++) {
				const bag: MotionStyle = {};
				for (const tk of transformKeys) {
					const arr = to[tk];
					if (Array.isArray(arr)) {
						bag[tk] = arr[Math.min(i, arr.length - 1)];
					} else if (arr !== undefined) {
						bag[tk] = arr;
					} else if (from[tk] !== undefined) {
						bag[tk] = from[tk];
					}
				}
				kf.push({
					value: buildTransform(bag),
					offset: i === 0 ? 0 : i === maxFrames - 1 ? 1 : i / (maxFrames - 1),
					easing: t.kind === 'tween' ? (t.ease ?? 'ease-out') : 'ease-out',
				});
			}
			const duration = t.kind === 'tween' ? t.duration : (t.duration || 300 * maxFrames);
			keyframes.set('transform', kf);
			transitions.set('transform', {...t, kind: 'tween', duration, delay: t.delay, ease: t.kind === 'tween' ? t.ease : 'ease-out'});
			maxDuration = Math.max(maxDuration, duration + t.delay);
		} else if (t.kind === 'spring') {
			// We can only spring a single scalar. For combined transforms, sample
			// each token independently and recombine per frame. Simpler + correct:
			// sample the dominant axis (the one present). In practice the app
			// animates either a single transform token or a couple (scale + y in
			// springInModal). We sample each token and combine per frame.
			const tokenSamples = transformKeys.map((tk) => {
				const fv = typeof from[tk] === 'number' ? (from[tk] as number) : parseFloat(String(from[tk] ?? 0));
				const tv = typeof to[tk] === 'number' ? (to[tk] as number) : parseFloat(String(to[tk] ?? 0));
				const r = springKeyframes(fv, tv, t);
				return {token: tk, samples: r.keyframes, duration: r.duration};
			});
			const maxLen = Math.max(...tokenSamples.map((s) => s.samples.length));
			const maxTokDur = Math.max(...tokenSamples.map((s) => s.duration));
			const combined: Keyframe[] = [];
			for (let i = 0; i < maxLen; i++) {
				const bag: MotionStyle = {};
				for (const s of tokenSamples) {
					const idx = Math.min(i, s.samples.length - 1);
					const v = (s.samples[idx] as {value: number}).value;
					bag[s.token] = v;
				}
				combined.push({value: buildTransform(bag), offset: i === 0 ? 0 : i === maxLen - 1 ? 1 : i / (maxLen - 1), easing: 'linear'});
			}
			keyframes.set('transform', combined);
			transitions.set('transform', {...t, duration: maxTokDur});
			maxDuration = Math.max(maxDuration, maxTokDur + t.delay);
		} else {
			const fromTransform = buildTransform(from);
			const toTransform = buildTransform(to);
			// If either side is empty, fall back to the other so we don't animate to ''.
			const fromStr = fromTransform || toTransform;
			const toStr = toTransform || fromTransform;
			const {keyframes: kf, duration} = tweenKeyframes(fromStr, toStr, t);
			keyframes.set('transform', kf);
			transitions.set('transform', {...t, duration});
			maxDuration = Math.max(maxDuration, duration + t.delay);
		}
	}

	return {keyframes, transitions, attributes, duration: maxDuration};
}
