package app.astral.feature.auth

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.expandVertically
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.animation.scaleOut
import androidx.compose.animation.shrinkVertically
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Checkbox
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.astral.core.design.components.AstralBackground
import app.astral.core.design.components.AstralPanel
import app.astral.core.design.components.AstralPrimaryButton
import app.astral.core.design.components.AstralSecondaryButton
import app.astral.core.design.components.AstralTextField
import app.astral.core.design.motion.AstralMotion
import app.astral.core.design.theme.AstralDanger
import app.astral.core.design.theme.AstralMuted
import app.astral.core.design.theme.AstralText

@Composable
fun AuthScreen(
    state: AuthUiState,
    onMode: (AuthMode) -> Unit,
    onEmail: (String) -> Unit,
    onPassword: (String) -> Unit,
    onUsername: (String) -> Unit,
    onGlobalName: (String) -> Unit,
    onBetaCode: (String) -> Unit,
    onDateOfBirth: (String) -> Unit,
    onConsent: (Boolean) -> Unit,
    onMfaCode: (String) -> Unit,
    onMfaMethod: (MfaCodeMethod) -> Unit,
    onSendMfaSms: () -> Unit,
    onSubmit: () -> Unit,
) {
    val focusManager = LocalFocusManager.current
    val isRegister = state.mode == AuthMode.Register
    val isMfaStep = state.requiresMfa
    val messageText = state.messageText ?: resolveMessage(state.messageId)
    val isInfoMessage = state.messageText == null && when (state.messageId) {
        AuthMessageId.MfaRequired,
        AuthMessageId.IpAuthorizationRequired,
        AuthMessageId.RegistrationPendingVerification,
        -> true
        else -> false
    }

    AstralBackground {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .imePadding()
                .navigationBarsPadding()
                .padding(24.dp),
            verticalArrangement = Arrangement.Center,
        ) {
            AnimatedContent(
                targetState = Triple(isRegister, isMfaStep, state.mfaCodeMethod),
                transitionSpec = {
                    fadeIn(AstralMotion.fastOut()) + scaleIn(
                        initialScale = 0.99f,
                        animationSpec = AstralMotion.fastOut(),
                    ) togetherWith fadeOut(AstralMotion.softExit()) + scaleOut(
                        targetScale = 0.998f,
                        animationSpec = AstralMotion.softExit(),
                    )
                },
                label = "auth title",
            ) { target ->
                val register = target.first
                val mfa = target.second
                Column {
                    Text(
                        text = if (mfa) {
                            stringResource(R.string.auth_title_mfa)
                        } else if (register) {
                            stringResource(R.string.auth_title_register)
                        } else {
                            stringResource(R.string.auth_title_login)
                        },
                        color = AstralText,
                        fontSize = 34.sp,
                        fontWeight = FontWeight.Black,
                    )
                    Text(
                        text = if (mfa) {
                            stringResource(R.string.auth_subtitle_mfa)
                        } else if (register) {
                            stringResource(R.string.auth_subtitle_register)
                        } else {
                            stringResource(R.string.auth_subtitle_login)
                        },
                        color = AstralMuted,
                        modifier = Modifier.padding(top = 8.dp, bottom = 24.dp),
                    )
                }
            }

            AstralPanel(modifier = Modifier.fillMaxWidth()) {
                Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {
                    if (!isMfaStep) {
                        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                            FilterChip(
                                selected = !isRegister,
                                onClick = { onMode(AuthMode.Login) },
                                label = { Text(stringResource(R.string.auth_tab_login)) },
                            )
                            FilterChip(
                                selected = isRegister,
                                onClick = { onMode(AuthMode.Register) },
                                label = { Text(stringResource(R.string.auth_tab_register)) },
                            )
                        }

                        AstralTextField(
                            value = state.email,
                            onValueChange = onEmail,
                            label = stringResource(R.string.auth_label_email),
                            keyboardOptions = KeyboardOptions(
                                keyboardType = KeyboardType.Email,
                                imeAction = ImeAction.Next,
                            ),
                            modifier = Modifier.fillMaxWidth(),
                        )
                        AstralTextField(
                            value = state.password,
                            onValueChange = onPassword,
                            label = stringResource(R.string.auth_label_password),
                            visualTransformation = PasswordVisualTransformation(),
                            keyboardOptions = KeyboardOptions(
                                keyboardType = KeyboardType.Password,
                                imeAction = if (isRegister) ImeAction.Next else ImeAction.Done,
                            ),
                            keyboardActions = KeyboardActions(onDone = {
                                focusManager.clearFocus()
                                onSubmit()
                            }),
                            modifier = Modifier.fillMaxWidth(),
                        )
                    }

                    AnimatedVisibility(
                        visible = isRegister && !isMfaStep,
                        enter = fadeIn(AstralMotion.fastOut()) +
                            expandVertically(animationSpec = AstralMotion.standardOut()),
                        exit = fadeOut(AstralMotion.softExit()) +
                            shrinkVertically(animationSpec = AstralMotion.softExit()),
                    ) {
                        Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {
                            AstralTextField(
                                value = state.globalName,
                                onValueChange = onGlobalName,
                                label = stringResource(R.string.auth_label_display_name),
                                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Next),
                                modifier = Modifier.fillMaxWidth(),
                            )
                            AstralTextField(
                                value = state.username,
                                onValueChange = onUsername,
                                label = stringResource(R.string.auth_label_username_optional),
                                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Next),
                                modifier = Modifier.fillMaxWidth(),
                            )
                            AstralTextField(
                                value = state.betaCode,
                                onValueChange = onBetaCode,
                                label = stringResource(R.string.auth_label_beta_code),
                                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Next),
                                modifier = Modifier.fillMaxWidth(),
                            )
                            AstralTextField(
                                value = state.dateOfBirth,
                                onValueChange = onDateOfBirth,
                                label = stringResource(R.string.auth_label_birth_date),
                                placeholder = stringResource(R.string.auth_placeholder_birth_date),
                                keyboardOptions = KeyboardOptions(
                                    keyboardType = KeyboardType.Text,
                                    imeAction = ImeAction.Done,
                                ),
                                keyboardActions = KeyboardActions(onDone = {
                                    focusManager.clearFocus()
                                    onSubmit()
                                }),
                                modifier = Modifier.fillMaxWidth(),
                            )
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Checkbox(checked = state.consent, onCheckedChange = onConsent)
                                Text(text = stringResource(R.string.auth_consent), color = AstralMuted)
                            }
                        }
                    }

                    AnimatedVisibility(
                        visible = isMfaStep,
                        enter = fadeIn(AstralMotion.fastOut()) +
                            expandVertically(animationSpec = AstralMotion.standardOut()),
                        exit = fadeOut(AstralMotion.softExit()) +
                            shrinkVertically(animationSpec = AstralMotion.softExit()),
                    ) {
                        Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                                if (state.mfaTotpAvailable) {
                                    FilterChip(
                                        selected = state.mfaCodeMethod == MfaCodeMethod.Totp,
                                        onClick = { onMfaMethod(MfaCodeMethod.Totp) },
                                        label = { Text(stringResource(R.string.auth_mfa_totp)) },
                                    )
                                }
                                if (state.mfaSmsAvailable) {
                                    FilterChip(
                                        selected = state.mfaCodeMethod == MfaCodeMethod.Sms,
                                        onClick = { onMfaMethod(MfaCodeMethod.Sms) },
                                        label = { Text(stringResource(R.string.auth_mfa_sms)) },
                                    )
                                }
                            }

                            AstralTextField(
                                value = state.mfaCode,
                                onValueChange = onMfaCode,
                                label = if (state.mfaCodeMethod == MfaCodeMethod.Sms) {
                                    stringResource(R.string.auth_label_sms_code)
                                } else {
                                    stringResource(R.string.auth_label_totp_code)
                                },
                                keyboardOptions = KeyboardOptions(
                                    keyboardType = KeyboardType.NumberPassword,
                                    imeAction = ImeAction.Done,
                                ),
                                keyboardActions = KeyboardActions(onDone = {
                                    focusManager.clearFocus()
                                    onSubmit()
                                }),
                                modifier = Modifier.fillMaxWidth(),
                            )

                            if (state.mfaSmsAvailable) {
                                AstralSecondaryButton(
                                    text = stringResource(R.string.auth_send_sms_code),
                                    onClick = onSendMfaSms,
                                )
                            }
                        }
                    }

                    AnimatedVisibility(
                        visible = !messageText.isNullOrBlank(),
                        enter = fadeIn(AstralMotion.fastOut()) +
                            expandVertically(animationSpec = AstralMotion.fastOut()),
                        exit = fadeOut(AstralMotion.softExit()) +
                            shrinkVertically(animationSpec = AstralMotion.softExit()),
                    ) {
                        Text(
                            text = messageText.orEmpty(),
                            color = if (isInfoMessage) AstralMuted else AstralDanger,
                            fontSize = 14.sp,
                            lineHeight = 19.sp,
                        )
                    }

                    Spacer(Modifier.height(4.dp))
                    AstralPrimaryButton(
                        text = when {
                            isMfaStep -> stringResource(R.string.auth_action_verify_code)
                            isRegister -> stringResource(R.string.auth_action_create_account)
                            else -> stringResource(R.string.auth_action_login)
                        },
                        onClick = {
                            focusManager.clearFocus()
                            onSubmit()
                        },
                        loading = state.loading,
                    )
                }
            }
        }
    }
}

@Composable
private fun resolveMessage(messageId: AuthMessageId?): String? {
    return when (messageId) {
        AuthMessageId.InvalidEmail -> stringResource(R.string.auth_error_invalid_email)
        AuthMessageId.PasswordTooShort -> stringResource(R.string.auth_error_password_short)
        AuthMessageId.BetaCodeRequired -> stringResource(R.string.auth_error_beta_required)
        AuthMessageId.DateOfBirthRequired -> stringResource(R.string.auth_error_birth_date_required)
        AuthMessageId.DateOfBirthInvalid -> stringResource(R.string.auth_error_birth_date_invalid)
        AuthMessageId.ConsentRequired -> stringResource(R.string.auth_error_consent_required)
        AuthMessageId.MfaCodeRequired -> stringResource(R.string.auth_error_mfa_code_required)
        AuthMessageId.MfaCodeInvalid -> stringResource(R.string.auth_error_mfa_code_invalid)
        AuthMessageId.MfaRequired -> stringResource(R.string.auth_info_mfa_required)
        AuthMessageId.IpAuthorizationRequired -> stringResource(R.string.auth_info_ip_authorization)
        AuthMessageId.RegistrationPendingVerification -> stringResource(R.string.auth_info_pending_verification)
        null -> null
    }
}
