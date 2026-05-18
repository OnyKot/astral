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

import {mkdir, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distDir = path.resolve(__dirname, '..', 'dist');
const versionFile = path.join(distDir, 'version.json');

const payload = {
	sha: process.env.PUBLIC_BUILD_SHA ?? 'dev',
	buildNumber: Number(process.env.PUBLIC_BUILD_NUMBER ?? '0'),
	timestamp: Number(process.env.PUBLIC_BUILD_TIMESTAMP ?? Math.floor(Date.now() / 1000)),
	env: process.env.PUBLIC_PROJECT_ENV ?? process.env.NODE_ENV ?? 'development',
};

await mkdir(distDir, {recursive: true});
await writeFile(versionFile, `${JSON.stringify(payload)}\n`, 'utf8');
