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

import fs from 'node:fs';
import path from 'node:path';
import {app, BrowserWindow, ipcMain, Menu, nativeImage, screen, Tray} from 'electron';
import log from 'electron-log';
import {BUILD_CHANNEL} from '../common/build-channel.js';
import type {VoiceStateInfo} from '../common/types.js';
import {getMainWindow, showWindow} from './window.js';

const isCanary = BUILD_CHANNEL === 'canary';
const APP_NAME = isCanary ? 'Astral Canary' : 'Astral';

let tray: Tray | null = null;
let voicePopup: BrowserWindow | null = null;
let voiceState: VoiceStateInfo | null = null;
let popupHideTimeout: NodeJS.Timeout | null = null;

const POPUP_WIDTH = 300;
const POPUP_HEIGHT = 180;

function getTrayIcon(): Electron.NativeImage {
	const iconName = process.platform === 'win32' ? 'icon.ico' : '512x512.png';
	const candidates = [
		path.join(process.resourcesPath, iconName),
		path.join(process.resourcesPath, '512x512.png'),
		path.join(path.dirname(app.getPath('exe')), iconName),
		path.join(path.dirname(app.getPath('exe')), '512x512.png'),
	];

	for (const candidate of candidates) {
		if (fs.existsSync(candidate)) {
			const icon = nativeImage.createFromPath(candidate);
			if (!icon.isEmpty()) {
				const size = process.platform === 'win32' ? 16 : 22;
				return icon.resize({width: size, height: size});
			}
		}
	}

	log.warn('[Tray] No icon found, using empty image');
	return nativeImage.createEmpty();
}

function buildContextMenu(): Electron.Menu {
	const items: Array<Electron.MenuItemConstructorOptions> = [
		{
			label: '\u041E\u0442\u043A\u0440\u044B\u0442\u044C ' + APP_NAME,
			click: () => showWindow(),
		},
		{type: 'separator'},
	];

	if (voiceState && voiceState.channelName) {
		items.push({
			label: '\uD83D\uDD0A ' + voiceState.channelName,
			enabled: false,
		});

		if (voiceState.guildName) {
			items.push({
				label: '    ' + voiceState.guildName,
				enabled: false,
			});
		}

		items.push({type: 'separator'});

		items.push({
			label: voiceState.selfMute ? '\uD83D\uDD07 \u0412\u043A\u043B\u044E\u0447\u0438\u0442\u044C \u043C\u0438\u043A\u0440\u043E\u0444\u043E\u043D' : '\uD83C\uDFA4 \u0412\u044B\u043A\u043B\u044E\u0447\u0438\u0442\u044C \u043C\u0438\u043A\u0440\u043E\u0444\u043E\u043D',
			click: () => {
				getMainWindow()?.webContents.send('tray-toggle-mute');
			},
		});

		items.push({
			label: voiceState.selfDeaf ? '\uD83D\uDD08 \u0412\u043A\u043B\u044E\u0447\u0438\u0442\u044C \u0437\u0432\u0443\u043A' : '\uD83D\uDD07 \u0412\u044B\u043A\u043B\u044E\u0447\u0438\u0442\u044C \u0437\u0432\u0443\u043A',
			click: () => {
				getMainWindow()?.webContents.send('tray-toggle-deafen');
			},
		});

		items.push({
			label: '\uD83D\uDCDE \u041E\u0442\u043A\u043B\u044E\u0447\u0438\u0442\u044C\u0441\u044F',
			click: () => {
				getMainWindow()?.webContents.send('tray-disconnect-voice');
			},
		});

		items.push({type: 'separator'});
	}

	items.push({
		label: '\u0412\u044B\u0445\u043E\u0434 \u0438\u0437 ' + APP_NAME,
		click: () => app.quit(),
	});

	return Menu.buildFromTemplate(items);
}

function updateTrayTooltip(): void {
	if (!tray) return;

	if (voiceState && voiceState.channelName) {
		const guild = voiceState.guildName ? ' \u2014 ' + voiceState.guildName : '';
		const mute = voiceState.selfMute ? ' [\u041C\u0443\u0442]' : '';
		const deaf = voiceState.selfDeaf ? ' [\u0413\u043B\u0443\u0445\u043E\u0439]' : '';
		tray.setToolTip(APP_NAME + '\n\uD83D\uDD0A ' + voiceState.channelName + guild + mute + deaf);
	} else {
		tray.setToolTip(APP_NAME);
	}
}

