package com.programo.solvio.core.theme

import androidx.compose.runtime.Immutable
import androidx.compose.ui.graphics.Color

/// Complete Solvio color palette for one theme variant. Mirrors the
/// iOS asset-catalog colorsets + ThemePalette.evening from
/// `native-ios/Solvio/Core/Theme/Theme.swift`.
@Immutable
data class Palette(
    val background: Color,
    val foreground: Color,
    val surface: Color,
    val muted: Color,
    val mutedForeground: Color,
    val accent: Color,
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
    /// Card / button border. Light: foreground (neobrutalism black);
    /// dark: white 10%; evening: bluish hairline 22%.
    val border: Color,
    /// Hard-shadow tint. Light: foreground; dark: black 55%; evening: deep navy 65%.
    val shadow: Color,
) {
    companion object {
        /// Cream + black neobrutalism — matches PWA `app/globals.css`.
        val Light = Palette(
            background = Color(0xFFF5F0EB),
            foreground = Color(0xFF1A1A1A),
            surface = Color(0xFFFFFFFF),
            muted = Color(0xFFE9E5E1),
            mutedForeground = Color(0xFF595959),
            accent = Color(0xFFE2DDD9),
            destructive = Color(0xFFEF4444),
            success = Color(0xFF10B981),
            warning = Color(0xFFF59E0B),
            info = Color(0xFF3B82F6),
            chart1 = Color(0xFF1A1A1A),
            chart2 = Color(0xFF474747),
            chart3 = Color(0xFF737373),
            chart4 = Color(0xFF999999),
            chart5 = Color(0xFFBFBFBF),
            chart6 = Color(0xFFDED9D4),
            border = Color(0xFF1A1A1A),
            shadow = Color(0xFF1A1A1A),
        )

        /// Refined dark — Linear/Vercel-feeling neutrals (not pure black).
        val Dark = Palette(
            background = Color(0xFF0A0D12),
            foreground = Color(0xFFE8EAED),
            surface = Color(0xFF13171D),
            muted = Color(0xFF1C2129),
            mutedForeground = Color(0xFFA4ADB6),
            accent = Color(0xFF252B35),
            destructive = Color(0xFFFF5E5E),
            success = Color(0xFF4ADE80),
            warning = Color(0xFFFBBF24),
            info = Color(0xFF60A5FA),
            chart1 = Color(0xFFE8EAED),
            chart2 = Color(0xFFA4BBDE),
            chart3 = Color(0xFF708FB6),
            chart4 = Color(0xFF4C678E),
            chart5 = Color(0xFF324665),
            chart6 = Color(0xFF232F41),
            // Soft hairline + deep soft shadow so dark mode doesn't get
            // screaming-white outlines or glowing offsets.
            border = Color(0x1AFFFFFF),
            shadow = Color(0x8C000000),
        )

        /// "Wieczorny" — warm-bluish dark variant. Reading mode for late evening.
        val Evening = Palette(
            background = Color(0xFF0F1424),
            foreground = Color(0xFFE6E9F4),
            surface = Color(0xFF1A2138),
            muted = Color(0xFF262E48),
            mutedForeground = Color(0xFF9AA3C2),
            accent = Color(0xFF303A5A),
            destructive = Color(0xFFFF7A85),
            success = Color(0xFF5DD9B0),
            warning = Color(0xFFFFC66B),
            info = Color(0xFF7EB6FF),
            chart1 = Color(0xFFE6E9F4),
            chart2 = Color(0xFF7EB6FF),
            chart3 = Color(0xFF9E82F5),
            chart4 = Color(0xFF6371B8),
            chart5 = Color(0xFF414F82),
            chart6 = Color(0xFF2B355B),
            border = Color(0x387E8AB4),
            shadow = Color(0xA6060A14),
        )
    }
}
