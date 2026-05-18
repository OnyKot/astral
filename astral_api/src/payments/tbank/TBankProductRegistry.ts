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

import {Config} from '~/Config';
import {UserPremiumTypes} from '~/Constants';
import {ProductType} from '~/stripe/ProductRegistry';

export interface TBankProduct {
	priceId: string;
	type: ProductType;
	premiumType: 1 | 2;
	durationMonths: number;
	isGift: boolean;
	billingCycle?: 'monthly' | 'yearly';
	amountKopeks: number;
	description: string;
}

export class TBankProductRegistry {
	private products = new Map<string, TBankProduct>();

	constructor() {
		const prices = Config.tbank.prices;
		if (!prices) return;

		this.register({
			priceId: prices.monthlyId,
			type: ProductType.MONTHLY_SUBSCRIPTION,
			premiumType: UserPremiumTypes.SUBSCRIPTION,
			durationMonths: 1,
			isGift: false,
			billingCycle: 'monthly',
			amountKopeks: prices.monthlyAmountKopeks,
			description: 'Astral Premium Monthly',
		});

		this.register({
			priceId: prices.yearlyId,
			type: ProductType.YEARLY_SUBSCRIPTION,
			premiumType: UserPremiumTypes.SUBSCRIPTION,
			durationMonths: 12,
			isGift: false,
			billingCycle: 'yearly',
			amountKopeks: prices.yearlyAmountKopeks,
			description: 'Astral Premium Yearly',
		});

		this.register({
			priceId: prices.visionaryId,
			type: ProductType.VISIONARY_LIFETIME,
			premiumType: UserPremiumTypes.LIFETIME,
			durationMonths: 0,
			isGift: false,
			amountKopeks: prices.visionaryAmountKopeks,
			description: 'Astral Visionary Lifetime',
		});

		this.register({
			priceId: prices.giftVisionaryId,
			type: ProductType.VISIONARY_LIFETIME,
			premiumType: UserPremiumTypes.LIFETIME,
			durationMonths: 0,
			isGift: true,
			amountKopeks: prices.giftVisionaryAmountKopeks,
			description: 'Astral Visionary Lifetime Gift',
		});

		this.register({
			priceId: prices.gift1MonthId,
			type: ProductType.GIFT_1_MONTH,
			premiumType: UserPremiumTypes.SUBSCRIPTION,
			durationMonths: 1,
			isGift: true,
			amountKopeks: prices.gift1MonthAmountKopeks,
			description: 'Astral Premium 1 Month Gift',
		});

		this.register({
			priceId: prices.gift1YearId,
			type: ProductType.GIFT_1_YEAR,
			premiumType: UserPremiumTypes.SUBSCRIPTION,
			durationMonths: 12,
			isGift: true,
			amountKopeks: prices.gift1YearAmountKopeks,
			description: 'Astral Premium 1 Year Gift',
		});
	}

	private register(product: TBankProduct): void {
		this.products.set(product.priceId, product);
	}

	hasProduct(priceId: string): boolean {
		return this.products.has(priceId);
	}

	getProduct(priceId: string): TBankProduct | null {
		return this.products.get(priceId) ?? null;
	}

	getPriceIds(): {
		monthly: string | null;
		yearly: string | null;
		visionary: string | null;
		giftVisionary: string | null;
		gift1Month: string | null;
		gift1Year: string | null;
		currency: 'RUB';
	} {
		const prices = Config.tbank.prices;

		return {
			monthly: prices?.monthlyId ?? null,
			yearly: prices?.yearlyId ?? null,
			visionary: prices?.visionaryId ?? null,
			giftVisionary: prices?.giftVisionaryId ?? null,
			gift1Month: prices?.gift1MonthId ?? null,
			gift1Year: prices?.gift1YearId ?? null,
			currency: 'RUB',
		};
	}
}
