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
	type ThemeGradientStyle,
} from '~/stores/AccessibilityStore';
import UserSettingsStore from '~/stores/UserSettingsStore';
import styles from './ThemeTab.module.css';

interface ThemeButtonProps {
	themeType: string;
	currentTheme: string;
	label: string;
	description: string;
	swatchBackground: string;
	swatchIconColor?: string;
	onKeyDown: (event: React.KeyboardEvent, themeType: string) => void;
	onClick: (themeType: string) => void;
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

const ThemeButton = observer(
	React.forwardRef<HTMLButtonElement, ThemeButtonProps>(
		({themeType, currentTheme, label, description, swatchBackground, swatchIconColor, onKeyDown, onClick, icon}, ref) => {
			const isSelected = currentTheme === themeType;

			return (
				<FocusRing offset={-2}>
					<button
						ref={ref}
						type="button"
						onClick={() => onClick(themeType)}
						onKeyDown={(e) => onKeyDown(e, themeType)}
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

function cssColorStringToNumber(color: string): number | null {
	const canvas = document.createElement('canvas');
	const context = canvas.getContext('2d');

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

			return Number.parseInt(hex.slice(1), 16) >>> 0;
		}

		if (/^#[0-9A-Fa-f]{6}$/.test(parsed)) {
			return Number.parseInt(parsed.slice(1), 16) >>> 0;
		}
	} catch {
		return null;
	}

	return null;
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
};

interface StylePreset {
	id: string;
	label: string;
	description: string;
	gradient: ThemeGradientStyle;
	buttonMotion: ButtonMotionStyle;
	deprecated?: boolean;
}

interface ThemeTabContentProps {
	mode?: 'theme' | 'studio';
}

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
		(newTheme: string) => {
			if (newTheme === currentSelectedTheme) return;
			themeToFocusRef.current = newTheme;

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
		[currentSelectedTheme, syncThemeAcrossDevices, t],
	);

	const themeOptions = React.useMemo(
		() => [
			{
				type: ThemeTypes.DARK,
				label: t`Dark Theme`,
				description: t`Default dark balance`,
				swatchBackground: 'linear-gradient(145deg, #0d1117 0%, #151a21 100%)',
				swatchIconColor: '#e6edf5',
				icon: null,
				tooltip: t`Use dark theme`,
			},
			{
				type: ThemeTypes.COAL,
				label: t`Coal Theme`,
				description: t`Pitch-black surfaces`,
				swatchBackground: 'linear-gradient(145deg, #05070a 0%, #0b0e12 100%)',
				swatchIconColor: '#f8fafc',
				icon: null,
				tooltip: t`Use coal theme (pitch-black surfaces)`,
			},
			{
				type: ThemeTypes.GREEN,
				label: t`Green`,
				description: t`Dark emerald tone`,
				swatchBackground: 'linear-gradient(145deg, #0a1a13 0%, #123124 100%)',
				swatchIconColor: '#dcfce7',
				icon: null,
				tooltip: t`Use green theme`,
			},
			{
				type: ThemeTypes.GRAY,
				label: t`Gray`,
				description: t`Neutral gray palette`,
				swatchBackground: 'linear-gradient(145deg, #181a1f 0%, #262a31 100%)',
				swatchIconColor: '#f3f4f6',
				icon: null,
				tooltip: t`Use gray theme`,
			},
			{
				type: ThemeTypes.BLUE,
				label: t`Blue`,
				description: t`Telegram-like blue`,
				swatchBackground: 'linear-gradient(145deg, #17212b 0%, #233447 100%)',
				swatchIconColor: '#e0f2ff',
				icon: null,
				tooltip: t`Use blue theme`,
			},
			{
				type: ThemeTypes.SUNSET,
				label: t`Sunset`,
				description: t`Muted warm dusk tone`,
				swatchBackground: 'linear-gradient(145deg, #261a1d 0%, #3d2730 100%)',
				swatchIconColor: '#fde7df',
				icon: null,
				tooltip: t`Use sunset theme`,
			},
			{
				type: ThemeTypes.NIGHT_SKY,
				label: t`Night Sky`,
				description: t`Deep blue nocturnal palette`,
				swatchBackground: 'linear-gradient(145deg, #0d1724 0%, #1a2b43 100%)',
				swatchIconColor: '#deebff',
				icon: null,
				tooltip: t`Use night sky theme`,
			},
			{
				type: ThemeTypes.PURPLE,
				label: t`Purple`,
				description: t`Dark violet glow`,
				swatchBackground: 'linear-gradient(145deg, #1b1528 0%, #2c2142 100%)',
				swatchIconColor: '#ede4ff',
				icon: null,
				tooltip: t`Use purple theme`,
			},
			{
				type: ThemeTypes.ORANGE,
				label: t`Orange`,
				description: t`Burnt amber palette`,
				swatchBackground: 'linear-gradient(145deg, #23180f 0%, #382719 100%)',
				swatchIconColor: '#ffe8d0',
				icon: null,
				tooltip: t`Use orange theme`,
			},
			{
				type: ThemeTypes.PINK,
				label: t`Pink`,
				description: t`Dusty rose dusk`,
				swatchBackground: 'linear-gradient(145deg, #24141f 0%, #3a2230 100%)',
				swatchIconColor: '#ffe1ef',
				icon: null,
				tooltip: t`Use pink theme`,
			},
			{
				type: ThemeTypes.YELLOW,
				label: t`Yellow`,
				description: t`Muted golden night`,
				swatchBackground: 'linear-gradient(145deg, #231d0f 0%, #3a2f1d 100%)',
				swatchIconColor: '#ffefc2',
				icon: null,
				tooltip: t`Use yellow theme`,
			},
			{
				type: ThemeTypes.LIGHT,
				label: t`Light Theme`,
				description: t`Bright and clean`,
				swatchBackground: 'linear-gradient(145deg, #ffffff 0%, #eef2f5 100%)',
				swatchIconColor: '#111827',
				icon: null,
				tooltip: t`Use light theme`,
			},
			{
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
		],
		[systemPrefersDark, t],
	);

	const handleKeyDown = React.useCallback(
		(event: React.KeyboardEvent, targetTheme: string) => {
			if (event.key === ' ' || event.key === 'Enter') {
				event.preventDefault();
				handleThemeChange(targetTheme);
			} else if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
				event.preventDefault();
				const order = themeOptions.map((option) => option.type);
				const direction = event.key === 'ArrowRight' ? 1 : -1;
				const currentIndex = Math.max(order.indexOf(currentSelectedTheme as (typeof order)[number]), 0);
				const nextIndex = (currentIndex + direction + order.length) % order.length;
				const nextTheme = order[nextIndex];
				if (nextTheme) {
					handleThemeChange(nextTheme);
				}
			}
		},
		[themeOptions, currentSelectedTheme, handleThemeChange],
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
					deprecated: false,
				},
				{
					id: 'astral-2-old-version',
					label: t`Astral 2.0 Old Version`,
					description: t`Legacy neutral shell and static button motion`,
					gradient: 'legacy',
					buttonMotion: 'static',
					deprecated: true,
				},
				{
					id: 'neon',
					label: t`Neon`,
					description: t`Emerald-violet Aurora, snappy fast clicks`,
					gradient: 'aurora',
					buttonMotion: 'snappy',
					deprecated: false,
				},
				{
					id: 'cinema',
					label: t`Cinema`,
					description: t`Deep violet Midnight with soft, cinematic motion`,
					gradient: 'midnight',
					buttonMotion: 'soft',
					deprecated: false,
				},
				{
					id: 'sunwave',
					label: t`Sunwave`,
					description: t`Warm Sunset glow with no button movement`,
					gradient: 'sunset',
					buttonMotion: 'static',
					deprecated: false,
				},
				{
					id: 'deepsea',
					label: t`Deep Sea`,
					description: t`Cool Ocean cyan with gentle soft motion`,
					gradient: 'ocean',
					buttonMotion: 'soft',
					deprecated: false,
				},
				{
					id: 'forest',
					label: t`Forest`,
					description: t`Living emerald canopy, balanced default motion`,
					gradient: 'forest',
					buttonMotion: 'default',
					deprecated: false,
				},
				{
					id: 'ember',
					label: t`Ember`,
					description: t`Molten red-amber glow with snappy clicks`,
					gradient: 'ember',
					buttonMotion: 'snappy',
					deprecated: false,
				},
				{
					id: 'nebula',
					label: t`Nebula`,
					description: t`Magenta-indigo cosmos with soft, airy motion`,
					gradient: 'nebula',
					buttonMotion: 'soft',
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
					case 'classic':
						return {
							asset,
							label: t`Classic glyphs`,
							description: t`A balanced default look that keeps chat readable and calm.`,
						};
					case 'astral_orbit':
						return {
							asset,
							label: t`Astral orbit`,
							description: t`Soft circular rhythm for a polished personalized space.`,
						};
					case 'constellation':
						return {
							asset,
							label: t`Constellation`,
							description: t`Structured line style for a focused conversation tone.`,
						};
					case 'meteor':
						return {
							asset,
							label: t`Meteor trail`,
							description: t`Dynamic accents when you want chat to feel more active.`,
						};
					case 'nebula_arcs':
						return {
							asset,
							label: t`Nebula arcs`,
							description: t`Calm curved forms for a softer cozy chat atmosphere.`,
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

	const handleButtonMotionStyleChange = React.useCallback((nextStyle: ButtonMotionStyle) => {
		if (!BUTTON_MOTION_STYLES.includes(nextStyle)) return;
		AccessibilityActionCreators.update({buttonMotionStyle: nextStyle});
	}, []);

	const handleStylePresetApply = React.useCallback((preset: StylePreset) => {
		AccessibilityActionCreators.update({
			themeGradientStyle: preset.gradient,
			buttonMotionStyle: preset.buttonMotion,
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

	const previewBackground = React.useMemo(() => {
		if (themeGradientStyle === 'custom') {
			return buildCustomGradientPreview(
				customThemeGradientStart,
				customThemeGradientMiddle,
				customThemeGradientEnd,
				customThemeGradientAngle,
			);
		}

		return GRADIENT_PREVIEW_BACKGROUNDS[themeGradientStyle];
	}, [
		themeGradientStyle,
		customThemeGradientStart,
		customThemeGradientMiddle,
		customThemeGradientEnd,
		customThemeGradientAngle,
	]);

	const customGradientStartNumber =
		cssColorStringToNumber(customThemeGradientStart) ?? cssColorStringToNumber(DEFAULT_CUSTOM_THEME_GRADIENT.start) ?? 0x1d4ed8;
	const customGradientMiddleNumber =
		cssColorStringToNumber(customThemeGradientMiddle) ??
		cssColorStringToNumber(DEFAULT_CUSTOM_THEME_GRADIENT.middle) ??
		0x7c3aed;
	const customGradientEndNumber =
		cssColorStringToNumber(customThemeGradientEnd) ?? cssColorStringToNumber(DEFAULT_CUSTOM_THEME_GRADIENT.end) ?? 0xec4899;

	React.useEffect(() => {
		if (!themeToFocusRef.current || themeToFocusRef.current !== currentSelectedTheme) return;
		const node = buttonRefs.current[themeToFocusRef.current];
		if (node) {
			node.focus();
		}
		themeToFocusRef.current = null;
	}, [currentSelectedTheme]);

	const renderStylePresetGrid = () => (
		<div className={styles.presetGrid} role="radiogroup" aria-label={t`Style presets`}>
			{stylePresets.map((preset) => {
				const selected = preset.gradient === themeGradientStyle && preset.buttonMotion === buttonMotionStyle;
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

	const renderChatBackgroundCard = (
		asset: ChatBackgroundAsset,
		label: string,
		description: string,
		selected: boolean,
	) => {
		const previewTileSize = `${Math.max(132, Math.round(asset.tileSize * 0.42))}px`;
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
						<Tooltip key={option.type} text={option.tooltip} position="top" delay={200}>
							<div>
								<ThemeButton
									ref={(el) => {
										buttonRefs.current[option.type] = el;
									}}
									themeType={option.type}
									currentTheme={currentSelectedTheme}
									label={option.label}
									description={option.description}
									swatchBackground={option.swatchBackground}
									swatchIconColor={option.swatchIconColor}
									icon={option.icon ?? undefined}
									onClick={handleThemeChange}
									onKeyDown={handleKeyDown}
								/>
							</div>
						</Tooltip>
					))}
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
						<p className={styles.optionDescription}>{t`Compact style tiles with real chat-like preview.`}</p>
						{renderStylePresetGrid()}
					</div>

					<div className={styles.optionSection}>
						<div className={styles.optionHeading}>{t`Chat background`}</div>
						<p className={styles.optionDescription}>{t`Customize the mood of your message space.`}</p>
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


