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

import {decompressZstdFrame, isLibfluxcoreKnownBroken} from '~/lib/libfluxcore';
import {isMobileExperienceEnabled} from '~/utils/mobileExperience';

export type CompressionType = 'none' | 'zstd-stream' | (string & {});

export class GatewayDecompressor {
	private readonly type: CompressionType;

	constructor(type: CompressionType) {
		this.type = type;
	}

	async decompress(data: ArrayBuffer): Promise<string> {
		const input = new Uint8Array(data);

		switch (this.type) {
			case 'none':
				return new TextDecoder().decode(input);

			case 'zstd-stream':
				return this.decompressZstd(input);

			default:
				throw new Error(`Unsupported compression type: ${this.type}`);
		}
	}

	private async decompressZstd(data: Uint8Array): Promise<string> {
		const wasmDecoded = await decompressZstdFrame(data);
		if (!wasmDecoded) {
			throw new Error('Gateway zstd WASM not available');
		}
		const decompressed = wasmDecoded;
		return new TextDecoder().decode(decompressed);
	}

	destroy(): void {}
}

export function getPreferredCompression(): CompressionType {
	if (isMobileExperienceEnabled()) {
		return 'none';
	}

	// libfluxcore (our zstd WASM) has a known wasm-bindgen 0.2.106 externref
	// table-grow bug on some browsers. Once the WASM has failed to init in
	// this browser we remember that and stop asking the gateway for zstd
	// compression — otherwise every connect would go "zstd → decompress
	// fails → reconnect uncompressed" and spam errors in the console.
	if (isLibfluxcoreKnownBroken()) {
		return 'none';
	}

	return 'zstd-stream';
}

export function isCompressionSupported(type: CompressionType): boolean {
	switch (type) {
		case 'none':
			return true;
		case 'zstd-stream':
			// Don't claim support if we've already seen libfluxcore fail —
			// lets upstream callers pick a different compression without
			// having to guess.
			return !isLibfluxcoreKnownBroken();
		default:
			return false;
	}
}
