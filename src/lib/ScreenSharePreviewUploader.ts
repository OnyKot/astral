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

import {Track} from 'livekit-client';
import type {Room} from 'livekit-client';
import {Endpoints} from '~/Endpoints';
import http from '~/lib/HttpClient';
import {Logger} from '~/lib/Logger';

const logger = new Logger('ScreenSharePreviewUploader');
const UPLOAD_INTERVAL_MS = 5000;
const JPEG_QUALITY = 0.6;
const MAX_WIDTH = 960;

async function captureFrameBlob(room: Room): Promise<Blob | null> {
	const localParticipant = room.localParticipant;
	if (!localParticipant) return null;

	for (const publication of localParticipant.videoTrackPublications.values()) {
		if (publication.source !== Track.Source.ScreenShare) continue;
		const track = publication.track;
		if (!track) continue;

		const video = track.attach() as HTMLVideoElement;
		if (!(video instanceof HTMLVideoElement)) {
			try { track.detach(video as HTMLMediaElement); } catch {}
			continue;
		}

		video.muted = true;
		video.autoplay = true;
		video.playsInline = true;
		void video.play().catch(() => {});

		await new Promise<void>((resolve) => {
			if (video.readyState >= 2 && video.videoWidth > 0) { resolve(); return; }
			const done = () => resolve();
			video.addEventListener('loadeddata', done, {once: true});
			video.addEventListener('canplay', done, {once: true});
			setTimeout(resolve, 600);
		});

		if (video.videoWidth <= 0) {
			try { track.detach(video); } catch {}
			video.remove();
			continue;
		}

		const scale = Math.min(1, MAX_WIDTH / video.videoWidth);
		const w = Math.round(video.videoWidth * scale);
		const h = Math.round(video.videoHeight * scale);

		// Reuse a single offscreen canvas — no memory leak
		const canvas = new OffscreenCanvas(w, h);
		const ctx = canvas.getContext('2d') as OffscreenCanvasRenderingContext2D | null;

		try { track.detach(video); } catch {}
		video.remove();

		if (!ctx) continue;
		ctx.drawImage(video, 0, 0, w, h);

		// convertToBlob streams directly — no base64, no extra copy
		return canvas.convertToBlob({type: 'image/jpeg', quality: JPEG_QUALITY});
	}
	return null;
}

export class ScreenSharePreviewUploader {
	private intervalId: number | null = null;
	private uploading = false;

	start(streamKey: string, channelId: string, room: Room): void {
		this.stop();
		const upload = async () => {
			if (this.uploading) return; // skip if previous still running
			this.uploading = true;
			try {
				const blob = await captureFrameBlob(room);
				if (!blob || !this.intervalId) return; // stopped while capturing

				const form = new FormData();
				form.append('channel_id', channelId);
				form.append('thumbnail', blob, 'preview.jpg');
				form.append('content_type', 'image/jpeg');

				await http.post({url: Endpoints.STREAM_PREVIEW(streamKey), body: form});
			} catch {
				// best-effort, non-fatal
			} finally {
				this.uploading = false;
			}
		};

		void upload();
		this.intervalId = window.setInterval(() => void upload(), UPLOAD_INTERVAL_MS);
	}

	stop(): void {
		if (this.intervalId !== null) {
			window.clearInterval(this.intervalId);
			this.intervalId = null;
		}
		this.uploading = false;
	}
}

export const screenSharePreviewUploader = new ScreenSharePreviewUploader();
