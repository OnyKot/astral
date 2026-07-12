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
 * Drag implementation — pointer-driven, rAF-throttled transform writes.
 *
 * Only two consumers: Modal (drag="y", constraints top:0/bottom:320, elastic
 * per-axis, dragMomentum=false, onDrag + onDragEnd with offset/velocity) and
 * MobileMentionToast (drag="x", constraints left:0/right:0, elastic 0.2,
 * onDragEnd). We implement exactly that surface — no inertia (both consumers
 * set dragMomentum={false}), no layout, no dragDirectionLock beyond axis lock.
 *
 * The transform is written directly to `el.style.transform` in a rAF callback
 * (WAAPI isn't suitable for follow-the-cursor: you'd rebuild the animation on
 * every pointermove). Velocity is tracked for PanInfo and the dismiss check.
 */

import type {DragConstraints, DragElasticPerAxis, PanInfo} from '../types';

export interface DragConfig {
	axis: 'x' | 'y';
	constraints: DragConstraints;
	elastic: number | DragElasticPerAxis | boolean;
	onDrag?: (event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => void;
	onDragStart?: (event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => void;
	onDragEnd?: (event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => void;
}

interface DragState {
	startX: number;
	startY: number;
	lastX: number;
	lastY: number;
	lastT: number;
	velocityX: number;
	velocityY: number;
	offsetX: number;
	offsetY: number;
	baseTransform: string;
	rafPending: boolean;
}

export interface DragHandle {
	/** Start a drag from a pointer event (called by the element's pointerdown listener or by dragControls.start). */
	beginDrag: (event: PointerEvent | MouseEvent | TouchEvent) => void;
	/** Tear down all listeners. */
	teardown: () => void;
}

export function createDrag(element: HTMLElement | SVGElement, config: DragConfig): DragHandle {
	let state: DragState | null = null;
	let pointerId: number | null = null;

	const elasticFor = (side: 'top' | 'bottom' | 'left' | 'right'): number => {
		const e = config.elastic;
		if (typeof e === 'number') return e;
		if (e === true || e === undefined) return 0.5;
		if (e === false) return 0;
		return e[side] ?? 0.5;
	};

	const clamp = (offset: number, min: number, max: number, elasticMin: number, elasticMax: number): number => {
		// Within bounds: pass through. Beyond: apply elastic resistance.
		if (offset < min) {
			const excess = min - offset;
			return min - excess * elasticMin;
		}
		if (offset > max) {
			const excess = offset - max;
			return max + excess * elasticMax;
		}
		return offset;
	};

	const writeTransform = () => {
		if (!state) return;
		state.rafPending = false;
		if (config.axis === 'y') {
			(element as HTMLElement).style.transform = state.baseTransform ? `${state.baseTransform} translateY(${state.offsetY}px)` : `translateY(${state.offsetY}px)`;
		} else {
			(element as HTMLElement).style.transform = state.baseTransform ? `${state.baseTransform} translateX(${state.offsetX}px)` : `translateX(${state.offsetX}px)`;
		}
	};

	const onPointerMove = (event: PointerEvent) => {
		if (!state || pointerId !== event.pointerId) return;
		const dx = event.clientX - state.startX;
		const dy = event.clientY - state.startY;

		const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
		const dt = Math.max(now - state.lastT, 1);
		state.velocityX = (event.clientX - state.lastX) / (dt / 1000);
		state.velocityY = (event.clientY - state.lastY) / (dt / 1000);
		state.lastX = event.clientX;
		state.lastY = event.clientY;
		state.lastT = now;

		if (config.axis === 'y') {
			const min = config.constraints.top ?? -Infinity;
			const max = config.constraints.bottom ?? Infinity;
			state.offsetY = clamp(dy, min, max, elasticFor('top'), elasticFor('bottom'));
			state.offsetX = 0;
		} else {
			const min = config.constraints.left ?? -Infinity;
			const max = config.constraints.right ?? Infinity;
			state.offsetX = clamp(dx, min, max, elasticFor('left'), elasticFor('right'));
			state.offsetY = 0;
		}

		if (!state.rafPending) {
			state.rafPending = true;
			requestAnimationFrame(writeTransform);
		}

		config.onDrag?.(event, makePanInfo(state));
	};

	const onPointerUp = (event: PointerEvent) => {
		if (!state || pointerId !== event.pointerId) return;
		const info = makePanInfo(state);
		config.onDragEnd?.(event, info);
		cleanup();
	};

	const onPointerCancel = (event: PointerEvent) => {
		if (!state || pointerId !== event.pointerId) return;
		cleanup();
	};

	const cleanup = () => {
		window.removeEventListener('pointermove', onPointerMove as EventListener);
		window.removeEventListener('pointerup', onPointerUp as EventListener);
		window.removeEventListener('pointercancel', onPointerCancel as EventListener);
		state = null;
		pointerId = null;
	};

	const beginDrag = (event: PointerEvent | MouseEvent | TouchEvent) => {
		const point = normalizeEvent(event);
		if (!point) return;
		const baseTransform = (element as HTMLElement).style.transform || '';
		state = {
			startX: point.x,
			startY: point.y,
			lastX: point.x,
			lastY: point.y,
			lastT: typeof performance !== 'undefined' ? performance.now() : Date.now(),
			velocityX: 0,
			velocityY: 0,
			offsetX: 0,
			offsetY: 0,
			baseTransform,
			rafPending: false,
		};
		pointerId = (event as PointerEvent).pointerId ?? null;
		const info = makePanInfo(state);
		config.onDragStart?.(event, info);
		window.addEventListener('pointermove', onPointerMove as EventListener);
		window.addEventListener('pointerup', onPointerUp as EventListener);
		window.addEventListener('pointercancel', onPointerCancel as EventListener);
	};

	// Return a handle exposing beginDrag (for pointerdown / dragControls.start) + teardown.
	return {
		beginDrag,
		teardown: () => {
			cleanup();
		},
	};
}

function makePanInfo(state: DragState): PanInfo {
	return {
		point: {x: state.lastX, y: state.lastY},
		offset: {x: state.offsetX, y: state.offsetY},
		velocity: {x: state.velocityX, y: state.velocityY},
		delta: {x: state.offsetX, y: state.offsetY},
	};
}

function normalizeEvent(event: PointerEvent | MouseEvent | TouchEvent): {x: number; y: number} | null {
	if (event instanceof PointerEvent || event instanceof MouseEvent) {
		return {x: event.clientX, y: event.clientY};
	}
	if (event instanceof TouchEvent && event.touches.length > 0) {
		return {x: event.touches[0].clientX, y: event.touches[0].clientY};
	}
	return null;
}
