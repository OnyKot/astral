/*
 * Copyright (C) 2026 Astral Contributors
 *
 * Resolves local vs live build identity for updater UI and gates.
 */

import Config from '~/Config';
import {fetchReleaseManifest} from '~/utils/ReleaseClient';
import type {VersionJsonPayload} from '~/utils/RolloutUtils';

export function getLocalBuildSha(): string {
	return Config.PUBLIC_BUILD_SHA ?? 'dev';
}

export function normalizeBuildSha(sha: string | null | undefined): string {
	if (!sha) {
		return '';
	}
	return sha.trim().toLowerCase();
}

export function isBuildShaStale(localSha: string | null | undefined, liveSha: string | null | undefined): boolean {
	const local = normalizeBuildSha(localSha);
	const live = normalizeBuildSha(liveSha);

	if (!live || live === 'dev') {
		return false;
	}

	if (!local || local === 'dev') {
		return true;
	}

	if (local === live) {
		return false;
	}

	const localShort = local.slice(0, 7);
	const liveShort = live.slice(0, 7);
	return localShort !== liveShort;
}

export function resolveChannelLabel(env: string | null | undefined): string {
	switch (env) {
		case 'canary':
			return 'Canary';
		case 'stable':
			return 'Stable';
		case 'development':
			return 'Development';
		default:
			return env ? env.charAt(0).toUpperCase() + env.slice(1) : 'Stable';
	}
}

export async function fetchLiveBuildIdentity(): Promise<VersionJsonPayload | null> {
	return fetchReleaseManifest({force: true});
}

export function formatBuildSha(sha: string | null | undefined): string {
	if (!sha) {
		return '—';
	}
	return sha.length > 12 ? sha.slice(0, 12) : sha;
}

export function getLocalBuildTimestamp(): number | null {
	return Config.PUBLIC_BUILD_TIMESTAMP ?? null;
}

export function getLocalProjectEnv(): string {
	return Config.PUBLIC_PROJECT_ENV ?? 'development';
}
