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
import React from 'react';
import {AstralIcon} from '~/components/icons/AstralIcon';
import {Button} from '~/components/uikit/Button/Button';
import {getElectronAPI, openExternalUrl} from '~/utils/NativeUtils';
import styles from './ErrorFallback.module.css';

interface ForcedUpdateScreenProps {
	currentVersion?: string | null;
	requiredVersion: string;
	downloadUrl: string;
	platform?: 'desktop' | 'android' | 'web';
	notes?: string | null;
	onReload?: () => void;
}

export const ForcedUpdateScreen: React.FC<ForcedUpdateScreenProps> = ({
	currentVersion,
	requiredVersion,
	downloadUrl,
	platform = 'desktop',
	notes,
	onReload,
}) => {
	const isAndroid = platform === 'android';
	const isWeb = platform === 'web';

	const [reloading, setReloading] = React.useState(false);

	const handleDownload = React.useCallback(() => {
		if (isWeb && onReload) {
			setReloading(true);
			onReload();
			return;
		}
		void openExternalUrl(downloadUrl);
	}, [downloadUrl, isWeb, onReload]);

	const handleClose = React.useCallback(() => {
		const electronApi = getElectronAPI();
		electronApi?.windowClose();
	}, []);

	const canClose = !isAndroid && !isWeb && getElectronAPI() != null;

	return (
		<div className={styles.errorFallbackContainer}>
			<AstralIcon className={styles.errorFallbackIcon} />
			<div className={styles.errorFallbackContent}>
				<h1 className={styles.errorFallbackTitle}>
					<Trans>Update Required</Trans>
				</h1>
				{isAndroid ? (
					<p className={styles.errorFallbackDescription}>
						<Trans>This app version is no longer supported. Install the latest Astral update to keep messaging, calls, and Astral Music working correctly.</Trans>
					</p>
				) : isWeb ? (
					<p className={styles.errorFallbackDescription}>
						<Trans>Your browser is running an outdated Astral build. Refresh to load the latest version.</Trans>
					</p>
				) : (
					<p className={styles.errorFallbackDescription}>
						<Trans>This desktop build is no longer supported. Install the latest Astral update to keep messaging, calls, and Astral Music working correctly.</Trans>
					</p>
				)}
				<p className={styles.errorFallbackDescription}>
					<Trans>
						Your version: {currentVersion ?? 'unknown'}.
						<br />
						Required version: {requiredVersion}.
					</Trans>
				</p>
				{notes ? (
					<p className={styles.errorFallbackDescription}>{notes}</p>
				) : null}
				{isAndroid ? (
					<p className={styles.errorFallbackDescription}>
						<Trans>Download the latest version, finish installing it, then reopen Astral.</Trans>
					</p>
				) : isWeb ? (
					<p className={styles.errorFallbackDescription}>
						<Trans>Click the button below to reload Astral with the latest web bundle.</Trans>
					</p>
				) : (
					<p className={styles.errorFallbackDescription}>
						<Trans>Download the new installer, finish the update, then reopen Astral.</Trans>
					</p>
				)}
			</div>
			<div className={styles.errorFallbackActions}>
				<Button type="button" onClick={handleDownload} disabled={reloading}>
					{isWeb ? (reloading ? <Trans>Reloading…</Trans> : <Trans>Reload App</Trans>) : <Trans>Download Update</Trans>}
				</Button>
				{canClose ? (
					<Button onClick={handleClose} variant="secondary">
						<Trans>Close</Trans>
					</Button>
				) : null}
			</div>
		</div>
	);
};
