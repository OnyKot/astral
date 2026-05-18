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

import {UserPremiumTypes} from '~/Constants';
import {describe, expect, it, vi} from 'vitest';
import {WataService} from './WataService';

function createService() {
	const userRepository = {
		getPaymentByCheckoutSession: vi.fn(),
		updatePayment: vi.fn(),
		findUnique: vi.fn(),
		patchUpsert: vi.fn(),
		listVisionarySlots: vi.fn(),
		createPayment: vi.fn(),
	};
	const cacheService = {
		acquireLock: vi.fn(),
		releaseLock: vi.fn(),
	};

	const service = new WataService(
		userRepository as any,
		cacheService as any,
		{} as any,
		{} as any,
		{} as any,
		{generate: vi.fn()} as any,
	) as any;

	return {service, userRepository, cacheService};
}

describe('WataService', () => {
	it('uses transactionStatus from the official webhook payload', async () => {
		const {service} = createService();
		service.verifyNotification = vi.fn().mockResolvedValue(undefined);
		service.reconcilePaymentState = vi.fn().mockResolvedValue(undefined);

		await service.handleNotification(
			{
				orderId: 'wata_1',
				transactionId: 'tx_1',
				transactionStatus: 'Paid',
				amount: 1188,
			},
			'{"orderId":"wata_1"}',
			'signature',
		);

		expect(service.reconcilePaymentState).toHaveBeenCalledWith({
			orderId: 'wata_1',
			paymentId: 'tx_1',
			status: 'PAID',
			amountKopeks: 118800,
			source: 'notification',
		});
	});

	it('reconciles a paid transaction by orderId when webhook delivery is delayed', async () => {
		const {service, userRepository, cacheService} = createService();
		let currentPayment: any = {
			checkoutSessionId: 'wata_1',
			status: 'pending',
			paymentIntentId: null,
			priceId: 'wata_monthly_rub',
			isGift: false,
			userId: 'user_1',
			completedAt: null,
		};

		userRepository.getPaymentByCheckoutSession.mockImplementation(async () => currentPayment);
		userRepository.findUnique.mockResolvedValue({id: 'user_1'});
		userRepository.updatePayment.mockImplementation(async (patch: Record<string, unknown>) => {
			currentPayment = {
				...currentPayment,
				status: (patch.status as string | undefined) ?? currentPayment.status,
				paymentIntentId: (patch.payment_intent_id as string | undefined) ?? currentPayment.paymentIntentId,
				completedAt: (patch.completed_at as Date | null | undefined) ?? currentPayment.completedAt,
			};
		});
		cacheService.acquireLock.mockResolvedValue('lock-token');
		cacheService.releaseLock.mockResolvedValue(undefined);

		service.callApi = vi.fn().mockResolvedValue({
			items: [
				{
					id: 'tx_1',
					orderId: 'wata_1',
					status: 'Paid',
					amount: 490,
				},
			],
		});
		service.productRegistry = {
			getProduct: vi.fn().mockReturnValue({
				priceId: 'wata_monthly_rub',
				type: 1,
				premiumType: UserPremiumTypes.SUBSCRIPTION,
				durationMonths: 1,
				isGift: false,
				billingCycle: 'monthly',
				amountKopeks: 49000,
				description: 'Astral Premium Monthly',
			}),
		};
		service.premiumService = {
			grantPremium: vi.fn().mockResolvedValue(undefined),
		};
		service.giftService = {
			createGiftCode: vi.fn().mockResolvedValue(undefined),
		};

		const result = await service.reconcileOrder('wata_1');

		expect(service.callApi).toHaveBeenCalledWith(
			expect.stringContaining('transactions/?orderId=wata_1'),
			'GET',
		);
		expect(service.premiumService.grantPremium).toHaveBeenCalledWith('user_1', UserPremiumTypes.SUBSCRIPTION, 1, 'monthly', true);
		expect(result).toBe('completed');
		expect(currentPayment.status).toBe('completed');
	});
});
