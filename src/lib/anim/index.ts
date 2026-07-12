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
 * Public barrel for the WAAPI animation engine.
 *
 * Exports the exact names the codebase imports from `framer-motion` / `motion`
 * (see the API-surface map), with compatible signatures so the alias shim
 * resolves all 78 consumer files to this engine with zero import edits:
 *
 *   Runtime: motion, AnimatePresence, useReducedMotion, useAnimationControls,
 *            useMotionValue, useDragControls
 *   Types:   HTMLMotionProps, MotionStyle, AnimationControls,
 *            LegacyAnimationControls, Transition, PanInfo, MotionValue, Variants
 *
 * `motion` is a proxy that lazily builds a component per HTML/SVG tag
 * (`motion.div`, `motion.button`, `motion.path`, ...), caching each so the
 * same tag always returns the same component instance (React expects stable
 * component identity across renders).
 */

import {createMotionComponent} from './motion/factory';
import type {HTMLMotionProps} from './types';

export {AnimatePresence, type AnimatePresenceProps, type PresenceContextValue} from './presence/AnimatePresence';
export {useReducedMotion} from './hooks/useReducedMotion';
export {useAnimationControls} from './hooks/useAnimationControls';
export {useMotionValue} from './hooks/useMotionValue';
export {useDragControls} from './hooks/useDragControls';

export type {
	AnimationControls,
	DragControls,
	DragConstraints,
	DragElasticPerAxis,
	HTMLMotionProps,
	LegacyAnimationControls,
	MotionProps,
	MotionStyle,
	MotionValue,
	MotionValueLike,
	PanInfo,
	TargetAndTransition,
	Transition,
	Variant,
	Variants,
} from './types';

// The full set of tags the codebase animates (from the API-surface map):
// div, button, span, img, section, aside, header, footer, path, rect, circle,
// h2, p, form. We allow-list these and lazily create each component.
const MOTION_TAGS = [
	'div',
	'button',
	'span',
	'img',
	'section',
	'aside',
	'header',
	'footer',
	'form',
	'h2',
	'p',
	'path',
	'rect',
	'circle',
	'ellipse',
	'line',
	'polyline',
	'polygon',
	'svg',
	'g',
	'use',
	'image',
	'text',
	'foreignObject',
] as const;

type MotionTag = (typeof MOTION_TAGS)[number];

/**
 * The typed shape of `motion.<tag>` — a forward-ref component accepting that
 * tag's HTMLMotionProps. We expose this as a type map so `motion.div` etc.
 * get full prop typing in consumer JSX.
 */
type MotionComponent<K extends keyof React.JSX.IntrinsicElements> = React.ForwardRefExoticComponent<HTMLMotionProps<K>>;

type MotionComponents = {
	[K in MotionTag]: MotionComponent<K>;
};

const componentCache = new Map<string, React.ComponentType<unknown>>();

function getMotionComponent(tag: string): React.ComponentType<unknown> {
	const cached = componentCache.get(tag);
	if (cached) return cached;
	const component = createMotionComponent(tag as keyof React.JSX.IntrinsicElements) as unknown as React.ComponentType<unknown>;
	componentCache.set(tag, component);
	return component;
}

/**
 * `motion` — proxy that returns a motion component for each tag.
 * `motion.div`, `motion.button`, etc. are accessed as properties. The proxy
 * caches components per tag so identity is stable across renders. The type is
 * a per-tag map of forward-ref components so JSX props type-check.
 */
export const motion = new Proxy({} as MotionComponents, {
	get(_target, prop: string) {
		if (typeof prop !== 'string') return undefined;
		return getMotionComponent(prop);
	},
});
