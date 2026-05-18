package app.astral.core.network

import app.astral.core.model.RegisterRequest
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Test

class AuthJsonTest {
    @Test
    fun registerShapeMatchesAstralApiContract() {
        val request = RegisterRequest(
            email = "user@example.com",
            username = "star",
            globalName = "Star User",
            password = "safe-password",
            betaCode = "INVITE",
            dateOfBirth = "2001-01-01",
            consent = true,
        )

        val json = JSONObject()
            .put("email", request.email)
            .put("username", request.username)
            .put("global_name", request.globalName)
            .put("password", request.password)
            .put("beta_code", request.betaCode)
            .put("date_of_birth", request.dateOfBirth)
            .put("consent", request.consent)

        assertEquals("user@example.com", json.getString("email"))
        assertEquals("INVITE", json.getString("beta_code"))
        assertEquals(true, json.getBoolean("consent"))
    }
}
