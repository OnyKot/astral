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

import {makeWorkerUtils, type WorkerUtils} from 'graphile-worker';
import {Config} from '~/Config';
import {Logger} from '~/Logger';
import type {IWorkerService, WorkerJobOptions, WorkerJobPayload} from './IWorkerService';

/*
 * `quickAddJob` builds a throwaway `pg.Pool`, runs the graphile-worker migration check and tears the
 * pool down again on every single call, so every enqueue paid a TCP connect + Postgres startup/auth
 * handshake + an extra round trip -- all awaited inside the request that sends a message.
 *
 * The state has to live at module scope, not on the instance: `ServiceMiddleware` constructs a new
 * `WorkerService` per request, so instance state would never be reused.
 */
let utilsPromise: Promise<WorkerUtils> | null = null;

const getWorkerUtils = (): Promise<WorkerUtils> => {
	if (utilsPromise == null) {
		const pending = makeWorkerUtils({connectionString: Config.postgres.url});
		utilsPromise = pending;
		// Never keep a poisoned promise cached: a Postgres outage at the first enqueue must not
		// disable the queue for the lifetime of the process. The rejection still reaches the caller
		// awaiting `pending`; this branch only clears the memo.
		void pending.catch(() => {
			if (utilsPromise === pending) {
				utilsPromise = null;
			}
		});
	}
	return utilsPromise;
};

export class WorkerService implements IWorkerService {
	async addJob<TPayload extends WorkerJobPayload = WorkerJobPayload>(
		taskType: string,
		payload: TPayload,
		options?: WorkerJobOptions,
	): Promise<void> {
		try {
			const utils = await getWorkerUtils();
			await utils.addJob(taskType, payload, options);
			Logger.debug({taskType, payload}, 'Job queued successfully');
		} catch (error) {
			Logger.error({error, taskType, payload}, 'Failed to queue job');
			throw error;
		}
	}
}
