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

import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {fileURLToPath} from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let tails: Array<string> | undefined;
let scales: Array<string> | undefined;

function getTails(): Array<string> {
	if (!tails) {
		initWords();
	}
	return tails!;
}

function getScales(): Array<string> {
	if (!scales) {
		initWords();
	}
	return scales!;
}

export function generateConnectionId(): string {
	const scaleWords = getScales();
	const tailWords = getTails();

	// Math.random is a non-cryptographic xorshift128+ whose internal state can be
	// recovered from a handful of observed outputs, and the 801 x 475 word pairs
	// only span ~380k values to begin with. The connection id is a component of
	// the screen-share stream key (`<scope>:<channelId>:<connectionId>`) and is
	// handed to every client in the channel on each voice join, so it must not be
	// guessable: pick the words with a CSPRNG and append 128 bits of entropy.
	// base64url keeps the id inside the [A-Za-z0-9_-] charset the stream-key
	// parser and the LiveKit participant identity expect.
	const scale = scaleWords[crypto.randomInt(scaleWords.length)];
	const tail = tailWords[crypto.randomInt(tailWords.length)];

	return `${tail}-${scale}-${crypto.randomBytes(16).toString('base64url')}`;
}

function initWords(): void {
	const wordsDir = path.join(__dirname);
	tails = parseWordsFile(path.join(wordsDir, 'tails.txt'));
	scales = parseWordsFile(path.join(wordsDir, 'scales.txt'));
}

function parseWordsFile(filePath: string): Array<string> {
	const content = fs.readFileSync(filePath, 'utf-8');
	const lines = content.split('\n');
	const words: Array<string> = [];

	for (const line of lines) {
		const trimmed = line.trim();
		if (trimmed && !trimmed.startsWith('#')) {
			words.push(trimmed);
		}
	}

	return words;
}
