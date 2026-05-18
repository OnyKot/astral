package app.astral.core.network.auth

import app.astral.core.model.ApiFailure
import app.astral.core.model.AuthResult
import app.astral.core.model.LoginRequest
import app.astral.core.model.RegisterRequest
import app.astral.core.model.UserSession
import app.astral.core.network.ApiResult
import app.astral.core.network.AstralApiConfig
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.io.IOException

class AstralAuthApi(
    private val config: AstralApiConfig = AstralApiConfig(),
    private val client: OkHttpClient = OkHttpClient(),
) : AuthApi {
    override suspend fun login(request: LoginRequest): ApiResult<AuthResult> {
        val body = JSONObject()
            .put("email", request.email.trim())
            .put("password", request.password)
        return postAuth("/auth/login", body)
    }

    override suspend fun register(request: RegisterRequest): ApiResult<AuthResult> {
        val body = JSONObject()
            .put("email", request.email.trim())
            .put("password", request.password)
            .put("beta_code", request.betaCode.trim())
            .put("date_of_birth", request.dateOfBirth.trim())
            .put("consent", request.consent)

        request.username?.trim()?.takeIf { it.isNotEmpty() }?.let { body.put("username", it) }
        request.globalName?.trim()?.takeIf { it.isNotEmpty() }?.let { body.put("global_name", it) }

        return postAuth("/auth/register", body)
    }

    private suspend fun postAuth(path: String, json: JSONObject): ApiResult<AuthResult> = withContext(Dispatchers.IO) {
        val httpRequest = Request.Builder()
            .url(config.baseUrl.trimEnd('/') + path)
            .header("Content-Type", "application/json")
            .header("Accept", "application/json")
            .header("X-Astral-Platform", "mobile")
            .post(json.toString().toRequestBody(JSON))
            .build()

        try {
            client.newCall(httpRequest).execute().use { response ->
                val rawBody = response.body?.string().orEmpty()
                val body = rawBody.takeIf { it.isNotBlank() }?.let(::JSONObject) ?: JSONObject()
                if (!response.isSuccessful) {
                    return@withContext ApiResult.Failure(
                        ApiFailure(
                            message = body.optString("message", "Request failed"),
                            code = body.optString("code").ifBlank { null },
                            status = response.code,
                        ),
                    )
                }
                ApiResult.Success(parseAuthResult(body))
            }
        } catch (error: IOException) {
            ApiResult.Failure(ApiFailure(message = "Не удалось подключиться к Astral. Проверь сеть."))
        } catch (error: Exception) {
            ApiResult.Failure(ApiFailure(message = "Некорректный ответ сервера Astral."))
        }
    }

    private fun parseAuthResult(body: JSONObject): AuthResult {
        if (body.optBoolean("ip_authorization_required", false)) {
            return AuthResult.IpAuthorizationRequired(
                ticket = body.optString("ticket"),
                email = body.optString("email"),
                resendAvailableIn = body.optInt("resend_available_in", 30),
            )
        }

        if (body.optBoolean("mfa", false)) {
            return AuthResult.MfaRequired(
                ticket = body.optString("ticket"),
                sms = body.optBoolean("sms", false),
                totp = body.optBoolean("totp", false),
                webAuthn = body.optBoolean("webauthn", false),
            )
        }

        if (body.optBoolean("pending_verification", false)) {
            return AuthResult.PendingVerification
        }

        val token = body.optString("token")
        val userId = body.optString("user_id")
        if (token.isBlank() || userId.isBlank()) {
            throw IllegalStateException("Missing auth token")
        }

        return AuthResult.Success(UserSession(token = token, userId = userId))
    }

    private companion object {
        val JSON = "application/json; charset=utf-8".toMediaType()
    }
}
