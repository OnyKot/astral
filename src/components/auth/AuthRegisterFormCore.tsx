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
import {AnimatePresence} from 'framer-motion';
import {useId, useMemo, useState} from 'react';
import * as AuthenticationActionCreators from '~/actions/AuthenticationActionCreators';
import {DateOfBirthField} from '~/components/auth/DateOfBirthField';
import FormField from '~/components/auth/FormField';
import {type MissingField, SubmitTooltip, shouldDisableSubmit} from '~/components/auth/SubmitTooltip';
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
import styles from './AuthPageStyles.module.css';

interface FieldConfig {
	showEmail?: boolean;
	showPassword?: boolean;
	showUsernameValidation?: boolean;
	showBetaCodeHint?: boolean;
	requireBetaCode?: boolean;
	showPhoneVerification?: boolean;
}

interface AuthRegisterFormCoreProps {
	fields?: FieldConfig;
	submitLabel: React.ReactNode;
	redirectPath: string;
	onRegister?: (response: {token: string; user_id: string}) => Promise<void>;
	onPendingVerification?: (context: {email?: string}) => Promise<void> | void;
	inviteCode?: string;
	extraContent?: React.ReactNode;
}

export function AuthRegisterFormCore({
	fields = {},
	submitLabel,
	redirectPath,
	onRegister,
	onPendingVerification,
	inviteCode,
	extraContent,
}: AuthRegisterFormCoreProps) {
	const {t} = useLingui();
	const {
		showEmail = false,
		showPassword = false,
		showUsernameValidation = false,
		requireBetaCode = MODE !== 'development',
		showPhoneVerification = false,
	} = fields;

	const emailId = useId();
	const globalNameId = useId();
	const usernameId = useId();
	const passwordId = useId();
	const betaCodeId = useId();
	const phoneId = useId();
	const phoneCodeId = useId();

	const [selectedMonth, setSelectedMonth] = useState('');
	const [selectedDay, setSelectedDay] = useState('');
	const [selectedYear, setSelectedYear] = useState('');
	const [consent, setConsent] = useState(false);
	const [usernameFocused, setUsernameFocused] = useState(false);
	const [phone, setPhone] = useState('');
	const [phoneCode, setPhoneCode] = useState('');
	const [phoneToken, setPhoneToken] = useState<string | null>(null);
	const [phoneCodeSent, setPhoneCodeSent] = useState(false);
	const [phoneError, setPhoneError] = useState<string | null>(null);
	const [isSendingPhoneCode, setIsSendingPhoneCode] = useState(false);
	const [isVerifyingPhoneCode, setIsVerifyingPhoneCode] = useState(false);

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
			phone_token: phoneToken ?? undefined,
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

	const missingFields = useMemo(() => {
		const missing: Array<MissingField> = [];
		if (showEmail && !form.getValue('email')) {
			missing.push({key: 'email', label: t`Email`});
		}
		if (showPassword && !form.getValue('password')) {
			missing.push({key: 'password', label: t`Password`});
		}
		if (!selectedMonth || !selectedDay || !selectedYear) {
			missing.push({key: 'date_of_birth', label: t`Date of birth`});
		}
		if (requireBetaCode && !form.getValue('betaCode')) {
			missing.push({key: 'betaCode', label: t`Beta code`});
		}
		if (showPhoneVerification && !phoneToken) {
			missing.push({key: 'phone', label: t`Phone verification`});
		}
		return missing;
	}, [form, phoneToken, requireBetaCode, selectedDay, selectedMonth, selectedYear, showEmail, showPassword, showPhoneVerification, t]);

	const usernameValue = form.getValue('username');
	const showValidationRules = showUsernameValidation && usernameValue && (usernameFocused || usernameValue.length > 0);

	const handlePhoneChange = (value: string) => {
		setPhone(value);
		setPhoneToken(null);
		setPhoneCodeSent(false);
		setPhoneError(null);
	};

	const handleSendPhoneCode = async () => {
		if (!phone) {
			setPhoneError(t`Enter your phone number in international format`);
			return;
		}

		setIsSendingPhoneCode(true);
		setPhoneError(null);
		try {
			await AuthenticationActionCreators.sendRegistrationPhoneVerification(phone);
			setPhoneCodeSent(true);
		} catch (error: any) {
			setPhoneError(error?.body?.message || t`Failed to send verification code`);
		} finally {
			setIsSendingPhoneCode(false);
		}
	};

	const handleVerifyPhoneCode = async () => {
		if (!phoneCode) {
			setPhoneError(t`Enter the SMS code`);
			return;
		}

		setIsVerifyingPhoneCode(true);
		setPhoneError(null);
		try {
			const response = await AuthenticationActionCreators.verifyRegistrationPhone(phone, phoneCode.split(' ').join(''));
			setPhoneToken(response.phone_token);
		} catch (error: any) {
			setPhoneToken(null);
			setPhoneError(error?.body?.message || t`Failed to verify code`);
		} finally {
			setIsVerifyingPhoneCode(false);
		}
	};

	return (
		<form className={styles.form} onSubmit={form.handleSubmit}>
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

			<div>
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
				<span className={styles.usernameHint}>
					<Trans>A numeric tag will be added automatically to ensure uniqueness</Trans>
				</span>
			</div>

			{showUsernameValidation && (
				<AnimatePresence>
					{showValidationRules && (
						<div className={styles.usernameValidation}>
							<UsernameValidationRules username={usernameValue} />
						</div>
					)}
				</AnimatePresence>
			)}

			{!usernameValue && (
				<UsernameSuggestions suggestions={suggestions} onSelect={(username) => form.setValue('username', username)} />
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

			{showPhoneVerification && (
				<div className={styles.phoneVerificationSection}>
					<FormField
						id={phoneId}
						name="phone"
						type="tel"
						autoComplete="tel"
						required
						label={t`Phone number`}
						placeholder={t`+15551234567`}
						value={phone}
						onChange={handlePhoneChange}
						error={phoneError ?? undefined}
					/>

					<div className={styles.phoneVerificationActions}>
						<Button
							type="button"
							variant="secondary"
							onClick={handleSendPhoneCode}
							submitting={isSendingPhoneCode}
							disabled={!phone || !!phoneToken}
						>
							{phoneCodeSent ? <Trans>Resend code</Trans> : <Trans>Send code</Trans>}
						</Button>
						{phoneToken && <span className={styles.phoneVerificationBadge}><Trans>Phone verified</Trans></span>}
					</div>

					{phoneCodeSent && !phoneToken && (
						<div className={styles.phoneVerificationCodeRow}>
							<FormField
								id={phoneCodeId}
								name="phone_code"
								type="text"
								autoComplete="one-time-code"
								required
								label={t`SMS code`}
								placeholder={t`6-digit code`}
								value={phoneCode}
								onChange={setPhoneCode}
							/>
							<Button type="button" onClick={handleVerifyPhoneCode} submitting={isVerifyingPhoneCode}>
								<Trans>Verify phone</Trans>
							</Button>
						</div>
					)}

					<p className={styles.betaCodeHint}>
						<Trans>Use your full phone number in international format. We will send a one-time code by SMS.</Trans>
					</p>
				</div>
			)}

			{requireBetaCode ? (
				<FormField
					id={betaCodeId}
					name="betaCode"
					type="text"
					required
					label={t`Beta code`}
					value={form.getValue('betaCode')}
					onChange={(value) => form.setValue('betaCode', value)}
					error={form.getError('betaCode') || fieldErrors?.beta_code}
				/>
			) : (
				<FormField
					id={betaCodeId}
					name="betaCode"
					type="text"
					label={t`Beta code (optional)`}
					value={form.getValue('betaCode')}
					onChange={(value) => form.setValue('betaCode', value)}
					error={form.getError('betaCode') || fieldErrors?.beta_code}
				/>
			)}

			<DateOfBirthField
				selectedMonth={selectedMonth}
				selectedDay={selectedDay}
				selectedYear={selectedYear}
				onMonthChange={setSelectedMonth}
				onDayChange={setSelectedDay}
				onYearChange={setSelectedYear}
				error={fieldErrors?.date_of_birth}
			/>

			{extraContent}

			<div className={styles.consentRow}>
				<Checkbox checked={consent} onChange={setConsent}>
					<span className={styles.consentLabel}>
						<Trans>I agree to the</Trans>{' '}
						<ExternalLink href={Routes.terms()} className={styles.policyLink}>
							<Trans>Terms of Service</Trans>
						</ExternalLink>{' '}
						<Trans>and</Trans>{' '}
						<ExternalLink href={Routes.privacy()} className={styles.policyLink}>
							<Trans>Privacy Policy</Trans>
						</ExternalLink>
					</span>
				</Checkbox>
			</div>

			<SubmitTooltip consent={consent} missingFields={missingFields}>
				<Button
					type="submit"
					fitContainer
					disabled={isLoading || form.isSubmitting || shouldDisableSubmit(consent, missingFields)}
				>
					{submitLabel}
				</Button>
			</SubmitTooltip>

			{error ? <p className={styles.errorText}>{error}</p> : null}
		</form>
	);
}
