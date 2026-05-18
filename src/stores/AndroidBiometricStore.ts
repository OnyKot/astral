import {makeAutoObservable, runInAction} from 'mobx';
import {Logger} from '~/lib/Logger';
import type {AndroidBiometricAuthResult, AndroidBiometricStatus} from '~/utils/AndroidBiometrics';
import {
	authenticateWithAndroidBiometrics,
	clearAndroidBiometricSession,
	disableAndroidBiometrics,
	enableAndroidBiometrics,
	getAndroidBiometricStatus,
	syncAndroidBiometricSessionIfEnabled,
} from '~/utils/AndroidBiometrics';
import {isNativeAndroidApp} from '~/utils/AndroidAppInfo';

const logger = new Logger('AndroidBiometricStore');

class AndroidBiometricStore {
	supported = isNativeAndroidApp();
	initialized = false;
	loading = false;
	authenticating = false;
	available = false;
	availability: AndroidBiometricStatus['availability'] = 'unsupported';
	enabled = false;
	hasStoredSession = false;
	userId: string | null = null;
	email: string | null = null;

	constructor() {
		makeAutoObservable(this, {}, {autoBind: true});

		if (this.supported && typeof window !== 'undefined') {
			window.addEventListener('focus', this.handleWindowFocus);
			document.addEventListener('visibilitychange', this.handleVisibilityChange);
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

	private applyStatus(status: AndroidBiometricStatus): void {
		this.available = status.available;
		this.availability = status.availability;
		this.enabled = status.enabled;
		this.hasStoredSession = status.hasStoredSession;
		this.userId = status.userId;
		this.email = status.email;
		this.initialized = true;
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
			const status = await getAndroidBiometricStatus();
			runInAction(() => {
				this.applyStatus(status);
				this.loading = false;
			});
		} catch (error) {
			logger.error('Failed to refresh Android biometrics status', {error});
			runInAction(() => {
				this.initialized = true;
				this.loading = false;
			});
		}
	}

	async enableCurrentSession(options: {token: string; userId: string; email?: string | null}): Promise<boolean> {
		if (!this.supported) {
			return false;
		}

		runInAction(() => {
			this.loading = true;
		});

		try {
			const status = await enableAndroidBiometrics(options);
			runInAction(() => {
				this.applyStatus(status);
				this.loading = false;
			});
			return status.enabled;
		} catch (error) {
			logger.error('Failed to enable Android biometrics', {error});
			runInAction(() => {
				this.loading = false;
			});
			return false;
		}
	}

	async disable(): Promise<void> {
		if (!this.supported) {
			return;
		}

		runInAction(() => {
			this.loading = true;
		});

		try {
			const status = await disableAndroidBiometrics();
			runInAction(() => {
				this.applyStatus(status);
				this.loading = false;
			});
		} catch (error) {
			logger.error('Failed to disable Android biometrics', {error});
			runInAction(() => {
				this.loading = false;
			});
		}
	}

	async clearSession(): Promise<void> {
		if (!this.supported) {
			return;
		}

		try {
			const status = await clearAndroidBiometricSession();
			runInAction(() => {
				this.applyStatus(status);
			});
		} catch (error) {
			logger.warn('Failed to clear Android biometric session', {error});
		}
	}

	async syncSession(options: {token: string; userId?: string | null; email?: string | null}): Promise<void> {
		if (!this.supported) {
			return;
		}

		try {
			const status = await syncAndroidBiometricSessionIfEnabled(options);
			runInAction(() => {
				this.applyStatus(status);
			});
		} catch (error) {
			logger.warn('Failed to sync Android biometric session', {error});
		}
	}

	async authenticate(): Promise<AndroidBiometricAuthResult | null> {
		if (!this.supported) {
			return null;
		}

		runInAction(() => {
			this.authenticating = true;
		});

		try {
			const payload = await authenticateWithAndroidBiometrics();
			const status = await getAndroidBiometricStatus();
			runInAction(() => {
				this.applyStatus(status);
				this.authenticating = false;
			});
			return payload;
		} catch (error) {
			logger.warn('Android biometric authentication failed', {error});
			runInAction(() => {
				this.authenticating = false;
			});
			return null;
		}
	}
}

export default new AndroidBiometricStore();
