package com.programo.solvio.features.goals

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
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
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import com.programo.solvio.LocalAppLocale
import com.programo.solvio.core.Fmt
import com.programo.solvio.core.models.SavingsGoal
import com.programo.solvio.core.theme.LocalPalette
import com.programo.solvio.core.theme.SolvioFonts
import com.programo.solvio.core.theme.SolvioTheme
import com.programo.solvio.core.ui.NBCard
import com.programo.solvio.core.ui.NBPrimaryButton
import com.programo.solvio.core.ui.NBSecondaryButton
import com.programo.solvio.core.ui.NBTextField

/// Bottom-sheet for adding a deposit to a goal — mirrors the iOS
/// `DepositSheet`. Header shows goal emoji + name + current/target.
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DepositSheet(
    goal: SavingsGoal,
    onDismiss: () -> Unit,
    onSubmit: (amount: Double, note: String?) -> Unit,
) {
    val palette = LocalPalette.current
    val locale = LocalAppLocale.current
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)

    var amount by remember { mutableStateOf("") }
    var note by remember { mutableStateOf("") }

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
                locale.t("goals.addFundsTitle"),
                style = SolvioFonts.sectionTitle.copy(color = palette.foreground),
            )

            NBCard(radius = SolvioTheme.Radius.md, shadow = SolvioTheme.Shadow.sm) {
                Row(
                    horizontalArrangement = Arrangement.spacedBy(SolvioTheme.Spacing.sm),
                    verticalAlignment = androidx.compose.ui.Alignment.CenterVertically,
                ) {
                    Text(goal.emoji ?: "🎯", style = SolvioFonts.bold(28))
                    Column {
                        Text(goal.name, style = SolvioFonts.cardTitle.copy(color = palette.foreground))
                        Text(
                            "${Fmt.amount(goal.currentAmount.toDouble(), goal.currency)} / ${Fmt.amount(goal.targetAmount.toDouble(), goal.currency)}",
                            style = SolvioFonts.caption.copy(color = palette.mutedForeground),
                        )
                    }
                }
            }

            NBTextField(value = amount, onChange = { amount = it }, label = locale.t("goals.amountLabel"), placeholder = "0.00", keyboardType = KeyboardType.Decimal)
            NBTextField(value = note, onChange = { note = it }, label = locale.t("goals.noteLabel"), placeholder = locale.t("goals.notePh"))

            Spacer(Modifier.height(SolvioTheme.Spacing.xs))
            Row(horizontalArrangement = Arrangement.spacedBy(SolvioTheme.Spacing.sm)) {
                NBSecondaryButton(label = locale.t("common.cancel"), onClick = onDismiss, modifier = Modifier.weight(1f))
                NBPrimaryButton(
                    label = locale.t("common.save"),
                    enabled = amount.replace(',', '.').toDoubleOrNull() != null,
                    onClick = {
                        val v = amount.replace(',', '.').toDoubleOrNull() ?: return@NBPrimaryButton
                        onSubmit(v, note.ifBlank { null })
                    },
                    modifier = Modifier.weight(1f),
                )
            }
            Spacer(Modifier.height(SolvioTheme.Spacing.lg))
        }
    }
}
