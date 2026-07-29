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

import {msg} from '@lingui/core/macro';
import {Trans, useLingui} from '@lingui/react/macro';
import {ArrowSquareOutIcon, CheckCircleIcon} from '@phosphor-icons/react';
import {observer} from 'mobx-react-lite';
import React from 'react';

import * as AuthenticationActionCreators from '~/actions/AuthenticationActionCreators';
import * as ModalActionCreators from '~/actions/ModalActionCreators';
import {modal} from '~/actions/ModalActionCreators';
import {Input} from '~/components/form/Input';
import * as Modal from '~/components/modals/Modal';
import {Button} from '~/components/uikit/Button/Button';
import {IS_DEV} from '~/lib/env';
import HttpClient from '~/lib/HttpClient';
import RuntimeConfigStore, {describeApiEndpoint, type InstanceDiscoveryResponse} from '~/stores/RuntimeConfigStore';
import {isDesktop, openExternalUrl} from '~/utils/NativeUtils';

import styles from './BrowserLoginHandoffModal.module.css';

interface LoginSuccessPayload {
	token: string;
	userId: string;
}

interface BrowserLoginHandoffModalProps {
	onSuccess: (payload: LoginSuccessPayload) => Promise<void>;
	targetWebAppUrl?: string;
	prefillEmail?: string;
}

interface ValidatedInstance {
	apiEndpoint: string;
	webAppUrl: string;
}

type ModalView = 'main' | 'instance';

const POLL_INTERVAL_MS = 1500;

const normalizeEndpoint = (input: string): string => {
	const trimmed = input.trim();
	if (!trimmed) {
		throw new Error('API endpoint is required');
	}

	let candidate = trimmed;
	if (!/^[a-zA-Z][a-zA-Z0-9+\-.]*:\/\//.test(candidate)) {
		candidate = `https://${candidate}`;
	}

	const url = new URL(candidate);
	if (url.pathname === '' || url.pathname === '/') {
		url.pathname = '/api';
	}
	url.pathname = url.pathname.replace(/\/+$/, '');
	return url.toString();
};

const formatCodeForDisplay = (raw: string): string => {
	const cleaned = raw
		.replace(/[^A-Za-z0-9]/g, '')
		.toUpperCase()
		.slice(0, 8);

	if (cleaned.length <= 4) {
		return cleaned;
	}
	return `${cleaned.slice(0, 4)}-${cleaned.slice(4)}`;
};

