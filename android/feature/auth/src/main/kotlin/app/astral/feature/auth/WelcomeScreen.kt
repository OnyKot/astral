package app.astral.feature.auth

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.astral.core.design.components.AstralBackground
import app.astral.core.design.components.AstralPanel
import app.astral.core.design.components.AstralPrimaryButton
import app.astral.core.design.components.AstralSecondaryButton
import app.astral.core.design.motion.AstralMotion
import app.astral.core.design.theme.AstralBorder
import app.astral.core.design.theme.AstralCyan
import app.astral.core.design.theme.AstralMuted
import app.astral.core.design.theme.AstralPanelHigh
import app.astral.core.design.theme.AstralPink
import app.astral.core.design.theme.AstralText
import app.astral.core.design.theme.AstralViolet
import kotlin.math.min

@Composable
fun WelcomeScreen(
    onLogin: () -> Unit,
    onRegister: () -> Unit,
    logoResId: Int,
) {
    var entered by remember { mutableStateOf(false) }
    val progress by animateFloatAsState(
        targetValue = if (entered) 1f else 0f,
        animationSpec = AstralMotion.standardOut(),
        label = "welcome progress",
    )

    LaunchedEffect(Unit) { entered = true }

    AstralBackground {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .statusBarsPadding()
                .navigationBarsPadding()
                .padding(horizontal = 22.dp, vertical = 18.dp),
            verticalArrangement = Arrangement.SpaceBetween,
        ) {
            WelcomeHeader(
                logoResId = logoResId,
                modifier = Modifier
                    .alpha(progress)
                    .graphicsLayer { translationY = (1f - progress) * 10f },
            )

            AstralHero(
                modifier = Modifier
                    .fillMaxWidth()
                    .weight(1f)
                    .padding(vertical = 20.dp)
                    .alpha(progress)
                    .graphicsLayer {
                        scaleX = 0.985f + progress * 0.015f
                        scaleY = 0.985f + progress * 0.015f
                    },
            )

            WelcomeActionPanel(
                onLogin = onLogin,
                onRegister = onRegister,
                modifier = Modifier
                    .fillMaxWidth()
                    .graphicsLayer {
                        alpha = progress
                        translationY = (1f - progress) * 18f
                    },
            )
        }
    }
}

@Composable
private fun WelcomeHeader(
    logoResId: Int,
    modifier: Modifier = Modifier,
) {
    Row(
        modifier = modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Box(
                modifier = Modifier
                    .size(38.dp)
                    .clip(RoundedCornerShape(12.dp))
                    .background(
                        Brush.linearGradient(
                            listOf(AstralViolet, AstralPink, AstralCyan),
                        ),
                    )
                    .border(1.dp, Color.White.copy(alpha = 0.18f), RoundedCornerShape(12.dp)),
                contentAlignment = Alignment.Center,
            ) {
                Image(
                    painter = painterResource(id = logoResId),
                    contentDescription = stringResource(R.string.welcome_logo_content_description),
                    modifier = Modifier
                        .size(26.dp)
                        .clip(RoundedCornerShape(8.dp)),
                )
            }
            Column(modifier = Modifier.padding(start = 12.dp)) {
                Text(stringResource(R.string.welcome_brand), color = AstralText, fontWeight = FontWeight.Black, fontSize = 22.sp)
                Text(stringResource(R.string.welcome_native_mobile), color = AstralMuted, fontSize = 12.sp)
            }
        }
        Text(
            text = stringResource(R.string.welcome_badge_beta),
            color = AstralCyan,
            fontSize = 12.sp,
            fontWeight = FontWeight.SemiBold,
            modifier = Modifier
                .clip(CircleShape)
                .background(AstralPanelHigh.copy(alpha = 0.72f))
                .border(1.dp, AstralBorder.copy(alpha = 0.7f), CircleShape)
                .padding(horizontal = 12.dp, vertical = 7.dp),
        )
    }
}

