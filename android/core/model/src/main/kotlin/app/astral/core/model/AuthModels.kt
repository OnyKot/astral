package app.astral.core.model

data class UserSession(
    val token: String,
    val userId: String,
    val pendingVerification: Boolean = false,
)

data class LoginRequest(
    val email: String,
    val password: String,
)

data class RegisterRequest(
    val email: String,
    val username: String?,
    val globalName: String?,
    val password: String,
    val betaCode: String,
    val dateOfBirth: String,
    val consent: Boolean,
)

sealed interface AuthResult {
    data class Success(val session: UserSession) : AuthResult
    data class MfaRequired(
        val ticket: String,
        val sms: Boolean,
        val totp: Boolean,
        val webAuthn: Boolean,
    ) : AuthResult
    data class IpAuthorizationRequired(
        val ticket: String,
        val email: String,
        val resendAvailableIn: Int,
    ) : AuthResult
    data object PendingVerification : AuthResult
}

data class ApiFailure(
    val message: String,
    val code: String? = null,
    val status: Int? = null,
)
