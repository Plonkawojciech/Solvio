package com.programo.solvio.features.shoppingadvisor

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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import com.programo.solvio.LocalAppLocale
import com.programo.solvio.core.AppLocale
import com.programo.solvio.core.Fmt
import com.programo.solvio.core.models.AdvisorInsight
import com.programo.solvio.core.models.AdvisorRecommendation
import com.programo.solvio.core.models.AdvisorStorePlan
import com.programo.solvio.core.models.AdvisorWeeklyPlan
import com.programo.solvio.core.models.ShoppingAdvisorResponse
import com.programo.solvio.core.network.ShoppingAdvisorRepo
import com.programo.solvio.core.theme.LocalPalette
import com.programo.solvio.core.theme.SolvioFonts
import com.programo.solvio.core.theme.SolvioTheme
import com.programo.solvio.core.theme.nbCard
import com.programo.solvio.core.ui.NBCard
import com.programo.solvio.core.ui.NBErrorCard
import com.programo.solvio.core.ui.NBEyebrow
import com.programo.solvio.core.ui.NBLoadingCard
import com.programo.solvio.core.ui.NBPrimaryButton
import com.programo.solvio.core.ui.NBScreenHeader
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch

/// Shopping advisor — mirrors `Features/ShoppingAdvisor/ShoppingAdvisorView.swift`.
/// Header + "Run advisor" button calling `ShoppingAdvisorRepo.fetch(lang, currency)`.
/// Result: recommendations list (productName + verdict tag + savings + alternative
/// stores expandable) + weekly plan (per-store totals + insights cards).
class ShoppingAdvisorViewModel : ViewModel() {
    sealed class UiState {
        object Idle : UiState()
        object Loading : UiState()
        data class Loaded(val data: ShoppingAdvisorResponse) : UiState()
        data class Error(val message: String) : UiState()
    }

    private val _state = MutableStateFlow<UiState>(UiState.Idle)
    val state: StateFlow<UiState> = _state

    fun run(lang: AppLocale.Language, currency: String) {
        viewModelScope.launch {
            _state.value = UiState.Loading
            try {
                val r = ShoppingAdvisorRepo.fetch(lang = lang.code, currency = currency)
                if (!r.error.isNullOrBlank()) {
                    _state.value = UiState.Error(r.error)
                } else {
                    _state.value = UiState.Loaded(r)
                }
            } catch (e: Throwable) {
                _state.value = UiState.Error(e.message ?: "Failed")
            }
        }
    }
}

@Composable
fun ShoppingAdvisorScreen() {
    val palette = LocalPalette.current
    val locale = LocalAppLocale.current
    val vm: ShoppingAdvisorViewModel = viewModel()
    val state by vm.state.collectAsState()
    val lang by locale.language.collectAsState()
    val currency = "PLN"

    LazyColumn(
        modifier = Modifier.fillMaxSize().background(palette.background),
        contentPadding = PaddingValues(SolvioTheme.Spacing.md),
        verticalArrangement = Arrangement.spacedBy(SolvioTheme.Spacing.md),
    ) {
        item {
            NBScreenHeader(
                eyebrow = locale.t("advisor.eyebrow"),
                title = locale.t("advisor.title"),
                subtitle = locale.t("advisor.subtitle"),
            )
        }
        item {
            NBCard(radius = SolvioTheme.Radius.md, shadow = SolvioTheme.Shadow.sm) {
                Text(locale.t("advisor.description"), style = SolvioFonts.body.copy(color = palette.mutedForeground))
                Spacer(Modifier.height(SolvioTheme.Spacing.sm))
                val isLoading = state is ShoppingAdvisorViewModel.UiState.Loading
                NBPrimaryButton(
                    label = if (isLoading) locale.t("advisor.analyzing") else locale.t("advisor.generate"),
                    enabled = !isLoading,
                    loading = isLoading,
                    onClick = { vm.run(lang, currency) },
                )
            }
        }

        when (val s = state) {
            ShoppingAdvisorViewModel.UiState.Idle -> Unit
            ShoppingAdvisorViewModel.UiState.Loading -> item { NBLoadingCard() }
            is ShoppingAdvisorViewModel.UiState.Error -> item {
                NBErrorCard(message = s.message) { vm.run(lang, currency) }
            }
            is ShoppingAdvisorViewModel.UiState.Loaded -> {
                val r = s.data
                r.summary?.takeIf { it.isNotBlank() }?.let { sum ->
                    item { SummaryBlock(sum) }
                }
                item { HeroStats(r, currency) }
                r.recommendations?.takeIf { it.isNotEmpty() }?.let { recs ->
                    item { Text(locale.t("advisor.recommendationsTitle"), style = SolvioFonts.eyebrow.copy(color = palette.mutedForeground)) }
                    items(recs.size) { idx -> RecommendationCard(recs[idx], currency) }
                }
                r.weeklyPlan?.let { plan ->
                    if (!plan.stores.isNullOrEmpty()) {
                        item { WeeklyPlanSection(plan, currency) }
                    }
                }
                r.topInsights?.takeIf { it.isNotEmpty() }?.let { insights ->
                    item { Text(locale.t("advisor.insightsTitle"), style = SolvioFonts.eyebrow.copy(color = palette.mutedForeground)) }
                    items(insights.size) { idx -> InsightCard(insights[idx]) }
                }
            }
        }

        item { Spacer(Modifier.height(SolvioTheme.Spacing.xl)) }
    }
}

