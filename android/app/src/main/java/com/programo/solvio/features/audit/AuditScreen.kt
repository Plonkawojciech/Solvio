package com.programo.solvio.features.audit

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
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import com.programo.solvio.LocalAppLocale
import com.programo.solvio.LocalToast
import com.programo.solvio.core.AppLocale
import com.programo.solvio.core.Fmt
import com.programo.solvio.core.models.AuditPriceComparison
import com.programo.solvio.core.models.AuditPromotion
import com.programo.solvio.core.models.AuditResult
import com.programo.solvio.core.models.AuditTopProduct
import com.programo.solvio.core.models.AuditTopStore
import com.programo.solvio.core.network.AuditRepo
import com.programo.solvio.core.theme.LocalPalette
import com.programo.solvio.core.theme.Palette
import com.programo.solvio.core.theme.SolvioFonts
import com.programo.solvio.core.theme.SolvioTheme
import com.programo.solvio.core.theme.nbCard
import com.programo.solvio.core.ui.NBCard
import com.programo.solvio.core.ui.NBErrorCard
import com.programo.solvio.core.ui.NBEyebrow
import com.programo.solvio.core.ui.NBLoadingCard
import com.programo.solvio.core.ui.NBPrimaryButton
import com.programo.solvio.core.ui.NBSectionHeader
import com.programo.solvio.core.ui.NBScreenHeader
import com.programo.solvio.core.ui.NBTag
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch

/// Shopping audit — mirrors `Features/Audit/AuditView.swift`. KPI hero
/// (period + totalSpent + totalPotentialSaving + webSearchUsed tag) +
/// AI summary + best store + top stores + top products + per-product
/// price comparisons + active promotions.
class AuditViewModel : ViewModel() {
    sealed class UiState {
        object Idle : UiState()
        object Loading : UiState()
        data class Loaded(val data: AuditResult) : UiState()
        data class Error(val message: String) : UiState()
    }

    private val _state = MutableStateFlow<UiState>(UiState.Idle)
    val state: StateFlow<UiState> = _state

    fun run(lang: AppLocale.Language) {
        viewModelScope.launch {
            _state.value = UiState.Loading
            try {
                _state.value = UiState.Loaded(AuditRepo.generate(lang.code))
            } catch (e: Throwable) {
                _state.value = UiState.Error(e.message ?: "Failed")
            }
        }
    }
}

@Composable
fun AuditScreen() {
    val palette = LocalPalette.current
    val locale = LocalAppLocale.current
    val toast = LocalToast.current
    val vm: AuditViewModel = viewModel()
    val state by vm.state.collectAsState()
    val lang by locale.language.collectAsState()

    LazyColumn(
        modifier = Modifier.fillMaxSize().background(palette.background),
        contentPadding = PaddingValues(SolvioTheme.Spacing.md),
        verticalArrangement = Arrangement.spacedBy(SolvioTheme.Spacing.md),
    ) {
        item {
            NBScreenHeader(
                eyebrow = locale.t("audit.headerEyebrow"),
                title = locale.t("audit.headerTitle"),
                subtitle = locale.t("audit.headerSubtitle"),
            )
        }
        item {
            NBCard(radius = SolvioTheme.Radius.md, shadow = SolvioTheme.Shadow.sm) {
                Text(
                    locale.t("audit.description"),
                    style = SolvioFonts.body.copy(color = palette.mutedForeground),
                )
                Spacer(Modifier.height(SolvioTheme.Spacing.sm))
                val isLoading = state is AuditViewModel.UiState.Loading
                val hasResult = state is AuditViewModel.UiState.Loaded
                NBPrimaryButton(
                    label = when {
                        isLoading -> locale.t("audit.auditing")
                        hasResult -> locale.t("audit.regenerate")
                        else -> locale.t("audit.generate")
                    },
                    enabled = !isLoading,
                    loading = isLoading,
                    onClick = { vm.run(lang) },
                )
            }
        }

        when (val s = state) {
            AuditViewModel.UiState.Idle -> Unit
            AuditViewModel.UiState.Loading -> item { NBLoadingCard() }
            is AuditViewModel.UiState.Error -> item { NBErrorCard(message = s.message) { vm.run(lang) } }
            is AuditViewModel.UiState.Loaded -> {
                val r = s.data
                item { KpiCard(r) }
                if (r.aiSummary.isNotBlank()) item { TextCard(eyebrowKey = "audit.aiSummaryEyebrow", text = r.aiSummary) }
                r.personalMessage?.takeIf { it.isNotBlank() }?.let { msg ->
                    item { TintedNoticeCard(text = msg, tint = palette.info) }
                }
                r.bestStore?.takeIf { it.isNotBlank() }?.let { name ->
                    item { BestStoreCard(name) }
                }
                r.topTip?.takeIf { it.isNotBlank() }?.let { tip ->
                    item { TintedNoticeCard(text = tip, tint = palette.warning) }
                }
                if (r.topStores.isNotEmpty()) item { TopStoresSection(r.topStores, r.currency) }
                if (r.topProducts.isNotEmpty()) item { TopProductsSection(r.topProducts, r.currency) }
                if (r.priceComparisons.isNotEmpty()) item { PriceComparisonsSection(r.priceComparisons, r.currency) }
                r.currentPromotions?.takeIf { it.isNotEmpty() }?.let { promos ->
                    item { PromotionsSection(promos, r.currency) }
                }
            }
        }
    }
}

