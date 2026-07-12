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

import {reaction} from 'mobx';
import {Endpoints} from '~/Endpoints';
import HttpClient from '~/lib/HttpClient';
import CallInitiatorStore from '~/stores/CallInitiatorStore';
import CallStateStore from '~/stores/CallStateStore';
import ChannelStore from '~/stores/ChannelStore';
import GeoIPStore from '~/stores/GeoIPStore';
import SoundStore from '~/stores/SoundStore';
import UserStore from '~/stores/UserStore';
import MediaEngineStore from '~/stores/voice/MediaEngineFacade';
import {SoundType} from '~/utils/SoundUtils';

interface PendingRing {
	channelId: string;
	recipients: Array<string>;
	dispose: (() => void) | null;
	fallbackTimeoutId: ReturnType<typeof setTimeout> | null;
}

let pendingRing: PendingRing | null = null;
const DM_CALL_RING_FALLBACK_DELAY_MS = 2800;

export async function checkCallEligibility(channelId: string): Promise<{ringable: boolean}> {
	const response = await HttpClient.get<{ringable: boolean}>(Endpoints.CHANNEL_CALL(channelId));
	return response.body ?? {ringable: false};
}

async function ringCallRecipients(channelId: string, recipients?: Array<string>): Promise<void> {
	const latitude = GeoIPStore.latitude;
	const longitude = GeoIPStore.longitude;
	const body: {recipients?: Array<string>; latitude?: string; longitude?: string} = {};
	if (recipients) {
		body.recipients = recipients;
	}
	if (latitude && longitude) {
		body.latitude = latitude;
		body.longitude = longitude;
	}
	await HttpClient.post(Endpoints.CHANNEL_CALL_RING(channelId), body);
}

async function stopRingingCallRecipients(channelId: string, recipients?: Array<string>): Promise<void> {
	await HttpClient.post(Endpoints.CHANNEL_CALL_STOP_RINGING(channelId), recipients ? {recipients} : {});
}

export async function ringParticipants(channelId: string, recipients?: Array<string>): Promise<void> {
	return ringCallRecipients(channelId, recipients);
}

export async function stopRingingParticipants(channelId: string, recipients?: Array<string>): Promise<void> {
	return stopRingingCallRecipients(channelId, recipients);
}

function clearPendingRing(): void {
	const current = pendingRing;
	pendingRing = null;
	if (current?.fallbackTimeoutId) {
		clearTimeout(current.fallbackTimeoutId);
	}
	current?.dispose?.();
}

function setupPendingRing(channelId: string, recipients: Array<string>): void {
	clearPendingRing();

	const nextPendingRing: PendingRing = {
		channelId,
		recipients: [...recipients],
		dispose: null,
		fallbackTimeoutId: null,
	};
	pendingRing = nextPendingRing;

	nextPendingRing.fallbackTimeoutId = setTimeout(() => {
		if (pendingRing !== nextPendingRing) {
			return;
		}

		const stillJoiningThisCall = MediaEngineStore.channelId === channelId && (MediaEngineStore.connected || MediaEngineStore.connecting);
		if (!stillJoiningThisCall) {
			clearPendingRing();
			return;
		}

		const recipientsToRing = nextPendingRing.recipients;
		clearPendingRing();
		void ringCallRecipients(channelId, recipientsToRing).catch((error) => {
			console.error('Failed to ring call recipients:', error);
		});
	}, DM_CALL_RING_FALLBACK_DELAY_MS);

	const dispose = reaction(
		() => ({
			connected: MediaEngineStore.connected,
			currentChannelId: MediaEngineStore.channelId,
		}),
		({connected, currentChannelId}) => {
			if (connected && currentChannelId === channelId && pendingRing === nextPendingRing) {
				const recipientsToRing = nextPendingRing.recipients;
				clearPendingRing();
				void ringCallRecipients(channelId, recipientsToRing).catch((error) => {
					console.error('Failed to ring call recipients:', error);
				});
			}
		},
		{fireImmediately: true},
	);

	if (pendingRing === nextPendingRing) {
		nextPendingRing.dispose = dispose;
	} else {
		dispose();
	}
}

