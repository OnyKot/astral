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
 * createMotionComponent — the factory behind `motion.div`, `motion.button`, etc.
 *
 * On mount: play `initial -> animate` via WAAPI (skip if `initial={false}`).
 * On `animate` prop change: transition prev -> next.
 * whileHover / whileTap: pointer listeners that cancel in-flight WAAPI on the
 *   element before starting the new anim.
 * drag: pointer-driven rAF transform writes (only Modal + MobileMentionToast).
 * pathLength: handled in the keyframe builder (stroke-dasharray/dashoffset).
 * onAnimationComplete: fires when the mount/animate animation finishes.
 * AnimationControls: the component registers its element + latest custom /
 *   variants / reduced / transition so `.start()`/`.set()` act on it.
 *
 * `layout` and the other zero-usage props are accepted and ignored (see the
 * API-surface map). The 78 consumer files pass them without issue.
 */

import {forwardRef, useContext, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef} from 'react';

import {PresenceContext} from '../presence/AnimatePresence';
import {createDrag} from '../drag/useDrag';
import {useReducedMotion} from '../hooks/useReducedMotion';
import {buildAnimation} from '../waapi/build';
import {playAnimation, setStyles} from '../waapi/play';
import type {AnimationControls, DragControls, DragElasticPerAxis, HTMLMotionProps, MotionStyle, PanInfo, TargetAndTransition, Transition, Variant, Variants} from '../types';
import {extractTransition, resolveVariant, splitMotionProps} from './props';

