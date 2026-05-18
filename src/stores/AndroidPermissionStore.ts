import {makeAutoObservable, runInAction} from 'mobx';
import {Logger} from '~/lib/Logger';
import {isNativeAndroidApp} from '~/utils/AndroidAppInfo';
import type {AndroidPermissionName, AndroidPermissionSnapshot, AndroidPermissionStatus} from '~/utils/AndroidPermissions';
import {
	checkAndroidPermission,
	getAndroidPermissionStatuses,
	requestAndroidPermission,
	requestAndroidPermissions,
} from '~/utils/AndroidPermissions';

const logger = new Logger('AndroidPermissionStore');

const DEFAULT_STATUSES: AndroidPermissionSnapshot = {
	camera: 'unsupported',
	microphone: 'unsupported',
	notifications: 'unsupported',
	bluetooth: 'unsupported',
};

class AndroidPermissionStore {
	supported = isNativeAndroidApp();
	initialized = false;
	loading = false;
	statuses: AndroidPermissionSnapshot = {...DEFAULT_STATUSES};

	constructor() {
		makeAutoObservable(this, {}, {autoBind: true});

		if (typeof window !== 'undefined') {
			window.addEventListener('focus', this.handleWindowFocus);
			document.addEventListener('visibilitychange', this.handleVisibilityChange);
		}

		if (this.supported) {
			void this.refresh();
		} else {
			this.initialized = true;
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
			const statuses = await getAndroidPermissionStatuses();
			runInAction(() => {
				this.statuses = statuses;
				this.initialized = true;
				this.loading = false;
			});
		} catch (error) {
			logger.error('Failed to refresh Android permission statuses', {error});
			runInAction(() => {
				this.initialized = true;
				this.loading = false;
			});
		}
	}

	async check(permission: AndroidPermissionName): Promise<AndroidPermissionStatus> {
		if (!this.supported) {
			return 'unsupported';
		}

		const status = await checkAndroidPermission(permission);
		runInAction(() => {
			this.statuses = {
				...this.statuses,
				[permission]: status,
			};
			this.initialized = true;
		});
		return status;
	}

	async request(permission: AndroidPermissionName): Promise<AndroidPermissionStatus> {
		if (!this.supported) {
			return 'unsupported';
		}

		const status = await requestAndroidPermission(permission);
		runInAction(() => {
			this.statuses = {
				...this.statuses,
				[permission]: status,
			};
			this.initialized = true;
		});
		return status;
	}

	async requestMany(permissions: Array<AndroidPermissionName>): Promise<AndroidPermissionSnapshot> {
		if (!this.supported) {
			return {...DEFAULT_STATUSES};
		}

		const statuses = await requestAndroidPermissions(permissions);
		runInAction(() => {
			this.statuses = {
				...this.statuses,
				...statuses,
			};
			this.initialized = true;
		});
		return this.statuses;
	}

	getStatus(permission: AndroidPermissionName): AndroidPermissionStatus {
		return this.statuses[permission];
	}

	isGranted(permission: AndroidPermissionName): boolean {
		return this.statuses[permission] === 'granted';
	}
}

export default new AndroidPermissionStore();
