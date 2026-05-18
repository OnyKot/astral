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

import {existsSync} from 'node:fs';
import path from 'node:path';
import {app, autoUpdater, type BrowserWindow, ipcMain} from 'electron';
import log from 'electron-log';
import {BUILD_CHANNEL} from '../common/build-channel.js';
import {DESKTOP_UPDATE_ORIGINS} from '../common/constants.js';
import {setQuitting} from './window.js';

export type UpdaterContext = 'user' | 'background' | 'focus';

export type UpdaterEvent =
	| {type: 'checking'; context: UpdaterContext}
	| {type: 'available'; context: UpdaterContext; version?: string | null}
	| {type: 'not-available'; context: UpdaterContext}
	| {type: 'downloaded'; context: UpdaterContext; version?: string | null}
	| {type: 'error'; context: UpdaterContext; message: string};

let lastContext: UpdaterContext = 'background';
let activeCandidateIndex = 0;
let activeCheckContext: UpdaterContext | null = null;
let emittedCheckingForActiveCheck = false;

const UPDATE_INTERVAL_MS = 12 * 60 * 60 * 1000;
const SUPPORTED_UPDATE_PLATFORMS = new Set(['darwin', 'win32']);

function send(win: BrowserWindow | null, event: UpdaterEvent) {
	win?.webContents.send('updater-event', event);
}

function hasSquirrelUpdateExe(): boolean {
	if (process.platform !== 'win32') {
		return true;
	}

	const updateExe = path.resolve(path.dirname(process.execPath), '..', 'Update.exe');
	return existsSync(updateExe);
}

type FeedServerType = 'default' | 'json';

interface FeedCandidate {
	feedUrl: string;
	serverType: FeedServerType;
	logLabel: string;
}

function buildFeedCandidates(): Array<FeedCandidate> {
	return DESKTOP_UPDATE_ORIGINS.map((origin) => {
		const baseUrl = `${origin}/dl/desktop/${BUILD_CHANNEL}/${process.platform}/${process.arch}`;
		if (process.platform === 'darwin') {
			return {
				feedUrl: `${baseUrl}/RELEASES.json`,
				serverType: 'json' as const,
				logLabel: baseUrl,
			};
		}

		return {
			feedUrl: baseUrl,
			serverType: 'default' as const,
			logLabel: baseUrl,
		};
	});
}

function requestHeaders(): Record<string, string> {
	return {
		'User-Agent': `Astral/${app.getVersion()} (${process.platform}; ${process.arch})`,
	};
}

function configureFeedCandidate(candidate: FeedCandidate): void {
	log.info('Updater feed candidate', {feedUrl: candidate.logLabel, serverType: candidate.serverType});
	autoUpdater.setFeedURL({
		url: candidate.feedUrl,
		headers: requestHeaders(),
		serverType: candidate.serverType,
	});
}

function finishActiveCheck(): UpdaterContext {
	const context = activeCheckContext ?? lastContext;
	activeCheckContext = null;
	activeCandidateIndex = 0;
	emittedCheckingForActiveCheck = false;
	return context;
}

function tryNextFeedCandidate(candidates: Array<FeedCandidate>): boolean {
	const nextIndex = activeCandidateIndex + 1;
	if (nextIndex >= candidates.length) {
		return false;
	}

	activeCandidateIndex = nextIndex;
	configureFeedCandidate(candidates[nextIndex]);
	autoUpdater.checkForUpdates();
	return true;
}

export function registerUpdater(getMainWindow: () => BrowserWindow | null) {
	const feedCandidates = buildFeedCandidates();
	const updatesSupported =
		SUPPORTED_UPDATE_PLATFORMS.has(process.platform) && (process.platform !== 'win32' || hasSquirrelUpdateExe());

	if (!updatesSupported || feedCandidates.length === 0) {
		log.info('Updater disabled on Windows: Squirrel Update.exe not found');

		ipcMain.handle('updater-check', async (_e, context: UpdaterContext) => {
			lastContext = context;
			send(getMainWindow(), {type: 'not-available', context});
		});

		ipcMain.handle('updater-install', async () => undefined);
		return;
	}

	autoUpdater.on('checking-for-update', () => {
		if (!emittedCheckingForActiveCheck) {
			emittedCheckingForActiveCheck = true;
			send(getMainWindow(), {type: 'checking', context: activeCheckContext ?? lastContext});
		}
	});

	autoUpdater.on('update-available', () => {
		const context = finishActiveCheck();
		send(getMainWindow(), {type: 'available', context, version: null});
	});

	autoUpdater.on('update-not-available', () => {
		if (tryNextFeedCandidate(feedCandidates)) {
			return;
		}

		const context = finishActiveCheck();
		send(getMainWindow(), {type: 'not-available', context});
	});

	autoUpdater.on('update-downloaded', (_event, _releaseNotes, releaseName) => {
		const context = finishActiveCheck();
		send(getMainWindow(), {type: 'downloaded', context, version: releaseName ?? null});
	});

	autoUpdater.on('error', (err: Error) => {
		if (tryNextFeedCandidate(feedCandidates)) {
			log.warn('Updater feed failed, trying fallback', {
				candidateIndex: activeCandidateIndex - 1,
				message: err?.message ?? String(err),
			});
			return;
		}

		const context = finishActiveCheck();
		send(getMainWindow(), {type: 'error', context, message: err?.message ?? String(err)});
	});

	const startCheck = (context: UpdaterContext) => {
		lastContext = context;
		if (activeCheckContext) {
			activeCheckContext = context;
			return;
		}

		activeCheckContext = context;
		activeCandidateIndex = 0;
		emittedCheckingForActiveCheck = false;
		configureFeedCandidate(feedCandidates[0]);
		autoUpdater.checkForUpdates();
	};

	startCheck('background');
	setInterval(() => startCheck('background'), UPDATE_INTERVAL_MS);

	ipcMain.handle('updater-check', async (_e, context: UpdaterContext) => {
		startCheck(context);
	});

	ipcMain.handle('updater-install', async () => {
		setQuitting(true);
		autoUpdater.quitAndInstall();
	});
}
