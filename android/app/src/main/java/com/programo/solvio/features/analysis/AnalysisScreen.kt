package com.programo.solvio.features.analysis

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
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import com.patrykandpatrick.vico.compose.cartesian.CartesianChartHost
import com.patrykandpatrick.vico.compose.cartesian.axis.rememberBottom
import com.patrykandpatrick.vico.compose.cartesian.axis.rememberStart
import com.patrykandpatrick.vico.compose.cartesian.layer.rememberColumnCartesianLayer
import com.patrykandpatrick.vico.compose.cartesian.rememberCartesianChart
import com.patrykandpatrick.vico.compose.cartesian.rememberVicoScrollState
import com.patrykandpatrick.vico.compose.common.component.rememberLineComponent
import com.patrykandpatrick.vico.compose.common.fill
import com.patrykandpatrick.vico.core.cartesian.axis.HorizontalAxis
import com.patrykandpatrick.vico.core.cartesian.axis.VerticalAxis
import com.patrykandpatrick.vico.core.cartesian.data.CartesianChartModelProducer
import com.patrykandpatrick.vico.core.cartesian.data.columnSeries
import com.patrykandpatrick.vico.core.cartesian.layer.ColumnCartesianLayer
import com.programo.solvio.LocalAppLocale
import com.programo.solvio.core.Fmt
import com.programo.solvio.core.models.AnalysisAnomaly
import com.programo.solvio.core.models.AnalysisBankStats
import com.programo.solvio.core.models.AnalysisInsight
import com.programo.solvio.core.models.AnalysisRecommendation
import com.programo.solvio.core.models.AnalysisResponse
import com.programo.solvio.core.models.CategoryTrend
import com.programo.solvio.core.network.AnalysisRepo
import com.programo.solvio.core.network.SettingsRepo
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
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Date
import java.util.Locale
import java.util.TimeZone

/// AI spending analysis — mirrors `Features/Analysis/AnalysisView.swift`.
/// Period picker auto re-runs `AnalysisRepo.run`, sections render summary,
/// predicted monthly spend hero, insights, recommendations, anomalies,
/// category trends (Vico column chart), bank stats and a weekday spend
/// Vico column chart derived from anomalies grouped by weekday.
class AnalysisViewModel : ViewModel() {
    enum class Period(val raw: String, val labelKey: String) {
        D7("7d", "analysis.period.7d"),
        D30("30d", "analysis.period.30d"),
        M3("3m", "analysis.period.3m"),
        M6("6m", "analysis.period.6m"),
        Y1("1y", "analysis.period.1y"),
        ALL("all", "analysis.period.all"),
    }

    sealed class UiState {
        object Idle : UiState()
        object Loading : UiState()
        data class Loaded(val data: AnalysisResponse) : UiState()
        data class Error(val message: String) : UiState()
    }

    private val _state = MutableStateFlow<UiState>(UiState.Idle)
    val state: StateFlow<UiState> = _state

    private val _period = MutableStateFlow(Period.M3)
    val period: StateFlow<Period> = _period

    private val _currency = MutableStateFlow("PLN")
    val currency: StateFlow<String> = _currency

    /// Per-period cache, 15 min TTL — matches iOS so flipping periods
    /// after a fresh run paints from cache instantly.
    private data class CacheEntry(val data: AnalysisResponse, val loadedAt: Long)
    private val cache = mutableMapOf<String, CacheEntry>()

    fun setPeriod(p: Period) {
        if (_period.value == p) return
        _period.value = p
        cachedFor(cacheKey())?.let { _state.value = UiState.Loaded(it) }
            ?: run(force = false)
    }

    fun loadCurrency() {
        viewModelScope.launch {
            runCatching { SettingsRepo.fetch() }.getOrNull()?.settings?.currency
                ?.takeIf { it.isNotBlank() }
                ?.let { _currency.value = it }
        }
    }

    fun run(force: Boolean) {
        val key = cacheKey()
        if (!force) cachedFor(key)?.let {
            _state.value = UiState.Loaded(it); return
        }
        viewModelScope.launch {
            _state.value = UiState.Loading
            try {
                val resp = AnalysisRepo.run(period = _period.value.raw)
                cache[key] = CacheEntry(resp, System.currentTimeMillis())
                _state.value = UiState.Loaded(resp)
            } catch (e: Throwable) {
                _state.value = UiState.Error(e.message ?: "Failed")
            }
        }
    }

