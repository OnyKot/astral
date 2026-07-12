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

/**
 * HTMLMediaElement.volume requires a value in [0, 1]; setting anything
 * outside the range throws IndexSizeError synchronously and, when this is
 * called from inside a React render or LiveKit TrackSubscribed handler,
 * the unhandled error climbs all the way up to the ErrorBoundary and
 * unmounts the entire voice surface.
 *
 * Production logs from voice join attempts:
 *
 *   IndexSizeError: Failed to set the 'volume' property on
 *   'HTMLMediaElement': The volume provided (2) is outside the range [0, 1].
 *     at RouterProvider (react.tsx:59:16)
 *     at DndContext (DndContext.tsx:52:29)
 *
 * Source: ParticipantVolumeStore stores per-user volume on a 0..200 (Discord-
 * style boost) scale and divides by 100 before applying. Anybody who ever
 * boosted a participant past 100 % would crash voice for themselves on every
 * join until they cleared local storage.
 *
 * Until we route the >100 % case through a Web Audio GainNode (the only way
 * to actually boost above unity gain), clamp at the HTMLMediaElement ceiling
 * and keep voice usable.
 */
export const HTML_MEDIA_VOLUME_MAX = 1;

/**
 * Convert a 0..N percent slider value into the HTMLMediaElement.volume range
 * [0, 1]. Non-finite inputs collapse to 0 instead of throwing.
 */
export function clampMediaVolumePercent(percent: number): number {
	if (!Number.isFinite(percent)) return 0;
	const ratio = percent / 100;
	if (ratio <= 0) return 0;
	if (ratio >= HTML_MEDIA_VOLUME_MAX) return HTML_MEDIA_VOLUME_MAX;
	return ratio;
}

/** Same idea but for callers that already hold a [0, ∞) ratio. */
export function clampMediaVolumeRatio(ratio: number): number {
	if (!Number.isFinite(ratio)) return 0;
	if (ratio <= 0) return 0;
	if (ratio >= HTML_MEDIA_VOLUME_MAX) return HTML_MEDIA_VOLUME_MAX;
	return ratio;
}
