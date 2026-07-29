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
import {AnimatePresence, motion, useReducedMotion} from 'framer-motion';
import {ArrowLeftIcon, ArrowRightIcon, CheckIcon} from '@phosphor-icons/react';
import {useEffect, useId, useMemo, useState} from 'react';
import * as AuthenticationActionCreators from '~/actions/AuthenticationActionCreators';
import {DateOfBirthField} from '~/components/auth/DateOfBirthField';
import FormField from '~/components/auth/FormField';
import {UsernameSuggestions} from '~/components/auth/UsernameSuggestions';
import {ExternalLink} from '~/components/common/ExternalLink';
import {UsernameValidationRules} from '~/components/form/UsernameValidationRules';
import {Button} from '~/components/uikit/Button/Button';
import {Checkbox} from '~/components/uikit/Checkbox/Checkbox';
import {useAuthForm} from '~/hooks/useAuthForm';
import {useUsernameSuggestions} from '~/hooks/useUsernameSuggestions';
import {MODE} from '~/lib/env';
import {Routes} from '~/Routes';
import * as RouterUtils from '~/utils/RouterUtils';
import sharedStyles from './AuthPageStyles.module.css';
import styles from './AuthRegisterWizardCore.module.css';

/**
 * Chunked registration — same fields as AuthRegisterFormCore, but split across
 * four screens. Haus-pattern: breaking a long form into focused screens
 * reportedly lifts completion by ~15%. Single submit still fires on the
 * last step.
 *
 * Step map:
 *   1. credentials — email + password
 *   2. identity   — display name + username (with suggestions)
 *   3. details    — date of birth + beta code (if required)
 *   4. consent    — T&C checkbox + create-account button
 */

interface FieldConfig {
	showEmail?: boolean;
	showPassword?: boolean;
	showUsernameValidation?: boolean;
	showBetaCodeHint?: boolean;
	requireBetaCode?: boolean;
}

interface AuthRegisterWizardCoreProps {
	fields?: FieldConfig;
	submitLabel: React.ReactNode;
	redirectPath: string;
	onRegister?: (response: {token: string; user_id: string}) => Promise<void>;
	onPendingVerification?: (context: {email?: string}) => Promise<void> | void;
	inviteCode?: string;
}

type StepKey = 'credentials' | 'identity' | 'details' | 'consent';

const SPRING_IN = {type: 'spring' as const, stiffness: 430, damping: 36, mass: 0.74};
const MIN_PASSWORD_LENGTH = 8;
const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
const USERNAME_REGEX = /^[a-zA-Z0-9_]+$/;

function isValidOptionalUsername(username: string): boolean {
	const trimmed = username.trim();
	if (!trimmed) return true;
	const lowerValue = trimmed.toLowerCase();
	return (
		trimmed.length >= 1 &&
		trimmed.length <= 32 &&
		USERNAME_REGEX.test(trimmed) &&
		lowerValue !== 'everyone' &&
		lowerValue !== 'here' &&
		!lowerValue.includes('astral') &&
		!lowerValue.includes('system message')
	);
}

function isValidOptionalGlobalName(globalName: string): boolean {
	const trimmed = globalName.trim();
	if (!trimmed) return true;
	const lowerValue = trimmed.toLowerCase();
	return trimmed.length >= 1 && trimmed.length <= 32 && lowerValue !== 'everyone' && lowerValue !== 'here' && !lowerValue.includes('system message');
}

