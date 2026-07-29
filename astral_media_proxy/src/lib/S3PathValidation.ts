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

import {HTTPException} from 'hono/http-exception';
import {Config} from '~/Config';

// The metadata endpoint accepts a caller-supplied bucket + key (used by the
// favorite-meme flow, which reads from the CDN bucket). Without an allowlist a
// caller can point readS3Object at any bucket the S3 credentials can reach,
// turning the media proxy into a generic S3 reader. Restrict the bucket to the
// ones this service is configured to serve, and reject keys that could confuse
// path-style routing or smuggle control bytes.
const ALLOWED_BUCKETS = new Set<string>(
	[Config.AWS_S3_BUCKET_CDN, Config.AWS_S3_BUCKET_UPLOADS, Config.AWS_S3_BUCKET_STATIC].filter(
		(bucket): bucket is string => Boolean(bucket),
	),
);

const MAX_KEY_LENGTH = 1024;
// Printable ASCII plus nothing else: S3 object keys may technically contain
// wider Unicode, but our keys are generated server-side from Snowflake IDs and
// known prefixes, so rejecting non-printable bytes is safe and closes the
// null-byte / control-char smuggling vector.
const PRINTABLE_KEY = /^[\x20-\x7e]+$/;

export function assertAllowedBucket(bucket: string): void {
	if (!bucket || !ALLOWED_BUCKETS.has(bucket)) {
		throw new HTTPException(403, {message: 'Bucket is not allowed'});
	}
}

export function assertSafeS3Key(key: string): void {
	if (!key) {
		throw new HTTPException(400, {message: 'Invalid S3 key'});
	}

	// S3 keys are forward-slash-delimited object names, not filesystem paths,
	// but a leading slash or backslash can still confuse path-style endpoints
	// and MinIO routing. Reject them outright.
	if (key.startsWith('/') || key.startsWith('\\')) {
		throw new HTTPException(400, {message: 'Invalid S3 key'});
	}

	if (key.length > MAX_KEY_LENGTH) {
		throw new HTTPException(400, {message: 'Invalid S3 key'});
	}

	if (!PRINTABLE_KEY.test(key)) {
		throw new HTTPException(400, {message: 'Invalid S3 key'});
	}
}
