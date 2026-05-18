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
	NoVisionarySlotsAvailableError,
	TBankError,
	TBankNotificationSignatureInvalidError,
	UnknownUserError,
} from '~/Errors';
import type {IGuildRepository} from '~/guild/IGuildRepository';
import type {GuildService} from '~/guild/services/GuildService';
import type {ICacheService} from '~/infrastructure/ICacheService';
import type {IGatewayService} from '~/infrastructure/IGatewayService';
import type {SnowflakeService} from '~/infrastructure/SnowflakeService';
import {Logger} from '~/Logger';
import type {IUserRepository} from '~/user/IUserRepository';
import {ProductRegistry} from '~/stripe/ProductRegistry';
import {StripeCheckoutService} from '~/stripe/services/StripeCheckoutService';
import {StripeGiftService} from '~/stripe/services/StripeGiftService';
import {StripePremiumService} from '~/stripe/services/StripePremiumService';
import {StripeSubscriptionService} from '~/stripe/services/StripeSubscriptionService';
import {buildTBankToken, verifyTBankToken} from './TBankToken';
import {TBankProductRegistry} from './TBankProductRegistry';

interface CreateCheckoutSessionParams {
	userId: UserID;
	priceId: string;
	isGift: boolean;
}

interface TBankResponseBase {
	Success?: boolean;
	ErrorCode?: string;
	Message?: string;
	Details?: string;
}

interface TBankInitResponse extends TBankResponseBase {
	OrderId?: string | number;
	PaymentId?: string | number;
	PaymentURL?: string;
	Status?: string;
	Amount?: number;
}

interface TBankGetStateResponse extends TBankResponseBase {
	OrderId?: string | number;
	PaymentId?: string | number;
	Status?: string;
	Amount?: number;
}

const SUCCESS_STATUSES = new Set(['CONFIRMED']);
const FAILURE_STATUSES = new Set([
	'REJECTED',
	'CANCELED',
	'DEADLINE_EXPIRED',
	'REVERSED',
	'PARTIAL_REFUNDED',
	'REFUNDED',
	'AUTH_FAIL',
]);

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

export class TBankService {
	private readonly productRegistry = new TBankProductRegistry();
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
		return !!(Config.tbank.enabled && Config.tbank.terminalKey && Config.tbank.password && Config.tbank.prices);
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
		const {terminalKey, password} = this.requireCredentials();

		const product = this.productRegistry.getProduct(priceId);
		if (!product) {
			throw new TBankError('Invalid product selection');
		}
		if (product.isGift !== isGift) {
			throw new TBankError('Invalid product configuration');
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

		const orderId = `tbk_${this.snowflakeService.generate().toString()}`;
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

		const initPayload: Record<string, unknown> = {
			TerminalKey: terminalKey,
			Amount: product.amountKopeks,
			OrderId: orderId,
			Description: product.description,
			NotificationURL: Config.tbank.notificationUrl ?? `${Config.endpoints.apiPublic}/payments/tbank/notification`,
			SuccessURL: Config.tbank.successUrl ?? `${Config.endpoints.webApp}/premium-callback?status=success`,
			FailURL: Config.tbank.failUrl ?? `${Config.endpoints.webApp}/premium-callback?status=cancel`,
			DATA: {
				user_id: userId.toString(),
				price_id: priceId,
				is_gift: isGift ? '1' : '0',
			},
		};
		initPayload.Token = buildTBankToken(initPayload, password);

		const initResponse = await this.callApi<TBankInitResponse>('Init', initPayload);
		if (!initResponse.Success) {
			await this.userRepository.updatePayment({
				checkout_session_id: orderId,
				status: 'failed',
			});
			throw new TBankError(this.extractApiErrorMessage(initResponse, 'Failed to initialize payment'));
		}

		const paymentUrl = coerceString(initResponse.PaymentURL);
		if (!paymentUrl) {
			await this.userRepository.updatePayment({
				checkout_session_id: orderId,
				status: 'failed',
			});
			throw new TBankError('T-Bank did not return payment URL');
		}

		await this.userRepository.updatePayment({
			checkout_session_id: orderId,
			payment_intent_id: coerceString(initResponse.PaymentId),
			amount_cents: product.amountKopeks,
			currency: 'RUB',
		});

		Logger.info(
			{
				userId,
				orderId,
				paymentId: coerceString(initResponse.PaymentId),
				priceId,
				isGift,
			},
			'T-Bank checkout session created',
		);

		return paymentUrl;
	}

