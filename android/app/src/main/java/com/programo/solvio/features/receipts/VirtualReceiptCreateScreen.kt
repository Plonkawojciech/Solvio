package com.programo.solvio.features.receipts

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material3.Icon
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import com.programo.solvio.LocalAppLocale
import com.programo.solvio.LocalToast
import com.programo.solvio.core.Fmt
import com.programo.solvio.core.models.MoneyString
import com.programo.solvio.core.models.Receipt
import com.programo.solvio.core.models.ReceiptCreate
import com.programo.solvio.core.models.ReceiptItem
import com.programo.solvio.core.network.ReceiptsRepo
import com.programo.solvio.core.theme.LocalPalette
import com.programo.solvio.core.theme.SolvioFonts
import com.programo.solvio.core.theme.SolvioTheme
import com.programo.solvio.core.theme.nbCard
import com.programo.solvio.core.ui.NBEyebrow
import com.programo.solvio.core.ui.NBPrimaryButton
import com.programo.solvio.core.ui.NBSecondaryButton
import com.programo.solvio.core.ui.NBTextField
import kotlinx.coroutines.launch
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.util.UUID

private data class EditableItem(
    val id: String = UUID.randomUUID().toString(),
    var name: String = "",
    var qty: String = "",
    var price: String = "",
)

private fun EditableItem.lineTotal(): Double {
    val q = qty.replace(',', '.').toDoubleOrNull() ?: 1.0
    val p = price.replace(',', '.').toDoubleOrNull() ?: 0.0
    return q * p
}

private fun EditableItem.toReceiptItem(): ReceiptItem? {
    val trimmed = name.trim()
    if (trimmed.isEmpty()) return null
    val q = qty.replace(',', '.').toDoubleOrNull()
    val p = price.replace(',', '.').toDoubleOrNull()
    return ReceiptItem(
        id = null,
        name = trimmed,
        nameTranslated = null,
        quantity = q,
        price = p?.let { MoneyString(it.toString()) },
        unitPrice = p?.let { MoneyString(it.toString()) },
        totalPrice = p?.let { MoneyString((it * (q ?: 1.0)).toString()) },
        categoryId = null,
    )
}

