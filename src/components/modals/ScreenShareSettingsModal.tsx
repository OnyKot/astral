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

import {Trans, useLingui} from '@lingui/react/macro';
import {RocketLaunchIcon} from '@phosphor-icons/react';
import {clsx} from 'clsx';
import {observer} from 'mobx-react-lite';
import {useCallback, useMemo} from 'react';
import {Switch} from '~/components/form/Switch';
import * as Modal from '~/components/modals/Modal';
import styles from '~/components/modals/ScreenShareSettingsModal.module.css';
import {Button} from '~/components/uikit/Button/Button';
import FocusRing from '~/components/uikit/FocusRing/FocusRing';
import {Routes} from '~/Routes';
import {openExternalUrl} from '~/utils/NativeUtils';
import {useScreenShareSettingsModal} from '~/utils/modals/ScreenShareSettingsModalUtils';

interface ScreenShareSettingsModalProps {
	onStartShare: (
		resolution: 'low' | 'medium' | 'high' | 'ultra' | '4k',
		frameRate: number,
		includeAudio: boolean,
	) => Promise<void>;
}

export const ScreenShareSettingsModal = observer(({onStartShare}: ScreenShareSettingsModalProps) => {
	const {t} = useLingui();
	const {
		hasPremium,
		isSharing,
		selectedResolution,
		selectedFrameRate,
		includeAudio,
		setIncludeAudio,
		handleStartShare,
		handleCancel,
		handleResolutionClick,
		handleFrameRateClick,
		isFrameRateLocked,
		RESOLUTION_OPTIONS,
		FRAMERATE_OPTIONS,
	} = useScreenShareSettingsModal({onStartShare});

	const resolutionOptions = useMemo(
		() => RESOLUTION_OPTIONS.map((option) => ({...option, label: t(option.label)})),
		[t],
	);

	const framerateOptions = useMemo(() => FRAMERATE_OPTIONS.map((option) => ({...option, label: t(option.label)})), [t]);
	const handleOpenPlutonium = useCallback(() => {
		void openExternalUrl(Routes.plutonium());
	}, []);

	const getOptionButtonClass = (isSelected: boolean, isLocked: boolean) =>
		clsx(styles.optionButton, {
			[styles.optionButtonSelected]: isSelected && !isLocked,
			[styles.optionButtonSelectedLocked]: isSelected && isLocked,
			[styles.optionButtonUnselected]: !isSelected && !isLocked,
			[styles.optionButtonUnselectedLocked]: !isSelected && isLocked,
		});

	return (
		<Modal.Root size="small" centered disableMobileSwipeDismiss>
			<Modal.Header title={t`Screen Share Settings`} />
			<Modal.Content>
				<div className={styles.content}>
					<div className={styles.section}>
						<div className={styles.sectionLabel}>
							<Trans>Video Quality</Trans>
						</div>
						<div className={clsx(styles.optionGrid, styles.optionGridResolution)}>
							{resolutionOptions.map((option) => {
								const isSelected = selectedResolution === option.value;
								const isLocked = option.isPremium && !hasPremium;

								return (
									<FocusRing key={option.value} offset={-2}>
										<button
											type="button"
											onClick={() => handleResolutionClick(option.value, option.isPremium)}
											className={getOptionButtonClass(isSelected, isLocked)}
										>
											{isLocked && <RocketLaunchIcon weight="fill" size={17} className={styles.lockIcon} />}
											<span className={styles.optionButtonLabel}>{option.label}</span>
										</button>
									</FocusRing>
								);
							})}
						</div>
					</div>

					<div className={styles.section}>
						<div className={styles.sectionLabel}>
							<Trans>Frame Rate</Trans>
						</div>
						<div className={clsx(styles.optionGrid, styles.optionGridFrameRate)}>
							{framerateOptions.map((option) => {
								const isSelected = selectedFrameRate === option.value;
								const isLocked = (option.isPremium && !hasPremium) || isFrameRateLocked(option.value);

								return (
									<FocusRing key={option.value} offset={-2}>
										<button
											type="button"
											onClick={() => handleFrameRateClick(option.value, option.isPremium)}
											className={getOptionButtonClass(isSelected, isLocked)}
										>
											{isLocked && <RocketLaunchIcon weight="fill" size={17} className={styles.lockIcon} />}
											<span className={styles.optionButtonLabel}>{option.label}</span>
										</button>
									</FocusRing>
								);
							})}
						</div>
					</div>

					<div className={styles.section}>
						<div className={styles.audioToggleRow}>
							<div className={styles.audioToggleInfo}>
								<div className={styles.sectionLabel}>
									<Trans>Share Audio</Trans>
								</div>
								<div className={styles.audioToggleDescription}>
									<Trans>Include audio from your screen in the share</Trans>
								</div>
							</div>
							<Switch value={includeAudio} onChange={setIncludeAudio} />
						</div>
					</div>

					{!hasPremium && (
						<button type="button" className={styles.premiumBanner} onClick={handleOpenPlutonium}>
							<span aria-hidden className={styles.premiumHalo} />
							<div className={styles.premiumBannerHeader}>
								<span className={styles.premiumBannerIconShell}>
									<RocketLaunchIcon weight="fill" size={18} className={styles.premiumBannerIcon} />
								</span>
								<span className={styles.premiumBannerTitleGroup}>
									<span className={styles.premiumBannerEyebrow}>
										<Trans>Plutonium Access</Trans>
									</span>
									<span className={styles.premiumBannerTitle}>
										<Trans>Unlock Ultra Video</Trans>
									</span>
								</span>
							</div>
							<p className={styles.premiumBannerDescription}>
								<Trans>
									Get Ultra (1440p) and 4K (2160p) resolutions for maximum screen share quality.
								</Trans>
							</p>
							<span className={styles.premiumBannerCta}>
								<Trans>Get Plutonium</Trans>
								<span aria-hidden className={styles.premiumBannerArrow}>
									-&gt;
								</span>
							</span>
						</button>
					)}
				</div>
			</Modal.Content>
			<Modal.Footer>
				<Button variant="secondary" onClick={handleCancel}>
					<Trans>Cancel</Trans>
				</Button>
				<Button onClick={handleStartShare} submitting={isSharing}>
					<Trans>Start Sharing</Trans>
				</Button>
			</Modal.Footer>
		</Modal.Root>
	);
});
