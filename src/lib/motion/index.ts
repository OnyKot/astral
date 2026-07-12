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
 * Physics-based motion module.
 *
 * A gsap.effects-style named-effect registry built on the in-tree WAAPI
 * animation engine (`~/lib/anim`). Every effect is spring-physics driven
 * (mass / stiffness / damping), not linear easing, so motion has weight and
 * natural settle. See [[effects]] for the registry and [[MotionDiv]] for the
 * declarative component.
 */

export {MotionDiv, type MotionDivProps} from './MotionDiv';
export {
	MOTION_EFFECTS,
	SPRINGS,
	entrance,
	exit,
	resolveEffect,
	useMotionEffect,
	type MotionEffect,
	type MotionEffectName,
	type SpringName,
	type UseMotionEffectResult,
} from './effects';