@Composable
private fun SummaryBlock(summary: String) {
    val palette = LocalPalette.current
    val locale = LocalAppLocale.current
    NBCard(radius = SolvioTheme.Radius.md, shadow = SolvioTheme.Shadow.sm) {
        NBEyebrow(text = locale.t("advisor.summaryTitle"))
        Spacer(Modifier.height(4.dp))
        Text(summary, style = SolvioFonts.body.copy(color = palette.foreground))
    }
}

@Composable
private fun HeroStats(r: ShoppingAdvisorResponse, currency: String) {
    val palette = LocalPalette.current
    val locale = LocalAppLocale.current
    Row(horizontalArrangement = Arrangement.spacedBy(SolvioTheme.Spacing.sm)) {
        StatBadge(
            icon = "↓",
            tint = palette.success,
            label = locale.t("advisor.savings"),
            value = "${Fmt.amount(r.totalPotentialMonthlySavings ?: 0.0, currency)}${locale.t("advisor.perMonth")}",
            modifier = Modifier.weight(1f),
        )
        StatBadge(
            icon = "🏪",
            tint = palette.foreground,
            label = locale.t("advisor.bestStore"),
            value = r.bestOverallStore ?: "—",
            modifier = Modifier.weight(1f),
        )
    }
}

@Composable
private fun StatBadge(icon: String, tint: Color, label: String, value: String, modifier: Modifier = Modifier) {
    val palette = LocalPalette.current
    Column(
        modifier = modifier
            .nbCard(palette, radius = SolvioTheme.Radius.md, shadow = SolvioTheme.Shadow.sm)
            .padding(SolvioTheme.Spacing.md),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(SolvioTheme.Spacing.xs),
    ) {
        Text(icon, style = SolvioFonts.bold(20).copy(color = tint))
        Text(label, style = SolvioFonts.mono(10).copy(color = palette.mutedForeground))
        Text(value, style = SolvioFonts.bold(16).copy(color = palette.foreground), maxLines = 1)
    }
}