// MARK: - KPI hero card

@Composable
private fun KpiCard(r: AuditResult) {
    val palette = LocalPalette.current
    val locale = LocalAppLocale.current
    NBCard(radius = SolvioTheme.Radius.lg, shadow = SolvioTheme.Shadow.lg) {
        Row(verticalAlignment = Alignment.Top) {
            Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                NBEyebrow(text = locale.t("audit.period"))
                Text(
                    "${Fmt.date(r.period.from)} – ${Fmt.date(r.period.to)}",
                    style = SolvioFonts.bodyMedium.copy(color = palette.foreground),
                )
            }
            Box(
                modifier = Modifier
                    .size(36.dp)
                    .clip(RoundedCornerShape(SolvioTheme.Radius.sm))
                    .background(palette.foreground.copy(alpha = 0.08f))
                    .border(SolvioTheme.Border.widthThin, palette.border, RoundedCornerShape(SolvioTheme.Radius.sm)),
                contentAlignment = Alignment.Center,
            ) { Text("🛒", style = SolvioFonts.bodyMedium.copy(color = palette.foreground)) }
        }

        Spacer(Modifier.height(SolvioTheme.Spacing.sm))
        Text(Fmt.amount(r.totalSpent, r.currency), style = SolvioFonts.hero.copy(color = palette.foreground))
        Text(
            locale.format("audit.txnsFmt", r.transactionCount),
            style = SolvioFonts.caption.copy(color = palette.mutedForeground),
        )

        Spacer(Modifier.height(SolvioTheme.Spacing.sm))
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(SolvioTheme.Radius.md))
                .background(palette.success.copy(alpha = 0.08f))
                .border(SolvioTheme.Border.widthThin, palette.success, RoundedCornerShape(SolvioTheme.Radius.md))
                .padding(SolvioTheme.Spacing.sm),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                Text(locale.t("audit.potentialSavingLabel"), style = SolvioFonts.eyebrow.copy(color = palette.mutedForeground))
                Text(
                    Fmt.amount(r.totalPotentialSaving, r.currency),
                    style = SolvioFonts.bold(20).copy(color = palette.success),
                )
            }
            if (r.webSearchUsed == true) {
                NBTag(
                    text = locale.t("audit.webSearchTag"),
                    background = palette.info.copy(alpha = 0.15f),
                    foreground = palette.info,
                )
            }
        }
    }
}

// MARK: - Reusable cards

@Composable
private fun TextCard(eyebrowKey: String, text: String) {
    val palette = LocalPalette.current
    val locale = LocalAppLocale.current
    NBCard(radius = SolvioTheme.Radius.md, shadow = SolvioTheme.Shadow.sm) {
        NBEyebrow(text = locale.t(eyebrowKey))
        Spacer(Modifier.height(4.dp))
        Text(text, style = SolvioFonts.body.copy(color = palette.foreground))
    }
}

@Composable
private fun TintedNoticeCard(text: String, tint: Color) {
    val palette = LocalPalette.current
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(SolvioTheme.Radius.md))
            .background(tint.copy(alpha = 0.08f))
            .border(SolvioTheme.Border.widthThin, tint, RoundedCornerShape(SolvioTheme.Radius.md))
            .padding(SolvioTheme.Spacing.md),
        horizontalArrangement = Arrangement.spacedBy(SolvioTheme.Spacing.sm),
        verticalAlignment = Alignment.Top,
    ) {
        Text("ⓘ", style = SolvioFonts.bodyMedium.copy(color = tint))
        Text(text, style = SolvioFonts.body.copy(color = palette.foreground))
    }
}

