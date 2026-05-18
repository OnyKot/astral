package app.astral

import android.content.Context
import app.astral.core.network.AstralApiConfig
import app.astral.core.network.DataStoreSessionStore
import app.astral.core.network.SessionStore
import app.astral.core.network.auth.AstralAuthApi
import app.astral.core.network.auth.AuthApi

class AppContainer(context: Context) {
    val sessionStore: SessionStore = DataStoreSessionStore(context)
    val authApi: AuthApi = AstralAuthApi(AstralApiConfig())
}
