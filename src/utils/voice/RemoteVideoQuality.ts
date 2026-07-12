import type {RemoteTrackPublication} from 'livekit-client';
import {VideoQuality} from 'livekit-client';

export type RemoteVideoQualityLevel = 'low' | 'medium' | 'high';

const qualityMap: Record<RemoteVideoQualityLevel, VideoQuality> = {
	low: VideoQuality.LOW,
	medium: VideoQuality.MEDIUM,
	high: VideoQuality.HIGH,
};

export function applyRemoteVideoPublicationQuality(
	publication: RemoteTrackPublication,
	quality: RemoteVideoQualityLevel,
): void {
	if (typeof publication.setVideoQuality !== 'function') {
		return;
	}

	publication.setVideoQuality(qualityMap[quality]);
}

export function getCameraReceiveQuality(isPinned: boolean, isIntersecting: boolean): RemoteVideoQualityLevel {
	if (isPinned) return 'high';
	if (isIntersecting) return 'medium';
	return 'low';
}
