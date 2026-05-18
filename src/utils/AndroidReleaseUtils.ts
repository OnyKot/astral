import Config from '~/Config';

export type AndroidReleaseChannel = 'stable' | 'canary';

export interface AndroidReleaseManifest {
	channel: AndroidReleaseChannel;
	platform: 'android';
	version: string;
	version_code: number;
	package_name: string;
	file: string;
	pub_date: string;
}

export const getAndroidReleaseChannel = (): AndroidReleaseChannel =>
	Config.PUBLIC_PROJECT_ENV === 'canary' ? 'canary' : 'stable';

export const getAndroidManifestPath = (channel: AndroidReleaseChannel = getAndroidReleaseChannel()): string =>
	`/dl/mobile/android/${channel}/manifest.json`;

export const getAndroidLatestApkPath = (channel: AndroidReleaseChannel = getAndroidReleaseChannel()): string =>
	`/dl/mobile/android/${channel}/latest/apk`;

export const getAndroidLatestApkUrl = (channel: AndroidReleaseChannel = getAndroidReleaseChannel()): string =>
	new URL(getAndroidLatestApkPath(channel), window.location.origin).toString();

function isAndroidReleaseManifest(value: unknown): value is AndroidReleaseManifest {
	if (!value || typeof value !== 'object') {
		return false;
	}

	const candidate = value as Partial<AndroidReleaseManifest>;
	return (
		(candidate.channel === 'stable' || candidate.channel === 'canary') &&
		candidate.platform === 'android' &&
		typeof candidate.version === 'string' &&
		typeof candidate.version_code === 'number' &&
		typeof candidate.package_name === 'string' &&
		typeof candidate.file === 'string' &&
		typeof candidate.pub_date === 'string'
	);
}

export async function fetchAndroidReleaseManifest(
	channel: AndroidReleaseChannel = getAndroidReleaseChannel(),
): Promise<AndroidReleaseManifest | null> {
	try {
		const response = await fetch(getAndroidManifestPath(channel), {
			cache: 'no-store',
			headers: {'Cache-Control': 'no-cache'},
		});

		if (!response.ok) {
			return null;
		}

		const payload = (await response.json()) as unknown;
		return isAndroidReleaseManifest(payload) ? payload : null;
	} catch (error) {
		console.warn('[AndroidReleaseUtils] Failed to fetch Android manifest', error);
		return null;
	}
}

export function isAndroidReleaseNewer(
	currentVersionCode: number | null,
	manifest: AndroidReleaseManifest | null,
): boolean {
	if (currentVersionCode == null || !manifest) {
		return false;
	}

	return manifest.version_code > currentVersionCode;
}
