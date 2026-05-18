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

import {Logger} from '~/lib/Logger';
import {Platform} from '~/lib/Platform';
import {ensureNativePermission, isNativePermissionDenied} from '~/utils/NativePermissions';
import {isDesktop, isNativeMobile} from '~/utils/NativeUtils';

const logger = new Logger('VoiceDeviceManager');

export function resolveEffectiveDeviceId(
	storedDeviceId: string,
	devices: ReadonlyArray<MediaDeviceInfo>,
): string | null {
	if (devices.length === 0) {
		return null;
	}

	const deviceExists = devices.some((d) => d.deviceId === storedDeviceId);
	if (deviceExists) {
		return storedDeviceId;
	}

	return devices[0].deviceId;
}

export function hasDeviceLabels(devices: ReadonlyArray<MediaDeviceInfo>): boolean {
	return devices.some((d) => d.label && d.label.trim().length > 0);
}

type PermissionStatus = 'idle' | 'loading' | 'granted' | 'denied';
export type MediaPermissionTarget = 'microphone' | 'camera';

export interface VoiceDeviceState {
	inputDevices: Array<MediaDeviceInfo>;
	outputDevices: Array<MediaDeviceInfo>;
	videoDevices: Array<MediaDeviceInfo>;
	permissionStatus: PermissionStatus;
}

type Listener = (state: VoiceDeviceState) => void;

const sortDevices = (devices: Array<MediaDeviceInfo>): Array<MediaDeviceInfo> => {
	return [...devices].sort((a, b) => {
		const aIsDefault = a.deviceId === 'default';
		const bIsDefault = b.deviceId === 'default';
		if (aIsDefault && !bIsDefault) return -1;
		if (!aIsDefault && bIsDefault) return 1;
		return a.label.localeCompare(b.label);
	});
};

const buildPermissionConstraints = (
	permissionTargets: Array<MediaPermissionTarget>,
): MediaStreamConstraints | null => {
	const wantsMicrophone = permissionTargets.includes('microphone');
	const wantsCamera = permissionTargets.includes('camera');

	if (!wantsMicrophone && !wantsCamera) {
		return null;
	}

	return {
		...(wantsMicrophone ? {audio: true} : {}),
		...(wantsCamera ? {video: true} : {}),
	};
};

class VoiceDeviceManager {
	private state: VoiceDeviceState = {
		inputDevices: [],
		outputDevices: [],
		videoDevices: [],
		permissionStatus: 'idle',
	};

	private listeners = new Set<Listener>();
	private enumeratingPromise: Promise<VoiceDeviceState> | null = null;
	private shouldRequestPermissions = false;

	constructor() {
		if (navigator.mediaDevices?.addEventListener) {
			navigator.mediaDevices.addEventListener('devicechange', this.handleDeviceChange);
		}
		if (typeof document !== 'undefined') {
			document.addEventListener('visibilitychange', this.handleVisibilityChange);
		}
		if (typeof window !== 'undefined') {
			window.addEventListener('focus', this.handleWindowFocus);
		}
	}

	public getState(): VoiceDeviceState {
		return this.state;
	}

	public subscribe(listener: Listener): () => void {
		this.listeners.add(listener);
		listener(this.state);
		return () => {
			this.listeners.delete(listener);
		};
	}

	public async ensureDevices(options: {
		requestPermissions?: boolean;
		permissionTargets?: Array<MediaPermissionTarget>;
	} = {}): Promise<VoiceDeviceState> {
		const requestPermissions = options.requestPermissions ?? false;
		const permissionTargets = options.permissionTargets ?? ['microphone', 'camera'];

		logger.debug('ensureDevices called', {
			requestPermissions,
			shouldRequestPermissions: this.shouldRequestPermissions,
			hasEnumeratingPromise: !!this.enumeratingPromise,
			currentState: {
				inputDeviceCount: this.state.inputDevices.length,
				permissionStatus: this.state.permissionStatus,
			},
		});

		if (requestPermissions) {
			this.shouldRequestPermissions = true;
		}

		const shouldRequest = this.shouldRequestPermissions || requestPermissions;

		const runEnumeration = () =>
			this.enumerateDevices(shouldRequest, permissionTargets).catch((error) => {
				logger.debug('Failed to enumerate media devices:', error);
				throw error;
			});

		if (this.enumeratingPromise) {
			logger.debug('Chaining to existing enumeration promise');
			this.enumeratingPromise = this.enumeratingPromise.catch(() => this.state).then(runEnumeration);
		} else {
			logger.debug('Creating new enumeration promise');
			this.enumeratingPromise = runEnumeration();
		}

		const pendingPromise = this.enumeratingPromise;
		return pendingPromise.finally(() => {
			if (this.enumeratingPromise === pendingPromise) {
				logger.debug('Enumeration promise completed');
				this.enumeratingPromise = null;
			}
		});
	}

