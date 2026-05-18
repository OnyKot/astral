package app.astral.feature.auth

import app.astral.core.model.UserSession

enum class AuthMode {
    Login,
    Register,
}

data class AuthUiState(
    val mode: AuthMode = AuthMode.Login,
    val email: String = "",
    val password: String = "",
    val username: String = "",
    val globalName: String = "",
    val betaCode: String = "",
    val dateOfBirth: String = "",
    val consent: Boolean = false,
    val loading: Boolean = false,
    val message: String? = null,
    val signedInSession: UserSession? = null,
)
