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

import {LightningIcon, PlusIcon, TrashIcon, UserCircleIcon, XIcon} from '@phosphor-icons/react';
import React from 'react';
import * as AuthenticationActionCreators from '~/actions/AuthenticationActionCreators';
import AppStorage from '~/lib/AppStorage';
import styles from './DevQuickLogin.module.css';

/**
 * Frontend-developer convenience: pick a saved dev account and log in with
 * one click. Intentionally plain text — no translation, no i18n macros.
 * Tree-shaken out of production builds entirely via the
 * `import.meta.env.MODE !== 'development'` early-return (the literal is
 * inlined at bundle time by rspack's DefinePlugin).
 *
 * You can save N accounts (label + email + password) and pick from a list
 * at login time. Useful for testing as Admin / regular user / new user
 * side by side.
 */

const STORAGE_KEY = 'astral:dev-login:accounts:v1';

interface Account {
	id: string;
	label: string;
	email: string;
	password: string;
}

const readAccounts = (): Array<Account> => {
	return AppStorage.getJSON<Array<Account>>(STORAGE_KEY, []) ?? [];
};

const writeAccounts = (accounts: Array<Account>): void => {
	AppStorage.setJSON(STORAGE_KEY, accounts);
};

const genId = () =>
	globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

interface DevQuickLoginProps {
	redirectPath?: string;
}

// Hostnames where the Dev panel must stay hidden — the prod server runs the
// rspack dev-server binary, so `import.meta.env.MODE === 'development'` is
// true there too. We need a second gate keyed on the actual domain.
const PROD_HOSTNAME_RX =
	/^(.*\.)?(astraof\.com|asrtal\.ru|astraof\.dev|astral\.cat)$/i;

const shouldHideOnThisHost = (): boolean => {
	if (typeof window === 'undefined') return false;
	const hostname = window.location?.hostname ?? '';
	return PROD_HOSTNAME_RX.test(hostname);
};

export const DevQuickLogin: React.FC<DevQuickLoginProps> = ({redirectPath}) => {
	// First gate: bundle mode. Production builds drop this entirely.
	if (import.meta.env.MODE !== 'development') {
		return null;
	}
	// Second gate: hostname. Even a dev bundle shouldn't expose the panel on
	// our public domains where real users land.
	if (shouldHideOnThisHost()) {
		return null;
	}

	const [accounts, setAccounts] = React.useState<Array<Account>>(() => readAccounts());
	const [showForm, setShowForm] = React.useState(false);
	const [labelInput, setLabelInput] = React.useState('');
	const [emailInput, setEmailInput] = React.useState('');
	const [passwordInput, setPasswordInput] = React.useState('');
	const [busyId, setBusyId] = React.useState<string | null>(null);
	const [error, setError] = React.useState<string | null>(null);

	const doLogin = React.useCallback(
		async (account: Account) => {
			setBusyId(account.id);
			setError(null);
			try {
				const response = await AuthenticationActionCreators.login({
					email: account.email,
					password: account.password,
				});
				if ('ip_authorization_required' in response && response.ip_authorization_required) {
					setError(`${account.label}: IP authorization required.`);
					return;
				}
				if ('mfa' in response && response.mfa) {
					setError(`${account.label}: MFA enabled — dev login can't bypass.`);
					return;
				}
				const token = 'token' in response ? response.token : undefined;
				const userId = 'user_id' in response ? response.user_id : undefined;
				if (!token || !userId) {
					setError(`${account.label}: unexpected login response.`);
					return;
				}
				await AuthenticationActionCreators.completeLogin({
					token,
					userId,
				});
				if (redirectPath) {
					window.location.assign(redirectPath);
				}
			} catch (err) {
				const msg = err instanceof Error ? err.message : String(err);
				setError(`${account.label}: ${msg}`);
			} finally {
				setBusyId(null);
			}
		},
		[redirectPath],
	);

	const handleAddSubmit = React.useCallback(
		(event: React.FormEvent) => {
			event.preventDefault();
			if (!emailInput || !passwordInput) {
				setError('Email and password required.');
				return;
			}
			const account: Account = {
				id: genId(),
				label: labelInput.trim() || emailInput,
				email: emailInput,
				password: passwordInput,
			};
			const next = [...accounts, account];
			writeAccounts(next);
			setAccounts(next);
			setLabelInput('');
			setEmailInput('');
			setPasswordInput('');
			setShowForm(false);
			setError(null);
		},
		[accounts, emailInput, labelInput, passwordInput],
	);

	const handleRemove = React.useCallback(
		(id: string) => {
			const next = accounts.filter((a) => a.id !== id);
			writeAccounts(next);
			setAccounts(next);
		},
		[accounts],
	);

	return (
		<div className={styles.root} data-dev-only>
			<div className={styles.badge}>
				<LightningIcon weight="fill" />
				<span>Dev only</span>
			</div>

			{accounts.length > 0 && (
				<ul className={styles.accountList}>
					{accounts.map((acc) => (
						<li key={acc.id} className={styles.accountRow}>
							<button
								type="button"
								className={styles.accountPick}
								onClick={() => void doLogin(acc)}
								disabled={busyId !== null}
							>
								<UserCircleIcon weight="fill" className={styles.accountIcon} />
								<span className={styles.accountText}>
									<span className={styles.accountLabel}>{acc.label}</span>
									<span className={styles.accountEmail}>{acc.email}</span>
								</span>
								{busyId === acc.id && <span className={styles.spinner}>…</span>}
							</button>
							<button
								type="button"
								className={styles.iconButton}
								onClick={() => handleRemove(acc.id)}
								disabled={busyId !== null}
								title="Remove this account"
							>
								<TrashIcon weight="bold" />
							</button>
						</li>
					))}
				</ul>
			)}

			{!showForm && (
				<button
					type="button"
					className={styles.addButton}
					onClick={() => setShowForm(true)}
					disabled={busyId !== null}
				>
					<PlusIcon weight="bold" />
					<span>{accounts.length === 0 ? 'Add a dev account' : 'Add another'}</span>
				</button>
			)}

			{showForm && (
				<form className={styles.form} onSubmit={handleAddSubmit}>
					<input
						type="text"
						className={styles.input}
						placeholder="Label (e.g. Admin, User1)"
						value={labelInput}
						onChange={(e) => setLabelInput(e.target.value)}
						disabled={busyId !== null}
					/>
					<input
						type="email"
						autoComplete="email"
						className={styles.input}
						placeholder="dev@astral.local"
						value={emailInput}
						onChange={(e) => setEmailInput(e.target.value)}
						disabled={busyId !== null}
						required
					/>
					<input
						type="password"
						autoComplete="current-password"
						className={styles.input}
						placeholder="password"
						value={passwordInput}
						onChange={(e) => setPasswordInput(e.target.value)}
						disabled={busyId !== null}
						required
					/>
					<div className={styles.formActions}>
						<button type="submit" className={styles.primaryButton} disabled={busyId !== null}>
							Save
						</button>
						<button
							type="button"
							className={styles.secondaryButton}
							onClick={() => {
								setShowForm(false);
								setError(null);
							}}
							disabled={busyId !== null}
						>
							<XIcon weight="bold" /> Cancel
						</button>
					</div>
				</form>
			)}

			{error && <div className={styles.error}>{error}</div>}
		</div>
	);
};
