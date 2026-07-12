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

import {AnimatePresence, motion} from 'framer-motion';
import React from 'react';
import styles from '~/components/modals/shared/SettingsModalLayout.module.css';
import {
	getDesktopPanelTransition,
	getDesktopPanelVariants,
	getFadeMotion,
	type PageDirection,
} from '~/utils/motion/MotionPresets';

interface DesktopSettingsPanelTransitionProps {
	panelKey: string;
	direction: PageDirection;
	reducedMotion: boolean;
	fadeOnly?: boolean;
	className?: string;
	children: React.ReactNode;
}

export const DesktopSettingsPanelTransition: React.FC<DesktopSettingsPanelTransitionProps> = ({
	panelKey,
	direction,
	reducedMotion,
	fadeOnly = false,
	className,
	children,
}) => {
	const directionalVariants = React.useMemo(() => getDesktopPanelVariants(reducedMotion), [reducedMotion]);
	const fadeMotion = React.useMemo(() => getFadeMotion(reducedMotion), [reducedMotion]);
	const transition = React.useMemo(
		() => (fadeOnly ? fadeMotion.transition : getDesktopPanelTransition(reducedMotion)),
		[fadeMotion.transition, fadeOnly, reducedMotion],
	);

	return (
		<AnimatePresence mode="wait" initial={false} custom={direction}>
			<motion.div
				key={panelKey}
				custom={direction}
				variants={fadeOnly ? undefined : directionalVariants}
				initial={fadeOnly ? fadeMotion.initial : 'enter'}
				animate={fadeOnly ? fadeMotion.animate : 'center'}
				exit={fadeOnly ? fadeMotion.exit : 'exit'}
				transition={transition}
				className={className ?? styles.desktopPanelTransition}
				style={{willChange: 'transform, opacity'}}
			>
				{children}
			</motion.div>
		</AnimatePresence>
	);
};
