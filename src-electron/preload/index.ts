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

import type {
	AuthenticationResponseJSON,
	PublicKeyCredentialCreationOptionsJSON,
	PublicKeyCredentialRequestOptionsJSON,
	RegistrationResponseJSON,
} from '@simplewebauthn/browser';
import {contextBridge, ipcRenderer, webFrame} from 'electron';
import {BUILD_CHANNEL} from '../common/build-channel.js';
import type {
	DesktopInfo,
	DesktopNowPlayingSnapshot,
	DesktopSource,
	DisplayMediaRequestInfo,
	DownloadFileResult,
	ElectronAPI,
	GlobalKeybindTriggeredEvent,
	GlobalKeyEvent,
	GlobalKeyHookRegisterOptions,
	GlobalMouseEvent,
	MediaAccessStatus,
	MediaAccessType,
	NotificationOptions,
	NotificationResult,
	SpellcheckState,
	TextareaContextMenuParams,
	UpdaterContext,
	UpdaterEvent,
	VoiceStateInfo,
} from '../common/types.js';

const WS_PROXY_PORT = BUILD_CHANNEL === 'canary' ? 21866 : 21865;
const API_PROXY_PORT = BUILD_CHANNEL === 'canary' ? 21862 : 21861;
const MEDIA_PROXY_PORT = BUILD_CHANNEL === 'canary' ? 21868 : 21867;

// Keep preload startup non-blocking: desktop proxy endpoints are deterministic local ports.
const WS_PROXY_BASE_URL = `ws://127.0.0.1:${WS_PROXY_PORT}`;
const AP_PROXY_BASE_URL = `http://127.0.0.1:${API_PROXY_PORT}/proxy`;
const MEDIA_PROXY_BASE_URL = `http://127.0.0.1:${MEDIA_PROXY_PORT}/media`;

let mediaProxyToken: string | null | undefined;
let mediaProxyUrl: string | null | undefined;

const getMediaProxyToken = (): string | null => {
	if (mediaProxyToken !== undefined) {
		return mediaProxyToken;
	}

	try {
		const response = ipcRenderer.sendSync('get-media-proxy-token');
		if (typeof response === 'string' && response) {
			mediaProxyToken = response;
			return mediaProxyToken;
		}
	} catch {}

	mediaProxyToken = null;
	return mediaProxyToken;
};

const buildMediaProxyUrl = (baseUrl: string): string | null => {
	if (!baseUrl) {
		return null;
	}

	try {
		const url = new URL(baseUrl);
		const token = getMediaProxyToken();
		if (token) {
			url.searchParams.set('token', token);
		}
		return url.toString();
	} catch {
		return null;
	}
};

const getResolvedMediaProxyUrl = (): string | null => {
	if (mediaProxyUrl !== undefined) {
		return mediaProxyUrl;
	}

	mediaProxyUrl = buildMediaProxyUrl(MEDIA_PROXY_BASE_URL);
	return mediaProxyUrl;
};

