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
 * useAnimationControls — imperative animation handle.
 *
 * A motion component registers its element with the controls via `_mount`;
 * `.start(definition)` then builds + plays a WAAPI animation on that element
 * and returns a Promise<void> resolving on finish. `.set(definition)` applies
 * the final styles synchronously (returns void — `await` on void resolves
 * immediately, which is what RootComponent's reduced-motion path expects).
 *
 * RootComponent awaits `.start()` in sequence to chain route-transition
 * animations; that only works because `.start()` returns a real promise that
 * resolves on `onfinish`, including the rAF fallback.
 */

import {useMemo} from 'react';

import {buildAnimation} from '../waapi/build';
import {playAnimation, setStyles} from '../waapi/play';
import type {AnimationControls, MotionStyle, TargetAndTransition, Transition, Variant, Variants} from '../types';

interface RegisteredElement {
	element: Element;
	/** Resolve a variant name / function against the element's custom value. */
	custom: () => unknown;
	/** Variants map from the component, for resolving named targets. */
	variants: () => Variants | undefined;
	/** Reduced-motion flag from the component. */
	reduced: () => boolean;
	/** Transition override from the component. */
	transition: () => Transition | undefined;
}

function resolveTarget(
	definition: TargetAndTransition | Variant | string,
	custom: unknown,
	variants: Variants | undefined,
): {target: MotionStyle; transition?: Transition} {
	if (typeof definition === 'string') {
		const v = variants?.[definition];
		if (!v) return {target: {}};
		const resolved = typeof v === 'function' ? (v as (c: unknown) => MotionStyle)(custom) : v;
		return {target: {...resolved}};
	}
	if (typeof definition === 'function') {
		const resolved = (definition as (c: unknown) => MotionStyle)(custom);
		return {target: {...resolved}};
	}
	const {transition, ...rest} = definition as TargetAndTransition;
	return {target: {...rest} as MotionStyle, transition};
}

export function useAnimationControls(): AnimationControls {
	const controls = useMemo<AnimationControls>(() => {
		let registered: RegisteredElement | null = null;
		let currentHandle: {cancel: () => void} | null = null;

		return {
			start(definition, transitionOverride) {
				if (!registered) return Promise.resolve();
				const {element, custom, variants, reduced, transition} = registered;
				const {target, transition: defTransition} = resolveTarget(definition, custom(), variants());
				const t = transitionOverride ?? defTransition ?? transition();
				if (reduced()) {
					setStyles(element, target);
					return Promise.resolve();
				}
				// `from` = current computed/inline state; we animate from nothing (WAAPI
				// interpolates from the current value when the first keyframe has no value).
				const built = buildAnimation({}, target, {element, reducedMotion: false, transition: t});
				currentHandle?.cancel();
				const handle = playAnimation(element, built);
				currentHandle = handle;
				return handle.finished;
			},
			set(definition) {
				if (!registered) return;
				const {element, custom, variants} = registered;
				const {target} = resolveTarget(definition, custom(), variants());
				currentHandle?.cancel();
				currentHandle = null;
				setStyles(element, target);
			},
			stop() {
				currentHandle?.cancel();
				currentHandle = null;
			},
			_mount(element) {
				if (element) {
					registered = {
						element,
						custom: customRef.get,
						variants: variantsRef.get,
						reduced: reducedRef.get,
						transition: transitionRef.get,
					};
				} else {
					registered = null;
				}
				return () => {
					if (registered?.element === element) registered = null;
				};
			},
		};
	}, []);

	// Refs the motion component writes so the controls always read the latest
	// custom/variants/reduced/transition without re-creating the controls object.
	const customRef = useMemo(() => ({get: () => undefined as unknown}), []);
	const variantsRef = useMemo(() => ({get: () => undefined as Variants | undefined}), []);
	const reducedRef = useMemo(() => ({get: () => false}), []);
	const transitionRef = useMemo(() => ({get: () => undefined as Transition | undefined}), []);

	// Attach the refs to the controls so the motion component can update them.
	(controls as unknown as {_refs: {custom: typeof customRef; variants: typeof variantsRef; reduced: typeof reducedRef; transition: typeof transitionRef}})._refs = {
		custom: customRef,
		variants: variantsRef,
		reduced: reducedRef,
		transition: transitionRef,
	};

	return controls;
}
