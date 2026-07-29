package app.astral

import android.content.Context
import app.astral.core.network.AstralApiConfig
import app.astral.core.network.DataStoreSessionStore
import app.astral.core.network.SessionStore
import app.astral.core.network.auth.AstralAuthApi
import app.astral.core.network.auth.AuthApi
import java.net.URI

class AppContainer(context: Context) {
    private val apiConfig = AstralApiConfig()

    val sessionStore: SessionStore = DataStoreSessionStore(context)
    val authApi: AuthApi = AstralAuthApi(apiConfig)
    val webAppUrl: String = resolveWebAppUrl(apiConfig.baseUrl)

    private fun resolveWebAppUrl(baseUrl: String): String {
        val fallback = "https://astraof.com/channels/@me"
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
            "$scheme://$host$portPart/channels/@me"
        } catch (_: Exception) {
            fallback
        }
    }
}
