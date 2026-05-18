package app.astral.core.design.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import app.astral.core.design.theme.AstralCyan
import app.astral.core.design.theme.AstralPink
import app.astral.core.design.theme.AstralViolet
import app.astral.core.design.theme.AstralVoid

@Composable
fun AstralBackground(
    modifier: Modifier = Modifier,
    content: @Composable () -> Unit,
) {
    Box(
        modifier = modifier
            .fillMaxSize()
            .background(AstralVoid)
            .background(
                Brush.radialGradient(
                    colors = listOf(AstralViolet.copy(alpha = 0.34f), AstralVoid.copy(alpha = 0f)),
                    center = Offset(240f, 160f),
                    radius = 580f,
                ),
            )
            .background(
                Brush.radialGradient(
                    colors = listOf(AstralPink.copy(alpha = 0.16f), AstralVoid.copy(alpha = 0f)),
                    center = Offset(900f, 1400f),
                    radius = 760f,
                ),
            )
            .background(
                Brush.radialGradient(
                    colors = listOf(AstralCyan.copy(alpha = 0.09f), AstralVoid.copy(alpha = 0f)),
                    center = Offset(70f, 1450f),
                    radius = 520f,
                ),
            ),
    ) {
        content()
    }
}
