package com.programo.solvio.features.deals

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import com.programo.solvio.LocalAppLocale
import com.programo.solvio.LocalToast
import com.programo.solvio.core.AppLocale
import com.programo.solvio.core.Fmt
import com.programo.solvio.core.models.MultiStoreStrategy
import com.programo.solvio.core.models.PromoOffer
import com.programo.solvio.core.models.PromotionsResponse
import com.programo.solvio.core.models.Receipt
import com.programo.solvio.core.models.ReceiptAnalyzeResponse
import com.programo.solvio.core.models.ShoppingOptimizeRequest
import com.programo.solvio.core.models.ShoppingOptimizeResult
import com.programo.solvio.core.network.PromotionsRepo
import com.programo.solvio.core.network.ReceiptAnalyzeRepo
import com.programo.solvio.core.network.ReceiptsRepo
import com.programo.solvio.core.network.ShoppingRepo
import com.programo.solvio.core.theme.LocalPalette
import com.programo.solvio.core.theme.SolvioFonts
import com.programo.solvio.core.theme.SolvioTheme
import com.programo.solvio.core.theme.nbCard
import com.programo.solvio.core.ui.NBCard
import com.programo.solvio.core.ui.NBEmptyState
import com.programo.solvio.core.ui.NBErrorCard
import com.programo.solvio.core.ui.NBEyebrow
import com.programo.solvio.core.ui.NBLoadingCard
import com.programo.solvio.core.ui.NBPrimaryButton
import com.programo.solvio.core.ui.NBScreenHeader
import com.programo.solvio.core.ui.NBSectionHeader
import com.programo.solvio.core.ui.NBTag
import com.programo.solvio.core.ui.NBTextField
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.UUID

/// "Okazje" — shopping intelligence hub. Mirrors `Features/Deals/OkazjeHubView.swift`.
/// Sections:
///   - Header (eyebrow OKAZJE + brand line)
///   - Trending promotions (top 3 from PromotionsRepo)
///   - AI shopping list (editable rows, optimize button, result card)
///   - Analyze receipt (recent 5 receipts, tap to audit, result card)
///   - Launcher tiles (Prices / NearbyStores / Audit / ShoppingAdvisor)

data class ShoppingItemDraft(
    val id: String = UUID.randomUUID().toString(),
    val name: String = "",
    val qtyText: String = "1",
)

class OkazjeHubViewModel : ViewModel() {
    sealed class PromoState {
        object Loading : PromoState()
        data class Loaded(val data: PromotionsResponse) : PromoState()
        data class Error(val message: String) : PromoState()
    }

    sealed class ReceiptsState {
        object Loading : ReceiptsState()
        data class Loaded(val items: List<Receipt>) : ReceiptsState()
        data class Error(val message: String) : ReceiptsState()
    }

    sealed class OptimizeState {
        object Idle : OptimizeState()
        object Loading : OptimizeState()
        data class Loaded(val data: ShoppingOptimizeResult) : OptimizeState()
        data class Error(val message: String) : OptimizeState()
    }

    sealed class AnalyzeState {
        object Idle : AnalyzeState()
        data class Loading(val receiptId: String) : AnalyzeState()
        data class Loaded(val data: ReceiptAnalyzeResponse) : AnalyzeState()
        data class Error(val receiptId: String, val message: String) : AnalyzeState()
    }

    private val _promotions = MutableStateFlow<PromoState>(PromoState.Loading)
    val promotions: StateFlow<PromoState> = _promotions

    private val _receipts = MutableStateFlow<ReceiptsState>(ReceiptsState.Loading)
    val receipts: StateFlow<ReceiptsState> = _receipts

    private val _optimize = MutableStateFlow<OptimizeState>(OptimizeState.Idle)
    val optimize: StateFlow<OptimizeState> = _optimize

    private val _analyze = MutableStateFlow<AnalyzeState>(AnalyzeState.Idle)
    val analyze: StateFlow<AnalyzeState> = _analyze

    fun loadPromotions() {
        viewModelScope.launch {
            _promotions.value = PromoState.Loading
            try {
                _promotions.value = PromoState.Loaded(PromotionsRepo.fetch())
            } catch (e: Throwable) {
                _promotions.value = PromoState.Error(e.message ?: "Failed")
            }
        }
    }

    fun loadReceipts() {
        viewModelScope.launch {
            _receipts.value = ReceiptsState.Loading
            try {
                _receipts.value = ReceiptsState.Loaded(ReceiptsRepo.list().take(5))
            } catch (e: Throwable) {
                _receipts.value = ReceiptsState.Error(e.message ?: "Failed")
            }
        }
    }

