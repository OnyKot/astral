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

import {execFile} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {promisify} from 'node:util';
import {API_CODE_VERSION} from '~/Constants';
import {Config} from '~/Config';

const execFileAsync = promisify(execFile);

const FETCH_TIMEOUT_MS = 8000;

type FileReadResult = {
	path: string;
	exists: boolean;
	content: string | null;
	error: string | null;
};

type HttpProbeResult = {
	url: string;
	ok: boolean;
	status: number | null;
	latency_ms: number | null;
	body_preview: string | null;
	json: unknown | null;
	error: string | null;
};

function trimTrailingSlash(value: string): string {
	return value.endsWith('/') ? value.slice(0, -1) : value;
}

function parseEnvFile(text: string): Record<string, string> {
	const out: Record<string, string> = {};
	for (const line of text.split(/\r?\n/)) {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith('#')) continue;
		const idx = trimmed.indexOf('=');
		if (idx === -1) continue;
		out[trimmed.slice(0, idx)] = trimmed.slice(idx + 1);
	}
	return out;
}

function readFileSafe(filePath: string): FileReadResult {
	try {
		if (!fs.existsSync(filePath)) {
			return {path: filePath, exists: false, content: null, error: null};
		}
		const content = fs.readFileSync(filePath, 'utf8');
		return {path: filePath, exists: true, content, error: null};
	} catch (error) {
		return {
			path: filePath,
			exists: false,
			content: null,
			error: error instanceof Error ? error.message : String(error),
		};
	}
}

function tryParseJson(text: string | null): unknown | null {
	if (!text) return null;
	try {
		return JSON.parse(text);
	} catch {
		return null;
	}
}

function resolveRepoRoot(): string {
	const candidates = [
		process.env.ASTRAL_OPS_REPO_ROOT,
		process.env.APP_ROOT,
		process.env.REPO_ROOT,
		path.resolve(process.cwd(), '..'),
		'/opt/Astral-clean',
		'/workspace',
	].filter(Boolean) as string[];

	for (const candidate of candidates) {
		const deployState = path.join(candidate, '.deploy-state.env');
		const versionJson = path.join(candidate, 'dist', 'version.json');
		if (fs.existsSync(deployState) || fs.existsSync(versionJson)) {
			return candidate;
		}
	}

	return candidates[0] ?? process.cwd();
}

async function probeUrl(url: string, parseJson = false): Promise<HttpProbeResult> {
	const started = Date.now();
	try {
		const response = await fetch(url, {
			signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
			headers: {accept: parseJson ? 'application/json' : '*/*'},
		});
		const latency_ms = Date.now() - started;
		const text = await response.text();
		const preview = text.length > 4000 ? `${text.slice(0, 4000)}…` : text;
		return {
			url,
			ok: response.ok,
			status: response.status,
			latency_ms,
			body_preview: preview,
			json: parseJson ? tryParseJson(text) : null,
			error: null,
		};
	} catch (error) {
		return {
			url,
			ok: false,
			status: null,
			latency_ms: Date.now() - started,
			body_preview: null,
			json: null,
			error: error instanceof Error ? error.message : String(error),
		};
	}
}

function memoryUsageMb(): number {
	const {heapUsed} = process.memoryUsage();
	return Math.round((heapUsed / 1024 / 1024) * 10) / 10;
}

function opsActionsEnabled(): boolean {
	return process.env.ASTRAL_OPS_ACTIONS_ENABLED === '1' || process.env.ASTRAL_OPS_ACTIONS_ENABLED === 'true';
}

async function runReleaseWaveScript(command: string, extraArgs: string[] = []): Promise<{ok: boolean; stdout: string; stderr: string}> {
	const repoRoot = resolveRepoRoot();
	const scriptPath = path.join(repoRoot, 'scripts', 'cicd', 'release-waves.mjs');
	if (!fs.existsSync(scriptPath)) {
		throw new Error(`release-waves.mjs not found at ${scriptPath}`);
	}

	const {stdout, stderr} = await execFileAsync('node', [scriptPath, command, ...extraArgs], {
		cwd: repoRoot,
		env: {
			...process.env,
			APP_ROOT: repoRoot,
			REPO_ROOT: repoRoot,
		},
		timeout: 30_000,
		maxBuffer: 1024 * 512,
	});

	return {ok: true, stdout, stderr};
}

