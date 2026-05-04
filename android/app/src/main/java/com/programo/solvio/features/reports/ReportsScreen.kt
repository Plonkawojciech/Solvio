package com.programo.solvio.features.reports

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import com.programo.solvio.LocalAppLocale
import com.programo.solvio.LocalToast
import com.programo.solvio.core.AppLocale
import com.programo.solvio.core.models.ReportUrls
import com.programo.solvio.core.network.ExpensesRepo
import com.programo.solvio.core.network.ReportsRepo
import com.programo.solvio.core.theme.LocalPalette
import com.programo.solvio.core.theme.SolvioFonts
import com.programo.solvio.core.theme.SolvioTheme
import com.programo.solvio.core.theme.nbCard
import com.programo.solvio.core.ui.NBCard
import com.programo.solvio.core.ui.NBEmptyState
import com.programo.solvio.core.ui.NBErrorCard
import com.programo.solvio.core.ui.NBLoadingCard
import com.programo.solvio.core.ui.NBScreenHeader
import com.programo.solvio.core.ui.NBTag
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import java.time.Month
import java.time.format.TextStyle
import java.util.Locale

/// Reports — mirrors `Features/Reports/ReportsView.swift`. Year-block model:
/// per-year cards with month list expandable, generate buttons for yearly +
/// monthly, and after generate show 3 download links per format (PDF/CSV/DOCX)
/// opening in browser via `Intent.ACTION_VIEW + Uri.parse(url)`.
data class ReportYearBlock(val year: Int, val months: List<Int>)

class ReportsViewModel : ViewModel() {
    sealed class UiState {
        object Loading : UiState()
        data class Error(val message: String) : UiState()
        data class Loaded(
            val years: List<ReportYearBlock>,
            val countsByKey: Map<String, Int>,
        ) : UiState()
    }

    private val _state = MutableStateFlow<UiState>(UiState.Loading)
    val state: StateFlow<UiState> = _state

    private val _urls = MutableStateFlow<Map<String, ReportUrls>>(emptyMap())
    val urls: StateFlow<Map<String, ReportUrls>> = _urls

    private val _running = MutableStateFlow<String?>(null)
    val running: StateFlow<String?> = _running

    fun load() {
        viewModelScope.launch {
            _state.value = UiState.Loading
            try {
                val resp = ExpensesRepo.list()
                val byYear = mutableMapOf<Int, MutableSet<Int>>()
                val counts = mutableMapOf<String, Int>()
                for (e in resp.expenses) {
                    val parts = e.date.take(10).split("-")
                    if (parts.size < 2) continue
                    val y = parts[0].toIntOrNull() ?: continue
                    val m = parts[1].toIntOrNull() ?: continue
                    byYear.getOrPut(y) { mutableSetOf() }.add(m)
                    counts["yearly-$y"] = (counts["yearly-$y"] ?: 0) + 1
                    val ymKey = "monthly-%04d-%02d".format(y, m)
                    counts[ymKey] = (counts[ymKey] ?: 0) + 1
                }
                val years = byYear.keys.sortedDescending().map { y ->
                    ReportYearBlock(year = y, months = byYear[y].orEmpty().sortedDescending())
                }
                _state.value = UiState.Loaded(years, counts)
            } catch (e: Throwable) {
                _state.value = UiState.Error(e.message ?: "Failed")
            }
        }
    }

    fun runYearly(year: Int, onSuccess: () -> Unit, onError: (String) -> Unit) {
        val key = "yearly-$year"
        viewModelScope.launch {
            _running.value = key
            try {
                val r = ReportsRepo.runYearly(year)
                _urls.value = _urls.value + (key to r.urls)
                onSuccess()
            } catch (e: Throwable) {
                onError(e.message ?: "Failed")
            } finally {
                _running.value = null
            }
        }
    }

    fun runMonthly(yearMonth: String, onSuccess: () -> Unit, onError: (String) -> Unit) {
        val key = "monthly-$yearMonth"
        viewModelScope.launch {
            _running.value = key
            try {
                val r = ReportsRepo.runMonthly(yearMonth)
                _urls.value = _urls.value + (key to r.urls)
                onSuccess()
            } catch (e: Throwable) {
                onError(e.message ?: "Failed")
            } finally {
                _running.value = null
            }
        }
    }
}

