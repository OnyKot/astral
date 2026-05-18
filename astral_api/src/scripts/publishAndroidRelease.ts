import '~/instrument';

import {basename} from 'node:path';
import {PutObjectCommand, S3Client} from '@aws-sdk/client-s3';

type Channel = 'stable' | 'canary';

interface CliOptions {
	channel: Channel;
	file: string;
	version: string;
	versionCode: number;
	packageName: string;
	publishedAt: string;
}

function parsePositiveInt(raw: string, flagName: string): number {
	const value = Number.parseInt(raw, 10);
	if (!Number.isFinite(value) || value <= 0) {
		throw new Error(`Invalid ${flagName}: ${raw}`);
	}
	return value;
}

function parseOptions(argv: Array<string>): CliOptions {
	let channel: Channel = 'stable';
	let file = '';
	let version = '';
	let versionCode = 0;
	let packageName = 'app.astral';
	let publishedAt: string = new Date().toISOString();

	for (const arg of argv) {
		if (arg.startsWith('--channel=')) {
			const value = arg.slice('--channel='.length);
			if (value !== 'stable' && value !== 'canary') {
				throw new Error(`Invalid --channel value: ${value}`);
			}
			channel = value;
			continue;
		}

		if (arg.startsWith('--file=')) {
			file = arg.slice('--file='.length);
			continue;
		}

		if (arg.startsWith('--version=')) {
			version = arg.slice('--version='.length);
			continue;
		}

		if (arg.startsWith('--version-code=')) {
			versionCode = parsePositiveInt(arg.slice('--version-code='.length), '--version-code');
			continue;
		}

		if (arg.startsWith('--package-name=')) {
			packageName = arg.slice('--package-name='.length);
			continue;
		}

		if (arg.startsWith('--published-at=')) {
			publishedAt = arg.slice('--published-at='.length);
			continue;
		}

		throw new Error(`Unknown argument: ${arg}`);
	}

	if (!file || !version || versionCode === 0) {
		throw new Error('Usage: pnpm publish:android --file=<apk> --version=<1.2.2> --version-code=<3> [--channel=stable]');
	}

	return {channel, file, version, versionCode, packageName, publishedAt};
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

	const filename = basename(options.file);
	const fileBody = await fs.readFile(options.file);
	const objectKey = `mobile/android/${options.channel}/${filename}`;
	const manifestKey = `mobile/android/${options.channel}/manifest.json`;
	const manifestBody = JSON.stringify(
		{
			channel: options.channel,
			platform: 'android',
			version: options.version,
			version_code: options.versionCode,
			package_name: options.packageName,
			file: filename,
			pub_date: options.publishedAt,
		},
		null,
		2,
	);

	await client.send(
		new PutObjectCommand({
			Bucket: Config.s3.buckets.downloads,
			Key: objectKey,
			Body: fileBody,
			ContentType: 'application/vnd.android.package-archive',
			CacheControl: 'public, max-age=31536000, immutable',
		}),
	);

	await client.send(
		new PutObjectCommand({
			Bucket: Config.s3.buckets.downloads,
			Key: manifestKey,
			Body: manifestBody,
			ContentType: 'application/json; charset=utf-8',
			CacheControl: 'no-store',
		}),
	);

	console.log(`uploaded ${objectKey}`);
	console.log(`uploaded ${manifestKey}`);
	console.log(`/dl/mobile/android/${options.channel}/latest/apk`);
}

void main();
