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

import {makeAutoObservable, runInAction} from 'mobx';
import Config from '~/Config';
import {Logger} from '~/lib/Logger';
import {getAndroidAppInfo, isNativeAndroidApp} from '~/utils/AndroidAppInfo';
import {
	fetchAndroidReleaseManifest,
	getAndroidLatestApkUrl,
	isAndroidReleaseNewer,
} from '~/utils/AndroidReleaseUtils';
import {getClientInfo} from '~/utils/ClientInfoUtils';
import {
	getAndroidUpdateDownloadUrl,
	getAndroidUpdateGateInfo,
	MINIMUM_SUPPORTED_ANDROID_VERSION_CODE,
} from '~/utils/AndroidUpdateUtils';
import {getLocalBuildSha, isBuildShaStale} from '~/utils/BuildIdentityUtils';
import {getElectronAPI, isElectron, openExternalUrl} from '~/utils/NativeUtils';
import {clearReleaseManifestCache, fetchReleaseManifest} from '~/utils/ReleaseClient';
import {isDesktopUpdateRequiredAsync} from '~/utils/DesktopUpdateUtils';
import {
	getRolloutBucketKey,
	isInRolloutWave,
	type VersionRolloutInfo,
} from '~/utils/RolloutUtils';
import {reloadAppHard} from '~/utils/factoryReset';
import {navigateToWebUpdatePage} from '~/utils/WebUpdateNavigate';
import AuthenticationStore from '~/stores/AuthenticationStore';
import type {UpdaterEvent} from '../../src-electron/common/types';

const logger = new Logger('UpdaterStore');

const CHECK_INTERVAL_MS = 30 * 60 * 1000;
const MIN_CHECK_INTERVAL_MS = 60 * 1000;
const DISMISSED_UPDATE_KEY = 'astral:updater:dismissed_sha';

export type UpdaterState = 'idle' | 'checking' | 'available';

export type UpdateType = 'native' | 'android' | 'web' | 'both' | null;

export interface NativeUpdateInfo {
	available: boolean;
	downloaded: boolean;
	version: string | null;
}

export interface AndroidUpdateInfo {
	available: boolean;
	version: string | null;
	versionCode: number | null;
	url: string | null;
}

export interface WebUpdateInfo {
	available: boolean;
	sha: string | null;
	buildNumber: number | null;
	rollout: VersionRolloutInfo | null;
	inRolloutWave: boolean;
}

export interface UpdateInfo {
	native: NativeUpdateInfo;
	android: AndroidUpdateInfo;
	web: WebUpdateInfo;
}

const EMPTY_NATIVE_UPDATE: NativeUpdateInfo = {
	available: false,
	downloaded: false,
	version: null,
};

const EMPTY_ANDROID_UPDATE: AndroidUpdateInfo = {
	available: false,
	version: null,
	versionCode: null,
	url: null,
};

const EMPTY_WEB_UPDATE: WebUpdateInfo = {
	available: false,
	sha: null,
	buildNumber: null,
	rollout: null,
	inRolloutWave: false,
};

export type UpdateCheckFeedback = {
	tone: 'success' | 'info' | 'warn' | 'error';
	message: string;
};

class UpdaterStoreImpl {
	updateType: UpdateType = null;
	updateInfo: UpdateInfo = {
		native: {...EMPTY_NATIVE_UPDATE},
		android: {...EMPTY_ANDROID_UPDATE},
		web: {...EMPTY_WEB_UPDATE},
	};
	lastCheckedAt: number | null = null;
	currentVersion: string | null = null;
	channel: string | null = null;
	checkFeedback: UpdateCheckFeedback | null = null;

	downloadProgress: number = 0;
	downloadSpeed: number = 0;
	isDownloading: boolean = false;
	// bannerDismissed is derived from localStorage — true if user already dismissed this sha
	get bannerDismissed(): boolean {
		try {
			const dismissed = localStorage.getItem(DISMISSED_UPDATE_KEY);
			const sha = this.updateInfo.web.sha ?? this.updateInfo.native.version ?? this.updateInfo.android.version;
			return dismissed !== null && dismissed === sha;
		} catch {
			return false;
		}
	}

