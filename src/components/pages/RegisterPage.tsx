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
import {useCallback, useEffect, useId, useState} from 'react';
import * as AuthenticationActionCreators from '~/actions/AuthenticationActionCreators';
import {AuthBottomLink} from '~/components/auth/AuthBottomLink';
import sharedStyles from '~/components/auth/AuthPageStyles.module.css';
import {AuthRegisterWizardCore} from '~/components/auth/AuthRegisterWizardCore';
import {Button} from '~/components/uikit/Button/Button';
import {useAstralDocumentTitle} from '~/hooks/useAstralDocumentTitle';
import {useLocation} from '~/lib/router';
import {Routes} from '~/Routes';
import * as RouterUtils from '~/utils/RouterUtils';
import styles from './RegisterPage.module.css';

/*
 * Minimalist registration — single heading, single form, single login link.
 * Previously the mobile branch rendered a big hero + 4 highlight cards +
 * a trust-checklist panel wrapped in a decorated card with eyebrow / title /
 * subtitle copy. All of that added cognitive load to what should be a
 * 30-second sign-up flow. Strip it to the essentials on every viewport;
 * the full auth-shell decoration (background image, splash card layout)
 * still wraps the page via AuthLayout so it never looks bare.
 */
const RegisterPageContent = observer(function RegisterPageContent() {
	const location = useLocation();
	const params = new URLSearchParams(location.search);
	const rawRedirect = params.get('redirect_to');
	const redirectTo = Routes.ME;
	const loginPath = `/login${rawRedirect ? `?redirect_to=${encodeURIComponent(rawRedirect)}` : ''}`;
	const verificationModalTitleId = useId();
	const verificationModalDescriptionId = useId();
	const [isVerificationModalOpen, setIsVerificationModalOpen] = useState(false);
	const [verificationEmail, setVerificationEmail] = useState<string | null>(null);

	const handleRegisterComplete = useCallback(
		async ({token, user_id}: {token: string; user_id: string}) => {
			await AuthenticationActionCreators.completeLogin({
				token,
				userId: user_id,
				skipRedirect: true,
			});
		},
		[],
	);

	const handlePendingVerification = useCallback(({email}: {email?: string}) => {
		setVerificationEmail(email ?? null);
		setIsVerificationModalOpen(true);
	}, []);

	useEffect(() => {
		const navigatorWithConnection = navigator as Navigator & {connection?: {saveData?: boolean}};
		if (navigatorWithConnection.connection?.saveData) return;

		const preloadLogin = () => {
			void import('~/components/pages/LoginPage');
		};
		const schedule = window.requestIdleCallback;

		if (schedule) {
			const id = schedule(preloadLogin, {timeout: 1800});
			return () => window.cancelIdleCallback?.(id);
		}

		const id = window.setTimeout(preloadLogin, 500);
		return () => window.clearTimeout(id);
	}, []);

	useEffect(() => {
		if (!isVerificationModalOpen) {
			return;
		}

		const handleKeyDown = (event: KeyboardEvent) => {
			if (event.key === 'Escape') {
				setIsVerificationModalOpen(false);
			}
		};

		window.addEventListener('keydown', handleKeyDown);
		return () => {
			window.removeEventListener('keydown', handleKeyDown);
		};
	}, [isVerificationModalOpen]);

	return (
		<>
			<h1 className={sharedStyles.title}>
				<Trans>Create account</Trans>
			</h1>

			<div className={`${sharedStyles.container} ${styles.nativeRegisterContainer}`} data-auth-cosmic>
				<AuthRegisterWizardCore
					fields={{
						showEmail: true,
						showPassword: true,
						showUsernameValidation: true,
						showBetaCodeHint: false,
						requireBetaCode: false,
					}}
					submitLabel={<Trans>Create account</Trans>}
					redirectPath={redirectTo}
					onRegister={handleRegisterComplete}
					onPendingVerification={handlePendingVerification}
				/>

				<AuthBottomLink variant="login" to={loginPath} />
			</div>

			{isVerificationModalOpen && (
				<div className={styles.verificationModalOverlay} onClick={() => setIsVerificationModalOpen(false)}>
					<div
						className={styles.verificationModal}
						role="dialog"
						aria-modal="true"
						aria-labelledby={verificationModalTitleId}
						aria-describedby={verificationModalDescriptionId}
						onClick={(event) => event.stopPropagation()}
					>
						<span className={styles.verificationModalBadge}>
							<Trans>Email sent</Trans>
						</span>
						<h2 id={verificationModalTitleId} className={styles.verificationModalTitle}>
							<Trans>Check your inbox</Trans>
						</h2>
						<p id={verificationModalDescriptionId} className={styles.verificationModalText}>
							{verificationEmail ? (
								<Trans>
									We sent a verification link to <span className={styles.verificationModalEmail}>{verificationEmail}</span>.
									Please open your email and confirm your account.
								</Trans>
							) : (
								<Trans>We sent a verification link to your email. Please open your inbox and confirm your account.</Trans>
							)}
						</p>
						<div className={styles.verificationModalActions}>
							<Button type="button" fitContainer onClick={() => RouterUtils.replaceWith(loginPath)}>
								<Trans>Go to login</Trans>
							</Button>
							<Button type="button" fitContainer variant="secondary" onClick={() => setIsVerificationModalOpen(false)}>
								<Trans>Close</Trans>
							</Button>
						</div>
					</div>
				</div>
			)}
		</>
	);
});

const RegisterPage = observer(function RegisterPage() {
	const {t} = useLingui();
	useAstralDocumentTitle(t`Register`);

	return <RegisterPageContent />;
});

export default RegisterPage;
