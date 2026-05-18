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
	IntellectMoneyError,
	IntellectMoneyNotificationSignatureInvalidError,
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
import {buildIntellectMoneySha256Hex, verifyIntellectMoneySha256Hex} from './IntellectMoneySignature';
import {IntellectMoneyProductRegistry} from './IntellectMoneyProductRegistry';

interface CreateCheckoutSessionParams {
	userId: UserID;
	priceId: string;
	isGift: boolean;
}

interface IntellectMoneyResponse<TModel extends Record<string, unknown> | null = Record<string, unknown> | null> {
	success?: boolean;
	message?: string;
	code?: string | number;
	data?: TModel;
	model?: TModel;
	error?: string;
}

const SUCCESS_STATUSES = new Set(['SUCCESS', 'PAID', 'COMPLETED', 'ACCEPTED', 'CONFIRMED']);
const FAILURE_STATUSES = new Set(['FAILED', 'CANCELED', 'CANCELLED', 'REJECTED', 'DECLINED', 'EXPIRED']);

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

function amountKopeksToRubString(amountKopeks: number): string {
	return (amountKopeks / 100).toFixed(2);
}

function amountRubToKopeks(amountRub: number | null): number | null {
	if (amountRub == null) return null;
	return Math.round(amountRub * 100);
}

export class IntellectMoneyService {
	private readonly productRegistry = new IntellectMoneyProductRegistry();
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
		return !!(
			Config.intellectmoney.enabled &&
			Config.intellectmoney.eshopId &&
			Config.intellectmoney.apiToken &&
			Config.intellectmoney.signingKey &&
			Config.intellectmoney.notificationSecret
		);
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
		const {eshopId} = this.requireCredentials();

		const product = this.productRegistry.getProduct(priceId);
		if (!product) {
			throw new IntellectMoneyError('Invalid product selection');
		}
		if (product.isGift !== isGift) {
			throw new IntellectMoneyError('Invalid product configuration');
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

		const orderId = `im_${this.snowflakeService.generate().toString()}`;
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

		const payload: Record<string, unknown> = {
			eshopId,
			orderId,
			serviceName: product.description,
			recipientAmount: amountKopeksToRubString(product.amountKopeks),
			recipientCurrency: 'RUB',
			userName: user.username,
			email: user.email ?? '',
			successUrl: Config.intellectmoney.successUrl ?? `${Config.endpoints.webApp}/premium-callback?status=success`,
			failUrl: Config.intellectmoney.failUrl ?? `${Config.endpoints.webApp}/premium-callback?status=cancel`,
			backUrl: Config.endpoints.webApp,
			resultUrl:
				Config.intellectmoney.notificationUrl ??
				`${Config.endpoints.apiPublic}/payments/intellectmoney/notification`,
			jsonData: JSON.stringify({
				user_id: userId.toString(),
				price_id: priceId,
				is_gift: isGift ? '1' : '0',
			}),
		};

		const response = await this.callApi<IntellectMoneyResponse>('merchant/createInvoice', payload, ['createInvoice']);
		if (!this.isSuccessResponse(response)) {
			await this.userRepository.updatePayment({
				checkout_session_id: orderId,
				status: 'failed',
			});
			throw new IntellectMoneyError(this.extractApiErrorMessage(response, 'Failed to create payment order'));
		}

		const model = (response.data ?? response.model ?? {}) as Record<string, unknown>;
		const paymentUrl =
			coerceString(model.paymentUrl) ??
			coerceString(model.PaymentUrl) ??
			coerceString(model.url) ??
			coerceString(model.Url) ??
			coerceString(model.redirectUrl) ??
			coerceString(model.RedirectUrl);

		if (!paymentUrl) {
			await this.userRepository.updatePayment({
				checkout_session_id: orderId,
				status: 'failed',
			});
			throw new IntellectMoneyError('IntellectMoney did not return payment URL');
		}

		const paymentId =
			coerceString(model.invoiceId) ??
			coerceString(model.InvoiceId) ??
			coerceString(model.purchaseId) ??
			orderId;

		await this.userRepository.updatePayment({
			checkout_session_id: orderId,
			payment_intent_id: paymentId,
			amount_cents: product.amountKopeks,
			currency: 'RUB',
		});

		Logger.info(
			{
				userId,
				orderId,
				paymentId,
				priceId,
				isGift,
			},
			'IntellectMoney checkout session created',
		);

		return paymentUrl;
	}

