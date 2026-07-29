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

import {useLingui} from '@lingui/react/macro';
import {ArrowsCounterClockwiseIcon, CheckIcon, ShareNetworkIcon} from '@phosphor-icons/react';
import {clsx} from 'clsx';
import {observer} from 'mobx-react-lite';
import React from 'react';
import * as AccessibilityActionCreators from '~/actions/AccessibilityActionCreators';
import * as ModalActionCreators from '~/actions/ModalActionCreators';
import * as ToastActionCreators from '~/actions/ToastActionCreators';
import * as UserSettingsActionCreators from '~/actions/UserSettingsActionCreators';
import {ThemeTypes} from '~/Constants';
import {
	CHAT_BACKGROUND_ASSETS,
	type ChatBackgroundAsset,
} from '~/constants/chatBackgrounds';
import {ColorPickerField} from '~/components/form/ColorPickerField';
import {Textarea} from '~/components/form/Input';
import {Switch} from '~/components/form/Switch';
import {ShareThemeModal} from '~/components/modals/ShareThemeModal';
import {Accordion} from '~/components/uikit/Accordion/Accordion';
import {Button} from '~/components/uikit/Button/Button';
import FocusRing from '~/components/uikit/FocusRing/FocusRing';
import {Slider} from '~/components/uikit/Slider';
import {Tooltip} from '~/components/uikit/Tooltip/Tooltip';
import AccessibilityStore, {
	type ButtonMotionStyle,
	BUTTON_MOTION_STYLES,
	DEFAULT_CUSTOM_THEME_GRADIENT,
	type MessageGradientStyle,
	MESSAGE_GRADIENT_STYLES,
	type ThemeGradientStyle,
} from '~/stores/AccessibilityStore';
import UserSettingsStore from '~/stores/UserSettingsStore';
import styles from './ThemeTab.module.css';

interface ThemeButtonProps {
	optionId: string;
	isSelected: boolean;
	label: string;
	description: string;
	swatchBackground: string;
	swatchIconColor?: string;
	onKeyDown: (event: React.KeyboardEvent, optionId: string) => void;
	onClick: (optionId: string) => void;
	icon?: React.ReactElement<Record<string, unknown>>;
}

const LOCAL_ONLY_THEME_TYPES = new Set<string>([
	ThemeTypes.GREEN,
	ThemeTypes.GRAY,
	ThemeTypes.BLUE,
	ThemeTypes.SUNSET,
	ThemeTypes.NIGHT_SKY,
	ThemeTypes.PURPLE,
	ThemeTypes.ORANGE,
	ThemeTypes.PINK,
	ThemeTypes.YELLOW,
]);

const CUSTOM_THEME_SAVE_DELAY_MS = 48;

const ThemeButton = observer(
	React.forwardRef<HTMLButtonElement, ThemeButtonProps>(
		({optionId, isSelected, label, description, swatchBackground, swatchIconColor, onKeyDown, onClick, icon}, ref) => {
			return (
				<FocusRing offset={-2}>
					<button
						ref={ref}
						type="button"
						onClick={() => onClick(optionId)}
						onKeyDown={(e) => onKeyDown(e, optionId)}
						className={clsx(styles.themeButton, isSelected && styles.themeButtonSelected)}
						role="radio"
						aria-checked={isSelected}
						aria-label={label}
						tabIndex={isSelected ? 0 : -1}
					>
						<span className={styles.themeSwatch} style={{background: swatchBackground}} aria-hidden="true">
							{icon && (
								<span className={styles.themeButtonIcon} aria-hidden="true">
									{React.cloneElement(icon, {
										size: 18,
										weight: 'bold',
										style: {color: swatchIconColor ?? '#f8fafc'},
									})}
								</span>
							)}
							{isSelected && (
								<span className={styles.themeButtonCheckmark} aria-hidden="true">
									<CheckIcon weight="bold" className={styles.themeButtonCheckmarkIcon} size={12} />
								</span>
							)}
						</span>
						<span className={styles.themeButtonContent}>
							<span className={styles.themeButtonLabel}>{label}</span>
							<span className={styles.themeButtonDescription}>{description}</span>
						</span>
					</button>
				</FocusRing>
			);
		},
	),
);

function clampByte(value: number): number {
	return Math.max(0, Math.min(255, Math.round(value)));
}

function numberToHex(value: number): string {
	return `#${(value >>> 0).toString(16).padStart(6, '0').slice(-6)}`.toUpperCase();
}

const parsedCssColorNumberCache = new Map<string, number | null>();
let colorParseContext: CanvasRenderingContext2D | null | undefined;

function getColorParseContext(): CanvasRenderingContext2D | null {
	if (typeof document === 'undefined') return null;
	if (colorParseContext !== undefined) return colorParseContext;
	const canvas = document.createElement('canvas');
	colorParseContext = canvas.getContext('2d');
	return colorParseContext;
}