    fun runOptimize(items: List<ShoppingOptimizeRequest.Item>, lang: String, currency: String) {
        viewModelScope.launch {
            _optimize.value = OptimizeState.Loading
            try {
                val r = ShoppingRepo.optimize(ShoppingOptimizeRequest(items = items, lang = lang, currency = currency))
                _optimize.value = OptimizeState.Loaded(r)
            } catch (e: Throwable) {
                _optimize.value = OptimizeState.Error(e.message ?: "Failed")
            }
        }
    }

    fun runAnalyze(receiptId: String, lang: String) {
        viewModelScope.launch {
            _analyze.value = AnalyzeState.Loading(receiptId)
            try {
                val r = ReceiptAnalyzeRepo.analyze(receiptId, lang)
                _analyze.value = AnalyzeState.Loaded(r)
            } catch (e: Throwable) {
                _analyze.value = AnalyzeState.Error(receiptId, e.message ?: "Failed")
            }
        }
    }
}

@Composable
fun OkazjeHubScreen(onNavigate: (String) -> Unit = {}) {
    val palette = LocalPalette.current
    val locale = LocalAppLocale.current
    val toast = LocalToast.current
    val ctx = LocalContext.current
    val vm: OkazjeHubViewModel = viewModel()
    val lang by locale.language.collectAsState()
    val currency = "PLN"

    // Shopping list draft state
    var items by remember { mutableStateOf(listOf(ShoppingItemDraft())) }

    LaunchedEffect(Unit) {
        vm.loadPromotions()
        vm.loadReceipts()
    }

    LazyColumn(
        modifier = Modifier.fillMaxSize().background(palette.background),
        contentPadding = PaddingValues(SolvioTheme.Spacing.md),
        verticalArrangement = Arrangement.spacedBy(SolvioTheme.Spacing.lg),
    ) {
        item {
            NBScreenHeader(
                eyebrow = locale.t("deals.eyebrow"),
                title = locale.t("deals.headerTitle"),
                subtitle = locale.t("deals.headerSubtitle"),
            )
        }
        item { TrendingSection(vm = vm, onOpenUrl = { url -> openUrl(ctx, url) }) }
        item {
            ShoppingListSection(
                vm = vm,
                items = items,
                onItemsChange = { items = it },
                lang = lang,
                currency = currency,
                onOpenUrl = { url -> openUrl(ctx, url) },
            )
        }
        item {
            AnalyzeReceiptSection(
                vm = vm,
                lang = lang,
                onOpenUrl = { url -> openUrl(ctx, url) },
            )
        }
        item { LauncherSection(onNavigate = onNavigate) }
        item { Spacer(Modifier.height(SolvioTheme.Spacing.xl)) }
    }
}

private fun openUrl(ctx: android.content.Context, url: String) {
    runCatching {
        val intent = Intent(Intent.ACTION_VIEW, Uri.parse(url))
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        ctx.startActivity(intent)
    }
}

// MARK: - Trending

@Composable
private fun TrendingSection(vm: OkazjeHubViewModel, onOpenUrl: (String) -> Unit) {
    val palette = LocalPalette.current
    val locale = LocalAppLocale.current
    val state by vm.promotions.collectAsState()

    Column(verticalArrangement = Arrangement.spacedBy(SolvioTheme.Spacing.sm)) {
        NBSectionHeader(
            eyebrow = locale.t("deals.trendingEyebrow"),
            title = locale.t("deals.trendingTitle"),
        )
        when (val s = state) {
            OkazjeHubViewModel.PromoState.Loading -> NBLoadingCard()
            is OkazjeHubViewModel.PromoState.Error -> NBErrorCard(message = s.message) { vm.loadPromotions() }
            is OkazjeHubViewModel.PromoState.Loaded -> {
                val visible = (s.data.personalizedDeals + s.data.promotions).take(3)
                if (visible.isEmpty()) {
                    NBCard(radius = SolvioTheme.Radius.md) {
                        NBEmptyState(
                            title = locale.t("deals.trendingEmpty"),
                            subtitle = locale.t("deals.trendingEmptySub"),
                        )
                    }
                } else {
                    Column(verticalArrangement = Arrangement.spacedBy(SolvioTheme.Spacing.xs)) {
                        visible.forEach { offer -> TrendingCard(offer, onOpenUrl) }
                    }
                }
            }
        }
    }
}

