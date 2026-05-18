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

declare module '@pkgs/libfluxcore/libfluxcore' {
	export default function initLibfluxcore(input?: unknown): Promise<void>;

	export function crop_and_rotate_gif(
		gif: Uint8Array,
		x: number,
		y: number,
		width: number,
		height: number,
		rotation: number,
		resizeWidth: number | null,
		resizeHeight: number | null,
	): Uint8Array;

	export function decompress_zstd_frame(input: Uint8Array): Uint8Array;
}
