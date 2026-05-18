package app.astral.core.design.theme

import androidx.compose.material3.Typography
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp

val AstralTypography = Typography().run {
    copy(
        displayMedium = displayMedium.copy(
            fontFamily = FontFamily.SansSerif,
            fontWeight = FontWeight.Black,
            fontSize = 46.sp,
            lineHeight = 48.sp,
            letterSpacing = 0.sp,
        ),
        headlineMedium = headlineMedium.copy(
            fontWeight = FontWeight.Bold,
            fontSize = 28.sp,
            lineHeight = 34.sp,
            letterSpacing = 0.sp,
        ),
        titleLarge = titleLarge.copy(
            fontWeight = FontWeight.Bold,
            fontSize = 20.sp,
            lineHeight = 26.sp,
            letterSpacing = 0.sp,
        ),
        bodyMedium = bodyMedium.copy(
            fontSize = 15.sp,
            lineHeight = 22.sp,
            letterSpacing = 0.sp,
        ),
        labelLarge = labelLarge.copy(
            fontWeight = FontWeight.Bold,
            letterSpacing = 0.sp,
        ),
    )
}
