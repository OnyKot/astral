package app.astral.core.model

import org.junit.Assert.assertEquals
import org.junit.Test

class AuthModelsTest {
    @Test
    fun userSessionStoresTokenAndUserId() {
        val session = UserSession(token = "token", userId = "42")

        assertEquals("token", session.token)
        assertEquals("42", session.userId)
    }
}
