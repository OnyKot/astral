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
import {CrownIcon} from '@phosphor-icons/react';
import {observer} from 'mobx-react-lite';
import * as PremiumModalActionCreators from '~/actions/PremiumModalActionCreators';
import {ColorPickerField} from '~/components/form/ColorPickerField';
import {Button} from '~/components/uikit/Button/Button';
import {clsx} from 'clsx';
import myProfileTabStyles from '../MyProfileTab.module.css';
import type {ProfileAccentEffectPreset} from '~/utils/ProfileAccentEffectUtils';
import styles from './AccentColorPicker.module.css';

interface AccentColorPickerProps {
	value: number;
	onChange: (value: number) => void;
	hasPremium: boolean;
	selectedAccentEffectPreset: ProfileAccentEffectPreset;
	onAccentEffectPresetChange: (preset: ProfileAccentEffectPreset) => void;
	showPremiumAccentEffects?: boolean;
	disabled?: boolean;
	errorMessage?: string;
}

const PREMIUM_EFFECT_OPTIONS: ReadonlyArray<{
	value: ProfileAccentEffectPreset;
}> = [
	{value: 'rgb-neon'},
	{value: 'nebula'},
	{value: 'stellar'},
	{value: 'solar'},
];

export const AccentColorPicker = observer(
	({
		value,
		onChange,
		hasPremium,
		selectedAccentEffectPreset,
		onAccentEffectPresetChange,
		showPremiumAccentEffects = true,
		disabled,
		errorMessage,
	}: AccentColorPickerProps) => {
	const {t} = useLingui();

	const getEffectCopy = (preset: ProfileAccentEffectPreset): {label: string; description: string} => {
		switch (preset) {
			case 'rgb-neon':
				return {
					label: t`RGB Neon`,
					description: t`Rotating multi-color neon edge`,
				};
			case 'nebula':
				return {
					label: t`Nebula Flow`,
					description: t`Cosmic violet-blue gradient stream`,
				};
			case 'stellar':
				return {
					label: t`Stellar Dust`,
					description: t`Starfield shimmer with cool glow`,
				};
			case 'solar':
				return {
					label: t`Solar Flare`,
					description: t`Warm plasma ring with pulse motion`,
				};
			default:
				return {
					label: '',
					description: '',
				};
		}
	};

	const handleSelectPremiumEffect = (preset: ProfileAccentEffectPreset) => {
		if (!hasPremium) {
			PremiumModalActionCreators.open();
			return;
		}
		onAccentEffectPresetChange(preset);
	};

	return (
		<div>
			<ColorPickerField
				label={t`Accent Color`}
				description={t`Customizes the border and banner color on your profile`}
				descriptionClassName={myProfileTabStyles.inputFooter}
				value={value}
				onChange={onChange}
				disabled={disabled}
				defaultValue={0x4641d9}
			/>
			{showPremiumAccentEffects && (
				<div className={styles.plutoniumShell}>
					<div className={styles.plutoniumHeader}>
						<span className={styles.plutoniumTitleRow}>
							<CrownIcon className={styles.crownIcon} weight="fill" size={14} />
							<span className={styles.plutoniumTitle}>{t`Plutonium Accent Effects`}</span>
						</span>
						<span className={styles.plutoniumSubtitle}>
							{t`Add animated gradient frames to your profile cards in all profile views.`}
						</span>
					</div>

					<div className={styles.effectGrid}>
						<button
							type="button"
							className={clsx(styles.effectButton, selectedAccentEffectPreset === 'none' && styles.effectButtonActive)}
							onClick={() => onAccentEffectPresetChange('none')}
						>
							<span className={styles.effectLabel}>{t`Solid Accent`}</span>
							<span className={styles.effectDescription}>{t`Use only your base accent color`}</span>
						</button>

						{PREMIUM_EFFECT_OPTIONS.map((option) => {
							const copy = getEffectCopy(option.value);
							return (
								<button
									key={option.value}
									type="button"
									className={clsx(styles.effectButton, selectedAccentEffectPreset === option.value && styles.effectButtonActive)}
									onClick={() => handleSelectPremiumEffect(option.value)}
								>
									<span className={styles.effectLabel}>
										{copy.label}
										{!hasPremium && <span className={styles.lockBadge}>{t`Plutonium`}</span>}
									</span>
									<span className={styles.effectDescription}>{copy.description}</span>
								</button>
							);
						})}
					</div>

					{!hasPremium && (
						<div className={styles.plutoniumFooter}>
							<Button variant="inverted" superCompact={true} onClick={() => PremiumModalActionCreators.open()}>
								{t`Get Plutonium`}
							</Button>
						</div>
					)}
				</div>
			)}
			{errorMessage && <p className={styles.errorMessage}>{errorMessage}</p>}
		</div>
	);
	},
);
