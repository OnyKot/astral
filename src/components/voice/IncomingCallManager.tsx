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

import {i18n} from '@lingui/core';
import {msg} from '@lingui/core/macro';
import {AnimatePresence} from 'framer-motion';
import {observer} from 'mobx-react-lite';
import type React from 'react';
import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {createPortal} from 'react-dom';
import * as CallActionCreators from '~/actions/CallActionCreators';
import {IncomingCallUI} from '~/components/voice/IncomingCallUI';
import AppStorage from '~/lib/AppStorage';
import {Routes} from '~/Routes';
import type {ChannelRecord} from '~/records/ChannelRecord';
import type {UserRecord} from '~/records/UserRecord';
import AuthenticationStore from '~/stores/AuthenticationStore';
import CallStateStore from '~/stores/CallStateStore';
import ChannelStore from '~/stores/ChannelStore';
import MockIncomingCallStore from '~/stores/MockIncomingCallStore';
import SelectedChannelStore from '~/stores/SelectedChannelStore';
import SoundStore from '~/stores/SoundStore';
import UserStore from '~/stores/UserStore';
import MediaEngineStore from '~/stores/voice/MediaEngineFacade';
import {
	clearIncomingCallFullscreen,
	showIncomingCallFullscreen,
	startOrUpdateForegroundCallService,
	stopForegroundCallService,
} from '~/utils/ForegroundCallServiceUtils';
import {bindNativeCallActionHandler, type NativeCallActionPayload} from '~/utils/NativeCallActions';
import * as NotificationUtils from '~/utils/NotificationUtils';
import {isNativeMobile} from '~/utils/NativeUtils';
import {
	INCOMING_CALL_OVERLAY_HEIGHT,
	INCOMING_CALL_OVERLAY_OFFSET,
	INCOMING_CALL_OVERLAY_STORAGE_KEY,
	INCOMING_CALL_OVERLAY_WIDTH,
} from './IncomingCallOverlayConstants';
import {useIncomingCallPortalRoot} from './IncomingCallPortal';

interface PopoutModel {
	channelId: string;
	initiatorUserId: string;
	mockChannel?: ChannelRecord;
	mockInitiator?: UserRecord;
}

interface Position {
	x: number;
	y: number;
}

interface WindowSize {
	width: number;
	height: number;
}

function clampNumber(value: number, min: number, max: number): number {
	return Math.min(Math.max(value, min), max);
}

function getWindowSize(): WindowSize {
	return {
		width: window.innerWidth,
		height: window.innerHeight,
	};
}

function getCenterPosition(windowSize: WindowSize): Position {
	return {
		x: Math.max(0, windowSize.width / 2 - INCOMING_CALL_OVERLAY_WIDTH / 2),
		y: Math.max(0, windowSize.height / 2 - INCOMING_CALL_OVERLAY_HEIGHT / 2),
	};
}

function clampPositionToWindow(position: Position, windowSize: WindowSize): Position {
	const maxX = Math.max(0, windowSize.width - INCOMING_CALL_OVERLAY_WIDTH);
	const maxY = Math.max(0, windowSize.height - INCOMING_CALL_OVERLAY_HEIGHT);
	return {
		x: clampNumber(position.x, 0, maxX),
		y: clampNumber(position.y, 0, maxY),
	};
}

function setsEqual(a: Set<string>, b: Set<string>) {
	if (a.size !== b.size) return false;
	for (const v of a) if (!b.has(v)) return false;
	return true;
}

function getChannelNavigationUrl(channel: ChannelRecord): string {
	return channel.guildId && !channel.guildId.startsWith('@')
		? Routes.guildChannel(channel.guildId, channel.id)
		: Routes.dmChannel(channel.id);
}

