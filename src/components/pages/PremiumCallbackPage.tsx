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

import {Trans} from '@lingui/react/macro';
import {CheckCircleIcon, XCircleIcon} from '@phosphor-icons/react';
import {observer} from 'mobx-react-lite';
import {useEffect, useState} from 'react';
import * as PremiumActionCreators from '~/actions/PremiumActionCreators';
import {Spinner} from '~/components/uikit/Spinner';
import {HttpError} from '~/lib/HttpError';
import {useLocation} from '~/lib/router';
import styles from './PremiumCallbackPage.module.css';

const WATA_RECONCILE_MAX_ATTEMPTS = 6;
const WATA_RECONCILE_DELAY_MS = 2500;

type WataFinalizeState = 'idle' | 'reconciling' | 'confirmed' | 'timed_out' | 'failed';

function delay(ms: number): Promise<void> {
	return new Promise((resolve) => {
		window.setTimeout(resolve, ms);
	});
}

const PremiumCallbackPage = observer(() => {
	const location = useLocation();
	const queryParams = new URLSearchParams(location.search);
	const status = queryParams.get('status');
	const provider = queryParams.get('provider');
	const orderId = queryParams.get('order_id');

	const isSuccess = status === 'success';
	const isCancel = status === 'cancel';
	const isClosedBillingPortal = status === 'closed-billing-portal';
	const isWataSuccessCallback = isSuccess && provider === 'wata' && !!orderId;
	const [wataFinalizeState, setWataFinalizeState] = useState<WataFinalizeState>(isWataSuccessCallback ? 'reconciling' : 'idle');

	useEffect(() => {
		if (!isWataSuccessCallback || !orderId) {
			setWataFinalizeState('idle');
			return;
		}

		let cancelled = false;

		const reconcile = async () => {
			setWataFinalizeState('reconciling');

			for (let attempt = 0; attempt < WATA_RECONCILE_MAX_ATTEMPTS; attempt++) {
				try {
					const result = await PremiumActionCreators.reconcileWataOrder(orderId);
					if (cancelled) return;

					if (result === 'completed') {
						setWataFinalizeState('confirmed');
						return;
					}

					if (result === 'failed' || result === 'refunded') {
						setWataFinalizeState('failed');
						return;
					}
				} catch (error) {
					if (cancelled) return;

					if (error instanceof HttpError && error.status === 401) {
						setWataFinalizeState('timed_out');
						return;
					}
				}

				if (attempt < WATA_RECONCILE_MAX_ATTEMPTS - 1) {
					await delay(WATA_RECONCILE_DELAY_MS);
				}
			}

			if (!cancelled) {
				setWataFinalizeState('timed_out');
			}
		};

		void reconcile();

		return () => {
			cancelled = true;
		};
	}, [isWataSuccessCallback, orderId]);

	return (
		<div className={styles.container}>
			{isWataSuccessCallback && wataFinalizeState === 'reconciling' && (
				<>
					<Spinner />
					<div className={styles.content}>
						<h1 className={styles.title}>
							<Trans>Finalizing payment</Trans>
						</h1>
						<p className={styles.description}>
							<Trans>Astral is confirming your WATA payment. This usually takes a few seconds.</Trans>
						</p>
					</div>
				</>
			)}

			{((isSuccess && !isWataSuccessCallback) || wataFinalizeState === 'confirmed') && (
				<>
					<CheckCircleIcon className={styles.successIcon} weight="fill" />
					<div className={styles.content}>
						<h1 className={styles.title}>
							<Trans>Payment Successful</Trans>
						</h1>
						<p className={styles.description}>
							<Trans>Great success! You can now close this tab and return to the app.</Trans>
						</p>
					</div>
				</>
			)}

			{wataFinalizeState === 'timed_out' && (
				<>
					<CheckCircleIcon className={styles.successIcon} weight="fill" />
					<div className={styles.content}>
						<h1 className={styles.title}>
							<Trans>Payment submitted</Trans>
						</h1>
						<p className={styles.description}>
							<Trans>WATA redirected back successfully, but final confirmation is still pending. Return to Astral and it should unlock as soon as the provider confirms the charge.</Trans>
						</p>
					</div>
				</>
			)}

			{wataFinalizeState === 'failed' && (
				<>
					<XCircleIcon className={styles.errorIcon} weight="fill" />
					<div className={styles.content}>
						<h1 className={styles.title}>
							<Trans>Payment confirmation failed</Trans>
						</h1>
						<p className={styles.description}>
							<Trans>WATA redirected back, but Astral could not confirm the charge. If money was debited, contact support with the payment time.</Trans>
						</p>
					</div>
				</>
			)}

			{isCancel && (
				<>
					<XCircleIcon className={styles.errorIcon} weight="fill" />
					<div className={styles.content}>
						<h1 className={styles.title}>
							<Trans>Payment Cancelled</Trans>
						</h1>
						<p className={styles.description}>
							<Trans>Your payment was cancelled. You can now close this tab and return to the app.</Trans>
						</p>
					</div>
				</>
			)}

			{isClosedBillingPortal && (
				<>
					<CheckCircleIcon className={styles.successIcon} weight="fill" />
					<div className={styles.content}>
						<h1 className={styles.title}>
							<Trans>All Done</Trans>
						</h1>
						<p className={styles.description}>
							<Trans>You can now close this tab and return to the app.</Trans>
						</p>
					</div>
				</>
			)}

			{!isSuccess && !isCancel && !isClosedBillingPortal && (
				<div className={styles.content}>
					<h1 className={styles.title}>
						<Trans>Invalid Status</Trans>
					</h1>
					<p className={styles.description}>
						<Trans>An invalid status was provided. You can now close this tab and return to the app.</Trans>
					</p>
				</div>
			)}
		</div>
	);
});

export default PremiumCallbackPage;
