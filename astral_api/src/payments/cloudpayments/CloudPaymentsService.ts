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
import {Config} from '~/Config';
import {UserPremiumTypes} from '~/Constants';
import {
	CloudPaymentsError,
	CloudPaymentsNotificationSignatureInvalidError,
	NoVisionarySlotsAvailableError,
	UnknownUserError,
} from '~/Errors';
import type {IGuildRepository} from '~/guild/IGuildRepository';
import type {GuildService} from '~/guild/services/GuildService';
import type {ICacheService} from '~/infrastructure/ICacheService';
import type {IGatewayService} from '~/infrastructure/IGatewayService';
import type {SnowflakeService} from '~/infrastructure/SnowflakeService';
import {Logger} from '~/Logger';
import {ProductRegistry} from '~/stripe/ProductRegistry';
import {StripeCheckoutService} from '~/stripe/services/StripeCheckoutService';
import {StripeGiftService} from '~/stripe/services/StripeGiftService';
import {StripePremiumService} from '~/stripe/services/StripePremiumService';
import {StripeSubscriptionService} from '~/stripe/services/StripeSubscriptionService';
import type {IUserRepository} from '~/user/IUserRepository';
import {verifyCloudPaymentsBodyHmacBase64} from './CloudPaymentsSignature';
import {CloudPaymentsProductRegistry} from './CloudPaymentsProductRegistry';

interface CreateCheckoutSessionParams {
	userId: UserID;
	priceId: string;
	isGift: boolean;
}

interface CloudPaymentsResponseBase {
	Success?: boolean;
	Message?: string;
	Model?: Record<string, unknown> | null;
}

const SUCCESS_STATUSES = new Set(['COMPLETED']);
const FAILURE_STATUSES = new Set(['DECLINED', 'CANCELLED', 'REJECTED', 'REFUNDED', 'FAILED']);

function trimTrailingSlash(value: string): string {
	if (value.length > 1 && value.endsWith('/')) {
		return trimTrailingSlash(value.slice(0, -1));
	}
	return value;
}

function coerceString(value: unknown): string | null {
	if (typeof value === 'string' && value.trim() !== '') return value.trim();
	if (typeof value === 'number' && Number.isFinite(value)) return String(value);
	return null;
}

function coerceNumber(value: unknown): number | null {
	if (typeof value === 'number' && Number.isFinite(value)) return value;
	if (typeof value === 'string' && value.trim() !== '') {
		const parsed = Number(value);
		return Number.isFinite(parsed) ? parsed : null;
	}
	return null;
}

function amountRubToKopeks(amountRub: number | null): number | null {
	if (amountRub == null) return null;
	return Math.round(amountRub * 100);
}

export class CloudPaymentsService {
	private readonly productRegistry = new CloudPaymentsProductRegistry();
	private readonly validationCheckoutService: StripeCheckoutService;
	private readonly premiumService: StripePremiumService;
	private readonly subscriptionService: StripeSubscriptionService;
	private readonly giftService: StripeGiftService;

	constructor(
		private readonly userRepository: IUserRepository,
		private readonly cacheService: ICacheService,
		private readonly gatewayService: IGatewayService,
		private readonly guildRepository: IGuildRepository,
		private readonly guildService: GuildService,
		private readonly snowflakeService: SnowflakeService,
	) {
		this.validationCheckoutService = new StripeCheckoutService(null, this.userRepository, new ProductRegistry());
		this.premiumService = new StripePremiumService(
			this.userRepository,
			this.gatewayService,
			this.guildRepository,
			this.guildService,
		);
		this.subscriptionService = new StripeSubscriptionService(
			null,
			this.userRepository,
			this.cacheService,
			this.gatewayService,
		);
		this.giftService = new StripeGiftService(
			null,
			this.userRepository,
			this.cacheService,
			this.gatewayService,
			this.validationCheckoutService,
			this.premiumService,
			this.subscriptionService,
		);
	}

	isConfigured(): boolean {
		return !!(Config.cloudpayments.enabled && Config.cloudpayments.publicId && Config.cloudpayments.apiSecret);
	}

	supportsPriceId(priceId: string): boolean {
		return this.productRegistry.hasProduct(priceId);
	}

	isCountrySupported(countryCode: string | null | undefined): boolean {
		if (!countryCode) return true;
		return countryCode.toUpperCase() === 'RU';
	}

	getPriceIds() {
		return this.productRegistry.getPriceIds();
	}

