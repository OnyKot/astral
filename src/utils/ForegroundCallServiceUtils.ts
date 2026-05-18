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

import {registerPlugin} from '@capacitor/core';
import {isNativeMobile} from '~/utils/NativeUtils';

interface ForegroundCallPlugin {
	startOrUpdate(options: {
		title: string;
		body: string;
		url?: string;
		channelId: string;
	}): Promise<{started: boolean}>;
	stop(): Promise<{stopped: boolean}>;
	showIncoming(options: {
		title: string;
		body: string;
		url?: string;
		channelId: string;
	}): Promise<{shown: boolean}>;
	clearIncoming(options: {channelId: string}): Promise<{cleared: boolean}>;
}

const ForegroundCall = registerPlugin<ForegroundCallPlugin>('ForegroundCall');

export const startOrUpdateForegroundCallService = async (options: {
	title: string;
	body: string;
	url?: string;
	channelId: string;
}): Promise<boolean> => {
	if (!isNativeMobile()) {
		return false;
	}

	try {
		const result = await ForegroundCall.startOrUpdate(options);
		return Boolean(result.started);
	} catch {
		return false;
	}
};

export const stopForegroundCallService = async (): Promise<void> => {
	if (!isNativeMobile()) {
		return;
	}

	try {
		await ForegroundCall.stop();
	} catch {
		// ignore
	}
};

export const showIncomingCallFullscreen = async (options: {
	title: string;
	body: string;
	url?: string;
	channelId: string;
}): Promise<boolean> => {
	if (!isNativeMobile()) {
		return false;
	}

	try {
		const result = await ForegroundCall.showIncoming(options);
		return Boolean(result.shown);
	} catch {
		return false;
	}
};

export const clearIncomingCallFullscreen = async (channelId: string): Promise<void> => {
	if (!isNativeMobile()) {
		return;
	}

	try {
		await ForegroundCall.clearIncoming({channelId});
	} catch {
		// ignore
	}
};
