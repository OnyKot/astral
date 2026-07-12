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
 * Type contracts for the WAAPI animation engine.
 *
 * These mirror the subset of framer-motion's public types that the codebase
 * actually imports (see the API-surface map). They are intentionally loose
 * where framer is loose: variants are untyped object literals, and style
 * values are `number | string` (plus arrays for keyframes, which we don't use
 * but accept for compatibility). Everything is shaped so the alias shim can
 * re-export these names with signatures the 78 consumer files already expect.
 */

/**
 * A single animatable style value, OR a keyframe array. framer-motion accepts
 * arrays as the `animate` target to play a multi-step keyframe animation
 * (`scale: [1, 1.2, 1]`, `boxShadow: [a, b, c]`). The engine forwards these to
 * WAAPI as a keyframe list verbatim.
 */
export type MotionValueLike = number | string | (number | string)[];

/**
 * The style bag a motion component accepts. Keys are CSS properties or the
 * shorthand transform tokens framer uses (`x`, `y`, `scale`, `rotate`, ...).
 * Values are the target for `animate` / the source for `initial` / etc.
 */
export type MotionStyle = Record<string, MotionValueLike | undefined>;

/**
 * A variant is either a static style bag or a function of the `custom` value
 * passed to the component / AnimatePresence. framer-motion calls these with
 * the latest `custom` at resolve time.
 */
export type Variant = MotionStyle | ((custom: any) => MotionStyle);

/** A variants map keyed by the variant names referenced in initial/animate/exit. */
export type Variants = Record<string, Variant>;

/**
 * Transition describes how to get from one value to another. We support the
 * two shapes used in the wild: spring physics and tween with an ease.
 * `delay` and per-property overrides (`{opacity: {...}}`) are supported.
 */
export interface SpringTransition {
	type: 'spring';
	stiffness?: number;
	damping?: number;
	mass?: number;
	velocity?: number;
	restDelta?: number;
	restSpeed?: number;
	bounce?: number;
	duration?: number;
	delay?: number;
}

export interface TweenTransition {
	type?: 'tween';
	duration: number;
	ease?: Ease | Ease[];
	delay?: number;
	/**
	 * Number of times to repeat. `Infinity` (or `Number.POSITIVE_INFINITY`)
	 * loops forever — used by the call-pulse / signal-pulse loops. 0 = once.
	 */
	repeat?: number;
	/** Delay between each repeat, in seconds. */
	repeatDelay?: number;
	/** How a repeat reverses: 'loop' restarts, 'reverse' plays back, 'mirror' alternates. */
	repeatType?: 'loop' | 'reverse' | 'mirror';
	easeInOutSine?: never;
}

/** Per-property transition overrides: `{opacity: {duration: 0.2}, x: {type: 'spring', ...}}`. */
export interface PerPropertyTransition {
	[prop: string]: Transition;
}

/** The value type of a single per-property transition entry. */
export type TransitionValue = SpringTransition | TweenTransition;

export type Transition = SpringTransition | TweenTransition | PerPropertyTransition;

/** Easing: a named string or a cubic-bezier [x1, y1, x2, y2]. */
export type Ease = 'linear' | 'easeIn' | 'easeOut' | 'easeInOut' | 'easeInOutSine' | readonly [number, number, number, number];

/**
 * PanInfo handed to drag handlers. Matches framer-motion's shape: the pointer
 * offset from drag start and its instantaneous velocity, both per-axis.
 */
export interface PanInfo {
	point: {x: number; y: number};
	offset: {x: number; y: number};
	velocity: {x: number; y: number};
	delta: {x: number; y: number};
}

/**
 * AnimationControls — the imperative handle returned by `useAnimationControls`.
 * `.start()` plays a target set and resolves when it finishes; `.set()` jumps
 * synchronously. Components register their element so `.start()`/`.set()` have
 * something to act on.
 */
export interface AnimationControls {
	start: (definition: TargetAndTransition | Variant | string, transitionOverride?: Transition) => Promise<void>;
	set: (definition: TargetAndTransition | Variant | string) => void;
	stop: () => void;
	/** Internal: the motion component mounts its element here. */
	_mount: (element: HTMLElement | SVGElement | null) => () => void;
}

/** Back-compat alias — framer-motion v12 renamed `AnimationControls` to `LegacyAnimationControls`. */
export type LegacyAnimationControls = AnimationControls;