    private fun cacheKey(): String = "${_period.value.raw}|${_currency.value}"
    private fun cachedFor(key: String): AnalysisResponse? {
        val entry = cache[key] ?: return null
        return if (System.currentTimeMillis() - entry.loadedAt < 900_000L) entry.data else null
    }
}

@Composable
fun AnalysisScreen() {
    val palette = LocalPalette.current
    val locale = LocalAppLocale.current
    val vm: AnalysisViewModel = viewModel()
    val state by vm.state.collectAsState()
    val period by vm.period.collectAsState()
    val currency by vm.currency.collectAsState()

    LaunchedEffect(Unit) { vm.loadCurrency() }

    LazyColumn(
        modifier = Modifier.fillMaxSize().background(palette.background),
        contentPadding = PaddingValues(SolvioTheme.Spacing.md),
        verticalArrangement = Arrangement.spacedBy(SolvioTheme.Spacing.md),
    ) {
        item {
            NBScreenHeader(
                eyebrow = locale.t("analysis.headerEyebrow"),
                title = locale.t("analysis.headerTitle"),
                subtitle = locale.t("analysis.headerSubtitle"),
            )
        }

        item { PeriodSelector(period, onPick = vm::setPeriod) }

        item {
            NBCard(radius = SolvioTheme.Radius.md, shadow = SolvioTheme.Shadow.sm) {
                Text(
                    locale.t("analysis.description"),
                    style = SolvioFonts.body.copy(color = palette.mutedForeground),
                )
                Spacer(Modifier.height(SolvioTheme.Spacing.sm))
                val isLoading = state is AnalysisViewModel.UiState.Loading
                val hasResult = state is AnalysisViewModel.UiState.Loaded
                NBPrimaryButton(
                    label = when {
                        isLoading -> locale.t("analysis.analyzing")
                        hasResult -> locale.t("analysis.regenerate")
                        else -> locale.t("analysis.generate")
                    },
                    enabled = !isLoading,
                    loading = isLoading,
                    onClick = { vm.run(force = hasResult) },
                )
            }
        }

        when (val s = state) {
            AnalysisViewModel.UiState.Idle -> Unit
            AnalysisViewModel.UiState.Loading -> item { NBLoadingCard() }
            is AnalysisViewModel.UiState.Error -> item { NBErrorCard(message = s.message) { vm.run(force = true) } }
            is AnalysisViewModel.UiState.Loaded -> {
                val r = s.data
                r.summary?.takeIf { it.isNotBlank() }?.let { item { SummaryCard(it) } }
                r.predictedMonthlySpend?.let { item { PredictedCard(it, currency) } }
                r.insights?.takeIf { it.isNotEmpty() }?.let { item { InsightsSection(it) } }
                r.recommendations?.takeIf { it.isNotEmpty() }?.let { item { RecommendationsSection(it, currency) } }
                r.anomalies?.takeIf { it.isNotEmpty() }?.let { item { AnomaliesSection(it, currency) } }
                r.categoryTrends?.takeIf { it.isNotEmpty() }?.let { item { CategoryTrendsSection(it) } }
                item { WeekdaySection(r.anomalies, r.bankStats) }
                r.bankStats?.let { item { BankStatsSection(it, currency) } }
            }
        }
    }
}

// MARK: - Period selector

@Composable
private fun PeriodSelector(selected: AnalysisViewModel.Period, onPick: (AnalysisViewModel.Period) -> Unit) {
    val palette = LocalPalette.current
    val locale = LocalAppLocale.current
    Column(verticalArrangement = Arrangement.spacedBy(SolvioTheme.Spacing.xxs)) {
        NBEyebrow(text = locale.t("analysis.periodEyebrow"))
        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            AnalysisViewModel.Period.values().forEach { p ->
                val active = p == selected
                Box(
                    modifier = Modifier
                        .clip(RoundedCornerShape(SolvioTheme.Radius.sm))
                        .background(if (active) palette.foreground else palette.surface)
                        .border(
                            SolvioTheme.Border.widthThin,
                            palette.border,
                            RoundedCornerShape(SolvioTheme.Radius.sm),
                        )
                        .clickable { onPick(p) }
                        .padding(horizontal = 10.dp, vertical = 8.dp),
                ) {
                    Text(
                        locale.t(p.labelKey),
                        style = SolvioFonts.chip.copy(color = if (active) palette.background else palette.foreground),
                    )
                }
            }
        }
    }
}

