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
import {observer} from 'mobx-react-lite';
import React from 'react';
import * as UserSettingsActionCreators from '~/actions/UserSettingsActionCreators';
import {Switch} from '~/components/form/Switch';
import {SettingsTabContainer, SettingsTabSection} from '~/components/modals/shared/SettingsTabLayout';
import {Button} from '~/components/uikit/Button/Button';
import {WarningAlert} from '~/components/uikit/WarningAlert/WarningAlert';
import DeveloperModeStore from '~/stores/DeveloperModeStore';
import NativeWindowStateStore from '~/stores/NativeWindowStateStore';
import UserSettingsStore from '~/stores/UserSettingsStore';
import {isNativeAndroidApp} from '~/utils/AndroidAppInfo';
import {getAutostartStatus, setAutostartEnabled} from '~/utils/AutostartUtils';
import {formatFileSize} from '~/utils/FileUtils';
import {getNativePlatform, isDesktop, type NativePlatform} from '~/utils/NativeUtils';
import {
	clearSafeApplicationCaches,
	getStorageMaintenanceSnapshot,
	type StorageMaintenanceSnapshot,
} from '~/utils/StorageMaintenance';
import styles from './AdvancedTab.module.css';

const isAutostartPlatform = (platform: NativePlatform): boolean => platform === 'macos' || platform === 'windows';