export function startCall(channelId: string, silent = false): void {
	const currentUser = UserStore.getCurrentUser();
	if (!currentUser) {
		return;
	}
	const channel = ChannelStore.getChannel(channelId);
	const recipients = channel ? channel.recipientIds.filter((id) => id !== currentUser.id) : [];

	CallInitiatorStore.markInitiated(channelId, recipients);
	CallStateStore.handleCallCreate({
		channelId,
		call: {
			channel_id: channelId,
			region: 'local',
			ringing: silent ? [] : recipients,
			voice_states: [{user_id: currentUser.id, channel_id: channelId}],
		},
	});

	if (!silent) {
		setupPendingRing(channelId, recipients);
	}

	void MediaEngineStore.connectToVoiceChannel(null, channelId);
	try {
		window.dispatchEvent(new CustomEvent('astral:onboarding-step', {detail: {step: 'call'}}));
	} catch {}
}

export function joinCall(channelId: string): void {
	const currentUser = UserStore.getCurrentUser();
	if (!currentUser) {
		return;
	}
	CallStateStore.clearPendingRinging(channelId, [currentUser.id]);
	if (pendingRing?.channelId === channelId) {
		clearPendingRing();
	}
	CallInitiatorStore.clearChannel(channelId);
	SoundStore.stopIncomingRing();
	SoundStore.playSound(SoundType.UserJoin);
	try {
		window.dispatchEvent(new CustomEvent('astral:onboarding-step', {detail: {step: 'call'}}));
	} catch {}
	void MediaEngineStore.connectToVoiceChannel(null, channelId);
}

export async function leaveCall(channelId: string): Promise<void> {
	const currentUser = UserStore.getCurrentUser();
	if (!currentUser) {
		return;
	}

	if (pendingRing?.channelId === channelId) {
		clearPendingRing();
	}

	SoundStore.stopIncomingRing();

	const call = CallStateStore.getCall(channelId);
	const callRinging = call?.ringing ?? [];
	const initiatedRecipients = CallInitiatorStore.getInitiatedRecipients(channelId);
	const toStop =
		initiatedRecipients.length > 0 ? callRinging.filter((userId) => initiatedRecipients.includes(userId)) : callRinging;

	if (toStop.length > 0) {
		try {
			await stopRingingCallRecipients(channelId, toStop);
		} catch (error) {
			console.error('Failed to stop ringing pending recipients:', error);
		}
	}

	CallInitiatorStore.clearChannel(channelId);

	if (MediaEngineStore.channelId === channelId) {
		void MediaEngineStore.disconnectFromVoiceChannel('user');
	}

	if (call?.region === 'local') {
		CallStateStore.handleCallDelete({channelId});
	}
}

export function rejectCall(channelId: string): void {
	const currentUser = UserStore.getCurrentUser();
	if (!currentUser) {
		return;
	}
	CallStateStore.clearPendingRinging(channelId, [currentUser.id]);
	if (pendingRing?.channelId === channelId) {
		clearPendingRing();
	}
	const connectedChannelId = MediaEngineStore.channelId;
	if (connectedChannelId === channelId) {
		void MediaEngineStore.disconnectFromVoiceChannel('user');
	}
	void stopRingingCallRecipients(channelId).catch((error) => {
		console.error('Failed to stop ringing:', error);
	});
	SoundStore.stopIncomingRing();
	CallInitiatorStore.clearChannel(channelId);
}

export function ignoreCall(channelId: string): void {
	const currentUser = UserStore.getCurrentUser();
	if (!currentUser) {
		return;
	}
	CallStateStore.clearPendingRinging(channelId, [currentUser.id]);
	if (pendingRing?.channelId === channelId) {
		clearPendingRing();
	}
	void stopRingingCallRecipients(channelId, [currentUser.id]).catch((error) => {
		console.error('Failed to stop ringing:', error);
	});
	SoundStore.stopIncomingRing();
}