@Composable
private fun TrendingCard(offer: PromoOffer, onOpenUrl: (String) -> Unit) {
    val palette = LocalPalette.current
    val locale = LocalAppLocale.current
    val leaflet = offer.leafletUrl ?: offer.dealUrl
    val cur = offer.currency ?: "PLN"

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .nbCard(palette, radius = SolvioTheme.Radius.md, shadow = SolvioTheme.Shadow.sm)
            .let { if (leaflet != null) it.clickable { onOpenUrl(leaflet) } else it }
            .padding(SolvioTheme.Spacing.sm),
        horizontalArrangement = Arrangement.spacedBy(SolvioTheme.Spacing.sm),
        verticalAlignment = Alignment.Top,
    ) {
        Box(
            modifier = Modifier
                .size(40.dp)
                .clip(RoundedCornerShape(SolvioTheme.Radius.sm))
                .background(palette.foreground.copy(alpha = 0.08f))
                .border(SolvioTheme.Border.widthThin, palette.border, RoundedCornerShape(SolvioTheme.Radius.sm)),
            contentAlignment = Alignment.Center,
        ) { Text("🏷", style = SolvioFonts.bold(18)) }
        Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(
                offer.productName ?: offer.store ?: "—",
                style = SolvioFonts.bodyMedium.copy(color = palette.foreground),
                maxLines = 2,
            )
            offer.store?.takeIf { it.isNotBlank() && offer.productName != null }?.let {
                Text(it, style = SolvioFonts.caption.copy(color = palette.mutedForeground))
            }
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                offer.promoPrice?.let {
                    Text(Fmt.amount(it, cur), style = SolvioFonts.monoBold(13).copy(color = palette.foreground))
                }
                if (offer.regularPrice != null && offer.promoPrice != null && offer.regularPrice > offer.promoPrice) {
                    Text(
                        Fmt.amount(offer.regularPrice, cur),
                        style = SolvioFonts.mono(10).copy(color = palette.mutedForeground, textDecoration = TextDecoration.LineThrough),
                    )
                }
                offer.discount?.takeIf { it.isNotBlank() }?.let { d ->
                    NBTag(text = d, background = palette.success.copy(alpha = 0.15f), foreground = palette.success)
                }
                offer.validUntil?.takeIf { it.isNotBlank() }?.let {
                    Text(
                        locale.format("deals.validUntilFmt", Fmt.date(it)),
                        style = SolvioFonts.mono(10).copy(color = palette.mutedForeground),
                    )
                }
            }
        }
        if (leaflet != null) {
            Text("↗", style = SolvioFonts.bold(14).copy(color = palette.foreground))
        }
    }
}

// MARK: - Shopping list AI

@Composable
private fun ShoppingListSection(
    vm: OkazjeHubViewModel,
    items: List<ShoppingItemDraft>,
    onItemsChange: (List<ShoppingItemDraft>) -> Unit,
    lang: AppLocale.Language,
    currency: String,
    onOpenUrl: (String) -> Unit,
) {
    val palette = LocalPalette.current
    val locale = LocalAppLocale.current
    val toast = LocalToast.current
    val state by vm.optimize.collectAsState()
    val canSubmit = items.any { it.name.isNotBlank() }
    val isLoading = state is OkazjeHubViewModel.OptimizeState.Loading

    Column(verticalArrangement = Arrangement.spacedBy(SolvioTheme.Spacing.sm)) {
        NBSectionHeader(
            eyebrow = locale.t("shoppingList.eyebrow"),
            title = locale.t("shoppingList.title"),
        )
        Text(locale.t("shoppingList.subtitle"), style = SolvioFonts.caption.copy(color = palette.mutedForeground))

        Column(verticalArrangement = Arrangement.spacedBy(SolvioTheme.Spacing.xs)) {
            items.forEachIndexed { idx, item ->
                ShoppingRow(
                    item = item,
                    onChange = { updated ->
                        onItemsChange(items.toMutableList().also { it[idx] = updated })
                    },
                    onRemove = if (items.size > 1) {
                        { onItemsChange(items.filterIndexed { i, _ -> i != idx }) }
                    } else null,
                )
            }
            Box(
                modifier = Modifier
                    .clip(RoundedCornerShape(SolvioTheme.Radius.sm))
                    .clickable { onItemsChange(items + ShoppingItemDraft()) }
                    .padding(horizontal = 4.dp, vertical = 6.dp),
            ) {
                Text(
                    "+ ${locale.t("shoppingList.addRow").uppercase()}",
                    style = SolvioFonts.mono(11).copy(color = palette.foreground),
                )
            }
        }

        NBPrimaryButton(
            label = if (isLoading) locale.t("shoppingList.analyzing") else locale.t("shoppingList.optimize"),
            enabled = !isLoading && canSubmit,
            loading = isLoading,
            onClick = {
                val req = items
                    .filter { it.name.isNotBlank() }
                    .map { ShoppingOptimizeRequest.Item(it.name.trim(), it.qtyText.replace(',', '.').toDoubleOrNull() ?: 1.0) }
                vm.runOptimize(req, lang.code, currency)
            },
        )

        when (val s = state) {
            OkazjeHubViewModel.OptimizeState.Idle, OkazjeHubViewModel.OptimizeState.Loading -> Unit
            is OkazjeHubViewModel.OptimizeState.Error -> NBErrorCard(message = s.message) {
                val req = items
                    .filter { it.name.isNotBlank() }
                    .map { ShoppingOptimizeRequest.Item(it.name.trim(), it.qtyText.replace(',', '.').toDoubleOrNull() ?: 1.0) }
                vm.runOptimize(req, lang.code, currency)
            }
            is OkazjeHubViewModel.OptimizeState.Loaded -> ShoppingResultCard(s.data, onOpenUrl)
        }
    }
}

