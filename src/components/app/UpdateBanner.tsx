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

import {ArrowsClockwiseIcon, DownloadSimpleIcon, XIcon} from '@phosphor-icons/react';
import {useLingui} from '@lingui/react/macro';
import {observer} from 'mobx-react-lite';
import React from 'react';
import {Platform} from '~/lib/Platform';
import UpdaterStore from '~/stores/UpdaterStore';
import styles from './UpdateBanner.module.css';

function formatSpeed(bytesPerSecond: number): string {
	if (bytesPerSecond < 1024) return `${Math.round(bytesPerSecond)} B/s`;
	if (bytesPerSecond < 1024 * 1024) return `${(bytesPerSecond / 1024).toFixed(1)} KB/s`;
	return `${(bytesPerSecond / (1024 * 1024)).toFixed(1)} MB/s`;
}

export const UpdateBanner: React.FC = observer(() => {
	const {t} = useLingui();
	const store = UpdaterStore;

	const hasDesktopUpdate = Platform.isElectron && store.nativeUpdateReady;
	const hasAndroidUpdate = store.androidUpdateAvailable;
	const hasWebUpdate = store.updateInfo.web.available;
	const isDownloading = store.isDownloading && store.nativeUpdatePending;
	const showBanner =
		(hasDesktopUpdate || hasAndroidUpdate || hasWebUpdate || isDownloading) && !store.bannerDismissed;

	const handleUpdate = React.useCallback(() => {
		void store.applyUpdate();
	}, [store]);

	const handleDismiss = React.useCallback(() => {
		store.dismissBanner();
	}, [store]);

	if (!showBanner) {
		return null;
	}

	if (isDownloading) {
		return (
			<div className={styles.banner}>
				<div className={styles.iconContainer}>
					<DownloadSimpleIcon weight="bold" className={styles.icon} />
				</div>
				<div className={styles.progressContainer}>
					<div className={styles.title}>{t`Downloading update...`}</div>
					<div className={styles.progressBarOuter}>
						<div
							className={styles.progressBarInner}
							style={{width: `${Math.min(store.downloadProgress, 100)}%`}}
						/>
					</div>
					<div className={styles.progressText}>
						<span>{Math.round(store.downloadProgress)}%</span>
						{store.downloadSpeed > 0 && <span>{formatSpeed(store.downloadSpeed)}</span>}
					</div>
				</div>
				<div className={styles.actions}>
					<button type="button" className={styles.dismissButton} onClick={handleDismiss}>
						<XIcon className={styles.dismissIcon} />
					</button>
				</div>
			</div>
		);
	}

	const version = store.displayVersion;
	const titleBase = hasDesktopUpdate
		? t`Desktop update available`
		: hasAndroidUpdate
			? t`Android update available`
			: t`Web update available`;
	const title = version ? `${titleBase} (${version})` : titleBase;
	const subtitle = hasDesktopUpdate
		? t`Click Update to install and relaunch.`
		: hasAndroidUpdate
			? t`Click Update to download the latest APK.`
			: t`Click Update to reload the app.`;

	return (
		<div className={styles.banner}>
			<div className={styles.iconContainer}>
				<DownloadSimpleIcon weight="bold" className={styles.icon} />
			</div>
			<div className={styles.content}>
				<div className={styles.title}>{title}</div>
				<div className={styles.subtitle}>{subtitle}</div>
			</div>
			<div className={styles.actions}>
				<button type="button" className={styles.updateButton} onClick={handleUpdate}>
					<ArrowsClockwiseIcon weight="bold" style={{width: 14, height: 14}} />
					{t`Update`}
				</button>
				<button type="button" className={styles.dismissButton} onClick={handleDismiss}>
					<XIcon className={styles.dismissIcon} />
				</button>
			</div>
		</div>
	);
});
