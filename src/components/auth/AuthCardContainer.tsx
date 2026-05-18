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

import clsx from 'clsx';
import type {ReactNode} from 'react';
import authLayoutStyles from '~/components/layout/AuthLayout.module.css';
import styles from './AuthCardContainer.module.css';

export interface AuthCardContainerProps {
	showLogoSide?: boolean;
	children: ReactNode;
	isInert?: boolean;
	className?: string;
}

export function AuthCardContainer({showLogoSide = true, children, isInert = false, className}: AuthCardContainerProps) {
	return (
		<div className={clsx(authLayoutStyles.cardContainer, className)}>
			<div className={clsx(authLayoutStyles.card, !showLogoSide && authLayoutStyles.cardSingle)}>
				{showLogoSide && (
					<div className={authLayoutStyles.logoSide}>
						<div className={authLayoutStyles.wordmarkText}>Astral</div>
					</div>
				)}
				<div className={clsx(authLayoutStyles.formSide, !showLogoSide && authLayoutStyles.formSideSingle)}>
					{isInert ? <div className={styles.inertOverlay}>{children}</div> : children}
				</div>
			</div>
		</div>
	);
}
