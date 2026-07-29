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

export enum BucketScanDirection {
	Asc = 'asc',
	Desc = 'desc',
}

export enum BucketScanTraceKind {
	Start = 'start',
	ListBucketsFromIndex = 'listBucketsFromIndex',
	ProcessBucket = 'processBucket',
	FetchBucket = 'fetchBucket',
	MarkBucketEmpty = 'markBucketEmpty',
	TouchBucket = 'touchBucket',
	StopAfterBucketReached = 'stopAfterBucketReached',
	Complete = 'complete',
}

export interface BucketScanTraceEvent {
	kind: BucketScanTraceKind;
	minBucket: number;
	maxBucket: number;
	limit: number;
	direction: BucketScanDirection;
	bucket?: number;
	remaining?: number;
	indexQuery?: {minBucket: number; maxBucket: number; limit: number};
	indexResult?: Array<number>;
	fetchResult?: {rowCount: number; unbounded: boolean};
}

export interface BucketScanIndexQuery {
	minBucket: number;
	maxBucket: number;
	limit: number;
}

export interface BucketScanBucketFetchResult<Row> {
	rows: Array<Row>;
	unbounded: boolean;
}

export interface BucketScanDeps<Row> {
	listBucketsFromIndex: (query: BucketScanIndexQuery) => Promise<Array<number>>;
	fetchRowsForBucket: (bucket: number, limit: number) => Promise<BucketScanBucketFetchResult<Row>>;
	getRowId: (row: Row) => bigint;
	onEmptyUnboundedBucket?: (bucket: number) => Promise<void>;
	onBucketHasRows?: (bucket: number) => Promise<void>;
	trace?: (event: BucketScanTraceEvent) => void;
}

export interface BucketScanOptions {
	minBucket: number;
	maxBucket: number;
	limit: number;
	direction: BucketScanDirection;
	indexPageSize: number;
	stopAfterBucket?: number;
	/**
	 * Buckets a negative index already proved empty. Without this an
	 * under-filled page walks (and re-marks) every empty bucket back to the
	 * start of the range one round trip at a time.
	 */
	skipBuckets?: ReadonlySet<number>;
}

export interface BucketScanResult<Row> {
	rows: Array<Row>;
}