	async createCheckoutSession({userId, priceId, isGift}: CreateCheckoutSessionParams): Promise<string> {
		const {publicId, apiSecret} = this.requireCredentials();

		const product = this.productRegistry.getProduct(priceId);
		if (!product) {
			throw new CloudPaymentsError('Invalid product selection');
		}
		if (product.isGift !== isGift) {
			throw new CloudPaymentsError('Invalid product configuration');
		}

		const user = await this.userRepository.findUnique(userId);
		if (!user) {
			throw new UnknownUserError();
		}

		this.validationCheckoutService.validateUserCanPurchase(user);

		if (!isGift && product.premiumType === UserPremiumTypes.LIFETIME) {
			const unreservedSlots = (await this.userRepository.listVisionarySlots()).filter((slot) => !slot.isReserved());
			if (unreservedSlots.length === 0) {
				throw new NoVisionarySlotsAvailableError();
			}
		}

		const orderId = `cp_${this.snowflakeService.generate().toString()}`;
		const createdAt = new Date();

		await this.userRepository.createPayment({
			checkout_session_id: orderId,
			user_id: userId,
			price_id: priceId,
			product_type: product.type,
			status: 'pending',
			is_gift: isGift,
			created_at: createdAt,
		});

		const amountRub = product.amountKopeks / 100;
		const createOrderPayload: Record<string, unknown> = {
			Amount: amountRub,
			Currency: 'RUB',
			Description: product.description,
			InvoiceId: orderId,
			AccountId: userId.toString(),
			Email: user.email ?? undefined,
			SuccessRedirectUrl:
				Config.cloudpayments.successUrl ?? `${Config.endpoints.webApp}/premium-callback?status=success`,
			FailRedirectUrl:
				Config.cloudpayments.failUrl ?? `${Config.endpoints.webApp}/premium-callback?status=cancel`,
			NotificationUrl:
				Config.cloudpayments.notificationUrl ??
				`${Config.endpoints.apiPublic}/payments/cloudpayments/notification`,
			JsonData: {
				user_id: userId.toString(),
				price_id: priceId,
				is_gift: isGift ? '1' : '0',
			},
		};

		const createOrderResponse = await this.callApi<CloudPaymentsResponseBase>(
			'orders/create',
			createOrderPayload,
			publicId,
			apiSecret,
		);

		if (!createOrderResponse.Success) {
			await this.userRepository.updatePayment({
				checkout_session_id: orderId,
				status: 'failed',
			});
			throw new CloudPaymentsError(this.extractApiErrorMessage(createOrderResponse, 'Failed to create payment order'));
		}

		const model = createOrderResponse.Model ?? {};
		const paymentUrl = coerceString(model.Url) ?? coerceString(model.url);
		if (!paymentUrl) {
			await this.userRepository.updatePayment({
				checkout_session_id: orderId,
				status: 'failed',
			});
			throw new CloudPaymentsError('CloudPayments did not return payment URL');
		}

		await this.userRepository.updatePayment({
			checkout_session_id: orderId,
			payment_intent_id: coerceString(model.Id) ?? orderId,
			amount_cents: product.amountKopeks,
			currency: 'RUB',
		});

		Logger.info(
			{
				userId,
				orderId,
				paymentId: coerceString(model.Id),
				priceId,
				isGift,
			},
			'CloudPayments checkout session created',
		);

		return paymentUrl;
	}

	async handleNotification(payload: Record<string, unknown>, rawBody: string, signatureHeader: string | null): Promise<void> {
		const {apiSecret} = this.requireCredentials();
		if (!signatureHeader || !verifyCloudPaymentsBodyHmacBase64(rawBody, signatureHeader, apiSecret)) {
			throw new CloudPaymentsNotificationSignatureInvalidError();
		}

		const orderId = coerceString(payload.InvoiceId);
		if (!orderId) {
			Logger.warn({payloadKeys: Object.keys(payload)}, 'CloudPayments notification missing InvoiceId');
			return;
		}

		const paymentId = coerceString(payload.TransactionId);
		const status = coerceString(payload.Status)?.toUpperCase() ?? null;
		const amountKopeks = amountRubToKopeks(coerceNumber(payload.Amount));
		const currency = coerceString(payload.Currency)?.toUpperCase() ?? null;
		const accountId = coerceString(payload.AccountId);

		await this.reconcilePaymentState({
			orderId,
			paymentId,
			status,
			amountKopeks,
			currency,
			accountId,
			source: 'notification',
		});
	}

	async reconcileOrder(orderId: string): Promise<void> {
		const payment = await this.userRepository.getPaymentByCheckoutSession(orderId);
		if (!payment) {
			throw new CloudPaymentsError('Payment not found', 404);
		}
	}

	async reconcileOrderForUser(userId: UserID, orderId: string): Promise<void> {
		const payment = await this.userRepository.getPaymentByCheckoutSession(orderId);
		if (!payment || payment.userId !== userId) {
			throw new CloudPaymentsError('Payment not found', 404);
		}
		await this.reconcileOrder(orderId);
	}