// MARK: - Cards

@Composable
private fun SummaryCard(text: String) {
    val palette = LocalPalette.current
    val locale = LocalAppLocale.current
    NBCard(radius = SolvioTheme.Radius.md, shadow = SolvioTheme.Shadow.md) {
        NBEyebrow(text = locale.t("analysis.summaryEyebrow"))
        Spacer(Modifier.height(4.dp))
        Text(text, style = SolvioFonts.body.copy(color = palette.foreground))
    }
}

@Composable
private fun PredictedCard(value: Double, currency: String) {
    val palette = LocalPalette.current
    val locale = LocalAppLocale.current
    NBCard(radius = SolvioTheme.Radius.lg, shadow = SolvioTheme.Shadow.lg) {
        NBEyebrow(text = locale.t("analysis.forecastEyebrow"))
        Spacer(Modifier.height(4.dp))
        Text(Fmt.amount(value, currency), style = SolvioFonts.hero.copy(color = palette.foreground))
        Text(
            locale.t("analysis.predictedMonthly"),
            style = SolvioFonts.caption.copy(color = palette.mutedForeground),
        )
    }
}

@Composable
private fun InsightsSection(items: List<AnalysisInsight>) {
    val palette = LocalPalette.current
    val locale = LocalAppLocale.current
    Column(verticalArrangement = Arrangement.spacedBy(SolvioTheme.Spacing.xs)) {
        NBSectionHeader(
            eyebrow = locale.t("analysis.insightsEyebrow"),
            title = locale.format("analysis.insightsCountFmt", items.size),
        )
        items.forEach { item ->
            val tint = insightTint(item.type, palette)
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .nbCard(palette, radius = SolvioTheme.Radius.md, shadow = SolvioTheme.Shadow.sm)
                    .padding(SolvioTheme.Spacing.sm),
                verticalAlignment = Alignment.Top,
                horizontalArrangement = Arrangement.spacedBy(SolvioTheme.Spacing.sm),
            ) {
                IconBadge(emoji = item.icon ?: "✦", tint = tint)
                Column(verticalArrangement = Arrangement.spacedBy(2.dp), modifier = Modifier.weight(1f)) {
                    Text(item.title, style = SolvioFonts.bodyMedium.copy(color = palette.foreground))
                    Text(item.description, style = SolvioFonts.caption.copy(color = palette.mutedForeground))
                }
            }
        }
    }
}

private fun insightTint(type: String, palette: Palette): Color = when (type.lowercase()) {
    "warning" -> palette.destructive
    "achievement", "positive", "good" -> palette.success
    "tip" -> palette.warning
    else -> palette.foreground
}

@Composable
private fun RecommendationsSection(items: List<AnalysisRecommendation>, currency: String) {
    val palette = LocalPalette.current
    val locale = LocalAppLocale.current
    Column(verticalArrangement = Arrangement.spacedBy(SolvioTheme.Spacing.xs)) {
        NBSectionHeader(
            eyebrow = locale.t("analysis.recommendationsEyebrow"),
            title = locale.t("analysis.recommendationsTitle"),
        )
        items.forEach { rec ->
            val tint = priorityColor(rec.priority, palette)
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .nbCard(palette, radius = SolvioTheme.Radius.md, shadow = SolvioTheme.Shadow.sm)
                    .padding(SolvioTheme.Spacing.sm),
                verticalAlignment = Alignment.Top,
                horizontalArrangement = Arrangement.spacedBy(SolvioTheme.Spacing.sm),
            ) {
                IconBadge(emoji = "→", tint = tint)
                Column(verticalArrangement = Arrangement.spacedBy(2.dp), modifier = Modifier.weight(1f)) {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        Text(rec.title, style = SolvioFonts.bodyMedium.copy(color = palette.foreground), modifier = Modifier.weight(1f))
                        NBTag(text = rec.priority, background = tint.copy(alpha = 0.15f), foreground = tint)
                    }
                    Text(rec.description, style = SolvioFonts.caption.copy(color = palette.mutedForeground))
                    rec.potentialSaving?.takeIf { it > 0 }?.let { saving ->
                        Text(
                            locale.format("analysis.potentialSavingFmt", Fmt.amount(saving, currency)),
                            style = SolvioFonts.mono(12).copy(color = palette.success),
                        )
                    }
                }
            }
        }
    }
}