export async function scanBucketsWithIndex<Row>(
	deps: BucketScanDeps<Row>,
	opts: BucketScanOptions,
): Promise<BucketScanResult<Row>> {
	const trace = deps.trace;
	trace?.({
		kind: BucketScanTraceKind.Start,
		minBucket: opts.minBucket,
		maxBucket: opts.maxBucket,
		limit: opts.limit,
		direction: opts.direction,
	});

	if (opts.limit <= 0) {
		trace?.({
			kind: BucketScanTraceKind.Complete,
			minBucket: opts.minBucket,
			maxBucket: opts.maxBucket,
			limit: opts.limit,
			direction: opts.direction,
		});
		return {rows: []};
	}

	let remaining = opts.limit;
	const out: Array<Row> = [];
	const seenRowIds = new Set<bigint>();
	const processedBuckets = new Set<number>();

	const applyFetchedBucket = async (
		bucket: number,
		fetchResult: BucketScanBucketFetchResult<Row>,
	) => {
		trace?.({
			kind: BucketScanTraceKind.ProcessBucket,
			minBucket: opts.minBucket,
			maxBucket: opts.maxBucket,
			limit: opts.limit,
			direction: opts.direction,
			bucket,
			remaining,
		});

		const {rows, unbounded} = fetchResult;
		trace?.({
			kind: BucketScanTraceKind.FetchBucket,
			minBucket: opts.minBucket,
			maxBucket: opts.maxBucket,
			limit: opts.limit,
			direction: opts.direction,
			bucket,
			remaining,
			fetchResult: {rowCount: rows.length, unbounded},
		});

		if (rows.length === 0) {
			if (unbounded && deps.onEmptyUnboundedBucket) {
				trace?.({
					kind: BucketScanTraceKind.MarkBucketEmpty,
					minBucket: opts.minBucket,
					maxBucket: opts.maxBucket,
					limit: opts.limit,
					direction: opts.direction,
					bucket,
					remaining,
				});
				await deps.onEmptyUnboundedBucket(bucket);
			}
			return;
		}

		if (deps.onBucketHasRows) {
			trace?.({
				kind: BucketScanTraceKind.TouchBucket,
				minBucket: opts.minBucket,
				maxBucket: opts.maxBucket,
				limit: opts.limit,
				direction: opts.direction,
				bucket,
				remaining,
			});
			await deps.onBucketHasRows(bucket);
		}

		for (const row of rows) {
			if (remaining <= 0) break;
			const rowId = deps.getRowId(row);
			if (seenRowIds.has(rowId)) continue;
			seenRowIds.add(rowId);
			out.push(row);
			remaining--;
		}
	};

	// Fetch a small window of buckets in parallel, then apply in order so
	// remaining/limit semantics stay identical to the sequential scan.
	const BUCKET_FETCH_CONCURRENCY = 4;
	const processBucketsParallel = async (bucketBatch: Array<number>) => {
		if (bucketBatch.length === 0 || remaining <= 0) {
			return;
		}
		const fetchLimit = remaining;
		const fetched = await Promise.all(
			bucketBatch.map(async (bucket) => ({
				bucket,
				result: await deps.fetchRowsForBucket(bucket, fetchLimit),
			})),
		);
		for (const {bucket, result} of fetched) {
			if (remaining <= 0) break;
			await applyFetchedBucket(bucket, result);
		}
	};

	const stopAfterBucket = typeof opts.stopAfterBucket === 'number' ? opts.stopAfterBucket : null;
	const shouldStopAfterBucket = (bucket: number) => stopAfterBucket !== null && bucket === stopAfterBucket;
	const skipBuckets = opts.skipBuckets;

	const drainBuckets = async (
		bucketCandidates: Iterable<number>,
		/*
		 * Only the numeric fallback may consult the negative index. A bucket that
		 * came out of the positive index is by definition a bucket that holds
		 * messages, so skipping it buys nothing — and it would drop a message
		 * whenever the two indexes briefly disagree: `upsertMessage` clears the
		 * empty marker and adds the positive entry in one batch, and a Cassandra
		 * batch is not isolated, so a reader can observe the new positive entry
		 * while still holding a stale empty marker.
		 */
		useSkipSet: boolean,
	): Promise<number | null> => {
		let batch: Array<number> = [];
		let stopBucket: number | null = null;

		const flush = async () => {
			if (batch.length === 0) return;
			await processBucketsParallel(batch);
			batch = [];
		};

		for (const bucket of bucketCandidates) {
			if (remaining <= 0) break;
			if (bucket < opts.minBucket || bucket > opts.maxBucket) continue;
			if (processedBuckets.has(bucket)) continue;
			processedBuckets.add(bucket);
			if (useSkipSet && skipBuckets?.has(bucket)) {
				// A known-empty bucket yields nothing for any query shape, so the
				// fetch is pure cost. stopAfterBucket must still fire: the caller's
				// range restriction cannot widen just because its boundary is empty.
				if (shouldStopAfterBucket(bucket)) {
					stopBucket = bucket;
					await flush();
					return stopBucket;
				}
				continue;
			}
			batch.push(bucket);
			if (shouldStopAfterBucket(bucket)) {
				stopBucket = bucket;
				await flush();
				return stopBucket;
			}
			if (batch.length >= BUCKET_FETCH_CONCURRENCY) {
				await flush();
			}
		}
		await flush();
		return stopBucket;
	};

	if (opts.direction === BucketScanDirection.Desc) {
		let cursorMax: number | null = opts.maxBucket;

		while (remaining > 0 && cursorMax !== null && cursorMax >= opts.minBucket) {
			const query: BucketScanIndexQuery = {
				minBucket: opts.minBucket,
				maxBucket: cursorMax,
				limit: opts.indexPageSize,
			};

			trace?.({
				kind: BucketScanTraceKind.ListBucketsFromIndex,
				minBucket: opts.minBucket,
				maxBucket: opts.maxBucket,
				limit: opts.limit,
				direction: opts.direction,
				indexQuery: query,
			});

			const buckets = await deps.listBucketsFromIndex(query);
			trace?.({
				kind: BucketScanTraceKind.ListBucketsFromIndex,
				minBucket: opts.minBucket,
				maxBucket: opts.maxBucket,
				limit: opts.limit,
				direction: opts.direction,
				indexQuery: query,
				indexResult: buckets,
			});

			if (buckets.length === 0) break;

			const stopBucket = await drainBuckets(buckets, false);
			if (stopBucket !== null) {
				trace?.({
					kind: BucketScanTraceKind.StopAfterBucketReached,
					minBucket: opts.minBucket,
					maxBucket: opts.maxBucket,
					limit: opts.limit,
					direction: opts.direction,
					bucket: stopBucket,
					remaining,
				});
				return {rows: out};
			}

			const last = buckets[buckets.length - 1];
			const nextCursor = last - 1;
			cursorMax = nextCursor >= opts.minBucket ? nextCursor : null;
		}

		if (remaining > 0) {
			const fallbackBuckets: Array<number> = [];
			for (let bucket = opts.maxBucket; bucket >= opts.minBucket; bucket--) {
				fallbackBuckets.push(bucket);
			}
			const stopBucket = await drainBuckets(fallbackBuckets, true);
			if (stopBucket !== null) {
				trace?.({
					kind: BucketScanTraceKind.StopAfterBucketReached,
					minBucket: opts.minBucket,
					maxBucket: opts.maxBucket,
					limit: opts.limit,
					direction: opts.direction,
					bucket: stopBucket,
					remaining,
				});
				return {rows: out};
			}
		}
	} else {
		let cursorMin: number | null = opts.minBucket;

		while (remaining > 0 && cursorMin !== null && cursorMin <= opts.maxBucket) {
			const query: BucketScanIndexQuery = {
				minBucket: cursorMin,
				maxBucket: opts.maxBucket,
				limit: opts.indexPageSize,
			};

			trace?.({
				kind: BucketScanTraceKind.ListBucketsFromIndex,
				minBucket: opts.minBucket,
				maxBucket: opts.maxBucket,
				limit: opts.limit,
				direction: opts.direction,
				indexQuery: query,
			});

			const buckets = await deps.listBucketsFromIndex(query);
			trace?.({
				kind: BucketScanTraceKind.ListBucketsFromIndex,
				minBucket: opts.minBucket,
				maxBucket: opts.maxBucket,
				limit: opts.limit,
				direction: opts.direction,
				indexQuery: query,
				indexResult: buckets,
			});

			if (buckets.length === 0) break;

			const stopBucket = await drainBuckets(buckets, false);
			if (stopBucket !== null) {
				trace?.({
					kind: BucketScanTraceKind.StopAfterBucketReached,
					minBucket: opts.minBucket,
					maxBucket: opts.maxBucket,
					limit: opts.limit,
					direction: opts.direction,
					bucket: stopBucket,
					remaining,
				});
				return {rows: out};
			}

			const last = buckets[buckets.length - 1];
			const nextCursor = last + 1;
			cursorMin = nextCursor <= opts.maxBucket ? nextCursor : null;
		}

		if (remaining > 0) {
			const fallbackBuckets: Array<number> = [];
			for (let bucket = opts.minBucket; bucket <= opts.maxBucket; bucket++) {
				fallbackBuckets.push(bucket);
			}
			const stopBucket = await drainBuckets(fallbackBuckets, true);
			if (stopBucket !== null) {
				trace?.({
					kind: BucketScanTraceKind.StopAfterBucketReached,
					minBucket: opts.minBucket,
					maxBucket: opts.maxBucket,
					limit: opts.limit,
					direction: opts.direction,
					bucket: stopBucket,
					remaining,
				});
				return {rows: out};
			}
		}
	}

	trace?.({
		kind: BucketScanTraceKind.Complete,
		minBucket: opts.minBucket,
		maxBucket: opts.maxBucket,
		limit: opts.limit,
		direction: opts.direction,
	});

	return {rows: out};
}