	async handleNotification(
		payload: Record<string, unknown>,
		rawBody: string,
		signatureHeader: string | null,
	): Promise<void> {
		this.verifyNotification(payload, rawBody, signatureHeader);

		const orderId = coerceString(payload.orderId) ?? coerceString(payload.OrderId);
		if (!orderId) {
			Logger.warn({payloadKeys: Object.keys(payload)}, 'IntellectMoney notification missing OrderId');
			return;
		}

		const paymentId =
			coerceString(payload.invoiceId) ??
			coerceString(payload.InvoiceId) ??
			coerceString(payload.purchaseId) ??
			coerceString(payload.PaymentId);
		const status =
			coerceString(payload.status) ??
			coerceString(payload.Status) ??
			coerceString(payload.paymentStatus) ??
			coerceString(payload.PaymentStatus);
		const amountKopeks = amountRubToKopeks(coerceNumber(payload.amount) ?? coerceNumber(payload.Amount));

		await this.reconcilePaymentState({
			orderId,
			paymentId,
			status: status?.toUpperCase() ?? null,
			amountKopeks,
			source: 'notification',
		});
	}

	async reconcileOrder(orderId: string): Promise<void> {
		const payment = await this.userRepository.getPaymentByCheckoutSession(orderId);
		if (!payment) {
			throw new IntellectMoneyError('Payment not found', 404);
		}
	}

	async reconcileOrderForUser(userId: UserID, orderId: string): Promise<void> {
		const payment = await this.userRepository.getPaymentByCheckoutSession(orderId);
		if (!payment || payment.userId !== userId) {
			throw new IntellectMoneyError('Payment not found', 404);
		}
		await this.reconcileOrder(orderId);
	}

	private async reconcilePaymentState({
		orderId,
		paymentId,
		status,
		amountKopeks,
		source,
	}: {
		orderId: string;
		paymentId: string | null;
		status: string | null;
		amountKopeks: number | null;
		source: 'notification' | 'reconcile';
	}): Promise<void> {
		const payment = await this.userRepository.getPaymentByCheckoutSession(orderId);
		if (!payment) {
			Logger.warn({orderId, source}, 'IntellectMoney payment not found in local store');
			return;
		}

		if (payment.status === 'completed' || payment.status === 'failed' || payment.status === 'refunded') {
			return;
		}

		if (!status) {
			Logger.warn({orderId, source}, 'IntellectMoney payment status missing');
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
			Logger.info({orderId, paymentId, status, source}, 'IntellectMoney payment marked as failed');
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
			Logger.debug({orderId, paymentId, status, source}, 'IntellectMoney payment still pending');
			return;
		}

		const lockToken = await this.cacheService.acquireLock(`intellectmoney:finalize:${orderId}`, 60);
		if (!lockToken) {
			Logger.debug({orderId}, 'Skipped IntellectMoney finalization due to active lock');
			return;
		}

		try {
			const currentPayment = await this.userRepository.getPaymentByCheckoutSession(orderId);
			if (!currentPayment || currentPayment.status === 'completed') {
				return;
			}

			const product = currentPayment.priceId ? this.productRegistry.getProduct(currentPayment.priceId) : null;
			if (!product) {
				throw new IntellectMoneyError('Unknown IntellectMoney product');
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
				'IntellectMoney payment finalized successfully',
			);
		} finally {
			await this.cacheService.releaseLock(`intellectmoney:finalize:${orderId}`, lockToken);
		}
	}

