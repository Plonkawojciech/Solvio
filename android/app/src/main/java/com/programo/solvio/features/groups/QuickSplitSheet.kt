package com.programo.solvio.features.groups

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CheckBox
import androidx.compose.material.icons.filled.CheckBoxOutlineBlank
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.toMutableStateList
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import com.programo.solvio.LocalAppLocale
import com.programo.solvio.core.Fmt
import com.programo.solvio.core.models.Group
import com.programo.solvio.core.models.GroupMember
import com.programo.solvio.core.models.SplitCreate
import com.programo.solvio.core.models.SplitPortionInput
import com.programo.solvio.core.theme.LocalPalette
import com.programo.solvio.core.theme.SolvioFonts
import com.programo.solvio.core.theme.SolvioTheme
import com.programo.solvio.core.ui.NBPrimaryButton
import com.programo.solvio.core.ui.NBSecondaryButton
import com.programo.solvio.core.ui.NBTextField
import kotlin.math.abs
import kotlin.math.round

internal enum class SplitMode { Equal, Percent, Custom }

/// Modal bottom sheet — description + amount + paid-by chips + segmented
/// mode + multi-select members + sum validation + equal-mode preview.
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun QuickSplitSheet(
    group: Group,
    onDismiss: () -> Unit,
    onSubmit: (SplitCreate) -> Unit,
) {
    val palette = LocalPalette.current
    val locale = LocalAppLocale.current
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)

    val members = group.members.orEmpty()

    var desc by remember { mutableStateOf("") }
    var amount by remember { mutableStateOf("") }
    var currency by remember { mutableStateOf(group.currency) }
    var paidBy by remember { mutableStateOf(members.firstOrNull()?.id.orEmpty()) }
    var mode by remember { mutableStateOf(SplitMode.Equal) }
    val selected = remember { members.map { it.id }.toMutableStateList() }
    val customShare = remember { mutableStateMapOf<String, String>() }

    LaunchedEffect(group.id) {
        if (paidBy.isEmpty()) paidBy = members.firstOrNull()?.id.orEmpty()
        if (selected.isEmpty()) selected.addAll(members.map { it.id })
    }

    val parsedAmount = amount.replace(',', '.').toDoubleOrNull()
    val percentSum = if (mode == SplitMode.Percent) selected.sumOf { (customShare[it] ?: "").toDoubleOrNull() ?: 0.0 } else null
    val customSum = if (mode == SplitMode.Custom) selected.sumOf { (customShare[it] ?: "").toDoubleOrNull() ?: 0.0 } else null
    val isValid = run {
        val total = parsedAmount ?: return@run false
        if (total <= 0 || paidBy.isEmpty() || selected.isEmpty()) return@run false
        when (mode) {
            SplitMode.Equal -> true
            SplitMode.Percent -> percentSum != null && abs(percentSum - 100) < 0.01
            SplitMode.Custom -> customSum != null && abs(customSum - total) < 0.01
        }
    }

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = sheetState,
        containerColor = palette.background,
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = SolvioTheme.Spacing.md)
                .padding(bottom = SolvioTheme.Spacing.xl),
            verticalArrangement = Arrangement.spacedBy(SolvioTheme.Spacing.md),
        ) {
            Text(locale.t("quickSplit.title"), style = SolvioFonts.pageTitle.copy(color = palette.foreground))

            NBTextField(
                value = desc,
                onChange = { desc = it },
                label = locale.t("quickSplit.descriptionLabel"),
                placeholder = locale.t("quickSplit.descriptionPh"),
            )

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(SolvioTheme.Spacing.sm),
            ) {
                NBTextField(
                    value = amount,
                    onChange = { amount = it },
                    label = locale.t("quickSplit.amountLabel"),
                    placeholder = "0.00",
                    keyboardType = KeyboardType.Decimal,
                    modifier = Modifier.weight(1f),
                )
                Box(modifier = Modifier.width(110.dp)) {
                    NBTextField(
                        value = currency,
                        onChange = { currency = it.uppercase() },
                        label = locale.t("quickSplit.currencyLabel"),
                        placeholder = "PLN",
                    )
                }
            }

            // Paid by chips
            Column(verticalArrangement = Arrangement.spacedBy(SolvioTheme.Spacing.xxs)) {
                Text(locale.t("quickSplit.paidBy"), style = SolvioFonts.bodyMedium.copy(color = palette.foreground))
                Row(
                    modifier = Modifier.horizontalScroll(rememberScrollState()),
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    members.forEach { m ->
                        PayerChip(
                            member = m,
                            active = paidBy == m.id,
                            onClick = { paidBy = m.id },
                        )
                    }
                }
            }

            // Mode segmented
            Column(verticalArrangement = Arrangement.spacedBy(SolvioTheme.Spacing.xxs)) {
                Text(locale.t("quickSplit.splitMode"), style = SolvioFonts.bodyMedium.copy(color = palette.foreground))
                NBSegmented(
                    selected = mode.name,
                    options = listOf(
                        SplitMode.Equal.name to locale.t("quickSplit.modeEqual"),
                        SplitMode.Percent.name to locale.t("quickSplit.modePercent"),
                        SplitMode.Custom.name to locale.t("quickSplit.modeCustom"),
                    ),
                    onSelect = { mode = SplitMode.valueOf(it) },
                )
            }

            // Members picker
            Column(verticalArrangement = Arrangement.spacedBy(SolvioTheme.Spacing.xxs)) {
                Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        locale.t("quickSplit.splitBetween"),
                        style = SolvioFonts.bodyMedium.copy(color = palette.foreground),
                        modifier = Modifier.weight(1f),
                    )
                    val allSelected = selected.size == members.size
                    Box(
                        modifier = Modifier
                            .clickable {
                                if (allSelected) selected.clear()
                                else {
                                    selected.clear()
                                    selected.addAll(members.map { it.id })
                                }
                            }
                            .padding(4.dp),
                    ) {
                        Text(
                            if (allSelected) locale.t("quickSplit.clearAll") else locale.t("quickSplit.selectAll"),
                            style = SolvioFonts.mono(10).copy(color = palette.mutedForeground),
                        )
                    }
                }
                // Two-column member grid
                val rows = members.chunked(2)
                rows.forEach { row ->
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                    ) {
                        row.forEach { m ->
                            val on = m.id in selected
                            MemberChoiceTile(
                                member = m,
                                on = on,
                                onToggle = {
                                    if (on) selected.remove(m.id) else selected.add(m.id)
                                },
                                modifier = Modifier.weight(1f),
                            )
                        }
                        if (row.size == 1) Spacer(modifier = Modifier.weight(1f))
                    }
                }
            }

            // Custom shares or equal preview
            if (mode != SplitMode.Equal) {
                CustomSharesSection(
                    members = members.filter { it.id in selected },
                    mode = mode,
                    currency = currency,
                    customShare = customShare,
                    validation = customValidationMessage(
                        mode = mode,
                        percentSum = percentSum,
                        customSum = customSum,
                        total = parsedAmount,
                        currency = currency,
                        locale = locale,
                    ),
                )
            } else if (selected.isNotEmpty() && (parsedAmount ?: 0.0) > 0) {
                EqualPreview(total = parsedAmount!!, count = selected.size, currency = currency)
            }

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(SolvioTheme.Spacing.sm),
            ) {
                NBSecondaryButton(label = locale.t("common.cancel"), onClick = onDismiss, modifier = Modifier.weight(1f))
                NBPrimaryButton(
                    label = locale.t("common.save"),
                    enabled = isValid,
                    modifier = Modifier.weight(1f),
                    onClick = {
                        parsedAmount?.let { total ->
                            val selectedMembers = members.filter { it.id in selected }
                            val portions: List<SplitPortionInput> = when (mode) {
                                SplitMode.Equal -> {
                                    val each = round((total / selectedMembers.size) * 100) / 100
                                    selectedMembers.map {
                                        SplitPortionInput(memberId = it.id, amount = each, settled = it.id == paidBy)
                                    }
                                }
                                SplitMode.Percent -> selectedMembers.map { m ->
                                    val pct = (customShare[m.id] ?: "").toDoubleOrNull() ?: 0.0
                                    val portion = round((total * pct / 100) * 100) / 100
                                    SplitPortionInput(memberId = m.id, amount = portion, settled = m.id == paidBy)
                                }
                                SplitMode.Custom -> selectedMembers.map { m ->
                                    val portion = (customShare[m.id] ?: "").toDoubleOrNull() ?: 0.0
                                    SplitPortionInput(
                                        memberId = m.id,
                                        amount = round(portion * 100) / 100,
                                        settled = m.id == paidBy,
                                    )
                                }
                            }
                            onSubmit(
                                SplitCreate(
                                    groupId = group.id,
                                    paidByMemberId = paidBy,
                                    totalAmount = total,
                                    currency = currency.uppercase(),
                                    description = desc.takeIf { it.isNotBlank() },
                                    splits = portions,
                                    expenseId = null,
                                    receiptId = null,
                                ),
                            )
                        }
                    },
                )
            }
        }
    }
}

