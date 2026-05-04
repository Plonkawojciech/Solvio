package com.programo.solvio.features.prices

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import com.programo.solvio.LocalAppLocale
import com.programo.solvio.core.AppLocale
import com.programo.solvio.core.Fmt
import com.programo.solvio.core.models.PriceComparison
import com.programo.solvio.core.models.PriceComparisonResponse
import com.programo.solvio.core.models.PriceEntry
import com.programo.solvio.core.network.PricesRepo
import com.programo.solvio.core.theme.LocalPalette
import com.programo.solvio.core.theme.SolvioFonts
import com.programo.solvio.core.theme.SolvioTheme
import com.programo.solvio.core.theme.nbCard
import com.programo.solvio.core.ui.NBCard
import com.programo.solvio.core.ui.NBDivider
import com.programo.solvio.core.ui.NBEmptyState
import com.programo.solvio.core.ui.NBErrorCard
import com.programo.solvio.core.ui.NBEyebrow
import com.programo.solvio.core.ui.NBLoadingCard
import com.programo.solvio.core.ui.NBPrimaryButton
import com.programo.solvio.core.ui.NBScreenHeader
import com.programo.solvio.core.ui.NBSectionHeader
import com.programo.solvio.core.ui.NBTag
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch

/// AI price comparison — mirrors `Features/Prices/PricesView.swift`.
class PricesViewModel : ViewModel() {
    sealed class UiState {
        object Idle : UiState()
        object Loading : UiState()
        data class Loaded(val data: PriceComparisonResponse) : UiState()
        data class Error(val message: String) : UiState()
    }

    private val _state = MutableStateFlow<UiState>(UiState.Idle)
    val state: StateFlow<UiState> = _state

    fun run(lang: AppLocale.Language, currency: String) {
        viewModelScope.launch {
            _state.value = UiState.Loading
            try {
                val r = PricesRepo.compare(lang = lang.code, currency = currency)
                _state.value = UiState.Loaded(r)
            } catch (e: Throwable) {
                _state.value = UiState.Error(e.message ?: "Failed")
            }
        }
    }
}

