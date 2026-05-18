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

import {app, ipcMain} from 'electron';
import {APP_PROTOCOL, LEGACY_APP_PROTOCOL} from '../common/constants.js';
import {getMainWindow, showWindow} from './window.js';

let initialDeepLink: string | null = null;

export function initializeDeepLinks(): void {
	if (process.defaultApp) {
		if (process.argv.length >= 2) {
			app.setAsDefaultProtocolClient(APP_PROTOCOL, process.execPath, [process.argv[1]]);
		}
	} else {
		app.setAsDefaultProtocolClient(APP_PROTOCOL);
	}
	// Keep compatibility with old links from previous branding.
	app.setAsDefaultProtocolClient(LEGACY_APP_PROTOCOL);

	const deepLinkArg = process.argv.find(
		(arg) => arg.startsWith(`${APP_PROTOCOL}://`) || arg.startsWith(`${LEGACY_APP_PROTOCOL}://`),
	);
	if (deepLinkArg) {
		initialDeepLink = deepLinkArg;
	}

	ipcMain.handle('get-initial-deep-link', (): string | null => {
		const url = initialDeepLink;
		initialDeepLink = null;
		return url;
	});
}

export function handleOpenUrl(url: string): void {
	const mainWindow = getMainWindow();

	if (mainWindow && !mainWindow.isDestroyed()) {
		mainWindow.webContents.send('deep-link', url);
		showWindow();
	} else {
		initialDeepLink = url;
	}
}

export function handleSecondInstance(argv: Array<string>): void {
	const url = argv.find(
		(arg) => arg.startsWith(`${APP_PROTOCOL}://`) || arg.startsWith(`${LEGACY_APP_PROTOCOL}://`),
	);

	if (url) {
		const mainWindow = getMainWindow();
		if (mainWindow && !mainWindow.isDestroyed()) {
			mainWindow.webContents.send('deep-link', url);
			showWindow();
		} else {
			initialDeepLink = url;
		}
	} else {
		showWindow();
	}
}