	private _isChecking = false;

	private isDesktopNative: boolean;
	private isAndroidNative: boolean;
	private currentAndroidVersionCode: number | null = null;
	private backgroundCheckStarted = false;
	private unsubscribeNativeEvents: (() => void) | null = null;
	private checkInProgress = false;

	constructor() {
		makeAutoObservable(this, {}, {autoBind: true});

		this.isDesktopNative = isElectron();
		this.isAndroidNative = isNativeAndroidApp();
		void this.bootstrap();
	}

	get hasUpdate(): boolean {
		return this.updateInfo.native.available || this.updateInfo.android.available || this.updateInfo.web.available;
	}

	get nativeUpdatePending(): boolean {
		return this.updateInfo.native.available && !this.updateInfo.native.downloaded;
	}

	get nativeUpdateReady(): boolean {
		return this.updateInfo.native.available && this.updateInfo.native.downloaded;
	}

	get androidUpdateAvailable(): boolean {
		return this.updateInfo.android.available;
	}

	get state(): UpdaterState {
		if (this._isChecking) return 'checking';
		if (this.hasUpdate) return 'available';
		return 'idle';
	}

	get isChecking(): boolean {
		return this._isChecking;
	}

	get displayVersion(): string | null {
		if (this.updateInfo.native.available && this.updateInfo.native.version) {
			return this.updateInfo.native.version;
		}
		if (this.updateInfo.android.available && this.updateInfo.android.version) {
			return this.updateInfo.android.version;
		}
		if (this.updateInfo.web.available) {
			if (this.updateInfo.web.buildNumber) {
				return `Build ${this.updateInfo.web.buildNumber}`;
			}
			return this.updateInfo.web.sha?.slice(0, 7) ?? null;
		}
		return null;
	}

	private refreshUpdateType(): void {
		const hasNativeDesktopUpdate = this.nativeUpdateReady;
		const hasAndroidUpdate = this.updateInfo.android.available;
		const hasWeb = this.updateInfo.web.available;

		if ((hasNativeDesktopUpdate || hasAndroidUpdate) && hasWeb) {
			this.updateType = 'both';
		} else if (hasNativeDesktopUpdate) {
			this.updateType = 'native';
		} else if (hasAndroidUpdate) {
			this.updateType = 'android';
		} else if (hasWeb) {
			this.updateType = 'web';
		} else {
			this.updateType = null;
		}
	}

	private async bootstrap(): Promise<void> {
		if (this.isDesktopNative) {
			await this.bootstrapDesktopNative();
		} else if (this.isAndroidNative) {
			await this.bootstrapAndroidNative();
		}
		this.startBackgroundChecks();
		void this.checkForUpdates(false);
	}

	private async bootstrapDesktopNative(): Promise<void> {
		try {
			const info = await getClientInfo();
			runInAction(() => {
				this.currentVersion = info.desktopVersion ?? null;
				this.channel = info.desktopChannel ?? null;
			});
		} catch (error) {
			logger.warn('Failed to read desktop info', error);
		}

		this.subscribeToNativeEvents();
	}

	private async bootstrapAndroidNative(): Promise<void> {
		const info = await getAndroidAppInfo();
		if (!info) {
			logger.warn('Failed to read Android app info');
			return;
		}

		runInAction(() => {
			this.currentVersion = info.versionName ?? null;
			this.currentAndroidVersionCode = info.versionCode ?? null;
			this.channel = Config.PUBLIC_PROJECT_ENV === 'canary' ? 'canary' : 'stable';
		});
	}

	private subscribeToNativeEvents(): void {
		const electronApi = getElectronAPI();
		if (!electronApi) return;

		this.unsubscribeNativeEvents = electronApi.onUpdaterEvent((event: UpdaterEvent) => {
			this.handleNativeEvent(event);
		});
	}

