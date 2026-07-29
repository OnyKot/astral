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
import {useCallback, useState} from 'react';
import * as AuthenticationActionCreators from '~/actions/AuthenticationActionCreators';
import {AccountSelector} from '~/components/accounts/AccountSelector';
import {HandoffCodeDisplay} from '~/components/auth/HandoffCodeDisplay';
import {SessionExpiredError} from '~/lib/SessionManager';
import AccountManager, {type AccountSummary} from '~/stores/AccountManager';

type HandoffState = 'selecting' | 'generating' | 'done' | 'error';

interface DesktopHandoffAccountSelectorProps {
	excludeCurrentUser?: boolean;
	handoffCode?: string | null;
	onSelectNewAccount: () => void;
}

function normalizeHandoffCode(raw: string): string {
	return raw.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
}

const DesktopHandoffAccountSelector = observer(function DesktopHandoffAccountSelector({
	excludeCurrentUser = false,
	handoffCode = null,
	onSelectNewAccount,
}: DesktopHandoffAccountSelectorProps) {
	const {t} = useLingui();
	const [handoffState, setHandoffState] = useState<HandoffState>('selecting');
	const [handoffError, setHandoffError] = useState<string | null>(null);
	const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);

	const currentUserId = AccountManager.currentUserId;
	const allAccounts = AccountManager.orderedAccounts;
	const accounts = excludeCurrentUser ? allAccounts.filter((account) => account.userId !== currentUserId) : allAccounts;
	const isGenerating = handoffState === 'generating';

	const handleSelectAccount = useCallback(
		async (account: AccountSummary) => {
			const normalized = normalizeHandoffCode(handoffCode ?? '');
			if (normalized.length !== 8) {
				setHandoffState('error');
				setHandoffError(t`Missing handoff code from desktop. Open the browser link from the desktop app and try again.`);
				return;
			}

			setSelectedAccountId(account.userId);
			setHandoffState('generating');
			setHandoffError(null);

			try {
				const {token, userId} = await AccountManager.generateTokenForAccount(account.userId);
				if (!token) {
					throw new Error('Failed to generate token');
				}

				const formatted = `${normalized.slice(0, 4)}-${normalized.slice(4)}`;
				await AuthenticationActionCreators.completeDesktopHandoff({
					code: formatted,
					token,
					userId,
				});

				setHandoffState('done');
			} catch (error) {
				setHandoffState('error');
				if (error instanceof SessionExpiredError) {
					setHandoffError(t`Session expired. Please log in again.`);
				} else {
					setHandoffError(error instanceof Error ? error.message : t`Failed to complete desktop handoff`);
				}
			}
		},
		[handoffCode, t],
	);

	const handleRetry = useCallback(() => {
		if (selectedAccountId) {
			const account = allAccounts.find((a) => a.userId === selectedAccountId);
			if (account) {
				void handleSelectAccount(account);
				return;
			}
		}
		setHandoffState('selecting');
		setSelectedAccountId(null);
		setHandoffError(null);
	}, [selectedAccountId, allAccounts, handleSelectAccount]);

	if (handoffState === 'generating' || handoffState === 'done' || handoffState === 'error') {
		return (
			<HandoffCodeDisplay
				code={null}
				isGenerating={handoffState === 'generating'}
				success={handoffState === 'done'}
				error={handoffState === 'error' ? handoffError : null}
				onRetry={handleRetry}
			/>
		);
	}

	return (
		<AccountSelector
			accounts={accounts}
			title={<Trans>Choose an account</Trans>}
			description={<Trans>Select the account you want to sign in with on the desktop app.</Trans>}
			disabled={isGenerating}
			showInstance
			clickableRows
			onSelectAccount={handleSelectAccount}
			onAddAccount={onSelectNewAccount}
			addButtonLabel={<Trans>Add a different account</Trans>}
			scrollerKey="desktop-handoff-scroller"
		/>
	);
});

export default DesktopHandoffAccountSelector;