	async handleNotification(payload: Record<string, unknown>): Promise<void> {
		const {password} = this.requireCredentials();

		if (!verifyTBankToken(payload, password)) {
			throw new TBankNotificationSignatureInvalidError();
		}

		const orderId = coerceString(payload.OrderId);
		if (!orderId) {
			Logger.warn({payloadKeys: Object.keys(payload)}, 'T-Bank notification missing OrderId');
			return;
		}

		const paymentId = coerceString(payload.PaymentId);
		const status = coerceString(payload.Status)?.toUpperCase() ?? null;
		const amountKopeks = coerceNumber(payload.Amount);

		await this.reconcilePaymentState({
			orderId,
			paymentId,
			status,
			amountKopeks,
			source: 'notification',
		});
	}

	async reconcileOrder(orderId: string): Promise<void> {
		const {terminalKey, password} = this.requireCredentials();

		const payload: Record<string, unknown> = {
			TerminalKey: terminalKey,
			OrderId: orderId,
		};
		payload.Token = buildTBankToken(payload, password);

		const response = await this.callApi<TBankGetStateResponse>('GetState', payload);
		if (!response.Success) {
			throw new TBankError(this.extractApiErrorMessage(response, 'Failed to fetch payment status'));
		}

		await this.reconcilePaymentState({
			orderId,
			paymentId: coerceString(response.PaymentId),
			status: coerceString(response.Status)?.toUpperCase() ?? null,
			amountKopeks: coerceNumber(response.Amount),
			source: 'get_state',
		});
	}

	async reconcileOrderForUser(userId: UserID, orderId: string): Promise<void> {
		const payment = await this.userRepository.getPaymentByCheckoutSession(orderId);
		if (!payment || payment.userId !== userId) {
			throw new TBankError('Payment not found', 404);
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
		source: 'notification' | 'get_state';
	}): Promise<void> {
		const payment = await this.userRepository.getPaymentByCheckoutSession(orderId);
		if (!payment) {
			Logger.warn({orderId, source}, 'T-Bank payment not found in local store');
			return;
		}

		if (payment.status === 'completed' || payment.status === 'failed' || payment.status === 'refunded') {
			return;
		}

		if (!status) {
			Logger.warn({orderId, source}, 'T-Bank payment status missing');
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
			Logger.info({orderId, paymentId, status, source}, 'T-Bank payment marked as failed');
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
			Logger.debug({orderId, paymentId, status, source}, 'T-Bank payment still pending');
			return;
		}

		const lockToken = await this.cacheService.acquireLock(`tbank:finalize:${orderId}`, 60);
		if (!lockToken) {
			Logger.debug({orderId}, 'Skipped T-Bank finalization due to active lock');
			return;
		}

		try {
			const currentPayment = await this.userRepository.getPaymentByCheckoutSession(orderId);
			if (!currentPayment || currentPayment.status === 'completed') {
				return;
			}

			const product = currentPayment.priceId ? this.productRegistry.getProduct(currentPayment.priceId) : null;
			if (!product) {
				throw new TBankError('Unknown T-Bank product');
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
				'T-Bank payment finalized successfully',
			);
		} finally {
			await this.cacheService.releaseLock(`tbank:finalize:${orderId}`, lockToken);
		}
	}

	private requireCredentials(): {terminalKey: string; password: string} {
		if (!this.isConfigured()) {
			throw new TBankError('T-Bank payment provider is not configured');
		}

		return {
			terminalKey: Config.tbank.terminalKey!,
			password: Config.tbank.password!,
		};
	}

	private async callApi<TResponse>(method: string, payload: Record<string, unknown>): Promise<TResponse> {
		const endpoint = `${trimTrailingSlash(Config.tbank.apiUrl)}/${method}`;

		let response: Response;
		try {
			response = await fetch(endpoint, {
				method: 'POST',
				headers: {'Content-Type': 'application/json'},
				body: JSON.stringify(payload),
			});
		} catch (error: unknown) {
			Logger.error({error, method}, 'T-Bank request failed');
			throw new TBankError('Unable to reach T-Bank acquiring API');
		}

		let body: unknown = null;
		try {
			body = await response.json();
		} catch {
			body = null;
		}

		if (!response.ok) {
			Logger.error({method, status: response.status, body}, 'T-Bank API returned non-200 response');
			throw new TBankError(`T-Bank API responded with HTTP ${response.status}`);
		}

		return (body ?? {}) as TResponse;
	}

	private extractApiErrorMessage(response: TBankResponseBase, fallback: string): string {
		const parts = [coerceString(response.Message), coerceString(response.Details), coerceString(response.ErrorCode)].filter(
			Boolean,
		);
		return parts.length > 0 ? parts.join(' | ') : fallback;
	}
}
