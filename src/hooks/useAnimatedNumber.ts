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
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with Astral. If not, see <https://www.gnu.org/licenses/>.
 */

import React from 'react';
import AccessibilityStore from '~/stores/AccessibilityStore';

interface UseAnimatedNumberOptions {
	durationMs?: number;
}

const easeOutCubic = (t: number) => 1 - (1 - t) ** 3;

export function useAnimatedNumber(value: number, options?: UseAnimatedNumberOptions): number {
	const targetValue = Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
	const prefersReducedMotion = AccessibilityStore.useReducedMotion;
	const [displayValue, setDisplayValue] = React.useState<number>(targetValue);
	const previousValueRef = React.useRef<number>(targetValue);

	React.useEffect(() => {
		if (prefersReducedMotion) {
			previousValueRef.current = targetValue;
			setDisplayValue(targetValue);
			return;
		}

		const startValue = previousValueRef.current;
		const endValue = targetValue;

		if (startValue === endValue) {
			setDisplayValue(endValue);
			return;
		}

		const delta = Math.abs(endValue - startValue);
		const durationMs = Math.min(Math.max(options?.durationMs ?? 620, 220), 1200) + Math.min(delta * 1.5, 340);
		const startTime = performance.now();
		let rafId = 0;

		const tick = (time: number) => {
			const progress = Math.min((time - startTime) / durationMs, 1);
			const eased = easeOutCubic(progress);
			const nextValue = Math.round(startValue + (endValue - startValue) * eased);
			setDisplayValue(nextValue);

			if (progress < 1) {
				rafId = requestAnimationFrame(tick);
				return;
			}

			previousValueRef.current = endValue;
		};

		rafId = requestAnimationFrame(tick);
		return () => cancelAnimationFrame(rafId);
	}, [targetValue, prefersReducedMotion, options?.durationMs]);

	return displayValue;
}
