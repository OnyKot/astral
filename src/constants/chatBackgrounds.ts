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

import loveBackground from '~/assets/bgchats/love.svg';
import magicBackground from '~/assets/bgchats/magic.svg';
import starwarsBackground from '~/assets/bgchats/starwars.svg';
import winterBackground from '~/assets/bgchats/winter.svg';
import zooBackground from '~/assets/bgchats/zoo.svg';

export type ChatBackgroundId =
	| 'none'
	| 'classic'
	| 'astral_orbit'
	| 'constellation'
	| 'meteor'
	| 'nebula_arcs'
	| 'winter'
	| 'zoo';

export interface ChatBackgroundAsset {
	id: ChatBackgroundId;
	src: string | null;
	tileSize: number;
	opacity: number;
}

export const CHAT_BACKGROUND_ASSETS = [
	{ id: 'none', src: null, tileSize: 160, opacity: 0 },
	{ id: 'constellation', src: starwarsBackground, tileSize: 296, opacity: 0.16 },
	{ id: 'meteor', src: magicBackground, tileSize: 296, opacity: 0.16 },
	{ id: 'nebula_arcs', src: loveBackground, tileSize: 296, opacity: 0.16 },
	{ id: 'winter', src: winterBackground, tileSize: 296, opacity: 0.16 },
	{ id: 'zoo', src: zooBackground, tileSize: 296, opacity: 0.16 },
] as const satisfies readonly ChatBackgroundAsset[];

const CHAT_BACKGROUND_ASSET_MAP = new Map<ChatBackgroundId, ChatBackgroundAsset>(
	CHAT_BACKGROUND_ASSETS.map((asset) => [asset.id, asset]),
);

export const isChatBackgroundId = (value: unknown): value is ChatBackgroundId =>
	typeof value === 'string' && CHAT_BACKGROUND_ASSET_MAP.has(value as ChatBackgroundId);

export const getChatBackgroundAsset = (id: ChatBackgroundId | string | null | undefined): ChatBackgroundAsset =>
	isChatBackgroundId(id) ? CHAT_BACKGROUND_ASSET_MAP.get(id)! : CHAT_BACKGROUND_ASSET_MAP.get('none')!;
