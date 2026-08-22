package com.programo.solvio.core.theme

import androidx.compose.animation.core.spring
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Outline
import androidx.compose.ui.graphics.RectangleShape
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import com.programo.solvio.core.AppTheme

/// Solvio neobrutalism design tokens — exact match of the iOS Theme enum
/// in `native-ios/Solvio/Core/Theme/Theme.swift`. Static defaults provide
/// sensible spacing/radius/border values; the active color palette is
/// resolved at composition time and supplied through CompositionLocal.
object SolvioTheme {
    object Spacing {
        val xxs = 4.dp
        val xs = 8.dp
        val sm = 12.dp
        val md = 16.dp
        val lg = 24.dp
        val xl = 32.dp
        val xxl = 48.dp
    }
    object Radius {
        val sm = 8.dp
        val md = 10.dp
        val lg = 12.dp
        val xl = 16.dp
        val pill = 999.dp
    }
    object Shadow {
        val sm = 2.dp
        val md = 3.dp
        val lg = 4.dp
        val xl = 6.dp
    }
    object Border {
        val width = 2.dp
        val widthThin = 1.dp
    }
}

/// Composition local that exposes the active palette to every nested
/// composable. Read via `LocalPalette.current` — see the `Palette`
/// extension below for the convenient `MaterialTheme.solvio` accessor.
val LocalPalette = staticCompositionLocalOf { Palette.Light }

/// Quick accessor mirror — call as `MaterialTheme.solvio.background`
/// the same way iOS code says `Theme.background`.
val MaterialTheme.solvio: Palette
    @Composable
    get() = LocalPalette.current

@Composable
fun SolvioComposeTheme(
    mode: AppTheme.Mode = AppTheme.Mode.System,
    content: @Composable () -> Unit,
) {
    val systemDark = isSystemInDarkTheme()
    val palette = when (mode) {
        AppTheme.Mode.Light -> Palette.Light
        AppTheme.Mode.Dark -> Palette.Dark
        AppTheme.Mode.Evening -> Palette.Evening
        AppTheme.Mode.System -> if (systemDark) Palette.Dark else Palette.Light
    }

    val isDarkBucket = palette === Palette.Dark || palette === Palette.Evening

    val colorScheme = if (isDarkBucket) {
        darkColorScheme(
            background = palette.background,
            surface = palette.surface,
            onBackground = palette.foreground,
            onSurface = palette.foreground,
            primary = palette.foreground,
            onPrimary = palette.background,
            error = palette.destructive,
            onError = Color.White,
        )
    } else {
        lightColorScheme(
            background = palette.background,
            surface = palette.surface,
            onBackground = palette.foreground,
            onSurface = palette.foreground,
            primary = palette.foreground,
            onPrimary = palette.background,
            error = palette.destructive,
            onError = Color.White,
        )
    }

    CompositionLocalProvider(LocalPalette provides palette) {
        MaterialTheme(
            colorScheme = colorScheme,
            typography = solvioTypography(),
            content = content,
        )
    }
}

// MARK: - Animation helpers — mirror iOS Animation.nbSpring/nbGentle

/// SwiftUI's `spring(response:dampingFraction:)` and Compose's
/// `spring(stiffness:dampingRatio:)` are the same critically-damped model
/// expressed differently. SwiftUI "response" is the natural period in
/// seconds; Compose "stiffness" is the angular-frequency-squared. So the
/// faithful mapping is `stiffness = (2π / response)²`, keeping the damping
/// fraction identical. This reproduces iOS spring TIMING, not the coarse
/// Spring.Stiffness* presets.
///
/// response 0.35 → (2π / 0.35)² ≈ 322.0
/// response 0.50 → (2π / 0.50)² ≈ 157.9
private fun stiffnessForResponse(response: Float): Float {
    val omega = (2.0 * Math.PI / response).toFloat()
    return omega * omega
}

/// Solvio default spring — snappy but not jarring (response 0.35, damping 0.85).
val NbSpring = spring<Float>(
    dampingRatio = 0.85f,
    stiffness = stiffnessForResponse(0.35f),
)
val NbGentle = spring<Float>(
    dampingRatio = 0.9f,
    stiffness = stiffnessForResponse(0.5f),
)

