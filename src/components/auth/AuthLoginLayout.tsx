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
import clsx from 'clsx';
import {AnimatePresence, motion, useReducedMotion} from 'framer-motion';
import {observer} from 'mobx-react-lite';
import {
	cloneElement,
	type ReactElement,
	type ReactNode,
	type TouchEvent,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from 'react';
import * as AuthenticationActionCreators from '~/actions/AuthenticationActionCreators';
import {AccountSelector} from '~/components/accounts/AccountSelector';
import AuthLoginEmailPasswordForm from '~/components/auth/AuthLoginCore/AuthLoginEmailPasswordForm';
import AuthLoginPasskeyActions, {AuthLoginDivider} from '~/components/auth/AuthLoginCore/AuthLoginPasskeyActions';
import {useDesktopHandoffFlow} from '~/components/auth/AuthLoginCore/useDesktopHandoffFlow';
import {AuthRouterLink} from '~/components/auth/AuthRouterLink';
import DesktopHandoffAccountSelector from '~/components/auth/DesktopHandoffAccountSelector';
import {HandoffCodeDisplay} from '~/components/auth/HandoffCodeDisplay';
import IpAuthorizationScreen from '~/components/auth/IpAuthorizationScreen';
import {Button} from '~/components/uikit/Button/Button';
import styles from '~/components/pages/LoginPage.module.css';
import {type IpAuthorizationChallenge, type LoginSuccessPayload, useLoginFormController} from '~/hooks/useLoginFlow';
import {IS_DEV} from '~/lib/env';
import {SessionExpiredError} from '~/lib/SessionManager';
import AccountManager, {type AccountSummary} from '~/stores/AccountManager';
import AndroidBiometricStore from '~/stores/AndroidBiometricStore';
import AndroidNotificationSettingsStore from '~/stores/AndroidNotificationSettingsStore';
import AndroidPermissionStore from '~/stores/AndroidPermissionStore';
import {openAndroidAppSettings} from '~/utils/AndroidPermissions';
import {openAndroidAppNotificationSettings} from '~/utils/AndroidNotificationSettings';
import {isDesktop, isNativeMobile} from '~/utils/NativeUtils';
import * as RouterUtils from '~/utils/RouterUtils';

interface AuthLoginLayoutProps {
	redirectPath?: string;
	inviteCode?: string;
	desktopHandoff?: boolean;
	excludeCurrentUser?: boolean;
	extraTopContent?: ReactNode;
	showTitle?: boolean;
	title?: ReactNode;
	registerLink: ReactElement<Record<string, unknown>>;
	onLoginComplete?: (payload: LoginSuccessPayload) => Promise<void> | void;
	initialEmail?: string;
	/*
	 * `bare` skips the heavy mobile-shell card (eyebrow + title + subtitle +
	 * decorated wrapper) and the desktop welcome heading. The caller becomes
	 * responsible for its own framing — used by LoginPage to mirror the
	 * minimalist RegisterPage layout instead of two divergent auth flows.
	 */
	bare?: boolean;
}

type MobileLoginPanel = 'accounts' | 'login';
type AndroidSetupStep = 'account' | 'permissions' | 'ready';
const ANDROID_LOGIN_PERMISSIONS = ['notifications', 'microphone', 'camera', 'bluetooth'] as const;

const AuthLoginLayout = observer(function AuthLoginLayout({
	redirectPath,
	inviteCode,
	desktopHandoff = false,
	excludeCurrentUser = false,
	extraTopContent,
	showTitle = true,
	title,
	registerLink,
	onLoginComplete,
	initialEmail,
	bare = false,
}: AuthLoginLayoutProps) {
	const {t} = useLingui();
	const currentUserId = AccountManager.currentUserId;
	const accounts = AccountManager.orderedAccounts;
	const hasStoredAccounts = accounts.length > 0;

	const handoffAccounts =
		desktopHandoff && excludeCurrentUser ? accounts.filter((a) => a.userId !== currentUserId) : accounts;
	const hasHandoffAccounts = handoffAccounts.length > 0;

	const handoff = useDesktopHandoffFlow({
		enabled: desktopHandoff,
		hasStoredAccounts: hasHandoffAccounts,
		initialMode: desktopHandoff && hasHandoffAccounts ? 'selecting' : 'login',
	});

	const [ipAuthChallenge, setIpAuthChallenge] = useState<IpAuthorizationChallenge | null>(null);
	const [showAccountSelector, setShowAccountSelector] = useState(!desktopHandoff && hasStoredAccounts && !initialEmail);
	const [isSwitching, setIsSwitching] = useState(false);
	const [switchError, setSwitchError] = useState<string | null>(null);
	const [prefillEmail, setPrefillEmail] = useState<string | null>(() => initialEmail ?? null);

	const showLoginFormForAccount = useCallback((account: AccountSummary, message?: string | null) => {
		setShowAccountSelector(false);
		setSwitchError(message ?? null);
		setPrefillEmail(account.userData?.email ?? null);
	}, []);

	const handleLoginSuccess = useCallback(
		async ({token, userId}: LoginSuccessPayload) => {
			if (desktopHandoff) {
				await handoff.start({token, userId});
				return;
			}
			await AuthenticationActionCreators.completeLogin({token, userId, skipRedirect: Boolean(redirectPath)});
			await onLoginComplete?.({token, userId});
		},
		[desktopHandoff, handoff, onLoginComplete, redirectPath],
	);

	const {form, isLoading, fieldErrors, handlePasskeyLogin, handlePasskeyBrowserLogin, isPasskeyLoading} =
		useLoginFormController({
			redirectPath,
			inviteCode,
			onLoginSuccess: handleLoginSuccess,
			onRequireMfa: (challenge) => {
				AuthenticationActionCreators.setMfaTicket(challenge);
			},
			onRequireIpAuthorization: (challenge) => {
				setIpAuthChallenge(challenge);
			},
		});

	const supportsCustomInstanceForBrowserLogin = IS_DEV || isDesktop();
	const showBrowserPasskey = supportsCustomInstanceForBrowserLogin || isNativeMobile();
	const biometricStore = AndroidBiometricStore;
	const permissionStore = AndroidPermissionStore;
	const androidNotificationSettingsStore = AndroidNotificationSettingsStore;
	const [isBiometricLoading, setIsBiometricLoading] = useState(false);
	const [isAndroidPermissionsLoading, setIsAndroidPermissionsLoading] = useState(false);
	const showBiometricLogin =
		isNativeMobile() && biometricStore.available && biometricStore.enabled && biometricStore.hasStoredSession;
	const passkeyControlsDisabled = isLoading || Boolean(form.isSubmitting) || isPasskeyLoading || isBiometricLoading;
	const nativeMobile = isNativeMobile();
	const reducedMotion = useReducedMotion() ?? false;
	const mobileSwipeStartRef = useRef<{x: number; y: number} | null>(null);
	const [mobilePanel, setMobilePanel] = useState<MobileLoginPanel>(() =>
		hasStoredAccounts && !desktopHandoff && !initialEmail ? 'accounts' : 'login',
	);
	const [androidSetupStep, setAndroidSetupStep] = useState<AndroidSetupStep>('account');

	useEffect(() => {
		if (showBiometricLogin && showAccountSelector) {
			setShowAccountSelector(false);
		}
	}, [showAccountSelector, showBiometricLogin]);

	useEffect(() => {
		if (!nativeMobile || desktopHandoff) {
			return;
		}

		if (!hasStoredAccounts) {
			setMobilePanel('login');
			return;
		}

		if (initialEmail || switchError || showBiometricLogin) {
			setMobilePanel('login');
			return;
		}

		if (showAccountSelector) {
			setMobilePanel('accounts');
		}
	}, [desktopHandoff, hasStoredAccounts, initialEmail, nativeMobile, showAccountSelector, showBiometricLogin, switchError]);

	const handleIpAuthorizationComplete = useCallback(
		async ({token, userId}: LoginSuccessPayload) => {
			await handleLoginSuccess({token, userId});
			if (redirectPath) {
				RouterUtils.replaceWith(redirectPath);
			}
			setIpAuthChallenge(null);
		},
		[handleLoginSuccess, redirectPath],
	);

	useEffect(() => {
		setPrefillEmail(initialEmail ?? null);
		if (initialEmail) {
			setShowAccountSelector(false);
		}
	}, [initialEmail]);

	useEffect(() => {
		if (prefillEmail !== null) {
			form.setValue('email', prefillEmail);
		}
	}, [form, prefillEmail]);

	const handleShowSavedProfiles = useCallback(() => {
		if (!hasStoredAccounts) return;
		setMobilePanel('accounts');
		setSwitchError(null);
	}, [hasStoredAccounts]);

	const handleShowManualLogin = useCallback(() => {
		setMobilePanel('login');
		setShowAccountSelector(false);
	}, []);

	const handleSelectExistingAccount = useCallback(
		async (account: AccountSummary) => {
			const identifier = account.userData?.email ?? account.userData?.username ?? account.userId;
			const expiredMessage = t`Session expired for ${identifier}. Please log in again.`;

			if (account.isValid === false || !AccountManager.canSwitchAccounts) {
				showLoginFormForAccount(account, expiredMessage);
				return;
			}

			setIsSwitching(true);
			setSwitchError(null);
			try {
				await AccountManager.switchToAccount(account.userId);
			} catch (error) {
				const updatedAccount = AccountManager.accounts.get(account.userId);
				if (error instanceof SessionExpiredError || updatedAccount?.isValid === false) {
					showLoginFormForAccount(updatedAccount ?? account, expiredMessage);
					return;
				}

				setSwitchError(error instanceof Error ? error.message : t`Failed to switch account`);
			} finally {
				setIsSwitching(false);
			}
		},
		[showLoginFormForAccount],
	);

	const handleBiometricLogin = useCallback(async () => {
		setIsBiometricLoading(true);
		setSwitchError(null);
		try {
			const payload = await biometricStore.authenticate();
			if (!payload?.token || !payload.userId) {
				return;
			}

			setPrefillEmail(payload.email ?? null);
			await handleLoginSuccess({token: payload.token, userId: payload.userId});
			if (redirectPath) {
				RouterUtils.replaceWith(redirectPath);
			}
		} catch (error) {
			console.error('Biometric login failed', error);
			setSwitchError(error instanceof Error ? error.message : t`Biometric sign-in failed`);
		} finally {
			setIsBiometricLoading(false);
		}
	}, [biometricStore, handleLoginSuccess, redirectPath, t]);

	const missingAndroidPermissions = useMemo(
		() =>
			nativeMobile && permissionStore.supported
				? ANDROID_LOGIN_PERMISSIONS.filter((permission) => {
						const status = permissionStore.getStatus(permission);
						return status === 'denied' || status === 'permanently-denied';
					})
				: [],
		[nativeMobile, permissionStore.statuses, permissionStore.supported],
	);
	const hasPermissionReminder = missingAndroidPermissions.length > 0;
	const grantedAndroidPermissionsCount = ANDROID_LOGIN_PERMISSIONS.filter(
		(permission) => permissionStore.getStatus(permission) === 'granted',
	).length;
	const hasRequestablePermissions = missingAndroidPermissions.some(
		(permission) => permissionStore.getStatus(permission) === 'denied',
	);
	const hasBlockedPermissions = missingAndroidPermissions.some(
		(permission) => permissionStore.getStatus(permission) === 'permanently-denied',
	);
	const androidCallShortcutsReady =
		androidNotificationSettingsStore.supported &&
		androidNotificationSettingsStore.systemNotificationsEnabled &&
		androidNotificationSettingsStore.settings.quickActions;

	const handleResolveAndroidPermissions = useCallback(async () => {
		if (!permissionStore.supported) {
			return;
		}

		setIsAndroidPermissionsLoading(true);
		try {
			const requestablePermissions = ANDROID_LOGIN_PERMISSIONS.filter(
				(permission) => permissionStore.getStatus(permission) === 'denied',
			);

			if (requestablePermissions.length > 0) {
				await permissionStore.requestMany([...requestablePermissions]);
			} else {
				await openAndroidAppSettings();
			}
		} finally {
			setIsAndroidPermissionsLoading(false);
		}
	}, [permissionStore]);

	const handleOpenAndroidNotificationSettings = useCallback(async () => {
		await openAndroidAppNotificationSettings();
	}, []);

	const handleOpenAndroidSetupStep = useCallback((step: AndroidSetupStep) => {
		setAndroidSetupStep(step);
	}, []);

	const handleAddAnotherAccount = useCallback(() => {
		setShowAccountSelector(false);
		setMobilePanel('login');
		setSwitchError(null);
		setPrefillEmail(null);
	}, []);

	const styledRegisterLink = useMemo(() => {
		const {className: linkClassName} = registerLink.props as {className?: string};
		return cloneElement(registerLink, {
			className: clsx(styles.footerLink, linkClassName),
		});
	}, [registerLink]);

	const renderMobileShell = useCallback(
		(
			content: ReactNode,
			header: {
				eyebrow: ReactNode;
				title: ReactNode;
				description: ReactNode;
			},
		) => (
			<div className={styles.mobilePage}>
				{extraTopContent}
				<div className={styles.mobileSurface}>
					<section className={styles.mobileFormCard}>
						<div className={styles.mobileFormHeader}>
							<div className={styles.mobileFormEyebrow}>{header.eyebrow}</div>
							<h1 className={styles.mobileFormTitle}>{header.title}</h1>
							<p className={styles.mobileFormSubtitle}>{header.description}</p>
						</div>
						<div className={styles.mobileFormBody}>{content}</div>
					</section>
				</div>
			</div>
		),
		[extraTopContent],
	);

	const handleMobileSwipeStart = useCallback(
		(event: TouchEvent<HTMLDivElement>) => {
			if (!hasStoredAccounts) {
				mobileSwipeStartRef.current = null;
				return;
			}

			const target = event.target as HTMLElement | null;
			const interactiveTarget = target?.closest(
				'a, button, input, textarea, select, label, summary, [role="button"], [data-auth-swipe-ignore="true"]',
			);
			if (interactiveTarget) {
				mobileSwipeStartRef.current = null;
				return;
			}

			const touch = event.touches[0];
			if (!touch) return;
			mobileSwipeStartRef.current = {x: touch.clientX, y: touch.clientY};
		},
		[hasStoredAccounts],
	);

	const handleMobileSwipeEnd = useCallback(
		(event: TouchEvent<HTMLDivElement>) => {
			const swipeStart = mobileSwipeStartRef.current;
			mobileSwipeStartRef.current = null;

			if (!hasStoredAccounts || !swipeStart) {
				return;
			}

			const touch = event.changedTouches[0];
			if (!touch) return;

			const deltaX = touch.clientX - swipeStart.x;
			const deltaY = touch.clientY - swipeStart.y;
			if (Math.abs(deltaX) < 72 || Math.abs(deltaY) > 42) {
				return;
			}

			if (deltaX < 0) {
				handleShowManualLogin();
				return;
			}

			handleShowSavedProfiles();
		},
		[handleShowManualLogin, handleShowSavedProfiles, hasStoredAccounts],
	);

	const biometricQuickCard = showBiometricLogin ? (
		<div className={`${styles.nativeAccessCard} ${styles.nativeAccessCardAccent}`.trim()}>
			<div className={styles.nativeAccessHeader}>
				<div className={styles.nativeAccessTitle}>
					<Trans>Unlock with fingerprint or face</Trans>
				</div>
				<div className={styles.nativeAccessDescription}>
					{biometricStore.email ? (
						<Trans>Use biometrics to reopen the saved Astral session for {biometricStore.email} on this phone.</Trans>
					) : (
						<Trans>Use biometrics to reopen the saved Astral session on this phone without typing your password.</Trans>
					)}
				</div>
			</div>
			<div className={styles.nativeAccessStatusRow}>
				<span className={`${styles.nativeAccessChip} ${styles.nativeAccessChipReady}`.trim()}>
					<Trans>Biometric quick sign-in ready</Trans>
				</span>
				{biometricStore.email ? <span className={styles.nativeAccessChip}>{biometricStore.email}</span> : null}
			</div>
			<div className={styles.nativeAccessActions}>
				<Button
					type="button"
					fitContainer
					variant="secondary"
					onClick={handleBiometricLogin}
					submitting={isBiometricLoading}
				>
					<Trans>Continue with fingerprint or face</Trans>
				</Button>
			</div>
		</div>
	) : null;

	const permissionReminderCard = hasPermissionReminder ? (
		<div className={styles.nativeAccessCard}>
			<div className={styles.nativeAccessHeader}>
				<div className={styles.nativeAccessTitle}>
					<Trans>Finish Android setup</Trans>
				</div>
				<div className={styles.nativeAccessDescription}>
					{!androidNotificationSettingsStore.systemNotificationsEnabled ? (
						<Trans>Notifications are still blocked, so calls and system alerts may feel unreliable until Android lets Astral post them.</Trans>
					) : (
						<Trans>Grant the remaining permissions now so calls, voice routing, video, and notification flows work without extra interruptions later.</Trans>
					)}
				</div>
			</div>
			<div className={styles.nativeAccessStatusRow}>
				{missingAndroidPermissions.map((permission) => (
					<span key={permission} className={styles.nativeAccessChip}>
						{permission === 'notifications' ? (
							<Trans>Notifications</Trans>
						) : permission === 'microphone' ? (
							<Trans>Microphone</Trans>
						) : permission === 'camera' ? (
							<Trans>Camera</Trans>
						) : (
							<Trans>Bluetooth audio</Trans>
						)}
					</span>
				))}
				{androidCallShortcutsReady && (
					<span className={`${styles.nativeAccessChip} ${styles.nativeAccessChipReady}`.trim()}>
						<Trans>Call shade actions ready</Trans>
					</span>
				)}
			</div>
			<div className={styles.nativeAccessActions}>
				<Button
					type="button"
					fitContainer
					variant="secondary"
					onClick={handleResolveAndroidPermissions}
					submitting={isAndroidPermissionsLoading}
				>
					{hasRequestablePermissions ? <Trans>Allow essentials</Trans> : <Trans>Open Android app settings</Trans>}
				</Button>
				{(hasBlockedPermissions || !androidNotificationSettingsStore.systemNotificationsEnabled) && (
					<Button type="button" fitContainer variant="secondary" onClick={handleOpenAndroidNotificationSettings}>
						<Trans>Open notification settings</Trans>
					</Button>
				)}
			</div>
		</div>
	) : null;

	const renderLoginBody = ({
		includeBiometricCard = true,
		includePermissionCard = true,
		extraContent,
	}: {
		includeBiometricCard?: boolean;
		includePermissionCard?: boolean;
		extraContent?: ReactNode;
	} = {}) => (
		<>
			{!showAccountSelector && switchError ? <div className={styles.loginNotice}>{switchError}</div> : null}

			{((includeBiometricCard && biometricQuickCard) || (includePermissionCard && permissionReminderCard)) && (
				<div className={styles.nativeAccessStack} data-auth-swipe-ignore="true">
					{includeBiometricCard ? biometricQuickCard : null}
					{includePermissionCard ? permissionReminderCard : null}
				</div>
			)}

			<AuthLoginEmailPasswordForm
				form={form}
				isLoading={isLoading}
				fieldErrors={fieldErrors}
				submitLabel={
					<span className={styles.loginLaunchLabel}>
						<span className={styles.loginLaunchIconFrame}>
							<RocketLaunchIcon className={styles.loginLaunchIcon} weight="fill" />
						</span>
						<span className={styles.loginLaunchText}>
							<Trans>Log in</Trans>
						</span>
					</span>
				}
				submitButtonClassName={styles.loginLaunchButton}
				classes={{form: styles.form}}
				linksWrapperClassName={styles.formLinks}
				links={
					<AuthRouterLink to="/forgot" className={styles.link}>
						<Trans>Forgot your password?</Trans>
					</AuthRouterLink>
				}
				disableSubmit={isPasskeyLoading}
			/>

			<AuthLoginDivider
				classes={{
					divider: styles.divider,
					dividerLine: styles.dividerLine,
					dividerText: styles.dividerText,
				}}
			/>

			<AuthLoginPasskeyActions
				classes={{
					wrapper: styles.passkeyActions,
				}}
				disabled={passkeyControlsDisabled}
				onPasskeyLogin={handlePasskeyLogin}
				showBrowserOption={showBrowserPasskey}
				onBrowserLogin={handlePasskeyBrowserLogin}
				browserLabel={
					supportsCustomInstanceForBrowserLogin ? (
						<Trans>Log in via browser or custom instance</Trans>
					) : (
						<Trans>Log in via browser</Trans>
					)
				}
			/>

			<div className={styles.footer}>
				<div className={styles.footerText}>
					<span className={styles.footerLabel}>
						<Trans>Need an account?</Trans>{' '}
					</span>
					{styledRegisterLink}
				</div>
			</div>

			{extraContent}
		</>
	);

	if (desktopHandoff && handoff.mode === 'selecting') {
		const selector = (
			<DesktopHandoffAccountSelector
				excludeCurrentUser={excludeCurrentUser}
				onSelectNewAccount={handoff.switchToLogin}
			/>
		);
		if (nativeMobile) {
			return renderMobileShell(selector, {
				eyebrow: <Trans>Desktop handoff</Trans>,
				title: <Trans>Pick the account to continue</Trans>,
				description: <Trans>Continue the pairing flow inside the Android shell without the old desktop-style framing.</Trans>,
			});
		}
		return selector;
	}

	if (nativeMobile && hasStoredAccounts && !desktopHandoff && !ipAuthChallenge) {
		const accountSelector = (
			<AccountSelector
				accounts={accounts}
				currentAccountId={currentUserId}
				error={switchError}
				disabled={isSwitching}
				showInstance
				clickableRows
				onSelectAccount={handleSelectExistingAccount}
				onAddAccount={handleAddAnotherAccount}
			/>
		);

		const activeHeader =
			mobilePanel === 'accounts'
				? {
						eyebrow: <Trans>Quick return</Trans>,
						title: <Trans>Pick a saved profile</Trans>,
						description: (
							<Trans>Swipe or tap to switch between saved accounts and the full sign-in form inside the Android shell.</Trans>
						),
					}
				: androidSetupStep === 'permissions'
					? {
							eyebrow: <Trans>Android access</Trans>,
							title: <Trans>Allow calls and notifications</Trans>,
							description: (
								<Trans>Handle permissions before chats and voice need them, so the Android shell stays fast instead of interrupting you later.</Trans>
							),
						}
					: androidSetupStep === 'ready'
						? {
								eyebrow: <Trans>Final check</Trans>,
								title: <Trans>Finish your mobile setup</Trans>,
								description: (
									<Trans>Check that sign-in, permissions and call alerts are ready before Astral opens the main app surface.</Trans>
								),
							}
						: {
								eyebrow: <Trans>Native Android sign-in</Trans>,
								title: title ?? <Trans>Log in to Astral</Trans>,
								description: showBiometricLogin ? (
									<Trans>Use email, password or biometrics without leaving the app.</Trans>
								) : (
									<Trans>Use email and password inside the Android app with a calmer, touch-first layout.</Trans>
								),
							};

		const setupSteps: ReadonlyArray<{
			key: AndroidSetupStep;
			title: ReactNode;
			description: ReactNode;
		}> = [
			{
				key: 'account',
				title: <Trans>Account</Trans>,
				description: <Trans>Email, password or biometrics</Trans>,
			},
			{
				key: 'permissions',
				title: <Trans>Access</Trans>,
				description: <Trans>Camera, mic, notifications</Trans>,
			},
			{
				key: 'ready',
				title: <Trans>Ready</Trans>,
				description: <Trans>Calls, alerts and launch state</Trans>,
			},
		];
		const activeStepIndex = setupSteps.findIndex((step) => step.key === androidSetupStep);

		const renderSetupStepper = () => (
			<div className={styles.setupStepRail} data-auth-swipe-ignore="true">
				{setupSteps.map((step, index) => {
					const isActive = step.key === androidSetupStep;
					const isComplete = index < activeStepIndex;
					return (
						<button
							key={step.key}
							type="button"
							className={clsx(
								styles.setupStepButton,
								isActive && styles.setupStepButtonActive,
								isComplete && styles.setupStepButtonComplete,
							)}
							onClick={() => handleOpenAndroidSetupStep(step.key)}
						>
							<span className={styles.setupStepIndex}>{index + 1}</span>
							<span className={styles.setupStepText}>
								<span>{step.title}</span>
								<span className={styles.setupStepCaption}>{step.description}</span>
							</span>
						</button>
					);
				})}
			</div>
		);

		const renderPermissionsSetup = () => (
			<>
				<div className={styles.setupLead}>
					<Trans>Set the Android permissions once here instead of being interrupted the first time you answer a call or open camera.</Trans>
				</div>
				<div className={styles.nativeAccessStack} data-auth-swipe-ignore="true">
					{permissionReminderCard ?? (
						<div className={`${styles.nativeAccessCard} ${styles.nativeAccessCardAccent}`.trim()}>
							<div className={styles.nativeAccessHeader}>
								<div className={styles.nativeAccessTitle}>
									<Trans>Android permissions are already in place</Trans>
								</div>
								<div className={styles.nativeAccessDescription}>
									<Trans>Microphone, camera, notifications and Bluetooth audio are already allowed on this device.</Trans>
								</div>
							</div>
							<div className={styles.nativeAccessStatusRow}>
								<span className={`${styles.nativeAccessChip} ${styles.nativeAccessChipReady}`.trim()}>
									<Trans>{grantedAndroidPermissionsCount} / 4 essentials ready</Trans>
								</span>
							</div>
						</div>
					)}

					<div className={styles.nativeAccessCard}>
						<div className={styles.nativeAccessHeader}>
							<div className={styles.nativeAccessTitle}>
								<Trans>Incoming call behavior</Trans>
							</div>
							<div className={styles.nativeAccessDescription}>
								{androidCallShortcutsReady ? (
									<Trans>Android can already show answer and decline controls from the notification shade.</Trans>
								) : (
									<Trans>Finish notification access so incoming calls can break through faster from the Android shade and lockscreen.</Trans>
								)}
							</div>
						</div>
						<div className={styles.nativeAccessStatusRow}>
							<span className={clsx(styles.nativeAccessChip, androidCallShortcutsReady && styles.nativeAccessChipReady)}>
								{androidCallShortcutsReady ? <Trans>Quick actions ready</Trans> : <Trans>Shade actions need setup</Trans>}
							</span>
							<span
								className={clsx(
									styles.nativeAccessChip,
									androidNotificationSettingsStore.settings.callFullscreen && styles.nativeAccessChipReady,
								)}
							>
								{androidNotificationSettingsStore.settings.callFullscreen ? (
									<Trans>Full-screen calls on</Trans>
								) : (
									<Trans>Full-screen calls off</Trans>
								)}
							</span>
						</div>
						<div className={styles.nativeAccessActions}>
							<Button type="button" fitContainer variant="secondary" onClick={handleOpenAndroidNotificationSettings}>
								<Trans>Review Android alerts</Trans>
							</Button>
						</div>
					</div>
				</div>

				<div className={styles.setupActionRow}>
					<Button type="button" fitContainer variant="secondary" onClick={() => handleOpenAndroidSetupStep('account')}>
						<Trans>Back to sign-in</Trans>
					</Button>
					<Button type="button" fitContainer variant="secondary" onClick={() => handleOpenAndroidSetupStep('ready')}>
						<Trans>Continue</Trans>
					</Button>
				</div>
			</>
		);

		const renderReadySetup = () => (
			<>
				<div className={styles.setupLead}>
					<Trans>This final screen keeps the Android launch flow predictable: sign in, allow access, then let the app load without extra permission popups.</Trans>
				</div>
				<div className={styles.nativeAccessStack} data-auth-swipe-ignore="true">
					<div className={`${styles.nativeAccessCard} ${styles.nativeAccessCardAccent}`.trim()}>
						<div className={styles.nativeAccessHeader}>
							<div className={styles.nativeAccessTitle}>
								<Trans>Astral launch status</Trans>
							</div>
							<div className={styles.nativeAccessDescription}>
								<Trans>Use this as a quick checklist before entering chats, calls, uploads and system notifications.</Trans>
							</div>
						</div>
						<div className={styles.setupSummaryGrid}>
							<div className={styles.setupSummaryMetric}>
								<div className={styles.setupSummaryValue}>{grantedAndroidPermissionsCount}/4</div>
								<div className={styles.setupStepCaption}>
									<Trans>Android essentials granted</Trans>
								</div>
							</div>
							<div className={styles.setupSummaryMetric}>
								<div className={styles.setupSummaryValue}>{showBiometricLogin ? <Trans>Fast</Trans> : <Trans>Manual</Trans>}</div>
								<div className={styles.setupStepCaption}>
									<Trans>Sign-in mode</Trans>
								</div>
							</div>
							<div className={styles.setupSummaryMetric}>
								<div className={styles.setupSummaryValue}>
									{androidNotificationSettingsStore.systemNotificationsEnabled ? <Trans>Live</Trans> : <Trans>Muted</Trans>}
								</div>
								<div className={styles.setupStepCaption}>
									<Trans>System alerts</Trans>
								</div>
							</div>
						</div>
					</div>

					<div className={styles.nativeAccessCard}>
						<div className={styles.nativeAccessHeader}>
							<div className={styles.nativeAccessTitle}>
								<Trans>Before Astral opens</Trans>
							</div>
						</div>
						<div className={styles.setupChecklist}>
							<div className={styles.setupChecklistItem}>
								<Trans>Sign in with email and password, or use biometrics if this phone already has a saved Astral session.</Trans>
							</div>
							<div className={styles.setupChecklistItem}>
								<Trans>Keep Android notifications enabled so incoming calls can ring, expand and show quick actions.</Trans>
							</div>
							<div className={styles.setupChecklistItem}>
								<Trans>Grant microphone, camera and Bluetooth access once, then the splash and main app load can stay uninterrupted.</Trans>
							</div>
						</div>
					</div>
				</div>

				<div className={styles.setupActionRow}>
					<Button type="button" fitContainer variant="secondary" onClick={() => handleOpenAndroidSetupStep('permissions')}>
						<Trans>Review permissions</Trans>
					</Button>
					<Button type="button" fitContainer variant="secondary" onClick={() => handleOpenAndroidSetupStep('account')}>
						{showBiometricLogin ? <Trans>Unlock now</Trans> : <Trans>Open sign-in</Trans>}
					</Button>
				</div>
			</>
		);

		return renderMobileShell(
			<>
				<div className={styles.mobileModeSwitch} data-auth-swipe-ignore="true">
					<button
						type="button"
						className={clsx(styles.mobileModeButton, mobilePanel === 'accounts' && styles.mobileModeButtonActive)}
						onClick={handleShowSavedProfiles}
					>
						<Trans>Saved</Trans>
					</button>
					<button
						type="button"
						className={clsx(styles.mobileModeButton, mobilePanel === 'login' && styles.mobileModeButtonActive)}
						onClick={handleShowManualLogin}
					>
						<Trans>Manual</Trans>
					</button>
				</div>
				<div className={styles.mobileModeStage} onTouchStart={handleMobileSwipeStart} onTouchEnd={handleMobileSwipeEnd}>
					<div className={styles.mobileModeHint}>
						<Trans>Swipe left or right to switch panels.</Trans>
					</div>
					{mobilePanel === 'login' ? renderSetupStepper() : null}
					<AnimatePresence initial={false} mode="wait">
						<motion.div
							key={mobilePanel}
							className={styles.mobileModePanel}
							initial={reducedMotion ? false : {opacity: 0, x: mobilePanel === 'accounts' ? -18 : 18}}
							animate={reducedMotion ? {opacity: 1} : {opacity: 1, x: 0}}
							exit={reducedMotion ? {opacity: 0} : {opacity: 0, x: mobilePanel === 'accounts' ? 18 : -18}}
							transition={reducedMotion ? {duration: 0.14} : {duration: 0.22, ease: [0.22, 1, 0.36, 1]}}
						>
							{mobilePanel === 'accounts'
								? accountSelector
								: androidSetupStep === 'permissions'
									? renderPermissionsSetup()
									: androidSetupStep === 'ready'
										? renderReadySetup()
										: renderLoginBody({
												includeBiometricCard: true,
												includePermissionCard: false,
												extraContent: (
													<div className={styles.setupActionRow}>
														<Button
															type="button"
															fitContainer
															variant="secondary"
															onClick={() => handleOpenAndroidSetupStep('permissions')}
														>
															<Trans>Continue Android setup</Trans>
														</Button>
													</div>
												),
											})}
						</motion.div>
					</AnimatePresence>
				</div>
			</>,
			activeHeader,
		);
	}

	if (showAccountSelector && hasStoredAccounts && !desktopHandoff) {
		const selector = (
			<AccountSelector
				accounts={accounts}
				currentAccountId={currentUserId}
				error={switchError}
				disabled={isSwitching}
				showInstance
				clickableRows
				onSelectAccount={handleSelectExistingAccount}
				onAddAccount={handleAddAnotherAccount}
			/>
		);
		if (nativeMobile) {
			return renderMobileShell(selector, {
				eyebrow: <Trans>Quick return</Trans>,
				title: <Trans>Pick a saved profile</Trans>,
				description: <Trans>Jump back into chats, calls and notifications with the account already on this Android device.</Trans>,
			});
		}
		return selector;
	}

	if (desktopHandoff && (handoff.mode === 'generating' || handoff.mode === 'displaying' || handoff.mode === 'error')) {
		const handoffDisplay = (
			<HandoffCodeDisplay
				code={handoff.code}
				isGenerating={handoff.mode === 'generating'}
				error={handoff.mode === 'error' ? handoff.error : null}
				onRetry={handoff.retry}
			/>
		);
		if (nativeMobile) {
			return renderMobileShell(handoffDisplay, {
				eyebrow: <Trans>Secure pairing</Trans>,
				title: <Trans>Continue the handoff</Trans>,
				description: <Trans>Keep the code flow inside the mobile shell while Astral links the session.</Trans>,
			});
		}
		return handoffDisplay;
	}

	if (ipAuthChallenge) {
		const ipAuthorization = (
			<IpAuthorizationScreen
				challenge={ipAuthChallenge}
				onAuthorized={handleIpAuthorizationComplete}
				onBack={() => setIpAuthChallenge(null)}
			/>
		);
		if (nativeMobile) {
			return renderMobileShell(ipAuthorization, {
				eyebrow: <Trans>Sign-in check</Trans>,
				title: <Trans>Confirm this device</Trans>,
				description: <Trans>We need one quick confirmation before opening your messages and voice state on Android.</Trans>,
			});
		}
		return ipAuthorization;
	}

	if (bare) {
		return renderLoginBody();
	}

	if (nativeMobile) {
		return renderMobileShell(renderLoginBody(), {
			eyebrow: <Trans>Native Android sign-in</Trans>,
			title: title ?? <Trans>Log in to Astral</Trans>,
			description: showBiometricLogin ? (
				<Trans>Use email, password or biometrics without leaving the app.</Trans>
			) : (
				<Trans>Use email and password inside the Android app with a calmer, touch-first layout.</Trans>
			),
		});
	}

	return (
		<>
			{extraTopContent}

			{showTitle ? <h1 className={styles.title}>{title ?? <Trans>Welcome back</Trans>}</h1> : null}
			{renderLoginBody()}
		</>
	);
});

export {AuthLoginLayout};