@Composable
private fun BestStoreCard(name: String) {
    val palette = LocalPalette.current
    val locale = LocalAppLocale.current
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .nbCard(palette, radius = SolvioTheme.Radius.md, shadow = SolvioTheme.Shadow.sm)
            .padding(SolvioTheme.Spacing.md),
        horizontalArrangement = Arrangement.spacedBy(SolvioTheme.Spacing.sm),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            modifier = Modifier
                .size(36.dp)
                .clip(RoundedCornerShape(SolvioTheme.Radius.sm))
                .background(palette.success.copy(alpha = 0.15f))
                .border(SolvioTheme.Border.widthThin, palette.success, RoundedCornerShape(SolvioTheme.Radius.sm)),
            contentAlignment = Alignment.Center,
        ) { Text("★", style = SolvioFonts.bodyMedium.copy(color = palette.success)) }
        Column {
            Text(locale.t("audit.bestStoreOverall"), style = SolvioFonts.caption.copy(color = palette.mutedForeground))
            Text(name, style = SolvioFonts.bodyMedium.copy(color = palette.foreground))
        }
    }
}

// MARK: - Top stores

@Composable
private fun TopStoresSection(stores: List<AuditTopStore>, currency: String) {
    val palette = LocalPalette.current
    val locale = LocalAppLocale.current
    Column(verticalArrangement = Arrangement.spacedBy(SolvioTheme.Spacing.xs)) {
        NBSectionHeader(eyebrow = locale.t("audit.storesEyebrow"), title = locale.t("audit.topSpendTitle"))
        stores.forEachIndexed { idx, s ->
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .nbCard(palette, radius = SolvioTheme.Radius.sm, shadow = SolvioTheme.Shadow.sm)
                    .padding(SolvioTheme.Spacing.sm),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(SolvioTheme.Spacing.sm),
            ) {
                Text("#${idx + 1}", style = SolvioFonts.mono(12).copy(color = palette.mutedForeground), modifier = Modifier.width(28.dp))
                Text(s.store, style = SolvioFonts.bodyMedium.copy(color = palette.foreground), modifier = Modifier.weight(1f))
                Text(Fmt.amount(s.amount, currency), style = SolvioFonts.mono(13).copy(color = palette.foreground))
            }
        }
    }
}

// MARK: - Top products

@Composable
private fun TopProductsSection(products: List<AuditTopProduct>, currency: String) {
    val palette = LocalPalette.current
    val locale = LocalAppLocale.current
    Column(verticalArrangement = Arrangement.spacedBy(SolvioTheme.Spacing.xs)) {
        NBSectionHeader(eyebrow = locale.t("audit.productsEyebrow"), title = locale.t("audit.topPurchasedTitle"))
        products.forEach { p ->
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .nbCard(palette, radius = SolvioTheme.Radius.sm, shadow = SolvioTheme.Shadow.sm)
                    .padding(SolvioTheme.Spacing.sm),
                verticalArrangement = Arrangement.spacedBy(4.dp),
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(p.name, style = SolvioFonts.bodyMedium.copy(color = palette.foreground), modifier = Modifier.weight(1f))
                    Text(Fmt.amount(p.totalPaid, currency), style = SolvioFonts.mono(12).copy(color = palette.foreground))
                }
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    NBTag(text = locale.format("audit.timesBoughtFmt", String.format("%.0f", p.count)))
                    NBTag(text = locale.format("audit.avgFmt", Fmt.amount(p.avgPrice, currency)))
                    p.vendor?.takeIf { it.isNotBlank() }?.let { NBTag(text = it) }
                }
            }
        }
    }
}

// MARK: - Price comparisons

@Composable
private fun PriceComparisonsSection(items: List<AuditPriceComparison>, currency: String) {
    val palette = LocalPalette.current
    val locale = LocalAppLocale.current
    Column(verticalArrangement = Arrangement.spacedBy(SolvioTheme.Spacing.xs)) {
        NBSectionHeader(eyebrow = locale.t("audit.pricesEyebrow"), title = locale.t("audit.whereCheaper"))
        items.forEach { pc ->
            PriceComparisonCard(pc, currency)
        }
    }
}

