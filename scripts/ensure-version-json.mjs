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

import {existsSync} from 'node:fs';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const distDir = path.join(repoRoot, 'dist');
const versionFile = path.join(distDir, 'version.json');
const policyFile = path.join(__dirname, 'cicd', 'release-policy.json');
const wavesScript = path.join(__dirname, 'cicd', 'release-waves.mjs');
const wavesStateFile = path.join(repoRoot, '.release-waves.json');

async function loadPolicy() {
	try {
		const raw = await readFile(policyFile, 'utf8');
		return JSON.parse(raw);
	} catch {
		return {};
	}
}

async function writeFallbackVersionJson() {
	const policy = await loadPolicy();
	const payload = {
		sha: process.env.PUBLIC_BUILD_SHA ?? process.env.GIT_SHA ?? 'dev',
		buildNumber: Number(process.env.PUBLIC_BUILD_NUMBER ?? '0'),
		timestamp: Number(process.env.PUBLIC_BUILD_TIMESTAMP ?? Math.floor(Date.now() / 1000)),
		env: process.env.PUBLIC_PROJECT_ENV ?? process.env.NODE_ENV ?? 'development',
		notes: typeof policy.notes === 'string' ? policy.notes : undefined,
		desktop: policy.desktop ?? undefined,
		android: policy.android ?? undefined,
	};

	await mkdir(distDir, {recursive: true});
	await writeFile(versionFile, `${JSON.stringify(payload)}\n`, 'utf8');
}

if (existsSync(wavesScript) && existsSync(wavesStateFile)) {
	const result = spawnSync('node', [wavesScript, 'write-version'], {
		cwd: repoRoot,
		env: {
			...process.env,
			APP_ROOT: repoRoot,
			REPO_ROOT: repoRoot,
		},
		stdio: 'inherit',
	});

	if (result.status === 0) {
		process.exit(0);
	}

	console.warn('[ensure-version-json] release-waves write-version failed, using fallback');
}

await writeFallbackVersionJson();