function getVoicePopupHtml(): string {
	const state = voiceState;
	if (!state || !state.channelName) return '';

	const muteClass = state.selfMute ? ' active' : '';
	const deafClass = state.selfDeaf ? ' active' : '';

	const usersHtml = (state.users || [])
		.slice(0, 8)
		.map(
			(u) =>
				'<div class="user"><div class="avatar">' +
				u.username.charAt(0).toUpperCase() +
				'</div><span class="uname">' +
				u.username +
				'</span>' +
				(u.speaking ? '<span class="speak-dot"></span>' : '') +
				'</div>',
		)
		.join('');

	return [
		'<!DOCTYPE html><html><head><meta charset="utf-8"><style>',
		'*{margin:0;padding:0;box-sizing:border-box}',
		'body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#1e1f22;color:#dbdee1;border-radius:8px;overflow:hidden;user-select:none}',
		'.hdr{padding:10px 12px 4px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.02em;color:#23a559;display:flex;align-items:center;gap:6px}',
		'.hdr .dot{width:8px;height:8px;border-radius:50%;background:#23a559}',
		'.ch{padding:2px 12px 6px;font-size:14px;font-weight:600;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
		'.guild{padding:0 12px 6px;font-size:11px;color:#949ba4}',
		'.users{padding:0 12px 6px;display:flex;flex-wrap:wrap;gap:4px;max-height:52px;overflow:hidden}',
		'.user{display:flex;align-items:center;gap:4px;font-size:12px;color:#b5bac1}',
		'.avatar{width:20px;height:20px;border-radius:50%;background:#5865f2;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;color:#fff}',
		'.speak-dot{width:6px;height:6px;border-radius:50%;background:#23a559}',
		'.ctrls{display:flex;gap:4px;padding:8px 12px 10px;border-top:1px solid #2b2d31}',
		'.btn{flex:1;padding:6px;border:none;border-radius:4px;background:#2b2d31;color:#dbdee1;font-size:16px;cursor:pointer;transition:background .15s}',
		'.btn:hover{background:#383a40}',
		'.btn.active{background:#da373c;color:#fff}',
		'.btn.disc{background:#da373c;color:#fff;font-size:12px;font-weight:600}',
		'.btn.disc:hover{background:#a12d31}',
		'</style></head><body>',
		'<div class="hdr"><div class="dot"></div>\u0413\u043E\u043B\u043E\u0441\u043E\u0432\u043E\u0439 \u043A\u0430\u043D\u0430\u043B</div>',
		'<div class="ch">\uD83D\uDD0A ' + state.channelName + '</div>',
		state.guildName ? '<div class="guild">' + state.guildName + '</div>' : '',
		usersHtml ? '<div class="users">' + usersHtml + '</div>' : '',
		'<div class="ctrls">',
		'<button class="btn' + muteClass + '" id="mute">' + (state.selfMute ? '\uD83D\uDD07' : '\uD83C\uDFA4') + '</button>',
		'<button class="btn' + deafClass + '" id="deaf">' + (state.selfDeaf ? '\uD83D\uDD08' : '\uD83D\uDD07') + '</button>',
		'<button class="btn disc" id="disc">\uD83D\uDCDE</button>',
		'</div>',
		'<script>',
		'document.getElementById("mute").onclick=function(){window.close()};',
		'document.getElementById("deaf").onclick=function(){window.close()};',
		'document.getElementById("disc").onclick=function(){window.close()};',
		'</script>',
		'</body></html>',
	].join('');
}

