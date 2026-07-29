#!/usr/bin/env node
/**
 * Wave rollout manager for web frontend updates.
 *
 * Usage:
 *   node scripts/cicd/release-waves.mjs status
 *   node scripts/cicd/release-waves.mjs init --sha f5846232
 *   node scripts/cicd/release-waves.mjs advance
 *   node scripts/cicd/release-waves.mjs set --wave 3
 *   node scripts/cicd/release-waves.mjs full
 *   node scripts/cicd/release-waves.mjs write-version
 */
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = process.env.APP_ROOT || process.env.REPO_ROOT || path.resolve(__dirname, '../..');
const STATE_FILE = process.env.RELEASE_WAVES_STATE || path.join(REPO_ROOT, '.release-waves.json');
const DEFAULTS_FILE = path.join(__dirname, 'release-waves.default.json');
const POLICY_FILE = path.join(__dirname, 'release-policy.json');
const DIST_DIR = process.env.DIST_DIR || path.join(REPO_ROOT, 'dist');
const VERSION_FILE = path.join(DIST_DIR, 'version.json');

async function loadDefaults() {
	const raw = await readFile(DEFAULTS_FILE, 'utf8');
	return JSON.parse(raw);
}

async function loadPolicy() {
	try {
		const raw = await readFile(POLICY_FILE, 'utf8');
		return JSON.parse(raw);
	} catch {
		return {};
	}
}

async function loadState() {
	try {
		const raw = await readFile(STATE_FILE, 'utf8');
		return JSON.parse(raw);
	} catch {
		return null;
	}
}