@Composable
private fun PriceComparisonCard(pc: AuditPriceComparison, currency: String) {
    val palette = LocalPalette.current
    val locale = LocalAppLocale.current
    var expanded by androidx.compose.runtime.remember { androidx.compose.runtime.mutableStateOf(false) }
    val sortedPrices = androidx.compose.runtime.remember(pc.prices) {
        pc.prices?.entries?.sortedBy { it.value } ?: emptyList()
    }
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .nbCard(palette, radius = SolvioTheme.Radius.md, shadow = SolvioTheme.Shadow.sm)
            .padding(SolvioTheme.Spacing.sm),
        verticalArrangement = Arrangement.spacedBy(SolvioTheme.Spacing.xs),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(pc.product, style = SolvioFonts.bodyMedium.copy(color = palette.foreground), modifier = Modifier.weight(1f))
            pc.potentialSaving?.takeIf { it > 0 }?.let { saving ->
                NBTag(
                    text = locale.format("audit.saveFmt", Fmt.amount(saving, currency)),
                    background = palette.success.copy(alpha = 0.15f),
                    foreground = palette.success,
                )
            }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(SolvioTheme.Spacing.md)) {
            pc.pricePaid?.let { paid ->
                Column {
                    Text(locale.t("audit.youPaidLabel"), style = SolvioFonts.eyebrow.copy(color = palette.mutedForeground))
                    Text(Fmt.amount(paid, currency), style = SolvioFonts.bodyMedium.copy(color = palette.foreground))
                }
            }
            val cheapestStore = pc.cheapestStore
            val cheapestPrice = pc.cheapestPrice
            if (cheapestStore != null && cheapestPrice != null) {
                Column {
                    Text(locale.t("audit.cheapestLabel"), style = SolvioFonts.eyebrow.copy(color = palette.mutedForeground))
                    Text(
                        "${Fmt.amount(cheapestPrice, currency)} · $cheapestStore",
                        style = SolvioFonts.bodyMedium.copy(color = palette.success),
                    )
                }
            }
        }
        if (sortedPrices.isNotEmpty()) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clickable { expanded = !expanded },
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    if (expanded) locale.t("prices.hideAllPrices")
                    else locale.format("prices.viewAllPricesFmt", sortedPrices.size),
                    style = SolvioFonts.mono(11).copy(color = palette.foreground),
                    modifier = Modifier.weight(1f),
                )
                Text(if (expanded) "▲" else "▼", style = SolvioFonts.mono(10).copy(color = palette.foreground))
            }
            if (expanded) {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(SolvioTheme.Radius.sm))
                        .background(palette.muted)
                        .padding(SolvioTheme.Spacing.xs),
                    verticalArrangement = Arrangement.spacedBy(4.dp),
                ) {
                    sortedPrices.forEach { (store, price) ->
                        Row {
                            Text(store, style = SolvioFonts.caption.copy(color = palette.mutedForeground), modifier = Modifier.weight(1f))
                            Text(Fmt.amount(price, currency), style = SolvioFonts.mono(11).copy(color = palette.foreground))
                        }
                    }
                }
            }
        }
        pc.verdict?.takeIf { it.isNotBlank() }?.let { v ->
            Text(v, style = SolvioFonts.caption.copy(color = palette.mutedForeground))
        }
    }
}

// MARK: - Promotions

@Composable
private fun PromotionsSection(items: List<AuditPromotion>, currency: String) {
    val palette = LocalPalette.current
    val locale = LocalAppLocale.current
    Column(verticalArrangement = Arrangement.spacedBy(SolvioTheme.Spacing.xs)) {
        NBSectionHeader(eyebrow = locale.t("audit.promotionsEyebrow"), title = locale.t("audit.activeDeals"))
        items.forEach { promo ->
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .nbCard(palette, radius = SolvioTheme.Radius.sm, shadow = SolvioTheme.Shadow.sm)
                    .padding(SolvioTheme.Spacing.sm),
                verticalArrangement = Arrangement.spacedBy(4.dp),
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    promo.store?.takeIf { it.isNotBlank() }?.let {
                        Text(it, style = SolvioFonts.bodyMedium.copy(color = palette.foreground), modifier = Modifier.weight(1f))
                    } ?: Spacer(modifier = Modifier.weight(1f))
                    promo.price?.let { p ->
                        Text(Fmt.amount(p, currency), style = SolvioFonts.mono(12).copy(color = palette.success))
                    }
                }
                promo.product?.takeIf { it.isNotBlank() }?.let {
                    Text(it, style = SolvioFonts.caption.copy(color = palette.mutedForeground))
                }
                promo.description?.takeIf { it.isNotBlank() }?.let {
                    Text(it, style = SolvioFonts.caption.copy(color = palette.mutedForeground))
                }
                promo.validUntil?.takeIf { it.isNotBlank() }?.let { vu ->
                    Text(
                        locale.format("audit.validUntilFmt", Fmt.date(vu)),
                        style = SolvioFonts.mono(11).copy(color = palette.mutedForeground),
                    )
                }
            }
        }
    }
}