@Composable
private fun ShoppingRow(
    item: ShoppingItemDraft,
    onChange: (ShoppingItemDraft) -> Unit,
    onRemove: (() -> Unit)?,
) {
    val palette = LocalPalette.current
    val locale = LocalAppLocale.current
    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(SolvioTheme.Spacing.xs),
    ) {
        Box(modifier = Modifier.weight(1f)) {
            NBTextField(
                value = item.name,
                onChange = { onChange(item.copy(name = it)) },
                placeholder = locale.t("shoppingList.itemNamePh"),
            )
        }
        Box(modifier = Modifier.width(72.dp)) {
            NBTextField(
                value = item.qtyText,
                onChange = { onChange(item.copy(qtyText = it)) },
                keyboardType = KeyboardType.Decimal,
            )
        }
        if (onRemove != null) {
            Text(
                "✕",
                style = SolvioFonts.bold(14).copy(color = palette.mutedForeground),
                modifier = Modifier.clickable { onRemove() }.padding(8.dp),
            )
        }
    }
}

@Composable
private fun ShoppingResultCard(r: ShoppingOptimizeResult, onOpenUrl: (String) -> Unit) {
    val palette = LocalPalette.current
    val locale = LocalAppLocale.current
    val cur = r.currency

    NBCard(radius = SolvioTheme.Radius.lg, shadow = SolvioTheme.Shadow.lg) {
        // Hero row
        Row(verticalAlignment = Alignment.Top, horizontalArrangement = Arrangement.spacedBy(SolvioTheme.Spacing.sm)) {
            Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                NBEyebrow(text = locale.t("shoppingList.bestStore"))
                Text(r.bestStore, style = SolvioFonts.cardTitle.copy(color = palette.foreground))
                r.bestStoreAddress?.takeIf { it.isNotBlank() }?.let {
                    Text(it, style = SolvioFonts.caption.copy(color = palette.mutedForeground))
                }
            }
            DataSourceBadge(r.dataSource)
        }
        Spacer(Modifier.height(SolvioTheme.Spacing.sm))
        Row(horizontalArrangement = Arrangement.spacedBy(SolvioTheme.Spacing.md)) {
            Column {
                Text(locale.t("shoppingList.total"), style = SolvioFonts.mono(10).copy(color = palette.mutedForeground))
                Text(Fmt.amount(r.bestTotal, cur), style = SolvioFonts.amount.copy(color = palette.foreground))
            }
            r.savings?.takeIf { it > 0 }?.let { sav ->
                Column {
                    Text(locale.t("shoppingList.savings"), style = SolvioFonts.mono(10).copy(color = palette.mutedForeground))
                    Text(Fmt.amount(sav, cur), style = SolvioFonts.amount.copy(color = palette.success))
                }
            }
        }
        r.summary?.takeIf { it.isNotBlank() }?.let { sum ->
            Spacer(Modifier.height(SolvioTheme.Spacing.xs))
            Text(sum, style = SolvioFonts.body.copy(color = palette.foreground))
        }

        if (r.bestStoreItems.isNotEmpty()) {
            Spacer(Modifier.height(SolvioTheme.Spacing.sm))
            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                r.bestStoreItems.forEach { line ->
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(line.name, style = SolvioFonts.body.copy(color = palette.foreground), modifier = Modifier.weight(1f))
                        line.qty?.let { Text("× ${formatQty(it)}", style = SolvioFonts.mono(11).copy(color = palette.mutedForeground)) }
                        Spacer(Modifier.width(8.dp))
                        Text(Fmt.amount(line.total, cur), style = SolvioFonts.mono(12).copy(color = palette.foreground))
                    }
                    val chip = promoChip(line.promoType, locale)
                    if (chip != null) {
                        Row(modifier = Modifier.padding(start = 8.dp)) {
                            NBTag(text = chip, background = palette.warning.copy(alpha = 0.15f), foreground = palette.warning)
                        }
                    }
                }
            }
        }

        if (r.alternatives.isNotEmpty()) {
            Spacer(Modifier.height(SolvioTheme.Spacing.sm))
            NBEyebrow(text = locale.t("shoppingList.alternatives"))
            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                r.alternatives.forEach { alt ->
                    Row {
                        Text(alt.store, style = SolvioFonts.body.copy(color = palette.foreground), modifier = Modifier.weight(1f))
                        Text(Fmt.amount(alt.total, cur), style = SolvioFonts.mono(12).copy(color = palette.foreground))
                    }
                }
            }
        }

        r.multiStoreStrategy?.let { strat ->
            Spacer(Modifier.height(SolvioTheme.Spacing.md))
            MultiStoreSection(strat, cur)
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
                horizontalArrangement = Arrangement.spacedBy(SolvioTheme.Spacing.xs),
            ) {
                Text("💡", style = SolvioFonts.body)
                Text(tip, style = SolvioFonts.caption.copy(color = palette.foreground))
            }
        }

        r.sources?.takeIf { it.isNotEmpty() }?.let { sources ->
            Spacer(Modifier.height(SolvioTheme.Spacing.xs))
            NBEyebrow(text = locale.t("shoppingList.sources"))
            Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                sources.forEach { url ->
                    Text(
                        prettyHost(url),
                        style = SolvioFonts.mono(11).copy(color = palette.foreground),
                        modifier = Modifier.clickable { onOpenUrl(url) },
                    )
                }
            }
        }

        Spacer(Modifier.height(SolvioTheme.Spacing.xs))
        FreshnessFooter(r)
    }
}

