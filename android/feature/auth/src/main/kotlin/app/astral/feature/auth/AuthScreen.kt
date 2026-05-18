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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.astral.core.design.components.AstralBackground
import app.astral.core.design.components.AstralPanel
import app.astral.core.design.components.AstralPrimaryButton
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
    onSubmit: () -> Unit,
) {
    val focusManager = LocalFocusManager.current
    val isRegister = state.mode == AuthMode.Register

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
                targetState = isRegister,
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
            ) { register ->
                Column {
                    Text(
                        text = if (register) "Create Astral ID" else "Welcome back",
                        color = AstralText,
                        fontSize = 34.sp,
                        fontWeight = FontWeight.Black,
                    )
                    Text(
                        text = if (register) {
                            "Reserve your native account for Astral mobile."
                        } else {
                            "Secure native access to Astral."
                        },
                        color = AstralMuted,
                        modifier = Modifier.padding(top = 8.dp, bottom = 24.dp),
                    )
                }
            }
            AstralPanel(modifier = Modifier.fillMaxWidth()) {
                Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {
                    Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        FilterChip(
                            selected = !isRegister,
                            onClick = { onMode(AuthMode.Login) },
                            label = { Text("Login") },
                        )
                        FilterChip(
                            selected = isRegister,
                            onClick = { onMode(AuthMode.Register) },
                            label = { Text("Register") },
                        )
                    }
                    AstralTextField(
                        value = state.email,
                        onValueChange = onEmail,
                        label = "Email",
                        keyboardOptions = KeyboardOptions(
                            keyboardType = KeyboardType.Email,
                            imeAction = ImeAction.Next,
                        ),
                        modifier = Modifier.fillMaxWidth(),
                    )
                    AstralTextField(
                        value = state.password,
                        onValueChange = onPassword,
                        label = "Password",
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
                    AnimatedVisibility(
                        visible = isRegister,
                        enter = fadeIn(AstralMotion.fastOut()) +
                            expandVertically(animationSpec = AstralMotion.standardOut()),
                        exit = fadeOut(AstralMotion.softExit()) +
                            shrinkVertically(animationSpec = AstralMotion.softExit()),
                    ) {
                        Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {
                            AstralTextField(
                                value = state.globalName,
                                onValueChange = onGlobalName,
                                label = "Display name",
                                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Next),
                                modifier = Modifier.fillMaxWidth(),
                            )
                            AstralTextField(
                                value = state.username,
                                onValueChange = onUsername,
                                label = "Username (optional)",
                                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Next),
                                modifier = Modifier.fillMaxWidth(),
                            )
                            AstralTextField(
                                value = state.betaCode,
                                onValueChange = onBetaCode,
                                label = "Invite / beta code",
                                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Next),
                                modifier = Modifier.fillMaxWidth(),
                            )
                            AstralTextField(
                                value = state.dateOfBirth,
                                onValueChange = onDateOfBirth,
                                label = "Date of birth: YYYY-MM-DD",
                                keyboardOptions = KeyboardOptions(
                                    keyboardType = KeyboardType.Number,
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
                                Text(text = "I accept Astral terms", color = AstralMuted)
                            }
                        }
                    }
                    AnimatedVisibility(
                        visible = state.message != null,
                        enter = fadeIn(AstralMotion.fastOut()) +
                            expandVertically(animationSpec = AstralMotion.fastOut()),
                        exit = fadeOut(AstralMotion.softExit()) +
                            shrinkVertically(animationSpec = AstralMotion.softExit()),
                    ) {
                        Text(
                            text = state.message.orEmpty(),
                            color = if (state.message?.startsWith("Account") == true) AstralMuted else AstralDanger,
                            fontSize = 14.sp,
                            lineHeight = 19.sp,
                        )
                    }
                    Spacer(Modifier.height(4.dp))
                    AstralPrimaryButton(
                        text = if (isRegister) "Create account" else "Log in",
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
