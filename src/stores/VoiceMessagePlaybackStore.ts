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

import {makeAutoObservable} from 'mobx';

export interface ActiveVoiceMessagePlayback {
	key: string;
	channelId: string;
	messageId: string;
	title: string;
	authorName: string | null;
	src: string;
	currentTime: number;
	duration: number;
}

class VoiceMessagePlaybackStore {
	active: ActiveVoiceMessagePlayback | null = null;

	constructor() {
		makeAutoObservable(this, {}, {autoBind: true});
	}

	setActive(playback: ActiveVoiceMessagePlayback): void {
		this.active = playback;
	}

	clearIf(key: string): void {
		if (this.active?.key === key) {
			this.active = null;
		}
	}

	stopActivePlayback(): void {
		const activeKey = this.active?.key;
		if (!activeKey) {
			return;
		}

		if (typeof document !== 'undefined') {
			const players = document.querySelectorAll<HTMLAudioElement>('audio[data-voice-message-player-key]');
			for (const player of players) {
				if (player.dataset.voiceMessagePlayerKey === activeKey) {
					player.pause();
				}
			}
		}

		this.active = null;
	}
}

export default new VoiceMessagePlaybackStore();
