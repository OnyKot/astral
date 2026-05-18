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

import {observer} from 'mobx-react-lite';
import type React from 'react';
import FocusRing from '~/components/uikit/FocusRing/FocusRing';
import {StatusAwareAvatar} from '~/components/uikit/StatusAwareAvatar';
import type {UserRecord} from '~/records/UserRecord';
import styles from './ProfileCardBanner.module.css';

interface ProfileCardBannerProps {
	bannerUrl: string | null;
	bannerColor: string;
	user: UserRecord;
	avatarUrl: string | null;
	hoverAvatarUrl: string | null;
	disablePresence?: boolean;
	isClickable?: boolean;
	onAvatarClick?: () => void;
	headerHeight?: number;
}

export const ProfileCardBanner: React.FC<ProfileCardBannerProps> = observer(
	({
		bannerUrl,
		bannerColor,
		user,
		avatarUrl,
		hoverAvatarUrl,
		disablePresence = false,
		isClickable = true,
		onAvatarClick,
		headerHeight = 140,
	}) => {
		const bannerHeight = headerHeight <= 128 ? 92 : 105;
		const avatarTop = Math.max(42, bannerHeight - 50);

		const bannerStyle = {
			height: bannerHeight,
			minHeight: bannerHeight,
			backgroundColor: bannerColor,
			...(bannerUrl ? {backgroundImage: `url(${bannerUrl})`} : {}),
		};

		return (
			<header
				className={styles.headerSection}
				style={
					{
						height: headerHeight,
						'--profile-banner-height': `${bannerHeight}px`,
					} as React.CSSProperties
				}
			>
				<div className={styles.bannerWrapper} style={{minHeight: bannerHeight}}>
					<div className={styles.banner} style={bannerStyle} />
					<div className={styles.bannerCutout} aria-hidden="true" />
				</div>

				<FocusRing offset={-2}>
					<button type="button" onClick={onAvatarClick} className={styles.avatarButton} style={{top: avatarTop}}>
						<StatusAwareAvatar
							size={80}
							user={user}
							avatarUrl={avatarUrl}
							hoverAvatarUrl={hoverAvatarUrl}
							disablePresence={disablePresence}
							isClickable={isClickable}
						/>
					</button>
				</FocusRing>
			</header>
		);
	},
);
