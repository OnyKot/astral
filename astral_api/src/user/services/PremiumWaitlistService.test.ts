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

import {beforeEach, describe, expect, it, vi} from 'vitest';
import {BillingOnlineError} from '~/errors/BillingOnlineError';
import {PremiumWaitlistNotFoundError} from '~/errors/PremiumWaitlistNotFoundError';
import {PremiumWaitlistService} from './PremiumWaitlistService';

const repo = {
	findByUserId: vi.fn(),
	upsert: vi.fn(),
	listAll: vi.fn(),
};

vi.mock('~/payments/BillingUtils', () => ({
	isBillingOnline: vi.fn(() => false),
}));

import {isBillingOnline} from '~/payments/BillingUtils';

describe('PremiumWaitlistService', () => {
	const service = new PremiumWaitlistService(repo as any);

	beforeEach(() => {
		vi.clearAllMocks();
		(isBillingOnline as any).mockReturnValue(false);
	});

	it('upserts a new entry when billing is offline', async () => {
		repo.findByUserId.mockResolvedValue(null);
		repo.upsert.mockImplementation(async (row: any) => row);
		const entry = await service.join(1n as any, {plan: 'monthly', comment: 'ready'});
		expect(entry.plan).toBe('monthly');
		expect(entry.comment).toBe('ready');
		expect(repo.upsert).toHaveBeenCalled();
	});

	it('preserves created_at on update', async () => {
		const created = new Date('2026-01-01T00:00:00Z');
		repo.findByUserId.mockResolvedValue({
			user_id: 1n,
			plan: 'monthly',
			comment: null,
			created_at: created,
			updated_at: created,
		});
		repo.upsert.mockImplementation(async (row: any) => row);
		const entry = await service.join(1n as any, {plan: 'yearly', comment: null});
		expect(entry.created_at).toBe(created);
		expect(entry.plan).toBe('yearly');
	});

	it('rejects join when billing is online', async () => {
		(isBillingOnline as any).mockReturnValue(true);
		await expect(service.join(1n as any, {plan: 'monthly'})).rejects.toBeInstanceOf(BillingOnlineError);
	});

	it('rejects comment longer than 500 chars', async () => {
		await expect(service.join(1n as any, {plan: 'monthly', comment: 'x'.repeat(501)})).rejects.toThrow();
	});

	it('get throws when missing', async () => {
		repo.findByUserId.mockResolvedValue(null);
		await expect(service.get(1n as any)).rejects.toBeInstanceOf(PremiumWaitlistNotFoundError);
	});
});
