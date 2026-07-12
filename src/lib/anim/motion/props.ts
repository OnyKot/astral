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
 * Resolve motion props into concrete (initial, animate, exit) style bags.
 *
 * framer-motion lets `initial`/`animate`/`exit` be:
 *   - a style bag ({opacity: 0, y: 24})
 *   - a variant name (string) that indexes the `variants` map
 *   - a variant function (resolved with `custom`)
 *   - `false` (skip the initial animation)
 * This normalizes all of those into a plain MotionStyle the keyframe builder
 * can consume, and splits motion-only props off the DOM-props bag so the
 * factory can pass the rest through to the underlying element.
 */

import type {MotionProps, MotionStyle, TargetAndTransition, Transition, Variant, Variants} from '../types';

/** The motion-only prop keys we strip from the DOM-props bag. */
export const MOTION_PROP_KEYS = new Set<keyof MotionProps>([
	'initial',
	'animate',
	'exit',
	'whileHover',
	'whileTap',
	'whileDrag',
	'whileFocus',
	'whileInView',
	'variants',
	'custom',
	'transition',
	'layout',
	'layoutId',
	'drag',
	'dragControls',
	'dragListener',
	'dragDirectionLock',
	'dragMomentum',
	'dragConstraints',
	'dragElastic',
	'onDrag',
	'onDragStart',
	'onDragEnd',
	'onAnimationStart',
	'onAnimationComplete',
	'onHoverStart',
	'onHoverEnd',
	'onPan',
	'onTap',
	'pathLength',
]);

/** Split a props object into motion props + DOM props. */
export function splitMotionProps<T extends Record<string, unknown>>(props: T): {motionProps: Partial<MotionProps>; domProps: T} {
	const motionProps: Partial<MotionProps> = {};
	const domProps: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(props)) {
		if (MOTION_PROP_KEYS.has(key as keyof MotionProps)) {
			(motionProps as Record<string, unknown>)[key] = value;
		} else {
			domProps[key] = value;
		}
	}
	return {motionProps: motionProps as Partial<MotionProps>, domProps: domProps as T};
}

/** Resolve a variant definition (name | bag | function) into a concrete style bag. */
export function resolveVariant(
	definition: string | boolean | TargetAndTransition | Variant | undefined,
	variants: Variants | undefined,
	custom: unknown,
): MotionStyle {
	if (definition === undefined || definition === false || definition === true) {
		return {};
	}
	if (typeof definition === 'string') {
		const v = variants?.[definition];
		if (!v) return {};
		return typeof v === 'function' ? (v as (c: unknown) => MotionStyle)(custom) : {...v};
	}
	if (typeof definition === 'function') {
		return (definition as (c: unknown) => MotionStyle)(custom);
	}
	// It's a style bag (possibly with a `transition` key).
	const {transition: _transition, ...rest} = definition as TargetAndTransition;
	void _transition;
	return {...rest} as MotionStyle;
}

/** Extract the `transition` from a variant definition if present. */
export function extractTransition(
	definition: string | boolean | TargetAndTransition | Variant | undefined,
	variants: Variants | undefined,
	custom: unknown,
): Transition | undefined {
	if (definition === undefined || typeof definition === 'boolean' || typeof definition === 'string' || typeof definition === 'function') {
		return undefined;
	}
	return (definition as TargetAndTransition).transition;
}