	private async reconcilePaymentState({
		orderId,
		paymentId,
		status,
		amountKopeks,
		currency,
		accountId,
		source,
	}: {
		orderId: string;
		paymentId: string | null;
		status: string | null;
		amountKopeks: number | null;
		currency: string | null;
		accountId: string | null;
		source: 'notification' | 'reconcile';
	}): Promise<void> {
		const payment = await this.userRepository.getPaymentByCheckoutSession(orderId);
		if (!payment) {
			Logger.warn({orderId, source}, 'CloudPayments payment not found in local store');
			return;
		}

		if (payment.status === 'completed' || payment.status === 'failed' || payment.status === 'refunded') {
			return;
		}

		if (!status) {
			Logger.warn({orderId, source}, 'CloudPayments payment status missing');
			return;
		}

		if (FAILURE_STATUSES.has(status)) {
			await this.userRepository.updatePayment({
				checkout_session_id: orderId,
				status: 'failed',
				payment_intent_id: paymentId ?? undefined,
				amount_cents: amountKopeks ?? undefined,
				currency: 'RUB',
			});
			Logger.info({orderId, paymentId, status, source}, 'CloudPayments payment marked as failed');
			return;
		}

		if (!SUCCESS_STATUSES.has(status)) {
			if (paymentId || amountKopeks != null) {
				await this.userRepository.updatePayment({
					checkout_session_id: orderId,
					payment_intent_id: paymentId ?? undefined,
					amount_cents: amountKopeks ?? undefined,
					currency: 'RUB',
				});
			}
			Logger.debug({orderId, paymentId, status, source}, 'CloudPayments payment still pending');
			return;
		}

		const lockToken = await this.cacheService.acquireLock(`cloudpayments:finalize:${orderId}`, 60);
		if (!lockToken) {
			Logger.debug({orderId}, 'Skipped CloudPayments finalization due to active lock');
			return;
		}

		try {
			const currentPayment = await this.userRepository.getPaymentByCheckoutSession(orderId);
			if (!currentPayment || currentPayment.status === 'completed') {
				return;
			}

			const product = currentPayment.priceId ? this.productRegistry.getProduct(currentPayment.priceId) : null;
			if (!product) {
				throw new CloudPaymentsError('Unknown CloudPayments product');
			}


			if (amountKopeks !== product.amountKopeks || currency !== 'RUB' || accountId !== currentPayment.userId.toString()) {
				await this.userRepository.updatePayment({
					checkout_session_id: orderId,
					status: 'failed',
					payment_intent_id: paymentId ?? undefined,
					amount_cents: amountKopeks ?? undefined,
					currency: currency ?? undefined,
				});
				Logger.warn(
					{orderId, paymentId, status, source, amountKopeks, currency, accountId, expectedAmountKopeks: product.amountKopeks, expectedAccountId: currentPayment.userId.toString()},
					'CloudPayments notification validation failed for payment finalization',
				);
				return;
			}

			const user = await this.userRepository.findUnique(currentPayment.userId);
			if (!user) {
				throw new UnknownUserError();
			}

			if (currentPayment.isGift) {
				await this.giftService.createGiftCode(orderId, user, product, paymentId);
				await this.userRepository.patchUpsert(currentPayment.userId, {
					has_ever_purchased: true,
				});
			} else {
				await this.premiumService.grantPremium(
					currentPayment.userId,
					product.premiumType,
					product.durationMonths,
					product.billingCycle ?? null,
					true,
				);
			}

			await this.userRepository.updatePayment({
				checkout_session_id: orderId,
				status: 'completed',
				completed_at: currentPayment.completedAt ?? new Date(),
				payment_intent_id: paymentId ?? undefined,
				amount_cents: amountKopeks ?? product.amountKopeks,
				currency: 'RUB',
			});

			Logger.info(
				{
					orderId,
					paymentId,
					status,
					source,
					userId: currentPayment.userId,
					productType: product.type,
					isGift: currentPayment.isGift,
				},
				'CloudPayments payment finalized successfully',
			);
		} finally {
			await this.cacheService.releaseLock(`cloudpayments:finalize:${orderId}`, lockToken);
		}
	}

	private requireCredentials(): {publicId: string; apiSecret: string} {
		if (!this.isConfigured()) {
			throw new CloudPaymentsError('CloudPayments provider is not configured');
		}

		return {
			publicId: Config.cloudpayments.publicId!,
			apiSecret: Config.cloudpayments.apiSecret!,
		};
	}

	private async callApi<TResponse>(
		method: string,
		payload: Record<string, unknown>,
		publicId: string,
		apiSecret: string,
	): Promise<TResponse> {
		const endpoint = `${trimTrailingSlash(Config.cloudpayments.apiUrl)}/${method}`;
		const auth = Buffer.from(`${publicId}:${apiSecret}`).toString('base64');

		let response: Response;
		try {
			response = await fetch(endpoint, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Authorization: `Basic ${auth}`,
				},
				body: JSON.stringify(payload),
			});
		} catch (error: unknown) {
			Logger.error({error, method}, 'CloudPayments request failed');
			throw new CloudPaymentsError('Unable to reach CloudPayments API');
		}

		let body: unknown = null;
		try {
			body = await response.json();
		} catch {
			body = null;
		}

		if (!response.ok) {
			Logger.error({method, status: response.status, body}, 'CloudPayments API returned non-200 response');
			throw new CloudPaymentsError(`CloudPayments API responded with HTTP ${response.status}`);
		}

		return (body ?? {}) as TResponse;
	}

	private extractApiErrorMessage(response: CloudPaymentsResponseBase, fallback: string): string {
		return coerceString(response.Message) ?? fallback;
	}
}

