package com.programo.solvio.core.theme

import androidx.compose.animation.core.Spring
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
            onError = palette.background,
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
            onError = palette.surface,
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

/// Solvio default spring — snappy but not jarring (response 0.35, damping 0.85).
/// Compose `spring()` doesn't take "response/damping" pair the way SwiftUI does;
/// we approximate by mapping response → stiffness and damping → damping ratio.
val NbSpring = spring<Float>(
    dampingRatio = 0.85f,
    stiffness = Spring.StiffnessMedium,
)
val NbGentle = spring<Float>(
    dampingRatio = 0.9f,
    stiffness = Spring.StiffnessLow,
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
