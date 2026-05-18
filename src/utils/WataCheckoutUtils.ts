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

import {Logger} from '~/lib/Logger';

export interface WataDeviceData {
	browserAcceptHeader?: string;
	browserColorDepth?: number;
	browserJavaEnabled?: boolean;
	browserJavaScriptEnabled?: boolean;
	browserLanguage?: string;
	browserScreenHeight?: number;
	browserScreenWidth?: number;
	browserTz?: number;
	browserUserAgent?: string;
}

const logger = new Logger('WataCheckoutUtils');
const WATA_CHECKOUT_SCRIPT_URL = 'https://static.wata.pro/checkout.js';

let wataCheckoutPromise: Promise<(() => {getDeviceData: () => Promise<WataDeviceData> | WataDeviceData}) | null> | null = null;

function buildFallbackDeviceData(): WataDeviceData {
	return {
		browserAcceptHeader: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
		browserColorDepth: window.screen?.colorDepth ?? 24,
		browserJavaEnabled: typeof navigator.javaEnabled === 'function' ? navigator.javaEnabled() : false,
		browserJavaScriptEnabled: true,
		browserLanguage: navigator.language ?? 'ru-RU',
		browserScreenHeight: window.screen?.height ?? window.innerHeight,
		browserScreenWidth: window.screen?.width ?? window.innerWidth,
		browserTz: -(new Date().getTimezoneOffset() / 60),
		browserUserAgent: navigator.userAgent ?? 'Astral',
	};
}

async function loadWataCheckoutFactory(): Promise<(() => {getDeviceData: () => Promise<WataDeviceData> | WataDeviceData}) | null> {
	if (typeof window === 'undefined') return null;
	if (typeof window.WataCheckout === 'function') return window.WataCheckout;
	if (wataCheckoutPromise) return wataCheckoutPromise;

	wataCheckoutPromise = new Promise((resolve) => {
		const existing = document.querySelector<HTMLScriptElement>(`script[src="${WATA_CHECKOUT_SCRIPT_URL}"]`);
		if (existing) {
			existing.addEventListener('load', () => resolve(window.WataCheckout ?? null), {once: true});
			existing.addEventListener('error', () => resolve(null), {once: true});
			return;
		}

		const script = document.createElement('script');
		script.src = WATA_CHECKOUT_SCRIPT_URL;
		script.async = true;
		script.onload = () => resolve(window.WataCheckout ?? null);
		script.onerror = () => resolve(null);
		document.head.appendChild(script);
	});

	return wataCheckoutPromise;
}

export async function collectWataDeviceData(): Promise<WataDeviceData> {
	const fallback = buildFallbackDeviceData();

	try {
		const factory = await loadWataCheckoutFactory();
		if (!factory) return fallback;

		const checkout = factory();
		if (!checkout || typeof checkout.getDeviceData !== 'function') return fallback;

		const deviceData = await checkout.getDeviceData();
		return {
			...fallback,
			...deviceData,
		};
	} catch (error) {
		logger.warn('Failed to load WATA checkout.js device data, using fallback', error);
		return fallback;
	}
}
