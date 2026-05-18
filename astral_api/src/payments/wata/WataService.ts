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

import {createVerify} from 'node:crypto';
import type {UserID} from '~/BrandedTypes';
import {Config} from '~/Config';
import {UserPremiumTypes} from '~/Constants';
import {NoVisionarySlotsAvailableError, UnknownUserError, WataError, WataNotificationSignatureInvalidError} from '~/Errors';
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
import {StripeReferralService} from '~/stripe/services/StripeReferralService';
import {StripeSubscriptionService} from '~/stripe/services/StripeSubscriptionService';
import type {IUserRepository} from '~/user/IUserRepository';
import {WataProductRegistry} from './WataProductRegistry';

interface CreateCheckoutSessionParams {
	userId: UserID;
	priceId: string;
	isGift: boolean;
	referralCode?: string | null;
}

interface WataPublicKeyResponse {
	value?: string;
	data?: {
		value?: string;
	};
}

interface WataTransactionsSearchResponse {
	items?: Array<Record<string, unknown>>;
	totalCount?: number;
}

type WataReconcileStatus = 'pending' | 'completed' | 'failed' | 'refunded';

function coerceWataReconcileStatus(value: string | null | undefined): WataReconcileStatus {
	if (value === 'completed' || value === 'failed' || value === 'refunded') return value;
	return 'pending';
}

const SUCCESS_STATUSES = new Set(['PAID', 'SUCCESS', 'COMPLETED', 'CONFIRMED']);
const FAILURE_STATUSES = new Set(['DECLINED', 'FAILED', 'CANCELLED', 'CANCELED', 'EXPIRED']);
const LOG_PREVIEW_LIMIT = 1200;

function trimTrailingSlash(value: string): string {
	if (value.length > 1 && value.endsWith('/')) return trimTrailingSlash(value.slice(0, -1));
	return value;
}

function amountKopeksToRubNumber(amountKopeks: number): number {
	return Number((amountKopeks / 100).toFixed(2));
}

