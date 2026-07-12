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

import {Logger} from '~/lib/Logger';

const logger = new Logger('VoiceSessionResume');

const STORAGE_KEY = 'astral:voice:resume';

/*
 * How recently the session must have been active to be resumed. This is
 * refreshed by a heartbeat while connected, so a long call stays resumable.
 * A short window means an app relaunched hours later won't silently rejoin,
 * while a page refresh or crash (both near-instant) will.
 */
const FRESHNESS_MS = 90_000;

export interface PersistedVoiceSession {
	guildId: string | null;
	channelId: string;
	updatedAt: number;
}

function readRaw(): PersistedVoiceSession | null {
	try {
		if (typeof localStorage === 'undefined') return null;
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return null;
		const parsed = JSON.parse(raw) as Partial<PersistedVoiceSession>;
		if (typeof parsed.channelId !== 'string' || parsed.channelId.length === 0) return null;
		if (typeof parsed.updatedAt !== 'number') return null;
		return {
			guildId: typeof parsed.guildId === 'string' ? parsed.guildId : null,
			channelId: parsed.channelId,
			updatedAt: parsed.updatedAt,
		};
	} catch {
		return null;
	}
}

export function saveVoiceSession(session: {guildId: string | null; channelId: string}): void {
	try {
		if (typeof localStorage === 'undefined') return;
		const payload: PersistedVoiceSession = {
			guildId: session.guildId,
			channelId: session.channelId,
			updatedAt: Date.now(),
		};
		localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
	} catch (error) {
		logger.debug('Failed to persist voice session', {error});
	}
}

/** Refresh the timestamp so an ongoing call stays resumable across a reload. */
export function touchVoiceSession(): void {
	const existing = readRaw();
	if (!existing) return;
	saveVoiceSession({guildId: existing.guildId, channelId: existing.channelId});
}

export function clearVoiceSession(): void {
	try {
		if (typeof localStorage === 'undefined') return;
		localStorage.removeItem(STORAGE_KEY);
	} catch (error) {
		logger.debug('Failed to clear voice session', {error});
	}
}

/**
 * Return the persisted session if it is recent enough to auto-rejoin, otherwise
 * clear it and return null. Consuming a session always clears it so we never
 * attempt to rejoin twice for the same reload.
 */
export function consumeResumableVoiceSession(): {guildId: string | null; channelId: string} | null {
	const session = readRaw();
	if (!session) return null;

	clearVoiceSession();

	if (Date.now() - session.updatedAt > FRESHNESS_MS) {
		logger.debug('Persisted voice session too old to resume', {age: Date.now() - session.updatedAt});
		return null;
	}

	return {guildId: session.guildId, channelId: session.channelId};
}
