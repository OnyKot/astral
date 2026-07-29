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

import type {UserID} from '~/BrandedTypes';
import {fetchMany, fetchOne, upsertOne} from '~/database/Cassandra';
import type {PremiumWaitlistRow} from '~/database/types/PremiumWaitlistTypes';
import {PremiumWaitlist} from '~/Tables';

const FETCH_BY_USER = PremiumWaitlist.selectCql({
	where: PremiumWaitlist.where.eq('user_id'),
	limit: 1,
});

const FETCH_ALL = PremiumWaitlist.selectCql({});

export class PremiumWaitlistRepository {
	async findByUserId(userId: UserID): Promise<PremiumWaitlistRow | null> {
		return await fetchOne<PremiumWaitlistRow>(FETCH_BY_USER, {user_id: userId});
	}

	async upsert(row: PremiumWaitlistRow): Promise<PremiumWaitlistRow> {
		await upsertOne(PremiumWaitlist.insert(row));
		return row;
	}

	async listAll(): Promise<Array<PremiumWaitlistRow>> {
		return await fetchMany<PremiumWaitlistRow>(FETCH_ALL, {});
	}
}
