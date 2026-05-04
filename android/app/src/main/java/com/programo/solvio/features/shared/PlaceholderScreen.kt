package com.programo.solvio.features.shared

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import com.programo.solvio.core.theme.LocalPalette
import com.programo.solvio.core.theme.SolvioFonts
import com.programo.solvio.core.theme.SolvioTheme
import com.programo.solvio.core.ui.NBCard
import com.programo.solvio.core.ui.NBEyebrow
import com.programo.solvio.core.ui.NBScreenHeader

/// Stub view for screens that ship structurally complete (navigation
/// works, theme applies) but whose detailed UI is being filled in over
/// successive sessions. Replaces a "TODO" comment with a clean,
/// branded "coming soon" tile so the app remains usable end-to-end.
@Composable
fun PlaceholderScreen(eyebrow: String, title: String, subtitle: String) {
    val palette = LocalPalette.current
    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(palette.background)
            .verticalScroll(rememberScrollState())
            .padding(SolvioTheme.Spacing.md),
        verticalArrangement = Arrangement.spacedBy(SolvioTheme.Spacing.md),
    ) {
        NBScreenHeader(eyebrow = eyebrow, title = title)
        NBCard(radius = SolvioTheme.Radius.md, shadow = SolvioTheme.Shadow.sm) {
            NBEyebrow(text = "COMING SOON", color = palette.mutedForeground)
            Text(subtitle, style = SolvioFonts.body.copy(color = palette.foreground))
        }
    }
}