@Composable
fun VirtualReceiptCreateScreen(
    onCreated: (Receipt) -> Unit,
    onCancel: () -> Unit,
) {
    val palette = LocalPalette.current
    val locale = LocalAppLocale.current
    val toast = LocalToast.current
    val scope = rememberCoroutineScope()

    var vendor by remember { mutableStateOf("") }
    var dateText by remember { mutableStateOf(LocalDate.now().toString()) } // YYYY-MM-DD
    var currency by remember { mutableStateOf("PLN") }
    var notes by remember { mutableStateOf("") }
    var useCustomTotal by remember { mutableStateOf(false) }
    var customTotal by remember { mutableStateOf("") }
    val items = remember { mutableStateListOf(EditableItem()) }
    var isSaving by remember { mutableStateOf(false) }
    var didTryToSave by remember { mutableStateOf(false) }

    val itemsTotal = items.sumOf { it.lineTotal() }
    val effectiveTotal = if (useCustomTotal) {
        customTotal.replace(',', '.').toDoubleOrNull() ?: itemsTotal
    } else itemsTotal

    val canSave = vendor.trim().isNotEmpty() &&
        (items.any { it.toReceiptItem() != null } || effectiveTotal > 0)

    LazyColumn(
        modifier = Modifier.fillMaxSize().background(palette.background),
        contentPadding = PaddingValues(SolvioTheme.Spacing.md),
        verticalArrangement = Arrangement.spacedBy(SolvioTheme.Spacing.md),
    ) {
        item {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(
                    modifier = Modifier
                        .clickable { onCancel() }
                        .padding(end = SolvioTheme.Spacing.sm),
                ) {
                    Text(locale.t("common.cancel"), style = SolvioFonts.button.copy(color = palette.foreground))
                }
                Spacer(Modifier.weight(1f))
                Text(
                    locale.t("virtualReceipt.title"),
                    style = SolvioFonts.sectionTitle.copy(color = palette.foreground),
                )
                Spacer(Modifier.weight(1f))
                Spacer(Modifier.width(56.dp))
            }
        }

        item {
            NBTextField(
                value = vendor,
                onChange = { vendor = it },
                label = locale.t("virtualReceipt.vendor"),
                placeholder = locale.t("virtualReceipt.vendorPh"),
            )
            if (didTryToSave && vendor.trim().isEmpty()) {
                Text(
                    locale.t("validation.vendorRequired"),
                    style = SolvioFonts.caption.copy(color = palette.destructive),
                    modifier = Modifier.padding(top = 4.dp),
                )
            }
        }

        item {
            // Date — text-based YYYY-MM-DD field. TODO: Compose date picker dialog for proper UX.
            NBTextField(
                value = dateText,
                onChange = { dateText = it },
                label = locale.t("virtualReceipt.dateLabel"),
                placeholder = "2026-04-23",
            )
        }

        item {
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(SolvioTheme.Spacing.sm)) {
                NBTextField(
                    value = currency,
                    onChange = { currency = it.uppercase() },
                    label = locale.t("virtualReceipt.currency"),
                    placeholder = locale.t("virtualReceipt.currencyPh"),
                    modifier = Modifier.width(160.dp),
                )
            }
        }

        // Items section header + add button
        item {
            Row(verticalAlignment = Alignment.CenterVertically) {
                NBEyebrow(text = locale.t("virtualReceipt.itemsTitle"))
                Spacer(Modifier.weight(1f))
                Row(
                    modifier = Modifier
                        .clip(RoundedCornerShape(SolvioTheme.Radius.sm))
                        .background(palette.muted)
                        .border(SolvioTheme.Border.widthThin, palette.border, RoundedCornerShape(SolvioTheme.Radius.sm))
                        .clickable { items.add(EditableItem()) }
                        .padding(horizontal = 8.dp, vertical = 6.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Icon(Icons.Filled.Add, contentDescription = null, tint = palette.foreground, modifier = Modifier.size(14.dp))
                    Spacer(Modifier.width(4.dp))
                    Text(locale.t("virtualReceipt.addItem"), style = SolvioFonts.mono(11).copy(color = palette.foreground))
                }
            }
        }

        items.forEachIndexed { idx, item ->
            item(key = item.id) {
                EditableItemRow(
                    item = item,
                    currency = currency,
                    canDelete = items.size > 1,
                    onChange = { updated -> items[idx] = updated },
                    onDelete = { items.removeAt(idx) },
                )
            }
        }

        // Total section
        item {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .nbCard(palette, radius = SolvioTheme.Radius.md, shadow = SolvioTheme.Shadow.sm)
                    .padding(SolvioTheme.Spacing.sm),
                verticalArrangement = Arrangement.spacedBy(SolvioTheme.Spacing.xs),
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    NBEyebrow(text = locale.t("virtualReceipt.totalTitle"))
                    Spacer(Modifier.weight(1f))
                    Text(
                        Fmt.amount(effectiveTotal, currency.ifBlank { "PLN" }),
                        style = SolvioFonts.amount.copy(color = palette.foreground),
                    )
                }
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        locale.t("virtualReceipt.overrideTotal"),
                        style = SolvioFonts.bodyMedium.copy(color = palette.foreground),
                        modifier = Modifier.weight(1f),
                    )
                    Switch(
                        checked = useCustomTotal,
                        onCheckedChange = { useCustomTotal = it },
                        colors = SwitchDefaults.colors(
                            checkedTrackColor = palette.foreground,
                            uncheckedTrackColor = palette.muted,
                            checkedThumbColor = palette.background,
                            uncheckedThumbColor = palette.foreground,
                        ),
                    )
                }
                if (useCustomTotal) {
                    NBTextField(
                        value = customTotal,
                        onChange = { customTotal = it },
                        label = locale.t("virtualReceipt.customTotal"),
                        placeholder = "0.00",
                        keyboardType = KeyboardType.Decimal,
                    )
                } else {
                    Text(
                        locale.t("virtualReceipt.calculated"),
                        style = SolvioFonts.caption.copy(color = palette.mutedForeground),
                    )
                }
            }
        }

        item {
            // Notes
            NBTextField(
                value = notes,
                onChange = { notes = it },
                label = locale.t("virtualReceipt.notesLabel"),
                placeholder = "",
            )
        }

        if (didTryToSave && !canSave && vendor.trim().isNotEmpty()) {
            item {
                Text(
                    locale.t("validation.priceInvalid"),
                    style = SolvioFonts.caption.copy(color = palette.destructive),
                )
            }
        }

        item {
            NBPrimaryButton(
                label = if (isSaving) locale.t("virtualReceipt.saving") else locale.t("virtualReceipt.save"),
                onClick = {
                    didTryToSave = true
                    if (!canSave) {
                        toast.error(locale.t("validation.vendorRequired"))
                        return@NBPrimaryButton
                    }
                    scope.launch {
                        isSaving = true
                        try {
                            val payloadItems = items.mapNotNull { it.toReceiptItem() }
                            val body = ReceiptCreate(
                                vendor = vendor.trim(),
                                date = dateText.ifBlank { LocalDate.now().toString() },
                                total = if (effectiveTotal > 0) effectiveTotal else null,
                                currency = currency.ifBlank { "PLN" }.uppercase(),
                                items = payloadItems,
                                notes = notes.ifBlank { null },
                            )
                            val created = ReceiptsRepo.create(body)
                            toast.success(locale.t("receipts.saved"), description = created.vendor ?: locale.t("receipts.virtualReceipt"))
                            onCreated(created)
                        } catch (e: Throwable) {
                            toast.error(locale.t("virtualReceipt.saveFailed"), description = e.message)
                        } finally {
                            isSaving = false
                        }
                    }
                },
                loading = isSaving,
                enabled = !isSaving,
            )
        }

        item { Spacer(Modifier.height(SolvioTheme.Spacing.xl)) }
    }
}