function amountRubToKopeks(amountRub: number | null): number | null {
	if (amountRub == null) return null;
	return Math.round(amountRub * 100);
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

function findValueByKeys(value: unknown, keys: Set<string>, seen = new WeakSet<object>()): unknown {
	if (!value || typeof value !== 'object') return null;
	if (seen.has(value as object)) return null;
	seen.add(value as object);

	if (Array.isArray(value)) {
		for (const item of value) {
			const nested = findValueByKeys(item, keys, seen);
			if (nested !== null && nested !== undefined) return nested;
		}
		return null;
	}

	for (const [entryKey, entryValue] of Object.entries(value)) {
		if (keys.has(entryKey)) return entryValue;
	}

	for (const entryValue of Object.values(value)) {
		const nested = findValueByKeys(entryValue, keys, seen);
		if (nested !== null && nested !== undefined) return nested;
	}

	return null;
}

function findStringByKeys(value: unknown, candidateKeys: Array<string>): string | null {
	return coerceString(findValueByKeys(value, new Set(candidateKeys)));
}

function findNumberByKeys(value: unknown, candidateKeys: Array<string>): number | null {
	return coerceNumber(findValueByKeys(value, new Set(candidateKeys)));
}

function previewForLog(value: unknown, limit: number = LOG_PREVIEW_LIMIT): string {
	try {
		const serialized = typeof value === 'string' ? value : JSON.stringify(value);
		if (!serialized) return '';
		return serialized.length > limit ? `${serialized.slice(0, limit)}...` : serialized;
	} catch {
		return '[unserializable]';
	}
}

function appendQueryParamsToUrl(baseUrl: string, params: Record<string, string>): string {
	const url = new URL(baseUrl, Config.endpoints.webApp);
	for (const [key, value] of Object.entries(params)) {
		url.searchParams.set(key, value);
	}
	return url.toString();
}

export class WataService {
	private readonly productRegistry = new WataProductRegistry();
	private readonly validationCheckoutService: StripeCheckoutService;
	private readonly referralService: StripeReferralService;
	private readonly premiumService: StripePremiumService;
	private readonly subscriptionService: StripeSubscriptionService;
	private readonly giftService: StripeGiftService;
	private cachedPublicKey: {value: string; fetchedAt: number} | null = null;

	constructor(
		private readonly userRepository: IUserRepository,
		private readonly cacheService: ICacheService,
		private readonly gatewayService: IGatewayService,
		private readonly guildRepository: IGuildRepository,
		private readonly guildService: GuildService,
		private readonly snowflakeService: SnowflakeService,
	) {
		this.referralService = new StripeReferralService(this.userRepository);
		this.validationCheckoutService = new StripeCheckoutService(
			null,
			this.userRepository,
			new ProductRegistry(),
			this.referralService,
		);
		this.premiumService = new StripePremiumService(this.userRepository, this.gatewayService, this.guildRepository, this.guildService);
		this.subscriptionService = new StripeSubscriptionService(null, this.userRepository, this.cacheService, this.gatewayService);
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
		return !!(Config.wata.enabled && Config.wata.accessToken);
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

	async createCheckoutSession({userId, priceId, isGift, referralCode}: CreateCheckoutSessionParams): Promise<string> {
		this.requireCredentials();

		const product = this.productRegistry.getProduct(priceId);
		if (!product) throw new WataError('Invalid product selection');
		if (product.isGift !== isGift) throw new WataError('Invalid product configuration');

		const user = await this.userRepository.findUnique(userId);
		if (!user) throw new UnknownUserError();

		this.validationCheckoutService.validateUserCanPurchase(user);
		const referrerUserId = !isGift ? await this.referralService.resolveReferrerUserId(userId, referralCode) : null;
		if (!isGift && product.premiumType === UserPremiumTypes.LIFETIME) {
			const unreservedSlots = (await this.userRepository.listVisionarySlots()).filter((slot) => !slot.isReserved());
			if (unreservedSlots.length === 0) throw new NoVisionarySlotsAvailableError();
		}

		const orderId = `wata_${this.snowflakeService.generate().toString()}`;
		const successRedirectUrl = appendQueryParamsToUrl(
			Config.wata.successUrl ?? `${Config.endpoints.webApp}/premium-callback`,
			{status: 'success', provider: 'wata', order_id: orderId},
		);
		const failRedirectUrl = appendQueryParamsToUrl(
			Config.wata.failUrl ?? `${Config.endpoints.webApp}/premium-callback`,
			{status: 'cancel', provider: 'wata', order_id: orderId},
		);
		await this.userRepository.createPayment({
			checkout_session_id: orderId,
			user_id: userId,
			price_id: priceId,
			product_type: product.type,
			status: 'pending',
			is_gift: isGift,
			referral_code: referrerUserId ? referralCode ?? null : null,
			referrer_user_id: referrerUserId,
			created_at: new Date(),
		});

		const requestPayload = {
			amount: amountKopeksToRubNumber(product.amountKopeks),
			currency: 'RUB',
			orderId,
			description: product.description,
			successRedirectUrl,
			failRedirectUrl,
		};
		Logger.info(
			{
				userId,
				orderId,
				priceId,
				isGift,
				requestPayload,
			},
			'Creating WATA hosted checkout session',
		);
		const response = await this.callApi<Record<string, unknown>>('links', 'POST', requestPayload);

		const paymentUrl =
			findStringByKeys(response, ['sbpLink', 'paymentUrl', 'checkoutUrl', 'linkUrl', 'url', 'redirectUrl', 'paymentLink']) ??
			null;
		if (!paymentUrl) {
			await this.userRepository.updatePayment({checkout_session_id: orderId, status: 'failed'});
			throw new WataError('WATA did not return payment URL');
		}

		const paymentId = findStringByKeys(response, ['uuid', 'linkId', 'linkUuid', 'id', 'transactionId']) ?? orderId;
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
				mode: 'hosted_link',
				responseKeys: Object.keys(response),
				responsePreview: previewForLog(response),
			},
			'WATA checkout session created',
		);
		return paymentUrl;
	}

	async handleNotification(payload: Record<string, unknown>, rawBody: string, signatureHeader: string | null): Promise<void> {
		Logger.info(
			{
				payloadKeys: Object.keys(payload),
				rawBodyLength: rawBody.length,
				signaturePresent: !!signatureHeader,
				rawBodyPreview: previewForLog(rawBody),
			},
			'Received WATA notification',
		);
		await this.verifyNotification(rawBody, signatureHeader);
		Logger.info(
			{
				signaturePresent: !!signatureHeader,
				payloadKeys: Object.keys(payload),
			},
			'WATA notification signature verified',
		);

		const orderId = findStringByKeys(payload, ['orderId', 'merchantOrderId', 'invoiceId']);
		if (!orderId) {
			Logger.warn({payloadKeys: Object.keys(payload)}, 'WATA notification missing orderId');
			return;
		}

		const status = findStringByKeys(payload, ['transactionStatus', 'status', 'paymentStatus'])?.toUpperCase() ?? null;
		const paymentId = findStringByKeys(payload, ['transactionId', 'paymentId', 'uuid', 'id', 'linkId']);
		const amountKopeks = amountRubToKopeks(findNumberByKeys(payload, ['amount']));
		const currency = findStringByKeys(payload, ['currency', 'currencyCode', 'paymentCurrency'])?.toUpperCase() ?? null;
		const terminalId = findStringByKeys(payload, ['terminalId', 'merchantTerminalId']);
		const publicId = findStringByKeys(payload, ['publicId', 'merchantPublicId']);
		Logger.info({orderId, paymentId, status, amountKopeks, currency, terminalId, publicId}, 'Processing WATA notification');
		await this.reconcilePaymentState({
			orderId,
			paymentId,
			status,
			amountKopeks,
			currency,
			terminalId,
			publicId,
			source: 'notification',
		});
	}

	async reconcileOrder(orderId: string): Promise<WataReconcileStatus> {
		const payment = await this.userRepository.getPaymentByCheckoutSession(orderId);
		if (!payment) throw new WataError('Payment not found', 404);

		if (payment.status === 'completed' || payment.status === 'failed' || payment.status === 'refunded') {
			return coerceWataReconcileStatus(payment.status);
		}

		const transaction = await this.getLatestTransactionByOrderId(orderId);
		if (!transaction) {
			Logger.info({orderId}, 'WATA reconcile found no transaction yet');
			return coerceWataReconcileStatus(payment.status);
		}

		await this.reconcilePaymentState({
			orderId,
			paymentId: findStringByKeys(transaction, ['transactionId', 'paymentId', 'id']),
			status: findStringByKeys(transaction, ['transactionStatus', 'status'])?.toUpperCase() ?? null,
			amountKopeks: amountRubToKopeks(findNumberByKeys(transaction, ['amount'])),
			currency: findStringByKeys(transaction, ['currency', 'currencyCode', 'paymentCurrency'])?.toUpperCase() ?? null,
			terminalId: findStringByKeys(transaction, ['terminalId', 'merchantTerminalId']),
			publicId: findStringByKeys(transaction, ['publicId', 'merchantPublicId']),
			source: 'reconcile',
		});

		const updatedPayment = await this.userRepository.getPaymentByCheckoutSession(orderId);
		return coerceWataReconcileStatus(updatedPayment?.status ?? payment.status);
	}

	async reconcileOrderForUser(userId: UserID, orderId: string): Promise<WataReconcileStatus> {
		const payment = await this.userRepository.getPaymentByCheckoutSession(orderId);
		if (!payment || payment.userId !== userId) throw new WataError('Payment not found', 404);
		return this.reconcileOrder(orderId);
	}

	private async getLatestTransactionByOrderId(orderId: string): Promise<Record<string, unknown> | null> {
		const response = await this.callApi<WataTransactionsSearchResponse>(
			`transactions/?orderId=${encodeURIComponent(orderId)}&skipCount=0&maxResultCount=10&sorting=${encodeURIComponent(
				'creationTime desc',
			)}`,
			'GET',
		);
		const items = Array.isArray(response.items) ? response.items : [];
		return items[0] ?? null;
	}

	private async reconcilePaymentState({
		orderId,
		paymentId,
		status,
		amountKopeks,
		currency,
		terminalId,
		publicId,
		source,
	}: {
		orderId: string;
		paymentId: string | null;
		status: string | null;
		amountKopeks: number | null;
		currency: string | null;
		terminalId: string | null;
		publicId: string | null;
		source: 'notification' | 'reconcile';
	}): Promise<void> {
		const payment = await this.userRepository.getPaymentByCheckoutSession(orderId);
		if (!payment) {
			Logger.warn({orderId, paymentId, status, amountKopeks, source}, 'WATA payment not found in local store');
			return;
		}
		Logger.info(
			{
				orderId,
				source,
				localStatus: payment.status,
				localPaymentIntentId: payment.paymentIntentId,
				priceId: payment.priceId,
				isGift: payment.isGift,
				incomingPaymentId: paymentId,
				incomingStatus: status,
				incomingAmountKopeks: amountKopeks,
			},
			'Reconciling WATA payment state',
		);
		if (payment.status === 'completed' || payment.status === 'failed' || payment.status === 'refunded') return;
		if (source === 'notification') {
			if (Config.wata.terminalId && terminalId && terminalId !== Config.wata.terminalId) {
				Logger.warn({orderId, terminalId}, 'WATA notification terminalId mismatch');
				return;
			}
			if (Config.wata.publicId && publicId && publicId !== Config.wata.publicId) {
				Logger.warn({orderId, publicId}, 'WATA notification publicId mismatch');
				return;
			}
		}
		if (!status) {
			Logger.warn({orderId, source}, 'WATA payment status missing');
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
			Logger.info({orderId, paymentId, status, source}, 'Marked WATA payment as failed');
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
			Logger.info({orderId, paymentId, status, source}, 'WATA payment status is pending or informational');
			return;
		}

		const lockToken = await this.cacheService.acquireLock(`wata:finalize:${orderId}`, 60);
		if (!lockToken) return;

		try {
			const currentPayment = await this.userRepository.getPaymentByCheckoutSession(orderId);
			if (!currentPayment || currentPayment.status === 'completed') return;

			const product = currentPayment.priceId ? this.productRegistry.getProduct(currentPayment.priceId) : null;
			if (!product) throw new WataError('Unknown WATA product');

			const expectedPaymentId = currentPayment.paymentIntentId ?? orderId;
			const expectedAmountKopeks = currentPayment.amountCents ?? product.amountKopeks;
			const expectedCurrency = (currentPayment.currency ?? 'RUB').toUpperCase();

			if (!paymentId || paymentId !== expectedPaymentId) {
				Logger.warn({orderId, paymentId, expectedPaymentId, source}, 'WATA paymentId mismatch');
				return;
			}
			if (amountKopeks == null || amountKopeks !== expectedAmountKopeks) {
				Logger.warn({orderId, amountKopeks, expectedAmountKopeks, source}, 'WATA amount mismatch');
				return;
			}
			if (!currency || currency !== expectedCurrency) {
				Logger.warn({orderId, currency, expectedCurrency, source}, 'WATA currency mismatch');
				return;
			}

			const user = await this.userRepository.findUnique(currentPayment.userId);
			if (!user) throw new UnknownUserError();

			if (currentPayment.isGift) {
				await this.giftService.createGiftCode(orderId, user, product, paymentId);
				await this.userRepository.patchUpsert(currentPayment.userId, {has_ever_purchased: true});
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
			const updatedPayment = await this.userRepository.getPaymentByCheckoutSession(orderId);
			if (updatedPayment?.referrerUserId && !updatedPayment.isGift) {
				const rewardCents = await this.referralService.finalizeReferralReward(updatedPayment);
				if (rewardCents > 0) {
					await this.userRepository.updatePayment({
						checkout_session_id: updatedPayment.checkoutSessionId,
						referral_reward_cents: rewardCents,
					});
				}
			}
			Logger.info({orderId, paymentId, status, source}, 'Marked WATA payment as completed');
		} finally {
			await this.cacheService.releaseLock(`wata:finalize:${orderId}`, lockToken);
		}
	}

	private requireCredentials(): {accessToken: string} {
		if (!this.isConfigured()) throw new WataError('WATA provider is not configured');
		return {accessToken: Config.wata.accessToken!};
	}

	private async verifyNotification(rawBody: string, signatureHeader: string | null): Promise<void> {
		if (!signatureHeader) throw new WataNotificationSignatureInvalidError();
		const publicKey = await this.getPublicKey();
		const verifier = createVerify('RSA-SHA512');
		verifier.update(rawBody, 'utf8');
		verifier.end();
		if (!verifier.verify(publicKey, Buffer.from(signatureHeader, 'base64'))) {
			throw new WataNotificationSignatureInvalidError();
		}
	}

	private async getPublicKey(): Promise<string> {
		if (this.cachedPublicKey && Date.now() - this.cachedPublicKey.fetchedAt < 10 * 60 * 1000) {
			return this.cachedPublicKey.value;
		}

		try {
			const response = await fetch(Config.wata.publicKeyUrl, {headers: {Accept: 'application/json'}});
			if (!response.ok) throw new WataError(`WATA public key endpoint responded with HTTP ${response.status}`);
			const body = (await response.json()) as WataPublicKeyResponse;
			const key = coerceString(body.value) ?? coerceString(body.data?.value);
			if (!key) throw new WataError('WATA public key response is invalid');
			this.cachedPublicKey = {value: key, fetchedAt: Date.now()};
			return key;
		} catch (error) {
			if (error instanceof WataError) throw error;
			Logger.error({error}, 'Failed to fetch WATA public key');
			throw new WataError('Unable to reach WATA public key endpoint');
		}
	}

	private async callApi<TResponse>(path: string, method: 'GET' | 'POST', payload?: Record<string, unknown>): Promise<TResponse> {
		const {accessToken} = this.requireCredentials();
		try {
			Logger.info(
				{
					path,
					method,
					baseUrl: trimTrailingSlash(Config.wata.apiUrl),
					payload,
				},
				'Sending WATA API request',
			);
			const response = await fetch(`${trimTrailingSlash(Config.wata.apiUrl)}/${path}`, {
				method,
				headers: {
					Accept: 'application/json',
					Authorization: `Bearer ${accessToken}`,
					'Content-Type': 'application/json',
				},
				body: payload ? JSON.stringify(payload) : undefined,
			});
			const responseText = await response.text();
			let body: unknown = null;
			try {
				body = responseText ? (JSON.parse(responseText) as unknown) : {};
			} catch {
				body = {message: responseText};
			}
			if (!response.ok) {
				Logger.error({path, method, status: response.status, body}, 'WATA API returned non-200 response');
				throw new WataError(`WATA API responded with HTTP ${response.status}`);
			}
			Logger.info(
				{
					path,
					method,
					status: response.status,
					bodyPreview: previewForLog(body),
				},
				'Received WATA API response',
			);
			return (body ?? {}) as TResponse;
		} catch (error) {
			if (error instanceof WataError) throw error;
			Logger.error({error, path, method}, 'Failed to reach WATA API');
			throw new WataError('Unable to reach WATA API');
		}
	}
}