function showVoicePopup(): void {
	if (!voiceState || !voiceState.channelName || !tray) return;

	if (popupHideTimeout) {
		clearTimeout(popupHideTimeout);
		popupHideTimeout = null;
	}

	if (voicePopup && !voicePopup.isDestroyed()) {
		updateVoicePopupContent();
		voicePopup.show();
		return;
	}

	const trayBounds = tray.getBounds();
	const display = screen.getDisplayNearestPoint({x: trayBounds.x, y: trayBounds.y});
	const workArea = display.workArea;

	let x = Math.round(trayBounds.x + trayBounds.width / 2 - POPUP_WIDTH / 2);
	let y: number;

	if (trayBounds.y < workArea.y + workArea.height / 2) {
		y = trayBounds.y + trayBounds.height + 4;
	} else {
		y = trayBounds.y - POPUP_HEIGHT - 4;
	}

	x = Math.max(workArea.x, Math.min(x, workArea.x + workArea.width - POPUP_WIDTH));
	y = Math.max(workArea.y, Math.min(y, workArea.y + workArea.height - POPUP_HEIGHT));

	voicePopup = new BrowserWindow({
		width: POPUP_WIDTH,
		height: POPUP_HEIGHT,
		x,
		y,
		frame: false,
		resizable: false,
		movable: false,
		alwaysOnTop: true,
		skipTaskbar: true,
		show: false,
		transparent: true,
		focusable: false,
		webPreferences: {
			contextIsolation: true,
			nodeIntegration: false,
			sandbox: true,
		},
	});

	voicePopup.setVisibleOnAllWorkspaces(true);

	const html = getVoicePopupHtml();
	voicePopup.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));

	voicePopup.once('ready-to-show', () => {
		voicePopup?.show();
	});

	voicePopup.on('blur', () => {
		hideVoicePopup();
	});

	voicePopup.on('closed', () => {
		voicePopup = null;
	});

	voicePopup.webContents.on('will-navigate', (event) => {
		event.preventDefault();
	});

	voicePopup.webContents.on('before-input-event', (_event, input) => {
		if (input.key === 'Escape') {
			hideVoicePopup();
		}
	});
}

function updateVoicePopupContent(): void {
	if (!voicePopup || voicePopup.isDestroyed()) return;
	const html = getVoicePopupHtml();
	if (html) {
		voicePopup.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
	}
}

function hideVoicePopup(): void {
	if (popupHideTimeout) {
		clearTimeout(popupHideTimeout);
	}

	popupHideTimeout = setTimeout(() => {
		if (voicePopup && !voicePopup.isDestroyed()) {
			voicePopup.hide();
		}
		popupHideTimeout = null;
	}, 300);
}

export function createTray(): void {
	if (tray) return;

	try {
		const icon = getTrayIcon();
		tray = new Tray(icon);
		tray.setToolTip(APP_NAME);
		tray.setContextMenu(buildContextMenu());

		tray.on('click', () => {
			const mainWindow = getMainWindow();
			if (!mainWindow) return;

			if (mainWindow.isVisible() && !mainWindow.isMinimized()) {
				mainWindow.hide();
			} else {
				showWindow();
			}
		});

		tray.on('double-click', () => {
			showWindow();
		});

		if (process.platform === 'win32') {
			tray.on('mouse-move', () => {
				if (voiceState && voiceState.channelName) {
					showVoicePopup();
				}
			});
		}

		log.info('[Tray] System tray created');
	} catch (error) {
		log.error('[Tray] Failed to create system tray:', error);
	}
}

export function destroyTray(): void {
	if (voicePopup && !voicePopup.isDestroyed()) {
		voicePopup.close();
		voicePopup = null;
	}

	if (tray) {
		tray.destroy();
		tray = null;
	}
}

export function registerTrayIpcHandlers(): void {
	ipcMain.on('tray-update-voice-state', (_event, state: VoiceStateInfo | null) => {
		voiceState = state;
		updateTrayTooltip();

		if (tray) {
			tray.setContextMenu(buildContextMenu());
		}

		if (voicePopup && !voicePopup.isDestroyed() && voicePopup.isVisible()) {
			if (!state || !state.channelName) {
				hideVoicePopup();
			} else {
				updateVoicePopupContent();
			}
		}
	});

	ipcMain.on('tray-voice-popup-action', (_event, action: string) => {
		const mainWindow = getMainWindow();
		if (!mainWindow) return;

		switch (action) {
			case 'mute':
				mainWindow.webContents.send('tray-toggle-mute');
				break;
			case 'deafen':
				mainWindow.webContents.send('tray-toggle-deafen');
				break;
			case 'disconnect':
				mainWindow.webContents.send('tray-disconnect-voice');
				break;
		}

		hideVoicePopup();
	});
}

export function getTray(): Tray | null {
	return tray;
}
