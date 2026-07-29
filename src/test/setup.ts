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

import {observer} from 'mobx-react-lite';
import type {ReactNode} from 'react';
import {vi} from 'vitest';

if (typeof globalThis.URLPattern === 'undefined') {
	await import('urlpattern-polyfill');
}

vi.mock('~/lib/Platform', () => ({
	Platform: {
		OS: 'web',
		isWeb: true,
		isNative: false,
		isIOS: false,
		isAndroid: false,
		isElectron: false,
		select: (specifics: Record<string, any>) =>
			specifics.web ?? specifics.ios ?? specifics.android ?? Object.values(specifics)[0],
		Version: '1.0.0',
	},
	isWebPlatform: () => true,
	isNativePlatform: () => false,
	isElectronPlatform: () => false,
	getNativeLocaleIdentifier: () => null,
}));

vi.mock('mobx-persist-store', () => ({
	makePersistable: vi.fn(() => Promise.resolve()),
	stopPersisting: vi.fn(),
	configurePersistable: vi.fn(),
	isHydrated: vi.fn(() => true),
	isPersisting: vi.fn(() => false),
}));

vi.mock('~/lib/Logger', () => {
	const noop = () => {};
	class MockLogger {
		child() {
			return new MockLogger();
		}
		trace = noop;
		debug = noop;
		info = noop;
		warn = noop;
		error = noop;
		fatal = noop;
	}
	return {
		Logger: MockLogger,
		LogLevel: {Trace: 0, Debug: 1, Info: 2, Warn: 3, Error: 4, Fatal: 5, Silent: 6},
	};
});

vi.mock('~/stores/UpdaterStore', () => ({
	default: {
		hasUpdate: false,
		state: 'idle',
		isChecking: false,
		updateType: null,
		updateInfo: {
			native: {available: false, version: null},
			web: {available: false, sha: null, buildNumber: null},
		},
		displayVersion: null,
		currentVersion: null,
		channel: null,
		lastCheckedAt: null,
		checkForUpdates: vi.fn(() => Promise.resolve()),
		dismissUpdate: vi.fn(),
		applyUpdate: vi.fn(),
	},
}));

vi.mock('katex', () => ({
	default: {
		renderToString: vi.fn(() => '<span class="katex">mocked</span>'),
	},
}));

vi.mock('~/lib/HttpClient', () => {
	const defaultInstance = {
		api_code_version: 1,
		endpoints: {
			api_client: 'https://localhost/api',
			api_public: 'https://localhost/api',
			gateway: 'wss://localhost/gateway',
			media: 'https://localhost/media',
			cdn: 'https://localhost/cdn',
			marketing: 'https://localhost/marketing',
			invite: 'https://localhost/invite',
			gift: 'https://localhost/gift',
			webapp: 'https://localhost',
		},
		captcha: {provider: 'none', hcaptcha_site_key: null, turnstile_site_key: null},
		features: {
			sms_mfa_enabled: false,
			voice_enabled: false,
			stripe_enabled: false,
			billing_enabled: false,
			self_hosted: false,
		},
	};

	const mockResponse = Promise.resolve({ok: true, status: 200, headers: {}, body: defaultInstance});
	const client = {
		get: vi.fn(() => mockResponse),
		post: vi.fn(() => mockResponse),
		put: vi.fn(() => mockResponse),
		patch: vi.fn(() => mockResponse),
		delete: vi.fn(() => mockResponse),
		request: vi.fn(() => mockResponse),
		setBaseUrl: vi.fn(),
		setSudoHandler: vi.fn(),
		setSudoFailureHandler: vi.fn(),
		setSudoTokenProvider: vi.fn(),
		setSudoTokenListener: vi.fn(),
		setSudoTokenInvalidator: vi.fn(),
	};

	return {__esModule: true, default: client};
});

vi.mock('~/components/channel/emoji-picker/EmojiPickerConstants', () => ({
	EMOJI_CLAP: '👏',
	EMOJI_SPRITE_SIZE: 32,
	EMOJI_ROW_HEIGHT: 48,
	CATEGORY_HEADER_HEIGHT: 32,
	EMOJIS_PER_ROW: 9,
	OVERSCAN_ROWS: 5,
	getSpriteSheetPath: () => 'sprite.png',
	getSpriteSheetBackground: () => 'url(sprite.png)',
}));

vi.mock('~/components/modals/ImageCropModal', () => ({
	default: () => null,
}));

