/*
 * Copyright (C) 2026 Astral Contributors
 *
 * Web bundle stale detection and forced reload gate.
 */

import {getLocalBuildSha, isBuildShaStale, normalizeBuildSha} from '~/utils/BuildIdentityUtils';
import {fetchReleaseManifest} from '~/utils/ReleaseClient';
import {getRolloutBucketKey, isInRolloutWave} from '~/utils/RolloutUtils';
import {isDesktop} from '~/utils/NativeUtils';
import {isNativeAndroidApp} from '~/utils/AndroidAppInfo';

export async function getWebUpdateGateInfo(): Promise<{
	required: boolean;
	liveSha: string | null;
	localSha: string;
	notes: string | null;
}> {
	if (isDesktop() || isNativeAndroidApp()) {
		return {required: false, liveSha: null, localSha: getLocalBuildSha(), notes: null};
	}

	const manifest = await fetchReleaseManifest();
	const localSha = getLocalBuildSha();
	const liveSha = manifest?.sha ?? null;

	// Unknown local identity (dev sentinel) cannot self-heal via reload — only a
	// server-side rebuild can stamp the bundle. Hard-block would trap users forever.
	const normalizedLocal = normalizeBuildSha(localSha);
	if (!normalizedLocal || normalizedLocal === 'dev') {
		return {required: false, liveSha, localSha, notes: manifest?.notes ?? null};
	}

	if (!liveSha || !isBuildShaStale(localSha, liveSha)) {
		return {required: false, liveSha, localSha, notes: manifest?.notes ?? null};
	}

	const inWave = isInRolloutWave(getRolloutBucketKey(null), manifest?.rollout ?? null, null);
	const rolloutPercent = manifest?.rollout?.percent ?? 100;

	return {
		required: inWave && rolloutPercent >= 100,
		liveSha,
		localSha,
		notes: manifest?.notes ?? null,
	};
}
