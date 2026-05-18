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

import {Trans} from '@lingui/react/macro';
import {clsx} from 'clsx';
import {observer} from 'mobx-react-lite';
import type React from 'react';
import type {ProfileAccentEffectPreset} from '~/utils/ProfileAccentEffectUtils';
import styles from './ProfileCardLayout.module.css';

interface ProfileCardLayoutProps {
	borderColor: string;
	accentEffectPreset?: ProfileAccentEffectPreset;
	showPreviewLabel?: boolean;
	hoverRef?: (instance: HTMLDivElement | null) => void;
	className?: string;
	children: React.ReactNode;
}

export const ProfileCardLayout: React.FC<ProfileCardLayoutProps> = observer(
	({borderColor, accentEffectPreset = 'none', showPreviewLabel = false, hoverRef, className, children}) => {
		return (
			<div>
				{showPreviewLabel && (
					<div className={styles.previewLabel}>
						<Trans>Profile Preview</Trans>
					</div>
				)}

				<div
					ref={hoverRef}
					className={clsx(styles.profileCard, className)}
					data-accent-effect={accentEffectPreset}
					style={{borderColor, '--profile-accent-base': borderColor} as React.CSSProperties}
				>
					{children}
				</div>
			</div>
		);
	},
);
