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
 * but WITHOUT ANY WARRANTY; without the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with Astral. If not, see <https://www.gnu.org/licenses/>.
 */

/*
 * Physics-based motion effects registry.
 *
 * Inspired by GSAP's `gsap.effects` API: you register named effects once,
 * then apply them by name to any element/component. The difference is that
 * every effect here is driven by spring physics (mass / stiffness / damping),
 * not linear or fixed-curve easing — so motion has weight, overshoot, and
 * natural settle, matching the user's request for "animations by physics,
 * not just linear."
 *
 * Built on top of framer-motion. The in-tree WAAPI experiment is intentionally
 * not used here after the production sync because it made local/dev runtime
 * behavior unstable. All effects respect `prefers-reduced-motion`
 * automatically.
 *
 * Usage:
 *   import {useMotionEffect} from '~/lib/motion/effects';
 *   const {ref, controls} = useMotionEffect('springInUp', {from: 40});
 *   // attach ref to a component, call controls.start() / controls.stop()
 *
 * Or the declarative variant for entrance animations:
 *   <MotionDiv effect="springInUp" />
 */

import {useAnimationControls, useReducedMotion, type LegacyAnimationControls, type Transition} from 'framer-motion';
import {useEffect, useRef} from 'react';
import {prefersReducedMotion} from '~/lib/perf/reducedMotion';

/*
 * Spring physics presets. Each is a (mass, stiffness, damping) triple tuned
 * for a distinct feel. These are the building blocks every effect references,
 * so the "physics" is centralized and tweakable in one place.
 */
export const SPRINGS = {
	// Snappy UI element: buttons, toggles, small cards. Quick settle, tiny overshoot.
	snappy: {type: 'spring', mass: 0.92, stiffness: 620, damping: 42, restDelta: 0.004, restSpeed: 0.02} as const,
	// Gentle entrance: modals, panels, list items. Soft overshoot, calm settle.
	gentle: {type: 'spring', mass: 0.95, stiffness: 360, damping: 32, restDelta: 0.004, restSpeed: 0.02} as const,
	// Bouncy reveal: badges, notifications, emoji reactions. Noticeable overshoot.
	bouncy: {type: 'spring', mass: 0.9, stiffness: 420, damping: 18, restDelta: 0.004, restSpeed: 0.02} as const,
	// Heavy panel: large surfaces, full-screen sheets. Weighty, minimal overshoot.
	heavy: {type: 'spring', mass: 1.05, stiffness: 260, damping: 36, restDelta: 0.004, restSpeed: 0.02} as const,
	// Soft settle: fades and opacity-only changes. No positional overshoot.
	soft: {type: 'spring', mass: 0.95, stiffness: 260, damping: 44, restDelta: 0.004, restSpeed: 0.02} as const,
} as const satisfies Record<string, Transition>;

export type SpringName = keyof typeof SPRINGS;

/*
 * An effect definition: the target's initial state, the animated end state,
 * and the spring transition to drive between them. `from` overrides let
 * callers customize the start (e.g. distance to travel) at call time.
 */
export interface MotionEffect {
	initial: Record<string, number>;
	animate: Record<string, number>;
	transition: Transition;
}

/*
 * The registry of named effects. Add new effects here; consumers reference
 * them by string so animation definitions stay centralized and consistent
 * across the app (the point of a gsap.effects-style API).
 */
export const MOTION_EFFECTS = {
	// Slide up + fade in. The workhorse entrance for list items, cards, popovers.
	springInUp: {
		initial: {opacity: 0, y: 24},
		animate: {opacity: 1, y: 0},
		transition: SPRINGS.gentle,
	},
	// Slide down + fade in. For dropdowns, menus opening downward.
	springInDown: {
		initial: {opacity: 0, y: -24},
		animate: {opacity: 1, y: 0},
		transition: SPRINGS.gentle,
	},
	// Scale up + fade in. For popovers, tooltips, context menus from a point.
	springInScale: {
		initial: {opacity: 0, scale: 0.92},
		animate: {opacity: 1, scale: 1},
		transition: SPRINGS.snappy,
	},
	// Bouncy pop. For badges, reaction bursts, "new" indicators.
	springPop: {
		initial: {opacity: 0, scale: 0.6},
		animate: {opacity: 1, scale: 1},
		transition: SPRINGS.bouncy,
	},
	// Fade + soft settle. For toasts, banners, non-positional reveals.
	springFadeIn: {
		initial: {opacity: 0},
		animate: {opacity: 1},
		transition: SPRINGS.soft,
	},
	// Slide in from the right. For sheets, side panels, swipe-in views.
	springInRight: {
		initial: {opacity: 0, x: 48},
		animate: {opacity: 1, x: 0},
		transition: SPRINGS.heavy,
	},
	// Slide in from the left. For back-navigation, reverse-direction sheets.
	springInLeft: {
		initial: {opacity: 0, x: -48},
		animate: {opacity: 1, x: 0},
		transition: SPRINGS.heavy,
	},
	// Heavy scale for full-screen modals / large dialogs.
	springInModal: {
		initial: {opacity: 0, scale: 0.96, y: 12},
		animate: {opacity: 1, scale: 1, y: 0},
		transition: SPRINGS.heavy,
	},
} as const satisfies Record<string, MotionEffect>;

