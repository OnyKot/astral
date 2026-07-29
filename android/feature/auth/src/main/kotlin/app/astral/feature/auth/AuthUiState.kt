package app.astral.feature.auth

import app.astral.core.model.UserSession

enum class AuthMode {
    Login,
    Register,
}

enum class AuthMessageId {
    InvalidEmail,
    PasswordTooShort,
    BetaCodeRequired,
    DateOfBirthRequired,
    DateOfBirthInvalid,
    ConsentRequired,
    MfaCodeRequired,
    MfaCodeInvalid,
    MfaRequired,
    IpAuthorizationRequired,
    RegistrationPendingVerification,
}

enum class MfaCodeMethod {
    Totp,
    Sms,
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
    val mfaTicket: String? = null,
    val mfaTotpAvailable: Boolean = false,
    val mfaSmsAvailable: Boolean = false,
    val mfaCodeMethod: MfaCodeMethod = MfaCodeMethod.Totp,
    val mfaCode: String = "",
    val loading: Boolean = false,
    val messageId: AuthMessageId? = null,
    val messageText: String? = null,
    val signedInSession: UserSession? = null,
) {
    val requiresMfa: Boolean
        get() = !mfaTicket.isNullOrBlank()
}
