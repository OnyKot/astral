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

import type Stripe from 'stripe';
import {createUserID, type UserID} from '~/BrandedTypes';
import {UserPremiumTypes} from '~/Constants';
import {
	AccessDeniedError,
	CannotRedeemPlutoniumWithVisionaryError,
	GiftCodeAlreadyRedeemedError,
	NoVisionarySlotsAvailableError,
	StripeError,
	UnknownGiftCodeError,
	UnknownUserError,
} from '~/Errors';
import type {ICacheService} from '~/infrastructure/ICacheService';
import type {IGatewayService} from '~/infrastructure/IGatewayService';
import {Logger} from '~/Logger';
import type {GiftCode, User} from '~/Models';
import type {IUserRepository} from '~/user/IUserRepository';
import {mapUserToPrivateResponse} from '~/user/UserModel';
import * as RandomUtils from '~/utils/RandomUtils';
import type {ProductInfo} from '../ProductRegistry';
import {ProductType} from '../ProductRegistry';
import type {StripeCheckoutService} from './StripeCheckoutService';
import type {StripePremiumService} from './StripePremiumService';
import type {StripeSubscriptionService} from './StripeSubscriptionService';

export class StripeGiftService {
	constructor(
		private stripe: Stripe | null,
		private userRepository: IUserRepository,
		private cacheService: ICacheService,
		private gatewayService: IGatewayService,
		private checkoutService: StripeCheckoutService,
		private premiumService: StripePremiumService,
		private subscriptionService: StripeSubscriptionService,
	) {}

	async getGiftCode(code: string): Promise<GiftCode> {
		const giftCode = await this.userRepository.findGiftCode(code);
		if (!giftCode) {
			throw new UnknownGiftCodeError();
		}
		return giftCode;
	}

	async redeemGiftCode(userId: UserID, code: string): Promise<void> {
		const appliedKey = `gift_redeem_applied:${code}`;

		if (await this.cacheService.get<boolean>(appliedKey)) {
			throw new GiftCodeAlreadyRedeemedError();
		}

		// Exclusive claim — get-then-set left a TOCTOU window where two redeemers
		// could both grant premium before either LWT won.
		const lockToken = await this.cacheService.acquireLock(`gift_redeem:${code}`, 60);
		if (!lockToken) {
			throw new StripeError('Gift code redemption in progress. Please try again in a moment.');
		}

		try {
			const giftCode = await this.userRepository.findGiftCode(code);
			if (!giftCode) {
				throw new UnknownGiftCodeError();
			}

			if (giftCode.redeemedByUserId) {
				await this.cacheService.set(appliedKey, 365 * 24 * 60 * 60);
				throw new GiftCodeAlreadyRedeemedError();
			}

			if (await this.cacheService.get<boolean>(`redeemed_gift_codes:${code}`)) {
				await this.cacheService.set(appliedKey, 365 * 24 * 60 * 60);
				throw new GiftCodeAlreadyRedeemedError();
			}

			const user = await this.userRepository.findUnique(userId);
			if (!user) {
				throw new UnknownUserError();
			}

			this.checkoutService.validateUserCanPurchase(user);

			if (user.premiumType === UserPremiumTypes.LIFETIME) {
				throw new CannotRedeemPlutoniumWithVisionaryError();
			}

			// Claim the gift atomically BEFORE any premium/slot side effects so a
			// losing concurrent redeemer cannot keep a granted entitlement.
			const redeemResult = await this.userRepository.redeemGiftCode(code, userId);
			if (!redeemResult.applied) {
				await this.cacheService.set(appliedKey, 365 * 24 * 60 * 60);
				throw new GiftCodeAlreadyRedeemedError();
			}

			const premiumType = giftCode.durationMonths === 0 ? UserPremiumTypes.LIFETIME : UserPremiumTypes.SUBSCRIPTION;
			if (premiumType === UserPremiumTypes.LIFETIME && user.stripeSubscriptionId && this.stripe) {
				await this.cancelStripeSubscriptionImmediately(user);
			}

			if (premiumType === UserPremiumTypes.SUBSCRIPTION && user.stripeSubscriptionId && this.stripe) {
				await this.subscriptionService.extendSubscriptionWithTrialPhase(user, giftCode.durationMonths, code);
			} else if (premiumType === UserPremiumTypes.LIFETIME && giftCode.visionarySequenceNumber != null) {
				const GIFT_CODE_SENTINEL_USER_ID = createUserID(-1n);
				await this.userRepository.unreserveVisionarySlot(giftCode.visionarySequenceNumber, GIFT_CODE_SENTINEL_USER_ID);
				await this.premiumService.grantPremiumFromGift(
					userId,
					premiumType,
					giftCode.durationMonths,
					giftCode.visionarySequenceNumber,
				);
				await this.userRepository.reserveVisionarySlot(giftCode.visionarySequenceNumber, userId);
			} else {
				await this.premiumService.grantPremium(userId, premiumType, giftCode.durationMonths, null, false);
			}

			await this.cacheService.set(`redeemed_gift_codes:${code}`, 300);
			await this.cacheService.set(appliedKey, 365 * 24 * 60 * 60);

			Logger.debug({userId, giftCode: code, durationMonths: giftCode.durationMonths}, 'Gift code redeemed');
		} finally {
			await this.cacheService.releaseLock(`gift_redeem:${code}`, lockToken);
		}
	}

