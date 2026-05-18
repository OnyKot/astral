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
import {
	ChatCircleDotsIcon,
	DeviceMobileIcon,
	PhoneCallIcon,
	ShieldCheckIcon,
	SparkleIcon,
} from '@phosphor-icons/react';
import {clsx} from 'clsx';
import {motion, useReducedMotion} from 'framer-motion';
import React from 'react';
import {AstralIcon} from '~/components/icons/AstralIcon';
import {getAndroidAppInfo, type AndroidAppInfo, isNativeAndroidApp} from '~/utils/AndroidAppInfo';
import styles from './NativeMobileAuthHero.module.css';

interface NativeMobileAuthHeroProps {
	variant: 'login' | 'register';
}

const ARC_EASE = [0.22, 1, 0.36, 1] as const;

const StatusCard = ({
	icon,
	label,
	value,
	accent = false,
	reducedMotion = false,
}: {
	icon: React.ReactNode;
	label: React.ReactNode;
	value: React.ReactNode;
	accent?: boolean;
	reducedMotion?: boolean;
}) => (
	<motion.div
		className={clsx(styles.statusCard, accent && styles.statusCardAccent)}
		initial={reducedMotion ? false : {opacity: 0, y: 10}}
		animate={reducedMotion ? {opacity: 1} : {opacity: 1, y: 0}}
		transition={reducedMotion ? {duration: 0.14} : {duration: 0.28, ease: ARC_EASE}}
	>
		<div className={styles.statusIcon}>{icon}</div>
		<div className={styles.statusBody}>
			<div className={styles.statusLabel}>{label}</div>
			<div className={styles.statusValue}>{value}</div>
		</div>
	</motion.div>
);

export function NativeMobileAuthHero({variant}: NativeMobileAuthHeroProps) {
	const [appInfo, setAppInfo] = React.useState<AndroidAppInfo | null>(null);
	const reducedMotion = useReducedMotion() ?? false;

	React.useEffect(() => {
		let cancelled = false;

		void getAndroidAppInfo().then((info) => {
			if (!cancelled) {
				setAppInfo(info);
			}
		});

		return () => {
			cancelled = true;
		};
	}, []);

	const pushReady = Boolean(appInfo?.nativePushConfigured);
	const buildLabel = isNativeAndroidApp() ? <Trans>Android build</Trans> : <Trans>Native build</Trans>;

	return (
		<motion.section
			className={styles.hero}
			initial={reducedMotion ? false : {opacity: 0, y: 16}}
			animate={reducedMotion ? {opacity: 1} : {opacity: 1, y: 0}}
			transition={reducedMotion ? {duration: 0.16} : {duration: 0.32, ease: ARC_EASE}}
		>
			<div className={styles.heroBackdrop} aria-hidden="true" />

			<div className={styles.topRow}>
				<div className={styles.badge}>
					<DeviceMobileIcon weight="fill" size={14} />
					<span>{isNativeAndroidApp() ? <Trans>Android app</Trans> : <Trans>Mobile app</Trans>}</span>
				</div>

				{appInfo?.versionName ? <div className={styles.versionBadge}>v{appInfo.versionName}</div> : null}
			</div>

			<div className={styles.heroCard}>
				<div className={styles.brandRow}>
					<div className={styles.brandIconWrap}>
						<div className={styles.brandIconGlow} />
						<AstralIcon className={styles.brandIcon} />
					</div>

					<div className={styles.storyBlock}>
						<div className={styles.brandEyebrow}>
							<SparkleIcon weight="fill" size={14} />
							<span>
								{variant === 'login' ? (
									<Trans>Minimal Android flow</Trans>
								) : (
									<Trans>Native onboarding</Trans>
								)}
							</span>
						</div>
						<h1 className={styles.title}>
							{variant === 'login' ? (
								<Trans>Sign in inside the Android shell.</Trans>
							) : (
								<Trans>Create an account and stay in the app.</Trans>
							)}
						</h1>
						<p className={styles.subtitle}>
							{variant === 'login' ? (
								<Trans>Cleaner entry, calmer motion and a faster return to messages, calls and notifications.</Trans>
							) : (
								<Trans>Profile setup, notifications and voice entry now start from the same touch-first mobile surface.</Trans>
							)}
						</p>
					</div>
				</div>

				<div className={styles.statusGrid}>
					<StatusCard
						icon={<DeviceMobileIcon weight="fill" size={18} />}
						label={<Trans>Shell</Trans>}
						value={appInfo?.versionName ? `v${appInfo.versionName}` : buildLabel}
						reducedMotion={reducedMotion}
					/>
					<StatusCard
						icon={<ShieldCheckIcon weight="fill" size={18} />}
						label={<Trans>Native APIs</Trans>}
						value={pushReady ? <Trans>Notifications linked</Trans> : <Trans>Preparing native notifications</Trans>}
						accent={pushReady}
						reducedMotion={reducedMotion}
					/>
					<StatusCard
						icon={<PhoneCallIcon weight="fill" size={18} />}
						label={<Trans>Calls</Trans>}
						value={<Trans>Touch-first controls</Trans>}
						reducedMotion={reducedMotion}
					/>
				</div>

				<div className={styles.featureStrip}>
					<div className={styles.featurePill}>
						<ChatCircleDotsIcon weight="fill" size={16} />
						<span>
							<Trans>Swipe-friendly chat flow</Trans>
						</span>
					</div>
					<div className={styles.featurePill}>
						<SparkleIcon weight="fill" size={16} />
						<span>
							<Trans>Softer motion</Trans>
						</span>
					</div>
					<div className={styles.featurePill}>
						<ShieldCheckIcon weight="fill" size={16} />
						<span>
							<Trans>Cleaner boot and sign-in</Trans>
						</span>
					</div>
				</div>
			</div>
		</motion.section>
	);
}
