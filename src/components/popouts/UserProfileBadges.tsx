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
import {BugBeetleIcon, CrownIcon, PlanetIcon, RocketLaunchIcon, StarFourIcon} from '@phosphor-icons/react';
import {clsx} from 'clsx';
import {observer} from 'mobx-react-lite';
import React from 'react';
import {UserFlags, UserPremiumTypes} from '~/Constants';
import styles from '~/components/popouts/UserProfileBadges.module.css';
import FocusRing from '~/components/uikit/FocusRing/FocusRing';
import {Tooltip} from '~/components/uikit/Tooltip/Tooltip';
import {Routes} from '~/Routes';
import type {ProfileRecord} from '~/records/ProfileRecord';
import type {UserRecord} from '~/records/UserRecord';
import * as DateUtils from '~/utils/DateUtils';

type BadgeTone = 'gold' | 'teal' | 'rose' | 'amber' | 'violet';

interface Badge {
	key: string;
	tooltip: string;
	url: string;
	tone: BadgeTone;
	icon: React.ReactElement;
}

interface VirtualBadge {
	key: string;
	tooltip: string;
	url: string;
	component: React.ReactElement;
}

interface UserProfileBadgesProps {
	user: UserRecord;
	profile: ProfileRecord | null;
	isModal?: boolean;
	isMobile?: boolean;
	warningIndicator?: React.ReactNode;
}

export const UserProfileBadges: React.FC<UserProfileBadgesProps> = observer(
	({user, profile, isModal = false, isMobile = false, warningIndicator}) => {
		const {t} = useLingui();

		const badges = React.useMemo(() => {
			const result: Array<Badge> = [];

			if (user.flags & UserFlags.STAFF) {
				result.push({
					key: 'staff',
					tooltip: t`Astral Staff`,
					url: Routes.careers(),
					tone: 'gold',
					icon: <CrownIcon weight="fill" className={styles.badgeGlyph} />,
				});
			}

			if (user.flags & UserFlags.CTP_MEMBER) {
				result.push({
					key: 'ctp',
					tooltip: t`Astral Community Team`,
					url: Routes.careers(),
					tone: 'teal',
					icon: <RocketLaunchIcon weight="fill" className={styles.badgeGlyph} />,
				});
			}

			if (user.flags & UserFlags.PARTNER) {
				result.push({
					key: 'partner',
					tooltip: t`Astral Partner`,
					url: Routes.partners(),
					tone: 'rose',
					icon: <StarFourIcon weight="fill" className={styles.badgeGlyph} />,
				});
			}

			if (user.flags & UserFlags.BUG_HUNTER) {
				result.push({
					key: 'bug_hunter',
					tooltip: t`Astral Bug Hunter`,
					url: Routes.bugs(),
					tone: 'amber',
					icon: <BugBeetleIcon weight="fill" className={styles.badgeGlyph} />,
				});
			}

			if (profile?.premiumType && profile.premiumType !== UserPremiumTypes.NONE) {
				let tooltipText = t`Astral Plutonium`;

				if (profile.premiumType === UserPremiumTypes.LIFETIME) {
					if (profile.premiumSince) {
						const premiumSinceFormatted = DateUtils.getFormattedShortDate(profile.premiumSince);
						tooltipText = `Astral Visionary since ${premiumSinceFormatted}`;
					} else {
						tooltipText = `Astral Visionary`;
					}
				} else if (profile.premiumSince) {
					const premiumSinceFormatted = DateUtils.getFormattedShortDate(profile.premiumSince);
					tooltipText = `Astral Plutonium subscriber since ${premiumSinceFormatted}`;
				}

				result.push({
					key: 'premium',
					tooltip: tooltipText,
					url: Routes.plutonium(),
					tone: 'violet',
					icon: <PlanetIcon weight="fill" className={styles.badgeGlyph} />,
				});
			}

			return result;
		}, [user.flags, profile?.premiumType, profile?.premiumSince]);

		const virtualBadges = React.useMemo(() => {
			const result: Array<VirtualBadge> = [];

			if (profile?.premiumType === UserPremiumTypes.LIFETIME && profile.premiumLifetimeSequence != null) {
				const sequenceNumber = profile.premiumLifetimeSequence;

				result.push({
					key: 'lifetime_sequence',
					tooltip: `Visionary #${sequenceNumber}`,
					url: Routes.plutoniumVisionary(),
					component: (
						<div
							className={clsx(
								styles.virtualBadge,
								isModal && isMobile ? styles.virtualBadgeMobile : styles.virtualBadgeDesktop,
							)}
						>
							#{sequenceNumber}
						</div>
					),
				});
			}

			return result;
		}, [profile?.premiumType, profile?.premiumLifetimeSequence, isModal, isMobile]);

		if (badges.length === 0 && virtualBadges.length === 0) {
			return null;
		}

		const containerClassName = isModal
			? clsx(styles.containerModal, isMobile ? styles.containerModalMobile : styles.containerModalDesktop)
			: styles.containerPopout;

		const badgeSizeClassName = isModal && isMobile ? styles.badgeMobile : styles.badgeDesktop;
		const isDesktopInteractions = !isMobile;

		const renderInteractiveWrapper = (url: string, children: React.ReactNode, style?: React.CSSProperties) => {
			if (isDesktopInteractions) {
				return (
					<a href={url} target="_blank" rel="noopener noreferrer" className={styles.link} style={style}>
						{children}
					</a>
				);
			}

			return (
				<div className={styles.link} style={style}>
					{children}
				</div>
			);
		};

		const virtualBadgeStyle: React.CSSProperties = {
			WebkitTapHighlightColor: 'transparent',
			WebkitTouchCallout: 'none',
		};

		return (
			<div className={containerClassName}>
				{warningIndicator}
				{badges.map((badge) => {
					const toneClassName = getBadgeToneClassName(badge.tone);
					const badgeContent = (
						<span className={clsx(styles.badgeCoin, badgeSizeClassName, toneClassName)}>
							<span className={styles.badgeCoinShine} aria-hidden />
							{badge.icon}
						</span>
					);

					return (
						<Tooltip key={badge.key} text={badge.tooltip} maxWidth="xl">
							<FocusRing offset={-2}>{renderInteractiveWrapper(badge.url, badgeContent)}</FocusRing>
						</Tooltip>
					);
				})}
				{virtualBadges.map((badge) => (
					<Tooltip key={badge.key} text={badge.tooltip} maxWidth="xl">
						<FocusRing offset={-2}>{renderInteractiveWrapper(badge.url, badge.component, virtualBadgeStyle)}</FocusRing>
					</Tooltip>
				))}
			</div>
		);
	},
);

const getBadgeToneClassName = (tone: BadgeTone): string => {
	switch (tone) {
		case 'gold':
			return styles.badgeToneGold;
		case 'teal':
			return styles.badgeToneTeal;
		case 'rose':
			return styles.badgeToneRose;
		case 'amber':
			return styles.badgeToneAmber;
		case 'violet':
			return styles.badgeToneViolet;
	}
};
