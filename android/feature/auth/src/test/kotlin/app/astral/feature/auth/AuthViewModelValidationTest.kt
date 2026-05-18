package app.astral.feature.auth

import org.junit.Assert.assertEquals
import org.junit.Test

class AuthViewModelValidationTest {
    @Test
    fun defaultModeIsLogin() {
        assertEquals(AuthMode.Login, AuthUiState().mode)
    }
}