@Composable
private fun EditableItemRow(
    item: EditableItem,
    currency: String,
    canDelete: Boolean,
    onChange: (EditableItem) -> Unit,
    onDelete: () -> Unit,
) {
    val palette = LocalPalette.current
    val locale = LocalAppLocale.current

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .nbCard(palette, radius = SolvioTheme.Radius.sm, shadow = SolvioTheme.Shadow.sm)
            .padding(SolvioTheme.Spacing.sm),
        verticalArrangement = Arrangement.spacedBy(SolvioTheme.Spacing.xs),
    ) {
        Row(verticalAlignment = Alignment.Top) {
            NBTextField(
                value = item.name,
                onChange = { onChange(item.copy(name = it)) },
                placeholder = locale.t("virtualReceipt.itemName"),
                modifier = Modifier.weight(1f),
            )
            if (canDelete) {
                Spacer(Modifier.width(SolvioTheme.Spacing.xs))
                Box(
                    modifier = Modifier
                        .size(40.dp)
                        .clip(RoundedCornerShape(SolvioTheme.Radius.sm))
                        .clickable { onDelete() },
                    contentAlignment = Alignment.Center,
                ) {
                    Icon(Icons.Filled.Delete, contentDescription = null, tint = palette.destructive, modifier = Modifier.size(20.dp))
                }
            }
        }
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(SolvioTheme.Spacing.xs)) {
            NBTextField(
                value = item.qty,
                onChange = { onChange(item.copy(qty = it)) },
                placeholder = locale.t("virtualReceipt.qty"),
                keyboardType = KeyboardType.Decimal,
                modifier = Modifier.width(96.dp),
            )
            Text("×", style = SolvioFonts.body.copy(color = palette.mutedForeground))
            NBTextField(
                value = item.price,
                onChange = { onChange(item.copy(price = it)) },
                placeholder = locale.t("virtualReceipt.unitPrice"),
                keyboardType = KeyboardType.Decimal,
                modifier = Modifier.weight(1f),
            )
            Text(
                Fmt.amount(item.lineTotal(), currency.ifBlank { "PLN" }),
                style = SolvioFonts.mono(12).copy(color = palette.foreground),
            )
        }
    }
}