@Composable
fun ReportsScreen() {
    val palette = LocalPalette.current
    val locale = LocalAppLocale.current
    val toast = LocalToast.current
    val ctx = LocalContext.current
    val vm: ReportsViewModel = viewModel()
    val state by vm.state.collectAsState()
    val urls by vm.urls.collectAsState()
    val running by vm.running.collectAsState()
    val lang by locale.language.collectAsState()
    var expandedYears by remember { mutableStateOf(setOf<Int>()) }

    LaunchedEffect(Unit) { vm.load() }

    LazyColumn(
        modifier = Modifier.fillMaxSize().background(palette.background),
        contentPadding = PaddingValues(SolvioTheme.Spacing.md),
        verticalArrangement = Arrangement.spacedBy(SolvioTheme.Spacing.md),
    ) {
        item {
            NBScreenHeader(
                eyebrow = locale.t("reports.headerEyebrow"),
                title = locale.t("reports.headerTitle"),
                subtitle = locale.t("reports.headerSubtitle"),
            )
        }

        when (val s = state) {
            ReportsViewModel.UiState.Loading -> item { NBLoadingCard() }
            is ReportsViewModel.UiState.Error -> item {
                NBErrorCard(message = s.message) { vm.load() }
            }
            is ReportsViewModel.UiState.Loaded -> {
                if (s.years.isEmpty()) {
                    item {
                        NBCard(radius = SolvioTheme.Radius.md) {
                            NBEmptyState(
                                title = locale.t("reports.noExpensesTitle"),
                                subtitle = locale.t("reports.noExpensesDesc"),
                            )
                        }
                    }
                } else {
                    if (running != null) {
                        item {
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .clip(RoundedCornerShape(SolvioTheme.Radius.md))
                                    .background(palette.muted)
                                    .border(SolvioTheme.Border.widthThin, palette.border, RoundedCornerShape(SolvioTheme.Radius.md))
                                    .padding(SolvioTheme.Spacing.sm),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(SolvioTheme.Spacing.sm),
                            ) {
                                CircularProgressIndicator(color = palette.foreground, strokeWidth = 2.dp, modifier = Modifier.size(16.dp))
                                Text(locale.t("reports.generatingBanner"), style = SolvioFonts.bodyMedium.copy(color = palette.foreground))
                            }
                        }
                    }
                    items(s.years.size) { idx ->
                        val block = s.years[idx]
                        val isExpanded = expandedYears.contains(block.year)
                        YearCard(
                            block = block,
                            countsByKey = s.countsByKey,
                            urls = urls,
                            running = running,
                            isExpanded = isExpanded,
                            onToggle = {
                                expandedYears = if (isExpanded) expandedYears - block.year
                                else expandedYears + block.year
                            },
                            onRunYearly = {
                                vm.runYearly(
                                    block.year,
                                    onSuccess = { toast.success(locale.t("reports.yearlyReady"), locale.t("reports.tapOpen")) },
                                    onError = { msg -> toast.error(locale.t("reports.generateFailed"), msg) },
                                )
                            },
                            onRunMonthly = { ym ->
                                vm.runMonthly(
                                    ym,
                                    onSuccess = { toast.success(locale.t("reports.monthlyReady"), locale.t("reports.tapOpen")) },
                                    onError = { msg -> toast.error(locale.t("reports.generateFailed"), msg) },
                                )
                            },
                            onOpenUrl = { url ->
                                runCatching {
                                    val intent = Intent(Intent.ACTION_VIEW, Uri.parse(url))
                                    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                                    ctx.startActivity(intent)
                                }
                            },
                            lang = lang,
                        )
                    }
                }
            }
        }

        item { Spacer(Modifier.height(SolvioTheme.Spacing.xl)) }
    }
}

