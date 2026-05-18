package app.astral.core.network

import android.content.Context
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import app.astral.core.model.UserSession
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map

private val Context.sessionDataStore by preferencesDataStore(name = "astral_session")

interface SessionStore {
    val session: Flow<UserSession?>
    suspend fun save(session: UserSession)
    suspend fun clear()
}

class DataStoreSessionStore(context: Context) : SessionStore {
    private val dataStore = context.applicationContext.sessionDataStore

    override val session: Flow<UserSession?> = dataStore.data.map { preferences ->
        val token = preferences[TOKEN_KEY]
        val userId = preferences[USER_ID_KEY]
        if (token.isNullOrBlank() || userId.isNullOrBlank()) {
            null
        } else {
            UserSession(token = token, userId = userId)
        }
    }

    override suspend fun save(session: UserSession) {
        dataStore.edit { preferences ->
            preferences[TOKEN_KEY] = session.token
            preferences[USER_ID_KEY] = session.userId
        }
    }

    override suspend fun clear() {
        dataStore.edit { preferences ->
            preferences.remove(TOKEN_KEY)
            preferences.remove(USER_ID_KEY)
        }
    }

    private companion object {
        val TOKEN_KEY = stringPreferencesKey("token")
        val USER_ID_KEY = stringPreferencesKey("user_id")
    }
}