export type MotionEffectName = keyof typeof MOTION_EFFECTS;

/*
 * Resolve an effect by name, applying caller overrides to the `from`/initial
 * values (e.g. a different travel distance). Returns the framer-motion props
 * ready to spread onto a `motion.div`. When reduced motion is preferred, the
 * effect collapses to an instant set with no transition.
 */
export function resolveEffect(
	name: MotionEffectName,
	overrides?: {from?: Partial<Record<string, number>>},
): {initial: Record<string, number>; animate: Record<string, number>; transition: Transition} {
	const effect = MOTION_EFFECTS[name];
	const initial = {...effect.initial, ...overrides?.from};
	const reduced = prefersReducedMotion();

	if (reduced) {
		return {
			initial: {...effect.animate},
			animate: {...effect.animate},
			transition: {duration: 0},
		};
	}

	return {
		initial,
		animate: {...effect.animate},
		transition: effect.transition,
	};
}

export interface UseMotionEffectResult {
	ref: React.RefObject<HTMLElement | null>;
	controls: LegacyAnimationControls;
	/*
	 * The resolved props (initial/animate/transition) to spread onto the
	 * motion component if you prefer the declarative form.
	 */
	props: {initial: Record<string, number>; animate: Record<string, number>; transition: Transition};
}

/*
 * Imperative hook: returns a ref + animation controls. Attach the ref to a
 * `motion.div` (or pass `controls` to its `animate` prop) and call
 * `controls.start()` to play the effect. Useful for effects triggered by
 * user interaction (open/close, hover, tap) rather than mount.
 *
 *   const {ref, controls} = useMotionEffect('springInUp');
 *   <motion.div ref={ref} animate={controls} />
 *   // later: controls.start()
 */
export function useMotionEffect(
	name: MotionEffectName,
	overrides?: {from?: Partial<Record<string, number>>},
): UseMotionEffectResult {
	const controls = useAnimationControls();
	const ref = useRef<HTMLElement | null>(null);
	const reduced = useReducedMotion();

	const props = resolveEffect(name, overrides);

	// When reduced motion is on, jump straight to the end state on mount.
	useEffect(() => {
		if (reduced) {
			controls.set(props.animate);
		}
	}, [reduced, controls, props.animate]);

	return {ref, controls, props};
}

/*
 * Declarative entrance helper: returns the props to spread on a `motion.*`
 * component for a one-shot entrance animation on mount. Pair with
 * `AnimatePresence` for exit animations.
 *
 *   <motion.div {...entrance('springInUp')} />
 */
export function entrance(
	name: MotionEffectName,
	overrides?: {from?: Partial<Record<string, number>>},
): {initial: Record<string, number>; animate: Record<string, number>; transition: Transition} {
	return resolveEffect(name, overrides);
}

/*
 * Exit props for `AnimatePresence` variants. Mirrors each entrance with a
 * reversed, slightly faster settle so exits feel responsive rather than
 * drawn-out.
 */
export function exit(
	name: MotionEffectName,
): {exit: Record<string, number>; transition: Transition} {
	const effect = MOTION_EFFECTS[name];
	const reduced = prefersReducedMotion();
	if (reduced) {
		return {exit: {...effect.initial, opacity: 0}, transition: {duration: 0}};
	}
	return {
		exit: {...effect.initial},
		transition: {...effect.transition, damping: (effect.transition as {damping?: number}).damping ? ((effect.transition as {damping: number}).damping + 8) : 30},
	};
}
