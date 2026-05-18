package app.astral.core.design.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.ColorScheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

private val AstralDarkScheme: ColorScheme = darkColorScheme(
    primary = AstralViolet,
    secondary = AstralPink,
    tertiary = AstralCyan,
    background = AstralVoid,
    surface = AstralPanel,
    surfaceVariant = AstralPanelHigh,
    outline = AstralBorder,
    onPrimary = Color.White,
    onSecondary = Color.White,
    onBackground = AstralText,
    onSurface = AstralText,
    onSurfaceVariant = AstralMuted,
    error = AstralDanger,
    onError = Color.White,
)

@Composable
fun AstralTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit,
) {
    MaterialTheme(
        colorScheme = AstralDarkScheme,
        typography = AstralTypography,
        content = content,
    )
}
