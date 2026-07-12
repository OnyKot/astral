/*
 * Copyright (C) 2026 Astral Contributors
 *
 * Deterministic rollout bucketing for staged web updates.
 */

const DEVICE_ID_KEY = 'astral:rollout:device_id';

export interface VersionRolloutInfo {
	wave: number;
	percent: number;
	label: string;
	wavesTotal: number;
	startedAt: string | null;
	waveStartedAt: string | null;
	allowlist: ReadonlyArray<string>;
}

export interface VersionDesktopPolicy {
	minVersion: string;
}

export interface VersionAndroidPolicy {
	minVersionCode: number;
}

export interface VersionJsonPayload {
	sha: string;
	buildNumber: number;
	timestamp: number;
	env: string;
	notes?: string;
	rollout?: VersionRolloutInfo;
	desktop?: VersionDesktopPolicy;
	android?: VersionAndroidPolicy;
}

const FNV_OFFSET_BASIS = 2_166_136_261;
const FNV_PRIME = 16_777_619;

export function rolloutBucketPercent(bucketKey: string): number {
	let hash = FNV_OFFSET_BASIS;
	for (let index = 0; index < bucketKey.length; index += 1) {
		hash ^= bucketKey.charCodeAt(index);
		hash = Math.imul(hash, FNV_PRIME);
	}
	return (hash >>> 0) % 100;
}

export function getOrCreateDeviceRolloutId(): string {
	try {
		const existing = localStorage.getItem(DEVICE_ID_KEY);
		if (existing) {
			return existing;
		}
		const created = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `dev-${Date.now()}`;
		localStorage.setItem(DEVICE_ID_KEY, created);
		return created;
	} catch {
		return 'anonymous';
	}
}

export function getRolloutBucketKey(userId: string | null | undefined): string {
	if (userId) {
		return `user:${userId}`;
	}
	return `device:${getOrCreateDeviceRolloutId()}`;
}

export function isAllowlistedForRollout(userId: string | null | undefined, allowlist: ReadonlyArray<string>): boolean {
	if (!userId || allowlist.length === 0) {
		return false;
	}
	return allowlist.includes(userId);
}

export function isInRolloutWave(
	bucketKey: string,
	rollout: VersionRolloutInfo | null | undefined,
	userId?: string | null,
): boolean {
	if (!rollout) {
		return true;
	}

	if (isAllowlistedForRollout(userId, rollout.allowlist)) {
		return true;
	}

	if (rollout.percent >= 100) {
		return true;
	}

	return rolloutBucketPercent(bucketKey) < rollout.percent;
}

export function parseVersionJsonPayload(raw: unknown): VersionJsonPayload | null {
	if (!raw || typeof raw !== 'object') {
		return null;
	}

	const payload = raw as Record<string, unknown>;
	if (typeof payload.sha !== 'string' || payload.sha.length === 0) {
		return null;
	}

	const rolloutRaw = payload.rollout;
	let rollout: VersionRolloutInfo | undefined;
	if (rolloutRaw && typeof rolloutRaw === 'object') {
		const r = rolloutRaw as Record<string, unknown>;
		rollout = {
			wave: typeof r.wave === 'number' ? r.wave : 1,
			percent: typeof r.percent === 'number' ? r.percent : 100,
			label: typeof r.label === 'string' ? r.label : 'full',
			wavesTotal: typeof r.wavesTotal === 'number' ? r.wavesTotal : 1,
			startedAt: typeof r.startedAt === 'string' ? r.startedAt : null,
			waveStartedAt: typeof r.waveStartedAt === 'string' ? r.waveStartedAt : null,
			allowlist: Array.isArray(r.allowlist) ? r.allowlist.filter((id): id is string => typeof id === 'string') : [],
		};
	}

	const desktopRaw = payload.desktop;
	let desktop: VersionDesktopPolicy | undefined;
	if (desktopRaw && typeof desktopRaw === 'object') {
		const d = desktopRaw as Record<string, unknown>;
		if (typeof d.minVersion === 'string' && d.minVersion.length > 0) {
			desktop = {minVersion: d.minVersion};
		}
	}

	const androidRaw = payload.android;
	let android: VersionAndroidPolicy | undefined;
	if (androidRaw && typeof androidRaw === 'object') {
		const a = androidRaw as Record<string, unknown>;
		if (typeof a.minVersionCode === 'number') {
			android = {minVersionCode: a.minVersionCode};
		}
	}

	return {
		sha: payload.sha,
		buildNumber: typeof payload.buildNumber === 'number' ? payload.buildNumber : 0,
		timestamp: typeof payload.timestamp === 'number' ? payload.timestamp : 0,
		env: typeof payload.env === 'string' ? payload.env : 'stable',
		notes: typeof payload.notes === 'string' ? payload.notes : undefined,
		rollout,
		desktop,
		android,
	};
}