private fun priorityColor(priority: String, palette: Palette): Color = when (priority.lowercase()) {
    "high" -> palette.destructive
    "medium", "med" -> palette.warning
    "low" -> palette.success
    else -> palette.foreground
}

@Composable
private fun AnomaliesSection(items: List<AnalysisAnomaly>, currency: String) {
    val palette = LocalPalette.current
    val locale = LocalAppLocale.current
    Column(verticalArrangement = Arrangement.spacedBy(SolvioTheme.Spacing.xs)) {
        NBSectionHeader(
            eyebrow = locale.t("analysis.anomaliesEyebrow"),
            title = locale.t("analysis.anomaliesTitle"),
        )
        items.forEach { a ->
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(SolvioTheme.Radius.md))
                    .background(palette.warning.copy(alpha = 0.08f))
                    .border(
                        SolvioTheme.Border.widthThin,
                        palette.warning,
                        RoundedCornerShape(SolvioTheme.Radius.md),
                    )
                    .padding(SolvioTheme.Spacing.sm),
                horizontalArrangement = Arrangement.spacedBy(SolvioTheme.Spacing.sm),
                verticalAlignment = Alignment.Top,
            ) {
                IconBadge(emoji = "!", tint = palette.warning)
                Column(modifier = Modifier.weight(1f)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        a.category?.takeIf { it.isNotBlank() }?.let {
                            Text(it, style = SolvioFonts.bodyMedium.copy(color = palette.foreground))
                            Spacer(Modifier.width(6.dp))
                        }
                        a.date?.takeIf { it.isNotBlank() }?.let {
                            Text(Fmt.date(it), style = SolvioFonts.mono(11).copy(color = palette.mutedForeground))
                        }
                        Spacer(Modifier.weight(1f))
                        a.amount?.let { v ->
                            Text(Fmt.amount(v, currency), style = SolvioFonts.mono(12).copy(color = palette.destructive))
                        }
                    }
                    a.description?.takeIf { it.isNotBlank() }?.let {
                        Text(it, style = SolvioFonts.caption.copy(color = palette.mutedForeground))
                    }
                }
            }
        }
    }
}

// MARK: - Category trends — Vico column chart, red+/green-

@Composable
private fun CategoryTrendsSection(trends: List<CategoryTrend>) {
    val palette = LocalPalette.current
    val locale = LocalAppLocale.current
    val producer = remember { CartesianChartModelProducer() }
    LaunchedEffect(trends) {
        producer.runTransaction {
            columnSeries { series(trends.map { it.changePercent }) }
        }
    }
    val redBar = rememberLineComponent(fill = fill(palette.destructive), thickness = 14.dp)
    val greenBar = rememberLineComponent(fill = fill(palette.success), thickness = 14.dp)
    val columns = remember(trends, palette) {
        trends.map { if (it.changePercent >= 0) redBar else greenBar }
    }

    Column(verticalArrangement = Arrangement.spacedBy(SolvioTheme.Spacing.sm)) {
        NBSectionHeader(
            eyebrow = locale.t("analysis.trendsEyebrow"),
            title = locale.t("analysis.trendsTitle"),
        )
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .nbCard(palette, radius = SolvioTheme.Radius.md, shadow = SolvioTheme.Shadow.sm)
                .padding(SolvioTheme.Spacing.sm)
                .height(if (trends.size > 4) 220.dp else 180.dp),
        ) {
            CartesianChartHost(
                chart = rememberCartesianChart(
                    rememberColumnCartesianLayer(
                        ColumnCartesianLayer.ColumnProvider.series(columns),
                    ),
                    startAxis = VerticalAxis.rememberStart(),
                    bottomAxis = HorizontalAxis.rememberBottom(
                        valueFormatter = { _, value, _ ->
                            trends.getOrNull(value.toInt())?.category?.take(8) ?: ""
                        },
                    ),
                ),
                modelProducer = producer,
                scrollState = rememberVicoScrollState(scrollEnabled = false),
            )
        }
        Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
            trends.forEach { t ->
                val tint = trendColor(t, palette)
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .nbCard(palette, radius = SolvioTheme.Radius.sm, shadow = SolvioTheme.Shadow.sm)
                        .padding(SolvioTheme.Spacing.sm),
                    verticalAlignment = Alignment.Top,
                    horizontalArrangement = Arrangement.spacedBy(SolvioTheme.Spacing.sm),
                ) {
                    Text(
                        if (t.changePercent >= 0) "↗" else "↘",
                        style = SolvioFonts.bodyMedium.copy(color = tint),
                    )
                    Column(modifier = Modifier.weight(1f)) {
                        Text(t.category, style = SolvioFonts.bodyMedium.copy(color = palette.foreground))
                        t.note?.takeIf { it.isNotBlank() }?.let {
                            Text(it, style = SolvioFonts.caption.copy(color = palette.mutedForeground))
                        }
                    }
                    Text(
                        String.format(Locale.getDefault(), "%s%.0f%%", if (t.changePercent >= 0) "+" else "", t.changePercent),
                        style = SolvioFonts.mono(12).copy(color = tint),
                    )
                }
            }
        }
    }
}

