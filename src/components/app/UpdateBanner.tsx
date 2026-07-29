/*
 * Copyright (C) 2026 Astral Contributors
 *
 * This file is part of Astral.
 */

import {ArrowsClockwiseIcon, DownloadSimpleIcon, XIcon} from '@phosphor-icons/react';
import {Trans} from '@lingui/react/macro';
import {observer} from 'mobx-react-lite';
import React from 'react';
import UpdaterStore from '~/stores/UpdaterStore';
import styles from './UpdateBanner.module.css';

export const UpdateBanner: React.FC = observer(() => {
	const store = UpdaterStore;
	const [applying, setApplying] = React.useState(false);

	const showNativeDownload = store.nativeUpdatePending;
	const showAndroidUpdate = store.androidUpdateAvailable && !showNativeDownload;
	const showWebUpdate = store.updateInfo.web.available && !store.bannerDismissed && !showNativeDownload && !showAndroidUpdate;

	const handleApply = React.useCallback(async () => {
		setApplying(true);
		try {
			await store.applyUpdate();
		} finally {
			setApplying(false);
		}
	}, [store]);

	if (!showNativeDownload && !showAndroidUpdate && !showWebUpdate) {
		return null;
	}

	if (showNativeDownload) {
		return (
			<div className={styles.banner}>
				<button type="button" className={styles.updateButton} disabled>
					<DownloadSimpleIcon weight="bold" className={styles.spinAnimation} />
					<span className={styles.updateText}>
						<span className={styles.updateTitle}>
							<Trans>PC update</Trans>
						</span>
						<span className={styles.updateMeta}>
							{store.downloadProgress > 0 ? `${Math.round(store.downloadProgress)}%` : '1.5.0'}
						</span>
					</span>
				</button>
			</div>
		);
	}

	const title = showAndroidUpdate ? <Trans>Phone update</Trans> : <Trans>Browser update</Trans>;

	return (
		<div className={styles.banner}>
			<button
				type="button"
				className={styles.updateButton}
				onClick={() => void handleApply()}
				disabled={applying}
				title="Astral 1.5.0"
			>
				<ArrowsClockwiseIcon weight="bold" className={applying ? styles.spinAnimation : undefined} />
				<span className={styles.updateText}>
					<span className={styles.updateTitle}>
						{applying ? <Trans>Updating...</Trans> : title}
					</span>
					<span className={styles.updateMeta}>1.5.0</span>
				</span>
			</button>
			{showWebUpdate ? (
				<button
					type="button"
					className={styles.dismissButton}
					onClick={() => store.dismissBanner()}
					aria-label="Dismiss update"
				>
					<XIcon weight="bold" />
				</button>
			) : null}
		</div>
	);
});
