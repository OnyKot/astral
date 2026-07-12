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
import {ArrowSquareOutIcon, BellIcon, BellSlashIcon, CheckCircleIcon, XIcon} from '@phosphor-icons/react';
import {observer} from 'mobx-react-lite';
import React from 'react';
import * as ModalActionCreators from '~/actions/ModalActionCreators';
import * as Modal from '~/components/modals/Modal';
import {SettingsSection} from '~/components/modals/shared/SettingsSection';
import {Button} from '~/components/uikit/Button/Button';
import {SwitchGroup, SwitchGroupItem} from '~/components/uikit/SwitchGroup';
import TelegramIntegrationStore, {type TelegramNotificationPreferences} from '~/stores/TelegramIntegrationStore';

export const TelegramIntegrationSettingsModal: React.FC = observer(() => {
	const {t} = useLingui();
	const conn = TelegramIntegrationStore.connection;
	const prefs: TelegramNotificationPreferences = conn?.preferences ?? {};
	const loading = TelegramIntegrationStore.status === 'loading';

	const categories: Array<{key: keyof TelegramNotificationPreferences; label: string; defaultValue: boolean}> = [
		{key: 'dms', label: t`Direct Messages`, defaultValue: true},
		{key: 'mentions', label: t`Mentions`, defaultValue: true},
		{key: 'calls', label: t`Calls`, defaultValue: true},
		{key: 'friend_requests', label: t`Friend Requests`, defaultValue: true},
		{key: 'billing', label: `${t`Billing`} / ${t`Premium`}`, defaultValue: true},
		{key: 'announcements', label: t`Announcements`, defaultValue: false},
	];

	const togglePref = (key: keyof TelegramNotificationPreferences, current: boolean) => {
		void TelegramIntegrationStore.updatePreferences({preferences: {...prefs, [key]: !current}});
	};

	const toggleMaster = () => {
		void TelegramIntegrationStore.updatePreferences({
			notifications_enabled: !(conn?.notificationsEnabled ?? true),
		});
	};

	return (
		<Modal.Root size="medium" centered onClose={() => ModalActionCreators.pop()}>
			<Modal.Header title={t`Telegram Settings`} />
			<Modal.Content padding="default">
				{conn ? (
					<>
						<SettingsSection
							id="tg-account"
							title={t`Connected Account`}
							description={t`Telegram identity tied to your Astral account.`}
							defaultExpanded={true}
						>
							<div style={{display: 'grid', gap: '6px', fontSize: '14px'}}>
								<div>
									<strong>{conn.firstName ?? conn.username ?? conn.telegramUserId}</strong>
									{conn.username && <span style={{color: 'var(--text-muted)'}}> @{conn.username}</span>}
								</div>
								{conn.username && (
									<a
										href={`https://t.me/${conn.username}`}
										target="_blank"
										rel="noreferrer noopener"
										style={{color: 'var(--text-link)', fontSize: '13px', textDecoration: 'none'}}
									>
										<ArrowSquareOutIcon size={12} weight="bold" /> <Trans>Open in Telegram</Trans>
									</a>
								)}
							</div>
						</SettingsSection>

						<SettingsSection
							id="tg-master"
							title={t`Master switch`}
							description={t`Pause all notifications without disconnecting.`}
							defaultExpanded={true}
						>
							<Button
								small={true}
								variant={conn.notificationsEnabled ? 'danger-secondary' : 'primary'}
								onClick={toggleMaster}
								submitting={loading}
							>
								{conn.notificationsEnabled ? (
									<>
										<BellSlashIcon size={14} weight="bold" />
										<Trans>Mute all</Trans>
									</>
								) : (
									<>
										<BellIcon size={14} weight="bold" />
										<Trans>Unmute all</Trans>
									</>
								)}
							</Button>
						</SettingsSection>

						<SettingsSection
							id="tg-categories"
							title={t`Notification categories`}
							description={t`Choose what to receive in Telegram. Security alerts (logins, 2FA codes) are always sent.`}
							defaultExpanded={true}
						>
							<div style={{opacity: conn.notificationsEnabled ? 1 : 0.5, pointerEvents: conn.notificationsEnabled ? 'auto' : 'none'}}>
								<SwitchGroup>
									{categories.map(({key, label, defaultValue}) => (
										<SwitchGroupItem
											key={key}
											label={label}
											value={prefs[key] ?? defaultValue}
											onChange={(value: boolean) => togglePref(key, !value)}
										/>
									))}
								</SwitchGroup>
							</div>
						</SettingsSection>

						<SettingsSection
							id="tg-2fa"
							title={t`Two-factor login`}
							description={t`Use Telegram as the second factor when logging into Astral. We will send a 6-digit code to your @AstralNotifyBot chat.`}
							defaultExpanded={true}
						>
							<TelegramTwoFactorBlock />
						</SettingsSection>

						<SettingsSection
							id="tg-disconnect"
							title={t`Disconnect`}
							description={t`Removes the link between Astral and your Telegram.`}
							defaultExpanded={true}
						>
							<Button
								small={true}
								variant="danger-secondary"
								onClick={() => {
									void TelegramIntegrationStore.disconnect();
									ModalActionCreators.pop();
								}}
							>
								<XIcon size={14} weight="bold" />
								<Trans>Disconnect Telegram</Trans>
							</Button>
						</SettingsSection>
					</>
				) : (
					<div style={{padding: '32px', textAlign: 'center', color: 'var(--text-muted)'}}>
						<Trans>Telegram is not connected.</Trans>
					</div>
				)}
			</Modal.Content>
		</Modal.Root>
	);
});