@Composable
fun PricesScreen() {
    val palette = LocalPalette.current
    val locale = LocalAppLocale.current
    val vm: PricesViewModel = viewModel()
    val state by vm.state.collectAsState()
    val lang by locale.language.collectAsState()
    val currency = "PLN"

    var expanded by remember { mutableStateOf(setOf<String>()) }
    var pricesExpanded by remember { mutableStateOf(setOf<String>()) }

    LazyColumn(
        modifier = Modifier.fillMaxSize().background(palette.background),
        contentPadding = PaddingValues(SolvioTheme.Spacing.md),
        verticalArrangement = Arrangement.spacedBy(SolvioTheme.Spacing.md),
    ) {
        item {
            NBScreenHeader(
                eyebrow = locale.t("prices.eyebrow"),
                title = locale.t("prices.headerTitle"),
                subtitle = locale.t("prices.headerSubtitle"),
            )
        }
        item {
            NBCard(radius = SolvioTheme.Radius.md, shadow = SolvioTheme.Shadow.sm) {
                Text(
                    locale.t("prices.description"),
                    style = SolvioFonts.body.copy(color = palette.mutedForeground),
                )
                Spacer(Modifier.height(SolvioTheme.Spacing.sm))
                val isLoading = state is PricesViewModel.UiState.Loading
                val hasResult = state is PricesViewModel.UiState.Loaded
                NBPrimaryButton(
                    label = when {
                        isLoading -> locale.t("prices.checking")
                        hasResult -> locale.t("prices.recompare")
                        else -> locale.t("prices.compare")
                    },
                    enabled = !isLoading,
                    loading = isLoading,
                    onClick = { vm.run(lang, currency) },
                )
            }
        }
        when (val s = state) {
            PricesViewModel.UiState.Idle -> Unit
            PricesViewModel.UiState.Loading -> item { NBLoadingCard() }
            is PricesViewModel.UiState.Error -> item {
                NBErrorCard(message = s.message) { vm.run(lang, currency) }
            }
            is PricesViewModel.UiState.Loaded -> {
                val r = s.data
                val topError = r.error
                if (!topError.isNullOrBlank()) {
                    item {
                        NBCard(radius = SolvioTheme.Radius.md) {
                            NBEmptyState(
                                title = locale.t("prices.emptyTitle"),
                                subtitle = r.message ?: topError,
                            )
                        }
                    }
                } else {
                    item { SummaryCard(r, currency) }
                    if (r.comparisons.isNotEmpty()) {
                        item {
                            Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                                NBSectionHeader(
                                    eyebrow = locale.t("prices.productsSection"),
                                    title = locale.format("prices.comparisonsCountFmt", r.comparisons.size),
                                )
                                Spacer(modifier = Modifier.weight(1f))
                                val allExpanded = r.comparisons.isNotEmpty() && expanded.size == r.comparisons.size
                                Text(
                                    if (allExpanded) locale.t("prices.collapseAll") else locale.t("prices.expandAll"),
                                    style = SolvioFonts.mono(11).copy(color = palette.foreground),
                                    modifier = Modifier.clickable {
                                        expanded = if (allExpanded) emptySet()
                                        else r.comparisons.map { it.productName }.toSet()
                                        if (allExpanded) pricesExpanded = emptySet()
                                    },
                                )
                            }
                        }
                        items(r.comparisons, key = { it.productName }) { c ->
                            ComparisonCard(
                                c = c,
                                currency = currency,
                                isCardExpanded = expanded.contains(c.productName),
                                isPricesExpanded = pricesExpanded.contains(c.productName),
                                onToggleCard = {
                                    expanded = if (expanded.contains(c.productName)) expanded - c.productName
                                    else expanded + c.productName
                                },
                                onTogglePrices = {
                                    pricesExpanded = if (pricesExpanded.contains(c.productName)) pricesExpanded - c.productName
                                    else pricesExpanded + c.productName
                                },
                            )
                        }
                    } else if (!r.message.isNullOrBlank()) {
                        item {
                            NBCard(radius = SolvioTheme.Radius.md) {
                                NBEmptyState(title = locale.t("prices.emptyTitle"), subtitle = r.message)
                            }
                        }
                    }
                }
            }
        }
        item { Spacer(Modifier.height(SolvioTheme.Spacing.xl)) }
    }
}