private fun trendColor(t: CategoryTrend, palette: Palette): Color =
    when {
        t.changePercent > 0 -> palette.destructive
        t.changePercent < 0 -> palette.success
        else -> palette.mutedForeground
    }

// MARK: - Weekday Vico column chart

@Composable
private fun WeekdaySection(anomalies: List<AnalysisAnomaly>?, bank: AnalysisBankStats?) {
    val palette = LocalPalette.current
    val locale = LocalAppLocale.current
    val labels = remember(locale) {
        listOf(
            locale.t("analysis.weekday.mon"),
            locale.t("analysis.weekday.tue"),
            locale.t("analysis.weekday.wed"),
            locale.t("analysis.weekday.thu"),
            locale.t("analysis.weekday.fri"),
            locale.t("analysis.weekday.sat"),
            locale.t("analysis.weekday.sun"),
        )
    }
    val sums = remember(anomalies) { weekdaySums(anomalies) }
    val hasData = sums.any { it > 0 }

    val producer = remember { CartesianChartModelProducer() }
    LaunchedEffect(sums) {
        producer.runTransaction {
            columnSeries { series(sums) }
        }
    }
    val bar = rememberLineComponent(fill = fill(palette.foreground), thickness = 18.dp)

    Column(verticalArrangement = Arrangement.spacedBy(SolvioTheme.Spacing.sm)) {
        NBSectionHeader(
            eyebrow = locale.t("analysis.weekdayEyebrow"),
            title = locale.t("analysis.weekdayTitle"),
        )
        if (hasData) {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .nbCard(palette, radius = SolvioTheme.Radius.md, shadow = SolvioTheme.Shadow.sm)
                    .padding(SolvioTheme.Spacing.sm)
                    .height(180.dp),
            ) {
                CartesianChartHost(
                    chart = rememberCartesianChart(
                        rememberColumnCartesianLayer(
                            ColumnCartesianLayer.ColumnProvider.series(bar),
                        ),
                        startAxis = VerticalAxis.rememberStart(),
                        bottomAxis = HorizontalAxis.rememberBottom(
                            valueFormatter = { _, value, _ ->
                                labels.getOrNull(value.toInt()) ?: ""
                            },
                        ),
                    ),
                    modelProducer = producer,
                    scrollState = rememberVicoScrollState(scrollEnabled = false),
                )
            }
            Text(
                locale.t("analysis.weekdayNote"),
                style = SolvioFonts.caption.copy(color = palette.mutedForeground),
            )
        } else {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .nbCard(palette, radius = SolvioTheme.Radius.md, shadow = SolvioTheme.Shadow.sm)
                    .padding(SolvioTheme.Spacing.md),
            ) {
                Text(
                    if (bank == null) locale.t("analysis.weekdayEmpty") else locale.t("analysis.weekdayNote"),
                    style = SolvioFonts.caption.copy(color = palette.mutedForeground),
                )
            }
        }
    }
}