@Composable
private fun MultiStoreSection(strat: MultiStoreStrategy, currency: String) {
    val palette = LocalPalette.current
    val locale = LocalAppLocale.current
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(SolvioTheme.Radius.md))
            .background(palette.muted)
            .padding(SolvioTheme.Spacing.sm),
        verticalArrangement = Arrangement.spacedBy(SolvioTheme.Spacing.xs),
    ) {
        NBEyebrow(text = locale.t("shoppingList.multiStore"))
        Text(locale.t("shoppingList.multiStoreSubtitle"), style = SolvioFonts.caption.copy(color = palette.mutedForeground))
        Spacer(Modifier.height(SolvioTheme.Spacing.xs))
        strat.stores.forEach { partition ->
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .nbCard(palette, radius = SolvioTheme.Radius.sm, shadow = SolvioTheme.Shadow.sm)
                    .padding(SolvioTheme.Spacing.sm),
                verticalArrangement = Arrangement.spacedBy(4.dp),
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text("🏪", style = SolvioFonts.body)
                    Spacer(Modifier.width(6.dp))
                    Column(modifier = Modifier.weight(1f)) {
                        Text(partition.store, style = SolvioFonts.bodyMedium.copy(color = palette.foreground))
                        partition.address?.takeIf { it.isNotBlank() }?.let {
                            Text(it, style = SolvioFonts.caption.copy(color = palette.mutedForeground))
                        }
                    }
                    Text(Fmt.amount(partition.subtotal, currency), style = SolvioFonts.monoBold(13).copy(color = palette.foreground))
                }
                partition.items.forEach { line ->
                    Row {
                        Text(line.name, style = SolvioFonts.caption.copy(color = palette.foreground), modifier = Modifier.weight(1f))
                        line.qty?.let { Text("× ${formatQty(it)}", style = SolvioFonts.mono(10).copy(color = palette.mutedForeground)) }
                        Spacer(Modifier.width(6.dp))
                        Text(Fmt.amount(line.total, currency), style = SolvioFonts.mono(11).copy(color = palette.foreground))
                    }
                }
            }
        }
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(locale.t("shoppingList.grandTotal"), style = SolvioFonts.bodyMedium.copy(color = palette.foreground), modifier = Modifier.weight(1f))
            Text(Fmt.amount(strat.grandTotal, currency), style = SolvioFonts.monoBold(14).copy(color = palette.foreground))
        }
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(
                locale.t("shoppingList.savingsVsSingle"),
                style = SolvioFonts.caption.copy(color = palette.mutedForeground),
                modifier = Modifier.weight(1f),
            )
            Text(Fmt.amount(strat.savingsVsSingle, currency), style = SolvioFonts.monoBold(13).copy(color = palette.success))
        }
        strat.rationale?.takeIf { it.isNotBlank() }?.let {
            Text(it, style = SolvioFonts.caption.copy(color = palette.mutedForeground))
        }
    }
}

@Composable
private fun FreshnessFooter(r: ShoppingOptimizeResult) {
    val palette = LocalPalette.current
    val locale = LocalAppLocale.current
    val time = parseInstantTime(r.fetchedAt)
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        if (time != null) {
            Text(
                locale.format("shoppingList.freshAt", time),
                style = SolvioFonts.mono(10).copy(color = palette.mutedForeground),
            )
        }
        r.cacheState?.let { state ->
            val (label, color) = when (state.lowercase()) {
                "live", "fresh" -> locale.t("shoppingList.cacheLive") to palette.success
                "stale", "cached" -> locale.t("shoppingList.cacheStale") to palette.warning
                "refreshing", "refresh" -> locale.t("shoppingList.cacheRefresh") to palette.info
                else -> state.uppercase() to palette.mutedForeground
            }
            NBTag(text = label, background = color.copy(alpha = 0.15f), foreground = color)
        }
    }
}

