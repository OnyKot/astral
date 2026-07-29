package app.astral.feature.auth

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.astral.core.model.AuthResult
import app.astral.core.model.LoginRequest
import app.astral.core.model.MfaMethod
import app.astral.core.model.RegisterRequest
import app.astral.core.network.ApiResult
import app.astral.core.network.SessionStore
import app.astral.core.network.auth.AuthApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

class AuthViewModel(
    private val authApi: AuthApi,
    private val sessionStore: SessionStore,
) : ViewModel() {
    private val _uiState = MutableStateFlow(AuthUiState())
    val uiState: StateFlow<AuthUiState> = _uiState.asStateFlow()

    init {
        viewModelScope.launch {
            sessionStore.session.collect { session ->
                _uiState.update { it.copy(signedInSession = session) }
            }
        }
    }

    fun setMode(mode: AuthMode) {
        _uiState.update {
            it.copy(
                mode = mode,
                mfaTicket = null,
                mfaTotpAvailable = false,
                mfaSmsAvailable = false,
                mfaCode = "",
                mfaCodeMethod = MfaCodeMethod.Totp,
            ).withoutMessage()
        }
    }

    fun updateEmail(value: String) = _uiState.update { it.copy(email = value).withoutMessage() }
    fun updatePassword(value: String) = _uiState.update { it.copy(password = value).withoutMessage() }
    fun updateUsername(value: String) = _uiState.update { it.copy(username = value).withoutMessage() }
    fun updateGlobalName(value: String) = _uiState.update { it.copy(globalName = value).withoutMessage() }
    fun updateBetaCode(value: String) = _uiState.update { it.copy(betaCode = value).withoutMessage() }
    fun updateDateOfBirth(value: String) = _uiState.update { it.copy(dateOfBirth = value).withoutMessage() }
    fun updateConsent(value: Boolean) = _uiState.update { it.copy(consent = value).withoutMessage() }
    fun updateMfaCode(value: String) = _uiState.update { it.copy(mfaCode = value).withoutMessage() }

    fun setMfaMethod(method: MfaCodeMethod) {
        _uiState.update { state ->
            val allowed = when (method) {
                MfaCodeMethod.Sms -> state.mfaSmsAvailable
                MfaCodeMethod.Totp -> state.mfaTotpAvailable
            }
            if (!allowed) state else state.copy(mfaCodeMethod = method).withoutMessage()
        }
    }

    fun requestMfaSms() {
        val state = _uiState.value
        val ticket = state.mfaTicket?.trim().orEmpty()
        if (ticket.isEmpty()) return

        viewModelScope.launch {
            _uiState.update { it.copy(loading = true).withoutMessage() }
            when (val result = authApi.sendMfaSms(ticket)) {
                is ApiResult.Failure -> _uiState.update {
                    it.copy(loading = false, messageText = result.failure.message, messageId = null)
                }
                is ApiResult.Success -> _uiState.update {
                    it.copy(loading = false, messageId = AuthMessageId.MfaRequired, messageText = null)
                }
            }
        }
    }

    fun submit() {
        val state = _uiState.value
        val validationMessage = validate(state)
        if (validationMessage != null) {
            _uiState.update { it.copy(messageId = validationMessage, messageText = null) }
            return
        }

        viewModelScope.launch {
            _uiState.update { it.copy(loading = true).withoutMessage() }

            val result = if (state.requiresMfa) {
                authApi.completeMfa(
                    ticket = state.mfaTicket.orEmpty(),
                    code = state.mfaCode.trim(),
                    method = if (state.mfaCodeMethod == MfaCodeMethod.Sms) MfaMethod.Sms else MfaMethod.Totp,
                )
            } else if (state.mode == AuthMode.Login) {
                authApi.login(LoginRequest(email = state.email.trim(), password = state.password))
            } else {
                authApi.register(
                    RegisterRequest(
                        email = state.email.trim(),
                        username = state.username.trim().ifBlank { null },
                        globalName = state.globalName.trim().ifBlank { null },
                        password = state.password,
                        betaCode = state.betaCode.trim(),
                        dateOfBirth = state.dateOfBirth.trim(),
                        consent = state.consent,
                    ),
                )
            }

            handleResult(result)
        }
    }

    fun logout() {
        viewModelScope.launch {
            sessionStore.clear()
            _uiState.update {
                it.copy(
                    signedInSession = null,
                    mfaTicket = null,
                    mfaTotpAvailable = false,
                    mfaSmsAvailable = false,
                    mfaCode = "",
                    mfaCodeMethod = MfaCodeMethod.Totp,
                ).withoutMessage()
            }
        }
    }

    private fun validate(state: AuthUiState): AuthMessageId? {
        if (state.requiresMfa) {
            val code = state.mfaCode.trim()
            if (code.isEmpty()) return AuthMessageId.MfaCodeRequired
            if (!Regex("""\d{4,10}""").matches(code)) return AuthMessageId.MfaCodeInvalid
            return null
        }

        val email = state.email.trim()
        if (!email.contains("@") || !email.contains(".")) return AuthMessageId.InvalidEmail
        if (state.password.length < 6) return AuthMessageId.PasswordTooShort
        if (state.mode == AuthMode.Register) {
            if (state.betaCode.isBlank()) return AuthMessageId.BetaCodeRequired
            if (state.dateOfBirth.isBlank()) return AuthMessageId.DateOfBirthRequired
            if (!Regex("""\d{4}-\d{2}-\d{2}""").matches(state.dateOfBirth.trim())) {
                return AuthMessageId.DateOfBirthInvalid
            }
            if (!state.consent) return AuthMessageId.ConsentRequired
        }
        return null
    }

    private suspend fun handleResult(result: ApiResult<AuthResult>) {
        when (result) {
            is ApiResult.Failure -> _uiState.update {
                it.copy(loading = false, messageText = result.failure.message, messageId = null)
            }
            is ApiResult.Success -> when (val authResult = result.value) {
                is AuthResult.Success -> {
                    sessionStore.save(authResult.session)
                    _uiState.update {
                        it.copy(
                            loading = false,
                            messageId = null,
                            messageText = null,
                            signedInSession = authResult.session,
                            mfaTicket = null,
                            mfaTotpAvailable = false,
                            mfaSmsAvailable = false,
                            mfaCode = "",
                            mfaCodeMethod = MfaCodeMethod.Totp,
                        )
                    }
                }
                is AuthResult.MfaRequired -> _uiState.update {
                    it.copy(
                        loading = false,
                        mfaTicket = authResult.ticket,
                        mfaTotpAvailable = authResult.totp,
                        mfaSmsAvailable = authResult.sms,
                        mfaCodeMethod = if (authResult.totp) MfaCodeMethod.Totp else MfaCodeMethod.Sms,
                        mfaCode = "",
                        messageId = AuthMessageId.MfaRequired,
                        messageText = null,
                    )
                }
                is AuthResult.IpAuthorizationRequired -> _uiState.update {
                    it.copy(
                        loading = false,
                        messageId = AuthMessageId.IpAuthorizationRequired,
                        messageText = null,
                    )
                }
                AuthResult.PendingVerification -> _uiState.update {
                    it.copy(
                        loading = false,
                        messageId = AuthMessageId.RegistrationPendingVerification,
                        messageText = null,
                    )
                }
            }
        }
    }
}

private fun AuthUiState.withoutMessage(): AuthUiState {
    return copy(messageId = null, messageText = null)
}
