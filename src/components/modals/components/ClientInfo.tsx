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

import {Trans, useLingui} from '@lingui/react/macro';
import {ArrowsClockwiseIcon, CheckCircleIcon, DownloadSimpleIcon} from '@phosphor-icons/react';
import {observer} from 'mobx-react-lite';
import React, {useCallback, useEffect, useState} from 'react';
import * as TextCopyActionCreators from '~/actions/TextCopyActionCreators';
import * as ToastActionCreators from '~/actions/ToastActionCreators';
import Config from '~/Config';
import FocusRing from '~/components/uikit/FocusRing/FocusRing';
import {Tooltip} from '~/components/uikit/Tooltip/Tooltip';
import DeveloperModeStore from '~/stores/DeveloperModeStore';
import UpdaterStore from '~/stores/UpdaterStore';
import {getAndroidAppInfo, isNativeAndroidApp} from '~/utils/AndroidAppInfo';
import {
	fetchLiveBuildIdentity,
	formatBuildSha,
	getLocalBuildSha,
	getLocalBuildTimestamp,
	getLocalProjectEnv,
	isBuildShaStale,
	resolveChannelLabel,
} from '~/utils/BuildIdentityUtils';
import {getClientInfo, getClientInfoSync} from '~/utils/ClientInfoUtils';
import * as DateUtils from '~/utils/DateUtils';
import {isDesktop} from '~/utils/NativeUtils';
import type {VersionJsonPayload} from '~/utils/RolloutUtils';
import styles from './ClientInfo.module.css';

