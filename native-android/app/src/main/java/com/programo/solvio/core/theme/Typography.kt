package com.programo.solvio.core.theme

import androidx.compose.runtime.Composable
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp
import com.programo.solvio.core.theme.Fonts.Inter
import com.programo.solvio.core.theme.Fonts.JetBrainsMono

/**
 * Mirror of iOS [AppFont]. Inter for body, JetBrains Mono for eyebrows.
 * Inter falls back to Roboto if the bundled fonts aren't present.
 */
object AppFont {
    fun regular(size: Int): TextStyle =
        TextStyle(fontFamily = Inter, fontWeight = FontWeight.Normal, fontSize = size.sp)

    fun medium(size: Int): TextStyle =
        TextStyle(fontFamily = Inter, fontWeight = FontWeight.Medium, fontSize = size.sp)

    fun semibold(size: Int): TextStyle =
        TextStyle(fontFamily = Inter, fontWeight = FontWeight.SemiBold, fontSize = size.sp)

    fun bold(size: Int): TextStyle =
        TextStyle(fontFamily = Inter, fontWeight = FontWeight.Bold, fontSize = size.sp)

    fun black(size: Int): TextStyle =
        TextStyle(fontFamily = Inter, fontWeight = FontWeight.Black, fontSize = size.sp)

    fun mono(size: Int): TextStyle =
        TextStyle(fontFamily = JetBrainsMono, fontWeight = FontWeight.Normal, fontSize = size.sp)

    fun monoBold(size: Int): TextStyle =
        TextStyle(fontFamily = JetBrainsMono, fontWeight = FontWeight.Bold, fontSize = size.sp)

    val eyebrow: TextStyle get() = mono(11)
    val caption: TextStyle get() = regular(12)
    val body: TextStyle get() = regular(14)
    val bodyMedium: TextStyle get() = medium(14)
    val sectionTitle: TextStyle get() = semibold(18)
    val cardTitle: TextStyle get() = bold(16)
    val pageTitle: TextStyle get() = black(28)
    val hero: TextStyle get() = black(36)
    val amount: TextStyle get() = monoBold(18)
    val amountLarge: TextStyle get() = monoBold(28)
    val button: TextStyle get() = semibold(14)
    val chip: TextStyle get() = monoBold(10)
}

/** Bundled font families. We don't ship the .ttf files yet, so fall back
 *  to the platform default (Roboto). When `Inter-*.ttf` files are dropped
 *  into `res/font/`, swap the fallback for the real family. */
object Fonts {
    val Inter: FontFamily = FontFamily.Default
    val JetBrainsMono: FontFamily = FontFamily.Monospace
}