@Composable
private fun DataSourceBadge(value: String?) {
    val palette = LocalPalette.current
    val locale = LocalAppLocale.current
    val (label, color) = when (value?.lowercase()) {
        "live", "real", "fresh" -> locale.t("shoppingList.badgeLive") to palette.success
        "estimate", "estimated", "ai" -> locale.t("shoppingList.badgeEstimate") to palette.warning
        else -> locale.t("shoppingList.badgeUnknown") to palette.mutedForeground
    }
    NBTag(text = label, background = color.copy(alpha = 0.15f), foreground = color)
}

private fun promoChip(type: String?, locale: AppLocale): String? {
    return when (type?.lowercase()) {
        null, "", "regular", "none" -> null
        "multibuy", "x2", "two_for_one", "twofortwo" -> locale.t("shoppingList.promoX2")
        "bundle" -> locale.t("shoppingList.promoBundle")
        "loyalty", "card" -> locale.t("shoppingList.promoLoyalty")
        "percent", "percentage", "percent_off" -> locale.t("shoppingList.promoPercent")
        else -> locale.t("shoppingList.promoMulti")
    }
}

private fun parseInstantTime(iso: String?): String? {
    if (iso.isNullOrBlank()) return null
    return runCatching {
        val instant = Instant.parse(iso)
        DateTimeFormatter.ofPattern("HH:mm").withZone(ZoneId.systemDefault()).format(instant)
    }.getOrNull()
}

private fun prettyHost(url: String): String {
    return runCatching {
        val u = Uri.parse(url)
        val host = u.host ?: url
        host.removePrefix("www.")
    }.getOrElse { url }
}

private fun formatQty(q: Double): String {
    return if (q == q.toLong().toDouble()) q.toLong().toString() else "%.2f".format(q)
}

// MARK: - Analyze Receipt

@Composable
private fun AnalyzeReceiptSection(
    vm: OkazjeHubViewModel,
    lang: AppLocale.Language,
    onOpenUrl: (String) -> Unit,
) {
    val palette = LocalPalette.current
    val locale = LocalAppLocale.current
    val state by vm.receipts.collectAsState()
    val analyze by vm.analyze.collectAsState()

    Column(verticalArrangement = Arrangement.spacedBy(SolvioTheme.Spacing.sm)) {
        NBSectionHeader(
            eyebrow = locale.t("analyze.eyebrow"),
            title = locale.t("analyze.title"),
        )
        Text(locale.t("analyze.subtitle"), style = SolvioFonts.caption.copy(color = palette.mutedForeground))

        when (val s = state) {
            OkazjeHubViewModel.ReceiptsState.Loading -> NBLoadingCard()
            is OkazjeHubViewModel.ReceiptsState.Error -> NBErrorCard(message = s.message) { vm.loadReceipts() }
            is OkazjeHubViewModel.ReceiptsState.Loaded -> {
                if (s.items.isEmpty()) {
                    NBCard(radius = SolvioTheme.Radius.md) {
                        NBEmptyState(
                            title = locale.t("analyze.emptyTitle"),
                            subtitle = locale.t("analyze.emptySub"),
                        )
                    }
                } else {
                    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        s.items.forEach { r ->
                            ReceiptRow(
                                r = r,
                                onClick = { vm.runAnalyze(r.id, lang.code) },
                                isLoading = (analyze as? OkazjeHubViewModel.AnalyzeState.Loading)?.receiptId == r.id,
                            )
                        }
                    }
                }
            }
        }

        when (val a = analyze) {
            OkazjeHubViewModel.AnalyzeState.Idle -> Unit
            is OkazjeHubViewModel.AnalyzeState.Loading -> {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    androidx.compose.material3.CircularProgressIndicator(modifier = Modifier.size(16.dp), strokeWidth = 2.dp, color = palette.foreground)
                    Text(locale.t("analyze.running"), style = SolvioFonts.caption.copy(color = palette.mutedForeground))
                }
            }
            is OkazjeHubViewModel.AnalyzeState.Error -> NBErrorCard(message = a.message) {
                vm.runAnalyze(a.receiptId, lang.code)
            }
            is OkazjeHubViewModel.AnalyzeState.Loaded -> ReceiptAnalyzeCard(a.data, onOpenUrl)
        }
    }
}