export const IncomingCallManager: React.FC = observer(function IncomingCallManager() {
	const calls = CallStateStore.getActiveCalls();
	const mockCall = MockIncomingCallStore.mockCall;
	const portalRoot = useIncomingCallPortalRoot();
	const selectedChannelId = SelectedChannelStore.currentChannelId;
	const currentUserId = AuthenticationStore.currentUserId;

	const [activePopouts, setActivePopouts] = useState<Set<string>>(() => new Set());
	const [windowSize, setWindowSize] = useState<WindowSize>(() => getWindowSize());
	const notifiedCallIdsRef = useRef<Set<string>>(new Set());
	const fullscreenIncomingIdsRef = useRef<Set<string>>(new Set());
	const ongoingCallNotificationStateRef = useRef<string | null>(null);
	const [basePosition, setBasePosition] = useState<Position>(() => {
		const stored = AppStorage.getJSON<Position>(INCOMING_CALL_OVERLAY_STORAGE_KEY);
		if (stored?.x != null && stored?.y != null) return stored;
		return getCenterPosition(getWindowSize());
	});
	const connectedCallChannelId = MediaEngineStore.connected ? MediaEngineStore.channelId : null;
	const connectedCallParticipantCount = connectedCallChannelId
		? (() => {
				const call = CallStateStore.getCall(connectedCallChannelId);
				const stateParticipants = CallStateStore.getParticipants(connectedCallChannelId);
				return Math.max(call?.participants.length ?? 0, stateParticipants.length);
			})()
		: 0;

	const isInCurrentCall = useCallback(
		(channelId: string) => MediaEngineStore.connected && MediaEngineStore.channelId === channelId,
		[],
	);

	const {nextPopoutIds, popoutModels, hasRingingCalls} = useMemo(() => {
		const nextIds = new Set<string>();
		const models: Array<PopoutModel> = [];
		let hasRinging = false;

		for (const call of calls) {
			const isRingingForCurrentUser =
				Boolean(currentUserId && CallStateStore.isUserPendingRinging(call.channelId, currentUserId)) &&
				!isInCurrentCall(call.channelId);
			if (isRingingForCurrentUser) {
				hasRinging = true;
			}

			const shouldShow = isRingingForCurrentUser && selectedChannelId !== call.channelId;
			if (!shouldShow) continue;

			const initiatorUserId = call.ringing[0];
			if (!initiatorUserId) continue;

			nextIds.add(call.channelId);
			models.push({
				channelId: call.channelId,
				initiatorUserId,
			});
		}

		if (mockCall) {
			hasRinging = true;
			nextIds.add(mockCall.channel.id);
			models.push({
				channelId: mockCall.channel.id,
				initiatorUserId: mockCall.initiator.id,
				mockChannel: mockCall.channel,
				mockInitiator: mockCall.initiator,
			});
		}

		return {
			nextPopoutIds: nextIds,
			popoutModels: models,
			hasRingingCalls: hasRinging,
		};
	}, [calls, currentUserId, isInCurrentCall, mockCall, selectedChannelId]);

	useEffect(() => {
		setActivePopouts((prev) => (setsEqual(prev, nextPopoutIds) ? prev : nextPopoutIds));
	}, [nextPopoutIds]);

	useEffect(() => {
		const handleResize = () => setWindowSize(getWindowSize());
		window.addEventListener('resize', handleResize);
		return () => window.removeEventListener('resize', handleResize);
	}, []);

	useEffect(() => {
		const clamped = clampPositionToWindow(basePosition, windowSize);
		if (clamped.x !== basePosition.x || clamped.y !== basePosition.y) {
			setBasePosition(clamped);
		}
	}, [basePosition, windowSize]);

	const wasRingingRef = useRef(false);
	useEffect(() => {
		const wasRinging = wasRingingRef.current;

		if (hasRingingCalls && !wasRinging) {
			SoundStore.startIncomingRing();
		} else if (!hasRingingCalls && wasRinging) {
			SoundStore.stopIncomingRing();
		}

		wasRingingRef.current = hasRingingCalls;
	}, [hasRingingCalls]);

	useEffect(() => () => SoundStore.stopIncomingRing(), []);

	useEffect(() => {
		const activeIds = new Set(popoutModels.map((model) => model.channelId));
		const notifiedIds = notifiedCallIdsRef.current;
		const fullscreenIds = fullscreenIncomingIdsRef.current;

		for (const existingId of Array.from(notifiedIds)) {
			if (!activeIds.has(existingId)) {
				notifiedIds.delete(existingId);
			}
		}

		for (const existingId of Array.from(fullscreenIds)) {
			if (!activeIds.has(existingId)) {
				fullscreenIds.delete(existingId);
				void clearIncomingCallFullscreen(existingId);
			}
		}

		for (const model of popoutModels) {
			if (notifiedIds.has(model.channelId)) {
				continue;
			}

			if (!document.hidden && selectedChannelId === model.channelId) {
				continue;
			}

			const channel = model.mockChannel ?? ChannelStore.getChannel(model.channelId) ?? null;
			if (!channel) {
				continue;
			}

			const initiator = model.mockInitiator ?? UserStore.getUser(model.initiatorUserId) ?? null;
			const callerName = initiator?.displayName ?? i18n._(msg`Unknown`);
			const url = getChannelNavigationUrl(channel);
			const incomingCallTitle = i18n._(msg`Incoming call`);
			const incomingCallBody = i18n._(msg`${callerName} is calling`);

			notifiedIds.add(model.channelId);
			if (isNativeMobile()) {
				void (async () => {
					const shown = await showIncomingCallFullscreen({
						title: incomingCallTitle,
						body: incomingCallBody,
						url,
						channelId: model.channelId,
					});
					if (shown) {
						fullscreenIds.add(model.channelId);
						return;
					}
					await NotificationUtils.showIncomingCallNotification({
						title: incomingCallTitle,
						body: incomingCallBody,
						url,
						channelId: model.channelId,
					});
				})();
			} else {
				void NotificationUtils.showNotification({
					title: incomingCallTitle,
					body: incomingCallBody,
					url,
				});
			}
		}
	}, [popoutModels, selectedChannelId]);

	useEffect(() => {
		let cancelled = false;

		const syncOngoingCallNotification = async () => {
			if (!connectedCallChannelId) {
				ongoingCallNotificationStateRef.current = null;
				await NotificationUtils.clearOngoingCallNotification();
				await stopForegroundCallService();
				return;
			}

			const channel = ChannelStore.getChannel(connectedCallChannelId);
			if (!channel) {
				ongoingCallNotificationStateRef.current = null;
				await NotificationUtils.clearOngoingCallNotification();
				await stopForegroundCallService();
				return;
			}

			const participantCount = Math.max(1, connectedCallParticipantCount);
			const participantLabel = participantCount === 1 ? i18n._(msg`participant`) : i18n._(msg`participants`);
			const body =
				channel.guildId && !channel.guildId.startsWith('@')
					? `#${channel.name || i18n._(msg`voice`)} · ${participantCount} ${participantLabel}`
					: `${participantCount} ${participantLabel} ${i18n._(msg`in call`)}`;
			const nextStateKey = `${channel.id}:${participantCount}`;
			if (ongoingCallNotificationStateRef.current === nextStateKey) {
				return;
			}

			const title = i18n._(msg`Call in progress`);
			const url = getChannelNavigationUrl(channel);
			const foregroundStarted = await startOrUpdateForegroundCallService({
				title,
				body,
				url,
				channelId: channel.id,
			});
			if (foregroundStarted) {
				await NotificationUtils.clearOngoingCallNotification();
			}
			const nativeId = foregroundStarted
				? 'foreground-service'
				: await NotificationUtils.showOngoingCallNotification({
						title,
						body,
						url,
						channelId: channel.id,
					});

			if (cancelled) {
				return;
			}

			ongoingCallNotificationStateRef.current = nativeId ? nextStateKey : null;
		};

		void syncOngoingCallNotification();

		return () => {
			cancelled = true;
		};
	}, [connectedCallChannelId, connectedCallParticipantCount]);

	useEffect(
		() => () => {
			void NotificationUtils.clearOngoingCallNotification();
			void stopForegroundCallService();
			const fullscreenIds = Array.from(fullscreenIncomingIdsRef.current);
			for (const channelId of fullscreenIds) {
				void clearIncomingCallFullscreen(channelId);
			}
		},
		[],
	);

	const maxOverlayX = Math.max(0, windowSize.width - INCOMING_CALL_OVERLAY_WIDTH);
	const maxOverlayY = Math.max(0, windowSize.height - INCOMING_CALL_OVERLAY_HEIGHT);

	const clampedBasePosition = useMemo(
		() => clampPositionToWindow(basePosition, windowSize),
		[basePosition, windowSize],
	);

	const handleAccept = useCallback((channelId: string) => {
		if (MockIncomingCallStore.isMockCall(channelId)) {
			MockIncomingCallStore.clearMockCall();
			return;
		}

		CallActionCreators.joinCall(channelId);
		void clearIncomingCallFullscreen(channelId);
	}, []);

	const handleReject = useCallback((channelId: string) => {
		if (MockIncomingCallStore.isMockCall(channelId)) {
			MockIncomingCallStore.clearMockCall();
			return;
		}

		CallActionCreators.rejectCall(channelId);
		void clearIncomingCallFullscreen(channelId);
	}, []);

	const handleIgnore = useCallback((channelId: string) => {
		if (MockIncomingCallStore.isMockCall(channelId)) {
			MockIncomingCallStore.clearMockCall();
			return;
		}

		CallActionCreators.ignoreCall(channelId);
		void clearIncomingCallFullscreen(channelId);
	}, []);

	useEffect(() => {
		if (!isNativeMobile()) {
			return;
		}

		const handleNativeCallAction = ({actionId, channelId}: NativeCallActionPayload) => {
			if (!actionId || !channelId) {
				return;
			}

			if (actionId === NotificationUtils.NATIVE_CALL_ACTION_ANSWER) {
				handleAccept(channelId);
				return;
			}

			if (actionId === NotificationUtils.NATIVE_CALL_ACTION_REJECT) {
				handleReject(channelId);
				return;
			}

			if (actionId === NotificationUtils.NATIVE_CALL_ACTION_HANGUP) {
				void CallActionCreators.leaveCall(channelId);
			}
		};

		return bindNativeCallActionHandler(handleNativeCallAction);
	}, [handleAccept, handleReject]);

	const handleDragEnd = useCallback(
		(x: number, y: number) => {
			const clamped = clampPositionToWindow({x, y}, windowSize);
			setBasePosition(clamped);
			AppStorage.setJSON(INCOMING_CALL_OVERLAY_STORAGE_KEY, clamped);
		},
		[windowSize],
	);

	const activePopoutIds = useMemo(() => Array.from(activePopouts), [activePopouts]);

	const renderedCalls = useMemo(() => {
		const modelsById = new Map(popoutModels.map((m) => [m.channelId, m]));

		const positions = new Map<string, Position>();
		let offset = 0;

		for (const channelId of activePopoutIds) {
			const x = clampNumber(clampedBasePosition.x + offset, 0, maxOverlayX);
			const y = clampNumber(clampedBasePosition.y + offset, 0, maxOverlayY);
			positions.set(channelId, {x, y});
			offset += INCOMING_CALL_OVERLAY_OFFSET;
		}

		return activePopoutIds.map((channelId) => {
			const model = modelsById.get(channelId);
			if (!model) return null;

			const channel = model.mockChannel ?? ChannelStore.getChannel(channelId) ?? null;
			const storedInitiator =
				!model.mockInitiator && model.initiatorUserId ? (UserStore.getUser(model.initiatorUserId) ?? null) : null;
			const initiator = model.mockInitiator ?? storedInitiator;
			const position = positions.get(channelId) ?? {x: 0, y: 0};

			return (
				<IncomingCallUI
					key={channelId}
					channel={channel}
					initiator={initiator}
					initialX={position.x}
					initialY={position.y}
					maxX={maxOverlayX}
					maxY={maxOverlayY}
					onAccept={() => handleAccept(channelId)}
					onReject={() => handleReject(channelId)}
					onIgnore={() => handleIgnore(channelId)}
					onDragEnd={handleDragEnd}
				/>
			);
		});
	}, [
		activePopoutIds,
		popoutModels,
		handleAccept,
		handleReject,
		handleIgnore,
		handleDragEnd,
		clampedBasePosition.x,
		clampedBasePosition.y,
		maxOverlayX,
		maxOverlayY,
	]);

	if (renderedCalls.length === 0 || !portalRoot) return null;

	return createPortal(<AnimatePresence>{renderedCalls}</AnimatePresence>, portalRoot);
});
