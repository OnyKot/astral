package app.astral.core.network.auth

import app.astral.core.model.ApiFailure
import app.astral.core.model.AuthResult
import app.astral.core.model.LoginRequest
import app.astral.core.model.MfaMethod
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
import java.net.URI
import java.util.Locale

class AstralAuthApi(
    private val config: AstralApiConfig = AstralApiConfig(),
    private val client: OkHttpClient = OkHttpClient(),
) : AuthApi {
    private val appOrigin: String by lazy { resolveAppOrigin(config.baseUrl) }
    private val acceptLanguage: String by lazy { Locale.getDefault().toLanguageTag().ifBlank { "en" } }

    override suspend fun login(request: LoginRequest): ApiResult<AuthResult> {
        val body = JSONObject()
            .put("email", request.email.trim())
            .put("password", request.password)
        return postAuth("/auth/login", body, ::parseAuthResult)
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

        return postAuth("/auth/register", body, ::parseAuthResult)
    }

    override suspend fun completeMfa(ticket: String, code: String, method: MfaMethod): ApiResult<AuthResult> {
        val path = if (method == MfaMethod.Sms) "/auth/login/mfa/sms" else "/auth/login/mfa/totp"
        val body = JSONObject()
            .put("ticket", ticket.trim())
            .put("code", code.trim())
        return postAuth(path, body, ::parseAuthResult)
    }

    override suspend fun sendMfaSms(ticket: String): ApiResult<Unit> {
        val body = JSONObject().put("ticket", ticket.trim())
        return postAuth("/auth/login/mfa/sms/send", body) { Unit }
    }

    private suspend fun <T> postAuth(
        path: String,
        json: JSONObject,
        parseSuccess: (JSONObject) -> T,
    ): ApiResult<T> = withContext(Dispatchers.IO) {
        val httpRequest = Request.Builder()
            .url(config.baseUrl.trimEnd('/') + path)
            .header("Content-Type", "application/json")
            .header("Accept", "application/json")
            .header("Accept-Language", acceptLanguage)
            .header("X-Astral-Platform", "mobile")
            // API validates Origin for cookie-authenticated endpoints.
            // Native clients don't send Origin by default, so we provide
            // a first-party origin derived from configured API base URL.
            .header("Origin", appOrigin)
            .header("Referer", "$appOrigin/")
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
                ApiResult.Success(parseSuccess(body))
            }
        } catch (error: IOException) {
            ApiResult.Failure(ApiFailure(message = "Unable to connect to Astral. Please check your network."))
        } catch (error: Exception) {
            ApiResult.Failure(ApiFailure(message = "Invalid response from Astral server."))
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

        fun resolveAppOrigin(baseUrl: String): String {
            val fallback = "https://astraof.com"
            return try {
                val normalized = if (baseUrl.contains("://")) baseUrl else "https://$baseUrl"
                val uri = URI(normalized)
                val scheme = uri.scheme ?: return fallback
                val host = uri.host ?: return fallback
                val defaultPort = when (scheme.lowercase()) {
                    "http" -> 80
                    "https" -> 443
                    else -> -1
                }
                val portPart = if (uri.port != -1 && uri.port != defaultPort) ":${uri.port}" else ""
                "$scheme://$host$portPart"
            } catch (_: Exception) {
                fallback
            }
        }
    }
}
