import '~/instrument';

/*
 * One-off migration: copy every object from the OVHcloud S3 backend to Selectel
 * S3, bucket for bucket. Cross-provider, so we stream GetObject -> PutObject
 * (CopyObject only works within a single provider). Idempotent: objects that
 * already exist at the destination (by key) are skipped, so re-running resumes.
 *
 * Run from a host with egress to both providers:
 *   pnpm tsx src/scripts/migrateS3OvhToSelectel.ts --apply
 * Without --apply it lists counts/sizes only (dry-run).
 *
 * Env (source = OVH, dest = Selectel):
 *   SRC_AWS_S3_ENDPOINT, SRC_AWS_ACCESS_KEY_ID, SRC_AWS_SECRET_ACCESS_KEY, SRC_AWS_S3_REGION
 *   DST_AWS_S3_ENDPOINT, DST_AWS_ACCESS_KEY_ID, DST_AWS_SECRET_ACCESS_KEY, DST_AWS_S3_REGION
 * Optional: MIGRATE_S3_BUCKETS=comma,list (defaults to the five prod buckets).
 */

import {
	GetObjectCommand,
	HeadObjectCommand,
	ListObjectsV2Command,
	type ListObjectsV2CommandOutput,
	PutObjectCommand,
	S3Client,
} from '@aws-sdk/client-s3';
import {Readable} from 'node:stream';

const DEFAULT_BUCKETS = ['Astral', 'Astral-uploads', 'Astral-reports', 'Astral-harvests', 'Astral-downloads'];

interface EndpointCreds {
	endpoint: string;
	accessKeyId: string;
	secretAccessKey: string;
	region: string;
}

interface BucketSummary {
	bucket: string;
	sourceObjects: number;
	sourceBytes: number;
	copied: number;
	skipped: number;
	failed: number;
	destObjects: number;
	destBytes: number;
}

function requireEnv(key: string): string {
	const value = process.env[key];
	if (!value) {
		throw new Error(`Missing required env var: ${key}`);
	}
	return value;
}

function loadCreds(prefix: 'SRC' | 'DST'): EndpointCreds {
	return {
		endpoint: requireEnv(`${prefix}_AWS_S3_ENDPOINT`),
		accessKeyId: requireEnv(`${prefix}_AWS_ACCESS_KEY_ID`),
		secretAccessKey: requireEnv(`${prefix}_AWS_SECRET_ACCESS_KEY`),
		region: process.env[`${prefix}_AWS_S3_REGION`] || 'ru-1',
	};
}

function makeClient(creds: EndpointCreds): S3Client {
	return new S3Client({
		endpoint: creds.endpoint,
		region: creds.region,
		credentials: {accessKeyId: creds.accessKeyId, secretAccessKey: creds.secretAccessKey},
		forcePathStyle: true,
		requestChecksumCalculation: 'WHEN_REQUIRED',
		responseChecksumValidation: 'WHEN_REQUIRED',
	});
}

interface CliOptions {
	apply: boolean;
	buckets: Array<string>;
}

function parseOptions(argv: Array<string>): CliOptions {
	const apply = argv.includes('--apply');
	const bucketsFlag = argv.find((a) => a.startsWith('--buckets='));
	const buckets = bucketsFlag ? bucketsFlag.slice('--buckets='.length).split(',').map((s) => s.trim()).filter(Boolean) : DEFAULT_BUCKETS;
	return {apply, buckets};
}

async function listAllObjects(client: S3Client, bucket: string): Promise<Array<{key: string; size: number}>> {
	const objects: Array<{key: string; size: number}> = [];
	let continuationToken: string | undefined;
	do {
		const command = new ListObjectsV2Command({Bucket: bucket, ContinuationToken: continuationToken});
		const output: ListObjectsV2CommandOutput = await client.send(command);
		for (const obj of output.Contents ?? []) {
			if (obj.Key === undefined) continue;
			objects.push({key: obj.Key, size: obj.Size ?? 0});
		}
		continuationToken = output.IsTruncated ? output.NextContinuationToken : undefined;
	} while (continuationToken);
	return objects;
}

async function objectExists(client: S3Client, bucket: string, key: string): Promise<boolean> {
	try {
		await client.send(new HeadObjectCommand({Bucket: bucket, Key: key}));
		return true;
	} catch {
		return false;
	}
}

