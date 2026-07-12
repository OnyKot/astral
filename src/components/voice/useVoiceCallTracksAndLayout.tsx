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

import {isTrackReference, type TrackReferenceOrPlaceholder, useTracks} from '@livekit/components-react';
import {RoomEvent, Track} from 'livekit-client';
import {useEffect, useMemo} from 'react';
import * as VoiceCallLayoutActionCreators from '~/actions/VoiceCallLayoutActionCreators';
import type {ChannelRecord} from '~/records/ChannelRecord';
import CallMediaPrefsStore from '~/stores/CallMediaPrefsStore';
import UserStore from '~/stores/UserStore';
import VoiceCallLayoutStore from '~/stores/VoiceCallLayoutStore';
import VoiceSettingsStore from '~/stores/VoiceSettingsStore';
import MediaEngineStore from '~/stores/voice/MediaEngineFacade';
import {usePinnedTrackRef} from './usePinnedTrackRef';

interface UseVoiceCallTracksAndLayoutArgs {
	channel: ChannelRecord;
}

function getUserIdFromIdentity(identity: string | undefined): string | null {
	if (!identity) return null;
	if (!identity.startsWith('user_')) return null;
	const value = identity.slice(5);
	const delimiterIndex = value.indexOf('_');
	return delimiterIndex === -1 ? value : value.slice(0, delimiterIndex);
}

function dedupeTracksByUser(
	tracks: Array<TrackReferenceOrPlaceholder>,
	currentUserId?: string | null,
	currentConnectionId?: string | null,
): Array<TrackReferenceOrPlaceholder> {
	const bestByUser = new Map<string, TrackReferenceOrPlaceholder>();
	const score = (tr: TrackReferenceOrPlaceholder): number => {
		if (!isTrackReference(tr)) return 0;
		let next = 0;
		if (tr.publication && !tr.publication.isMuted) next += 2;
		if (tr.publication?.track) next += 2;
		if (currentUserId && currentConnectionId) {
			const identity = tr.participant.identity ?? '';
			if (identity.startsWith(`user_${currentUserId}_${currentConnectionId}`)) {
				next += 4;
			}
		}
		return next;
	};

	for (const tr of tracks) {
		const identity = tr.participant.identity ?? '';
		const userId = getUserIdFromIdentity(identity);
		const key = userId ?? identity;
		const existing = bestByUser.get(key);
		if (!existing) {
			bestByUser.set(key, tr);
			continue;
		}

		if (score(tr) > score(existing)) {
			bestByUser.set(key, tr);
		}
	}

	return Array.from(bestByUser.values());
}

export function useVoiceCallTracksAndLayout({channel}: UseVoiceCallTracksAndLayoutArgs) {
	const {layoutMode, pinnedParticipantIdentity, userOverride} = VoiceCallLayoutStore;
	const currentUserId = UserStore.currentUser?.id ?? null;
	const currentConnectionId = MediaEngineStore.connectionId;

	/*
	 * Track list updates.
	 *
	 * ActiveSpeakersChanged is deliberately EXCLUDED — it fires 2-3×/sec
	 * during active conversation and would rebuild the entire track array
	 * (triggering cascading useMemo recomputations + grid re-renders) for
	 * an event that individual VoiceParticipantTile components already
	 * handle via their own useIsSpeaking(participant) hook. The speaking
	 * indicator animation on each tile is driven by that per-tile hook,
	 * not by the grid-level track list.
	 *
	 * TrackMuted/Unmuted are kept because filteredCameraTracks uses mute
	 * state to hide camera-off participants when showNonVideoParticipants
	 * is disabled. These fire infrequently (user toggles camera).
	 */
	const tracks = useTracks(
		[
			{source: Track.Source.Camera, withPlaceholder: true},
			{source: Track.Source.ScreenShare, withPlaceholder: false},
		],
		{
			updateOnlyOn: [
				RoomEvent.ParticipantConnected,
				RoomEvent.ParticipantDisconnected,
				RoomEvent.TrackPublished,
				RoomEvent.TrackUnpublished,
				RoomEvent.TrackMuted,
				RoomEvent.TrackUnmuted,
				RoomEvent.TrackSubscribed,
				RoomEvent.TrackUnsubscribed,
			],
			onlySubscribed: false,
		},
	);

	const {screenShareTracks, cameraTracksAll} = useMemo(() => {
		const refs = tracks.filter(isTrackReference);
		const screens = dedupeTracksByUser(
			refs.filter((tr) => tr.publication.source === Track.Source.ScreenShare),
			currentUserId,
			currentConnectionId,
		);
		const camerasPlusPlaceholders = dedupeTracksByUser(
			tracks.filter((tr) => tr.source !== Track.Source.ScreenShare),
			currentUserId,
			currentConnectionId,
		);
		return {screenShareTracks: screens, cameraTracksAll: camerasPlusPlaceholders};
	}, [currentConnectionId, currentUserId, tracks]);

	const filteredCameraTracks = useMemo(() => {
		if (VoiceSettingsStore.showNonVideoParticipants) return cameraTracksAll;

		return cameraTracksAll.filter((tr) => {
			if (!isTrackReference(tr)) return false;
			if (!tr.publication) return false;
			return !tr.publication.isMuted;
		});
	}, [cameraTracksAll, VoiceSettingsStore.showNonVideoParticipants]);

	const hasScreenShare = screenShareTracks.length > 0;

	useEffect(() => {
		const callId = MediaEngineStore.connectionId ?? '';
		const currentUserId = UserStore.currentUser?.id;
		if (!callId || !currentUserId) return;

		for (const tr of cameraTracksAll) {
			if (!isTrackReference(tr)) continue;
			if (tr.source !== Track.Source.Camera) continue;

			const identity = tr.participant.identity || '';
			if (!identity.startsWith(`user_${currentUserId}_`)) continue;

			const isPublishing = Boolean(tr.publication && !tr.publication.isMuted);
			const disabled = !VoiceSettingsStore.showMyOwnCamera && isPublishing;
			CallMediaPrefsStore.setVideoDisabled(callId, identity, disabled);
		}
	}, [cameraTracksAll, VoiceSettingsStore.showMyOwnCamera]);

	useEffect(() => {
		if (userOverride) return;

		const shouldFocus = hasScreenShare || filteredCameraTracks.length > 12;
		const nextLayout = shouldFocus ? 'focus' : 'grid';

		if (layoutMode !== nextLayout) {
			VoiceCallLayoutActionCreators.setLayoutMode(nextLayout);
		}
	}, [filteredCameraTracks.length, hasScreenShare, layoutMode, userOverride]);

	useEffect(() => {
		if (!pinnedParticipantIdentity) return;
		if (cameraTracksAll.length === 0) return;

		const stillExists = cameraTracksAll.some((tr) => tr.participant.identity === pinnedParticipantIdentity);
		if (!stillExists) VoiceCallLayoutActionCreators.setPinnedParticipant(null);
	}, [cameraTracksAll, pinnedParticipantIdentity]);

	const {mainTrack: focusMainTrack, carouselTracks} = usePinnedTrackRef({
		layoutMode,
		pinnedParticipantIdentity,
		filteredCameraTracks,
		cameraTracksAll,
		screenShareTracks,
	});

	return {
		tracks,
		screenShareTracks,
		cameraTracksAll,
		filteredCameraTracks,
		hasScreenShare,

		layoutMode,
		pinnedParticipantIdentity,

		focusMainTrack,
		carouselTracks,

		channel,
	};
}