@Composable
private fun ReceiptRow(r: Receipt, onClick: () -> Unit, isLoading: Boolean) {
    val palette = LocalPalette.current
    val locale = LocalAppLocale.current
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .nbCard(palette, radius = SolvioTheme.Radius.md, shadow = SolvioTheme.Shadow.sm)
            .clickable(enabled = !isLoading) { onClick() }
            .padding(SolvioTheme.Spacing.sm),
        horizontalArrangement = Arrangement.spacedBy(SolvioTheme.Spacing.sm),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            modifier = Modifier
                .size(32.dp)
                .clip(RoundedCornerShape(SolvioTheme.Radius.sm))
                .background(palette.muted)
                .border(SolvioTheme.Border.widthThin, palette.border, RoundedCornerShape(SolvioTheme.Radius.sm)),
            contentAlignment = Alignment.Center,
        ) { Text("📄", style = SolvioFonts.body) }
        Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(r.vendor ?: locale.t("analyze.unknownVendor"), style = SolvioFonts.bodyMedium.copy(color = palette.foreground))
            r.date?.let { Text(Fmt.date(it), style = SolvioFonts.caption.copy(color = palette.mutedForeground)) }
        }
        r.total?.let {
            Text(Fmt.amount(it.toDouble(), r.currency ?: "PLN"), style = SolvioFonts.mono(12).copy(color = palette.foreground))
        }
        if (isLoading) {
            androidx.compose.material3.CircularProgressIndicator(modifier = Modifier.size(14.dp), strokeWidth = 2.dp, color = palette.foreground)
        } else {
            Text("›", style = SolvioFonts.bold(16).copy(color = palette.mutedForeground))
        }
    }
}

@Composable
private fun ReceiptAnalyzeCard(a: ReceiptAnalyzeResponse, onOpenUrl: (String) -> Unit) {
    val palette = LocalPalette.current
    val locale = LocalAppLocale.current
    val cur = a.currency

    NBCard(radius = SolvioTheme.Radius.lg, shadow = SolvioTheme.Shadow.lg) {
        Row(verticalAlignment = Alignment.Top) {
            Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                NBEyebrow(text = locale.t("analyze.savings"))
                Text(a.vendor ?: "—", style = SolvioFonts.bodyMedium.copy(color = palette.mutedForeground))
            }
            DataSourceBadge(a.dataSource)
        }
        Spacer(Modifier.height(SolvioTheme.Spacing.sm))
        Text(Fmt.amount(a.potentialSavings, cur), style = SolvioFonts.hero.copy(color = palette.success))

        Spacer(Modifier.height(SolvioTheme.Spacing.sm))
        Row(horizontalArrangement = Arrangement.spacedBy(SolvioTheme.Spacing.md)) {
            Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                Text(locale.t("analyze.paid"), style = SolvioFonts.mono(10).copy(color = palette.mutedForeground))
                Text(Fmt.amount(a.paidTotal, cur), style = SolvioFonts.bodyMedium.copy(color = palette.foreground))
            }
            Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                Text(locale.t("analyze.bestPossible"), style = SolvioFonts.mono(10).copy(color = palette.mutedForeground))
                Text(Fmt.amount(a.bestPossibleTotal, cur), style = SolvioFonts.bodyMedium.copy(color = palette.success))
            }
        }

        if (a.items.isNotEmpty()) {
            Spacer(Modifier.height(SolvioTheme.Spacing.sm))
            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                a.items.forEach { item -> AnalyzedItemRow(item, cur) }
            }
        }

        a.summary?.takeIf { it.isNotBlank() }?.let { sum ->
            Spacer(Modifier.height(SolvioTheme.Spacing.xs))
            NBEyebrow(text = locale.t("analyze.summary"))
            Text(sum, style = SolvioFonts.body.copy(color = palette.foreground))
        }

        a.tip?.takeIf { it.isNotBlank() }?.let { tip ->
            Spacer(Modifier.height(SolvioTheme.Spacing.xs))
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(SolvioTheme.Radius.md))
                    .background(palette.warning.copy(alpha = 0.08f))
                    .border(SolvioTheme.Border.widthThin, palette.warning, RoundedCornerShape(SolvioTheme.Radius.md))
                    .padding(SolvioTheme.Spacing.sm),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Text("💡", style = SolvioFonts.body)
                Text(tip, style = SolvioFonts.caption.copy(color = palette.foreground))
            }
        }

        a.sources?.takeIf { it.isNotEmpty() }?.let { sources ->
            Spacer(Modifier.height(SolvioTheme.Spacing.xs))
            NBEyebrow(text = locale.t("analyze.sources"))
            Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                sources.forEach { url ->
                    Text(
                        prettyHost(url),
                        style = SolvioFonts.mono(11).copy(color = palette.foreground),
                        modifier = Modifier.clickable { onOpenUrl(url) },
                    )
                }
            }
        }
    }
}