export const ClientInfo = observer(() => {
	const {t, i18n} = useLingui();
	const [clientInfo, setClientInfo] = useState(getClientInfoSync());
	const [liveManifest, setLiveManifest] = useState<VersionJsonPayload | null>(null);
	const [androidInfo, setAndroidInfo] = useState<{versionName?: string; versionCode?: number} | null>(null);

	const refreshLiveManifest = useCallback(async () => {
		const manifest = await fetchLiveBuildIdentity();
		setLiveManifest(manifest);
	}, []);

	useEffect(() => {
		let mounted = true;
		void getClientInfo().then((info) => {
			if (!mounted) return;
			setClientInfo(info);
		});
		if (isNativeAndroidApp()) {
			void getAndroidAppInfo().then((info) => {
				if (!mounted) return;
				setAndroidInfo(info);
			});
		}
		void refreshLiveManifest();
		return () => {
			mounted = false;
		};
	}, [refreshLiveManifest]);

	useEffect(() => {
		if (UpdaterStore.lastCheckedAt != null) {
			void refreshLiveManifest();
		}
	}, [UpdaterStore.lastCheckedAt, refreshLiveManifest]);

	const localSha = getLocalBuildSha();
	const localShaShort = formatBuildSha(localSha);
	const liveSha = liveManifest?.sha ?? null;
	const liveShaShort = formatBuildSha(liveSha);
	const staleBundle = isBuildShaStale(localSha, liveSha);
	const channelLabel = resolveChannelLabel(liveManifest?.env ?? getLocalProjectEnv());
	const buildNumber = liveManifest?.buildNumber ?? Config.PUBLIC_BUILD_NUMBER;
	const buildTimestamp = liveManifest?.timestamp ?? getLocalBuildTimestamp();

	const desktopVersion = clientInfo.desktopVersion;
	const isDesktopApp = isDesktop();
	const isAndroidApp = isNativeAndroidApp();

	const browserName = clientInfo.browserName || 'Unknown';
	const browserVersion = clientInfo.browserVersion || '';
	const osName = clientInfo.osName || 'Unknown';
	const rawOsVersion = clientInfo.osVersion ?? '';
	const osArchitecture = clientInfo.desktopArch ?? clientInfo.arch;
	const shouldShowOsVersion = Boolean(rawOsVersion) && (isDesktopApp || osName !== 'macOS');
	const osVersionForDisplay = shouldShowOsVersion ? rawOsVersion : undefined;

	const buildOsDescription = () => {
		const parts = [osName];
		if (osVersionForDisplay) {
			parts.push(osVersionForDisplay);
		}
		const archSuffix = osArchitecture ? ` (${osArchitecture})` : '';
		return `${parts.join(' ')}${archSuffix}`.trim();
	};
	const osDescription = buildOsDescription();

	const appTitle = (() => {
		if (isDesktopApp && desktopVersion) {
			return `Astral Desktop · ${channelLabel} ${desktopVersion}`;
		}
		if (isAndroidApp) {
			const versionLabel = androidInfo?.versionName ?? androidInfo?.versionCode?.toString() ?? '—';
			return `Astral Android · ${channelLabel} ${versionLabel}`;
		}
		return `Astral Web · ${channelLabel}`;
	})();

	const onClick = () => {
		let timestamp = '';
		if (buildTimestamp) {
			const date = new Date(buildTimestamp * 1000);
			const year = date.getUTCFullYear();
			const month = String(date.getUTCMonth() + 1).padStart(2, '0');
			const day = String(date.getUTCDate()).padStart(2, '0');
			const hours = String(date.getUTCHours()).padStart(2, '0');
			const minutes = String(date.getUTCMinutes()).padStart(2, '0');
			const seconds = String(date.getUTCSeconds()).padStart(2, '0');
			timestamp = `, ${year}-${month}-${day} ${hours}:${minutes}:${seconds} UTC`;
		}
		const justUnlocked = DeveloperModeStore.registerBuildTap();
		if (justUnlocked) {
			ToastActionCreators.success(t`You are now a developer!`);
		}

		const desktopInfo = desktopVersion ? `, desktop ${desktopVersion}` : '';
		const androidLine = androidInfo?.versionCode ? `, android ${androidInfo.versionName ?? androidInfo.versionCode}` : '';
		const buildInfo = buildNumber ? `build ${buildNumber} (${liveShaShort || localShaShort})` : `(${liveShaShort || localShaShort})`;

		TextCopyActionCreators.copy(
			i18n,
			`${channelLabel} ${buildInfo}${timestamp}, local ${localShaShort}, live ${liveShaShort}, ${browserName} ${browserVersion}, ${osDescription}${desktopInfo}${androidLine}`,
		);
	};

	const updater = UpdaterStore;
	const [applying, setApplying] = useState(false);

	const handleCheckUpdate = useCallback(
		(e: React.MouseEvent) => {
			e.stopPropagation();
			void (async () => {
				await updater.checkForUpdates(true);
				await refreshLiveManifest();
				const feedback = updater.checkFeedback;
				if (!feedback) {
					return;
				}
				switch (feedback.tone) {
					case 'success':
						ToastActionCreators.success(feedback.message);
						break;
					case 'warn':
						ToastActionCreators.createToast({type: 'info', children: feedback.message});
						break;
					case 'error':
						ToastActionCreators.error(feedback.message);
						break;
					default:
						ToastActionCreators.createToast({type: 'info', children: feedback.message});
				}
			})();
		},
		[updater, refreshLiveManifest],
	);

	const handleApplyUpdate = useCallback(async (e: React.MouseEvent) => {
		e.stopPropagation();
		setApplying(true);
		try {
			await updater.applyUpdate();
		} finally {
			setApplying(false);
		}
	}, [updater]);

	const rollout = liveManifest?.rollout;
	const policyLine = (() => {
		if (isDesktopApp && liveManifest?.desktop?.minVersion) {
			return `Desktop min ${liveManifest.desktop.minVersion}`;
		}
		if (isAndroidApp && liveManifest?.android?.minVersionCode) {
			return `Android min code ${liveManifest.android.minVersionCode}`;
		}
		return null;
	})();

	return (
		<div>
			<Tooltip text={t`Click to copy`}>
				<FocusRing>
					<button type="button" onClick={onClick} className={styles.button}>
						<span className={styles.appLine}>{appTitle}</span>
						<span className={styles.buildLine}>
							{staleBundle ? (
								<>
									<Trans>Your bundle</Trans> {localShaShort} → <Trans>server</Trans> {liveShaShort}
								</>
							) : (
								<>
									Build {buildNumber ? `${buildNumber} · ` : ''}
									{liveShaShort || localShaShort}
								</>
							)}
						</span>
						{buildTimestamp ? (
							<span>
								<Trans>Deployed</Trans> {DateUtils.getShortRelativeDateString(buildTimestamp * 1000)}
							</span>
						) : null}
						{rollout ? (
							<span>
								Rollout {rollout.wave}/{rollout.wavesTotal} · {rollout.label} ({rollout.percent}%)
							</span>
						) : null}
						{policyLine ? <span>{policyLine}</span> : null}
						{liveManifest?.notes ? <span>{liveManifest.notes}</span> : null}
						<span>
							{browserName} {browserVersion}
						</span>
						<span>{osDescription}</span>
					</button>
				</FocusRing>
			</Tooltip>

			<div className={styles.updateActions}>
				{updater.hasUpdate ? (
					<button type="button" className={styles.updateButton} onClick={handleApplyUpdate} disabled={applying}>
						{applying ? (
							<ArrowsClockwiseIcon weight="bold" style={{width: 14, height: 14}} className={styles.spinning} />
						) : (
							<DownloadSimpleIcon weight="bold" style={{width: 14, height: 14}} />
						)}
						{applying ? <Trans>Installing...</Trans> : <Trans>Install Update</Trans>}
						{!applying && updater.displayVersion ? (
							<span className={styles.updateVersion}>({updater.displayVersion})</span>
						) : null}
					</button>
				) : updater.state === 'idle' || updater.state === 'checking' ? (
					<button
						type="button"
						className={styles.checkUpdateButton}
						onClick={handleCheckUpdate}
						disabled={updater.isChecking}
					>
						<ArrowsClockwiseIcon
							weight="bold"
							style={{width: 14, height: 14}}
							className={updater.isChecking ? styles.spinning : undefined}
						/>
						{updater.isChecking ? <Trans>Checking...</Trans> : <Trans>Check for Updates</Trans>}
					</button>
				) : (
					<span className={styles.upToDate}>
						<CheckCircleIcon weight="fill" style={{width: 14, height: 14}} />
						<Trans>Up to date</Trans>
					</span>
				)}
			</div>
		</div>
	);
});
