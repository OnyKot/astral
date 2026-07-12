/*
 * Copyright (C) 2026 Astral Contributors
 *
 * This file is part of Astral.
 */

import {ArrowsClockwiseIcon, DownloadSimpleIcon} from '@phosphor-icons/react';
import {Trans} from '@lingui/react/macro';
import {observer} from 'mobx-react-lite';
import React from 'react';
import UpdaterStore from '~/stores/UpdaterStore';
import styles from './UpdateBanner.module.css';

export const UpdateBanner: React.FC = observer(() => {
	const store = UpdaterStore;
	const [applying, setApplying] = React.useState(false);

	const showNativeDownload = store.nativeUpdatePending;
	const showWebUpdate = store.updateInfo.web.available && !store.bannerDismissed && !showNativeDownload;

	const handleApply = React.useCallback(async () => {
		setApplying(true);
		try {
			await store.applyUpdate();
		} finally {
			setApplying(false);
		}
	}, [store]);

	if (!showNativeDownload && !showWebUpdate) {
		return null;
	}

	if (showNativeDownload) {
		return (
			<div className={styles.banner}>
				<button type="button" className={styles.updateButton} disabled>
					<DownloadSimpleIcon weight="bold" className={styles.spinAnimation} />
					{store.downloadProgress > 0 ? `${Math.round(store.downloadProgress)}%` : <Trans>Loading update</Trans>}
				</button>
			</div>
		);
	}

	const rollout = store.updateInfo.web.rollout;
	const versionLabel = store.displayVersion;

	return (
		<div className={styles.banner}>
			<button
				type="button"
				className={styles.updateButton}
				onClick={() => void handleApply()}
				onContextMenu={(event) => {
					event.preventDefault();
					store.dismissBanner();
				}}
				disabled={applying}
				title={rollout ? `${rollout.label} ${rollout.percent}%` : versionLabel || undefined}
			>
				<ArrowsClockwiseIcon weight="bold" className={applying ? styles.spinAnimation : undefined} />
				{applying ? <Trans>Updating...</Trans> : <Trans>Load update</Trans>}
			</button>
		</div>
	);
});