@Composable
private fun PayerChip(member: GroupMember, active: Boolean, onClick: () -> Unit) {
    val palette = LocalPalette.current
    Row(
        modifier = Modifier
            .clip(RoundedCornerShape(SolvioTheme.Radius.sm))
            .background(if (active) palette.foreground else palette.surface)
            .border(SolvioTheme.Border.widthThin, palette.border, RoundedCornerShape(SolvioTheme.Radius.sm))
            .clickable { onClick() }
            .padding(horizontal = 10.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        Box(
            modifier = Modifier
                .size(14.dp)
                .clip(CircleShape)
                .background(parseHexColor(member.color, palette.muted)),
        )
        Text(
            (member.name ?: member.displayName).uppercase(),
            style = SolvioFonts.mono(11).copy(
                color = if (active) palette.background else palette.foreground,
            ),
        )
    }
}

@Composable
private fun MemberChoiceTile(
    member: GroupMember,
    on: Boolean,
    onToggle: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val palette = LocalPalette.current
    Row(
        modifier = modifier
            .clip(RoundedCornerShape(SolvioTheme.Radius.sm))
            .background(if (on) palette.foreground else palette.surface)
            .border(SolvioTheme.Border.widthThin, palette.border, RoundedCornerShape(SolvioTheme.Radius.sm))
            .clickable { onToggle() }
            .padding(horizontal = 8.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        Icon(
            if (on) Icons.Filled.CheckBox else Icons.Filled.CheckBoxOutlineBlank,
            contentDescription = null,
            tint = if (on) palette.background else palette.foreground,
            modifier = Modifier.size(14.dp),
        )
        Text(
            member.name ?: member.displayName,
            style = SolvioFonts.caption.copy(
                color = if (on) palette.background else palette.foreground,
            ),
            maxLines = 1,
        )
    }
}

@Composable
private fun CustomSharesSection(
    members: List<GroupMember>,
    mode: SplitMode,
    currency: String,
    customShare: androidx.compose.runtime.snapshots.SnapshotStateMap<String, String>,
    validation: String?,
) {
    val palette = LocalPalette.current
    val locale = LocalAppLocale.current
    if (members.isEmpty()) return

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(SolvioTheme.Radius.sm))
            .background(palette.surface)
            .border(SolvioTheme.Border.widthThin, palette.border, RoundedCornerShape(SolvioTheme.Radius.sm))
            .padding(SolvioTheme.Spacing.sm),
        verticalArrangement = Arrangement.spacedBy(SolvioTheme.Spacing.xxs),
    ) {
        Text(
            if (mode == SplitMode.Percent) locale.t("quickSplit.percentages") else locale.t("quickSplit.customAmounts"),
            style = SolvioFonts.bodyMedium.copy(color = palette.foreground),
        )
        members.forEach { m ->
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                Box(
                    modifier = Modifier
                        .size(14.dp)
                        .clip(CircleShape)
                        .background(parseHexColor(m.color, palette.muted)),
                )
                Text(m.name ?: m.displayName, style = SolvioFonts.body.copy(color = palette.foreground), modifier = Modifier.weight(1f))
                OutlinedTextField(
                    value = customShare[m.id] ?: "",
                    onValueChange = { customShare[m.id] = it },
                    placeholder = { Text(if (mode == SplitMode.Percent) "0" else "0.00", style = SolvioFonts.body.copy(color = palette.mutedForeground)) },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                    textStyle = SolvioFonts.mono(13).copy(color = palette.foreground),
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedBorderColor = palette.foreground,
                        unfocusedBorderColor = palette.border,
                        focusedContainerColor = palette.surface,
                        unfocusedContainerColor = palette.surface,
                        focusedTextColor = palette.foreground,
                        unfocusedTextColor = palette.foreground,
                        cursorColor = palette.foreground,
                    ),
                    shape = RoundedCornerShape(SolvioTheme.Radius.sm),
                    modifier = Modifier.width(96.dp).height(48.dp),
                )
                Text(
                    if (mode == SplitMode.Percent) "%" else currency.uppercase(),
                    style = SolvioFonts.caption.copy(color = palette.mutedForeground),
                )
            }
        }
        if (validation != null) {
            Text(validation, style = SolvioFonts.caption.copy(color = palette.destructive))
        }
    }
}

