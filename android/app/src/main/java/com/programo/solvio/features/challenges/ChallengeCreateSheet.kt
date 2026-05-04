package com.programo.solvio.features.challenges

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
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
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import com.programo.solvio.LocalAppLocale
import com.programo.solvio.core.models.ChallengeCreate
import com.programo.solvio.core.theme.LocalPalette
import com.programo.solvio.core.theme.SolvioFonts
import com.programo.solvio.core.theme.SolvioTheme
import com.programo.solvio.core.ui.NBPrimaryButton
import com.programo.solvio.core.ui.NBSecondaryButton
import com.programo.solvio.core.ui.NBTextField
import java.time.LocalDate

/// Bottom-sheet form for creating a new challenge — mirrors iOS
/// `ChallengeCreateSheet`. Emoji grid + type picker + dates + targetAmount
/// + targetCategory.
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ChallengeCreateSheet(
    onDismiss: () -> Unit,
    onSubmit: (ChallengeCreate) -> Unit,
) {
    val palette = LocalPalette.current
    val locale = LocalAppLocale.current
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)

    var name by remember { mutableStateOf("") }
    var emoji by remember { mutableStateOf("💪") }
    var type by remember { mutableStateOf("no_spend") }
    var targetCategory by remember { mutableStateOf("") }
    var targetAmount by remember { mutableStateOf("") }
    var startDate by remember { mutableStateOf(LocalDate.now().toString()) }
    var endDate by remember { mutableStateOf(LocalDate.now().plusMonths(1).toString()) }

    val emojiChoices = listOf("🏆", "🎯", "💪", "🔥", "⭐", "💎", "🚀", "🎁")
    val typeChoices = listOf(
        "no_spend" to locale.t("challenges.typeNoSpend"),
        "budget_cap" to locale.t("challenges.typeBudget"),
        "savings" to locale.t("challenges.typeSavings"),
        "streak" to locale.t("challenges.typeStreak"),
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
            Text(locale.t("challenges.new"), style = SolvioFonts.sectionTitle.copy(color = palette.foreground))

            NBTextField(
                value = name,
                onChange = { name = it },
                label = locale.t("challenges.nameLabel"),
                placeholder = locale.t("challenges.namePh"),
            )

            Text(locale.t("challenges.emojiLabel"), style = SolvioFonts.bodyMedium.copy(color = palette.foreground))
            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                emojiChoices.chunked(8).forEach { row ->
                    Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        row.forEach { e ->
                            val selected = emoji == e
                            Box(
                                modifier = Modifier
                                    .size(44.dp)
                                    .clip(RoundedCornerShape(SolvioTheme.Radius.sm))
                                    .background(if (selected) palette.foreground else palette.muted)
                                    .border(SolvioTheme.Border.widthThin, palette.border, RoundedCornerShape(SolvioTheme.Radius.sm))
                                    .clickable { emoji = e },
                                contentAlignment = Alignment.Center,
                            ) { Text(e, style = SolvioFonts.bold(20)) }
                        }
                    }
                }
            }

            Text(locale.t("challenges.typeLabel"), style = SolvioFonts.bodyMedium.copy(color = palette.foreground))
            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                typeChoices.chunked(2).forEach { row ->
                    Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        row.forEach { (id, label) ->
                            val selected = type == id
                            Box(
                                modifier = Modifier
                                    .weight(1f)
                                    .clip(RoundedCornerShape(SolvioTheme.Radius.sm))
                                    .background(if (selected) palette.foreground else palette.muted)
                                    .border(SolvioTheme.Border.widthThin, palette.border, RoundedCornerShape(SolvioTheme.Radius.sm))
                                    .clickable { type = id }
                                    .padding(horizontal = 10.dp, vertical = 8.dp),
                                contentAlignment = Alignment.Center,
                            ) {
                                Text(
                                    label,
                                    style = SolvioFonts.caption.copy(color = if (selected) palette.background else palette.foreground),
                                )
                            }
                        }
                    }
                }
            }

            NBTextField(
                value = targetCategory,
                onChange = { targetCategory = it },
                label = locale.t("challenges.categoryLabel"),
                placeholder = "Food",
            )
            NBTextField(
                value = targetAmount,
                onChange = { targetAmount = it },
                label = locale.t("challenges.targetLabel"),
                placeholder = "0.00",
                keyboardType = KeyboardType.Decimal,
            )
            NBTextField(
                value = startDate,
                onChange = { startDate = it },
                label = locale.t("challenges.startDate"),
                placeholder = "2026-01-01",
            )
            NBTextField(
                value = endDate,
                onChange = { endDate = it },
                label = locale.t("challenges.endDate"),
                placeholder = "2026-12-31",
            )

            Spacer(Modifier.height(SolvioTheme.Spacing.xs))
            Row(horizontalArrangement = Arrangement.spacedBy(SolvioTheme.Spacing.sm)) {
                NBSecondaryButton(label = locale.t("common.cancel"), onClick = onDismiss, modifier = Modifier.weight(1f))
                NBPrimaryButton(
                    label = locale.t("common.save"),
                    enabled = name.isNotBlank() && startDate.length >= 10 && endDate.length >= 10,
                    onClick = {
                        val amount = targetAmount.replace(',', '.').toDoubleOrNull()
                        onSubmit(
                            ChallengeCreate(
                                name = name.trim(),
                                emoji = emoji,
                                type = type,
                                targetCategory = targetCategory.ifBlank { null },
                                targetAmount = amount,
                                startDate = startDate.take(10),
                                endDate = endDate.take(10),
                            )
                        )
                    },
                    modifier = Modifier.weight(1f),
                )
            }
            Spacer(Modifier.height(SolvioTheme.Spacing.lg))
        }
    }
}