	private verifyNotification(
		payload: Record<string, unknown>,
		rawBody: string,
		signatureHeader: string | null,
	): void {
		const notificationSecret = Config.intellectmoney.notificationSecret;
		if (!notificationSecret) {
			Logger.error('IntellectMoney notification secret is not configured');
			throw new IntellectMoneyNotificationSignatureInvalidError();
		}

		const providedPayloadSignature =
			coerceString(payload.hash) ??
			coerceString(payload.Hash) ??
			coerceString(payload.signature) ??
			coerceString(payload.Signature);
		const providedSignature = signatureHeader ?? providedPayloadSignature;

		const orderId = coerceString(payload.orderId) ?? coerceString(payload.OrderId);
		const amount = coerceString(payload.amount) ?? coerceString(payload.Amount);
		const status = coerceString(payload.status) ?? coerceString(payload.Status);

		const verified = verifyIntellectMoneySha256Hex(
			[
				coerceString(payload.eshopId) ?? coerceString(payload.EshopId) ?? Config.intellectmoney.eshopId ?? '',
				orderId ?? '',
				amount ?? '',
				status ?? '',
				notificationSecret,
			],
			providedSignature,
		);

		if (!verified) {
			Logger.warn(
				{hasSignatureHeader: !!signatureHeader, payloadKeys: Object.keys(payload), rawBodySize: rawBody.length},
				'IntellectMoney notification signature verification failed',
			);
			throw new IntellectMoneyNotificationSignatureInvalidError();
		}
	}

	private requireCredentials(): {eshopId: string; apiToken: string; signingKey: string} {
		if (!this.isConfigured()) {
			throw new IntellectMoneyError('IntellectMoney provider is not configured');
		}

		return {
			eshopId: Config.intellectmoney.eshopId!,
			apiToken: Config.intellectmoney.apiToken!,
			signingKey: Config.intellectmoney.signingKey!,
		};
	}

	private buildSign(parts: Array<string | number | boolean | null | undefined>): string {
		const {signingKey} = this.requireCredentials();
		return buildIntellectMoneySha256Hex([...parts, signingKey]);
	}

	private async callApi<TResponse>(
		method: string,
		payload: Record<string, unknown>,
		signParts: Array<string | number | boolean | null | undefined>,
	): Promise<TResponse> {
		const {apiToken} = this.requireCredentials();
		const endpoint = `${trimTrailingSlash(Config.intellectmoney.apiUrl)}/${method}`;
		const sign = this.buildSign(signParts);
		const body = new URLSearchParams(
			Object.entries(payload)
				.filter(([, value]) => value !== undefined && value !== null)
				.map(([key, value]) => [key, String(value)]),
		);

		let response: Response;
		try {
			response = await fetch(endpoint, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/x-www-form-urlencoded',
					Accept: 'application/json',
					Authorization: `Bearer ${apiToken}`,
					Sign: sign,
				},
				body,
			});
		} catch (error: unknown) {
			Logger.error({error, method}, 'IntellectMoney request failed');
			throw new IntellectMoneyError('Unable to reach IntellectMoney API');
		}

		let result: unknown = null;
		const responseText = await response.text();
		try {
			result = responseText ? (JSON.parse(responseText) as unknown) : {};
		} catch {
			result = {message: responseText};
		}

		if (!response.ok) {
			Logger.error({method, status: response.status, body: result}, 'IntellectMoney API returned non-200 response');
			throw new IntellectMoneyError(`IntellectMoney API responded with HTTP ${response.status}`);
		}

		return (result ?? {}) as TResponse;
	}

	private isSuccessResponse(response: IntellectMoneyResponse): boolean {
		if (response.success === true) return true;
		const code = coerceString(response.code);
		if (code === '0' || code === '200') return true;
		return false;
	}

	private extractApiErrorMessage(response: IntellectMoneyResponse, fallback: string): string {
		return (
			coerceString(response.message) ??
			coerceString(response.error) ??
			coerceString(response.code) ??
			fallback
		);
	}
}