vi.mock('@lingui/core/macro', () => {
	const formatMessage = (
		str: TemplateStringsArray | string | {message?: string; defaultMessage?: string} | undefined,
		...expr: Array<unknown>
	) => {
		if (typeof str === 'string') return str;
		if (Array.isArray(str)) {
			return String(str.reduce((acc, chunk, i) => acc + chunk + (expr[i] ?? ''), ''));
		}
		if (str && typeof str === 'object') {
			return (str as any).message ?? (str as any).defaultMessage ?? '';
		}
		return '';
	};

	return {
		t: formatMessage,
		msg: formatMessage,
	};
});

vi.mock('@lingui/react/macro', async () => {
	const React = await import('react');

	interface TransProps {
		children?: ReactNode;
		id?: string;
		message?: ReactNode;
	}

	const Trans = observer(({children, id, message}: TransProps) => {
		if (children != null) return React.createElement(React.Fragment, null, children);
		return React.createElement('span', null, message ?? id ?? null);
	});

	interface PluralProps {
		value: number;
		one?: ReactNode;
		other?: ReactNode;
		zero?: ReactNode;
		few?: ReactNode;
		many?: ReactNode;
	}

	const Plural = observer(({value, one, other, zero, few, many}: PluralProps) => {
		if (value === 0 && zero != null) return zero;
		if (value === 1 && one != null) return one;
		if (typeof few !== 'undefined' && value >= 2 && value <= 4) return few;
		if (typeof many !== 'undefined' && value >= 5) return many;
		return other ?? null;
	});

	interface SelectProps extends Record<string, ReactNode | string | number | undefined> {
		value: string | number;
		other?: ReactNode;
	}

	const Select = observer(({value, other, ...cases}: SelectProps) => {
		const key = String(value);
		return Object.hasOwn(cases, key) ? (cases[key] as ReactNode) : (other ?? null);
	});

	const SelectOrdinal = Plural;

	return {
		Trans,
		Plural,
		Select,
		SelectOrdinal,
	};
});

vi.mock('~/utils/NotificationUtils', () => ({
	ensureDesktopNotificationClickHandler: vi.fn(),
	hasNotification: () => false,
	isGranted: async () => false,
	playNotificationSoundIfEnabled: vi.fn(),
	requestPermission: async () => {},
	showNotification: async () => ({browserNotification: null, nativeNotificationId: null}),
	closeNativeNotification: () => undefined,
	closeNativeNotifications: () => undefined,
}));

/*
 * WAAPI mock for happy-dom, which doesn't ship `element.animate()`.
 *
 * The animation engine falls back to rAF when `element.animate` is absent, but
 * that path uses real `requestAnimationFrame` timing — fine in a browser, but
 * in unit tests we want the WAAPI path exercised deterministically. This mock
 * returns a fake Animation whose `onfinish` fires synchronously on the next
 * microtask, so `playAnimation(...).finished` resolves without waiting on rAF.
 */
class FakeAnimation {
	onfinish: (() => void) | null = null;
	oncancel: (() => void) | null = null;
	private cancelled = false;
	playbackRate = 1;
	startTime = null;
	currentTime = null;

	constructor(private readonly keyframes: Keyframe[], private readonly options: KeyframeAnimationOptions) {}

	cancel() {
		if (this.cancelled) return;
		this.cancelled = true;
		this.oncancel?.();
	}
	finish() {
		if (this.cancelled) return;
		this.onfinish?.();
	}
	commitStyles() {}
}

// Install animate() on Element.prototype so every element supports it.
if (typeof Element !== 'undefined' && !Element.prototype.animate) {
	Object.defineProperty(Element.prototype, 'animate', {
		configurable: true,
		writable: true,
		value(this: Element, keyframes: Keyframe[], options: KeyframeAnimationOptions) {
			const anim = new FakeAnimation(keyframes, options);
			// Fire onfinish on the next microtask so `.finished` resolves.
			queueMicrotask(() => anim.finish());
			return anim as unknown as Animation;
		},
	});
}

// getTotalLength stub for SVGPathElement (pathLength tests). happy-dom ships
// one that returns 0, so override unconditionally.
if (typeof SVGPathElement !== 'undefined') {
	Object.defineProperty(SVGPathElement.prototype, 'getTotalLength', {
		configurable: true,
		writable: true,
		value() {
			return 100;
		},
	});
}

// rAF polyfill for happy-dom (used by the rAF fallback + attribute writer).
if (typeof globalThis.requestAnimationFrame !== 'function') {
	globalThis.requestAnimationFrame = ((cb: FrameRequestCallback): number => {
		return setTimeout(() => cb(performance.now()), 0) as unknown as number;
	}) as typeof requestAnimationFrame;
	globalThis.cancelAnimationFrame = ((id: number) => clearTimeout(id)) as typeof cancelAnimationFrame;
}
