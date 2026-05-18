import {makeAutoObservable, runInAction} from 'mobx';
import {Logger} from '~/lib/Logger';
import type {AndroidNotificationSettings} from '~/utils/AndroidNotificationSettings';
import {
	areAndroidNotificationsEnabled,
	getAndroidNotificationSettings,
	updateAndroidNotificationSettings,
} from '~/utils/AndroidNotificationSettings';
import {isNativeAndroidApp} from '~/utils/AndroidAppInfo';

const logger = new Logger('AndroidNotificationSettingsStore');

const DEFAULT_SETTINGS: AndroidNotificationSettings = {
	messageSound: true,
	messageVibrate: true,
	messageHeadsUp: true,
	mentionSound: true,
	mentionVibrate: true,
	mentionHeadsUp: true,
	callSound: true,
	callVibrate: true,
	callFullscreen: true,
	systemSound: true,
	systemVibrate: false,
	showOnLockscreen: true,
	quickActions: true,
};

class AndroidNotificationSettingsStore {
	initialized = false;
	loading = false;
	supported = isNativeAndroidApp();
	systemNotificationsEnabled = false;
	settings: AndroidNotificationSettings = {...DEFAULT_SETTINGS};

	constructor() {
		makeAutoObservable(this, {}, {autoBind: true});

		if (typeof window !== 'undefined') {
			window.addEventListener('focus', this.handleWindowFocus);
			document.addEventListener('visibilitychange', this.handleVisibilityChange);
		}

		if (this.supported) {
			void this.refresh();
		}
	}

	private handleWindowFocus(): void {
		if (!this.supported) return;
		void this.refresh();
	}

	private handleVisibilityChange(): void {
		if (!this.supported || document.visibilityState !== 'visible') return;
		void this.refresh();
	}

	async refresh(): Promise<void> {
		if (!this.supported) {
			runInAction(() => {
				this.initialized = true;
			});
			return;
		}

		runInAction(() => {
			this.loading = true;
		});

		try {
			const [settings, enabled] = await Promise.all([
				getAndroidNotificationSettings(),
				areAndroidNotificationsEnabled(),
			]);

			runInAction(() => {
				this.settings = settings ?? {...DEFAULT_SETTINGS};
				this.systemNotificationsEnabled = enabled;
				this.initialized = true;
				this.loading = false;
			});
		} catch (error) {
			logger.error('Failed to refresh Android notification settings', {error});
			runInAction(() => {
				this.initialized = true;
				this.loading = false;
			});
		}
	}

	async updateSetting<K extends keyof AndroidNotificationSettings>(
		key: K,
		value: AndroidNotificationSettings[K],
	): Promise<void> {
		if (!this.supported) {
			return;
		}

		const previousValue = this.settings[key];
		runInAction(() => {
			this.settings = {
				...this.settings,
				[key]: value,
			};
		});

		const nextSettings = await updateAndroidNotificationSettings({[key]: value});
		if (!nextSettings) {
			logger.warn('Failed to persist Android notification setting', {key});
			runInAction(() => {
				this.settings = {
					...this.settings,
					[key]: previousValue,
				};
			});
			return;
		}

		runInAction(() => {
			this.settings = nextSettings;
		});
	}
}

export default new AndroidNotificationSettingsStore();
