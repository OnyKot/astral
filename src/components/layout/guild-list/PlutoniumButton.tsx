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

import {useLingui} from '@lingui/react/macro';
import {PlanetIcon} from '@phosphor-icons/react';
import {clsx} from 'clsx';
import {AnimatePresence, motion} from 'framer-motion';
import {observer} from 'mobx-react-lite';
import React from 'react';
import * as PremiumModalActionCreators from '~/actions/PremiumModalActionCreators';
import FocusRing from '~/components/uikit/FocusRing/FocusRing';
import {Tooltip} from '~/components/uikit/Tooltip/Tooltip';
import {useHover} from '~/hooks/useHover';
import {useMergeRefs} from '~/hooks/useMergeRefs';
import MobileLayoutStore from '~/stores/MobileLayoutStore';
import styles from '../GuildsLayout.module.css';

interface PlutoniumButtonProps {
	className?: string;
	isDocked?: boolean;
}

export const PlutoniumButton = observer(({className, isDocked = false}: PlutoniumButtonProps = {}) => {
	const {t} = useLingui();
	const [hoverRef, isHovering] = useHover();
	const buttonRef = React.useRef<HTMLButtonElement | null>(null);
	const iconRef = React.useRef<HTMLDivElement | null>(null);
	const mergedButtonRef = useMergeRefs([hoverRef, buttonRef]);
	const isMobile = MobileLayoutStore.isMobileLayout();
	const isSelected = false;

	const handleSelect = () => {
		PremiumModalActionCreators.open();
	};

	const dockIndicatorSize = 9;
	const indicatorHeight = isDocked ? dockIndicatorSize : isSelected ? 40 : isHovering ? 20 : 8;
	const isActive = isHovering || isSelected;

	return (
		<Tooltip position={isDocked ? 'top' : 'right'} size="large" text={t`Plutonium`}>
			<FocusRing offset={-2} focusTarget={buttonRef} ringTarget={iconRef}>
				<button
					type="button"
					className={clsx(styles.AstralButton, styles.plutoniumButton, className)}
					aria-label={t`Plutonium`}
					aria-pressed={isSelected}
					onClick={handleSelect}
					ref={mergedButtonRef}
				>
					<AnimatePresence>
						{(isSelected || isHovering) && (
							<div className={clsx(styles.guildIndicator, isDocked && styles.guildIndicatorDocked)}>
								<motion.span
									className={clsx(styles.guildIndicatorBar, isDocked && styles.guildIndicatorBarDocked)}
									initial={false}
									animate={
										isDocked
											? {opacity: 1, scale: 1, height: indicatorHeight, width: indicatorHeight, y: 0}
											: {opacity: 1, scale: 1, height: indicatorHeight}
									}
									exit={isDocked ? {opacity: 0, scale: 0.75, y: 2} : {opacity: 0, scale: 0}}
									transition={
										isDocked
											? {type: 'spring', stiffness: 440, damping: 30, mass: 0.5}
											: {duration: 0.2, ease: [0.25, 0.1, 0.25, 1]}
									}
								/>
							</div>
						)}
					</AnimatePresence>
					<div className={styles.relative}>
						<motion.div
							ref={iconRef}
							className={clsx(
								styles.AstralButtonIcon,
								styles.plutoniumButtonIcon,
								isSelected && styles.AstralButtonIconSelected,
							)}
							animate={{borderRadius: isActive ? '30%' : '50%'}}
							initial={false}
							transition={{duration: 0.07, ease: 'easeOut'}}
							whileHover={{borderRadius: '30%'}}
						>
							<PlanetIcon
								weight={isMobile ? 'regular' : 'fill'}
								className={clsx(styles.favoritesIcon, styles.plutoniumPlanetIcon)}
							/>
						</motion.div>
					</div>
				</button>
			</FocusRing>
		</Tooltip>
	);
});
