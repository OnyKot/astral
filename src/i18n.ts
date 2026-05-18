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

import {i18n, type Messages} from '@lingui/core';
import AppStorage from '~/lib/AppStorage';
import {getNativeLocaleIdentifier} from '~/lib/Platform';

/*
 * Locale catalogs are loaded dynamically — previously every one of
 * the 34 supported locales was statically imported into the main
 * bundle, which is the primary reason production main.js ballooned
 * past 14MB. With per-locale dynamic imports rspack emits one tiny
 * chunk per locale and the user only fetches the one they actually
 * need on boot. The webpackChunkName magic comment groups them under
 * a stable name so they're easy to spot in the bundle output.
 */

const supportedLocales = [
	'ar',
	'bg',
	'cs',
	'da',
	'de',
	'el',
	'en-GB',
	'en-US',
	'es-ES',
	'es-419',
	'fi',
	'fr',
	'he',
	'hi',
	'hr',
	'hu',
	'id',
	'it',
	'ja',
	'ko',
	'lt',
	'nl',
	'no',
	'pl',
	'pt-BR',
	'ro',
	'ru',
	'sv-SE',
	'th',
	'tr',
	'uk',
	'vi',
	'zh-CN',
	'zh-TW',
] as const;

type LocaleCode = (typeof supportedLocales)[number];
const DEFAULT_LOCALE: LocaleCode = 'en-US';
const supportedLocaleSet = new Set<LocaleCode>(supportedLocales);

const LANGUAGE_OVERRIDES: Record<string, LocaleCode> = {
	en: 'en-US',
};

type LocaleLoader = () => Promise<{messages: Messages}>;
type LocaleMessagesModule =
	| Messages
	| {messages?: Messages; default?: Messages | {messages?: Messages}}
	| undefined
	| null;

function toMessages(module: LocaleMessagesModule): Messages {
	if (!module) {
		return {};
	}

	if (typeof module !== 'object') {
		return module as Messages;
	}

	const candidate = module as {messages?: Messages; default?: Messages | {messages?: Messages}};
	if (candidate.messages && typeof candidate.messages === 'object') {
		return candidate.messages;
	}

	if (candidate.default && typeof candidate.default === 'object') {
		const defaultObject = candidate.default as {messages?: Messages};
		if (defaultObject.messages && typeof defaultObject.messages === 'object') {
			return defaultObject.messages;
		}
		return candidate.default as Messages;
	}

	return {};
}

const loaders: Record<LocaleCode, LocaleLoader> = {
	ar: async () => ({messages: toMessages(await import('~/locales/ar/messages.mjs'))}),
	bg: async () => ({messages: toMessages(await import('~/locales/bg/messages.mjs'))}),
	cs: async () => ({messages: toMessages(await import('~/locales/cs/messages.mjs'))}),
	da: async () => ({messages: toMessages(await import('~/locales/da/messages.mjs'))}),
	de: async () => ({messages: toMessages(await import('~/locales/de/messages.mjs'))}),
	el: async () => ({messages: toMessages(await import('~/locales/el/messages.mjs'))}),
	'en-GB': async () => ({messages: toMessages(await import('~/locales/en-GB/messages.mjs'))}),
	'en-US': async () => ({messages: toMessages(await import('~/locales/en-US/messages.mjs'))}),
	'es-ES': async () => ({messages: toMessages(await import('~/locales/es-ES/messages.mjs'))}),
	'es-419': async () => ({messages: toMessages(await import('~/locales/es-419/messages.mjs'))}),
	fi: async () => ({messages: toMessages(await import('~/locales/fi/messages.mjs'))}),
	fr: async () => ({messages: toMessages(await import('~/locales/fr/messages.mjs'))}),
	he: async () => ({messages: toMessages(await import('~/locales/he/messages.mjs'))}),
	hi: async () => ({messages: toMessages(await import('~/locales/hi/messages.mjs'))}),
	hr: async () => ({messages: toMessages(await import('~/locales/hr/messages.mjs'))}),
	hu: async () => ({messages: toMessages(await import('~/locales/hu/messages.mjs'))}),
	id: async () => ({messages: toMessages(await import('~/locales/id/messages.mjs'))}),
	it: async () => ({messages: toMessages(await import('~/locales/it/messages.mjs'))}),
	ja: async () => ({messages: toMessages(await import('~/locales/ja/messages.mjs'))}),
	ko: async () => ({messages: toMessages(await import('~/locales/ko/messages.mjs'))}),
	lt: async () => ({messages: toMessages(await import('~/locales/lt/messages.mjs'))}),
	nl: async () => ({messages: toMessages(await import('~/locales/nl/messages.mjs'))}),
	no: async () => ({messages: toMessages(await import('~/locales/no/messages.mjs'))}),
	pl: async () => ({messages: toMessages(await import('~/locales/pl/messages.mjs'))}),
	'pt-BR': async () => ({messages: toMessages(await import('~/locales/pt-BR/messages.mjs'))}),
	ro: async () => ({messages: toMessages(await import('~/locales/ro/messages.mjs'))}),
	ru: async () => ({messages: toMessages(await import('~/locales/ru/messages.mjs'))}),
	'sv-SE': async () => ({messages: toMessages(await import('~/locales/sv-SE/messages.mjs'))}),
	th: async () => ({messages: toMessages(await import('~/locales/th/messages.mjs'))}),
	tr: async () => ({messages: toMessages(await import('~/locales/tr/messages.mjs'))}),
	uk: async () => ({messages: toMessages(await import('~/locales/uk/messages.mjs'))}),
	vi: async () => ({messages: toMessages(await import('~/locales/vi/messages.mjs'))}),
	'zh-CN': async () => ({messages: toMessages(await import('~/locales/zh-CN/messages.mjs'))}),
	'zh-TW': async () => ({messages: toMessages(await import('~/locales/zh-TW/messages.mjs'))}),
};