@Composable
private fun YearCard(
    block: ReportYearBlock,
    countsByKey: Map<String, Int>,
    urls: Map<String, ReportUrls>,
    running: String?,
    isExpanded: Boolean,
    onToggle: () -> Unit,
    onRunYearly: () -> Unit,
    onRunMonthly: (String) -> Unit,
    onOpenUrl: (String) -> Unit,
    lang: AppLocale.Language,
) {
    val palette = LocalPalette.current
    val locale = LocalAppLocale.current
    val yearKey = "yearly-${block.year}"
    val yearUrls = urls[yearKey]
    val yearCount = countsByKey[yearKey] ?: 0
    val isYearGenerating = running == yearKey

    NBCard(radius = SolvioTheme.Radius.md, shadow = SolvioTheme.Shadow.sm) {
        Row(verticalAlignment = Alignment.Top) {
            Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(SolvioTheme.Spacing.xs)) {
                    Text(block.year.toString(), style = SolvioFonts.bold(20).copy(color = palette.foreground))
                    if (yearUrls != null) {
                        NBTag(
                            text = locale.t("reports.ready"),
                            background = palette.success.copy(alpha = 0.15f),
                            foreground = palette.success,
                        )
                    }
                }
                Text(
                    "${locale.t("reports.yearlySummary")} · $yearCount ${locale.t("reports.expensesInPeriod")}",
                    style = SolvioFonts.caption.copy(color = palette.mutedForeground),
                )
            }
            GenerateIconButton(isLoading = isYearGenerating, onClick = onRunYearly)
        }

        if (yearUrls != null) {
            Spacer(Modifier.height(SolvioTheme.Spacing.sm))
            DownloadLinks(yearUrls, onOpenUrl)
        }

        Spacer(Modifier.height(SolvioTheme.Spacing.sm))
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(SolvioTheme.Radius.sm))
                .background(palette.muted)
                .border(SolvioTheme.Border.widthThin, palette.border, RoundedCornerShape(SolvioTheme.Radius.sm))
                .clickable(onClick = onToggle)
                .padding(SolvioTheme.Spacing.sm),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                "${if (isExpanded) locale.t("reports.hideMonths") else locale.t("reports.showMonths")} (${block.months.size})",
                style = SolvioFonts.bodyMedium.copy(color = palette.foreground),
                modifier = Modifier.weight(1f),
            )
            Text(if (isExpanded) "▲" else "▼", style = SolvioFonts.mono(11).copy(color = palette.foreground))
        }

        if (isExpanded) {
            Spacer(Modifier.height(SolvioTheme.Spacing.xs))
            Column(verticalArrangement = Arrangement.spacedBy(SolvioTheme.Spacing.xs)) {
                block.months.forEach { m ->
                    val ym = "%04d-%02d".format(block.year, m)
                    val monthKey = "monthly-$ym"
                    val mUrls = urls[monthKey]
                    val mCount = countsByKey[monthKey] ?: 0
                    val isMonthGenerating = running == monthKey
                    MonthRow(
                        year = block.year,
                        month = m,
                        count = mCount,
                        urls = mUrls,
                        isGenerating = isMonthGenerating,
                        onGenerate = { onRunMonthly(ym) },
                        onOpenUrl = onOpenUrl,
                        lang = lang,
                    )
                }
            }
        }
    }
}

@Composable
private fun MonthRow(
    year: Int,
    month: Int,
    count: Int,
    urls: ReportUrls?,
    isGenerating: Boolean,
    onGenerate: () -> Unit,
    onOpenUrl: (String) -> Unit,
    lang: AppLocale.Language,
) {
    val palette = LocalPalette.current
    val locale = LocalAppLocale.current
    val label = monthYearLabel(year, month, lang)

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(SolvioTheme.Radius.sm))
            .background(palette.surface)
            .border(SolvioTheme.Border.widthThin, palette.border.copy(alpha = 0.4f), RoundedCornerShape(SolvioTheme.Radius.sm))
            .padding(SolvioTheme.Spacing.sm),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(SolvioTheme.Spacing.xs),
    ) {
        Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                Text(label, style = SolvioFonts.bodyMedium.copy(color = palette.foreground))
                if (urls != null) Text("✓", style = SolvioFonts.bold(12).copy(color = palette.success))
            }
            Text("$count ${locale.t("reports.expenses")}", style = SolvioFonts.caption.copy(color = palette.mutedForeground))
        }
        if (urls != null) {
            MiniDownloads(urls, onOpenUrl)
        }
        GenerateIconButton(isLoading = isGenerating, onClick = onGenerate)
    }
}

