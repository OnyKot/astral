package app.astral.feature.home

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.astral.core.design.components.AstralBackground
import app.astral.core.design.components.AstralPanel
import app.astral.core.design.components.AstralPrimaryButton
import app.astral.core.design.theme.AstralMuted
import app.astral.core.design.theme.AstralText
import app.astral.core.model.UserSession

@Composable
fun HomeScreen(
    session: UserSession,
    onLogout: () -> Unit,
) {
    AstralBackground {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(24.dp),
            verticalArrangement = Arrangement.Center,
        ) {
            Text(
                text = "Astral",
                color = AstralText,
                fontSize = 42.sp,
                fontWeight = FontWeight.Black,
            )
            Text(
                text = "Native shell online",
                color = AstralMuted,
                modifier = Modifier.padding(top = 8.dp, bottom = 24.dp),
            )
            AstralPanel(modifier = Modifier.fillMaxWidth()) {
                Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    Text(
                        text = "Session ready",
                        color = AstralText,
                        fontWeight = FontWeight.Bold,
                        fontSize = 22.sp,
                    )
                    Text(
                        text = "User ID: ${session.userId}",
                        color = AstralMuted,
                    )
                    Text(
                        text = "Chat, guilds and voice rooms will plug into this native shell next.",
                        color = AstralMuted,
                        lineHeight = 22.sp,
                    )
                    Spacer(Modifier.height(8.dp))
                    AstralPrimaryButton(text = "Logout", onClick = onLogout)
                }
            }
        }
    }
}
