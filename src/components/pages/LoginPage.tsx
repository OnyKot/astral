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
import {useCallback, useMemo} from 'react';

import * as AuthenticationActionCreators from '~/actions/AuthenticationActionCreators';
import sharedStyles from '~/components/auth/AuthPageStyles.module.css';
import {useDesktopHandoffFlow} from '~/components/auth/AuthLoginCore/useDesktopHandoffFlow';
import {AuthLoginLayout} from '~/components/auth/AuthLoginLayout';
import {AuthRouterLink} from '~/components/auth/AuthRouterLink';
import {DevQuickLogin} from '~/components/auth/DevQuickLogin';
import {HandoffCodeDisplay} from '~/components/auth/HandoffCodeDisplay';
import MfaScreen from '~/components/auth/MfaScreen';
import {useAstralDocumentTitle} from '~/hooks/useAstralDocumentTitle';
import type {LoginSuccessPayload} from '~/hooks/useLoginFlow';
import {useLocation} from '~/lib/router';
import AccountManager from '~/stores/AccountManager';
import AuthenticationStore from '~/stores/AuthenticationStore';
import * as RouterUtils from '~/utils/RouterUtils';
import registerStyles from './RegisterPage.module.css';

/*
 * Minimalist login — single heading, single form, single register link.
 * Mirrors RegisterPage so the sign-in and sign-up flows feel identical
 * across desktop, mobile web, and the native Android shell. Previously
 * the mobile branch rendered NativeMobileAuthHero + a decorated card
 * with eyebrow / title / subtitle copy that didn't match the cleaner
 * Register screen. AuthLoginLayout now exposes a `bare` mode so we can
 * own the heading + container while still reusing all the existing
 * login state machinery (handoff, biometrics, MFA, IP-auth, account
 * selector).
 */
const LoginPage = observer(function LoginPage() {
	const location = useLocation();
	const params = useMemo(() => new URLSearchParams(location.search), [location.search]);

	const rawRedirect = params.get('redirect_to');
	const isDesktopHandoff = params.get('desktop_handoff') === '1';
	const initialEmail = params.get('email') ?? undefined;

	const redirectPath = isDesktopHandoff ? undefined : rawRedirect || '/';

	return (
		<>
			<h1 className={sharedStyles.title}>
				<Trans>Welcome back</Trans>
			</h1>

			<div className={`${sharedStyles.container} ${registerStyles.nativeRegisterContainer}`} data-auth-cosmic>
				{/*
				 * AuthLoginLayout already renders its own "Need an account?
				 * Register" link inside the shared form footer, so we deliberately
				 * do NOT wrap a second AuthBottomLink around it — adding one
				 * here was producing the duplicate "Зарегистрироваться" link
				 * users were seeing on /login.
				 */}
				<AuthLoginLayout
					bare
					redirectPath={redirectPath}
					desktopHandoff={isDesktopHandoff}
					excludeCurrentUser={false}
					initialEmail={initialEmail}
					registerLink={
						<AuthRouterLink to="/register" search={{redirect_to: rawRedirect || undefined}}>
							<Trans>Register</Trans>
						</AuthRouterLink>
					}
				/>
				<DevQuickLogin redirectPath={redirectPath} />
			</div>
		</>
	);
});

const LoginPageMFA = observer(function LoginPageMFA() {
	const location = useLocation();
	const params = useMemo(() => new URLSearchParams(location.search), [location.search]);

	const isDesktopHandoff = params.get('desktop_handoff') === '1';
	const rawRedirect = params.get('redirect_to');

	const redirectTo = isDesktopHandoff ? undefined : rawRedirect || '/';

	const mfaTicket = AuthenticationStore.currentMfaTicket ?? AuthenticationStore.mfaTicket;
	const mfaMethods = AuthenticationStore.availableMfaMethods ?? AuthenticationStore.mfaMethods;

	const hasStoredAccounts = AccountManager.orderedAccounts.length > 0;

	const handoff = useDesktopHandoffFlow({
		enabled: isDesktopHandoff,
		hasStoredAccounts,
		initialMode: 'idle',
	});

	const handleMfaSuccess = useCallback(
		async ({token, userId}: LoginSuccessPayload) => {
			if (isDesktopHandoff) {
				await handoff.start({token, userId});
				return;
			} else {
				await AuthenticationActionCreators.completeLogin({token, userId, skipRedirect: Boolean(redirectTo)});
				AuthenticationActionCreators.clearMfaTicket();

				RouterUtils.replaceWith(redirectTo || '/');
				return;
			}
		},
		[handoff, isDesktopHandoff, redirectTo],
	);

	const handleCancel = useCallback(() => {
		AuthenticationActionCreators.clearMfaTicket();
	}, []);

	if (!mfaTicket || !mfaMethods) {
		return null;
	}

	if (
		isDesktopHandoff &&
		(handoff.mode === 'generating' || handoff.mode === 'displaying' || handoff.mode === 'error')
	) {
		return (
			<HandoffCodeDisplay
				code={handoff.code}
				isGenerating={handoff.mode === 'generating'}
				error={handoff.mode === 'error' ? handoff.error : null}
				onRetry={handoff.retry}
			/>
		);
	}

	return (
		<MfaScreen challenge={{ticket: mfaTicket, ...mfaMethods}} onSuccess={handleMfaSuccess} onCancel={handleCancel} />
	);
});

const LoginPageContainer = observer(() => {
	const {t} = useLingui();
	const loginState = AuthenticationStore.loginState;

	useAstralDocumentTitle(t`Log in`);

	switch (loginState) {
		case 'default':
			return <LoginPage />;
		case 'mfa':
			return <LoginPageMFA />;
		default:
			return null;
	}
});

export default LoginPageContainer;