export async function getOpsSnapshot() {
	const generatedAt = new Date().toISOString();
	const repoRoot = resolveRepoRoot();
	const webApp = trimTrailingSlash(Config.endpoints.webApp);
	const apiPublic = trimTrailingSlash(Config.endpoints.apiPublic);
	const admin = trimTrailingSlash(Config.endpoints.admin);

	const deployStatePath =
		process.env.ASTRAL_OPS_DEPLOY_STATE_FILE ?? path.join(repoRoot, '.deploy-state.env');
	const releaseWavesPath =
		process.env.ASTRAL_OPS_RELEASE_WAVES_FILE ?? path.join(repoRoot, '.release-waves.json');
	const versionFilePath = process.env.ASTRAL_OPS_VERSION_FILE ?? path.join(repoRoot, 'dist', 'version.json');
	const releasePolicyPath = path.join(repoRoot, 'scripts', 'cicd', 'release-policy.json');
	const releaseDefaultsPath = path.join(repoRoot, 'scripts', 'cicd', 'release-waves.default.json');
	const deployPlanPath = process.env.ASTRAL_OPS_DEPLOY_PLAN_FILE ?? '/tmp/astral-cicd-latest/deploy-plan.md';

	const deployStateFile = readFileSafe(deployStatePath);
	const releaseWavesFile = readFileSafe(releaseWavesPath);
	const versionFile = readFileSafe(versionFilePath);
	const releasePolicyFile = readFileSafe(releasePolicyPath);
	const releaseDefaultsFile = readFileSafe(releaseDefaultsPath);
	const deployPlanFile = readFileSafe(deployPlanPath);

	const deployState = deployStateFile.content ? parseEnvFile(deployStateFile.content) : {};
	const releaseWaves = tryParseJson(releaseWavesFile.content);
	const versionLocal = tryParseJson(versionFile.content);
	const releasePolicy = tryParseJson(releasePolicyFile.content);
	const releaseDefaults = tryParseJson(releaseDefaultsFile.content);

	const harnessUrl =
		process.env.ASTRAL_HARNESS_UI_URL ??
		process.env.HARNESS_UI_URL ??
		null;

	const [
		webHome,
		webVersion,
		apiInstance,
		apiStatus,
		adminHealth,
	] = await Promise.all([
		probeUrl(`${webApp}/`),
		probeUrl(`${webApp}/version.json`, true),
		probeUrl(`${apiPublic}/instance`, true),
		probeUrl(`${apiPublic}/status/summary`, true),
		probeUrl(`${admin}/_health`),
	]);

	const deployedSha = deployState.DEPLOYED_SHA ?? process.env.DEPLOYED_SHA ?? null;
	const liveSha =
		(webVersion.json as {sha?: string} | null)?.sha ??
		(versionLocal as {sha?: string} | null)?.sha ??
		null;
	const shaMismatch =
		deployedSha && liveSha
			? deployedSha.replace(/^(.{8}).*/, '$1') !== liveSha.replace(/^(.{8}).*/, '$1') &&
				deployedSha !== liveSha
			: null;

	const rollout = (webVersion.json as {rollout?: unknown} | null)?.rollout ?? null;

	return {
		generated_at: generatedAt,
		repo_root: repoRoot,
		endpoints: {
			web_app: webApp,
			api_public: apiPublic,
			admin,
			gateway: Config.endpoints.gateway,
			media: Config.endpoints.media,
			cdn: Config.endpoints.cdn,
		},
		api_runtime: {
			node_version: process.version,
			node_env: Config.nodeEnv,
			uptime_seconds: Math.floor(process.uptime()),
			memory_mb: memoryUsageMb(),
			api_code_version: API_CODE_VERSION,
			pid: process.pid,
			cwd: process.cwd(),
		},
		deploy: {
			sha: deployedSha,
			branch: deployState.DEPLOYED_BRANCH ?? process.env.DEPLOYED_BRANCH ?? null,
			at: deployState.DEPLOYED_AT ?? process.env.DEPLOYED_AT ?? null,
			plan_excerpt: deployPlanFile.content ? deployPlanFile.content.slice(0, 8000) : null,
		},
		release: {
			waves_state: releaseWaves,
			version_local: versionLocal,
			version_live: webVersion.json,
			policy: releasePolicy,
			defaults: releaseDefaults,
			rollout_live: rollout,
			sha_mismatch: shaMismatch,
			live_sha: liveSha,
		},
		health: {
			web_home: {status: webHome.status, ok: webHome.ok, latency_ms: webHome.latency_ms, error: webHome.error},
			web_version: {
				status: webVersion.status,
				ok: webVersion.ok,
				latency_ms: webVersion.latency_ms,
				error: webVersion.error,
			},
			api_instance: {
				status: apiInstance.status,
				ok: apiInstance.ok,
				latency_ms: apiInstance.latency_ms,
				error: apiInstance.error,
			},
			api_status: {
				status: apiStatus.status,
				ok: apiStatus.ok,
				latency_ms: apiStatus.latency_ms,
				error: apiStatus.error,
				summary: apiStatus.json,
			},
			admin_health: {
				status: adminHealth.status,
				ok: adminHealth.ok,
				latency_ms: adminHealth.latency_ms,
				error: adminHealth.error,
			},
		},
		files: {
			deploy_state: deployStateFile,
			release_waves: releaseWavesFile,
			version_json: versionFile,
			release_policy: releasePolicyFile,
			release_defaults: releaseDefaultsFile,
			deploy_plan: deployPlanFile,
		},
		harness: {
			ui_url: harnessUrl,
			actions_enabled: opsActionsEnabled(),
			autodeploy_log_hint: 'journalctl -u harness-autodeploy.service -n 50',
		},
		links: {
			harness_pipeline: harnessUrl,
			site: webApp,
			version_json: `${webApp}/version.json`,
			api_instance: `${apiPublic}/instance`,
			api_status: `${apiPublic}/status/summary`,
			admin: admin,
		},
		support_commands: [
			`cat ${deployStatePath}`,
			`node ${path.join(repoRoot, 'scripts/cicd/release-waves.mjs')} status`,
			`node ${path.join(repoRoot, 'scripts/cicd/release-waves.mjs')} advance`,
			'journalctl -u harness-autodeploy.service -n 30',
		],
	};
}

