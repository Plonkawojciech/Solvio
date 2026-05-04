package com.programo.solvio.core.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.programo.solvio.core.theme.AppThemeMode.Dark
import com.programo.solvio.core.theme.AppThemeMode.Evening
import com.programo.solvio.core.theme.AppThemeMode.Light
import com.programo.solvio.core.theme.AppThemeMode.System

/**
 * Solvio neobrutalism design tokens — exact match to iOS [Theme.swift]
 * which mirrors the PWA `app/globals.css` (cream #f5f0eb background,
 * black borders, hard `shadow-[Npx_Npx_0]` shadows, Inter + JetBrains Mono).
 */
data class Tokens(
    val background: Color,
    val foreground: Color,
    val muted: Color,
    val mutedForeground: Color,
    val surface: Color,
    val accent: Color,
    val card: Color,
    val destructive: Color,
    val success: Color,
    val warning: Color,
    val info: Color,
    val chart1: Color,
    val chart2: Color,
    val chart3: Color,
    val chart4: Color,
    val chart5: Color,
    val chart6: Color,
) {
    val secondary get() = accent
}

object Shadow {
    val sm: Dp = 2.dp
    val md: Dp = 3.dp
    val lg: Dp = 4.dp
    val xl: Dp = 6.dp
}

object Radius {
    val sm: Dp = 8.dp
    val md: Dp = 10.dp
    val lg: Dp = 12.dp
    val xl: Dp = 16.dp
    val pill: Dp = 999.dp
}

object Spacing {
    val xxs: Dp = 4.dp
    val xs: Dp = 8.dp
    val sm: Dp = 12.dp
    val md: Dp = 16.dp
    val lg: Dp = 24.dp
    val xl: Dp = 32.dp
    val xxl: Dp = 48.dp
}

object Border {
    val width: Dp = 2.dp
    val widthThin: Dp = 1.dp
}

private val LightTokens = Tokens(
    background = Color(0xFFF5F0EB),
    foreground = Color(0xFF1A1A1A),
    muted = Color(0xFFE9E2D7),
    mutedForeground = Color(0xFF6B6660),
    surface = Color(0xFFFFFDF8),
    accent = Color(0xFFE9DEC8),
    card = Color(0xFFFFFDF8),
    destructive = Color(0xFFE54848),
    success = Color(0xFF2DAA68),
    warning = Color(0xFFE89B2D),
    info = Color(0xFF3B82F6),
    chart1 = Color(0xFF1A1A1A),
    chart2 = Color(0xFFE89B2D),
    chart3 = Color(0xFF2DAA68),
    chart4 = Color(0xFFE54848),
    chart5 = Color(0xFF3B82F6),
    chart6 = Color(0xFF8B5CF6),
)

private val DarkTokens = Tokens(
    background = Color(0xFF111111),
    foreground = Color(0xFFF5F0EB),
    muted = Color(0xFF1F1F1F),
    mutedForeground = Color(0xFFA8A39B),
    surface = Color(0xFF181818),
    accent = Color(0xFF2A2823),
    card = Color(0xFF181818),
    destructive = Color(0xFFFF6B6B),
    success = Color(0xFF4ED48F),
    warning = Color(0xFFFFC371),
    info = Color(0xFF6EA8FF),
    chart1 = Color(0xFFF5F0EB),
    chart2 = Color(0xFFFFC371),
    chart3 = Color(0xFF4ED48F),
    chart4 = Color(0xFFFF6B6B),
    chart5 = Color(0xFF6EA8FF),
    chart6 = Color(0xFFB593F4),
)

private val EveningTokens = Tokens(
    background = Color(red = 0.059f, green = 0.078f, blue = 0.141f),
    foreground = Color(red = 0.902f, green = 0.914f, blue = 0.957f),
    muted = Color(red = 0.149f, green = 0.180f, blue = 0.282f),
    mutedForeground = Color(red = 0.604f, green = 0.639f, blue = 0.761f),
    surface = Color(red = 0.102f, green = 0.129f, blue = 0.220f),
    accent = Color(red = 0.188f, green = 0.227f, blue = 0.353f),
    card = Color(red = 0.102f, green = 0.129f, blue = 0.220f),
    destructive = Color(red = 1.000f, green = 0.478f, blue = 0.522f),
    success = Color(red = 0.365f, green = 0.851f, blue = 0.690f),
    warning = Color(red = 1.000f, green = 0.776f, blue = 0.420f),
    info = Color(red = 0.494f, green = 0.714f, blue = 1.000f),
    chart1 = Color(red = 0.902f, green = 0.914f, blue = 0.957f),
    chart2 = Color(red = 0.494f, green = 0.714f, blue = 1.000f),
    chart3 = Color(red = 0.620f, green = 0.510f, blue = 0.961f),
    chart4 = Color(red = 0.388f, green = 0.443f, blue = 0.722f),
    chart5 = Color(red = 0.255f, green = 0.310f, blue = 0.510f),
    chart6 = Color(red = 0.169f, green = 0.208f, blue = 0.357f),
)

enum class AppThemeMode { System, Light, Dark, Evening }

val LocalTokens = compositionLocalOf { LightTokens }
val LocalThemeMode = compositionLocalOf { Light }

@Composable
fun SolvioTheme(
    mode: AppThemeMode = Light,
    content: @Composable () -> Unit,
) {
    val resolved = when (mode) {
        System -> if (isSystemInDarkTheme()) DarkTokens else LightTokens
        Light -> LightTokens
        Dark -> DarkTokens
        Evening -> EveningTokens
    }
    CompositionLocalProvider(
        LocalTokens provides resolved,
        LocalThemeMode provides mode,
    ) { content() }
}

object Theme {
    val tokens: Tokens
        @Composable get() = LocalTokens.current
}