	private handleNativeEvent(event: UpdaterEvent): void {
		const isBackgroundOrFocusCheck = event.context === 'background' || event.context === 'focus';

		switch (event.type) {
			case 'checking':
				runInAction(() => {
					this._isChecking = true;
				});
				break;

			case 'available':
				runInAction(() => {
					this.updateInfo.native = {
						available: true,
						downloaded: false,
						version: event.version ?? null,
					};
					this.isDownloading = true;
					this.downloadProgress = 0;
					this.downloadSpeed = 0;
					this.refreshUpdateType();
					this._isChecking = false;
				});
				break;

			case 'not-available': {
				const hadDownloaded = this.updateInfo.native.downloaded;
				runInAction(() => {
					this.lastCheckedAt = Date.now();

					if (!hadDownloaded) {
						this.updateInfo.native = {...EMPTY_NATIVE_UPDATE};
						this.refreshUpdateType();
					}

					this.isDownloading = false;
					this.downloadProgress = 0;
					this.downloadSpeed = 0;
					this._isChecking = false;
				});
				break;
			}

			case 'error':
				if (isBackgroundOrFocusCheck) {
					logger.debug('Background update check failed silently:', event.message);
				} else {
					logger.warn('Update check error:', event.message);
				}
				runInAction(() => {
					this._isChecking = false;
					this.checkInProgress = false;
					this.isDownloading = false;
					this.downloadProgress = 0;
					this.downloadSpeed = 0;
				});
				break;

			case 'downloaded':
				runInAction(() => {
					this.updateInfo.native = {
						available: true,
						downloaded: true,
						version: event.version ?? null,
					};
					this.isDownloading = false;
					this.downloadProgress = 100;
					this.downloadSpeed = 0;
					this.refreshUpdateType();
					this._isChecking = false;
				});
				break;

			case 'progress':
				runInAction(() => {
					this.downloadProgress = event.percent;
					this.downloadSpeed = event.bytesPerSecond;
					this.isDownloading = true;
				});
				break;
		}
	}

	private startBackgroundChecks(): void {
		if (this.backgroundCheckStarted) return;
		this.backgroundCheckStarted = true;

		window.setInterval(() => {
			if (document.visibilityState === 'visible') {
				void this.checkForUpdates(false);
			}
		}, CHECK_INTERVAL_MS);

		window.addEventListener('focus', () => void this.checkForUpdates(false));
		window.addEventListener('online', () => void this.checkForUpdates(true));

		document.addEventListener('visibilitychange', () => {
			if (document.visibilityState === 'visible') {
				void this.checkForUpdates(false);
			}
		});
	}

	private shouldThrottle(force: boolean): boolean {
		if (force) return false;
		if (this.lastCheckedAt == null) return false;
		return Date.now() - this.lastCheckedAt < MIN_CHECK_INTERVAL_MS;
	}

	private shouldRunNativeCheck(): boolean {
		return this.isDesktopNative && !this.updateInfo.native.available;
	}

	private shouldRunAndroidCheck(): boolean {
		return this.isAndroidNative;
	}

	private async checkMandatoryDesktopUpdate(): Promise<boolean> {
		if (!this.isDesktopNative) {
			return false;
		}

		try {
			const info = await getClientInfo();
			if (!(await isDesktopUpdateRequiredAsync(info))) {
				return false;
			}

			logger.info('Mandatory desktop update required — reloading app shell');
			clearReleaseManifestCache();
			reloadAppHard();
			return true;
		} catch (error) {
			logger.debug('Mandatory desktop update check failed:', error);
			return false;
		}
	}

	private async checkMandatoryAndroidUpdate(): Promise<boolean> {
		if (!this.isAndroidNative) {
			return false;
		}

		try {
			const gate = await getAndroidUpdateGateInfo();
			if (!gate.required) {
				return false;
			}

			runInAction(() => {
				this.updateInfo.android = {
					available: true,
					version: gate.info?.versionName ?? `≥${gate.requiredVersionCode}`,
					versionCode: gate.requiredVersionCode,
					url: getAndroidUpdateDownloadUrl(),
				};
				this.refreshUpdateType();
			});
			return false;
		} catch (error) {
			logger.debug('Mandatory Android update check failed:', error);
			return false;
		}
	}