async function saveState(state) {
	await writeFile(STATE_FILE, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
}

function waveEntry(defaults, waveNumber) {
	const waves = defaults.waves ?? [];
	return waves.find((w) => w.wave === waveNumber) ?? waves[waves.length - 1] ?? {wave: 1, percent: 100, label: 'full'};
}

function maxWave(defaults) {
	const waves = defaults.waves ?? [];
	return waves.reduce((max, w) => Math.max(max, w.wave), 1);
}

function parseArgs(argv) {
	const args = {_: []};
	for (let i = 0; i < argv.length; i += 1) {
		const token = argv[i];
		if (token === '--sha') {
			args.sha = argv[++i];
		} else if (token === '--wave') {
			args.wave = Number.parseInt(argv[++i], 10);
		} else if (token === '--allowlist') {
			args.allowlist = argv[++i]?.split(',').map((s) => s.trim()).filter(Boolean) ?? [];
		} else {
			args._.push(token);
		}
	}
	return args;
}

async function buildVersionPayload(state, defaults) {
	const policy = await loadPolicy();
	const entry = waveEntry(defaults, state.wave);
	const sha = state.sha ?? process.env.PUBLIC_BUILD_SHA ?? 'dev';
	return {
		sha,
		buildNumber: Number(state.buildNumber ?? process.env.PUBLIC_BUILD_NUMBER ?? '0'),
		timestamp: Number(state.timestamp ?? process.env.PUBLIC_BUILD_TIMESTAMP ?? Math.floor(Date.now() / 1000)),
		env: state.channel ?? process.env.PUBLIC_PROJECT_ENV ?? 'stable',
		notes: typeof policy.notes === 'string' ? policy.notes : state.notes ?? '',
		desktop: policy.desktop ?? undefined,
		android: policy.android ?? undefined,
		rollout: {
			wave: entry.wave,
			percent: entry.percent,
			label: entry.label,
			wavesTotal: (defaults.waves ?? []).length,
			startedAt: state.startedAt ?? null,
			waveStartedAt: state.waveStartedAt ?? null,
			allowlist: state.allowlist ?? [],
		},
	};
}

async function writeVersionJson(state, defaults) {
	const payload = await buildVersionPayload(state, defaults);
	await mkdir(DIST_DIR, {recursive: true});
	await writeFile(VERSION_FILE, `${JSON.stringify(payload)}\n`, 'utf8');
	return payload;
}

async function initState({sha, allowlist}) {
	const defaults = await loadDefaults();
	const fullSha = sha || process.env.PUBLIC_BUILD_SHA || 'dev';
	const shortSha = fullSha.length > 12 ? fullSha.slice(0, 12) : fullSha;
	const existing = await loadState();

	if (existing && existing.sha === shortSha) {
		if (allowlist) {
			existing.allowlist = allowlist;
			await saveState(existing);
		}
		await writeVersionJson(existing, defaults);
		console.log(`refresh version.json for sha ${shortSha}, wave ${existing.wave} (${existing.percent}%)`);
		return existing;
	}

	const now = new Date().toISOString();
	const entry = waveEntry(defaults, 1);
	const state = {
		sha: shortSha,
		channel: process.env.PUBLIC_PROJECT_ENV ?? 'stable',
		wave: entry.wave,
		percent: entry.percent,
		label: entry.label,
		buildNumber: Number(process.env.PUBLIC_BUILD_NUMBER ?? Math.floor(Date.now() / 1000)),
		timestamp: Number(process.env.PUBLIC_BUILD_TIMESTAMP ?? Math.floor(Date.now() / 1000)),
		startedAt: now,
		waveStartedAt: now,
		allowlist: allowlist ?? [],
	};
	await saveState(state);
	const payload = await writeVersionJson(state, defaults);
	console.log(`init wave ${entry.wave} (${entry.percent}%) for sha ${shortSha}`);
	console.log(`version.json -> ${VERSION_FILE}`);
	console.log(JSON.stringify(payload.rollout, null, 2));
	return state;
}

async function setWave(waveNumber, {allowlist} = {}) {
	const defaults = await loadDefaults();
	const state = (await loadState()) ?? (await initState({sha: process.env.PUBLIC_BUILD_SHA}));
	const entry = waveEntry(defaults, waveNumber);
	if (!entry) {
		throw new Error(`unknown wave ${waveNumber}`);
	}
	const now = new Date().toISOString();
	state.wave = entry.wave;
	state.percent = entry.percent;
	state.label = entry.label;
	state.waveStartedAt = now;
	if (allowlist) {
		state.allowlist = allowlist;
	}
	await saveState(state);
	const payload = await writeVersionJson(state, defaults);
	console.log(`wave ${entry.wave} (${entry.percent}%, ${entry.label}) for sha ${state.sha}`);
	console.log(JSON.stringify(payload.rollout, null, 2));
	return state;
}

async function advanceWave() {
	const defaults = await loadDefaults();
	const state = await loadState();
	if (!state) {
		throw new Error('no rollout state — run init first');
	}
	const nextWave = Math.min(state.wave + 1, maxWave(defaults));
	return setWave(nextWave);
}

async function printStatus() {
	const defaults = await loadDefaults();
	const state = await loadState();
	if (!state) {
		console.log('no active rollout state');
		console.log('defaults:', JSON.stringify(defaults.waves, null, 2));
		return;
	}
	console.log(JSON.stringify(state, null, 2));
	try {
		const version = JSON.parse(await readFile(VERSION_FILE, 'utf8'));
		console.log('version.json rollout:', JSON.stringify(version.rollout ?? null, null, 2));
	} catch {
		console.log('version.json: missing');
	}
}

async function main() {
	const [command = 'status'] = parseArgs(process.argv.slice(2))._;
	const args = parseArgs(process.argv.slice(2));

	switch (command) {
		case 'status':
			await printStatus();
			break;
		case 'init':
			await initState(args);
			break;
		case 'advance':
			await advanceWave();
			break;
		case 'set':
			if (!args.wave || Number.isNaN(args.wave)) {
				throw new Error('set requires --wave N');
			}
			await setWave(args.wave, args);
			break;
		case 'full':
			await setWave(maxWave(await loadDefaults()));
			break;
		case 'write-version': {
			const defaults = await loadDefaults();
			const state = await loadState();
			if (!state) {
				throw new Error('no rollout state — run init first');
			}
			await writeVersionJson(state, defaults);
			console.log(`rewrote ${VERSION_FILE}`);
			break;
		}
		default:
			throw new Error(`unknown command: ${command}`);
	}
}

main().catch((err) => {
	console.error(err.message || err);
	process.exit(1);
});
