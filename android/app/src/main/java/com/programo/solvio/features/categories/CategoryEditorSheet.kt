package com.programo.solvio.features.categories

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import com.programo.solvio.LocalAppLocale
import com.programo.solvio.core.models.Category
import com.programo.solvio.core.theme.LocalPalette
import com.programo.solvio.core.theme.SolvioFonts
import com.programo.solvio.core.theme.SolvioTheme
import com.programo.solvio.core.ui.NBPrimaryButton
import com.programo.solvio.core.ui.NBSecondaryButton
import com.programo.solvio.core.ui.NBTextField

/// Bottom-sheet form for category create/edit. iOS variant ships only
/// name + icon; Android adds an emoji icon picker plus a 7-color swatch
/// palette mirroring the loyalty palette so the form is friendlier to
/// users who don't type emoji.
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CategoryEditorSheet(
    initial: Category?,
    onDismiss: () -> Unit,
    onSubmit: (name: String, icon: String?, color: String?) -> Unit,
) {
    val palette = LocalPalette.current
    val locale = LocalAppLocale.current
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)

    var name by remember { mutableStateOf(initial?.name.orEmpty()) }
    var icon by remember { mutableStateOf(initial?.icon.orEmpty()) }
    var colorHex by remember { mutableStateOf(initial?.color.orEmpty()) }

    val iconChoices = listOf("🍕", "🛒", "☕", "🚗", "🏠", "💊", "📚", "🎮", "👕", "✈️", "🎬", "💡", "🐾", "🍔", "💪")
    val colorChoices = listOf(
        "#ef4444" to "Red",
        "#f59e0b" to "Amber",
        "#10b981" to "Emerald",
        "#0ea5e9" to "Sky",
        "#8b5cf6" to "Violet",
        "#ec4899" to "Pink",
        "#475569" to "Slate",
    )

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = sheetState,
        containerColor = palette.background,
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .verticalScroll(rememberScrollState())
                .padding(SolvioTheme.Spacing.md),
            verticalArrangement = Arrangement.spacedBy(SolvioTheme.Spacing.sm),
        ) {
            Text(
                if (initial == null) locale.t("categories.new") else locale.t("categories.editTitle"),
                style = SolvioFonts.sectionTitle.copy(color = palette.foreground),
            )

            NBTextField(
                value = name,
                onChange = { name = it },
                label = locale.t("categories.name"),
                placeholder = locale.t("categories.namePlaceholder"),
            )

            Text(locale.t("categories.iconLabel"), style = SolvioFonts.bodyMedium.copy(color = palette.foreground))
            NBTextField(
                value = icon,
                onChange = { icon = it },
                placeholder = locale.t("categories.iconPlaceholder"),
            )
            // Icon picker grid
            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                iconChoices.chunked(8).forEach { row ->
                    Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        row.forEach { e ->
                            val selected = icon == e
                            Box(
                                modifier = Modifier
                                    .size(40.dp)
                                    .clip(RoundedCornerShape(SolvioTheme.Radius.sm))
                                    .background(if (selected) palette.foreground else palette.muted)
                                    .border(SolvioTheme.Border.widthThin, palette.border, RoundedCornerShape(SolvioTheme.Radius.sm))
                                    .clickable { icon = e },
                                contentAlignment = Alignment.Center,
                            ) { Text(e, style = SolvioFonts.bold(20)) }
                        }
                    }
                }
            }

            Text(locale.t("categories.color"), style = SolvioFonts.bodyMedium.copy(color = palette.foreground))
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                // "no color" swatch
                Box(
                    modifier = Modifier
                        .size(28.dp)
                        .clip(CircleShape)
                        .background(palette.muted)
                        .border(
                            if (colorHex.isBlank()) SolvioTheme.Border.width else SolvioTheme.Border.widthThin,
                            palette.foreground, CircleShape,
                        )
                        .clickable { colorHex = "" },
                    contentAlignment = Alignment.Center,
                ) { Text("∅", style = SolvioFonts.mono(11).copy(color = palette.foreground)) }
                colorChoices.forEach { (hex, _) ->
                    val color = parseHex(hex)
                    val selected = colorHex.equals(hex, ignoreCase = true)
                    Box(
                        modifier = Modifier
                            .size(28.dp)
                            .clip(CircleShape)
                            .background(color)
                            .border(
                                if (selected) SolvioTheme.Border.width else SolvioTheme.Border.widthThin,
                                palette.foreground, CircleShape,
                            )
                            .clickable { colorHex = hex },
                    )
                }
            }

            if (icon.isNotBlank()) {
                Spacer(Modifier.height(SolvioTheme.Spacing.xs))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(locale.t("categories.preview"), style = SolvioFonts.caption.copy(color = palette.mutedForeground))
                    Spacer(Modifier.weight(1f))
                    Box(
                        modifier = Modifier
                            .size(40.dp)
                            .clip(RoundedCornerShape(SolvioTheme.Radius.sm))
                            .background(if (colorHex.isNotBlank()) parseHex(colorHex).copy(alpha = 0.18f) else palette.muted)
                            .border(SolvioTheme.Border.widthThin, palette.border, RoundedCornerShape(SolvioTheme.Radius.sm)),
                        contentAlignment = Alignment.Center,
                    ) { Text(icon, style = SolvioFonts.bold(22)) }
                }
            }

            Spacer(Modifier.height(SolvioTheme.Spacing.xs))
            Row(horizontalArrangement = Arrangement.spacedBy(SolvioTheme.Spacing.sm)) {
                NBSecondaryButton(label = locale.t("common.cancel"), onClick = onDismiss, modifier = Modifier.weight(1f))
                NBPrimaryButton(
                    label = locale.t("common.save"),
                    enabled = name.isNotBlank(),
                    onClick = {
                        onSubmit(
                            name.trim(),
                            icon.ifBlank { null },
                            colorHex.ifBlank { null },
                        )
                    },
                    modifier = Modifier.weight(1f),
                )
            }
            Spacer(Modifier.height(SolvioTheme.Spacing.lg))
        }
    }
}

private fun parseHex(hex: String): Color {
    var s = hex.trim()
    if (s.startsWith("#")) s = s.drop(1)
    if (s.length != 6) return Color.Gray
    val v = runCatching { s.toLong(radix = 16) }.getOrNull() ?: return Color.Gray
    val r = ((v shr 16) and 0xFF) / 255f
    val g = ((v shr 8) and 0xFF) / 255f
    val b = (v and 0xFF) / 255f
    return Color(r, g, b)
}
