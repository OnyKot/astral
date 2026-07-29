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
import {observer} from 'mobx-react-lite';
import type React from 'react';
import {Button} from '~/components/uikit/Button/Button';
import styles from './BottomCTASection.module.css';
import {PurchaseDisabledWrapper} from './PurchaseDisabledWrapper';

interface BottomCTASectionProps {
	isGiftMode: boolean;
	monthlyPrice: string;
	yearlyPrice: string;
	visionaryPrice: string;
	loadingCheckout: boolean;
	loadingSlots: boolean;
	isVisionarySoldOut: boolean;
	handleSelectPlan: (plan: 'monthly' | 'yearly' | 'visionary' | 'gift1Month' | 'gift1Year' | 'giftVisionary') => void;
	purchaseDisabled?: boolean;
	purchaseDisabledTooltip?: React.ReactNode;
	waitlistMode?: boolean;
	waitlistPlan?: 'monthly' | 'yearly' | 'visionary' | null;
}

export const BottomCTASection: React.FC<BottomCTASectionProps> = observer(
	({
		isGiftMode,
		monthlyPrice,
		yearlyPrice,
		visionaryPrice,
		loadingCheckout,
		loadingSlots,
		handleSelectPlan,
		purchaseDisabled = false,
		purchaseDisabledTooltip,
		waitlistMode = false,
		waitlistPlan = null,
	}) => {
		const {t} = useLingui();
		const tooltipText: React.ReactNode = purchaseDisabledTooltip ?? t`Claim your account to purchase Astral Plutonium.`;

		const getWaitlistButtonLabel = (plan: 'monthly' | 'yearly' | 'visionary', price: string) => {
			if (waitlistPlan === plan) return t`On waitlist`;
			switch (plan) {
				case 'monthly':
					return t`Join waitlist — Monthly ${price}`;
				case 'yearly':
					return t`Join waitlist — Yearly ${price}`;
				case 'visionary':
					return t`Join waitlist — Visionary ${price}`;
			}
		};

		return (
			<div className={styles.container}>
				<h2 className={styles.title}>
					{isGiftMode ? <Trans>Ready to Buy a Gift?</Trans> : <Trans>Ready to Upgrade?</Trans>}
				</h2>
				<div className={styles.buttonContainer}>
					{!isGiftMode ? (
						<>
							<PurchaseDisabledWrapper disabled={purchaseDisabled} tooltipText={tooltipText}>
								<Button
									variant="secondary"
									onClick={() => handleSelectPlan('monthly')}
									submitting={loadingCheckout || loadingSlots}
									className={styles.button}
									disabled={purchaseDisabled}
								>
									{waitlistMode ? getWaitlistButtonLabel('monthly', monthlyPrice) : <Trans>Monthly {monthlyPrice}</Trans>}
								</Button>
							</PurchaseDisabledWrapper>
							<PurchaseDisabledWrapper disabled={purchaseDisabled} tooltipText={tooltipText}>
								<Button
									variant="primary"
									onClick={() => handleSelectPlan('yearly')}
									submitting={loadingCheckout || loadingSlots}
									className={styles.button}
									disabled={purchaseDisabled}
								>
									{waitlistMode ? getWaitlistButtonLabel('yearly', yearlyPrice) : <Trans>Yearly {yearlyPrice}</Trans>}
								</Button>
							</PurchaseDisabledWrapper>
							<PurchaseDisabledWrapper disabled={purchaseDisabled} tooltipText={tooltipText}>
								<Button
									variant="primary"
									onClick={() => handleSelectPlan('visionary')}
									submitting={loadingCheckout || loadingSlots}
									disabled={purchaseDisabled}
									className={styles.button}
								>
									{waitlistMode ? (
										getWaitlistButtonLabel('visionary', visionaryPrice)
									) : (
										<Trans>Visionary {visionaryPrice}</Trans>
									)}
								</Button>
							</PurchaseDisabledWrapper>
						</>
					) : (
						<>
							<PurchaseDisabledWrapper disabled={purchaseDisabled} tooltipText={tooltipText}>
								<Button
									variant="secondary"
									onClick={() => handleSelectPlan('gift1Year')}
									submitting={loadingCheckout || loadingSlots}
									className={styles.button}
									disabled={purchaseDisabled}
								>
									<Trans>1 Year {yearlyPrice}</Trans>
								</Button>
							</PurchaseDisabledWrapper>
							<PurchaseDisabledWrapper disabled={purchaseDisabled} tooltipText={tooltipText}>
								<Button
									variant="primary"
									onClick={() => handleSelectPlan('gift1Month')}
									submitting={loadingCheckout || loadingSlots}
									className={styles.button}
									disabled={purchaseDisabled}
								>
									<Trans>1 Month {monthlyPrice}</Trans>
								</Button>
							</PurchaseDisabledWrapper>
							<PurchaseDisabledWrapper disabled={purchaseDisabled} tooltipText={tooltipText}>
								<Button
									variant="primary"
									onClick={() => handleSelectPlan('giftVisionary')}
									submitting={loadingCheckout || loadingSlots}
									disabled={purchaseDisabled}
									className={styles.button}
								>
									<Trans>Visionary {visionaryPrice}</Trans>
								</Button>
							</PurchaseDisabledWrapper>
						</>
					)}
				</div>
			</div>
		);
	},
);
