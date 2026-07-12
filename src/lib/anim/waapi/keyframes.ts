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
 * Resolve a framer-style transition into a normalized form.
 *
 * framer-motion lets a `transition` be either a single transition object
 * (applied to every animated property) or a per-property map
 * (`{opacity: {duration: 0.2}, x: {type: 'spring', ...}}`). This normalizes
 * that into a lookup so the keyframe builder can ask "how do I animate
 * property X?" and always get an answer.
 */

import type {PerPropertyTransition, SpringTransition, Transition, TweenTransition} from '../types';

export type NormalizedTransition =
	| {kind: 'spring'; config: SpringTransition}
	| {kind: 'tween'; config: TweenTransition}
	| {kind: 'none'};

/** A transition that applies to a single property, already normalized. */
export interface ResolvedPropTransition {
	kind: 'spring' | 'tween' | 'none';
	duration: number; // ms
	delay: number; // ms
	ease?: string; // WAAPI easing string (for tween) — springs use 'linear' (baked into values)
	stiffness?: number;
	damping?: number;
	mass?: number;
	velocity?: number;
	restDelta?: number;
	restSpeed?: number;
	/** Repeat count (Infinity = forever). 0/undefined = once. */
	repeat?: number;
	/** Delay between repeats, in ms. */
	repeatDelay?: number;
	/** How a repeat reverses: 'loop' | 'reverse' | 'mirror'. */
	repeatType?: 'loop' | 'reverse' | 'mirror';
}

const DEFAULT_SPRING: SpringTransition = {type: 'spring', stiffness: 100, damping: 10, mass: 1};

function isSpring(t: Transition | undefined): t is SpringTransition {
	return typeof t === 'object' && t !== null && !Array.isArray(t) && (t as SpringTransition).type === 'spring';
}

function isTween(t: Transition | undefined): t is TweenTransition {
	if (typeof t !== 'object' || t === null || Array.isArray(t)) return false;
	const type = (t as TweenTransition).type;
	return type === undefined || type === 'tween';
}

function isPerProperty(t: Transition | undefined): t is PerPropertyTransition {
	if (typeof t !== 'object' || t === null || Array.isArray(t)) return false;
	const type = (t as {type?: string}).type;
	// A per-property map has no top-level `type` and at least one nested object.
	if (type === 'spring' || type === 'tween') return false;
	return Object.values(t).some((v) => typeof v === 'object' && v !== null && !Array.isArray(v));
}

/** Map framer ease names / cubic-bezier arrays to WAAPI easing strings. */
export function resolveEase(ease: unknown): string {
	if (typeof ease === 'string') {
		switch (ease) {
			case 'linear':
				return 'linear';
			case 'easeIn':
			case 'ease-in':
				return 'ease-in';
			case 'easeOut':
			case 'ease-out':
				return 'ease-out';
			case 'easeInOut':
			case 'ease-in-out':
				return 'ease-in-out';
			case 'easeInOutSine':
				return 'cubic-bezier(0.37, 0, 0.63, 1)';
			default:
				// Unknown named ease — fall back to ease-out (safe default for UI).
				return 'ease-out';
		}
	}
	if (Array.isArray(ease) && ease.length === 4 && ease.every((n) => typeof n === 'number')) {
		const [x1, y1, x2, y2] = ease as [number, number, number, number];
		return `cubic-bezier(${x1}, ${y1}, ${x2}, ${y2})`;
	}
	return 'ease-out';
}

/**
 * Build a per-property transition resolver. Given a property name, returns
 * the resolved transition for that property (falling back to the top-level
 * transition, then to a default spring).
 */
export function makeTransitionResolver(topLevel: Transition | undefined) {
	return function resolveForProp(prop: string): ResolvedPropTransition {
		// Per-property override wins.
		if (isPerProperty(topLevel) && topLevel[prop] !== undefined) {
			return resolvePropTransition(topLevel[prop] as Transition);
		}

		if (isSpring(topLevel)) {
			const t = topLevel;
			return {
				kind: 'spring',
				duration: 0, // filled by solver
				delay: (t.delay ?? 0) * 1000,
				stiffness: t.stiffness ?? DEFAULT_SPRING.stiffness!,
				damping: t.damping ?? DEFAULT_SPRING.damping!,
				mass: t.mass ?? 1,
				velocity: t.velocity ?? 0,
				restDelta: t.restDelta ?? 0.001,
				restSpeed: t.restSpeed ?? 0.001,
			};
		}

		if (isTween(topLevel)) {
			const t = topLevel;
			return {
				kind: 'tween',
				duration: (t.duration ?? 0.3) * 1000,
				delay: (t.delay ?? 0) * 1000,
				ease: resolveEase(t.ease),
				repeat: t.repeat,
				repeatDelay: (t.repeatDelay ?? 0) * 1000,
				repeatType: t.repeatType,
			};
		}

		// No transition specified — default to a gentle spring.
		return {
			kind: 'spring',
			duration: 0,
			delay: 0,
			stiffness: DEFAULT_SPRING.stiffness!,
			damping: DEFAULT_SPRING.damping!,
			mass: 1,
			velocity: 0,
			restDelta: 0.001,
			restSpeed: 0.001,
		};
	};
}

function resolvePropTransition(t: Transition): ResolvedPropTransition {
	if (isSpring(t)) {
		return {
			kind: 'spring',
			duration: 0,
			delay: (t.delay ?? 0) * 1000,
			stiffness: t.stiffness ?? DEFAULT_SPRING.stiffness!,
			damping: t.damping ?? DEFAULT_SPRING.damping!,
			mass: t.mass ?? 1,
			velocity: t.velocity ?? 0,
			restDelta: t.restDelta ?? 0.001,
			restSpeed: t.restSpeed ?? 0.001,
		};
	}
	if (isTween(t)) {
		return {
			kind: 'tween',
			duration: (t.duration ?? 0.3) * 1000,
			delay: (t.delay ?? 0) * 1000,
			ease: resolveEase(t.ease),
			repeat: t.repeat,
			repeatDelay: (t.repeatDelay ?? 0) * 1000,
			repeatType: t.repeatType,
		};
	}
	return {kind: 'none', duration: 0, delay: 0};
}

/** When reduced motion is preferred, collapse any transition to instant. */
export function instantTransition(): ResolvedPropTransition {
	return {kind: 'tween', duration: 0, delay: 0, ease: 'linear'};
}