// MARK: - Modifiers (nbCard, nbShadow, nbBorder)

/// Hard offset shadow with no blur — neobrutalism's signature look in
/// light mode. In dark/evening the shadow color is automatically a
/// soft black/navy via `Palette.shadow`, so the same modifier reads as
/// elevated depth instead of a glowing white slab.
///
/// The shadow draws BEHIND the content as a rounded-rect of the same
/// shape + radius as the content's clip — without the rounded corners
/// the shadow's square corners would peek out from under a rounded card.
fun Modifier.nbShadow(
    palette: Palette,
    offset: Dp = SolvioTheme.Shadow.md,
    color: Color? = null,
    cornerRadius: Dp = SolvioTheme.Radius.lg,
): Modifier = this.drawBehind {
    val tint = color ?: palette.shadow
    val xPx = offset.toPx()
    val yPx = offset.toPx()
    val radiusPx = cornerRadius.toPx()
    drawRoundRect(
        color = tint,
        topLeft = Offset(xPx, yPx),
        size = Size(size.width, size.height),
        cornerRadius = androidx.compose.ui.geometry.CornerRadius(radiusPx, radiusPx),
    )
}

/// Chunky bordered card — soft hairline border + hard offset shadow +
/// rounded corners. Apply *before* padding so the border hugs the
/// content + the hard shadow draws beneath. Mirror of iOS `nbCard`.
fun Modifier.nbCard(
    palette: Palette,
    radius: Dp = SolvioTheme.Radius.lg,
    shadow: Dp = SolvioTheme.Shadow.lg,
    fill: Color? = null,
    border: Color? = null,
): Modifier = this
    .nbShadow(palette, offset = shadow, cornerRadius = radius)
    .clip(RoundedCornerShape(radius))
    .background(fill ?: palette.surface)
    .border(SolvioTheme.Border.width, border ?: palette.border, RoundedCornerShape(radius))

/// Glassmorphism variant — faithful Compose port of iOS `nbGlassCard`.
/// iOS: `.ultraThinMaterial` background + softened 2px border (foreground
/// @15%) + a blurred, low-opacity drop shadow (foreground @8%, radius 12,
/// y 4). Opt-in alternative to [nbCard] for surfaces that should float
/// above the background without the hard neobrutalist offset (sheets,
/// floating panels, stats overlays).
///
/// Compose has no first-class `.ultraThinMaterial`, so we approximate the
/// frosted look with a translucent surface scrim (surface @ ~70%) plus the
/// same hairline border + soft drop shadow. A real blur can be layered by
/// the caller via `Modifier.blur` on the content behind this surface.
fun Modifier.nbGlassCard(
    palette: Palette,
    radius: Dp = SolvioTheme.Radius.lg,
): Modifier = this
    .nbSoftShadow(
        color = palette.foreground.copy(alpha = 0.08f),
        offsetY = 4.dp,
        cornerRadius = radius,
    )
    .clip(RoundedCornerShape(radius))
    .background(palette.surface.copy(alpha = 0.70f))
    .border(
        SolvioTheme.Border.width,
        palette.foreground.copy(alpha = 0.15f),
        RoundedCornerShape(radius),
    )

/// Soft, low-opacity drop shadow (blur approximation via a slightly-larger
/// translucent rounded rect drawn behind). Unlike [nbShadow] this is offset
/// only on Y and tinted faintly — used by [nbGlassCard] to lift floating
/// surfaces gently rather than the hard neobrutalist offset.
private fun Modifier.nbSoftShadow(
    color: Color,
    offsetY: Dp,
    cornerRadius: Dp,
): Modifier = this.drawBehind {
    val yPx = offsetY.toPx()
    val radiusPx = cornerRadius.toPx()
    drawRoundRect(
        color = color,
        topLeft = Offset(0f, yPx),
        size = Size(size.width, size.height),
        cornerRadius = androidx.compose.ui.geometry.CornerRadius(radiusPx, radiusPx),
    )
}