@Composable
private fun SummaryCard(r: PriceComparisonResponse, currency: String) {
    val palette = LocalPalette.current
    val locale = LocalAppLocale.current
    NBCard(radius = SolvioTheme.Radius.lg, shadow = SolvioTheme.Shadow.lg) {
        Row(verticalAlignment = Alignment.Top) {
            Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                NBEyebrow(text = locale.t("prices.totalSavings"))
                Text(
                    locale.t("prices.acrossProducts"),
                    style = SolvioFonts.caption.copy(color = palette.mutedForeground),
                )
            }
            Box(
                modifier = Modifier
                    .size(36.dp)
                    .clip(RoundedCornerShape(SolvioTheme.Radius.sm))
                    .background(palette.success.copy(alpha = 0.15f))
                    .border(SolvioTheme.Border.widthThin, palette.success, RoundedCornerShape(SolvioTheme.Radius.sm)),
                contentAlignment = Alignment.Center,
            ) { Text("✨", style = SolvioFonts.bodyMedium.copy(color = palette.success)) }
        }
        Spacer(Modifier.height(SolvioTheme.Spacing.sm))
        Text(
            Fmt.amount(r.totalPotentialSavings, currency),
            style = SolvioFonts.hero.copy(color = palette.success),
        )
        Row(horizontalArrangement = Arrangement.spacedBy(SolvioTheme.Spacing.xs)) {
            r.productsAnalyzed?.let {
                NBTag(text = locale.format("prices.productsCountFmt", it))
            }
            if (r.isEstimated == true) {
                NBTag(
                    text = locale.t("prices.estimated"),
                    background = palette.warning.copy(alpha = 0.15f),
                    foreground = palette.warning,
                )
            }
        }
        r.bestStoreOverall?.takeIf { it.isNotBlank() }?.let { best ->
            Spacer(Modifier.height(SolvioTheme.Spacing.xs))
            Row(
                horizontalArrangement = Arrangement.spacedBy(SolvioTheme.Spacing.sm),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Box(
                    modifier = Modifier
                        .size(28.dp)
                        .clip(RoundedCornerShape(SolvioTheme.Radius.sm))
                        .background(palette.success.copy(alpha = 0.15f))
                        .border(SolvioTheme.Border.widthThin, palette.success, RoundedCornerShape(SolvioTheme.Radius.sm)),
                    contentAlignment = Alignment.Center,
                ) { Text("★", style = SolvioFonts.bodyMedium.copy(color = palette.success)) }
                Column {
                    Text(locale.t("prices.bestStoreOverall"), style = SolvioFonts.caption.copy(color = palette.mutedForeground))
                    Text(best, style = SolvioFonts.bodyMedium.copy(color = palette.foreground))
                }
            }
        }
        r.summary?.takeIf { it.isNotBlank() }?.let { sum ->
            Spacer(Modifier.height(SolvioTheme.Spacing.xs))
            NBDivider()
            Spacer(Modifier.height(SolvioTheme.Spacing.xs))
            Text(sum, style = SolvioFonts.body.copy(color = palette.foreground))
        }
        r.tip?.takeIf { it.isNotBlank() }?.let { tip ->
            Spacer(Modifier.height(SolvioTheme.Spacing.xs))
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(SolvioTheme.Radius.md))
                    .background(palette.warning.copy(alpha = 0.08f))
                    .border(SolvioTheme.Border.widthThin, palette.warning, RoundedCornerShape(SolvioTheme.Radius.md))
                    .padding(SolvioTheme.Spacing.sm),
                horizontalArrangement = Arrangement.spacedBy(SolvioTheme.Spacing.sm),
                verticalAlignment = Alignment.Top,
            ) {
                Text("💡", style = SolvioFonts.bodyMedium)
                Text(tip, style = SolvioFonts.caption.copy(color = palette.foreground))
            }
        }
    }
}