	async checkForUpdates(force = false): Promise<void> {
		if (this.checkInProgress) return;
		if (this.shouldThrottle(force)) return;

		this.checkInProgress = true;

		runInAction(() => {
			this._isChecking = true;
			if (force) {
				this.checkFeedback = null;
			}
		});

		try {
			if (await this.checkMandatoryDesktopUpdate()) {
				return;
			}

			await this.checkMandatoryAndroidUpdate();
			const shouldCheckNative = this.shouldRunNativeCheck();
			const shouldCheckAndroid = this.shouldRunAndroidCheck();
			const [, androidResult, webResult] = await Promise.all([
				shouldCheckNative ? this.checkNativeUpdate(force ? 'user' : 'background') : Promise.resolve(null),
				shouldCheckAndroid ? this.checkAndroidUpdate() : Promise.resolve({...EMPTY_ANDROID_UPDATE}),
				this.checkWebUpdate(),
			]);

			runInAction(() => {
				this.lastCheckedAt = Date.now();
				this.updateInfo.android = androidResult ?? {...EMPTY_ANDROID_UPDATE};
				this.updateInfo.web = {
					available: webResult?.available ?? false,
					sha: webResult?.sha ?? null,
					buildNumber: webResult?.buildNumber ?? null,
					rollout: webResult?.rollout ?? null,
					inRolloutWave: webResult?.inRolloutWave ?? false,
				};
				this.refreshUpdateType();
			});
		} catch (err) {
			logger.debug('Update check failed silently:', err);
			if (force) {
				runInAction(() => {
					this.checkFeedback = {
						tone: 'error',
						message: 'Не удалось проверить обновления. Проверьте интернет и попробуйте снова.',
					};
				});
			}
		} finally {
			runInAction(() => {
				this.lastCheckedAt = Date.now();
				this.checkInProgress = false;
				this._isChecking = false;

				if (force && !this.checkFeedback) {
					if (this.hasUpdate) {
						this.checkFeedback = {
							tone: 'info',
							message: 'Доступно обновление — нажмите «Установить обновление».',
						};
					} else if (this.updateInfo.web.sha && !this.updateInfo.web.inRolloutWave) {
						this.checkFeedback = {
							tone: 'warn',
							message: `Новая версия ${this.updateInfo.web.sha.slice(0, 7)} ещё раскатывается. Ваша волна rollout скоро подключится.`,
						};
					} else {
						this.checkFeedback = {
							tone: 'success',
							message: 'У вас актуальная версия.',
						};
					}
				}
			});
		}
	}

	private async checkNativeUpdate(context: 'user' | 'background'): Promise<boolean> {
		const electronApi = getElectronAPI();
		if (!electronApi) return false;

		try {
			await electronApi.updaterCheck(context);
			return true;
		} catch (error) {
			logger.debug('Native update check failed silently:', error);
			return false;
		}
	}

	private isAllowedByRollout(rollout: VersionRolloutInfo | null | undefined): boolean {
		if (!rollout) {
			return true;
		}
		const userId = AuthenticationStore.userId;
		return isInRolloutWave(getRolloutBucketKey(userId), rollout, userId);
	}

	private async checkAndroidUpdate(): Promise<AndroidUpdateInfo> {
		if (this.currentAndroidVersionCode == null) {
			return {
				available: true,
				version: null,
				versionCode: null,
				url: getAndroidUpdateDownloadUrl(),
			};
		}

		const release = await fetchReleaseManifest({force: true});
		const minVersionCode = release?.android?.minVersionCode ?? MINIMUM_SUPPORTED_ANDROID_VERSION_CODE;
		const belowMinimum = this.currentAndroidVersionCode < minVersionCode;

		if (release?.rollout && !this.isAllowedByRollout(release.rollout) && !belowMinimum) {
			return {...EMPTY_ANDROID_UPDATE};
		}

		const manifest = await fetchAndroidReleaseManifest();
		const hasNewerApk = isAndroidReleaseNewer(this.currentAndroidVersionCode, manifest);

		if (!belowMinimum && !hasNewerApk) {
			return {...EMPTY_ANDROID_UPDATE};
		}

		return {
			available: true,
			version: manifest?.version ?? (belowMinimum ? `≥${minVersionCode}` : null),
			versionCode: manifest?.version_code ?? minVersionCode,
			url: manifest ? getAndroidLatestApkUrl(manifest.channel) : getAndroidUpdateDownloadUrl(),
		};
	}