@Composable
private fun RecommendationCard(rec: AdvisorRecommendation, currency: String) {
    val palette = LocalPalette.current
    val locale = LocalAppLocale.current
    var altsExpanded by remember { mutableStateOf(false) }

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .nbCard(palette, radius = SolvioTheme.Radius.md, shadow = SolvioTheme.Shadow.sm)
            .padding(SolvioTheme.Spacing.md),
        verticalArrangement = Arrangement.spacedBy(SolvioTheme.Spacing.xs),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(rec.productName, style = SolvioFonts.bodyMedium.copy(color = palette.foreground), modifier = Modifier.weight(1f), maxLines = 2)
            VerdictBadge(rec.verdict)
        }
        rec.category?.takeIf { it.isNotBlank() }?.let { cat ->
            Text(
                cat,
                style = SolvioFonts.mono(10).copy(color = palette.mutedForeground),
                modifier = Modifier
                    .clip(RoundedCornerShape(SolvioTheme.Radius.sm))
                    .background(palette.muted)
                    .padding(horizontal = 6.dp, vertical = 2.dp),
            )
        }
        Row(horizontalArrangement = Arrangement.spacedBy(SolvioTheme.Spacing.md)) {
            Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                Text(locale.t("advisor.yourPrice"), style = SolvioFonts.mono(10).copy(color = palette.mutedForeground))
                Text(Fmt.amount(rec.userAvgPrice ?: 0.0, currency), style = SolvioFonts.bodyMedium.copy(color = palette.foreground))
                rec.userLastStore?.takeIf { it.isNotBlank() }?.let {
                    Text(it, style = SolvioFonts.caption.copy(color = palette.mutedForeground))
                }
            }
            Text("→", style = SolvioFonts.bold(16).copy(color = palette.mutedForeground))
            Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp), horizontalAlignment = Alignment.End) {
                Text(locale.t("advisor.bestPrice"), style = SolvioFonts.mono(10).copy(color = palette.mutedForeground))
                Text(Fmt.amount(rec.bestPrice ?: 0.0, currency), style = SolvioFonts.bold(16).copy(color = palette.success))
                rec.bestStore?.takeIf { it.isNotBlank() }?.let {
                    Text(it, style = SolvioFonts.caption.copy(color = palette.success))
                }
            }
        }
        rec.bestDeal?.takeIf { it.isNotBlank() }?.let { deal ->
            Row(
                modifier = Modifier
                    .clip(RoundedCornerShape(SolvioTheme.Radius.sm))
                    .background(palette.warning.copy(alpha = 0.1f))
                    .padding(horizontal = 8.dp, vertical = 4.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(4.dp),
            ) {
                Text("🏷", style = SolvioFonts.body)
                Text(deal, style = SolvioFonts.caption.copy(color = palette.foreground))
            }
        }
        rec.tip?.takeIf { it.isNotBlank() }?.let { tip ->
            Text(tip, style = SolvioFonts.caption.copy(color = palette.mutedForeground))
        }
        rec.alternativeStores?.takeIf { it.isNotEmpty() }?.let { alts ->
            Row(
                modifier = Modifier.fillMaxWidth().clickable { altsExpanded = !altsExpanded },
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    locale.t("advisor.alternatives"),
                    style = SolvioFonts.mono(11).copy(color = palette.foreground),
                    modifier = Modifier.weight(1f),
                )
                Text(if (altsExpanded) "▲" else "▼", style = SolvioFonts.mono(10).copy(color = palette.foreground))
            }
            if (altsExpanded) {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(SolvioTheme.Radius.sm))
                        .background(palette.muted)
                        .padding(SolvioTheme.Spacing.xs),
                    verticalArrangement = Arrangement.spacedBy(4.dp),
                ) {
                    alts.forEach { alt ->
                        Row {
                            Text(alt.store, style = SolvioFonts.caption.copy(color = palette.foreground), modifier = Modifier.weight(1f))
                            alt.price?.let {
                                Text(Fmt.amount(it, currency), style = SolvioFonts.mono(11).copy(color = palette.foreground))
                            }
                        }
                        alt.deal?.takeIf { it.isNotBlank() }?.let {
                            Text(it, style = SolvioFonts.caption.copy(color = palette.mutedForeground))
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun VerdictBadge(verdict: String?) {
    val palette = LocalPalette.current
    val locale = LocalAppLocale.current
    val (text, color) = when (verdict) {
        "great_price" -> locale.t("advisor.verdict.greatPrice") to palette.success
        "good_price" -> locale.t("advisor.verdict.goodPrice") to palette.accent
        "could_save" -> locale.t("advisor.verdict.couldSave") to palette.warning
        "switch_store" -> locale.t("advisor.verdict.switchStore") to palette.warning
        "big_savings" -> locale.t("advisor.verdict.bigSavings") to palette.destructive
        else -> (verdict ?: "—") to palette.mutedForeground
    }
    Text(
        text,
        style = SolvioFonts.mono(10).copy(color = color),
        modifier = Modifier
            .clip(RoundedCornerShape(SolvioTheme.Radius.sm))
            .background(color.copy(alpha = 0.15f))
            .padding(horizontal = 8.dp, vertical = 4.dp),
    )
}

@Composable
private fun WeeklyPlanSection(plan: AdvisorWeeklyPlan, currency: String) {
    val palette = LocalPalette.current
    val locale = LocalAppLocale.current
    Column(verticalArrangement = Arrangement.spacedBy(SolvioTheme.Spacing.sm)) {
        NBEyebrow(text = locale.t("advisor.weeklyPlanTitle"), color = palette.mutedForeground)
        plan.totalSavings?.takeIf { it > 0 }?.let { savings ->
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .nbCard(palette, radius = SolvioTheme.Radius.sm, shadow = SolvioTheme.Shadow.sm)
                    .padding(SolvioTheme.Spacing.sm),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(SolvioTheme.Spacing.sm),
            ) {
                Text("↓", style = SolvioFonts.bold(16).copy(color = palette.success))
                Text(locale.t("advisor.weeklySavings"), style = SolvioFonts.body.copy(color = palette.foreground), modifier = Modifier.weight(1f))
                Text(Fmt.amount(savings, currency), style = SolvioFonts.bold(16).copy(color = palette.success))
            }
        }
        plan.stores?.forEach { store -> StorePlanCard(store, currency) }
    }
}

@Composable
private fun StorePlanCard(store: AdvisorStorePlan, currency: String) {
    val palette = LocalPalette.current
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .nbCard(palette, radius = SolvioTheme.Radius.md, shadow = SolvioTheme.Shadow.sm)
            .padding(SolvioTheme.Spacing.md),
        verticalArrangement = Arrangement.spacedBy(SolvioTheme.Spacing.xs),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text("🏪", style = SolvioFonts.body)
            Spacer(Modifier.width(6.dp))
            Text(store.store, style = SolvioFonts.bodyMedium.copy(color = palette.foreground), modifier = Modifier.weight(1f))
            store.estimatedTotal?.let {
                Text("~${Fmt.amount(it, currency)}", style = SolvioFonts.mono(12).copy(color = palette.mutedForeground))
            }
        }
        store.whyThisStore?.takeIf { it.isNotBlank() }?.let {
            Text(it, style = SolvioFonts.caption.copy(color = palette.mutedForeground))
        }
        store.products?.takeIf { it.isNotEmpty() }?.let { prods ->
            FlowRowCompat(spacing = 4.dp) {
                prods.forEach { p ->
                    Text(
                        p,
                        style = SolvioFonts.mono(10).copy(color = palette.foreground),
                        modifier = Modifier
                            .clip(RoundedCornerShape(SolvioTheme.Radius.sm))
                            .background(palette.muted)
                            .padding(horizontal = 8.dp, vertical = 3.dp),
                    )
                }
            }
        }
    }
}

@OptIn(androidx.compose.foundation.layout.ExperimentalLayoutApi::class)
@Composable
private fun FlowRowCompat(spacing: androidx.compose.ui.unit.Dp, content: @Composable () -> Unit) {
    androidx.compose.foundation.layout.FlowRow(
        horizontalArrangement = Arrangement.spacedBy(spacing),
        verticalArrangement = Arrangement.spacedBy(spacing),
    ) { content() }
}

@Composable
private fun InsightCard(insight: AdvisorInsight) {
    val palette = LocalPalette.current
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .nbCard(palette, radius = SolvioTheme.Radius.md, shadow = SolvioTheme.Shadow.sm)
            .padding(SolvioTheme.Spacing.md),
        horizontalArrangement = Arrangement.spacedBy(SolvioTheme.Spacing.sm),
        verticalAlignment = Alignment.Top,
    ) {
        Text(insight.icon ?: "💡", style = SolvioFonts.bold(20))
        Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(insight.title, style = SolvioFonts.bodyMedium.copy(color = palette.foreground))
            Text(insight.description, style = SolvioFonts.caption.copy(color = palette.mutedForeground))
        }
    }
}