@Composable
private fun ComparisonCard(
    c: PriceComparison,
    currency: String,
    isCardExpanded: Boolean,
    isPricesExpanded: Boolean,
    onToggleCard: () -> Unit,
    onTogglePrices: () -> Unit,
) {
    val palette = LocalPalette.current
    val locale = LocalAppLocale.current
    val allPrices = c.allPrices.orEmpty()

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .nbCard(palette, radius = SolvioTheme.Radius.md, shadow = SolvioTheme.Shadow.sm)
            .clickable { onToggleCard() }
            .padding(SolvioTheme.Spacing.sm),
        verticalArrangement = Arrangement.spacedBy(SolvioTheme.Spacing.xs),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                Text(c.productName, style = SolvioFonts.bodyMedium.copy(color = palette.foreground), maxLines = 2)
                val savings = c.savingsAmount
                if (savings != null && savings > 0) {
                    Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                        Text(
                            locale.format("prices.saveFmt", Fmt.amount(savings, currency)),
                            style = SolvioFonts.mono(10).copy(color = palette.success),
                        )
                        c.savingsPercent?.let { pct ->
                            Text("(${pct.toInt()}%)", style = SolvioFonts.mono(10).copy(color = palette.success))
                        }
                    }
                } else if (!isCardExpanded) {
                    Text(
                        locale.t("prices.tapToExpand"),
                        style = SolvioFonts.caption.copy(color = palette.mutedForeground),
                    )
                }
            }
            if (c.buyNow == true) {
                NBTag(
                    text = locale.t("prices.buyNow"),
                    background = palette.success.copy(alpha = 0.15f),
                    foreground = palette.success,
                )
            }
            Spacer(Modifier.width(6.dp))
            Text(if (isCardExpanded) "▲" else "▼", style = SolvioFonts.mono(11).copy(color = palette.mutedForeground))
        }

        if (isCardExpanded) {
            NBDivider()
            Row(horizontalArrangement = Arrangement.spacedBy(SolvioTheme.Spacing.md), verticalAlignment = Alignment.Top) {
                c.userLastPrice?.let { price ->
                    Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                        Text(locale.t("prices.youPaid"), style = SolvioFonts.mono(10).copy(color = palette.mutedForeground))
                        Text(Fmt.amount(price, currency), style = SolvioFonts.bodyMedium.copy(color = palette.foreground))
                        c.userLastStore?.takeIf { it.isNotBlank() }?.let {
                            Text(it, style = SolvioFonts.caption.copy(color = palette.mutedForeground))
                        }
                    }
                }
                val bestPrice = c.bestPrice
                val bestStore = c.bestStore
                if (bestPrice != null && bestStore != null) {
                    Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                        Text(locale.t("prices.bestLabel"), style = SolvioFonts.mono(10).copy(color = palette.mutedForeground))
                        Text(Fmt.amount(bestPrice, currency), style = SolvioFonts.bodyMedium.copy(color = palette.success))
                        Text(bestStore, style = SolvioFonts.caption.copy(color = palette.success))
                    }
                }
            }
            c.bestDeal?.takeIf { it.isNotBlank() }?.let { deal ->
                Text(deal, style = SolvioFonts.caption.copy(color = palette.mutedForeground))
            }
            c.recommendation?.takeIf { it.isNotBlank() }?.let { rec ->
                Text(rec, style = SolvioFonts.caption.copy(color = palette.foreground))
            }

            if (allPrices.isNotEmpty()) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clickable(onClick = onTogglePrices),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(
                        if (isPricesExpanded) locale.t("prices.hideAllPrices")
                        else locale.format("prices.viewAllPricesFmt", allPrices.size),
                        style = SolvioFonts.mono(11).copy(color = palette.foreground),
                    )
                    Spacer(Modifier.weight(1f))
                    Text(if (isPricesExpanded) "▲" else "▼", style = SolvioFonts.mono(10).copy(color = palette.foreground))
                }
                if (isPricesExpanded) {
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clip(RoundedCornerShape(SolvioTheme.Radius.sm))
                            .background(palette.muted)
                            .padding(SolvioTheme.Spacing.xs),
                        verticalArrangement = Arrangement.spacedBy(4.dp),
                    ) {
                        allPrices.forEach { entry: PriceEntry ->
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Text(entry.store, style = SolvioFonts.caption.copy(color = palette.foreground), modifier = Modifier.weight(1f))
                                entry.price?.let { p ->
                                    Text(Fmt.amount(p, currency), style = SolvioFonts.mono(11).copy(color = palette.foreground))
                                }
                                entry.promotion?.takeIf { it.isNotBlank() }?.let { promo ->
                                    Spacer(Modifier.width(6.dp))
                                    NBTag(
                                        text = promo,
                                        background = palette.warning.copy(alpha = 0.15f),
                                        foreground = palette.warning,
                                    )
                                }
                            }
                            entry.validUntil?.takeIf { it.isNotBlank() }?.let { vu ->
                                Row(modifier = Modifier.fillMaxWidth()) {
                                    Spacer(Modifier.weight(1f))
                                    Text(
                                        locale.format("prices.validUntilFmt", Fmt.date(vu)),
                                        style = SolvioFonts.mono(10).copy(color = palette.mutedForeground),
                                    )
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}
