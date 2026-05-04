package com.programo.solvio.core.theme

import androidx.compose.material3.Typography
import androidx.compose.runtime.Composable
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp

/// Typography. iOS uses Inter + JetBrains Mono — Android falls back
/// to system SansSerif / Monospace by default (so the project builds
/// without needing TTF assets up front). To get pixel-identical output
/// to iOS, drop the Inter/JetBrainsMono ttf files into `res/font/` and
/// switch these `FontFamily` declarations to point at them — see the
/// README for the file-name convention. Weights match the iOS
/// `AppFont.*` API so call sites are 1:1.
val InterFamily: FontFamily = FontFamily.SansSerif
val MonoFamily: FontFamily = FontFamily.Monospace

object SolvioFonts {
    val regular: (Int) -> TextStyle = { TextStyle(fontFamily = InterFamily, fontWeight = FontWeight.Normal, fontSize = it.sp) }
    val medium: (Int) -> TextStyle = { TextStyle(fontFamily = InterFamily, fontWeight = FontWeight.Medium, fontSize = it.sp) }
    val semibold: (Int) -> TextStyle = { TextStyle(fontFamily = InterFamily, fontWeight = FontWeight.SemiBold, fontSize = it.sp) }
    val bold: (Int) -> TextStyle = { TextStyle(fontFamily = InterFamily, fontWeight = FontWeight.Bold, fontSize = it.sp) }
    val black: (Int) -> TextStyle = { TextStyle(fontFamily = InterFamily, fontWeight = FontWeight.Black, fontSize = it.sp) }
    val mono: (Int) -> TextStyle = { TextStyle(fontFamily = MonoFamily, fontWeight = FontWeight.Normal, fontSize = it.sp) }
    val monoBold: (Int) -> TextStyle = { TextStyle(fontFamily = MonoFamily, fontWeight = FontWeight.Bold, fontSize = it.sp) }

    // Semantic aliases — match iOS AppFont
    val eyebrow get() = mono(11)
    val caption get() = regular(12)
    val body get() = regular(14)
    val bodyMedium get() = medium(14)
    val sectionTitle get() = semibold(18)
    val cardTitle get() = bold(16)
    val pageTitle get() = black(28)
    val hero get() = black(36)
    val amount get() = monoBold(18)
    val amountLarge get() = monoBold(28)
    val button get() = semibold(14)
    val chip get() = monoBold(10)
}

@Composable
fun solvioTypography(): Typography = Typography(
    bodyLarge = SolvioFonts.body,
    bodyMedium = SolvioFonts.body,
    bodySmall = SolvioFonts.caption,
    titleLarge = SolvioFonts.pageTitle,
    titleMedium = SolvioFonts.sectionTitle,
    titleSmall = SolvioFonts.cardTitle,
    labelLarge = SolvioFonts.button,
    labelMedium = SolvioFonts.bodyMedium,
    labelSmall = SolvioFonts.eyebrow,
)
