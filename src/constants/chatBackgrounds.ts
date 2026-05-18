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

export type ChatBackgroundId = 'none' | 'classic' | 'astral_orbit' | 'constellation' | 'meteor' | 'nebula_arcs';

export interface ChatBackgroundAsset {
	id: ChatBackgroundId;
	src: string | null;
	tileSize: number;
	opacity: number;
}

const svgDataUrl = (svg: string): string => `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;

const classicPattern = svgDataUrl(`
<svg xmlns="http://www.w3.org/2000/svg" width="180" height="180" viewBox="0 0 180 180">
  <g fill="none" stroke="rgba(255,255,255,0.16)" stroke-width="1.5" stroke-linecap="round">
    <path d="M24 28h24M18 42h36M32 56h18" />
    <path d="M108 24h30M102 38h42M118 52h18" />
    <path d="M36 108h22M28 122h34M42 136h16" />
    <path d="M114 112h24M108 126h36M122 140h16" />
  </g>
</svg>`);

const astralOrbitPattern = svgDataUrl(`
<svg xmlns="http://www.w3.org/2000/svg" width="220" height="220" viewBox="0 0 220 220">
  <g fill="none" stroke="rgba(255,255,255,0.16)" stroke-width="1.4">
    <circle cx="58" cy="58" r="26" />
    <circle cx="58" cy="58" r="12" />
    <circle cx="162" cy="154" r="34" />
    <circle cx="162" cy="154" r="16" />
    <path d="M126 46c18 8 32 22 40 40" />
    <path d="M44 142c14-8 30-12 48-12" />
  </g>
  <g fill="rgba(255,255,255,0.24)">
    <circle cx="84" cy="58" r="3" />
    <circle cx="190" cy="154" r="3" />
  </g>
</svg>`);

const constellationPattern = svgDataUrl(`
<svg xmlns="http://www.w3.org/2000/svg" width="220" height="220" viewBox="0 0 220 220">
  <g fill="rgba(255,255,255,0.22)">
    <circle cx="36" cy="42" r="2.4" />
    <circle cx="78" cy="64" r="2.1" />
    <circle cx="116" cy="28" r="2.4" />
    <circle cx="166" cy="54" r="2.6" />
    <circle cx="58" cy="152" r="2.4" />
    <circle cx="118" cy="132" r="2.1" />
    <circle cx="176" cy="164" r="2.5" />
  </g>
  <g fill="none" stroke="rgba(255,255,255,0.14)" stroke-width="1.25">
    <path d="M36 42 78 64 116 28 166 54" />
    <path d="M58 152 118 132 176 164" />
    <path d="M78 64 58 152" />
  </g>
</svg>`);

const meteorPattern = svgDataUrl(`
<svg xmlns="http://www.w3.org/2000/svg" width="240" height="240" viewBox="0 0 240 240">
  <g fill="none" stroke="rgba(255,255,255,0.14)" stroke-width="1.6" stroke-linecap="round">
    <path d="M42 58 92 18" />
    <path d="M114 126 174 78" />
    <path d="M86 198 138 156" />
  </g>
  <g fill="rgba(255,255,255,0.24)">
    <circle cx="42" cy="58" r="2.8" />
    <circle cx="114" cy="126" r="2.8" />
    <circle cx="86" cy="198" r="2.8" />
  </g>
</svg>`);

const nebulaArcsPattern = svgDataUrl(`
<svg xmlns="http://www.w3.org/2000/svg" width="220" height="220" viewBox="0 0 220 220">
  <g fill="none" stroke="rgba(255,255,255,0.14)" stroke-width="1.5">
    <path d="M-10 78c36-30 76-44 118-40 28 2 54 12 78 30" />
    <path d="M34 188c24-26 52-40 84-42 28-2 54 6 78 24" />
    <path d="M78 22c18 18 26 40 24 66" />
  </g>
</svg>`);

export const CHAT_BACKGROUND_ASSETS = [
	{ id: 'none', src: null, tileSize: 160, opacity: 0 },
	{ id: 'classic', src: classicPattern, tileSize: 180, opacity: 0.22 },
	{ id: 'astral_orbit', src: astralOrbitPattern, tileSize: 220, opacity: 0.22 },
	{ id: 'constellation', src: constellationPattern, tileSize: 220, opacity: 0.24 },
	{ id: 'meteor', src: meteorPattern, tileSize: 240, opacity: 0.24 },
	{ id: 'nebula_arcs', src: nebulaArcsPattern, tileSize: 220, opacity: 0.2 },
] as const satisfies readonly ChatBackgroundAsset[];

const CHAT_BACKGROUND_ASSET_MAP = new Map<ChatBackgroundId, ChatBackgroundAsset>(
	CHAT_BACKGROUND_ASSETS.map((asset) => [asset.id, asset]),
);

export const isChatBackgroundId = (value: unknown): value is ChatBackgroundId =>
	typeof value === 'string' && CHAT_BACKGROUND_ASSET_MAP.has(value as ChatBackgroundId);

export const getChatBackgroundAsset = (id: ChatBackgroundId | string | null | undefined): ChatBackgroundAsset =>
	isChatBackgroundId(id) ? CHAT_BACKGROUND_ASSET_MAP.get(id)! : CHAT_BACKGROUND_ASSET_MAP.get('none')!;
