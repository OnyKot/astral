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

import type {HTMLMotionProps, Variants} from 'framer-motion';

type MotionProps = Pick<HTMLMotionProps<'div'>, 'initial' | 'animate' | 'exit' | 'whileHover' | 'whileTap' | 'transition'>;

export const ARC_EASE = [0.22, 1, 0.36, 1] as const;
const STARTUP_ENTRANCE_MOTION_MS = 4500;

export function shouldRunEntranceMotion(): boolean {
	if (typeof performance === 'undefined') {
		return true;
	}
	return performance.now() <= STARTUP_ENTRANCE_MOTION_MS;
}

function shouldSkipEntranceMotion(reducedMotion: boolean): boolean {
	return reducedMotion || !shouldRunEntranceMotion();
}

export const SPRING_SNAPPY = {
	type: 'spring' as const,
	stiffness: 300,
	damping: 34,
	mass: 0.86,
};

export const SPRING_PAGE = {
	type: 'spring' as const,
	stiffness: 260,
	damping: 34,
	mass: 1,
};

export type PageDirection = 'forward' | 'backward';

export function getPageTransition(reducedMotion: boolean) {
	if (reducedMotion) {
		return {duration: 0};
	}
	return {duration: 0.18, ease: ARC_EASE};
}

export function getPageHeaderVariants(reducedMotion: boolean) {
	if (reducedMotion) {
		return {
			enter: () => ({opacity: 1, x: 0}),
			center: {opacity: 1, x: 0},
			exit: () => ({opacity: 1, x: 0}),
		};
	}
	return {
		enter: (direction: PageDirection) => ({
			opacity: 0,
			x: direction === 'forward' ? 12 : -10,
		}),
		center: {opacity: 1, x: 0},
		exit: (direction: PageDirection) => ({
			opacity: 0,
			x: direction === 'forward' ? -8 : 10,
		}),
	};
}

export function getPageContentVariants(reducedMotion: boolean) {
	if (reducedMotion) {
		return {
			enter: () => ({opacity: 1, x: 0, scale: 1}),
			center: {opacity: 1, x: 0, scale: 1},
			exit: () => ({opacity: 1, x: 0, scale: 1}),
		};
	}
	return {
		enter: (direction: PageDirection) => ({
			opacity: 0,
			x: direction === 'forward' ? 24 : -14,
			scale: 1,
			zIndex: direction === 'forward' ? 2 : 0,
		}),
		center: {
			opacity: 1,
			x: 0,
			scale: 1,
			zIndex: 1,
		},
		exit: (direction: PageDirection) => ({
			opacity: 0,
			x: direction === 'forward' ? -14 : 24,
			scale: 1,
			zIndex: direction === 'forward' ? 0 : 2,
		}),
	};
}

export function getDesktopPanelDirection<T extends string>(
	previousTab: T | null | undefined,
	nextTab: T | null | undefined,
	tabOrder: ReadonlyArray<T>,
): PageDirection {
	if (!previousTab || !nextTab || previousTab === nextTab) {
		return 'forward';
	}
	const previousIndex = tabOrder.indexOf(previousTab);
	const nextIndex = tabOrder.indexOf(nextTab);
	if (previousIndex < 0 || nextIndex < 0) {
		return 'forward';
	}
	return nextIndex >= previousIndex ? 'forward' : 'backward';
}

export function getDesktopPanelVariants(reducedMotion: boolean) {
	if (reducedMotion) {
		return {
			enter: () => ({opacity: 1, x: 0, y: 0}),
			center: {opacity: 1, x: 0, y: 0},
			exit: () => ({opacity: 1, x: 0, y: 0}),
		};
	}
	return {
		enter: (direction: PageDirection) => ({
			opacity: 0,
			x: direction === 'forward' ? 10 : -8,
			y: 3,
		}),
		center: {opacity: 1, x: 0, y: 0},
		exit: (direction: PageDirection) => ({
			opacity: 0,
			x: direction === 'forward' ? -7 : 9,
			y: 2,
		}),
	};
}

export function getDesktopPanelTransition(reducedMotion: boolean) {
	if (reducedMotion) {
		return {duration: 0};
	}
	return {duration: 0.16, ease: ARC_EASE};
}

export function getDesktopModalMotion(reducedMotion: boolean): MotionProps {
	if (shouldSkipEntranceMotion(reducedMotion)) {
		return {
			initial: false,
			animate: {opacity: 1},
			exit: {opacity: 0},
			transition: {duration: 0},
		};
	}
	return {
		initial: {opacity: 0, scale: 0.985, y: 4},
		animate: {opacity: 1, scale: 1, y: 0},
		exit: {opacity: 0, scale: 0.995, y: 2},
		transition: {duration: 0.16, ease: ARC_EASE},
	};
}

export function getEnterMotion(reducedMotion: boolean): MotionProps {
	if (shouldSkipEntranceMotion(reducedMotion)) {
		return {};
	}
	return {
		initial: {opacity: 0, y: 5},
		animate: {opacity: 1, y: 0},
		transition: {duration: 0.16, ease: ARC_EASE},
	};
}

export function getItemMotion(reducedMotion: boolean, delay = 0): MotionProps {
	if (shouldSkipEntranceMotion(reducedMotion)) {
		return {};
	}
	return {
		initial: {opacity: 0, y: 4},
		animate: {opacity: 1, y: 0},
		transition: {duration: 0.14, ease: ARC_EASE, delay},
	};
}

export function getPressMotion(reducedMotion: boolean): MotionProps {
	if (reducedMotion) {
		return {};
	}
	return {
		whileTap: {scale: 0.995},
		transition: {duration: 0.12, ease: ARC_EASE},
	};
}

export function getFadeMotion(reducedMotion: boolean): MotionProps {
	if (shouldSkipEntranceMotion(reducedMotion)) {
		return {};
	}
	return {
		initial: {opacity: 0},
		animate: {opacity: 1},
		exit: {opacity: 0},
		transition: {duration: 0.14, ease: ARC_EASE},
	};
}

export function getScalePopMotion(reducedMotion: boolean): MotionProps {
	if (shouldSkipEntranceMotion(reducedMotion)) {
		return {};
	}
	return {
		initial: {opacity: 0, y: 3},
		animate: {opacity: 1, y: 0},
		exit: {opacity: 0, y: 2},
		transition: {duration: 0.14, ease: ARC_EASE},
	};
}

export function getFabMotion(reducedMotion: boolean): MotionProps {
	if (shouldSkipEntranceMotion(reducedMotion)) {
		return {
			initial: false,
			animate: {opacity: 1},
			exit: {opacity: 0},
			transition: {duration: 0.12},
		};
	}
	return {
		initial: {opacity: 0, y: 5, scale: 0.98},
		animate: {opacity: 1, y: 0, scale: 1},
		exit: {opacity: 0, y: 4, scale: 0.99},
		transition: {duration: 0.16, ease: ARC_EASE},
	};
}

export const staggerContainerVariants: Variants = {
	hidden: {},
	show: {
		transition: {
			staggerChildren: 0.012,
		},
	},
};

export const staggerItemVariants: Variants = {
	hidden: {opacity: 0, y: 4},
	show: {
		opacity: 1,
		y: 0,
		transition: {
			duration: 0.14,
			ease: ARC_EASE,
		},
	},
};