export async function runOpsSmokeChecks() {
	const webApp = trimTrailingSlash(Config.endpoints.webApp);
	const apiPublic = trimTrailingSlash(Config.endpoints.apiPublic);

	const targets = [
		{name: 'web_home', url: `${webApp}/`, parseJson: false, expectStatus: 200},
		{name: 'web_version_json', url: `${webApp}/version.json`, parseJson: true, expectStatus: 200},
		{name: 'api_instance', url: `${apiPublic}/instance`, parseJson: true, expectStatus: 200},
		{name: 'api_status_summary', url: `${apiPublic}/status/summary`, parseJson: true, expectStatus: 200},
	];

	const results = await Promise.all(
		targets.map(async (target) => {
			const probe = await probeUrl(target.url, target.parseJson);
			return {
				name: target.name,
				url: target.url,
				pass: probe.ok && probe.status === target.expectStatus,
				status: probe.status,
				latency_ms: probe.latency_ms,
				error: probe.error,
				json: probe.json,
			};
		}),
	);

	return {
		generated_at: new Date().toISOString(),
		all_pass: results.every((r) => r.pass),
		checks: results,
	};
}

export async function advanceReleaseWave() {
	if (!opsActionsEnabled()) {
		throw new Error('Ops actions disabled. Set ASTRAL_OPS_ACTIONS_ENABLED=1 on API.');
	}
	const result = await runReleaseWaveScript('advance');
	return {
		command: 'advance',
		...result,
		snapshot: await getOpsSnapshot(),
	};
}

export async function fullReleaseRollout() {
	if (!opsActionsEnabled()) {
		throw new Error('Ops actions disabled. Set ASTRAL_OPS_ACTIONS_ENABLED=1 on API.');
	}
	const result = await runReleaseWaveScript('full');
	return {
		command: 'full',
		...result,
		snapshot: await getOpsSnapshot(),
	};
}

export async function writeReleaseVersionJson() {
	if (!opsActionsEnabled()) {
		throw new Error('Ops actions disabled. Set ASTRAL_OPS_ACTIONS_ENABLED=1 on API.');
	}
	const result = await runReleaseWaveScript('write-version');
	return {
		command: 'write-version',
		...result,
		snapshot: await getOpsSnapshot(),
	};
}