// Tags that are SVG (need attribute-style writes for geometry + pathLength).
const SVG_TAGS = new Set(['path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'svg', 'g', 'use', 'image', 'text', 'foreignObject']);

export function createMotionComponent<K extends keyof React.JSX.IntrinsicElements>(tag: K) {
	const Component = forwardRef<React.ElementRef<K>, HTMLMotionProps<K>>(function MotionComponent(props, forwardedRef) {
		const {motionProps, domProps} = splitMotionProps(props);
		const reduced = useReducedMotion();
		const elementRef = useRef<Element | null>(null);
		const lastAnimateRef = useRef<MotionStyle>({});
		const hasMountedRef = useRef(false);

		// Keep latest props in refs so effect re-runs don't depend on every prop.
		const motionPropsRef = useRef(motionProps);
		motionPropsRef.current = motionProps;
		const reducedRef = useRef(reduced);
		reducedRef.current = reduced;

		// Presence context: if this child is inside <AnimatePresence>, it owns its
		// exit animation and must notify the presence when the exit finishes.
		const presence = useContext(PresenceContext);
		// The child's key — React injects it; we read it from a hidden prop we set
		// in the domProps bag below (React strips `key` from props). We pass it via
		// a data attribute on the rendered element and read it back, OR accept it
		// from the presence via a registration. Simpler: the presence keys its
		// children, and we read `key` off the React element through a ref callback.
		const presenceKeyRef = useRef<string | null>(null);

		// Expose the element to the forwarded ref.
		useImperativeHandle(forwardedRef, () => elementRef.current as React.ElementRef<K>, []);

		// Register with AnimationControls if `animate` is a controls object.
		const controls = typeof motionProps.animate === 'object' && motionProps.animate !== null && 'start' in motionProps.animate ? (motionProps.animate as AnimationControls) : null;
		useEffect(() => {
			if (!controls) return;
			const refs = (controls as unknown as {_refs?: {custom: {get: () => unknown}; variants: {get: () => Variants | undefined}; reduced: {get: () => boolean}; transition: {get: () => Transition | undefined}}})._refs;
			if (refs) {
				refs.custom.get = () => motionPropsRef.current.custom;
				refs.variants.get = () => motionPropsRef.current.variants;
				refs.reduced.get = () => reducedRef.current ?? false;
				refs.transition.get = () => motionPropsRef.current.transition;
			}
			return controls._mount(elementRef.current as HTMLElement | SVGElement | null);
		}, [controls]);

		// Mount: initial -> animate.
		useEffect(() => {
			const el = elementRef.current;
			if (!el || hasMountedRef.current) return;
			hasMountedRef.current = true;
			const mp = motionPropsRef.current;
			const red = reducedRef.current ?? false;

			const initialDef = mp.initial;
			const animateDef = mp.animate;
			// If animate is a controls object, the controls drive it; skip mount anim.
			if (controls) return;

			const variants = mp.variants;
			const custom = mp.custom;
			const animateStyle = resolveVariant(animateDef as never, variants, custom);
			lastAnimateRef.current = animateStyle;

			// No animate target -> nothing to play.
			if (Object.keys(animateStyle).length === 0) return;

			// Determine whether to skip the entrance animation:
			//   - explicit `initial={false}` on the component, OR
			//   - inside an <AnimatePresence initial={false}> on its first mount.
			const skipInitial = initialDef === false || (presence !== null && presence.initial === false && presence.key !== null);

			if (skipInitial) {
				setStyles(el, animateStyle);
				return;
			}

			const initialStyle = resolveVariant(initialDef as never, variants, custom);

			if (red) {
				// Reduced motion: jump to animate target instantly.
				setStyles(el, animateStyle);
				return;
			}

			const transition = mp.transition ?? extractTransition(animateDef as never, variants, custom);
			const built = buildAnimation(initialStyle, animateStyle, {element: el, reducedMotion: false, transition});
			mp.onAnimationStart?.();
			const handle = playAnimation(el, built, () => {
				mp.onAnimationComplete?.();
			});
			return () => handle.cancel();
			// eslint-disable-next-line react-hooks/exhaustive-deps
		}, []);

		// Presence exit: when this child's key is marked absent, play its `exit`
		// animation, then notify the presence to unmount it.
		const presenceKey = presence?.key ?? null;
		const present = presenceKey !== null ? presence?.isPresent(presenceKey) : true;
		useLayoutEffect(() => {
			if (!presence || presenceKey === null) return;
			if (present) return;
			const el = elementRef.current;
			if (!el) {
				presence.notifyExitComplete(presenceKey);
				return;
			}
			const mp = motionPropsRef.current;
			const red = reducedRef.current ?? false;
			const variants = mp.variants;
			const custom = mp.custom ?? presence.custom;
			const exitStyle = resolveVariant(mp.exit as never, variants, custom);
			if (Object.keys(exitStyle).length === 0 || red) {
				// No exit defined or reduced motion — unmount immediately.
				if (red && Object.keys(exitStyle).length > 0) setStyles(el, exitStyle);
				presence.notifyExitComplete(presenceKey);
				return;
			}
			const transition = mp.transition ?? extractTransition(mp.exit as never, variants, custom);
			const built = buildAnimation(lastAnimateRef.current, exitStyle, {element: el, reducedMotion: false, transition});
			const handle = playAnimation(el, built, () => {
				presence.notifyExitComplete(presenceKey);
			});
			return () => handle.cancel();
			// eslint-disable-next-line react-hooks/exhaustive-deps
		}, [present, presenceKey]);

		// animate prop change: transition prev -> next.
		const animateKey = useMemo(() => stableKey(motionProps.animate), [motionProps.animate]);
		useEffect(() => {
			const el = elementRef.current;
			if (!el || !hasMountedRef.current) return;
			const mp = motionPropsRef.current;
			const red = reducedRef.current ?? false;
			if (controls) return; // controls drive animation, not the animate prop.

			const variants = mp.variants;
			const custom = mp.custom;
			const nextStyle = resolveVariant(motionProps.animate as never, variants, custom);
			if (Object.keys(nextStyle).length === 0) return;
			const prevStyle = lastAnimateRef.current;
			lastAnimateRef.current = nextStyle;

			if (red) {
				setStyles(el, nextStyle);
				return;
			}
			const transition = mp.transition ?? extractTransition(motionProps.animate as never, variants, custom);
			const built = buildAnimation(prevStyle, nextStyle, {element: el, reducedMotion: false, transition});
			mp.onAnimationStart?.();
			const handle = playAnimation(el, built, () => {
				mp.onAnimationComplete?.();
			});
			return () => handle.cancel();
			// eslint-disable-next-line react-hooks/exhaustive-deps
		}, [animateKey, controls]);

		// whileHover / whileTap.
		useEffect(() => {
			const el = elementRef.current as HTMLElement | null;
			if (!el) return;
			const mp = motionPropsRef.current;
			const red = reducedRef.current ?? false;
			if (red) return;
			const variants = mp.variants;
			const custom = mp.custom;
			let activeHandle: {cancel: () => void} | null = null;

			const playWhile = (def: TargetAndTransition | Variant | undefined, onComplete?: () => void) => {
				if (!def) return;
				const target = resolveVariant(def as never, variants, custom);
				if (Object.keys(target).length === 0) return;
				const from = lastAnimateRef.current;
				activeHandle?.cancel();
				const built = buildAnimation(from, target, {element: el, reducedMotion: false, transition: mp.transition});
				activeHandle = playAnimation(el, built, onComplete);
			};

			const onPointerEnter = (e: MouseEvent) => {
				mp.onHoverStart?.(e);
				playWhile(mp.whileHover);
			};
			const onPointerLeave = (e: MouseEvent) => {
				mp.onHoverEnd?.(e);
				// Return to animate target.
				playWhile(mp.whileHover ? lastAnimateRef.current : undefined, undefined);
				if (!mp.whileHover) return;
				const target = lastAnimateRef.current;
				if (Object.keys(target).length === 0) return;
				activeHandle?.cancel();
				const built = buildAnimation({}, target, {element: el, reducedMotion: false, transition: mp.transition});
				activeHandle = playAnimation(el, built);
			};
			const onPointerDown = () => {
				playWhile(mp.whileTap);
			};
			const onPointerUp = () => {
				const target = lastAnimateRef.current;
				activeHandle?.cancel();
				if (Object.keys(target).length === 0) return;
				const built = buildAnimation({}, target, {element: el, reducedMotion: false, transition: mp.transition});
				activeHandle = playAnimation(el, built);
			};

			if (mp.whileHover || mp.onHoverStart || mp.onHoverEnd) {
				el.addEventListener('pointerenter', onPointerEnter as EventListener);
				el.addEventListener('pointerleave', onPointerLeave as EventListener);
			}
			if (mp.whileTap) {
				el.addEventListener('pointerdown', onPointerDown as EventListener);
				el.addEventListener('pointerup', onPointerUp as EventListener);
			}
			return () => {
				el.removeEventListener('pointerenter', onPointerEnter as EventListener);
				el.removeEventListener('pointerleave', onPointerLeave as EventListener);
				el.removeEventListener('pointerdown', onPointerDown as EventListener);
				el.removeEventListener('pointerup', onPointerUp as EventListener);
				activeHandle?.cancel();
			};
		}, [motionProps.whileHover, motionProps.whileTap, motionProps.onHoverStart, motionProps.onHoverEnd]);

		// Drag.
		const dragControls = motionProps.dragControls as DragControls | undefined;
		useEffect(() => {
			const el = elementRef.current as HTMLElement | null;
			if (!el) return;
			const mp = motionPropsRef.current;
			if (!mp.drag) return;
			const axis = mp.drag === true ? 'y' : mp.drag;
			const constraints = mp.dragConstraints && typeof mp.dragConstraints === 'object' ? mp.dragConstraints : {};
			const elastic = (mp.dragElastic ?? 0.5) as number | DragElasticPerAxis | boolean;
			const dragListener = mp.dragListener !== false;

			const handle = createDrag(el, {
				axis,
				constraints,
				elastic,
				onDrag: mp.onDrag,
				onDragStart: mp.onDragStart,
				onDragEnd: mp.onDragEnd,
			});

			// Register beginDrag with dragControls so dragControls.start(event) works.
			let unregisterControls: (() => void) | undefined;
			if (dragControls) {
				unregisterControls = dragControls._mount({beginDrag: handle.beginDrag});
			}

			const onPointerDown = (event: PointerEvent) => {
				if (!dragListener) return;
				handle.beginDrag(event);
			};

			if (dragListener) {
				el.addEventListener('pointerdown', onPointerDown as EventListener);
			}

			return () => {
				handle.teardown();
				unregisterControls?.();
				el.removeEventListener('pointerdown', onPointerDown as EventListener);
			};
		}, [motionProps.drag, motionProps.dragConstraints, motionProps.dragElastic, motionProps.dragListener, dragControls]);

		// Render the underlying tag. SVG tags need namespace-aware creation, but
		// React handles that based on the tag name, so a plain JSX tag works.
		const Tag = tag as unknown as React.ElementType;
		return <Tag ref={elementRef as React.Ref<Element>} {...domProps} />;
	});

	// Set a displayName for devtools.
	Component.displayName = `motion.${tag}`;
	return Component;
}

/** Stable key for the animate prop so the effect only re-runs when it actually changes. */
function stableKey(animate: unknown): string {
	if (animate == null) return 'null';
	if (typeof animate === 'string') return `s:${animate}`;
	if (typeof animate === 'object') {
		try {
			return 'o:' + JSON.stringify(animate);
		} catch {
			return 'o:dynamic';
		}
	}
	return 'other';
}
