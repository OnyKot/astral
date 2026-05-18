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

import {registerPlugin, type PluginListenerHandle} from '@capacitor/core';

export type CapacitorPermissionState = 'prompt' | 'prompt-with-rationale' | 'granted' | 'denied';

export interface PushPermissionStatus {
	receive: CapacitorPermissionState;
}

export interface LocalNotificationPermissionStatus {
	display: CapacitorPermissionState;
}

export interface PushNotificationToken {
	value: string;
}

export interface PushNotificationSchema {
	id?: string;
	title?: string;
	body?: string;
	data?: Record<string, unknown>;
}

export interface PushNotificationActionPerformed {
	actionId: string;
	notification: PushNotificationSchema;
	inputValue?: string;
}

export interface LocalNotificationSchema {
	id: number;
	title: string;
	body?: string;
	sound?: string;
	smallIcon?: string;
	channelId?: string;
	actionTypeId?: string;
	ongoing?: boolean;
	autoCancel?: boolean;
	extra?: Record<string, unknown>;
}

export interface LocalNotificationActionTypeAction {
	id: string;
	title: string;
	foreground?: boolean;
	destructive?: boolean;
	input?: boolean;
}

export interface LocalNotificationActionType {
	id: string;
	actions: Array<LocalNotificationActionTypeAction>;
}

export interface LocalNotificationActionPerformed {
	actionId: string;
	notification: {
		id: number;
		title?: string;
		body?: string;
		extra?: Record<string, unknown>;
	};
	inputValue?: string;
}

export type CapacitorListener = Promise<PluginListenerHandle> | PluginListenerHandle;

export interface PushNotificationsPlugin {
	checkPermissions(): Promise<PushPermissionStatus>;
	requestPermissions(): Promise<PushPermissionStatus>;
	register(): Promise<void>;
	unregister?(): Promise<void>;
	addListener(eventName: 'registration', listener: (token: PushNotificationToken) => void): CapacitorListener;
	addListener(
		eventName: 'registrationError',
		listener: (error: {error: string | Error}) => void,
	): CapacitorListener;
	addListener(eventName: 'pushNotificationReceived', listener: (notification: PushNotificationSchema) => void): CapacitorListener;
	addListener(
		eventName: 'pushNotificationActionPerformed',
		listener: (action: PushNotificationActionPerformed) => void,
	): CapacitorListener;
}

export interface LocalNotificationsPlugin {
	checkPermissions?(): Promise<LocalNotificationPermissionStatus>;
	requestPermissions?(): Promise<LocalNotificationPermissionStatus>;
	registerActionTypes?(options: {types: Array<LocalNotificationActionType>}): Promise<void>;
	schedule(options: {notifications: Array<LocalNotificationSchema>}): Promise<void>;
	cancel(options: {notifications: Array<{id: number}>}): Promise<void>;
	addListener(
		eventName: 'localNotificationActionPerformed',
		listener: (action: LocalNotificationActionPerformed) => void,
	): CapacitorListener;
}

export const PushNotifications = registerPlugin<PushNotificationsPlugin>('PushNotifications');
export const LocalNotifications = registerPlugin<LocalNotificationsPlugin>('LocalNotifications');

export const isPermissionGranted = (value: CapacitorPermissionState | undefined): boolean => value === 'granted';
