package com.programo.solvio.features.goals

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import com.programo.solvio.LocalAppLocale
import com.programo.solvio.core.models.GoalCreate
import com.programo.solvio.core.theme.LocalPalette
import com.programo.solvio.core.theme.SolvioFonts
import com.programo.solvio.core.theme.SolvioTheme
import com.programo.solvio.core.ui.NBPrimaryButton
import com.programo.solvio.core.ui.NBSecondaryButton
import com.programo.solvio.core.ui.NBTextField

/// Bottom-sheet form for creating a new savings goal — mirrors the iOS
/// `GoalCreateSheet`. Tapping a category chip pre-fills the emoji.
@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
fun GoalCreateSheet(
    onDismiss: () -> Unit,
    onSubmit: (GoalCreate) -> Unit,
) {
    val palette = LocalPalette.current
    val locale = LocalAppLocale.current
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)

    var name by remember { mutableStateOf("") }
    var target by remember { mutableStateOf("") }
    var currency by remember { mutableStateOf("PLN") }
    var emoji by remember { mutableStateOf("🎯") }
    var category by remember { mutableStateOf("vacation") }
    var hasDeadline by remember { mutableStateOf(false) }
    var deadlineRaw by remember { mutableStateOf("") }

    val categoryChoices = listOf(
        Triple("vacation", "🏖️", "Wakacje"),
        Triple("car", "🚗", "Samochód"),
        Triple("electronics", "💻", "Elektronika"),
        Triple("home", "🏠", "Dom"),
        Triple("emergency", "🛡️", "Awaria"),
        Triple("education", "🎓", "Nauka"),
        Triple("wedding", "💍", "Ślub"),
        Triple("other", "🎯", "Inne"),
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
            Text(locale.t("goals.newTitle"), style = SolvioFonts.sectionTitle.copy(color = palette.foreground))
            NBTextField(value = name, onChange = { name = it }, label = locale.t("goals.nameLabel"), placeholder = locale.t("goals.namePh"))
            NBTextField(value = target, onChange = { target = it }, label = locale.t("goals.targetLabel"), placeholder = locale.t("goals.targetPh"), keyboardType = KeyboardType.Decimal)
            NBTextField(value = currency, onChange = { currency = it.uppercase() }, label = locale.t("goals.currencyLabel"), placeholder = "PLN")
            NBTextField(value = emoji, onChange = { emoji = it }, label = locale.t("goals.emojiLabel"), placeholder = "🎯")

            Text(locale.t("goals.categoryLabel"), style = SolvioFonts.bodyMedium.copy(color = palette.foreground))
            FlowRow(
                horizontalArrangement = Arrangement.spacedBy(6.dp),
                verticalArrangement = Arrangement.spacedBy(6.dp),
                modifier = Modifier.fillMaxWidth(),
            ) {
                categoryChoices.forEach { (id, e, label) ->
                    val selected = category == id
                    Row(
                        modifier = Modifier
                            .clip(RoundedCornerShape(SolvioTheme.Radius.sm))
                            .background(if (selected) palette.foreground else palette.muted)
                            .border(SolvioTheme.Border.widthThin, palette.border, RoundedCornerShape(SolvioTheme.Radius.sm))
                            .clickable {
                                category = id
                                emoji = e
                            }
                            .padding(horizontal = 8.dp, vertical = 6.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text(e, style = SolvioFonts.body)
                        Spacer(Modifier.width(4.dp))
                        Text(label, style = SolvioFonts.caption.copy(color = if (selected) palette.background else palette.foreground))
                    }
                }
            }

            Row(
                modifier = Modifier
                    .clip(RoundedCornerShape(SolvioTheme.Radius.sm))
                    .background(if (hasDeadline) palette.foreground else palette.muted)
                    .border(SolvioTheme.Border.widthThin, palette.border, RoundedCornerShape(SolvioTheme.Radius.sm))
                    .clickable { hasDeadline = !hasDeadline }
                    .padding(horizontal = 10.dp, vertical = 6.dp),
            ) {
                Text(
                    if (hasDeadline) "✓ ${locale.t("goals.hasDeadline")}" else locale.t("goals.hasDeadline"),
                    style = SolvioFonts.caption.copy(color = if (hasDeadline) palette.background else palette.foreground),
                )
            }
            if (hasDeadline) {
                NBTextField(value = deadlineRaw, onChange = { deadlineRaw = it }, label = locale.t("goals.deadlineLabel"), placeholder = "2026-12-31")
            }

            Spacer(Modifier.height(SolvioTheme.Spacing.xs))
            Row(horizontalArrangement = Arrangement.spacedBy(SolvioTheme.Spacing.sm)) {
                NBSecondaryButton(label = locale.t("common.cancel"), onClick = onDismiss, modifier = Modifier.weight(1f))
                NBPrimaryButton(
                    label = locale.t("common.save"),
                    enabled = name.isNotBlank() && target.replace(',', '.').toDoubleOrNull() != null,
                    onClick = {
                        val amount = target.replace(',', '.').toDoubleOrNull() ?: return@NBPrimaryButton
                        onSubmit(
                            GoalCreate(
                                name = name.trim(),
                                emoji = emoji.ifBlank { null },
                                targetAmount = amount,
                                deadline = if (hasDeadline && deadlineRaw.length >= 10) deadlineRaw.take(10) else null,
                                priority = "medium",
                                color = null,
                                category = category,
                                currency = currency.ifBlank { "PLN" }.uppercase(),
                                lang = null,
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