@Composable
private fun EqualPreview(total: Double, count: Int, currency: String) {
    val palette = LocalPalette.current
    val locale = LocalAppLocale.current
    val each = total / count.coerceAtLeast(1)
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(SolvioTheme.Radius.sm))
            .background(palette.surface)
            .border(SolvioTheme.Border.widthThin, palette.border, RoundedCornerShape(SolvioTheme.Radius.sm))
            .padding(SolvioTheme.Spacing.sm),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(locale.t("quickSplit.eachPays"), style = SolvioFonts.caption.copy(color = palette.mutedForeground), modifier = Modifier.weight(1f))
        Text(Fmt.amount(each, currency.uppercase()), style = SolvioFonts.mono(13).copy(color = palette.foreground))
    }
}

private fun customValidationMessage(
    mode: SplitMode,
    percentSum: Double?,
    customSum: Double?,
    total: Double?,
    currency: String,
    locale: com.programo.solvio.core.AppLocale,
): String? = when (mode) {
    SplitMode.Percent -> percentSum?.let { sum ->
        if (abs(sum - 100) >= 0.01) locale.t("quickSplit.mustSum100").replace("%@", String.format("%.1f", sum))
        else null
    }
    SplitMode.Custom -> {
        if (total != null && customSum != null && abs(customSum - total) >= 0.01) {
            locale.t("quickSplit.sharesMustSum").replace("%@", Fmt.amount(total, currency))
        } else null
    }
    SplitMode.Equal -> null
}