function cssColorStringToNumber(color: string): number | null {
	const cached = parsedCssColorNumberCache.get(color);
	if (cached !== undefined || parsedCssColorNumberCache.has(color)) return cached ?? null;

	const context = getColorParseContext();

	if (!context) return null;

	try {
		context.fillStyle = '#000';
		context.fillStyle = color;
		const parsed = String(context.fillStyle);

		const match = /^rgba?\((\d+),\s*(\d+),\s*(\d+)/i.exec(parsed);
		if (match) {
			const red = parseInt(match[1] ?? '0', 10);
			const green = parseInt(match[2] ?? '0', 10);
			const blue = parseInt(match[3] ?? '0', 10);
			const hex = `#${clampByte(red).toString(16).padStart(2, '0')}${clampByte(green)
				.toString(16)
				.padStart(2, '0')}${clampByte(blue).toString(16).padStart(2, '0')}`.toUpperCase();
			const value = Number.parseInt(hex.slice(1), 16) >>> 0;

			parsedCssColorNumberCache.set(color, value);
			return value;
		}

		if (/^#[0-9A-Fa-f]{6}$/.test(parsed)) {
			const value = Number.parseInt(parsed.slice(1), 16) >>> 0;
			parsedCssColorNumberCache.set(color, value);
			return value;
		}
	} catch {
		parsedCssColorNumberCache.set(color, null);
		return null;
	}

	parsedCssColorNumberCache.set(color, null);
	return null;
}

const mixedColorCache = new Map<string, string>();

function mixHexColors(first: number, second: number, ratio: number): string {
	const cacheKey = `${first}:${second}:${ratio}`;
	const cached = mixedColorCache.get(cacheKey);
	if (cached) return cached;

	const firstRed = (first >> 16) & 255;
	const firstGreen = (first >> 8) & 255;
	const firstBlue = first & 255;
	const secondRed = (second >> 16) & 255;
	const secondGreen = (second >> 8) & 255;
	const secondBlue = second & 255;

	const red = clampByte(firstRed * (1 - ratio) + secondRed * ratio);
	const green = clampByte(firstGreen * (1 - ratio) + secondGreen * ratio);
	const blue = clampByte(firstBlue * (1 - ratio) + secondBlue * ratio);
	const mixed = numberToHex((red << 16) + (green << 8) + blue);
	if (mixedColorCache.size > 1200) {
		mixedColorCache.clear();
	}
	mixedColorCache.set(cacheKey, mixed);
	return mixed;
}

function hexToNumber(hex: string): number {
	return Number.parseInt(hex.replace('#', '').slice(0, 6), 16) >>> 0;
}

function quantizeColorNumber(value: number): number {
	const step = 4;
	const red = clampByte(Math.round(((value >> 16) & 255) / step) * step);
	const green = clampByte(Math.round(((value >> 8) & 255) / step) * step);
	const blue = clampByte(Math.round((value & 255) / step) * step);
	return (red << 16) + (green << 8) + blue;
}

function rgbaFromNumber(value: number, alpha: number): string {
	const red = (value >> 16) & 255;
	const green = (value >> 8) & 255;
	const blue = value & 255;
	return `rgb(${red} ${green} ${blue} / ${alpha})`;
}

const FAST_CUSTOM_THEME_STYLE_ID = 'Astral-fast-custom-theme-style';
const FAST_CUSTOM_THEME_RULE_SELECTOR = "html[data-theme-gradient-style='custom']";
type FastCustomThemeToken = readonly [name: string, value: string];
const fastCustomThemeTokenCache = new Map<string, ReadonlyArray<FastCustomThemeToken>>();
const lastFastCustomThemeTokenValues = new Map<string, string>();
let liveThemeEditTimer: number | null = null;
let fastCustomThemeFrame: number | null = null;
let queuedFastCustomThemeTokens: ReadonlyArray<FastCustomThemeToken> | null = null;
let hasAppliedFastCustomThemeTokens = false;
let fastCustomThemeRule: CSSStyleRule | null = null;

function getFastCustomThemeRule(): CSSStyleRule | null {
	if (typeof document === 'undefined') return null;
	if (fastCustomThemeRule) return fastCustomThemeRule;

	let styleElement = document.getElementById(FAST_CUSTOM_THEME_STYLE_ID) as HTMLStyleElement | null;
	if (!styleElement) {
		styleElement = document.createElement('style');
		styleElement.id = FAST_CUSTOM_THEME_STYLE_ID;
		styleElement.textContent = `${FAST_CUSTOM_THEME_RULE_SELECTOR}{}`;
		document.head.appendChild(styleElement);
	}

	const sheet = styleElement.sheet as CSSStyleSheet | null;
	if (!sheet) return null;

	try {
		if (sheet.cssRules.length === 0) {
			sheet.insertRule(`${FAST_CUSTOM_THEME_RULE_SELECTOR}{}`, 0);
		}

		for (const rule of Array.from(sheet.cssRules)) {
			if ('selectorText' in rule && rule.selectorText === FAST_CUSTOM_THEME_RULE_SELECTOR) {
				fastCustomThemeRule = rule as CSSStyleRule;
				return fastCustomThemeRule;
			}
		}

		sheet.insertRule(`${FAST_CUSTOM_THEME_RULE_SELECTOR}{}`, sheet.cssRules.length);
		fastCustomThemeRule = sheet.cssRules[sheet.cssRules.length - 1] as CSSStyleRule;
		return fastCustomThemeRule;
	} catch {
		return null;
	}
}

function buildFastCustomThemeTokens(
	start: string,
	middle: string,
	end: string,
	angle: number,
	glow: number,
): ReadonlyArray<FastCustomThemeToken> {
	const cacheKey = `${start}:${middle}:${end}:${angle}:${glow}`;
	const cached = fastCustomThemeTokenCache.get(cacheKey);
	if (cached) return cached;

	const accent = hexToNumber(middle);
	const startNumber = hexToNumber(start);
	const endNumber = hexToNumber(end);
	const shellStart = mixHexColors(0x080a10, accent, 0.12);
	const shellEnd = mixHexColors(0x111827, accent, 0.22);
	const shellStartNumber = hexToNumber(shellStart);
	const shellEndNumber = hexToNumber(shellEnd);
	const shellSurface = mixHexColors(0x151a21, accent, 0.18);
	const backgroundPrimary = shellSurface;
	const backgroundSecondary = mixHexColors(0x0d1117, accent, 0.12);
	const backgroundPrimaryNumber = hexToNumber(backgroundPrimary);
	const backgroundSecondaryNumber = hexToNumber(backgroundSecondary);
	const backgroundSecondaryAlt = mixHexColors(0x161d27, accent, 0.18);
	const backgroundTertiary = mixHexColors(0x1b2330, accent, 0.22);
	const backgroundTextarea = mixHexColors(0x0b1016, accent, 0.18);
	const backgroundHeaderPrimary = mixHexColors(0x0d1117, accent, 0.14);
	const backgroundHeaderPrimaryHover = mixHexColors(0x1f2937, accent, 0.26);
	const backgroundHeaderSecondary = mixHexColors(0x10161e, accent, 0.18);
	const backgroundFloating = mixHexColors(0x111923, accent, 0.22);
	const panelControlBg = mixHexColors(0x161b22, accent, 0.24);
	const textAccentMuted = mixHexColors(0x94a3b8, accent, 0.18);
	const textChatMuted = mixHexColors(0x94a3b8, accent, 0.2);
	const brandSecondary = mixHexColors(accent, 0x000000, 0.18);
	const brandPrimaryLight = mixHexColors(accent, 0xffffff, 0.42);
	const buttonPrimaryActive = mixHexColors(accent, 0x000000, 0.16);
	const buttonSecondaryFill = mixHexColors(0x1a212c, accent, 0.22);
	const buttonSecondaryActive = mixHexColors(0x232c39, accent, 0.3);
	const textLink = mixHexColors(accent, 0xffffff, 0.28);
	const iconAccent = mixHexColors(accent, 0xffffff, 0.26);
	const focusPrimary = mixHexColors(accent, 0xffffff, 0.28);
	const appGradientStart = mixHexColors(shellStartNumber, startNumber, 0.16);
	const appGradientMiddle = mixHexColors(shellEndNumber, accent, 0.2);
	const appGradientEnd = mixHexColors(shellEndNumber, endNumber, 0.26);
	const incomingBubbleFill = `linear-gradient(135deg, ${mixHexColors(startNumber, backgroundSecondaryNumber, 0.72)}, ${mixHexColors(accent, backgroundPrimaryNumber, 0.78)})`;
	const incomingBubbleHoverFill = `linear-gradient(135deg, ${mixHexColors(startNumber, backgroundSecondaryNumber, 0.64)}, ${mixHexColors(accent, backgroundPrimaryNumber, 0.7)})`;
	const incomingBubbleTailFill = mixHexColors(startNumber, backgroundSecondaryNumber, 0.72);
	const incomingBubbleHoverTailFill = mixHexColors(startNumber, backgroundSecondaryNumber, 0.64);
	const selfBubbleFill = `linear-gradient(135deg, ${start}, ${middle}, ${end})`;
	const selfBubbleHoverFill = `linear-gradient(135deg, ${mixHexColors(startNumber, 0xffffff, 0.18)}, ${mixHexColors(accent, 0xffffff, 0.18)}, ${mixHexColors(endNumber, 0xffffff, 0.18)})`;
	const selfBubbleHoverTailFill = mixHexColors(startNumber, 0xffffff, 0.18);

	const tokens: Array<FastCustomThemeToken> = [
		['--theme-custom-gradient-start', start],
		['--theme-custom-gradient-middle', middle],
		['--theme-custom-gradient-end', end],
		['--theme-custom-gradient-angle', `${angle}deg`],
		['--theme-custom-gradient-overlay-opacity', `${glow / 100}`],
		['--theme-shell-start', shellStart],
		['--theme-shell-end', shellEnd],
		['--theme-shell-surface', shellSurface],
		['--background-primary', backgroundPrimary],
		['--background-secondary', backgroundSecondary],
		['--background-secondary-alt', backgroundSecondaryAlt],
		['--background-tertiary', backgroundTertiary],
		['--background-textarea', backgroundTextarea],
		['--background-header-primary', backgroundHeaderPrimary],
		['--background-header-primary-hover', backgroundHeaderPrimaryHover],
		['--background-header-secondary', backgroundHeaderSecondary],
		['--guild-list-foreground', backgroundPrimary],
		['--background-floating', backgroundFloating],
		['--panel-control-bg', panelControlBg],
		['--panel-control-border', rgbaFromNumber(accent, 0.32)],
		['--panel-control-divider', rgbaFromNumber(accent, 0.2)],
		['--background-modifier-hover', rgbaFromNumber(accent, 0.1)],
		['--background-modifier-selected', rgbaFromNumber(accent, 0.24)],
		['--background-modifier-accent', rgbaFromNumber(accent, 0.18)],
		['--text-primary', '#f8fafc'],
		['--text-secondary', '#dbe4f0'],
		['--text-tertiary', textAccentMuted],
		['--text-primary-muted', textAccentMuted],
		['--text-chat', '#edf2fb'],
		['--text-chat-muted', textChatMuted],
		['--text-link', textLink],
		['--text-selection', rgbaFromNumber(accent, 0.3)],
		['--brand-primary', middle],
		['--brand-secondary', brandSecondary],
		['--brand-primary-light', brandPrimaryLight],
		['--button-primary-fill', middle],
		['--button-primary-active-fill', buttonPrimaryActive],
		['--button-primary-border', rgbaFromNumber(accent, 0.38)],
		['--button-secondary-fill', buttonSecondaryFill],
		['--button-secondary-active-fill', buttonSecondaryActive],
		['--button-secondary-active-border', rgbaFromNumber(accent, 0.3)],
		['--icon-accent', iconAccent],
		['--focus-primary', focusPrimary],
		['--message-bubble-fill', incomingBubbleFill],
		['--message-bubble-hover-fill', incomingBubbleHoverFill],
		['--message-bubble-tail-fill', incomingBubbleTailFill],
		['--message-bubble-hover-tail-fill', incomingBubbleHoverTailFill],
		['--message-self-bubble-fill', selfBubbleFill],
		['--message-self-bubble-hover-fill', selfBubbleHoverFill],
		['--message-self-bubble-tail-fill', start],
		['--message-self-bubble-hover-tail-fill', selfBubbleHoverTailFill],
		['--message-self-bubble-border', rgbaFromNumber(accent, 0.38)],
		['--app-shell-background', `linear-gradient(${angle}deg, ${appGradientStart}, ${appGradientMiddle}, ${appGradientEnd})`],
		['--app-surface-background', shellSurface],
		['--theme-preset-overlay-background', `radial-gradient(900px 600px at 15% 5%, ${rgbaFromNumber(startNumber, 0.2)}, transparent 75%)`],
		['--theme-preset-overlay-opacity', `${glow / 100}`],
		['--chat-gradient-overlay-background', 'var(--theme-preset-overlay-background)'],
		['--chat-gradient-overlay-opacity', `${glow / 100}`],
	];

	if (fastCustomThemeTokenCache.size > 180) {
		fastCustomThemeTokenCache.clear();
	}
	fastCustomThemeTokenCache.set(cacheKey, tokens);
	return tokens;
}

function applyFastCustomThemeTokens(tokens: ReadonlyArray<FastCustomThemeToken>) {
	const rule = getFastCustomThemeRule();
	if (!rule) return;

	for (const [name, value] of tokens) {
		if (lastFastCustomThemeTokenValues.get(name) === value) continue;
		rule.style.setProperty(name, value);
		lastFastCustomThemeTokenValues.set(name, value);
	}
}

function applyCustomThemeVariablesImmediately(start: string, middle: string, end: string, angle: number, glow: number) {
	if (typeof document === 'undefined') return;
	const root = document.documentElement;
	root.dataset.themeGradientStyle = 'custom';
	root.dataset.messageGradientStyle = 'custom';
	root.dataset.themeLiveEdit = '1';
	root.style.setProperty('--theme-custom-gradient-start', start);
	root.style.setProperty('--theme-custom-gradient-middle', middle);
	root.style.setProperty('--theme-custom-gradient-end', end);
	root.style.setProperty('--theme-custom-gradient-angle', `${angle}deg`);
	root.style.setProperty('--theme-custom-gradient-overlay-opacity', `${glow / 100}`);
	if (typeof window !== 'undefined') {
		if (liveThemeEditTimer !== null) {
			window.clearTimeout(liveThemeEditTimer);
		}
		liveThemeEditTimer = window.setTimeout(() => {
			delete root.dataset.themeLiveEdit;
			liveThemeEditTimer = null;
			hasAppliedFastCustomThemeTokens = false;
		}, 120);
	}

	const nextTokens = buildFastCustomThemeTokens(start, middle, end, angle, glow);
	const canUseAnimationFrame = typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function';
	if (!hasAppliedFastCustomThemeTokens || !canUseAnimationFrame) {
		hasAppliedFastCustomThemeTokens = true;
		applyFastCustomThemeTokens(nextTokens);
		return;
	}

	queuedFastCustomThemeTokens = nextTokens;
	if (fastCustomThemeFrame !== null) return;
	fastCustomThemeFrame = window.requestAnimationFrame(() => {
		fastCustomThemeFrame = null;
		const queuedTokens = queuedFastCustomThemeTokens;
		queuedFastCustomThemeTokens = null;
		if (!queuedTokens) return;
		hasAppliedFastCustomThemeTokens = true;
		applyFastCustomThemeTokens(queuedTokens);
	});
}

function buildCustomGradientPreview(
	startColor: string,
	middleColor: string,
	endColor: string,
	angle: number,
): string {
	return [
		`radial-gradient(900px 600px at 15% 5%, color-mix(in srgb, ${startColor} 20%, transparent), transparent 75%)`,
		`linear-gradient(${angle}deg, color-mix(in srgb, var(--theme-shell-start) 84%, ${startColor} 16%), color-mix(in srgb, var(--theme-shell-end) 80%, ${middleColor} 20%), color-mix(in srgb, var(--theme-shell-end) 74%, ${endColor} 26%))`,
	].join(', ');
}

const GRADIENT_PREVIEW_BACKGROUNDS: Record<Exclude<ThemeGradientStyle, 'custom'>, string> = {
	default: 'linear-gradient(145deg, var(--theme-shell-start) 0%, var(--theme-shell-end) 100%)',
	legacy:
		'linear-gradient(180deg, color-mix(in srgb, var(--theme-shell-start) 92%, #2f3136 8%) 0%, color-mix(in srgb, var(--theme-shell-end) 92%, #2b2d31 8%) 100%)',
	aurora:
		'radial-gradient(680px 420px at 8% -14%, rgb(34 197 94 / 24%), transparent 62%), radial-gradient(620px 400px at 95% -6%, rgb(129 140 248 / 24%), transparent 62%), linear-gradient(138deg, color-mix(in srgb, var(--theme-shell-start) 82%, #0f473b 18%) 0%, color-mix(in srgb, var(--theme-shell-end) 76%, #1c3d63 24%) 52%, color-mix(in srgb, var(--theme-shell-end) 70%, #36255b 30%) 100%)',
	sunset:
		'radial-gradient(620px 380px at 98% -12%, rgb(249 115 22 / 26%), transparent 62%), radial-gradient(540px 360px at 0% 110%, rgb(244 63 94 / 24%), transparent 64%), linear-gradient(145deg, color-mix(in srgb, var(--theme-shell-start) 82%, #512127 18%) 0%, color-mix(in srgb, var(--theme-shell-end) 76%, #6f3027 24%) 44%, color-mix(in srgb, var(--theme-shell-end) 70%, #6a2141 30%) 100%)',
	ocean:
		'radial-gradient(660px 420px at 100% -10%, rgb(6 182 212 / 24%), transparent 60%), radial-gradient(620px 360px at -8% 104%, rgb(14 165 233 / 24%), transparent 62%), linear-gradient(138deg, color-mix(in srgb, var(--theme-shell-start) 82%, #053550 18%) 0%, color-mix(in srgb, var(--theme-shell-end) 76%, #0c5570 24%) 48%, color-mix(in srgb, var(--theme-shell-end) 70%, #1a2b64 30%) 100%)',
	midnight:
		'radial-gradient(620px 360px at 95% -18%, rgb(168 85 247 / 20%), transparent 60%), radial-gradient(500px 320px at 8% 108%, rgb(79 70 229 / 20%), transparent 62%), linear-gradient(136deg, color-mix(in srgb, var(--theme-shell-start) 84%, #1a143f 16%) 0%, color-mix(in srgb, var(--theme-shell-end) 80%, #2c2461 20%) 46%, color-mix(in srgb, var(--theme-shell-end) 74%, #3b275d 26%) 100%)',
	forest:
		'radial-gradient(620px 380px at 10% -18%, rgb(34 197 94 / 24%), transparent 60%), radial-gradient(560px 340px at 92% 2%, rgb(16 185 129 / 22%), transparent 62%), linear-gradient(140deg, color-mix(in srgb, var(--theme-shell-start) 82%, #134028 18%) 0%, color-mix(in srgb, var(--theme-shell-end) 76%, #1f5a37 24%) 44%, color-mix(in srgb, var(--theme-shell-end) 70%, #335d2a 30%) 100%)',
	ember:
		'radial-gradient(640px 390px at 92% -16%, rgb(239 68 68 / 30%), transparent 60%), radial-gradient(580px 360px at 5% 8%, rgb(234 88 12 / 24%), transparent 62%), linear-gradient(145deg, color-mix(in srgb, var(--theme-shell-start) 82%, #5a1816 18%) 0%, color-mix(in srgb, var(--theme-shell-end) 76%, #7a2e16 24%) 42%, color-mix(in srgb, var(--theme-shell-end) 70%, #7c1f34 30%) 100%)',
	nebula:
		'radial-gradient(620px 380px at 90% -20%, rgb(217 70 239 / 24%), transparent 60%), radial-gradient(560px 340px at 0% 18%, rgb(99 102 241 / 22%), transparent 62%), linear-gradient(138deg, color-mix(in srgb, var(--theme-shell-start) 84%, #34155f 16%) 0%, color-mix(in srgb, var(--theme-shell-end) 78%, #4a2175 22%) 46%, color-mix(in srgb, var(--theme-shell-end) 72%, #5a246b 28%) 100%)',
	magenta:
		'radial-gradient(620px 380px at 92% -18%, rgb(236 72 153 / 28%), transparent 60%), radial-gradient(560px 340px at 4% 12%, rgb(168 85 247 / 24%), transparent 62%), linear-gradient(138deg, color-mix(in srgb, var(--theme-shell-start) 82%, #4c1238 18%) 0%, color-mix(in srgb, var(--theme-shell-end) 76%, #641b6e 24%) 46%, color-mix(in srgb, var(--theme-shell-end) 70%, #7a1c55 30%) 100%)',
	orchid:
		'radial-gradient(620px 380px at 88% -16%, rgb(168 85 247 / 30%), transparent 60%), radial-gradient(520px 340px at 6% 10%, rgb(99 102 241 / 26%), transparent 62%), linear-gradient(138deg, color-mix(in srgb, var(--theme-shell-start) 80%, #26135f 20%) 0%, color-mix(in srgb, var(--theme-shell-end) 74%, #4c1d95 26%) 48%, color-mix(in srgb, var(--theme-shell-end) 70%, #7e22ce 30%) 100%)',
	coral:
		'radial-gradient(640px 390px at 90% -14%, rgb(251 113 133 / 28%), transparent 60%), radial-gradient(560px 360px at 6% 8%, rgb(249 115 22 / 24%), transparent 62%), linear-gradient(142deg, color-mix(in srgb, var(--theme-shell-start) 82%, #4a1622 18%) 0%, color-mix(in srgb, var(--theme-shell-end) 76%, #7c2d12 24%) 46%, color-mix(in srgb, var(--theme-shell-end) 70%, #9f1239 30%) 100%)',
	lime:
		'radial-gradient(620px 380px at 12% -16%, rgb(132 204 22 / 28%), transparent 60%), radial-gradient(560px 340px at 92% 4%, rgb(20 184 166 / 24%), transparent 62%), linear-gradient(140deg, color-mix(in srgb, var(--theme-shell-start) 82%, #164e1f 18%) 0%, color-mix(in srgb, var(--theme-shell-end) 76%, #166534 24%) 44%, color-mix(in srgb, var(--theme-shell-end) 70%, #3f6212 30%) 100%)',
};

interface ThemeOption {
	id: string;
	type: string;
	label: string;
	description: string;
	swatchBackground: string;
	swatchIconColor?: string;
	icon: React.ReactElement<Record<string, unknown>> | null;
	tooltip: string;
	themeGradientStyle?: ThemeGradientStyle;
	messageGradientStyle?: MessageGradientStyle;
	buttonMotionStyle?: ButtonMotionStyle;
}

interface StylePreset {
	id: string;
	label: string;
	description: string;
	gradient: ThemeGradientStyle;
	buttonMotion: ButtonMotionStyle;
	messageGradient: MessageGradientStyle;
	deprecated?: boolean;
}

interface MessageGradientOption {
	id: MessageGradientStyle;
	label: string;
	description: string;
}

interface ThemeTabContentProps {
	mode?: 'theme' | 'studio';
}

const THEME_STYLE_MATCHES: Partial<
	Record<
		string,
		{
			themeGradientStyle: ThemeGradientStyle;
			messageGradientStyle: MessageGradientStyle;
			buttonMotionStyle?: ButtonMotionStyle;
		}
	>
> = {
	[ThemeTypes.DARK]: {themeGradientStyle: 'default', messageGradientStyle: 'theme'},
	[ThemeTypes.COAL]: {themeGradientStyle: 'midnight', messageGradientStyle: 'mono', buttonMotionStyle: 'soft'},
	[ThemeTypes.GREEN]: {themeGradientStyle: 'forest', messageGradientStyle: 'forest'},
	[ThemeTypes.GRAY]: {themeGradientStyle: 'legacy', messageGradientStyle: 'mono'},
	[ThemeTypes.BLUE]: {themeGradientStyle: 'ocean', messageGradientStyle: 'ocean', buttonMotionStyle: 'soft'},
	[ThemeTypes.SUNSET]: {themeGradientStyle: 'sunset', messageGradientStyle: 'sunset', buttonMotionStyle: 'static'},
	[ThemeTypes.NIGHT_SKY]: {themeGradientStyle: 'midnight', messageGradientStyle: 'nebula', buttonMotionStyle: 'soft'},
	[ThemeTypes.PURPLE]: {themeGradientStyle: 'nebula', messageGradientStyle: 'nebula', buttonMotionStyle: 'soft'},
	[ThemeTypes.ORANGE]: {themeGradientStyle: 'ember', messageGradientStyle: 'ember', buttonMotionStyle: 'snappy'},
	[ThemeTypes.PINK]: {themeGradientStyle: 'magenta', messageGradientStyle: 'magenta', buttonMotionStyle: 'soft'},
	[ThemeTypes.YELLOW]: {themeGradientStyle: 'ember', messageGradientStyle: 'ember'},
	[ThemeTypes.LIGHT]: {themeGradientStyle: 'default', messageGradientStyle: 'soft'},
};

export const ThemeTabContent: React.FC<ThemeTabContentProps> = observer(({mode = 'theme'}) => {
	const {t} = useLingui();
	const {theme} = UserSettingsStore;
	const syncThemeAcrossDevices = AccessibilityStore.syncThemeAcrossDevices;
	const localThemeOverride = AccessibilityStore.localThemeOverride;
	const customThemeCss = AccessibilityStore.customThemeCss ?? '';
	const themeGradientStyle = AccessibilityStore.themeGradientStyle;
	const buttonMotionStyle = AccessibilityStore.buttonMotionStyle;
	const customThemeGradientStart = AccessibilityStore.customThemeGradientStart;
	const customThemeGradientMiddle = AccessibilityStore.customThemeGradientMiddle;
	const customThemeGradientEnd = AccessibilityStore.customThemeGradientEnd;
	const customThemeGradientAngle = AccessibilityStore.customThemeGradientAngle;
	const customThemeGradientGlow = AccessibilityStore.customThemeGradientGlow;
	const chatBackgroundId = AccessibilityStore.chatBackgroundId;
	const messageGradientStyle = AccessibilityStore.messageGradientStyle;

	const currentSelectedTheme = syncThemeAcrossDevices ? theme : localThemeOverride || theme;

	const [systemPrefersDark, setSystemPrefersDark] = React.useState(() => {
		if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
			return false;
		}

		try {
			return window.matchMedia('(prefers-color-scheme: dark)').matches;
		} catch {
			return false;
		}
	});
	const buttonRefs = React.useRef<Record<string, HTMLButtonElement | null>>({});
	const themeToFocusRef = React.useRef<string | null>(null);
	const customAccentSaveTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
	const pendingCustomAccentRef = React.useRef<{
		start: string;
		middle: string;
		end: string;
		glow: number;
	} | null>(null);

	React.useEffect(() => {
		if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;

		let mediaQuery: MediaQueryList;
		try {
			mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
		} catch {
			return;
		}

		const handleChange = (event: MediaQueryListEvent) => {
			setSystemPrefersDark(event.matches);
		};

		if (typeof mediaQuery.addEventListener === 'function') {
			mediaQuery.addEventListener('change', handleChange);
			return () => mediaQuery.removeEventListener('change', handleChange);
		}

		const legacyListener = (event: MediaQueryListEvent) => handleChange(event);
		(mediaQuery as any).addListener?.(legacyListener);
		return () => {
			(mediaQuery as any).removeListener?.(legacyListener);
		};
	}, []);

	const handleThemeChange = React.useCallback(
		(option: ThemeOption) => {
			if (customAccentSaveTimerRef.current) {
				clearTimeout(customAccentSaveTimerRef.current);
				customAccentSaveTimerRef.current = null;
			}
			pendingCustomAccentRef.current = null;

			const newTheme = option.type;
			themeToFocusRef.current = option.id;
			const matchedStyle = option.themeGradientStyle
				? {
						themeGradientStyle: option.themeGradientStyle,
						messageGradientStyle: option.messageGradientStyle ?? 'theme',
						buttonMotionStyle: option.buttonMotionStyle,
					}
				: THEME_STYLE_MATCHES[newTheme];

			if (matchedStyle) {
				AccessibilityActionCreators.update({
					buttonMotionStyle,
					...matchedStyle,
				});
			}

			const shouldUseLocalOnly = newTheme === ThemeTypes.SYSTEM || LOCAL_ONLY_THEME_TYPES.has(newTheme);
			if (shouldUseLocalOnly) {
				AccessibilityActionCreators.update({syncThemeAcrossDevices: false, localThemeOverride: newTheme});
			} else if (syncThemeAcrossDevices) {
				void UserSettingsActionCreators.update({theme: newTheme}).catch(() => {
					AccessibilityActionCreators.update({syncThemeAcrossDevices: false, localThemeOverride: newTheme});
					ToastActionCreators.error(t`Failed to apply theme.`);
				});
			} else {
				AccessibilityActionCreators.update({localThemeOverride: newTheme});
			}
		},
		[buttonMotionStyle, syncThemeAcrossDevices, t],
	);

	const themeOptions = React.useMemo(
		() => [
			{
				id: ThemeTypes.DARK,
				type: ThemeTypes.DARK,
				label: t`Dark Theme`,
				description: t`Default dark balance`,
				swatchBackground: 'linear-gradient(145deg, #0d1117 0%, #151a21 100%)',
				swatchIconColor: '#e6edf5',
				icon: null,
				tooltip: t`Use dark theme`,
			},
			{
				id: ThemeTypes.COAL,
				type: ThemeTypes.COAL,
				label: t`Coal Theme`,
				description: t`Pitch-black surfaces`,
				swatchBackground: 'linear-gradient(145deg, #05070a 0%, #0b0e12 100%)',
				swatchIconColor: '#f8fafc',
				icon: null,
				tooltip: t`Use coal theme (pitch-black surfaces)`,
			},
			{
				id: ThemeTypes.GREEN,
				type: ThemeTypes.GREEN,
				label: t`Green`,
				description: t`Dark emerald tone`,
				swatchBackground: 'linear-gradient(145deg, #0a1a13 0%, #123124 100%)',
				swatchIconColor: '#dcfce7',
				icon: null,
				tooltip: t`Use green theme`,
			},
			{
				id: ThemeTypes.GRAY,
				type: ThemeTypes.GRAY,
				label: t`Gray`,
				description: t`Neutral gray palette`,
				swatchBackground: 'linear-gradient(145deg, #181a1f 0%, #262a31 100%)',
				swatchIconColor: '#f3f4f6',
				icon: null,
				tooltip: t`Use gray theme`,
			},
			{
				id: ThemeTypes.BLUE,
				type: ThemeTypes.BLUE,
				label: t`Blue`,
				description: t`Telegram-like blue`,
				swatchBackground: 'linear-gradient(145deg, #17212b 0%, #233447 100%)',
				swatchIconColor: '#e0f2ff',
				icon: null,
				tooltip: t`Use blue theme`,
			},
			{
				id: ThemeTypes.SUNSET,
				type: ThemeTypes.SUNSET,
				label: t`Sunset`,
				description: t`Muted warm dusk tone`,
				swatchBackground: 'linear-gradient(145deg, #261a1d 0%, #3d2730 100%)',
				swatchIconColor: '#fde7df',
				icon: null,
				tooltip: t`Use sunset theme`,
			},
			{
				id: ThemeTypes.NIGHT_SKY,
				type: ThemeTypes.NIGHT_SKY,
				label: t`Night Sky`,
				description: t`Deep blue nocturnal palette`,
				swatchBackground: 'linear-gradient(145deg, #0d1724 0%, #1a2b43 100%)',
				swatchIconColor: '#deebff',
				icon: null,
				tooltip: t`Use night sky theme`,
			},
			{
				id: ThemeTypes.PURPLE,
				type: ThemeTypes.PURPLE,
				label: t`Purple`,
				description: t`Dark violet glow`,
				swatchBackground: 'linear-gradient(145deg, #1b1528 0%, #2c2142 100%)',
				swatchIconColor: '#ede4ff',
				icon: null,
				tooltip: t`Use purple theme`,
			},
			{
				id: ThemeTypes.ORANGE,
				type: ThemeTypes.ORANGE,
				label: t`Orange`,
				description: t`Burnt amber palette`,
				swatchBackground: 'linear-gradient(145deg, #23180f 0%, #382719 100%)',
				swatchIconColor: '#ffe8d0',
				icon: null,
				tooltip: t`Use orange theme`,
			},
			{
				id: ThemeTypes.PINK,
				type: ThemeTypes.PINK,
				label: t`Magenta`,
				description: t`Purple-pink neon bloom`,
				swatchBackground: 'linear-gradient(135deg, #7c3aed 0%, #ec4899 58%, #fb7185 100%)',
				swatchIconColor: '#fff1f7',
				icon: null,
				tooltip: t`Use magenta theme`,
			},
			{
				id: 'orchid',
				type: ThemeTypes.PURPLE,
				label: t`Orchid`,
				description: t`Electric violet bloom`,
				swatchBackground: 'linear-gradient(135deg, #4f46e5 0%, #a855f7 58%, #d946ef 100%)',
				swatchIconColor: '#f5e8ff',
				icon: null,
				tooltip: t`Use orchid theme`,
				themeGradientStyle: 'orchid',
				messageGradientStyle: 'nebula',
				buttonMotionStyle: 'soft',
			},
			{
				id: 'coral',
				type: ThemeTypes.SUNSET,
				label: t`Coral`,
				description: t`Rose-orange vivid dusk`,
				swatchBackground: 'linear-gradient(135deg, #fb7185 0%, #f97316 58%, #facc15 100%)',
				swatchIconColor: '#fff3e6',
				icon: null,
				tooltip: t`Use coral theme`,
				themeGradientStyle: 'coral',
				messageGradientStyle: 'sunset',
				buttonMotionStyle: 'snappy',
			},
			{
				id: 'lime',
				type: ThemeTypes.GREEN,
				label: t`Lime`,
				description: t`Fresh green neon pulse`,
				swatchBackground: 'linear-gradient(135deg, #22c55e 0%, #84cc16 52%, #14b8a6 100%)',
				swatchIconColor: '#f0fdf4',
				icon: null,
				tooltip: t`Use lime theme`,
				themeGradientStyle: 'lime',
				messageGradientStyle: 'forest',
				buttonMotionStyle: 'soft',
			},
			{
				id: ThemeTypes.YELLOW,
				type: ThemeTypes.YELLOW,
				label: t`Solar`,
				description: t`Golden warm glow`,
				swatchBackground: 'linear-gradient(135deg, #f59e0b 0%, #facc15 62%, #fde68a 100%)',
				swatchIconColor: '#ffefc2',
				icon: null,
				tooltip: t`Use solar theme`,
			},
			{
				id: ThemeTypes.LIGHT,
				type: ThemeTypes.LIGHT,
				label: t`Light Theme`,
				description: t`Bright and clean`,
				swatchBackground: 'linear-gradient(145deg, #ffffff 0%, #eef2f5 100%)',
				swatchIconColor: '#111827',
				icon: null,
				tooltip: t`Use light theme`,
			},
			{
				id: ThemeTypes.SYSTEM,
				type: ThemeTypes.SYSTEM,
				label: t`System Theme`,
				description: systemPrefersDark ? t`Now using dark mode` : t`Now using light mode`,
				swatchBackground: 'linear-gradient(90deg, #1d2027 0%, #1d2027 50%, #f3f4f6 50%, #f3f4f6 100%)',
				swatchIconColor: systemPrefersDark ? '#f8fafc' : '#111827',
				icon: <ArrowsCounterClockwiseIcon size={12} />,
				tooltip: systemPrefersDark
					? t`System: Dark theme (automatically sync with your system's dark/light preference)`
					: t`System: Light theme (automatically sync with your system's dark/light preference)`,
			},
		] as const satisfies ReadonlyArray<ThemeOption>,
		[systemPrefersDark, t],
	);

	const isThemeOptionSelected = React.useCallback(
		(option: ThemeOption) => {
			if (currentSelectedTheme !== option.type) return false;

			const matchedStyle = option.themeGradientStyle
				? {
						themeGradientStyle: option.themeGradientStyle,
						messageGradientStyle: option.messageGradientStyle ?? 'theme',
					}
				: THEME_STYLE_MATCHES[option.type];

			if (!matchedStyle?.themeGradientStyle) return true;
			if (themeGradientStyle !== matchedStyle.themeGradientStyle) return false;
			if (matchedStyle.messageGradientStyle && messageGradientStyle !== matchedStyle.messageGradientStyle) return false;
			return true;
		},
		[currentSelectedTheme, messageGradientStyle, themeGradientStyle],
	);

	const selectedThemeOptionId = React.useMemo(
		() => themeOptions.find((option) => isThemeOptionSelected(option))?.id ?? currentSelectedTheme,
		[currentSelectedTheme, isThemeOptionSelected, themeOptions],
	);

	const handleThemeOptionChange = React.useCallback(
		(optionId: string) => {
			const option = themeOptions.find((item) => item.id === optionId);
			if (!option) return;
			handleThemeChange(option);
		},
		[handleThemeChange, themeOptions],
	);

	const handleKeyDown = React.useCallback(
		(event: React.KeyboardEvent, targetOptionId: string) => {
			if (event.key === ' ' || event.key === 'Enter') {
				event.preventDefault();
				handleThemeOptionChange(targetOptionId);
			} else if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
				event.preventDefault();
				const order: ReadonlyArray<string> = themeOptions.map((option) => option.id);
				const direction = event.key === 'ArrowRight' ? 1 : -1;
				const currentIndex = Math.max(order.indexOf(selectedThemeOptionId), 0);
				const nextIndex = (currentIndex + direction + order.length) % order.length;
				const nextOptionId = order[nextIndex];
				if (nextOptionId) {
					handleThemeOptionChange(nextOptionId);
				}
			}
		},
		[handleThemeOptionChange, selectedThemeOptionId, themeOptions],
	);
	const handleShareTheme = React.useCallback(() => {
		const css = AccessibilityStore.customThemeCss ?? '';
		if (!css.trim()) {
			ToastActionCreators.error(t`You don't have any custom theme overrides to share yet.`);
			return;
		}

		ModalActionCreators.push(ModalActionCreators.modal(() => <ShareThemeModal themeCss={css} />));
	}, []);

	const handleResetAllOverrides = React.useCallback(() => {
		AccessibilityActionCreators.update({customThemeCss: null});
	}, []);

	const buttonMotionOptions = React.useMemo(
		() =>
			[
				{
					id: 'default' as ButtonMotionStyle,
					label: t`Default`,
					description: t`Standard press behavior`,
				},
				{
					id: 'soft' as ButtonMotionStyle,
					label: t`Soft`,
					description: t`Smooth, gentle click feedback`,
				},
				{
					id: 'snappy' as ButtonMotionStyle,
					label: t`Snappy`,
					description: t`Fast and punchy button response`,
				},
				{
					id: 'static' as ButtonMotionStyle,
					label: t`Static`,
					description: t`No movement on click`,
				},
			] as const,
		[t],
	);

	const stylePresets = React.useMemo(
		() =>
			[
				{
					id: 'studio',
					label: t`Studio`,
					description: t`Clean neutral base, crisp default motion`,
					gradient: 'default',
					buttonMotion: 'default',
					messageGradient: 'theme',
					deprecated: false,
				},
				{
					id: 'neon',
					label: t`Neon`,
					description: t`Emerald-violet Aurora, snappy fast clicks`,
					gradient: 'aurora',
					buttonMotion: 'snappy',
					messageGradient: 'aurora',
					deprecated: false,
				},
				{
					id: 'cinema',
					label: t`Cinema`,
					description: t`Deep violet Midnight with soft, cinematic motion`,
					gradient: 'midnight',
					buttonMotion: 'soft',
					messageGradient: 'nebula',
					deprecated: false,
				},
				{
					id: 'sunwave',
					label: t`Sunwave`,
					description: t`Warm Sunset glow with no button movement`,
					gradient: 'sunset',
					buttonMotion: 'static',
					messageGradient: 'sunset',
					deprecated: false,
				},
				{
					id: 'deepsea',
					label: t`Deep Sea`,
					description: t`Cool Ocean cyan with gentle soft motion`,
					gradient: 'ocean',
					buttonMotion: 'soft',
					messageGradient: 'ocean',
					deprecated: false,
				},
				{
					id: 'forest',
					label: t`Forest`,
					description: t`Living emerald canopy, balanced default motion`,
					gradient: 'forest',
					buttonMotion: 'default',
					messageGradient: 'forest',
					deprecated: false,
				},
				{
					id: 'ember',
					label: t`Ember`,
					description: t`Molten red-amber glow with snappy clicks`,
					gradient: 'ember',
					buttonMotion: 'snappy',
					messageGradient: 'ember',
					deprecated: false,
				},
				{
					id: 'nebula',
					label: t`Nebula`,
					description: t`Magenta-indigo cosmos with soft, airy motion`,
					gradient: 'nebula',
					buttonMotion: 'soft',
					messageGradient: 'nebula',
					deprecated: false,
				},
				{
					id: 'magenta',
					label: t`Magenta`,
					description: t`Bright purple-pink energy with soft motion`,
					gradient: 'magenta',
					buttonMotion: 'soft',
					messageGradient: 'magenta',
					deprecated: false,
				},
			] as const satisfies ReadonlyArray<StylePreset>,
		[t],
	);

	const chatBackgroundOptions = React.useMemo(
		() =>
			CHAT_BACKGROUND_ASSETS.map((asset) => {
				switch (asset.id) {
					case 'none':
						return {
							asset,
							label: t`Clean`,
							description: t`Clean base canvas for your own minimal chat style.`,
						};
					case 'constellation':
						return {
							asset,
							label: t`Star map`,
							description: t`High-detail space motif with a cinematic conversation mood.`,
						};
					case 'meteor':
						return {
							asset,
							label: t`Magic`,
							description: t`Decorative fantasy accents for a vivid message space.`,
						};
					case 'nebula_arcs':
						return {
							asset,
							label: t`Love`,
							description: t`Warm romantic pattern for a softer cozy atmosphere.`,
						};
					case 'winter':
						return {
							asset,
							label: t`Winter`,
							description: t`Cool seasonal pattern that stays readable in all themes.`,
						};
					case 'zoo':
						return {
							asset,
							label: t`Zoo`,
							description: t`Playful illustrated motif with balanced visibility.`,
						};
					default:
						return {
							asset,
							label: t`Custom`,
							description: t`Looped background pattern.`,
						};
				}
			}),
		[t],
	);

	const messageGradientOptions = React.useMemo(
		() =>
			[
				{
					id: 'theme',
					label: t`Theme`,
					description: t`Messages follow the active theme accent.`,
				},
				{
					id: 'soft',
					label: t`Soft`,
					description: t`Low contrast glassy bubbles for quiet chats.`,
				},
				{
					id: 'aurora',
					label: t`Aurora`,
					description: t`Green-blue accent glow for outgoing messages.`,
				},
				{
					id: 'sunset',
					label: t`Sunset`,
					description: t`Warm rose-orange bubbles for a softer mood.`,
				},
				{
					id: 'ocean',
					label: t`Ocean`,
					description: t`Clean cyan-blue gradients with high readability.`,
				},
				{
					id: 'forest',
					label: t`Forest`,
					description: t`Deep green bubbles for emerald themes.`,
				},
				{
					id: 'ember',
					label: t`Ember`,
					description: t`Red-amber bubbles for warm themes.`,
				},
				{
					id: 'nebula',
					label: t`Nebula`,
					description: t`Violet-magenta bubbles for cosmic themes.`,
				},
				{
					id: 'magenta',
					label: t`Magenta`,
					description: t`Bright pink-violet bubbles for vivid chats.`,
				},
				{
					id: 'custom',
					label: t`Custom`,
					description: t`Message bubbles follow your custom color.`,
				},
				{
					id: 'mono',
					label: t`Mono`,
					description: t`Minimal neutral bubbles without extra color.`,
				},
			] as const satisfies ReadonlyArray<MessageGradientOption>,
		[t],
	);

	const handleButtonMotionStyleChange = React.useCallback((nextStyle: ButtonMotionStyle) => {
		if (!BUTTON_MOTION_STYLES.includes(nextStyle)) return;
		AccessibilityActionCreators.update({buttonMotionStyle: nextStyle});
	}, []);

	const handleMessageGradientStyleChange = React.useCallback((nextStyle: MessageGradientStyle) => {
		if (!MESSAGE_GRADIENT_STYLES.includes(nextStyle)) return;
		AccessibilityActionCreators.update({messageGradientStyle: nextStyle});
	}, []);

	const handleStylePresetApply = React.useCallback((preset: StylePreset) => {
		AccessibilityActionCreators.update({
			themeGradientStyle: preset.gradient,
			buttonMotionStyle: preset.buttonMotion,
			messageGradientStyle: preset.messageGradient,
		});
	}, []);

	const setCustomGradient = React.useCallback(
		(
			updates: Partial<{
				customThemeGradientStart: string;
				customThemeGradientMiddle: string;
				customThemeGradientEnd: string;
				customThemeGradientAngle: number;
				customThemeGradientGlow: number;
			}>,
		) => {
			AccessibilityActionCreators.update({
				themeGradientStyle: 'custom',
				...updates,
			});
		},
		[],
	);

	const resetCustomGradient = React.useCallback(() => {
		AccessibilityActionCreators.update({
			themeGradientStyle: 'custom',
			customThemeGradientStart: DEFAULT_CUSTOM_THEME_GRADIENT.start,
			customThemeGradientMiddle: DEFAULT_CUSTOM_THEME_GRADIENT.middle,
			customThemeGradientEnd: DEFAULT_CUSTOM_THEME_GRADIENT.end,
			customThemeGradientAngle: DEFAULT_CUSTOM_THEME_GRADIENT.angle,
			customThemeGradientGlow: DEFAULT_CUSTOM_THEME_GRADIENT.glow,
		});
	}, []);

	const customGradientStartNumber =
		cssColorStringToNumber(customThemeGradientStart) ?? cssColorStringToNumber(DEFAULT_CUSTOM_THEME_GRADIENT.start) ?? 0x1d4ed8;
	const customGradientMiddleNumber =
		cssColorStringToNumber(customThemeGradientMiddle) ??
		cssColorStringToNumber(DEFAULT_CUSTOM_THEME_GRADIENT.middle) ??
		0x7c3aed;
	const customGradientEndNumber =
		cssColorStringToNumber(customThemeGradientEnd) ?? cssColorStringToNumber(DEFAULT_CUSTOM_THEME_GRADIENT.end) ?? 0xec4899;

	const flushPendingCustomAccent = React.useCallback(() => {
		if (customAccentSaveTimerRef.current) {
			clearTimeout(customAccentSaveTimerRef.current);
			customAccentSaveTimerRef.current = null;
		}

		const pending = pendingCustomAccentRef.current;
		if (!pending) return;
		pendingCustomAccentRef.current = null;

		AccessibilityActionCreators.update({
			themeGradientStyle: 'custom',
			messageGradientStyle: 'custom',
			customThemeGradientStart: pending.start,
			customThemeGradientMiddle: pending.middle,
			customThemeGradientEnd: pending.end,
			customThemeGradientGlow: pending.glow,
		});
	}, []);

	const applyCustomAccentColor = React.useCallback((nextValue: number) => {
		const rawAccent = nextValue === 0 ? cssColorStringToNumber(DEFAULT_CUSTOM_THEME_GRADIENT.middle) ?? 0x7c3aed : nextValue;
		const accent = quantizeColorNumber(rawAccent);
		const start = mixHexColors(accent, 0xffffff, 0.18);
		const middle = numberToHex(accent);
		const end = mixHexColors(accent, 0x000000, 0.22);
		const glow = Math.max(customThemeGradientGlow, 62);
		applyCustomThemeVariablesImmediately(start, middle, end, customThemeGradientAngle, glow);
		pendingCustomAccentRef.current = {start, middle, end, glow};

		if (customAccentSaveTimerRef.current) {
			clearTimeout(customAccentSaveTimerRef.current);
		}
		customAccentSaveTimerRef.current = setTimeout(flushPendingCustomAccent, CUSTOM_THEME_SAVE_DELAY_MS);
	}, [customThemeGradientAngle, customThemeGradientGlow, flushPendingCustomAccent]);

	React.useEffect(() => {
		return () => flushPendingCustomAccent();
	}, [flushPendingCustomAccent]);

	const previewBackground =
		'linear-gradient(180deg, color-mix(in srgb, var(--background-primary) 14%, transparent) 0%, transparent 18%, color-mix(in srgb, var(--background-secondary) 18%, transparent) 100%)';

	React.useEffect(() => {
		if (!themeToFocusRef.current || themeToFocusRef.current !== selectedThemeOptionId) return;
		const node = buttonRefs.current[themeToFocusRef.current];
		if (node) {
			node.focus();
		}
		themeToFocusRef.current = null;
	}, [selectedThemeOptionId]);

	const renderStylePresetGrid = () => (
		<div className={styles.presetGrid} role="radiogroup" aria-label={t`Style presets`}>
			{stylePresets.map((preset) => {
				const selected =
					preset.gradient === themeGradientStyle &&
					preset.buttonMotion === buttonMotionStyle &&
					preset.messageGradient === messageGradientStyle;
				return (
					<button
						type="button"
						key={preset.id}
						className={clsx(styles.presetCard, selected && styles.presetCardSelected)}
						data-preset-gradient={preset.gradient}
						onClick={() => handleStylePresetApply(preset)}
						role="radio"
						aria-checked={selected}
					>
						<span className={styles.presetPreview} aria-hidden="true">
							<span className={styles.presetPreviewMessageLeft} />
							<span className={styles.presetPreviewMessageRight} />
						</span>
						<span className={styles.presetContent}>
							<span className={styles.presetHeader}>
								<span className={styles.presetTitle}>{preset.label}</span>
								{selected && (
									<span className={styles.presetCheck} aria-hidden="true">
										<CheckIcon weight="bold" size={10} />
									</span>
								)}
							</span>
						</span>
					</button>
				);
			})}
		</div>
	);

	const isCustomMultiTheme =
		themeGradientStyle === 'custom' ||
		(typeof document !== 'undefined' && document.documentElement.dataset.themeGradientStyle === 'custom');

	const renderMessageGradientGrid = () => (
		<div className={styles.messageGradientGrid} role="radiogroup" aria-label={t`Message gradients`}>
			{messageGradientOptions.map((option) => {
				const selected = option.id === messageGradientStyle;
				return (
					<button
						type="button"
						key={option.id}
						className={clsx(styles.messageGradientButton, selected && styles.messageGradientButtonSelected)}
						data-message-gradient-preview={option.id}
						onClick={() => handleMessageGradientStyleChange(option.id)}
						role="radio"
						aria-checked={selected}
						aria-label={option.label}
					>
						<span className={styles.messageGradientPreview} aria-hidden="true">
							<span className={styles.messageGradientPreviewIncoming} />
							<span className={styles.messageGradientPreviewOutgoing} />
							{selected && (
								<span className={styles.messageGradientCheck} aria-hidden="true">
									<CheckIcon weight="bold" size={11} />
								</span>
							)}
						</span>
						<span className={styles.messageGradientContent}>
							<span className={styles.messageGradientLabel}>{option.label}</span>
							<span className={styles.messageGradientDescription}>{option.description}</span>
						</span>
					</button>
				);
			})}
		</div>
	);

	const renderChatBackgroundCard = (
		asset: ChatBackgroundAsset,
		label: string,
		description: string,
		selected: boolean,
	) => {
		const previewTileSize = `${Math.max(84, Math.round(asset.tileSize * 0.75))}px`;
		return (
			<button
				key={asset.id}
				type="button"
				className={clsx(styles.chatBackgroundCard, selected && styles.chatBackgroundCardSelected)}
				onClick={() => AccessibilityActionCreators.update({chatBackgroundId: asset.id})}
				role="radio"
				aria-checked={selected}
			>
				<span className={styles.chatBackgroundPreview} style={{background: previewBackground}} aria-hidden="true">
					<span
						className={styles.chatBackgroundPattern}
						style={
							{
								'--chat-preview-image': asset.src ? `url("${asset.src}")` : 'none',
								'--chat-preview-size': previewTileSize,
								'--chat-preview-opacity': `${asset.opacity}`,
							} as React.CSSProperties
						}
					/>
					<span className={styles.chatBackgroundPreviewOverlay} />
					<span className={styles.chatBackgroundPreviewIncoming} />
					<span className={styles.chatBackgroundPreviewOutgoing} />
					{selected && (
						<span className={styles.chatBackgroundCheck} aria-hidden="true">
							<CheckIcon weight="bold" size={12} />
						</span>
					)}
				</span>
				<span className={styles.chatBackgroundContent}>
					<span className={styles.chatBackgroundLabel}>{label}</span>
					<span className={styles.chatBackgroundDescription}>{description}</span>
				</span>
			</button>
		);
	};

	if (mode === 'theme') {
		return (
			<>
				<div className={styles.themeButtonGroup} role="radiogroup" aria-labelledby="theme-label">
					{themeOptions.map((option) => (
						<Tooltip key={option.id} text={option.tooltip} position="top" delay={200}>
							<div>
								<ThemeButton
									ref={(el) => {
										buttonRefs.current[option.id] = el;
									}}
									optionId={option.id}
									isSelected={isThemeOptionSelected(option)}
									label={option.label}
									description={option.description}
									swatchBackground={option.swatchBackground}
									swatchIconColor={option.swatchIconColor}
									icon={option.icon ?? undefined}
									onClick={handleThemeOptionChange}
									onKeyDown={handleKeyDown}
								/>
							</div>
						</Tooltip>
					))}
					<ColorPickerField
						label={t`Multi`}
						value={customGradientMiddleNumber}
						defaultValue={cssColorStringToNumber(DEFAULT_CUSTOM_THEME_GRADIENT.middle) ?? 0x7c3aed}
						hideHelperText
						skipTextInputLiveUpdate
						className={clsx(styles.themeMultiColorPickerField, isCustomMultiTheme && styles.themeMultiColorPickerSelected)}
						onChange={applyCustomAccentColor}
					/>
				</div>
				<Switch
					label={t`Sync theme across devices`}
					description={
						(syncThemeAcrossDevices ? theme : localThemeOverride) === ThemeTypes.SYSTEM
							? t`System theme automatically disables sync so this device can follow your OS appearance.`
							: t`When enabled, theme changes follow you across devices. Disable it to keep a local look on this device.`
					}
					value={syncThemeAcrossDevices}
					disabled={(syncThemeAcrossDevices ? theme : localThemeOverride) === ThemeTypes.SYSTEM}
					onChange={(value) => {
						if (!value) {
							const currentTheme = syncThemeAcrossDevices ? theme : UserSettingsStore.getTheme();
							AccessibilityActionCreators.update({syncThemeAcrossDevices: false, localThemeOverride: currentTheme});
						} else {
							AccessibilityActionCreators.update({syncThemeAcrossDevices: true, localThemeOverride: null});
						}
					}}
				/>

				<div className={styles.studioLayout}>
					<div className={styles.optionSection}>
						<div className={styles.optionHeading}>{t`Style presets`}</div>
						<p className={styles.optionDescription}>{t`Round presets with the theme mood and motion style.`}</p>
						{renderStylePresetGrid()}
					</div>

					<div className={styles.optionSection}>
						<div className={styles.optionHeading}>{t`Message gradients`}</div>
						<p className={styles.optionDescription}>{t`Choose how message bubbles are tinted in every chat.`}</p>
						{renderMessageGradientGrid()}
					</div>

					<div className={clsx(styles.optionSection, styles.optionSectionWide)}>
						<div className={styles.optionHeading}>{t`Chat background`}</div>
						<p className={styles.optionDescription}>{t`Choose a light wallpaper layer behind messages.`}</p>
						<div className={styles.chatBackgroundGrid} role="radiogroup" aria-label={t`Chat backgrounds`}>
							{chatBackgroundOptions.map((option) =>
								renderChatBackgroundCard(
									option.asset,
									option.label,
									option.description,
									option.asset.id === chatBackgroundId,
								),
							)}
						</div>
					</div>
				</div>

				<StyleStudioTabContent />
			</>
		);
	}

	return (
		<>
			<div className={styles.optionSection}>
				<div className={styles.optionHeading}>{t`Button behavior`}</div>
				<div className={styles.optionChipRow}>
					{buttonMotionOptions.map((option) => (
						<Button
							key={option.id}
							variant={option.id === buttonMotionStyle ? 'primary' : 'secondary'}
							compact
							onClick={() => handleButtonMotionStyleChange(option.id)}
						>
							{option.label}
						</Button>
					))}
				</div>
				<p className={styles.optionDescription}>
					{buttonMotionOptions.find((option) => option.id === buttonMotionStyle)?.description}
				</p>
			</div>

			<Accordion
				id="custom-theme-tokens"
				title={t`Custom theme tokens`}
				description={t`Keep only gradient tuning and optional custom CSS overrides.`}
				defaultExpanded={false}
			>
				<Accordion
					id="custom-theme-gradient"
					title={t`Custom gradient`}
					description={t`Gradient colors and intensity.`}
					defaultExpanded={false}
					className={styles.nestedAccordion}
				>
					<div className={styles.gradientColorGrid}>
						<ColorPickerField
							label={t`Start`}
							value={customGradientStartNumber}
							hideHelperText
							className={styles.compactTokenField}
							onChange={(nextValue) => {
								setCustomGradient({
									customThemeGradientStart: nextValue === 0 ? DEFAULT_CUSTOM_THEME_GRADIENT.start : numberToHex(nextValue),
								});
							}}
						/>
						<ColorPickerField
							label={t`Middle`}
							value={customGradientMiddleNumber}
							hideHelperText
							className={styles.compactTokenField}
							onChange={(nextValue) => {
								setCustomGradient({
									customThemeGradientMiddle: nextValue === 0 ? DEFAULT_CUSTOM_THEME_GRADIENT.middle : numberToHex(nextValue),
								});
							}}
						/>
						<ColorPickerField
							label={t`End`}
							value={customGradientEndNumber}
							hideHelperText
							className={styles.compactTokenField}
							onChange={(nextValue) => {
								setCustomGradient({
									customThemeGradientEnd: nextValue === 0 ? DEFAULT_CUSTOM_THEME_GRADIENT.end : numberToHex(nextValue),
								});
							}}
						/>
					</div>
					<div className={styles.sliderField}>
						<div className={styles.sliderHeader}>
							<span>{t`Gradient angle`}</span>
							<span>{customThemeGradientAngle}deg</span>
						</div>
						<Slider
							value={customThemeGradientAngle}
							defaultValue={customThemeGradientAngle}
							factoryDefaultValue={DEFAULT_CUSTOM_THEME_GRADIENT.angle}
							minValue={0}
							maxValue={360}
							step={1}
							markers={[0, 90, 180, 270, 360]}
							stickToMarkers={false}
							onValueChange={(value) => setCustomGradient({customThemeGradientAngle: value})}
							onMarkerRender={(value) => `${value}deg`}
							onValueRender={(value) => `${value}deg`}
						/>
					</div>
					<div className={styles.sliderField}>
						<div className={styles.sliderHeader}>
							<span>{t`Glow intensity`}</span>
							<span>{customThemeGradientGlow}%</span>
						</div>
						<Slider
							value={customThemeGradientGlow}
							defaultValue={customThemeGradientGlow}
							factoryDefaultValue={DEFAULT_CUSTOM_THEME_GRADIENT.glow}
							minValue={0}
							maxValue={100}
							step={1}
							markers={[0, 25, 50, 75, 100]}
							stickToMarkers={false}
							onValueChange={(value) => setCustomGradient({customThemeGradientGlow: value})}
							onMarkerRender={(value) => `${value}%`}
							onValueRender={(value) => `${value}%`}
						/>
					</div>
					<div className={styles.optionChipRow}>
						<Button
							variant={themeGradientStyle === 'custom' ? 'primary' : 'secondary'}
							compact
							onClick={() => AccessibilityActionCreators.update({themeGradientStyle: 'custom'})}
						>
							{themeGradientStyle === 'custom' ? t`Custom gradient is active` : t`Use custom gradient`}
						</Button>
						<Button variant="secondary" compact onClick={resetCustomGradient}>
							{t`Reset custom gradient`}
						</Button>
					</div>
				</Accordion>

				<div className={styles.cssSection}>
					<Textarea
						label={t`Custom CSS overrides`}
						placeholder={t`Write custom CSS here to override any theme tokens. For example:\n:root { --background-primary: #1E1E2F; }`}
						minRows={4}
						maxRows={12}
						value={customThemeCss}
						onChange={(event) => {
							AccessibilityActionCreators.update({customThemeCss: event.target.value});
						}}
					/>
				</div>

				<div className={styles.buttonGroup}>
					<Button variant="secondary" fitContent onClick={handleResetAllOverrides}>
						{t`Reset all overrides to theme default`}
					</Button>
					<Button variant="primary" fitContent leftIcon={<ShareNetworkIcon size={18} />} onClick={handleShareTheme}>
						{t`Share this theme`}
					</Button>
				</div>
			</Accordion>
		</>
	);
});

export const StyleStudioTabContent: React.FC = observer(() => <ThemeTabContent mode="studio" />);