@Composable
private fun GenerateIconButton(isLoading: Boolean, onClick: () -> Unit) {
    val palette = LocalPalette.current
    Box(
        modifier = Modifier
            .size(36.dp)
            .clip(RoundedCornerShape(SolvioTheme.Radius.sm))
            .background(palette.muted)
            .border(SolvioTheme.Border.widthThin, palette.border, RoundedCornerShape(SolvioTheme.Radius.sm))
            .clickable(enabled = !isLoading) { onClick() },
        contentAlignment = Alignment.Center,
    ) {
        if (isLoading) {
            CircularProgressIndicator(color = palette.foreground, strokeWidth = 2.dp, modifier = Modifier.size(14.dp))
        } else {
            Text("⟳", style = SolvioFonts.bold(14).copy(color = palette.foreground))
        }
    }
}

@Composable
private fun DownloadLinks(urls: ReportUrls, onOpen: (String) -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(SolvioTheme.Spacing.xs)) {
        DownloadRow(label = "PDF", url = urls.pdf, onOpen = onOpen)
        DownloadRow(label = "CSV", url = urls.csv, onOpen = onOpen)
        DownloadRow(label = "DOCX", url = urls.docx, onOpen = onOpen)
    }
}

@Composable
private fun DownloadRow(label: String, url: String, onOpen: (String) -> Unit) {
    val palette = LocalPalette.current
    val locale = LocalAppLocale.current
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .nbCard(palette, radius = SolvioTheme.Radius.sm, shadow = SolvioTheme.Shadow.sm)
            .padding(SolvioTheme.Spacing.sm),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(SolvioTheme.Spacing.sm),
    ) {
        Box(
            modifier = Modifier
                .size(32.dp)
                .clip(RoundedCornerShape(SolvioTheme.Radius.sm))
                .background(palette.muted)
                .border(SolvioTheme.Border.widthThin, palette.border, RoundedCornerShape(SolvioTheme.Radius.sm)),
            contentAlignment = Alignment.Center,
        ) { Text(label.first().toString(), style = SolvioFonts.monoBold(12).copy(color = palette.foreground)) }
        Text(label, style = SolvioFonts.bodyMedium.copy(color = palette.foreground), modifier = Modifier.weight(1f))
        Box(
            modifier = Modifier
                .clip(RoundedCornerShape(SolvioTheme.Radius.sm))
                .background(palette.foreground)
                .clickable { onOpen(url) }
                .padding(horizontal = 12.dp, vertical = 8.dp),
        ) {
            Text(
                locale.t("reports.openButton").uppercase(),
                style = SolvioFonts.mono(11).copy(color = palette.background),
            )
        }
    }
}

@Composable
private fun MiniDownloads(urls: ReportUrls, onOpen: (String) -> Unit) {
    Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
        MiniDownloadLink(label = "P", url = urls.pdf, onOpen = onOpen)
        MiniDownloadLink(label = "C", url = urls.csv, onOpen = onOpen)
        MiniDownloadLink(label = "D", url = urls.docx, onOpen = onOpen)
    }
}

@Composable
private fun MiniDownloadLink(label: String, url: String, onOpen: (String) -> Unit) {
    val palette = LocalPalette.current
    Box(
        modifier = Modifier
            .size(24.dp)
            .clip(RoundedCornerShape(4.dp))
            .background(palette.foreground)
            .clickable { onOpen(url) },
        contentAlignment = Alignment.Center,
    ) { Text(label, style = SolvioFonts.mono(10).copy(color = palette.background)) }
}

private fun monthYearLabel(year: Int, month: Int, lang: AppLocale.Language): String {
    val locale = if (lang == AppLocale.Language.PL) Locale("pl", "PL") else Locale.US
    val monthName = Month.of(month).getDisplayName(TextStyle.FULL, locale).replaceFirstChar { it.titlecase(locale) }
    return "$monthName $year"
}
