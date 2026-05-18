package app.astral.core.design.components

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.unit.dp
import app.astral.core.design.theme.AstralBorder
import app.astral.core.design.theme.AstralPanel

@Composable
fun AstralPanel(
    modifier: Modifier = Modifier,
    padding: PaddingValues = PaddingValues(20.dp),
    content: @Composable () -> Unit,
) {
    val shape = RoundedCornerShape(24.dp)
    Box(
        modifier = modifier
            .clip(shape)
            .background(AstralPanel.copy(alpha = 0.82f))
            .border(BorderStroke(1.dp, AstralBorder.copy(alpha = 0.82f)), shape)
            .padding(padding),
    ) {
        content()
    }
}