const api: ElectronAPI = {
	platform: process.platform,

	getDesktopInfo: (): Promise<DesktopInfo> => ipcRenderer.invoke('get-desktop-info'),
	getDesktopNowPlaying: (): Promise<DesktopNowPlayingSnapshot | null> => ipcRenderer.invoke('get-desktop-now-playing'),

	getWsProxyUrl: (): string | null => WS_PROXY_BASE_URL,
	getApiProxyUrl: (): string | null => AP_PROXY_BASE_URL,
	getMediaProxyUrl: (): string | null => getResolvedMediaProxyUrl(),

	onUpdaterEvent: (callback: (event: UpdaterEvent) => void): (() => void) => {
		const handler = (_event: Electron.IpcRendererEvent, data: UpdaterEvent) => callback(data);
		ipcRenderer.on('updater-event', handler);
		return () => ipcRenderer.removeListener('updater-event', handler);
	},

	updaterCheck: (context: UpdaterContext): Promise<void> => ipcRenderer.invoke('updater-check', context),
	updaterInstall: () => ipcRenderer.invoke('updater-install'),

	windowMinimize: (): void => {
		ipcRenderer.send('window-minimize');
	},
	windowMaximize: (): void => {
		ipcRenderer.send('window-maximize');
	},
	windowClose: (): void => {
		ipcRenderer.send('window-close');
	},
	windowIsMaximized: (): Promise<boolean> => ipcRenderer.invoke('window-is-maximized'),
	onWindowMaximizeChange: (callback: (maximized: boolean) => void): (() => void) => {
		const handler = (_event: Electron.IpcRendererEvent, maximized: boolean): void => {
			callback(maximized);
		};
		ipcRenderer.on('window-maximize-change', handler);
		return () => {
			ipcRenderer.removeListener('window-maximize-change', handler);
		};
	},

	openExternal: (url: string): Promise<void> => ipcRenderer.invoke('open-external', url),

	clipboardWriteText: (text: string): Promise<void> => ipcRenderer.invoke('clipboard-write-text', text),
	clipboardReadText: (): Promise<string> => ipcRenderer.invoke('clipboard-read-text'),

	onDeepLink: (callback: (url: string) => void): (() => void) => {
		const handler = (_event: Electron.IpcRendererEvent, url: string): void => {
			callback(url);
		};
		ipcRenderer.on('deep-link', handler);
		return () => {
			ipcRenderer.removeListener('deep-link', handler);
		};
	},
	getInitialDeepLink: (): Promise<string | null> => ipcRenderer.invoke('get-initial-deep-link'),

	onRpcNavigate: (callback: (path: string) => void): (() => void) => {
		const handler = (_event: Electron.IpcRendererEvent, path: string): void => {
			callback(path);
		};
		ipcRenderer.on('rpc-navigate', handler);
		return () => {
			ipcRenderer.removeListener('rpc-navigate', handler);
		};
	},

	registerGlobalShortcut: (accelerator: string, id: string): Promise<boolean> =>
		ipcRenderer.invoke('register-global-shortcut', {accelerator, id}),
	unregisterGlobalShortcut: (accelerator: string): Promise<void> =>
		ipcRenderer.invoke('unregister-global-shortcut', accelerator),
	unregisterAllGlobalShortcuts: (): Promise<void> => ipcRenderer.invoke('unregister-all-global-shortcuts'),
	onGlobalShortcut: (callback: (id: string) => void): (() => void) => {
		const handler = (_event: Electron.IpcRendererEvent, id: string): void => {
			callback(id);
		};
		ipcRenderer.on('global-shortcut-triggered', handler);
		return () => {
			ipcRenderer.removeListener('global-shortcut-triggered', handler);
		};
	},

	autostartEnable: (): Promise<void> => ipcRenderer.invoke('autostart-enable'),
	autostartDisable: (): Promise<void> => ipcRenderer.invoke('autostart-disable'),
	autostartIsEnabled: (): Promise<boolean> => ipcRenderer.invoke('autostart-is-enabled'),
	autostartIsInitialized: (): Promise<boolean> => ipcRenderer.invoke('autostart-is-initialized'),
	autostartMarkInitialized: (): Promise<void> => ipcRenderer.invoke('autostart-mark-initialized'),

	checkMediaAccess: (type: MediaAccessType): Promise<MediaAccessStatus> =>
		ipcRenderer.invoke('check-media-access', type),
	requestMediaAccess: (type: MediaAccessType): Promise<boolean> => ipcRenderer.invoke('request-media-access', type),
	openMediaAccessSettings: (type: MediaAccessType): Promise<void> =>
		ipcRenderer.invoke('open-media-access-settings', type),

	checkAccessibility: (prompt: boolean): Promise<boolean> => ipcRenderer.invoke('check-accessibility', prompt),
	openAccessibilitySettings: (): Promise<void> => ipcRenderer.invoke('open-accessibility-settings'),
	openInputMonitoringSettings: (): Promise<void> => ipcRenderer.invoke('open-input-monitoring-settings'),

	downloadFile: (url: string, defaultPath: string): Promise<DownloadFileResult> =>
		ipcRenderer.invoke('download-file', {url, defaultPath}),

	passkeyIsSupported: (): Promise<boolean> => ipcRenderer.invoke('passkey-is-supported'),
	passkeyAuthenticate: (options: PublicKeyCredentialRequestOptionsJSON): Promise<AuthenticationResponseJSON> =>
		ipcRenderer.invoke('passkey-authenticate', options),
	passkeyRegister: (options: PublicKeyCredentialCreationOptionsJSON): Promise<RegistrationResponseJSON> =>
		ipcRenderer.invoke('passkey-register', options),

	toggleDevTools: (): void => {
		ipcRenderer.send('toggle-devtools');
	},

	getDesktopSources: (types: Array<'screen' | 'window'>): Promise<Array<DesktopSource>> =>
		ipcRenderer.invoke('get-desktop-sources', types),
	onDisplayMediaRequested: (callback: (requestId: string, info: DisplayMediaRequestInfo) => void): (() => void) => {
		const handler = (_event: Electron.IpcRendererEvent, requestId: string, info: DisplayMediaRequestInfo): void => {
			callback(requestId, info);
		};
		ipcRenderer.on('display-media-requested', handler);
		return () => {
			ipcRenderer.removeListener('display-media-requested', handler);
		};
	},
	selectDisplayMediaSource: (requestId: string, sourceId: string | null, withAudio: boolean): void => {
		ipcRenderer.send('select-display-media-source', requestId, sourceId, withAudio);
	},

	showNotification: (options: NotificationOptions): Promise<NotificationResult> =>
		ipcRenderer.invoke('show-notification', options),
	closeNotification: (id: string): void => {
		ipcRenderer.send('close-notification', id);
	},
	closeNotifications: (ids: Array<string>): void => {
		ipcRenderer.send('close-notifications', ids);
	},
	onNotificationClick: (callback: (id: string, url?: string) => void): (() => void) => {
		const handler = (_event: Electron.IpcRendererEvent, id: string, url?: string): void => {
			callback(id, url);
		};
		ipcRenderer.on('notification-click', handler);
		return () => {
			ipcRenderer.removeListener('notification-click', handler);
		};
	},

	setBadgeCount: (count: number): void => {
		ipcRenderer.send('set-badge-count', count);
	},
	getBadgeCount: (): Promise<number> => ipcRenderer.invoke('get-badge-count'),

	bounceDock: (type?: 'critical' | 'informational'): number => {
		return ipcRenderer.sendSync('bounce-dock', type ?? 'informational');
	},
	cancelBounceDock: (id: number): void => {
		ipcRenderer.send('cancel-bounce-dock', id);
	},

	setZoomFactor: (factor: number): void => {
		ipcRenderer.send('set-zoom-factor', factor);
	},
	getZoomFactor: (): Promise<number> => ipcRenderer.invoke('get-zoom-factor'),

	onZoomIn: (callback: () => void): (() => void) => {
		const handler = (): void => callback();
		ipcRenderer.on('zoom-in', handler);
		return () => ipcRenderer.removeListener('zoom-in', handler);
	},
	onZoomOut: (callback: () => void): (() => void) => {
		const handler = (): void => callback();
		ipcRenderer.on('zoom-out', handler);
		return () => ipcRenderer.removeListener('zoom-out', handler);
	},
	onZoomReset: (callback: () => void): (() => void) => {
		const handler = (): void => callback();
		ipcRenderer.on('zoom-reset', handler);
		return () => ipcRenderer.removeListener('zoom-reset', handler);
	},

	onOpenSettings: (callback: () => void): (() => void) => {
		const handler = (): void => callback();
		ipcRenderer.on('open-settings', handler);
		return () => ipcRenderer.removeListener('open-settings', handler);
	},

	globalKeyHookStart: (): Promise<boolean> => ipcRenderer.invoke('global-key-hook-start'),
	globalKeyHookStop: (): Promise<void> => ipcRenderer.invoke('global-key-hook-stop'),
	globalKeyHookIsRunning: (): Promise<boolean> => ipcRenderer.invoke('global-key-hook-is-running'),
	checkInputMonitoringAccess: (): Promise<boolean> => ipcRenderer.invoke('check-input-monitoring-access'),
	globalKeyHookRegister: (options: GlobalKeyHookRegisterOptions): Promise<void> =>
		ipcRenderer.invoke('global-key-hook-register', options),
	globalKeyHookUnregister: (id: string): Promise<void> => ipcRenderer.invoke('global-key-hook-unregister', id),
	globalKeyHookUnregisterAll: (): Promise<void> => ipcRenderer.invoke('global-key-hook-unregister-all'),
	onGlobalKeyEvent: (callback: (event: GlobalKeyEvent) => void): (() => void) => {
		const handler = (_event: Electron.IpcRendererEvent, data: GlobalKeyEvent): void => {
			callback(data);
		};
		ipcRenderer.on('global-key-event', handler);
		return () => {
			ipcRenderer.removeListener('global-key-event', handler);
		};
	},
	onGlobalMouseEvent: (callback: (event: GlobalMouseEvent) => void): (() => void) => {
		const handler = (_event: Electron.IpcRendererEvent, data: GlobalMouseEvent): void => {
			callback(data);
		};
		ipcRenderer.on('global-mouse-event', handler);
		return () => {
			ipcRenderer.removeListener('global-mouse-event', handler);
		};
	},
	onGlobalKeybindTriggered: (callback: (event: GlobalKeybindTriggeredEvent) => void): (() => void) => {
		const handler = (_event: Electron.IpcRendererEvent, data: GlobalKeybindTriggeredEvent): void => {
			callback(data);
		};
		ipcRenderer.on('global-keybind-triggered', handler);
		return () => {
			ipcRenderer.removeListener('global-keybind-triggered', handler);
		};
	},

	spellcheckGetState: (): Promise<SpellcheckState> => ipcRenderer.invoke('spellcheck-get-state'),
	spellcheckSetState: (state: Partial<SpellcheckState>): Promise<SpellcheckState> =>
		ipcRenderer.invoke('spellcheck-set-state', state),
	spellcheckGetAvailableLanguages: (): Promise<Array<string>> =>
		ipcRenderer.invoke('spellcheck-get-available-languages'),
	spellcheckOpenLanguageSettings: (): Promise<boolean> => ipcRenderer.invoke('spellcheck-open-language-settings'),
	onSpellcheckStateChanged: (callback: (state: SpellcheckState) => void): (() => void) => {
		const handler = (_event: Electron.IpcRendererEvent, data: SpellcheckState): void => callback(data);
		ipcRenderer.on('spellcheck-state-changed', handler);
		return () => {
			ipcRenderer.removeListener('spellcheck-state-changed', handler);
		};
	},
	onTextareaContextMenu: (callback: (params: TextareaContextMenuParams) => void): (() => void) => {
		const handler = (_event: Electron.IpcRendererEvent, data: TextareaContextMenuParams): void => callback(data);
		ipcRenderer.on('textarea-context-menu', handler);
		return () => {
			ipcRenderer.removeListener('textarea-context-menu', handler);
		};
	},
	spellcheckReplaceMisspelling: (replacement: string): Promise<void> =>
		ipcRenderer.invoke('spellcheck-replace-misspelling', replacement),
	spellcheckAddWordToDictionary: (word: string): Promise<void> =>
		ipcRenderer.invoke('spellcheck-add-word-to-dictionary', word),

	trayUpdateVoiceState: (state: VoiceStateInfo | null): void => {
		ipcRenderer.send('tray-update-voice-state', state);
	},
	onTrayToggleMute: (callback: () => void): (() => void) => {
		const handler = (): void => callback();
		ipcRenderer.on('tray-toggle-mute', handler);
		return () => ipcRenderer.removeListener('tray-toggle-mute', handler);
	},
	onTrayToggleDeafen: (callback: () => void): (() => void) => {
		const handler = (): void => callback();
		ipcRenderer.on('tray-toggle-deafen', handler);
		return () => ipcRenderer.removeListener('tray-toggle-deafen', handler);
	},
	onTrayDisconnectVoice: (callback: () => void): (() => void) => {
		const handler = (): void => callback();
		ipcRenderer.on('tray-disconnect-voice', handler);
		return () => ipcRenderer.removeListener('tray-disconnect-voice', handler);
	},
};

ipcRenderer.on('desktop-memory-trim', () => {
	try {
		webFrame.clearCache();
	} catch {}
});

window.addEventListener(
	'contextmenu',
	(event) => {
		const target = event.target as HTMLElement | null;
		const isTextarea = Boolean(target?.closest?.('textarea'));
		ipcRenderer.send('spellcheck-context-target', {isTextarea});
	},
	true,
);

contextBridge.exposeInMainWorld('electron', api);
