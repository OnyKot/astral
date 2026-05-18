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
}

export const ForcedUpdateScreen: React.FC<ForcedUpdateScreenProps> = ({
	currentVersion,
	requiredVersion,
	downloadUrl,
}) => {
	const handleDownload = React.useCallback(() => {
		void openExternalUrl(downloadUrl);
	}, [downloadUrl]);

	const handleClose = React.useCallback(() => {
		const electronApi = getElectronAPI();
		electronApi?.windowClose();
	}, []);

	return (
		<div className={styles.errorFallbackContainer}>
			<AstralIcon className={styles.errorFallbackIcon} />
			<div className={styles.errorFallbackContent}>
				<h1 className={styles.errorFallbackTitle}>
					<Trans>Update Required</Trans>
				</h1>
				<p className={styles.errorFallbackDescription}>
					<Trans>This desktop build is no longer supported. Install the latest Astral update to keep messaging, calls, and Astral Music working correctly.</Trans>
				</p>
				<p className={styles.errorFallbackDescription}>
					<Trans>
						Your version: {currentVersion ?? 'unknown'}.
						<br />
						Required version: {requiredVersion}.
					</Trans>
				</p>
				<p className={styles.errorFallbackDescription}>
					<Trans>Download the new installer, finish the update, then reopen Astral.</Trans>
				</p>
			</div>
			<div className={styles.errorFallbackActions}>
				<Button onClick={handleDownload}>
					<Trans>Download Update</Trans>
				</Button>
				<Button onClick={handleClose} variant="secondary">
					<Trans>Close</Trans>
				</Button>
			</div>
		</div>
	);
};
