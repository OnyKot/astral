package app.astral

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.ContentTransform
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.animation.scaleOut
import androidx.compose.animation.togetherWith
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.lifecycle.viewmodel.compose.viewModel
import app.astral.core.design.motion.AstralMotion
import app.astral.core.model.UserSession
import app.astral.feature.auth.AuthMode
import app.astral.feature.auth.AuthScreen
import app.astral.feature.auth.AuthViewModel
import app.astral.feature.auth.WelcomeScreen
import app.astral.feature.home.HomeScreen

private sealed interface AstralDestination {
    data object Welcome : AstralDestination
    data class Auth(val mode: AuthMode) : AstralDestination
    data class Home(val session: UserSession) : AstralDestination
}

@Composable
fun AstralApp(container: AppContainer) {
    var authStarted by remember { mutableStateOf(false) }
    val authViewModel: AuthViewModel = viewModel(
        factory = AstralViewModelFactory(container.authApi, container.sessionStore),
    )
    val state by authViewModel.uiState.collectAsState()
    val destination = when {
        state.signedInSession != null -> AstralDestination.Home(state.signedInSession!!)
        !authStarted -> AstralDestination.Welcome
        else -> AstralDestination.Auth(state.mode)
    }

    AnimatedContent(
        targetState = destination,
        transitionSpec = { astralScreenTransition() },
        label = "Astral screen transition",
    ) { target ->
        when (target) {
            AstralDestination.Welcome -> WelcomeScreen(
                onLogin = {
                    authStarted = true
                    authViewModel.setMode(AuthMode.Login)
                },
                onRegister = {
                    authStarted = true
                    authViewModel.setMode(AuthMode.Register)
                },
            )
            is AstralDestination.Auth -> AuthScreen(
                state = state,
                onMode = authViewModel::setMode,
                onEmail = authViewModel::updateEmail,
                onPassword = authViewModel::updatePassword,
                onUsername = authViewModel::updateUsername,
                onGlobalName = authViewModel::updateGlobalName,
                onBetaCode = authViewModel::updateBetaCode,
                onDateOfBirth = authViewModel::updateDateOfBirth,
                onConsent = authViewModel::updateConsent,
                onSubmit = authViewModel::submit,
            )
            is AstralDestination.Home -> HomeScreen(
                session = target.session,
                onLogout = authViewModel::logout,
            )
        }
    }
}

private fun astralScreenTransition(): ContentTransform {
    return fadeIn(AstralMotion.standardOut()) + scaleIn(
        initialScale = 0.985f,
        animationSpec = AstralMotion.standardOut(),
    ) togetherWith fadeOut(AstralMotion.softExit()) + scaleOut(
        targetScale = 0.995f,
        animationSpec = AstralMotion.softExit(),
    )
}
