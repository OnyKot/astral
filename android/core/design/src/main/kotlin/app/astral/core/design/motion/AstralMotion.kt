package app.astral.core.design.motion

import androidx.compose.animation.core.CubicBezierEasing
import androidx.compose.animation.core.Easing
import androidx.compose.animation.core.FiniteAnimationSpec
import androidx.compose.animation.core.tween

object AstralEasing {
    val EaseOutQuint: Easing = CubicBezierEasing(0.23f, 1f, 0.32f, 1f)
    val EmphasizedDecelerate: Easing = CubicBezierEasing(0.05f, 0.7f, 0.1f, 1f)
    val EmphasizedAccelerate: Easing = CubicBezierEasing(0.3f, 0f, 0.8f, 0.15f)
}

object AstralMotion {
    fun <T> fastOut(): FiniteAnimationSpec<T> = tween(
        durationMillis = 220,
        easing = AstralEasing.EmphasizedDecelerate,
    )

    fun <T> standardOut(): FiniteAnimationSpec<T> = tween(
        durationMillis = 280,
        easing = AstralEasing.EaseOutQuint,
    )

    fun <T> softExit(): FiniteAnimationSpec<T> = tween(
        durationMillis = 150,
        easing = AstralEasing.EmphasizedAccelerate,
    )
}
