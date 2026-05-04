package com.programo.solvio.features.expenses

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.programo.solvio.LocalAppLocale
import com.programo.solvio.core.Fmt
import com.programo.solvio.core.models.Expense
import com.programo.solvio.core.network.ExpensesRepo
import com.programo.solvio.core.network.ReceiptsRepo
import com.programo.solvio.core.theme.LocalPalette
import com.programo.solvio.core.theme.SolvioFonts
import com.programo.solvio.core.theme.SolvioTheme
import com.programo.solvio.core.ui.NBCard
import com.programo.solvio.core.ui.NBDivider
import com.programo.solvio.core.ui.NBErrorCard
import com.programo.solvio.core.ui.NBEyebrow
import com.programo.solvio.core.ui.NBLoadingCard
import com.programo.solvio.core.ui.NBSecondaryButton
import com.programo.solvio.core.ui.NBTag
import androidx.compose.material3.Text
import com.programo.solvio.core.models.ReceiptItem
import kotlinx.coroutines.launch

@Composable
fun ExpenseDetailScreen(expenseId: String, onBack: () -> Unit) {
    val palette = LocalPalette.current
    val locale = LocalAppLocale.current
    val scope = rememberCoroutineScope()

    var loading by remember { mutableStateOf(true) }
    var error by remember { mutableStateOf<String?>(null) }
    var expense by remember { mutableStateOf<Expense?>(null) }
    var defaultCurrency by remember { mutableStateOf("PLN") }
    var receiptItems by remember { mutableStateOf<List<ReceiptItem>>(emptyList()) }

    LaunchedEffect(expenseId) {
        loading = true; error = null
        runCatching {
            val list = ExpensesRepo.list()
            defaultCurrency = list.settings?.currency ?: defaultCurrency
            val found = list.expenses.firstOrNull { it.id == expenseId }
            expense = found
            if (found?.receiptId != null) {
                runCatching { ReceiptsRepo.detail(found.receiptId) }.getOrNull()?.let {
                    receiptItems = it.items.orEmpty()
                }
            }
        }.onFailure { error = it.message ?: "Failed" }
        loading = false
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(palette.background)
            .verticalScroll(rememberScrollState())
            .padding(SolvioTheme.Spacing.md),
        verticalArrangement = Arrangement.spacedBy(SolvioTheme.Spacing.md),
    ) {
        if (loading) {
            NBLoadingCard()
        } else if (error != null || expense == null) {
            NBErrorCard(message = error ?: "Not found", onRetry = onBack)
        } else {
            val e = expense!!
            NBCard {
                NBEyebrow(text = locale.t("expenseDetail.eyebrow"), color = palette.mutedForeground)
                Text(
                    Fmt.amount(e.amount.toDouble(), e.currency ?: defaultCurrency),
                    style = SolvioFonts.black(34).copy(color = palette.foreground),
                )
                Text(e.title, style = SolvioFonts.cardTitle.copy(color = palette.foreground))
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    e.categoryName?.let { NBTag(text = it) }
                    Text(Fmt.date(e.date), style = SolvioFonts.caption.copy(color = palette.mutedForeground))
                }
            }

            if (receiptItems.isNotEmpty()) {
                NBCard(radius = SolvioTheme.Radius.md, shadow = SolvioTheme.Shadow.sm) {
                    NBEyebrow(text = locale.t("expenseDetail.items"), color = palette.mutedForeground)
                    Spacer(Modifier.height(8.dp))
                    receiptItems.forEachIndexed { idx, item ->
                        Row(modifier = Modifier.fillMaxWidth().padding(vertical = 6.dp)) {
                            Column(modifier = Modifier.weight(1f)) {
                                Text(item.nameTranslated ?: item.name, style = SolvioFonts.body.copy(color = palette.foreground))
                                item.quantity?.takeIf { it > 0 }?.let { qty ->
                                    Text("× $qty", style = SolvioFonts.mono(11).copy(color = palette.mutedForeground))
                                }
                            }
                            val price = (item.price ?: item.totalPrice)?.toDouble() ?: 0.0
                            Text(
                                Fmt.amount(price, e.currency ?: defaultCurrency),
                                style = SolvioFonts.mono(13).copy(color = palette.foreground),
                            )
                        }
                        if (idx < receiptItems.size - 1) NBDivider()
                    }
                }
            }

            NBSecondaryButton(label = locale.t("common.close"), onClick = onBack)
        }
    }
}