const BrowserLoginHandoffModal = observer(
	({onSuccess, targetWebAppUrl, prefillEmail}: BrowserLoginHandoffModalProps) => {
		const {i18n} = useLingui();

		const [view, setView] = React.useState<ModalView>('main');
		const [error, setError] = React.useState<string | null>(null);
		const [isInitiating, setIsInitiating] = React.useState(true);
		const [isWaiting, setIsWaiting] = React.useState(false);
		const [handoffCode, setHandoffCode] = React.useState<string | null>(null);
		const [controlToken, setControlToken] = React.useState<string | null>(null);

		const [customInstance, setCustomInstance] = React.useState('');
		const [instanceValidating, setInstanceValidating] = React.useState(false);
		const [instanceError, setInstanceError] = React.useState<string | null>(null);
		const [validatedInstance, setValidatedInstance] = React.useState<ValidatedInstance | null>(null);

		const showInstanceOption = IS_DEV || isDesktop();
		const pollCancelledRef = React.useRef(false);

		React.useEffect(() => {
			let cancelled = false;
			pollCancelledRef.current = false;

			const run = async () => {
				setIsInitiating(true);
				setError(null);
				try {
					const result = await AuthenticationActionCreators.initiateDesktopHandoff();
					if (cancelled) return;
					if (!result.control_token) {
						throw new Error('Missing handoff control token');
					}
					setHandoffCode(result.code);
					setControlToken(result.control_token);
					setIsWaiting(true);
				} catch (err) {
					if (cancelled) return;
					const message = err instanceof Error ? err.message : String(err);
					setError(message);
				} finally {
					if (!cancelled) {
						setIsInitiating(false);
					}
				}
			};

			void run();
			return () => {
				cancelled = true;
				pollCancelledRef.current = true;
			};
		}, []);

		React.useEffect(() => {
			if (!isWaiting || !handoffCode || !controlToken) return;

			let active = true;
			pollCancelledRef.current = false;

			const poll = async () => {
				while (active && !pollCancelledRef.current) {
					try {
						const customApiEndpoint = validatedInstance?.apiEndpoint;
						const result = await AuthenticationActionCreators.pollDesktopHandoffStatus(
							handoffCode,
							controlToken,
							customApiEndpoint,
						);

						if (!active || pollCancelledRef.current) return;

						if (result.status === 'completed' && result.token && result.user_id) {
							if (customApiEndpoint) {
								await RuntimeConfigStore.connectToEndpoint(customApiEndpoint);
							}
							await onSuccess({token: result.token, userId: result.user_id});
							ModalActionCreators.pop();
							return;
						}

						if (result.status === 'expired') {
							// Still pending from our POV if we just initiated; keep polling until TTL.
						}
					} catch (err) {
						if (!active || pollCancelledRef.current) return;
						const message = err instanceof Error ? err.message : String(err);
						setError(message);
						setIsWaiting(false);
						return;
					}

					await new Promise((resolve) => window.setTimeout(resolve, POLL_INTERVAL_MS));
				}
			};

			void poll();
			return () => {
				active = false;
				pollCancelledRef.current = true;
			};
		}, [controlToken, handoffCode, isWaiting, onSuccess, validatedInstance]);

		const handleOpenBrowser = React.useCallback(async () => {
			if (!handoffCode) return;

			const currentWebAppUrl = RuntimeConfigStore.webAppBaseUrl;
			const baseUrl = validatedInstance?.webAppUrl || targetWebAppUrl || currentWebAppUrl;
			const rawCode = handoffCode.replace(/[^A-Za-z0-9]/g, '').toUpperCase();

			const params = new URLSearchParams({desktop_handoff: '1', handoff_code: rawCode});
			if (prefillEmail) {
				params.set('email', prefillEmail);
			}

			const url = `${baseUrl}/login?${params.toString()}`;
			await openExternalUrl(url);
		}, [handoffCode, prefillEmail, targetWebAppUrl, validatedInstance]);

		const handleShowInstanceView = React.useCallback(() => {
			setView('instance');
		}, []);

		const handleBackToMain = React.useCallback(() => {
			setView('main');
			setInstanceError(null);
		}, []);

		const handleSaveInstance = React.useCallback(async () => {
			if (!customInstance.trim()) {
				setInstanceError(i18n._(msg`Please enter an API endpoint.`));
				return;
			}

			setInstanceValidating(true);
			setInstanceError(null);

			try {
				const apiEndpoint = normalizeEndpoint(customInstance);
				const instanceUrl = `${apiEndpoint}/instance`;

				const response = await HttpClient.get<InstanceDiscoveryResponse>({url: instanceUrl});

				if (!response.ok) {
					const status = String(response.status);
					throw new Error(i18n._(msg`Failed to reach instance (${status})`));
				}

				const instance = response.body;
				if (!instance.endpoints?.webapp) {
					throw new Error(i18n._(msg`Invalid instance response: missing webapp URL.`));
				}

				const webAppUrl = instance.endpoints.webapp.replace(/\/$/, '');
				setValidatedInstance({apiEndpoint, webAppUrl});
				setView('main');
			} catch (err) {
				const message = err instanceof Error ? err.message : String(err);
				setInstanceError(message);
			} finally {
				setInstanceValidating(false);
			}
		}, [customInstance, i18n]);

		const handleClearInstance = React.useCallback(() => {
			setValidatedInstance(null);
			setCustomInstance('');
			setInstanceError(null);
		}, []);

		if (view === 'instance') {
			return (
				<Modal.Root size="small" centered onClose={ModalActionCreators.pop}>
					<Modal.Header title={i18n._(msg`Custom instance`)} />
					<Modal.Content className={styles.content}>
						<Input
							label={i18n._(msg`API Endpoint`)}
							type="url"
							placeholder="https://api.example.com"
							value={customInstance}
							onChange={(e) => {
								setCustomInstance(e.target.value);
								setInstanceError(null);
							}}
							error={instanceError ?? undefined}
							disabled={instanceValidating}
							footer={
								!instanceError ? (
									<p className={styles.inputHelper}>
										<Trans>Enter the API endpoint of the Astral instance you want to connect to.</Trans>
									</p>
								) : null
							}
							autoFocus
						/>
					</Modal.Content>
					<Modal.Footer>
						<Button variant="secondary" onClick={handleBackToMain} disabled={instanceValidating}>
							<Trans>Back</Trans>
						</Button>
						<Button
							variant="primary"
							onClick={handleSaveInstance}
							disabled={instanceValidating || !customInstance.trim()}
						>
							{instanceValidating ? <Trans>Checking...</Trans> : <Trans>Save</Trans>}
						</Button>
					</Modal.Footer>
				</Modal.Root>
			);
		}

		return (
			<Modal.Root size="small" centered onClose={ModalActionCreators.pop}>
				<Modal.Header title={i18n._(msg`Add account`)} />
				<Modal.Content className={styles.content}>
					<p className={styles.description}>
						<Trans>
							Open the browser to log in. This app keeps a private control token so only it can finish the session.
						</Trans>
					</p>

					<div className={styles.codeInputSection}>
						<Input
							label={i18n._(msg`Login code`)}
							value={handoffCode ? formatCodeForDisplay(handoffCode) : ''}
							readOnly
							error={error ?? undefined}
							disabled={isInitiating}
							footer={
								isWaiting ? (
									<p className={styles.inputHelper}>
										<Trans>Waiting for browser login…</Trans>
									</p>
								) : null
							}
						/>
					</div>

					{validatedInstance ? (
						<div className={styles.instanceBadge}>
							<CheckCircleIcon size={14} weight="fill" className={styles.instanceBadgeIcon} />
							<span className={styles.instanceBadgeText}>
								<Trans>Using {describeApiEndpoint(validatedInstance.apiEndpoint)}</Trans>
							</span>
							<button type="button" className={styles.instanceBadgeClear} onClick={handleClearInstance}>
								<Trans>Clear</Trans>
							</button>
						</div>
					) : showInstanceOption ? (
						<button type="button" className={styles.instanceLink} onClick={handleShowInstanceView}>
							<Trans>I want to use a custom Astral instance</Trans>
						</button>
					) : null}

					{prefillEmail ? (
						<p className={styles.prefillHint}>
							<Trans>We will prefill {prefillEmail} once the browser login opens.</Trans>
						</p>
					) : null}
				</Modal.Content>

				<Modal.Footer>
					<Button variant="secondary" onClick={ModalActionCreators.pop} disabled={isInitiating}>
						<Trans>Cancel</Trans>
					</Button>
					<Button
						variant="primary"
						onClick={handleOpenBrowser}
						disabled={isInitiating || !handoffCode}
						submitting={isWaiting}
					>
						<ArrowSquareOutIcon size={16} weight="bold" />
						<Trans>Open browser</Trans>
					</Button>
				</Modal.Footer>
			</Modal.Root>
		);
	},
);

export function showBrowserLoginHandoffModal(
	onSuccess: (payload: LoginSuccessPayload) => Promise<void>,
	targetWebAppUrl?: string,
	prefillEmail?: string,
): void {
	ModalActionCreators.push(
		modal(() => (
			<BrowserLoginHandoffModal
				onSuccess={async (payload) => {
					await onSuccess(payload);
				}}
				targetWebAppUrl={targetWebAppUrl}
				prefillEmail={prefillEmail}
			/>
		)),
	);
}

export default BrowserLoginHandoffModal;
