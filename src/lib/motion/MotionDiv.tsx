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

import {motion, type HTMLMotionProps} from 'framer-motion';
import {forwardRef} from 'react';
import {entrance, exit, type MotionEffectName} from '~/lib/motion/effects';

export interface MotionDivProps extends Omit<HTMLMotionProps<'div'>, 'initial' | 'animate' | 'exit' | 'transition'> {
	/*
	 * Named entrance effect from the registry (e.g. 'springInUp', 'springPop').
	 * Resolved to spring-physics initial/animate/transition props.
	 */
	effect?: MotionEffectName;
	/*
	 * Optional overrides for the effect's `from` (initial) values, e.g. a
	 * custom travel distance: from={{y: 60}}.
	 */
	from?: Partial<Record<string, number>>;
	/*
	 * When true, also emits a matching exit variant for use inside
	 * <AnimatePresence>. The exit reverses the entrance with a faster settle.
	 */
	withExit?: boolean;
}

/*
 * Declarative physics-animated div. Drop-in for `<motion.div>` that takes a
 * named effect instead of hand-rolled transition props:
 *
 *   <MotionDiv effect="springInUp">...</MotionDiv>
 *   <AnimatePresence>
 *     {open && <MotionDiv effect="springInScale" withExit>...</MotionDiv>}
 *   </AnimatePresence>
 *
 * Respects prefers-reduced-motion automatically (collapses to instant).
 */
export const MotionDiv = forwardRef<HTMLDivElement, MotionDivProps>(function MotionDiv(
	{effect, from, withExit, ...rest},
	forwardedRef,
) {
	if (!effect) {
		return <motion.div ref={forwardedRef} {...rest} />;
	}

	const entry = entrance(effect, {from});
	const props = withExit ? {...entry, ...exit(effect)} : entry;

	return <motion.div ref={forwardedRef} {...props} {...rest} />;
});