	private async checkWebUpdate(): Promise<{
		available: boolean;
		sha: string | null;
		buildNumber: number | null;
		rollout: VersionRolloutInfo | null;
		inRolloutWave: boolean;
	}> {
		try {
			const payload = await fetchReleaseManifest({force: true});
			if (!payload?.sha || payload.sha === 'dev') {
				return {...EMPTY_WEB_UPDATE};
			}

			const localSha = getLocalBuildSha();
			if (!isBuildShaStale(localSha, payload.sha)) {
				return {...EMPTY_WEB_UPDATE};
			}

			const inRolloutWave = this.isAllowedByRollout(payload.rollout ?? null);

			if (!inRolloutWave) {
				logger.debug('Web update waiting for rollout wave', {
					localSha,
					remoteSha: payload.sha,
					wave: payload.rollout?.wave,
					percent: payload.rollout?.percent,
				});
				return {
					available: false,
					sha: payload.sha,
					buildNumber: payload.buildNumber,
					rollout: payload.rollout ?? null,
					inRolloutWave: false,
				};
			}

			return {
				available: true,
				sha: payload.sha,
				buildNumber: payload.buildNumber,
				rollout: payload.rollout ?? null,
				inRolloutWave: true,
			};
		} catch (error) {
			logger.debug('Web update check failed silently:', error);
			return {...EMPTY_WEB_UPDATE};
		}
	}

	dismissBanner(): void {
		try {
			const sha = this.updateInfo.web.sha ?? this.updateInfo.native.version ?? this.updateInfo.android.version;
			if (sha) localStorage.setItem(DISMISSED_UPDATE_KEY, sha);
		} catch {
			// localStorage unavailable
		}
	}

	async applyUpdate(): Promise<void> {
		if (!this.hasUpdate) return;
		// Don't dismiss banner before reload — if reload fails, user can retry

		if (this.updateInfo.android.available && this.updateInfo.android.url) {
			logger.info('Opening Android APK update');
			this.dismissBanner();
			await openExternalUrl(this.updateInfo.android.url);
			return;
		}

		if (this.updateType === 'web') {
			logger.info('Applying web update, reloading...');
			await this.clearCachesAndReload();
			return;
		}

		if (this.isDesktopNative && (this.updateType === 'native' || this.updateType === 'both')) {
			const electronApi = getElectronAPI();
			if (electronApi && this.updateInfo.native.downloaded) {
				logger.info('Installing downloaded native update...');
				this.dismissBanner();
				await electronApi.updaterInstall();
				return;
			}
		}

		if (this.updateInfo.web.available) {
			await this.clearCachesAndReload();
		}
	}

	private async clearCachesAndReload(): Promise<void> {
		clearReleaseManifestCache();
		navigateToWebUpdatePage({sha: this.updateInfo.web.sha});
	}

	reset(): void {
		runInAction(() => {
			this.updateType = null;
			this.updateInfo = {
				native: {...EMPTY_NATIVE_UPDATE},
				android: {...EMPTY_ANDROID_UPDATE},
				web: {...EMPTY_WEB_UPDATE},
			};
			this.lastCheckedAt = null;
			this._isChecking = false;
			this.checkInProgress = false;
			this.downloadProgress = 0;
			this.downloadSpeed = 0;
			this.isDownloading = false;
			// bannerDismissed is now localStorage-based, no need to reset here
			this.refreshUpdateType();
		});
	}

	dispose(): void {
		if (this.unsubscribeNativeEvents) {
			this.unsubscribeNativeEvents();
			this.unsubscribeNativeEvents = null;
		}
	}
}

export default new UpdaterStoreImpl();