async function copyObject(
	src: S3Client,
	dst: S3Client,
	srcBucket: string,
	dstBucket: string,
	key: string,
): Promise<void> {
	const getOutput = await src.send(new GetObjectCommand({Bucket: srcBucket, Key: key}));
	const body = getOutput.Body;
	if (!body) throw new Error(`No body for ${srcBucket}/${key}`);

	// Stream the source body straight into the destination PutObject. aws-sdk v3
	// accepts a Readable stream as Body, so this never buffers the whole object.
	const readable = body as Readable;
	await dst.send(
		new PutObjectCommand({
			Bucket: dstBucket,
			Key: key,
			Body: readable,
			ContentType: getOutput.ContentType,
			CacheControl: getOutput.CacheControl,
			Expires: getOutput.Expires,
			Metadata: getOutput.Metadata,
		}),
	);
}

async function migrateBucket(
	src: S3Client,
	dst: S3Client,
	bucket: string,
	apply: boolean,
): Promise<BucketSummary> {
	console.log(`\n=== ${bucket} ===`);
	const sourceObjects = await listAllObjects(src, bucket);
	const sourceBytes = sourceObjects.reduce((acc, o) => acc + o.size, 0);
	console.log(`source: ${sourceObjects.length} objects, ${(sourceBytes / 1024 / 1024).toFixed(1)} MiB`);

	const summary: BucketSummary = {
		bucket,
		sourceObjects: sourceObjects.length,
		sourceBytes,
		copied: 0,
		skipped: 0,
		failed: 0,
		destObjects: 0,
		destBytes: 0,
	};

	if (!apply) {
		console.log('dry-run: skipping copy');
		return summary;
	}

	for (const {key, size} of sourceObjects) {
		try {
			if (await objectExists(dst, bucket, key)) {
				summary.skipped++;
				summary.destObjects++;
				summary.destBytes += size;
				continue;
			}
			await copyObject(src, dst, bucket, bucket, key);
			summary.copied++;
			summary.destObjects++;
			summary.destBytes += size;
			if (summary.copied % 500 === 0) {
				console.log(`  ...${summary.copied} copied, ${summary.skipped} skipped`);
			}
		} catch (error) {
			summary.failed++;
			console.error(`  failed: ${key} — ${(error as Error).message}`);
		}
	}

	console.log(`copied=${summary.copied} skipped=${summary.skipped} failed=${summary.failed}`);
	return summary;
}

async function main(): Promise<void> {
	const options = parseOptions(process.argv.slice(2));
	console.log(`S3 migration OVH -> Selectel (${options.apply ? 'APPLY' : 'dry-run'})`);
	console.log(`buckets: ${options.buckets.join(', ')}`);

	const srcCreds = loadCreds('SRC');
	const dstCreds = loadCreds('DST');
	const src = makeClient(srcCreds);
	const dst = makeClient(dstCreds);

	const summaries: Array<BucketSummary> = [];
	for (const bucket of options.buckets) {
		summaries.push(await migrateBucket(src, dst, bucket, options.apply));
	}

	console.log('\n=== totals ===');
	let totalSource = 0;
	let totalSourceBytes = 0;
	let totalCopied = 0;
	let totalSkipped = 0;
	let totalFailed = 0;
	for (const s of summaries) {
		totalSource += s.sourceObjects;
		totalSourceBytes += s.sourceBytes;
		totalCopied += s.copied;
		totalSkipped += s.skipped;
		totalFailed += s.failed;
		console.log(
			`${s.bucket}: src=${s.sourceObjects} (${(s.sourceBytes / 1024 / 1024).toFixed(1)} MiB), copied=${s.copied}, skipped=${s.skipped}, failed=${s.failed}`,
		);
	}
	console.log(`TOTAL: src=${totalSource} (${(totalSourceBytes / 1024 / 1024 / 1024).toFixed(2)} GiB), copied=${totalCopied}, skipped=${totalSkipped}, failed=${totalFailed}`);

	if (totalFailed > 0) {
		console.error(`${totalFailed} object(s) failed — re-run to retry (idempotent)`);
		process.exitCode = 1;
	}

	// Verify: dest object count must equal source count per bucket (after a full
	// apply run, skipped+copied should equal sourceObjects).
	if (options.apply) {
		for (const s of summaries) {
			if (s.copied + s.skipped !== s.sourceObjects) {
				console.error(`VERIFY FAIL: ${s.bucket} — copied+skipped (${s.copied + s.skipped}) != source (${s.sourceObjects})`);
				process.exitCode = 1;
			}
		}
	}
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
