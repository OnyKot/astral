package app.astral.core.network.auth

import app.astral.core.model.AuthResult
import app.astral.core.model.LoginRequest
import app.astral.core.model.MfaMethod
import app.astral.core.model.RegisterRequest
import app.astral.core.network.ApiResult

interface AuthApi {
    suspend fun login(request: LoginRequest): ApiResult<AuthResult>
    suspend fun register(request: RegisterRequest): ApiResult<AuthResult>
    suspend fun completeMfa(ticket: String, code: String, method: MfaMethod): ApiResult<AuthResult>
    suspend fun sendMfaSms(ticket: String): ApiResult<Unit>
}