private fun weekdaySums(anomalies: List<AnalysisAnomaly>?): List<Double> {
    val sums = DoubleArray(7) // Mon..Sun
    if (anomalies.isNullOrEmpty()) return sums.toList()
    val df = SimpleDateFormat("yyyy-MM-dd", Locale.US).apply {
        timeZone = TimeZone.getTimeZone("UTC")
    }
    val cal = Calendar.getInstance()
    for (a in anomalies) {
        val raw = a.date?.take(10) ?: continue
        val date: Date = runCatching { df.parse(raw) }.getOrNull() ?: continue
        cal.time = date
        // Calendar.DAY_OF_WEEK: 1=Sunday … 7=Saturday → Mon-first index
        val idx = ((cal.get(Calendar.DAY_OF_WEEK) + 5) % 7)
        sums[idx] += kotlin.math.abs(a.amount ?: 1.0)
    }
    return sums.toList()
}

// MARK: - Bank stats

@Composable
private fun BankStatsSection(bank: AnalysisBankStats, currency: String) {
    val palette = LocalPalette.current
    val locale = LocalAppLocale.current
    Column(verticalArrangement = Arrangement.spacedBy(SolvioTheme.Spacing.sm)) {
        NBSectionHeader(
            eyebrow = locale.t("analysis.bankEyebrow"),
            title = locale.t("analysis.bankTitle"),
        )
        Row(horizontalArrangement = Arrangement.spacedBy(SolvioTheme.Spacing.sm)) {
            StatTile(label = locale.t("analysis.bankDebit"), value = Fmt.amount(bank.totalDebit, currency), tint = palette.destructive, modifier = Modifier.weight(1f))
            StatTile(label = locale.t("analysis.bankCredit"), value = Fmt.amount(bank.totalCredit, currency), tint = palette.success, modifier = Modifier.weight(1f))
        }
        Row(horizontalArrangement = Arrangement.spacedBy(SolvioTheme.Spacing.sm)) {
            StatTile(label = locale.t("analysis.bankTxns"), value = bank.totalTransactions.toString(), modifier = Modifier.weight(1f))
            StatTile(label = locale.t("analysis.bankAccounts"), value = bank.accountCount.toString(), modifier = Modifier.weight(1f))
        }
        if (bank.topMerchants.isNotEmpty()) {
            NBEyebrow(text = locale.t("analysis.topMerchants"))
            bank.topMerchants.forEach { m ->
                val merchantAmount = m.amount.replace(",", ".").toDoubleOrNull() ?: 0.0
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .nbCard(palette, radius = SolvioTheme.Radius.sm, shadow = SolvioTheme.Shadow.sm)
                        .padding(SolvioTheme.Spacing.sm),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(m.name, style = SolvioFonts.bodyMedium.copy(color = palette.foreground), modifier = Modifier.weight(1f))
                    Text(Fmt.amount(merchantAmount, currency), style = SolvioFonts.mono(12).copy(color = palette.foreground))
                }
            }
        }
    }
}

@Composable
private fun StatTile(label: String, value: String, tint: Color? = null, modifier: Modifier = Modifier) {
    val palette = LocalPalette.current
    Column(
        verticalArrangement = Arrangement.spacedBy(2.dp),
        modifier = modifier
            .nbCard(palette, radius = SolvioTheme.Radius.sm, shadow = SolvioTheme.Shadow.sm)
            .padding(SolvioTheme.Spacing.sm),
    ) {
        Text(label, style = SolvioFonts.eyebrow.copy(color = palette.mutedForeground))
        Text(value, style = SolvioFonts.cardTitle.copy(color = tint ?: palette.foreground))
    }
}

@Composable
private fun IconBadge(emoji: String, tint: Color) {
    Box(
        modifier = Modifier
            .size(36.dp)
            .clip(RoundedCornerShape(SolvioTheme.Radius.sm))
            .background(tint.copy(alpha = 0.15f))
            .border(SolvioTheme.Border.widthThin, tint, RoundedCornerShape(SolvioTheme.Radius.sm)),
        contentAlignment = Alignment.Center,
    ) {
        Text(emoji, style = SolvioFonts.bodyMedium.copy(color = tint))
    }
}
