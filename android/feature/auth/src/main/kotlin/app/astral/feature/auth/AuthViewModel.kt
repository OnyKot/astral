package app.astral.feature.auth

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.astral.core.model.AuthResult
import app.astral.core.model.LoginRequest
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
        _uiState.update { it.copy(mode = mode, message = null) }
    }

    fun updateEmail(value: String) = _uiState.update { it.copy(email = value, message = null) }
    fun updatePassword(value: String) = _uiState.update { it.copy(password = value, message = null) }
    fun updateUsername(value: String) = _uiState.update { it.copy(username = value, message = null) }
    fun updateGlobalName(value: String) = _uiState.update { it.copy(globalName = value, message = null) }
    fun updateBetaCode(value: String) = _uiState.update { it.copy(betaCode = value, message = null) }
    fun updateDateOfBirth(value: String) = _uiState.update { it.copy(dateOfBirth = value, message = null) }
    fun updateConsent(value: Boolean) = _uiState.update { it.copy(consent = value, message = null) }

    fun submit() {
        val state = _uiState.value
        val validationMessage = validate(state)
        if (validationMessage != null) {
            _uiState.update { it.copy(message = validationMessage) }
            return
        }

        viewModelScope.launch {
            _uiState.update { it.copy(loading = true, message = null) }
            val result = if (state.mode == AuthMode.Login) {
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
            _uiState.update { it.copy(message = null) }
        }
    }

    private fun validate(state: AuthUiState): String? {
        val email = state.email.trim()
        if (!email.contains("@") || !email.contains(".")) return "Enter a valid email."
        if (state.password.length < 6) return "Password must be at least 6 characters."
        if (state.mode == AuthMode.Register) {
            if (state.betaCode.isBlank()) return "Invite / beta code is required."
            if (!Regex("""\d{4}-\d{2}-\d{2}""").matches(state.dateOfBirth.trim())) {
                return "Date of birth format: YYYY-MM-DD."
            }
            if (!state.consent) return "Accept Astral terms to continue."
        }
        return null
    }

    private suspend fun handleResult(result: ApiResult<AuthResult>) {
        when (result) {
            is ApiResult.Failure -> _uiState.update {
                it.copy(loading = false, message = result.failure.message)
            }
            is ApiResult.Success -> when (val authResult = result.value) {
                is AuthResult.Success -> {
                    sessionStore.save(authResult.session)
                    _uiState.update {
                        it.copy(loading = false, message = null, signedInSession = authResult.session)
                    }
                }
                is AuthResult.MfaRequired -> _uiState.update {
                    it.copy(loading = false, message = "MFA is enabled for this account. The MFA screen is next.")
                }
                is AuthResult.IpAuthorizationRequired -> _uiState.update {
                    it.copy(loading = false, message = "Authorize the new IP from the email sent to ${authResult.email}.")
                }
                AuthResult.PendingVerification -> _uiState.update {
                    it.copy(loading = false, message = "Account created. Check your email to verify it.")
                }
            }
        }
    }
}
