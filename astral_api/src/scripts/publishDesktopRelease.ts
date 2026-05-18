import '~/instrument';

import {basename} from 'node:path';
import {PutObjectCommand, S3Client} from '@aws-sdk/client-s3';

type Channel = 'stable' | 'canary';
type Platform = 'win32' | 'darwin' | 'linux';
type Arch = 'x64' | 'arm64';

interface CliOptions {
	channel: Channel;
	platform: Platform;
	arch: Arch;
	file: string;
	blockmap: string | null;
	version: string;
	publishedAt: string;
	format: 'setup' | 'dmg' | 'zip' | 'appimage' | 'deb' | 'rpm' | 'tar_gz';
}

function parseOptions(argv: Array<string>): CliOptions {
	let channel: Channel = 'stable';
	let platform: Platform = 'win32';
	let arch: Arch = 'x64';
	let file = '';
	let blockmap: string | null = null;
	let version = '';
	let publishedAt: string = new Date().toISOString();
	let format: CliOptions['format'] = 'setup';

	for (const arg of argv) {
		if (arg.startsWith('--channel=')) {
			const value = arg.slice('--channel='.length);
			if (value !== 'stable' && value !== 'canary') {
				throw new Error(`Invalid --channel value: ${value}`);
			}
			channel = value;
			continue;
		}

		if (arg.startsWith('--platform=')) {
			const value = arg.slice('--platform='.length);
			if (value !== 'win32' && value !== 'darwin' && value !== 'linux') {
				throw new Error(`Invalid --platform value: ${value}`);
			}
			platform = value;
			continue;
		}

		if (arg.startsWith('--arch=')) {
			const value = arg.slice('--arch='.length);
			if (value !== 'x64' && value !== 'arm64') {
				throw new Error(`Invalid --arch value: ${value}`);
			}
			arch = value;
			continue;
		}

		if (arg.startsWith('--file=')) {
			file = arg.slice('--file='.length);
			continue;
		}

		if (arg.startsWith('--blockmap=')) {
			blockmap = arg.slice('--blockmap='.length);
			continue;
		}

		if (arg.startsWith('--version=')) {
			version = arg.slice('--version='.length);
			continue;
		}

		if (arg.startsWith('--published-at=')) {
			publishedAt = arg.slice('--published-at='.length);
			continue;
		}

		if (arg.startsWith('--format=')) {
			const value = arg.slice('--format='.length);
			if (!['setup', 'dmg', 'zip', 'appimage', 'deb', 'rpm', 'tar_gz'].includes(value)) {
				throw new Error(`Invalid --format value: ${value}`);
			}
			format = value as CliOptions['format'];
			continue;
		}

		throw new Error(`Unknown argument: ${arg}`);
	}

	if (!file || !version) {
		throw new Error('Usage: pnpm publish:desktop --file=<installer> --version=<1.2.2> [--blockmap=<file>] [--channel=stable]');
	}

	return {channel, platform, arch, file, blockmap, version, publishedAt, format};
}

async function main(): Promise<void> {
	const options = parseOptions(process.argv.slice(2));
	const {Config} = await import('~/Config');
	const fs = await import('node:fs/promises');

	const client = new S3Client({
		region: 'auto',
		endpoint: Config.s3.endpoint,
		forcePathStyle: true,
		credentials: {
			accessKeyId: Config.s3.accessKeyId,
			secretAccessKey: Config.s3.secretAccessKey,
		},
	});

	const fileName = basename(options.file);
	const objectPrefix = `desktop/${options.channel}/${options.platform}/${options.arch}`;
	const manifestKey = `${objectPrefix}/manifest.json`;
	const files = {
		setup: '',
		dmg: '',
		zip: '',
		appimage: '',
		deb: '',
		rpm: '',
		tar_gz: '',
	};
	files[options.format] = fileName;

	await client.send(
		new PutObjectCommand({
			Bucket: Config.s3.buckets.downloads,
			Key: `${objectPrefix}/${fileName}`,
			Body: await fs.readFile(options.file),
			ContentType: 'application/octet-stream',
			CacheControl: 'public, max-age=31536000, immutable',
		}),
	);

	if (options.blockmap) {
		const blockmapName = basename(options.blockmap);
		await client.send(
			new PutObjectCommand({
				Bucket: Config.s3.buckets.downloads,
				Key: `${objectPrefix}/${blockmapName}`,
				Body: await fs.readFile(options.blockmap),
				ContentType: 'application/octet-stream',
				CacheControl: 'public, max-age=31536000, immutable',
			}),
		);
	}

	await client.send(
		new PutObjectCommand({
			Bucket: Config.s3.buckets.downloads,
			Key: manifestKey,
			Body: JSON.stringify(
				{
					channel: options.channel,
					platform: options.platform,
					arch: options.arch,
					version: options.version,
					pub_date: options.publishedAt,
					files,
				},
				null,
				2,
			),
			ContentType: 'application/json; charset=utf-8',
			CacheControl: 'no-store',
		}),
	);

	console.log(`uploaded ${objectPrefix}/${fileName}`);
	console.log(`uploaded ${manifestKey}`);
}

void main();