export function AuthRegisterWizardCore({
	fields = {},
	submitLabel,
	redirectPath,
	onRegister,
	onPendingVerification,
	inviteCode,
}: AuthRegisterWizardCoreProps) {
	const {t} = useLingui();
	const reducedMotion = useReducedMotion() ?? false;
	const {
		showEmail = false,
		showPassword = false,
		showUsernameValidation = false,
		requireBetaCode = MODE !== 'development',
	} = fields;

	const emailId = useId();
	const globalNameId = useId();
	const usernameId = useId();
	const passwordId = useId();
	const betaCodeId = useId();

	const [stepIdx, setStepIdx] = useState(0);
	const [selectedMonth, setSelectedMonth] = useState('');
	const [selectedDay, setSelectedDay] = useState('');
	const [selectedYear, setSelectedYear] = useState('');
	const [consent, setConsent] = useState(false);
	const [usernameFocused, setUsernameFocused] = useState(false);

	// If the deployment doesn't collect email+password (minimal variant),
	// skip the credentials step entirely.
	const steps: Array<StepKey> = useMemo(() => {
		const s: Array<StepKey> = [];
		if (showEmail || showPassword) s.push('credentials');
		s.push('identity');
		s.push('details');
		s.push('consent');
		return s;
	}, [showEmail, showPassword]);

	const currentStep = steps[stepIdx];
	const totalSteps = steps.length;
	const isLastStep = stepIdx === totalSteps - 1;

	const initialValues: Record<string, string> = {
		global_name: '',
		username: '',
		betaCode: '',
	};
	if (showEmail) initialValues.email = '';
	if (showPassword) initialValues.password = '';

	const handleRegisterSubmit = async (values: Record<string, string>) => {
		const dateOfBirth =
			selectedYear && selectedMonth && selectedDay
				? `${selectedYear}-${selectedMonth.padStart(2, '0')}-${selectedDay.padStart(2, '0')}`
				: '';

		const response = await AuthenticationActionCreators.register({
			global_name: values.global_name || undefined,
			username: values.username || undefined,
			email: showEmail ? values.email : undefined,
			password: showPassword ? values.password : undefined,
			beta_code: values.betaCode || '',
			date_of_birth: dateOfBirth,
			consent,
			invite_code: inviteCode,
		});

		if (response.pending_verification) {
			await onPendingVerification?.({email: showEmail ? values.email : undefined});
			return;
		}

		if (!response.token || !response.user_id) {
			throw new Error(t`An unexpected error occurred`);
		}

		if (onRegister) {
			await onRegister({token: response.token, user_id: response.user_id});
		} else {
			await AuthenticationActionCreators.completeLogin({
				token: response.token,
				userId: response.user_id,
			});
		}

		if (redirectPath) {
			RouterUtils.replaceWith(redirectPath);
		}
	};

	const {form, isLoading, fieldErrors, error} = useAuthForm({
		initialValues,
		onSubmit: handleRegisterSubmit,
		redirectPath: undefined,
	});

	const {suggestions} = useUsernameSuggestions({
		globalName: form.getValue('global_name'),
		username: form.getValue('username'),
	});

	const globalNameValue = form.getValue('global_name');
	const usernameValue = form.getValue('username');
	const showValidationRules = showUsernameValidation && usernameValue && (usernameFocused || usernameValue.length > 0);
	const emailValue = form.getValue('email');
	const passwordValue = form.getValue('password');
	const isEmailValid = !showEmail || EMAIL_REGEX.test(emailValue);
	const isPasswordValid = !showPassword || passwordValue.length >= MIN_PASSWORD_LENGTH;
	const isUsernameValid = isValidOptionalUsername(usernameValue);
	const isGlobalNameValid = isValidOptionalGlobalName(globalNameValue);
	const credentialErrorMessage =
		currentStep !== 'credentials'
			? null
			: showEmail && emailValue && !isEmailValid
				? t`Enter a valid email address`
				: showPassword && passwordValue && !isPasswordValid
					? t`Password must be at least 8 characters`
					: null;
	const identityErrorMessage =
		currentStep !== 'identity'
			? null
			: globalNameValue && !isGlobalNameValid
				? t`Display name must be between 1 and 32 characters and cannot use reserved wording`
				: usernameValue && !isUsernameValid
					? t`Username must be 1-32 characters and use only letters, numbers, or underscores`
					: null;

	// Per-step "can advance" gates. Only the current step must be valid;
	// a user can always go back to fix earlier steps.
	const canAdvance = useMemo(() => {
		switch (currentStep) {
			case 'credentials': {
				const emailOk = !showEmail || (Boolean(emailValue) && isEmailValid);
				const passOk = !showPassword || (Boolean(passwordValue) && isPasswordValid);
				return emailOk && passOk;
			}
			case 'identity':
				return isGlobalNameValid && isUsernameValid;
			case 'details': {
				const dobOk = Boolean(selectedMonth && selectedDay && selectedYear);
				const betaOk = !requireBetaCode || Boolean(form.getValue('betaCode'));
				return dobOk && betaOk;
			}
			case 'consent':
				return consent;
			default:
				return false;
		}
	}, [
		consent,
		currentStep,
		emailValue,
		form,
		isEmailValid,
		isGlobalNameValid,
		isPasswordValid,
		isUsernameValid,
		passwordValue,
		requireBetaCode,
		selectedDay,
		selectedMonth,
		selectedYear,
		showEmail,
		showPassword,
	]);

	useEffect(() => {
		if (!fieldErrors) {
			return;
		}

		if (fieldErrors.email || fieldErrors.password) {
			setStepIdx(Math.max(steps.indexOf('credentials'), 0));
			return;
		}

		if (fieldErrors.global_name || fieldErrors.username) {
			setStepIdx(Math.max(steps.indexOf('identity'), 0));
			return;
		}

		if (fieldErrors.date_of_birth || fieldErrors.beta_code || fieldErrors.betaCode || fieldErrors.invite_code) {
			setStepIdx(Math.max(steps.indexOf('details'), 0));
			return;
		}

		if (fieldErrors.consent) {
			setStepIdx(Math.max(steps.indexOf('consent'), 0));
		}
	}, [fieldErrors, steps]);

	const goNext = () => {
		if (!canAdvance) return;
		setStepIdx((idx) => Math.min(idx + 1, totalSteps - 1));
	};

	const goBack = () => {
		setStepIdx((idx) => Math.max(idx - 1, 0));
	};

	const stepVariants = reducedMotion
		? {initial: {}, animate: {}, exit: {}}
		: {
				initial: {opacity: 0, x: 14},
				animate: {opacity: 1, x: 0},
				exit: {opacity: 0, x: -14},
			};

	return (
		<form
			className={sharedStyles.form}
			onSubmit={(event) => {
				// Only the final step's Submit triggers the real submission;
				// earlier Next clicks are plain buttons.
				if (!isLastStep) {
					event.preventDefault();
					goNext();
					return;
				}
				form.handleSubmit(event);
			}}
		>
			<ol className={styles.progress} aria-label={t`Registration progress`}>
				{steps.map((step, idx) => (
					<li
						key={step}
						className={
							idx < stepIdx
								? styles.stepDone
								: idx === stepIdx
									? styles.stepCurrent
									: styles.stepUpcoming
						}
						aria-current={idx === stepIdx ? 'step' : undefined}
					>
						<span className={styles.stepDot}>
							{idx < stepIdx ? <CheckIcon weight="bold" /> : idx + 1}
						</span>
					</li>
				))}
			</ol>

			<AnimatePresence mode="wait" initial={false}>
				<motion.div
					key={currentStep}
					variants={stepVariants}
					initial="initial"
					animate="animate"
					exit="exit"
					transition={reducedMotion ? {duration: 0} : SPRING_IN}
					className={styles.step}
				>
					{currentStep === 'credentials' && (
						<>
							<header className={styles.stepHeader}>
								<h2 className={styles.stepTitle}>
									<Trans>Let's get you in</Trans>
								</h2>
								<p className={styles.stepLede}>
									<Trans>We'll use this to sign you in and keep your account safe.</Trans>
								</p>
							</header>
							{showEmail && (
								<FormField
									id={emailId}
									name="email"
									type="email"
									autoComplete="email"
									required
									label={t`Email`}
									value={form.getValue('email')}
									onChange={(value) => form.setValue('email', value)}
									error={form.getError('email') || fieldErrors?.email}
								/>
							)}
							{showPassword && (
								<FormField
									id={passwordId}
									name="password"
									type="password"
									autoComplete="new-password"
									required
									label={t`Password`}
									value={form.getValue('password')}
									onChange={(value) => form.setValue('password', value)}
									error={form.getError('password') || fieldErrors?.password}
								/>
							)}
							{credentialErrorMessage ? <p className={sharedStyles.errorText}>{credentialErrorMessage}</p> : null}
						</>
					)}

					{currentStep === 'identity' && (
						<>
							<header className={styles.stepHeader}>
								<h2 className={styles.stepTitle}>
									<Trans>How should friends find you?</Trans>
								</h2>
								<p className={styles.stepLede}>
									<Trans>Pick a display name for your profile and a short username. Both optional.</Trans>
								</p>
							</header>
							<FormField
								id={globalNameId}
								name="global_name"
								type="text"
								label={t`Display name (optional)`}
								placeholder={t`What should people call you?`}
								value={form.getValue('global_name')}
								onChange={(value) => form.setValue('global_name', value)}
								error={form.getError('global_name') || fieldErrors?.global_name}
							/>
							<FormField
								id={usernameId}
								name="username"
								type="text"
								autoComplete="username"
								label={t`Username (optional)`}
								placeholder={t`Leave blank for a random username`}
								value={usernameValue}
								onChange={(value) => form.setValue('username', value)}
								onFocus={() => setUsernameFocused(true)}
								onBlur={() => setUsernameFocused(false)}
								error={form.getError('username') || fieldErrors?.username}
							/>
							<span className={sharedStyles.usernameHint}>
								<Trans>A numeric tag will be added automatically to ensure uniqueness</Trans>
							</span>
							{showUsernameValidation && (
								<AnimatePresence>
									{showValidationRules && (
										<div className={sharedStyles.usernameValidation}>
											<UsernameValidationRules username={usernameValue} />
										</div>
									)}
								</AnimatePresence>
							)}
							{!usernameValue && (
								<UsernameSuggestions
									suggestions={suggestions}
									onSelect={(username) => form.setValue('username', username)}
								/>
							)}
							{identityErrorMessage ? <p className={sharedStyles.errorText}>{identityErrorMessage}</p> : null}
						</>
					)}

					{currentStep === 'details' && (
						<>
							<header className={styles.stepHeader}>
								<h2 className={styles.stepTitle}>
									<Trans>A few details</Trans>
								</h2>
								<p className={styles.stepLede}>
									<Trans>Date of birth helps us keep the platform compliant and age-appropriate.</Trans>
								</p>
							</header>
							<DateOfBirthField
								selectedMonth={selectedMonth}
								selectedDay={selectedDay}
								selectedYear={selectedYear}
								onMonthChange={setSelectedMonth}
								onDayChange={setSelectedDay}
								onYearChange={setSelectedYear}
								error={fieldErrors?.date_of_birth}
							/>
							<FormField
								id={betaCodeId}
								name="betaCode"
								type="text"
								required={requireBetaCode}
								label={requireBetaCode ? t`Beta code` : t`Beta code (optional)`}
								value={form.getValue('betaCode')}
								onChange={(value) => form.setValue('betaCode', value)}
								error={form.getError('betaCode') || fieldErrors?.beta_code}
							/>
						</>
					)}

					{currentStep === 'consent' && (
						<>
							<header className={styles.stepHeader}>
								<h2 className={styles.stepTitle}>
									<Trans>Almost there</Trans>
								</h2>
								<p className={styles.stepLede}>
									<Trans>Review and accept to create your Astral account.</Trans>
								</p>
							</header>
							<div className={styles.consentCard}>
								<Checkbox checked={consent} onChange={setConsent}>
									<span className={sharedStyles.consentLabel}>
										<Trans>I agree to the</Trans>{' '}
										<ExternalLink href={Routes.terms()} className={sharedStyles.policyLink}>
											<Trans>Terms of Service</Trans>
										</ExternalLink>{' '}
										<Trans>and</Trans>{' '}
										<ExternalLink href={Routes.privacy()} className={sharedStyles.policyLink}>
											<Trans>Privacy Policy</Trans>
										</ExternalLink>
									</span>
								</Checkbox>
							</div>
						</>
					)}
				</motion.div>
			</AnimatePresence>

			{error ? <p className={sharedStyles.errorText}>{error}</p> : null}

			<div className={styles.actions}>
				{stepIdx > 0 ? (
					<Button type="button" variant="secondary" onClick={goBack} leftIcon={<ArrowLeftIcon weight="bold" />}>
						<Trans>Back</Trans>
					</Button>
				) : (
					<span />
				)}
				{isLastStep ? (
					<Button
						type="submit"
						disabled={isLoading || form.isSubmitting || !canAdvance}
						submitting={isLoading || form.isSubmitting}
					>
						{submitLabel}
					</Button>
				) : (
					<Button
						type="button"
						onClick={goNext}
						disabled={!canAdvance}
						rightIcon={<ArrowRightIcon weight="bold" />}
					>
						<Trans>Continue</Trans>
					</Button>
				)}
			</div>
		</form>
	);
}