/**
 * A `TargetAndTransition` is the plain object form of an animation target
 * (the `animate` prop value when it isn't a variant name or controls). The
 * index signature allows a nested `transition` key (framer accepts it inline),
 * in addition to the explicit optional one.
 */
export type TargetAndTransition = {
	[key: string]: MotionValueLike | Transition | undefined;
	transition?: Transition;
};

/**
 * MotionValue — a reactive number/string box with `.get()`, `.set()`, and
 * `.on('change', cb)` returning an unsubscribe. Not React-reactive; consumers
 * subscribe imperatively (GuildHeader/ChannelListContent do this for scrollY).
 */
export interface MotionValue<T = number> {
	get: () => T;
	set: (value: T) => void;
	on: (event: 'change', callback: (latest: T) => void) => () => void;
	/**
	 * framer exposes these; we keep them as no-op-ish stubs so type-only
	 * consumers compile, but the engine doesn't drive them.
	 */
	getVelocity: () => number;
	destroy: () => void;
}

/**
 * DragControls — `useDragControls()` returns this; a touch listener calls
 * `.start(event)` to begin a drag on the bound motion element.
 */
export interface DragControls {
	start: (event: React.PointerEvent | PointerEvent | MouseEvent | TouchEvent, opts?: {snapToCursor?: boolean}) => void;
	/** Internal: the motion component registers its drag implementation here. */
	_mount: (impl: DragImpl | null) => () => void;
}

/** The drag implementation a motion component wires up internally. */
export interface DragImpl {
	beginDrag: (event: PointerEvent | MouseEvent | TouchEvent) => void;
}

/** Drag constraints: a pixel bounding box relative to the element's start. */
export interface DragConstraints {
	top?: number;
	bottom?: number;
	left?: number;
	right?: number;
}

/** Per-axis elastic override (fraction of overflow allowed beyond constraints). */
export interface DragElasticPerAxis {
	top?: number;
	bottom?: number;
	left?: number;
	right?: number;
}

/**
 * The full motion-component prop surface we honor. Anything outside this
 * (layout, layoutId, whileFocus, ...) is accepted and ignored — see the
 * API-surface map for the exact zero-usage set.
 */
export interface MotionProps {
	initial?: boolean | TargetAndTransition | string | Variants;
	animate?: TargetAndTransition | string | Variants | AnimationControls;
	exit?: TargetAndTransition | string | Variants;
	whileHover?: TargetAndTransition | Variant;
	whileTap?: TargetAndTransition | Variant;
	whileDrag?: TargetAndTransition | Variant;
	whileFocus?: TargetAndTransition | Variant;
	whileInView?: TargetAndTransition | Variant;
	variants?: Variants;
	custom?: unknown;
	transition?: Transition;
	/** Accepted as a no-op (only NagbarContainer uses it; FLIP is out of scope). */
	layout?: boolean | 'position' | 'size';
	layoutId?: string;
	/** Drag config — only Modal (y) and MobileMentionToast (x) use it. */
	drag?: boolean | 'x' | 'y';
	dragControls?: DragControls;
	dragListener?: boolean;
	dragDirectionLock?: boolean;
	dragMomentum?: boolean;
	dragConstraints?: DragConstraints | false;
	dragElastic?: number | DragElasticPerAxis | boolean;
	onDrag?: (event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => void;
	onDragStart?: (event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => void;
	onDragEnd?: (event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => void;
	onAnimationStart?: () => void;
	onAnimationComplete?: () => void;
	onHoverStart?: (event: MouseEvent) => void;
	onHoverEnd?: (event: MouseEvent) => void;
	onPan?: (event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => void;
	onTap?: (event: MouseEvent) => void;
	pathLength?: number;
	style?: MotionStyle & React.CSSProperties;
}

/**
 * HTMLMotionProps — the full props for a motion component of a given tag.
 * Spreads the native element attributes alongside MotionProps. We keep it
 * permissive so the 78 consumer files type-check without per-tag plumbing.
 */
export type HTMLMotionProps<K extends keyof React.JSX.IntrinsicElements> = Omit<
	React.JSX.IntrinsicElements[K],
	'animate' | 'initial' | 'exit' | 'transition' | 'onAnimationStart' | 'onAnimationComplete' | 'onDrag' | 'onDragStart' | 'onDragEnd' | 'style'
> &
	MotionProps & {
		style?: MotionStyle & React.CSSProperties;
	};
