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

import {AnimatePresence, motion, useReducedMotion} from 'framer-motion';
import {observer} from 'mobx-react-lite';
import type React from 'react';
import MobileLayoutStore from '~/stores/MobileLayoutStore';
import styles from './NagbarContainer.module.css';
import {DesktopDownloadNagbar} from './nagbars/DesktopDownloadNagbar';
import {DesktopNotificationNagbar} from './nagbars/DesktopNotificationNagbar';
import {EmailVerificationNagbar} from './nagbars/EmailVerificationNagbar';
import {GiftInventoryNagbar} from './nagbars/GiftInventoryNagbar';
import {MobileDownloadNagbar} from './nagbars/MobileDownloadNagbar';
import {PendingBulkDeletionNagbar} from './nagbars/PendingBulkDeletionNagbar';
import {PhoneVerificationNagbar} from './nagbars/PhoneVerificationNagbar';
import {PremiumExpiredNagbar} from './nagbars/PremiumExpiredNagbar';
import {PremiumGracePeriodNagbar} from './nagbars/PremiumGracePeriodNagbar';
import {PremiumOnboardingNagbar} from './nagbars/PremiumOnboardingNagbar';
import {UnclaimedAccountNagbar} from './nagbars/UnclaimedAccountNagbar';
import {type NagbarState, NagbarType} from './types';

interface NagbarContainerProps {
	nagbars: Array<NagbarState>;
}

export const NagbarContainer: React.FC<NagbarContainerProps> = observer(({nagbars}) => {
	const mobileLayout = MobileLayoutStore;
	const reducedMotion = useReducedMotion() ?? false;

	if (nagbars.length === 0) return null;

	return (
		<div className={styles.container}>
			<AnimatePresence initial={false} mode="popLayout">
				{nagbars.map((nagbar) => {
					let content: React.ReactNode = null;
					switch (nagbar.type) {
						case NagbarType.UNCLAIMED_ACCOUNT:
							content = <UnclaimedAccountNagbar isMobile={mobileLayout.enabled} />;
							break;
						case NagbarType.EMAIL_VERIFICATION:
							content = <EmailVerificationNagbar isMobile={mobileLayout.enabled} />;
							break;
						case NagbarType.PHONE_VERIFICATION:
							content = <PhoneVerificationNagbar isMobile={mobileLayout.enabled} />;
							break;
						case NagbarType.BULK_DELETE_PENDING:
							content = <PendingBulkDeletionNagbar isMobile={mobileLayout.enabled} />;
							break;
						case NagbarType.DESKTOP_NOTIFICATION:
							content = <DesktopNotificationNagbar isMobile={mobileLayout.enabled} />;
							break;
						case NagbarType.PREMIUM_GRACE_PERIOD:
							content = <PremiumGracePeriodNagbar isMobile={mobileLayout.enabled} />;
							break;
						case NagbarType.PREMIUM_EXPIRED:
							content = <PremiumExpiredNagbar isMobile={mobileLayout.enabled} />;
							break;
						case NagbarType.PREMIUM_ONBOARDING:
							content = <PremiumOnboardingNagbar isMobile={mobileLayout.enabled} />;
							break;
						case NagbarType.GIFT_INVENTORY:
							content = <GiftInventoryNagbar isMobile={mobileLayout.enabled} />;
							break;
						case NagbarType.DESKTOP_DOWNLOAD:
							content = <DesktopDownloadNagbar isMobile={mobileLayout.enabled} />;
							break;
						case NagbarType.MOBILE_DOWNLOAD:
							content = <MobileDownloadNagbar isMobile={mobileLayout.enabled} />;
							break;
						default:
							content = null;
					}

					if (!content) return null;

					return (
						<motion.div
							key={nagbar.type}
							layout
							style={{width: 'min(100%, 52rem)', pointerEvents: 'auto', transformOrigin: 'top center', willChange: 'transform, opacity'}}
							initial={reducedMotion ? {opacity: 0} : {opacity: 0, y: -10, scale: 0.985}}
							animate={reducedMotion ? {opacity: 1} : {opacity: 1, y: 0, scale: 1}}
							exit={reducedMotion ? {opacity: 0} : {opacity: 0, y: -8, scale: 0.99}}
							transition={
								reducedMotion
									? {duration: 0.12}
									: {type: 'spring', stiffness: 420, damping: 34, mass: 0.72}
							}
						>
							{content}
						</motion.div>
					);
				})}
			</AnimatePresence>
		</div>
	);
});