	private async enumerateDevices(
		requestPermissions: boolean,
		permissionTargets: Array<MediaPermissionTarget>,
	): Promise<VoiceDeviceState> {
		logger.debug('enumerateDevices started', {requestPermissions, permissionTargets});

		if (!navigator.mediaDevices?.enumerateDevices) {
			logger.debug('Navigator or mediaDevices API not available');
			return this.state;
		}

		if (requestPermissions) {
			logger.debug('Setting permission status to loading');
			this.updateState({permissionStatus: 'loading'});
		}

		try {
			logger.debug('Calling navigator.mediaDevices.enumerateDevices()');
			let devices = await navigator.mediaDevices.enumerateDevices();
			let permissionStatus = this.state.permissionStatus;

			logger.debug('Initial enumeration result', {
				deviceCount: devices.length,
				devices: devices.map((d) => ({
					kind: d.kind,
					deviceId: d.deviceId,
					label: d.label,
					hasLabel: !!d.label,
				})),
			});

			const hasLabels = devices.some((device) => device.label && device.label !== '');
			let usedNativeFlow = false;
			if (hasLabels) {
				logger.debug('Devices have labels, permissions already granted');
				permissionStatus = 'granted';
			} else if (requestPermissions && (isDesktop() || isNativeMobile())) {
				logger.debug('No labels detected; attempting native permission flow');
				const nativeResults = await Promise.all(
					permissionTargets.map(async (target) => ({
						target,
						result: await ensureNativePermission(target),
					})),
				);
				usedNativeFlow = nativeResults.some(({result}) => result !== 'unsupported');
				if (nativeResults.some(({result}) => isNativePermissionDenied(result))) {
					permissionStatus = 'denied';
				} else if (nativeResults.some(({result}) => result === 'granted')) {
					permissionStatus = 'granted';
				}
			}

			if (!hasLabels && requestPermissions && (!usedNativeFlow || permissionStatus !== 'granted')) {
				const isIOSPWA = Platform.isIOSWeb && Platform.isPWA;
				let skipGetUserMedia = false;

				if (isIOSPWA && navigator.permissions) {
					try {
						const micPermission = await navigator.permissions.query({name: 'microphone' as PermissionName});
						if (micPermission.state === 'granted') {
							logger.debug('iOS PWA: microphone permission already granted via Permissions API, skipping getUserMedia');
							permissionStatus = 'granted';
							devices = await navigator.mediaDevices.enumerateDevices();
							skipGetUserMedia = devices.some((d) => d.label && d.label !== '');
						}
					} catch {}
				}

				if (!skipGetUserMedia) {
					const requestedConstraints = buildPermissionConstraints(permissionTargets);
					logger.debug('No labels found, requesting permissions via getUserMedia', {
						requestedConstraints,
					});

					if (!requestedConstraints) {
						logger.debug('Skipping getUserMedia because no permission targets were requested');
					} else {
						try {
							const stream = await navigator.mediaDevices.getUserMedia(requestedConstraints);
							logger.debug('getUserMedia succeeded, stopping tracks');
							stream.getTracks().forEach((track) => {
								logger.debug('Stopping track', {kind: track.kind, label: track.label});
								track.stop();
							});
							permissionStatus = 'granted';
							logger.debug('Re-enumerating devices after permission grant');
							devices = await navigator.mediaDevices.enumerateDevices();
							logger.debug('Re-enumeration result', {
								deviceCount: devices.length,
								devices: devices.map((d) => ({
									kind: d.kind,
									deviceId: d.deviceId,
									label: d.label,
								})),
							});
						} catch (error) {
							logger.debug('getUserMedia failed', {
								error,
								errorName: error instanceof DOMException ? error.name : 'unknown',
								errorMessage: error instanceof Error ? error.message : String(error),
							});
							if (
								error instanceof DOMException &&
								(error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError')
							) {
								permissionStatus = 'denied';
							} else {
								permissionStatus = 'granted';
							}
						}
					}
				}
			}

			if (requestPermissions && permissionStatus === 'granted' && !this.hasRequiredDevices(devices, permissionTargets)) {
				// Mobile browsers (and some Android WebViews) can report an empty/stale
				// device list for a short moment right after permission is granted.
				// Retry a couple of times before concluding no devices exist.
				devices = await this.retryEnumerateDevices(devices, permissionTargets);
			}

			const inputDevices = sortDevices(devices.filter((device) => device.kind === 'audioinput'));
			const outputDevices = sortDevices(devices.filter((device) => device.kind === 'audiooutput'));
			const videoDevices = sortDevices(devices.filter((device) => device.kind === 'videoinput'));

			const nextState: VoiceDeviceState = {
				inputDevices,
				outputDevices,
				videoDevices,
				permissionStatus: this.resolvePermissionStatus(requestPermissions, permissionStatus),
			};

			logger.debug('Final device state', {
				inputDeviceCount: inputDevices.length,
				outputDeviceCount: outputDevices.length,
				videoDeviceCount: videoDevices.length,
				permissionStatus: nextState.permissionStatus,
			});

			this.updateState(nextState);
			return this.state;
		} catch (_error) {
			logger.debug('enumerateDevices failed with exception', _error);
			if (requestPermissions) {
				this.updateState({permissionStatus: 'denied'});
			}
			return this.state;
		}
	}

	private resolvePermissionStatus(requestPermissions: boolean, computedStatus: PermissionStatus): PermissionStatus {
		if (!requestPermissions) {
			if (this.state.permissionStatus === 'denied') {
				return 'denied';
			}
			if (this.state.permissionStatus === 'granted') {
				return 'granted';
			}
		}
		return computedStatus;
	}

	private updateState(partial: Partial<VoiceDeviceState>) {
		this.state = {
			...this.state,
			...partial,
		};
		this.listeners.forEach((listener) => listener(this.state));
	}

	private handleDeviceChange = () => {
		void this.ensureDevices({requestPermissions: this.shouldRequestPermissions});
	};

	private handleVisibilityChange = () => {
		if (document.visibilityState === 'visible') {
			void this.ensureDevices({requestPermissions: this.shouldRequestPermissions});
		}
	};

	private handleWindowFocus = () => {
		void this.ensureDevices({requestPermissions: this.shouldRequestPermissions});
	};

	private hasRequiredDevices(devices: ReadonlyArray<MediaDeviceInfo>, permissionTargets: Array<MediaPermissionTarget>): boolean {
		const needsMic = permissionTargets.includes('microphone');
		const needsCamera = permissionTargets.includes('camera');

		if (needsMic && !devices.some((device) => device.kind === 'audioinput')) {
			return false;
		}
		if (needsCamera && !devices.some((device) => device.kind === 'videoinput')) {
			return false;
		}
		return true;
	}

	private async retryEnumerateDevices(
		initialDevices: Array<MediaDeviceInfo>,
		permissionTargets: Array<MediaPermissionTarget>,
	): Promise<Array<MediaDeviceInfo>> {
		let devices = initialDevices;
		const retryDelaysMs = [180, 320, 520];
		for (const delayMs of retryDelaysMs) {
			if (this.hasRequiredDevices(devices, permissionTargets)) {
				return devices;
			}
			await new Promise((resolve) => setTimeout(resolve, delayMs));
			devices = await navigator.mediaDevices.enumerateDevices();
		}
		return devices;
	}
}

export const voiceDeviceManager = new VoiceDeviceManager();