const TelegramTwoFactorBlock: React.FC = observer(() => {
	const {t} = useLingui();
	const conn = TelegramIntegrationStore.connection;
	const [step, setStep] = React.useState<'idle' | 'awaiting_code' | 'verifying' | 'done'>('idle');
	const [code, setCode] = React.useState('');
	const [error, setError] = React.useState<string | null>(null);

	if (!conn) return null;

	if (conn.twoFactorEnabled) {
		return (
			<div style={{display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap'}}>
				<span style={{color: '#7ed957', fontSize: '14px', display: 'inline-flex', alignItems: 'center', gap: '6px'}}>
					<CheckCircleIcon size={14} weight="fill" />
					<Trans>Telegram 2FA is enabled</Trans>
				</span>
				<Button
					small={true}
					variant="danger-secondary"
					onClick={() => void TelegramIntegrationStore.disableTwoFactor()}
				>
					<Trans>Disable</Trans>
				</Button>
			</div>
		);
	}

	const startSetup = async () => {
		setError(null);
		setStep('verifying');
		const result = await TelegramIntegrationStore.setupTwoFactor();
		if (result.ok) {
			setStep('awaiting_code');
		} else {
			setError(result.error ?? 'unknown_error');
			setStep('idle');
		}
	};

	const verifyCode = async () => {
		setError(null);
		setStep('verifying');
		const result = await TelegramIntegrationStore.enableTwoFactor(code);
		if (result.ok) {
			setStep('done');
			setCode('');
		} else {
			setError(result.error ?? 'invalid_code');
			setStep('awaiting_code');
		}
	};

	const errorMessage = React.useMemo(() => {
		if (!error) return null;
		if (error === 'invalid_code') return `${t`Invalid`} ${t`Code`}. ${t`Try again`}.`;
		if (error === 'unknown_error') return `${t`Something went wrong`}. ${t`Try again`}.`;
		return error;
	}, [error, t]);

	if (step === 'idle' || step === 'verifying') {
		return (
			<div style={{display: 'grid', gap: '8px'}}>
				<Button small={true} onClick={startSetup} submitting={step === 'verifying'}>
					<Trans>Set up Telegram 2FA</Trans>
				</Button>
				{errorMessage && <span style={{color: 'var(--text-danger)', fontSize: '12px'}}>{errorMessage}</span>}
			</div>
		);
	}

	if (step === 'awaiting_code') {
		return (
			<div style={{display: 'grid', gap: '12px'}}>
				<span style={{fontSize: '13px', color: 'var(--text-muted)'}}>
					<Trans>We sent a 6-digit code to your Telegram. Enter it below to enable 2FA:</Trans>
				</span>
				<div style={{display: 'flex', gap: '8px', alignItems: 'center'}}>
					<input
						type="text"
						inputMode="numeric"
						pattern="[0-9]{6}"
						maxLength={6}
						value={code}
						onChange={(e) => setCode(e.target.value.replace(/[^0-9]/g, ''))}
						placeholder="000000"
						style={{
							padding: '8px 12px',
							fontSize: '18px',
							letterSpacing: '4px',
							border: '1px solid var(--background-modifier-accent)',
							borderRadius: '6px',
							background: 'var(--background-secondary)',
							color: 'var(--text-normal)',
							width: '140px',
							textAlign: 'center',
						}}
					/>
					<Button small={true} onClick={() => void verifyCode()} disabled={code.length !== 6}>
						<Trans>Verify</Trans>
					</Button>
				</div>
				{errorMessage && <span style={{color: 'var(--text-danger)', fontSize: '12px'}}>{errorMessage}</span>}
			</div>
		);
	}

	return (
		<span style={{color: '#7ed957'}}>
			<Trans>Telegram 2FA enabled successfully.</Trans>
		</span>
	);
});