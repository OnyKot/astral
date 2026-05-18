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

import initLibfluxcore, * as wasm from '@pkgs/libfluxcore/libfluxcore';

/*
 * libfluxcore is a Rust/wasm-bindgen WASM bundle that gives us zstd
 * decompression for gateway frames plus a couple of GIF utilities.
 *
 * On some browser versions the wasm-bindgen 0.2.106 reference-types output
 * crashes during init with:
 *
 *   RangeError: WebAssembly.Table.grow(): failed to grow table by 4
 *     at __wbindgen_init_externref_table
 *
 * The real fix is rebuilding the crate with reference types disabled or a
 * newer wasm-bindgen, which needs the Rust toolchain. Until that happens we
 * remember the failure (both in-memory and in localStorage) so that the
 * gateway code path can skip requesting zstd compression entirely on the
 * second connect instead of cycling through "connect → fail → reconnect
 * uncompressed" every single session.
 */
const WASM_BROKEN_STORAGE_KEY = 'astral:libfluxcore:broken';

let modulePromise: Promise<void> | null = null;
let wasmBroken: boolean = (() => {
	try {
		return typeof localStorage !== 'undefined' && localStorage.getItem(WASM_BROKEN_STORAGE_KEY) === '1';
	} catch {
		return false;
	}
})();

function markWasmBroken(): void {
	wasmBroken = true;
	try {
		if (typeof localStorage !== 'undefined') {
			localStorage.setItem(WASM_BROKEN_STORAGE_KEY, '1');
		}
	} catch {}
}

export function isLibfluxcoreKnownBroken(): boolean {
	return wasmBroken;
}

/**
 * Clear the "broken" flag — used if the user explicitly retries (e.g. after
 * an app update that might have shipped a fixed wasm bundle).
 */
export function resetLibfluxcoreBrokenFlag(): void {
	wasmBroken = false;
	try {
		if (typeof localStorage !== 'undefined') {
			localStorage.removeItem(WASM_BROKEN_STORAGE_KEY);
		}
	} catch {}
}

async function loadModule(): Promise<void> {
	if (wasmBroken) {
		throw new Error('libfluxcore is known-broken in this browser; skipping wasm init');
	}
	if (!modulePromise) {
		modulePromise = (async () => {
			try {
				if (typeof initLibfluxcore === 'function') {
					await initLibfluxcore();
				}
			} catch (err) {
				modulePromise = null;
				markWasmBroken();
				console.warn('[libfluxcore] Failed to load wasm module — marking as broken for this browser', err);
				throw err;
			}
		})();
	}
	await modulePromise;
}

export async function ensureLibfluxcoreReady(): Promise<void> {
	await loadModule();
}

export function cropAndRotateGif(
	gif: Uint8Array,
	x: number,
	y: number,
	width: number,
	height: number,
	rotation: number,
	resizeWidth: number | null,
	resizeHeight: number | null,
): Uint8Array {
	const result = wasm.crop_and_rotate_gif(gif, x, y, width, height, rotation, resizeWidth, resizeHeight);
	return result instanceof Uint8Array ? result : new Uint8Array(result);
}

export async function decompressZstdFrame(input: Uint8Array): Promise<Uint8Array | null> {
	await loadModule();
	const result = wasm.decompress_zstd_frame(input);
	return result instanceof Uint8Array ? result : new Uint8Array(result);
}
