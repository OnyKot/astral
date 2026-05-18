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

export const PROFILE_ACCENT_EFFECT_PRESETS = ['none', 'rgb-neon', 'nebula', 'stellar', 'solar'] as const;

export type ProfileAccentEffectPreset = (typeof PROFILE_ACCENT_EFFECT_PRESETS)[number];

export const DEFAULT_PROFILE_ACCENT_EFFECT_PRESET: ProfileAccentEffectPreset = 'none';

const PROFILE_ACCENT_EFFECT_SET = new Set<string>(PROFILE_ACCENT_EFFECT_PRESETS);

export const normalizeProfileAccentEffectPreset = (value: unknown): ProfileAccentEffectPreset => {
	if (typeof value !== 'string') return DEFAULT_PROFILE_ACCENT_EFFECT_PRESET;
	return PROFILE_ACCENT_EFFECT_SET.has(value) ? (value as ProfileAccentEffectPreset) : DEFAULT_PROFILE_ACCENT_EFFECT_PRESET;
};