function formatLocaleValue(value: string): string {
	const trimmed = value.trim();
	if (!trimmed) {
		return '';
	}

	const segments = trimmed.split(/[-_]/).filter(Boolean);
	if (segments.length === 0) {
		return '';
	}

	const language = segments[0].toLowerCase();
	if (segments.length === 1) {
		return language;
	}

	const region = segments
		.slice(1)
		.map((segment) => segment.toUpperCase())
		.join('-');

	return `${language}-${region}`;
}

function normalizeLocale(value?: string | null): LocaleCode {
	if (!value) {
		return DEFAULT_LOCALE;
	}

	const formatted = formatLocaleValue(value);
	if (!formatted) {
		return DEFAULT_LOCALE;
	}

	if (supportedLocaleSet.has(formatted as LocaleCode)) {
		return formatted as LocaleCode;
	}

	const [language] = formatted.split('-');
	if (!language) {
		return DEFAULT_LOCALE;
	}

	const override = LANGUAGE_OVERRIDES[language];
	if (override) {
		return override;
	}

	const fallback = supportedLocales.find((code) => code.split('-')[0].toLowerCase() === language);
	if (fallback) {
		return fallback;
	}

	return DEFAULT_LOCALE;
}

function detectBrowserLocale(): string | null {
	if (Array.isArray(navigator.languages) && navigator.languages.length > 0) {
		return navigator.languages[0];
	}

	return navigator.language ?? null;
}

function detectPreferredLocale(forceLocale?: string): LocaleCode {
	if (forceLocale) {
		return normalizeLocale(forceLocale);
	}

	const storedLocale = AppStorage.getItem('locale');
	if (storedLocale) {
		return normalizeLocale(storedLocale);
	}

	const nativeLocale = getNativeLocaleIdentifier();
	if (nativeLocale) {
		return normalizeLocale(nativeLocale);
	}

	const browserLocale = detectBrowserLocale();
	if (browserLocale) {
		return normalizeLocale(browserLocale);
	}

	return DEFAULT_LOCALE;
}

export async function loadLocaleCatalog(localeCode: string): Promise<LocaleCode> {
	const normalized = normalizeLocale(localeCode);
	const {messages} = await loaders[normalized]();
	i18n.loadAndActivate({locale: normalized, messages});
	AppStorage.setItem('locale', normalized);
	return normalized;
}

let initPromise: Promise<typeof i18n> | null = null;

export async function initI18n(forceLocale?: string) {
	if (!initPromise) {
		initPromise = (async () => {
			try {
				const localeToLoad = detectPreferredLocale(forceLocale);
				await loadLocaleCatalog(localeToLoad);
			} catch (error) {
				console.error('Failed to initialize i18n, falling back to default locale', error);
				await loadLocaleCatalog(DEFAULT_LOCALE);
			}

			return i18n;
		})();
	}

	return initPromise;
}

export default i18n;