@Composable
private fun AstralHero(modifier: Modifier = Modifier) {
    Box(
        modifier = modifier,
        contentAlignment = Alignment.Center,
    ) {
        Canvas(modifier = Modifier.fillMaxSize()) {
            val side = min(size.width, size.height)
            val center = Offset(size.width / 2f, size.height * 0.52f)
            val radius = side * 0.26f
            val points = listOf(
                Offset(center.x - radius * 0.96f, center.y - radius * 0.28f),
                Offset(center.x - radius * 0.42f, center.y - radius * 0.92f),
                Offset(center.x + radius * 0.58f, center.y - radius * 0.82f),
                Offset(center.x + radius * 0.96f, center.y - radius * 0.08f),
                Offset(center.x + radius * 0.38f, center.y + radius * 0.78f),
                Offset(center.x - radius * 0.56f, center.y + radius * 0.68f),
            )

            drawCircle(
                brush = Brush.radialGradient(
                    colors = listOf(AstralViolet.copy(alpha = 0.26f), Color.Transparent),
                    center = center,
                    radius = side * 0.55f,
                ),
                radius = side * 0.45f,
                center = center,
            )
            drawCircle(
                color = AstralBorder.copy(alpha = 0.25f),
                radius = radius * 1.42f,
                center = center,
                style = Stroke(width = 1.2.dp.toPx()),
            )
            drawCircle(
                color = AstralViolet.copy(alpha = 0.48f),
                radius = radius,
                center = center,
                style = Stroke(width = 1.8.dp.toPx()),
            )
            points.zipWithNext().forEach { (from, to) ->
                drawLine(
                    color = AstralCyan.copy(alpha = 0.28f),
                    start = from,
                    end = to,
                    strokeWidth = 1.2.dp.toPx(),
                    cap = StrokeCap.Round,
                )
            }
            drawLine(
                color = AstralPink.copy(alpha = 0.22f),
                start = points.last(),
                end = points.first(),
                strokeWidth = 1.2.dp.toPx(),
                cap = StrokeCap.Round,
            )
            points.forEachIndexed { index, point ->
                drawCircle(
                    color = if (index % 2 == 0) AstralCyan else AstralPink,
                    radius = 3.2.dp.toPx(),
                    center = point,
                )
                drawCircle(
                    color = Color.White.copy(alpha = 0.7f),
                    radius = 1.2.dp.toPx(),
                    center = point,
                )
            }
        }

        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Text(
                text = stringResource(R.string.welcome_brand),
                color = AstralText,
                fontSize = 58.sp,
                fontWeight = FontWeight.Black,
                letterSpacing = 0.sp,
            )
            Text(
                text = stringResource(R.string.welcome_hero_subtitle),
                color = AstralMuted,
                fontSize = 15.sp,
                modifier = Modifier.padding(top = 8.dp),
            )
        }
    }
}

@Composable
private fun WelcomeActionPanel(
    onLogin: () -> Unit,
    onRegister: () -> Unit,
    modifier: Modifier = Modifier,
) {
    AstralPanel(modifier = modifier) {
        Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {
            Text(
                text = stringResource(R.string.welcome_panel_title),
                color = AstralText,
                fontWeight = FontWeight.Black,
                fontSize = 26.sp,
                lineHeight = 30.sp,
            )
            Text(
                text = stringResource(R.string.welcome_panel_description),
                color = AstralMuted,
                lineHeight = 21.sp,
            )
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                FeaturePill(stringResource(R.string.welcome_feature_encrypted))
                FeaturePill(stringResource(R.string.welcome_feature_low_friction))
            }
            Spacer(Modifier.height(2.dp))
            AstralPrimaryButton(text = stringResource(R.string.welcome_action_continue), onClick = onLogin)
            AstralSecondaryButton(text = stringResource(R.string.welcome_action_create_account), onClick = onRegister)
            Text(
                text = stringResource(R.string.welcome_footer_hint),
                color = AstralMuted.copy(alpha = 0.82f),
                textAlign = TextAlign.Center,
                fontSize = 12.sp,
                modifier = Modifier.fillMaxWidth(),
            )
        }
    }
}

@Composable
private fun FeaturePill(text: String) {
    Text(
        text = text,
        color = AstralText,
        fontSize = 12.sp,
        fontWeight = FontWeight.SemiBold,
        modifier = Modifier
            .clip(CircleShape)
            .background(AstralPanelHigh.copy(alpha = 0.62f))
            .border(1.dp, AstralBorder.copy(alpha = 0.55f), CircleShape)
            .padding(horizontal = 11.dp, vertical = 7.dp),
    )
}