@Composable
private fun AnalyzedItemRow(item: ReceiptAnalyzeResponse.AnalyzedItem, currency: String) {
    val palette = LocalPalette.current
    val locale = LocalAppLocale.current
    Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(item.name, style = SolvioFonts.body.copy(color = palette.foreground), modifier = Modifier.weight(1f))
            VerdictTag(item.verdict)
        }
        Row(verticalAlignment = Alignment.CenterVertically) {
            item.qty?.let {
                Text("× ${formatQty(it)}", style = SolvioFonts.mono(11).copy(color = palette.mutedForeground))
                Spacer(Modifier.width(8.dp))
            }
            item.paidTotal?.let {
                Text(Fmt.amount(it, currency), style = SolvioFonts.mono(12).copy(color = palette.foreground))
            }
            Spacer(Modifier.weight(1f))
            if (item.savings != 0.0) {
                Text(
                    "−${Fmt.amount(item.savings, currency)}",
                    style = SolvioFonts.mono(11).copy(color = palette.success),
                )
            }
        }
        item.bestStore?.takeIf { it.isNotBlank() }?.let { store ->
            Text(
                locale.format("analyze.cheaperAtFmt", store),
                style = SolvioFonts.caption.copy(color = palette.mutedForeground),
            )
        }
        val chip = promoChip(item.promoType, locale)
        if (chip != null) {
            NBTag(text = chip, background = palette.warning.copy(alpha = 0.15f), foreground = palette.warning)
        }
    }
}

@Composable
private fun VerdictTag(verdict: String) {
    val palette = LocalPalette.current
    val locale = LocalAppLocale.current
    val (text, color) = when (verdict.lowercase()) {
        "overpaid" -> locale.t("analyze.verdictOverpaid") to palette.destructive
        "fair" -> locale.t("analyze.verdictFair") to palette.success
        "underpaid", "good" -> locale.t("analyze.verdictUnderpaid") to palette.success
        "no_data", "missing" -> locale.t("analyze.verdictNoData") to palette.mutedForeground
        else -> verdict.uppercase() to palette.mutedForeground
    }
    NBTag(text = text, background = color.copy(alpha = 0.15f), foreground = color)
}

// MARK: - Launcher

@Composable
private fun LauncherSection(onNavigate: (String) -> Unit) {
    val palette = LocalPalette.current
    val locale = LocalAppLocale.current
    Column(verticalArrangement = Arrangement.spacedBy(SolvioTheme.Spacing.sm)) {
        NBSectionHeader(
            eyebrow = locale.t("deals.launcherEyebrow"),
            title = locale.t("deals.launcherTitle"),
        )
        Row(horizontalArrangement = Arrangement.spacedBy(SolvioTheme.Spacing.xs)) {
            LauncherTile(
                icon = "💰",
                title = locale.t("deals.tilePrices"),
                subtitle = locale.t("deals.tilePricesSub"),
                modifier = Modifier.weight(1f),
                onClick = { onNavigate("prices") },
            )
            LauncherTile(
                icon = "📍",
                title = locale.t("deals.tileNearby"),
                subtitle = locale.t("deals.tileNearbySub"),
                modifier = Modifier.weight(1f),
                onClick = { onNavigate("nearby") },
            )
        }
        Row(horizontalArrangement = Arrangement.spacedBy(SolvioTheme.Spacing.xs)) {
            LauncherTile(
                icon = "🛒",
                title = locale.t("deals.tileAudit"),
                subtitle = locale.t("deals.tileAuditSub"),
                modifier = Modifier.weight(1f),
                onClick = { onNavigate("audit") },
            )
            LauncherTile(
                icon = "🤖",
                title = locale.t("deals.tileAdvisor"),
                subtitle = locale.t("deals.tileAdvisorSub"),
                modifier = Modifier.weight(1f),
                onClick = { onNavigate("advisor") },
            )
        }
    }
}

@Composable
private fun LauncherTile(
    icon: String,
    title: String,
    subtitle: String,
    modifier: Modifier = Modifier,
    onClick: () -> Unit,
) {
    val palette = LocalPalette.current
    Column(
        modifier = modifier
            .nbCard(palette, radius = SolvioTheme.Radius.md, shadow = SolvioTheme.Shadow.sm)
            .clickable(onClick = onClick)
            .padding(SolvioTheme.Spacing.md),
        verticalArrangement = Arrangement.spacedBy(SolvioTheme.Spacing.xs),
    ) {
        Text(icon, style = SolvioFonts.bold(28))
        Text(title, style = SolvioFonts.bodyMedium.copy(color = palette.foreground))
        Text(subtitle, style = SolvioFonts.caption.copy(color = palette.mutedForeground))
    }
}
