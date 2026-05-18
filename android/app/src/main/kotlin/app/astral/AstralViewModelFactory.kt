package app.astral

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import app.astral.core.network.SessionStore
import app.astral.core.network.auth.AuthApi
import app.astral.feature.auth.AuthViewModel

class AstralViewModelFactory(
    private val authApi: AuthApi,
    private val sessionStore: SessionStore,
) : ViewModelProvider.Factory {
    @Suppress("UNCHECKED_CAST")
    override fun <T : ViewModel> create(modelClass: Class<T>): T {
        if (modelClass.isAssignableFrom(AuthViewModel::class.java)) {
            return AuthViewModel(authApi, sessionStore) as T
        }
        throw IllegalArgumentException("Unknown ViewModel class: ${modelClass.name}")
    }
}
