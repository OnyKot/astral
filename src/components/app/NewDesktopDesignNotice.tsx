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
import {XIcon} from '@phosphor-icons/react';
import {motion, useReducedMotion} from 'framer-motion';
import {observer} from 'mobx-react-lite';
import React from 'react';
import {ComponentDispatch} from '~/lib/ComponentDispatch';
import MobileLayoutStore from '~/stores/MobileLayoutStore';
import UserStore from '~/stores/UserStore';
import {hasSeenDesktopDesignNotice, markDesktopDesignNoticeSeen} from './newDesktopDesignNoticeStorage';
import styles from './NewDesktopDesignNotice.module.css';

const ARC_EASE = [0.22, 1, 0.36, 1] as const;

export const NewDesktopDesignNotice = observer(() => {
	const {t} = useLingui();
	const reducedMotion = useReducedMotion() ?? false;
	const username = UserStore.currentUser?.username?.trim();
	const isDesktop = !MobileLayoutStore.isMobileLayout();
	const [isVisible, setIsVisible] = React.useState(false);

	React.useEffect(() => {
		return ComponentDispatch.subscribe('DESKTOP_DESIGN_NOTICE_OPEN', () => {
			if (!isDesktop || !username || hasSeenDesktopDesignNotice(username)) {
				return;
			}
			markDesktopDesignNoticeSeen(username);
			setIsVisible(true);
		});
	}, [isDesktop, username]);

	const handleDismiss = React.useCallback(() => {
		if (username) {
			markDesktopDesignNoticeSeen(username);
		}
		setIsVisible(false);
	}, [username]);

	if (!isDesktop || !username || !isVisible) {
		return null;
	}

	const copy = {
		dialogLabel: t`Astral visual refresh`,
		badge: t`ASTRAL: Massive Upgrade`,
		kicker: t`Performance upgrade`,
		title: t`We did not just speed up Astral. We rebuilt it to feel instant.`,
		description: t`New infrastructure, fresh features, and a reimagined communication flow are already live. Chat, calls, and settings now respond at the limit of what your device can deliver.`,
		slogan: t`Cleaner signal. Better focus.`,
		featureOneTitle: t`Even more speed`,
		featureOneBody: t`Heavy UI layers are gone. A reactive architecture makes actions complete faster than you expect.`,
		featureTwoTitle: t`New infra + everything else`,
		featureTwoBody: t`Core systems were rewritten with WebSocket 2.0 and aggressive preloading, making Astral feel instantly endless.`,
		close: t`Close`,
		continue: t`Continue to Astral`,
		heroSubline: t`Where ideas take shape in silence and focus`,
		heroFeatureOne: t`More speed`,
		heroFeatureTwo: t`Stable services`,
		heroFeatureThree: t`Ready to grow`,
		heroFeatureFour: t`Lower costs`,
	};

	return (
		<motion.div
			className={styles.backdrop}
			initial={reducedMotion ? false : {opacity: 0}}
			animate={{opacity: 1}}
			exit={{opacity: 0}}
			transition={{duration: 0.28, ease: ARC_EASE}}
		>
			<motion.aside
				className={styles.notice}
				initial={reducedMotion ? false : {opacity: 0, y: 18, scale: 0.985}}
				animate={reducedMotion ? {} : {opacity: 1, y: 0, scale: 1}}
				exit={reducedMotion ? {} : {opacity: 0, y: 12, scale: 0.985}}
				transition={{duration: 0.34, ease: ARC_EASE}}
				role="dialog"
				aria-label={copy.dialogLabel}
			>
				<button type="button" className={styles.closeButton} onClick={handleDismiss} aria-label={copy.close}>
					<XIcon weight="bold" className={styles.closeIcon} />
				</button>

				<div className={styles.hero} aria-hidden>
					<div className={styles.starField}>
						<div className={styles.starLayerPrimary} />
						<div className={styles.starLayerSecondary} />
					</div>

					<div className={styles.heroContent}>
						<h4 className={styles.heroWordmark}>ASTRAL</h4>
						<p className={styles.heroSubline}>{copy.heroSubline}</p>

						<div className={styles.heroFeatureGrid}>
							<span className={styles.heroFeature}>{copy.heroFeatureOne}</span>
							<span className={styles.heroFeature}>{copy.heroFeatureTwo}</span>
							<span className={styles.heroFeature}>{copy.heroFeatureThree}</span>
							<span className={styles.heroFeature}>{copy.heroFeatureFour}</span>
						</div>
					</div>

					<div className={styles.planetHorizon} />
					<div className={styles.badge}>{copy.badge}</div>
					<div className={styles.slogan}>{copy.slogan}</div>
				</div>

				<div className={styles.content}>
					<div className={styles.kicker}>{copy.kicker}</div>
					<h3 className={styles.title}>{copy.title}</h3>
					<p className={styles.description}>{copy.description}</p>

					<div className={styles.featureGrid}>
						<div className={styles.featureCard}>
							<div className={styles.featureTitle}>{copy.featureOneTitle}</div>
							<div className={styles.featureBody}>{copy.featureOneBody}</div>
						</div>
						<div className={styles.featureCard}>
							<div className={styles.featureTitle}>{copy.featureTwoTitle}</div>
							<div className={styles.featureBody}>{copy.featureTwoBody}</div>
						</div>
					</div>

					<div className={styles.actions}>
						<button type="button" className={styles.primaryButton} onClick={handleDismiss}>
							{copy.continue}
						</button>
					</div>
				</div>
			</motion.aside>
		</motion.div>
	);
});