const AdvancedTab: React.FC = observer(() => {
	const {t} = useLingui();
	const {developerMode} = UserSettingsStore;
	const [autostartEnabled, setAutostartEnabledState] = React.useState(false);
	const [autostartBusy, setAutostartBusy] = React.useState(false);
	const [platform, setPlatform] = React.useState<NativePlatform>('unknown');
	const [storageSnapshot, setStorageSnapshot] = React.useState<StorageMaintenanceSnapshot | null>(null);
	const [storageRefreshing, setStorageRefreshing] = React.useState(false);
	const [storageClearing, setStorageClearing] = React.useState(false);
	const [storageFeedback, setStorageFeedback] = React.useState<string | null>(null);
	const nativeAndroid = isNativeAndroidApp();
	const showPowerTools = DeveloperModeStore.isDeveloper;

	const refreshStorageSnapshot = React.useCallback(async () => {
		setStorageRefreshing(true);
		try {
			setStorageSnapshot(await getStorageMaintenanceSnapshot());
			setStorageFeedback(null);
		} catch {
			setStorageFeedback(t`Failed to read storage usage.`);
		} finally {
			setStorageRefreshing(false);
		}
	}, [t]);

	React.useLayoutEffect(() => {
		let mounted = true;

		const initAutostart = async () => {
			if (!isDesktop()) return;

			const detectedPlatform = await getNativePlatform();
			if (!mounted) return;

			setPlatform(detectedPlatform);
			if (!isAutostartPlatform(detectedPlatform)) return;

			setAutostartBusy(true);
			const enabled = await getAutostartStatus();

			if (!mounted) return;

			if (enabled !== null) {
				setAutostartEnabledState(enabled);
			}
			setAutostartBusy(false);
		};

		void initAutostart();

		return () => {
			mounted = false;
		};
	}, []);

	React.useEffect(() => {
		void refreshStorageSnapshot();
	}, [refreshStorageSnapshot]);

	const autostartSupported = isAutostartPlatform(platform);

	const handleAutostartChange = async (value: boolean) => {
		if (!autostartSupported) return;
		setAutostartBusy(true);
		const nextState = await setAutostartEnabled(value);
		if (nextState !== null) {
			setAutostartEnabledState(nextState);
		}
		setAutostartBusy(false);
	};

	const handleClearSafeCache = async () => {
		setStorageClearing(true);
		try {
			const result = await clearSafeApplicationCaches();
			await refreshStorageSnapshot();
			setStorageFeedback(
				result.deletedCacheBuckets > 0
					? result.deletedCacheBuckets === 1
						? t`Cleared 1 cache bucket.`
						: t`Cleared ${result.deletedCacheBuckets} cache buckets.`
					: t`Cleared local app caches.`,
			);
		} catch {
			setStorageFeedback(t`Failed to clear cache.`);
		} finally {
			setStorageClearing(false);
		}
	};

	const showAutostartWarning = platform !== 'unknown' && !autostartSupported;
	const storageUsedLabel =
		storageSnapshot?.totalUsageBytes !== null && storageSnapshot?.totalUsageBytes !== undefined
			? formatFileSize(storageSnapshot.totalUsageBytes)
			: '—';
	const storageQuotaLabel =
		storageSnapshot?.quotaBytes !== null && storageSnapshot?.quotaBytes !== undefined
			? formatFileSize(storageSnapshot.quotaBytes)
			: '—';

	const unavailableLabel = t`Unavailable`;
	const storageUsedDisplay = storageSnapshot?.totalUsageBytes !== null && storageSnapshot?.totalUsageBytes !== undefined
		? storageUsedLabel
		: unavailableLabel;
	const storageQuotaDisplay = storageSnapshot?.quotaBytes !== null && storageSnapshot?.quotaBytes !== undefined
		? storageQuotaLabel
		: unavailableLabel;

	return (
		<SettingsTabContainer>
			{isDesktop() && (
				<SettingsTabSection
					title={<Trans>Desktop Startup</Trans>}
					description={<Trans>Run Astral automatically when your computer starts. Or don't. Your choice!</Trans>}
				>
					<Switch
						label={<Trans>Launch Astral at login</Trans>}
						description={<Trans>Applies only to the desktop app on this device.</Trans>}
						value={autostartSupported ? autostartEnabled : false}
						disabled={!autostartSupported || autostartBusy}
						onChange={handleAutostartChange}
					/>
					{showAutostartWarning && (
						<WarningAlert>
							<Trans>Autostart is currently available on macOS and Windows. Linux support is coming soon.</Trans>
						</WarningAlert>
					)}
				</SettingsTabSection>
			)}
			{isDesktop() && (
				<SettingsTabSection
					title={<Trans>Desktop Window</Trans>}
					description={
						<Trans>Choose what Astral remembers about your window between restarts and reloads on this device.</Trans>
					}
				>
					<Switch
						label={<Trans>Remember size &amp; position</Trans>}
						description={<Trans>Keep your window dimensions and placement even when you reload the app.</Trans>}
						value={NativeWindowStateStore.rememberSizeAndPosition}
						onChange={NativeWindowStateStore.setRememberSizeAndPosition}
					/>
					<Switch
						label={<Trans>Restore maximized</Trans>}
						description={<Trans>Reopen in maximized mode if that&rsquo;s how you last used Astral.</Trans>}
						value={NativeWindowStateStore.rememberMaximized}
						onChange={NativeWindowStateStore.setRememberMaximized}
					/>
					<Switch
						label={<Trans>Restore fullscreen</Trans>}
						description={<Trans>Return to fullscreen automatically when you had it enabled last time.</Trans>}
						value={NativeWindowStateStore.rememberFullscreen}
						onChange={NativeWindowStateStore.setRememberFullscreen}
					/>
				</SettingsTabSection>
			)}
			<SettingsTabSection
				title={<Trans>Storage &amp; Cache</Trans>}
				description={
					nativeAndroid ? (
						<Trans>See how much space the Android shell uses and clear safe caches without signing out.</Trans>
					) : (
						<Trans>See how much space Astral uses locally on this device and clear safe caches without signing out.</Trans>
					)
				}
			>
				<div className={styles.storageGrid}>
					<div className={styles.storageCard}>
						<div className={styles.storageLabel}>
							<Trans>Used by app</Trans>
						</div>
						<div className={styles.storageValue}>{storageUsedDisplay}</div>
						<div className={styles.storageHint}>
							<Trans>Total browser or WebView storage currently used by Astral on this device.</Trans>
						</div>
					</div>
					<div className={styles.storageCard}>
						<div className={styles.storageLabel}>
							<Trans>Available quota</Trans>
						</div>
						<div className={styles.storageValue}>{storageQuotaDisplay}</div>
						<div className={styles.storageHint}>
							<Trans>Approximate storage quota exposed by the platform.</Trans>
						</div>
					</div>
					<div className={styles.storageCard}>
						<div className={styles.storageLabel}>
							<Trans>Local settings</Trans>
						</div>
						<div className={styles.storageValue}>
							{formatFileSize((storageSnapshot?.localStorageBytes ?? 0) + (storageSnapshot?.sessionStorageBytes ?? 0))}
						</div>
						<div className={styles.storageHint}>
							<Trans>Theme, UI state, drafts and other lightweight local settings.</Trans>
						</div>
					</div>
					<div className={styles.storageCard}>
						<div className={styles.storageLabel}>
							<Trans>Cache buckets</Trans>
						</div>
						<div className={styles.storageValue}>{storageSnapshot?.cacheBuckets ?? '—'}</div>
						<div className={styles.storageHint}>
							{storageSnapshot?.persistent ? (
								<Trans>Persistent storage is enabled for this app surface.</Trans>
							) : (
								<Trans>Downloaded cache and offline buckets Astral can safely rebuild later.</Trans>
							)}
						</div>
					</div>
				</div>

				<div className={styles.storageActions}>
					<Button variant="secondary" small={true} onClick={() => void refreshStorageSnapshot()} submitting={storageRefreshing}>
						<Trans>Refresh usage</Trans>
					</Button>
					<Button variant="secondary" small={true} onClick={handleClearSafeCache} submitting={storageClearing}>
						<Trans>Clear safe cache</Trans>
					</Button>
				</div>

				<div className={styles.storageHintBlock}>
					<Trans>
						This clears downloaded cache buckets, saved backgrounds, custom sounds and voice statistics. Your account,
						sessions and core settings stay intact.
					</Trans>
				</div>

				{storageFeedback ? <div className={styles.storageStatus}>{storageFeedback}</div> : null}
			</SettingsTabSection>
			{showPowerTools && (
				<SettingsTabSection
					title={<Trans>Power Tools</Trans>}
					description={
						<Trans>
							Enable advanced debugging surfaces only after you intentionally unlock them from the build footer.
						</Trans>
					}
				>
					<Switch
						label={<Trans>Developer Mode</Trans>}
						description={
							<Trans>
								When enabled, reveals debugging menus throughout the app to inspect and copy raw JSON objects of
								internal data structures like messages, channels, users and communities.
							</Trans>
						}
						value={developerMode}
						onChange={(value) => UserSettingsActionCreators.update({developerMode: value})}
					/>
				</SettingsTabSection>
			)}
		</SettingsTabContainer>
	);
});

export default AdvancedTab;