	async getUserGifts(userId: UserID): Promise<Array<GiftCode>> {
		const gifts = await this.userRepository.findGiftCodesByCreator(userId);
		return gifts.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
	}

	async getReceivedGifts(userId: UserID): Promise<Array<GiftCode>> {
		const gifts = await this.userRepository.findGiftCodesByRedeemer(userId);
		return gifts.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
	}

	async sendGiftCode(senderUserId: UserID, recipientUserId: UserID, code: string): Promise<void> {
		const giftCode = await this.userRepository.findGiftCode(code);
		if (!giftCode) {
			throw new UnknownGiftCodeError();
		}
		if (giftCode.createdByUserId !== senderUserId) {
			throw new AccessDeniedError();
		}
		if (giftCode.redeemedByUserId) {
			throw new GiftCodeAlreadyRedeemedError();
		}
		await this.redeemGiftCode(recipientUserId, code);
	}

	async createGiftCode(
		checkoutSessionId: string,
		purchaser: User,
		productInfo: ProductInfo,
		paymentIntentId: string | null,
	): Promise<void> {
		const payment = await this.userRepository.getPaymentByCheckoutSession(checkoutSessionId);
		if (!payment) {
			Logger.error({checkoutSessionId}, 'Payment not found for gift code creation');
			return;
		}

		if (payment.giftCode) {
			Logger.debug({checkoutSessionId, code: payment.giftCode}, 'Gift code already exists for checkout session');
			return;
		}
		if (paymentIntentId) {
			const existingGift = await this.userRepository.findGiftCodeByPaymentIntent(paymentIntentId);
			if (existingGift) {
				await this.userRepository.linkGiftCodeToCheckoutSession(existingGift.code, checkoutSessionId);
				await this.userRepository.updatePayment({
					...payment.toRow(),
					gift_code: existingGift.code,
				});
				Logger.warn(
					{checkoutSessionId, paymentIntentId, code: existingGift.code},
					'Recovered existing gift code for checkout session',
				);
				return;
			}
		}

		const code = await this.generateUniqueGiftCode();
		let visionarySequenceNumber: number | null = null;

		if (productInfo.type === ProductType.GIFT_VISIONARY) {
			const allSlots = await this.userRepository.listVisionarySlots();
			const unreservedSlot = allSlots.sort((a, b) => a.slotIndex - b.slotIndex).find((slot) => !slot.isReserved());

			if (!unreservedSlot) {
				throw new NoVisionarySlotsAvailableError();
			} else {
				visionarySequenceNumber = unreservedSlot.slotIndex;
			}

			const GIFT_CODE_SENTINEL_USER_ID = createUserID(-1n);
			await this.userRepository.reserveVisionarySlot(visionarySequenceNumber, GIFT_CODE_SENTINEL_USER_ID);

			Logger.debug(
				{code, purchaserId: purchaser.id, sequenceNumber: visionarySequenceNumber},
				'Visionary sequence number allocated for gift',
			);
		}

		await this.userRepository.createGiftCode({
			code,
			duration_months: productInfo.durationMonths,
			created_at: new Date(),
			created_by_user_id: purchaser.id,
			redeemed_at: null,
			redeemed_by_user_id: null,
			stripe_payment_intent_id: paymentIntentId,
			visionary_sequence_number: visionarySequenceNumber,
			checkout_session_id: checkoutSessionId,
			version: 1,
			emoji: null,
			background: null,
		});

		await this.userRepository.linkGiftCodeToCheckoutSession(code, checkoutSessionId);

		await this.userRepository.updatePayment({
			...payment.toRow(),
			gift_code: code,
		});

		const updatedUser = await this.userRepository.patchUpsert(purchaser.id, {
			gift_inventory_server_seq: (purchaser.giftInventoryServerSeq ?? 0) + 1,
		});

		if (updatedUser) {
			await this.dispatchUser(updatedUser);
		}

		Logger.debug(
			{code, purchaserId: purchaser.id, durationMonths: productInfo.durationMonths, productType: productInfo.type},
			'Gift code created',
		);
	}

	private async generateUniqueGiftCode(): Promise<string> {
		let code: string;
		let exists = true;

		while (exists) {
			code = RandomUtils.randomString(32);
			const existing = await this.userRepository.findGiftCode(code);
			exists = !!existing;
		}

		return code!;
	}

	private async cancelStripeSubscriptionImmediately(user: User): Promise<void> {
		if (!this.stripe || !user.stripeSubscriptionId) return;
		await this.stripe.subscriptions.cancel(user.stripeSubscriptionId, {invoice_now: false, prorate: false});
		const updatedUser = await this.userRepository.patchUpsert(user.id, {
			stripe_subscription_id: null,
			premium_billing_cycle: null,
			premium_will_cancel: false,
		});
		if (updatedUser) await this.dispatchUser(updatedUser);
		Logger.debug({userId: user.id}, 'Canceled active subscription due to lifetime grant');
	}

	private async dispatchUser(user: User): Promise<void> {
		await this.gatewayService.dispatchPresence({
			userId: user.id,
			event: 'USER_UPDATE',
			data: mapUserToPrivateResponse(user),
		});
	}

	async updateGiftMetadata(userId: UserID, code: string, emoji: string | null, background: string | null): Promise<void> {
		const giftCode = await this.userRepository.findGiftCode(code);
		if (!giftCode) throw new UnknownGiftCodeError();
		if (giftCode.createdByUserId !== userId) throw new AccessDeniedError();
		await this.userRepository.updateGiftMetadata(code, emoji, background);
	}
}
