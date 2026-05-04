package com.programo.solvio.features.goals

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
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
import com.programo.solvio.LocalToast
import com.programo.solvio.core.Fmt
import com.programo.solvio.core.models.FinancialHealthResponse
import com.programo.solvio.core.models.GoalCreate
import com.programo.solvio.core.models.SavingsGoal
import com.programo.solvio.core.network.FinancialHealthRepo
import com.programo.solvio.core.network.GoalsRepo
import com.programo.solvio.core.theme.LocalPalette
import com.programo.solvio.core.theme.SolvioFonts
import com.programo.solvio.core.theme.SolvioTheme
import com.programo.solvio.core.theme.nbCard
import com.programo.solvio.core.ui.NBCard
import com.programo.solvio.core.ui.NBEmptyState
import com.programo.solvio.core.ui.NBErrorCard
import com.programo.solvio.core.ui.NBEyebrow
import com.programo.solvio.core.ui.NBLoadingCard
import com.programo.solvio.core.ui.NBScreenHeader
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import java.time.LocalDate
import java.time.temporal.ChronoUnit

/// Goals list screen — mirrors iOS `GoalsListView`. Lazy-loads goals +
/// financial health in parallel, paints a 4-tile KPI strip, AI tip
/// banner, active section, completed disclosure, and a FAB.
class GoalsListViewModel : ViewModel() {
    private val _state = MutableStateFlow<UiState>(UiState.Loading)
    val state: StateFlow<UiState> = _state

    sealed class UiState {
        object Loading : UiState()
        data class Error(val message: String) : UiState()
        data class Loaded(
            val goals: List<SavingsGoal>,
            val tips: List<String>,
        ) : UiState()
    }

    fun load() {
        viewModelScope.launch {
            _state.value = UiState.Loading
            try {
                coroutineScope {
                    val goalsAsync = async { GoalsRepo.list() }
                    val healthAsync = async { runCatching { FinancialHealthRepo.fetch() }.getOrNull() }
                    val goals = goalsAsync.await()
                    val tips = healthAsync.await()?.tips.orEmpty()
                    _state.value = UiState.Loaded(goals = goals, tips = tips)
                }
            } catch (t: Throwable) {
                _state.value = UiState.Error(t.message ?: "Failed to load")
            }
        }
    }

    fun create(body: GoalCreate, onDone: (Boolean) -> Unit) {
        viewModelScope.launch {
            runCatching { GoalsRepo.create(body) }
                .onSuccess {
                    onDone(true)
                    load()
                }
                .onFailure { onDone(false) }
        }
    }

    fun delete(id: String) {
        viewModelScope.launch {
            runCatching { GoalsRepo.delete(id) }.onSuccess { load() }
        }
    }
}

@Composable
fun GoalsListScreen(onOpenGoal: (String) -> Unit) {
    val palette = LocalPalette.current
    val locale = LocalAppLocale.current
    val toast = LocalToast.current
    val vm: GoalsListViewModel = viewModel()
    val state by vm.state.collectAsState()
    var showCreate by remember { mutableStateOf(false) }
    var showCompleted by remember { mutableStateOf(false) }
    var showAiTip by remember { mutableStateOf(false) }

    LaunchedEffect(Unit) { vm.load() }

    Box(modifier = Modifier.fillMaxSize().background(palette.background)) {
        LazyColumn(
            contentPadding = PaddingValues(SolvioTheme.Spacing.md),
            verticalArrangement = Arrangement.spacedBy(SolvioTheme.Spacing.md),
        ) {
            item {
                val active = (state as? GoalsListViewModel.UiState.Loaded)?.goals?.count { it.isCompleted != true } ?: 0
                val completed = (state as? GoalsListViewModel.UiState.Loaded)?.goals?.count { it.isCompleted == true } ?: 0
                NBScreenHeader(
                    eyebrow = locale.t("goals.eyebrow"),
                    title = locale.t("goals.headerTitle"),
                    subtitle = "$active ${locale.t("goals.sectionActive").lowercase()} · $completed ${locale.t("goals.sectionCompleted").lowercase()}",
                )
            }

            when (val s = state) {
                GoalsListViewModel.UiState.Loading -> item { NBLoadingCard() }
                is GoalsListViewModel.UiState.Error -> item { NBErrorCard(s.message) { vm.load() } }
                is GoalsListViewModel.UiState.Loaded -> {
                    val goals = s.goals
                    if (goals.isEmpty()) {
                        item {
                            NBCard(radius = SolvioTheme.Radius.md, shadow = SolvioTheme.Shadow.sm) {
                                NBEmptyState(
                                    title = locale.t("goals.emptyTitle"),
                                    subtitle = locale.t("goals.emptySub"),
                                )
                            }
                        }
                    } else {
                        val active = goals.filter { it.isCompleted != true }
                        val completed = goals.filter { it.isCompleted == true }
                        val totalSaved = goals.sumOf { it.currentAmount.toDouble() }
                        val currencyHint = goals.firstOrNull()?.currency ?: "PLN"
                        val monthlyNeeded = active.sumOf { computeMonthlyNeeded(it) }

                        item {
                            KpiStrip(
                                totalSaved = totalSaved,
                                activeCount = active.size,
                                monthlyNeeded = monthlyNeeded,
                                completedCount = completed.size,
                                currency = currencyHint,
                            )
                        }
                        if (s.tips.isNotEmpty()) {
                            item {
                                AiTipBanner(
                                    expanded = showAiTip,
                                    onToggle = { showAiTip = !showAiTip },
                                    tip = s.tips.first(),
                                )
                            }
                        }
                        item {
                            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                                NBEyebrow(text = locale.t("goals.sectionActive"), color = palette.mutedForeground)
                                Text("${active.size}", style = SolvioFonts.mono(11).copy(color = palette.mutedForeground))
                            }
                        }
                        items(active, key = { it.id }) { g ->
                            GoalCard(g, onClick = { onOpenGoal(g.id) })
                        }
                        if (completed.isNotEmpty()) {
                            item {
                                CompletedDisclosure(
                                    expanded = showCompleted,
                                    onToggle = { showCompleted = !showCompleted },
                                    count = completed.size,
                                )
                            }
                            if (showCompleted) {
                                items(completed, key = { it.id }) { g -> CompletedRow(g) }
                            }
                        }
                    }
                }
            }

            item { Spacer(Modifier.height(96.dp)) }
        }

        // FAB
        Box(
            modifier = Modifier
                .align(Alignment.BottomEnd)
                .padding(SolvioTheme.Spacing.md)
                .size(56.dp)
                .clip(RoundedCornerShape(SolvioTheme.Radius.md))
                .background(palette.foreground)
                .border(SolvioTheme.Border.width, palette.border, RoundedCornerShape(SolvioTheme.Radius.md))
                .clickable { showCreate = true },
            contentAlignment = Alignment.Center,
        ) {
            Text("+", style = SolvioFonts.bold(28).copy(color = palette.background))
        }
    }

    if (showCreate) {
        GoalCreateSheet(
            onDismiss = { showCreate = false },
            onSubmit = { body ->
                showCreate = false
                vm.create(body) { ok ->
                    if (ok) toast.success(locale.t("goals.created")) else toast.error(locale.t("goals.createFailed"))
                }
            },
        )
    }
}

// MARK: - Helpers

private fun computeMonthlyNeeded(g: SavingsGoal): Double {
    val target = g.targetAmount.toDouble()
    val current = g.currentAmount.toDouble()
    val remaining = (target - current).coerceAtLeast(0.0)
    if (remaining <= 0) return 0.0
    val deadline = g.deadline?.take(10)
    if (!deadline.isNullOrBlank()) {
        return runCatching {
            val d = LocalDate.parse(deadline)
            val days = ChronoUnit.DAYS.between(LocalDate.now(), d).coerceAtLeast(1)
            (remaining / days) * 30.0
        }.getOrElse { remaining / 12.0 }
    }
    return remaining / 12.0
}

@Composable
private fun KpiStrip(
    totalSaved: Double,
    activeCount: Int,
    monthlyNeeded: Double,
    completedCount: Int,
    currency: String,
) {
    val locale = LocalAppLocale.current
    Column(verticalArrangement = Arrangement.spacedBy(SolvioTheme.Spacing.xs)) {
        Row(horizontalArrangement = Arrangement.spacedBy(SolvioTheme.Spacing.xs)) {
            StatTile(label = locale.t("goals.statSaved"), value = Fmt.amount(totalSaved, currency), modifier = Modifier.weight(1f))
            StatTile(label = locale.t("goals.statActive"), value = "$activeCount", modifier = Modifier.weight(1f))
        }
        Row(horizontalArrangement = Arrangement.spacedBy(SolvioTheme.Spacing.xs)) {
            StatTile(label = locale.t("goals.statPerMonth"), value = Fmt.amount(monthlyNeeded, currency), modifier = Modifier.weight(1f))
            StatTile(label = locale.t("goals.statCompleted"), value = "$completedCount", modifier = Modifier.weight(1f))
        }
    }
}

@Composable
internal fun StatTile(label: String, value: String, modifier: Modifier = Modifier) {
    val palette = LocalPalette.current
    Column(
        modifier = modifier
            .nbCard(palette, radius = SolvioTheme.Radius.md, shadow = SolvioTheme.Shadow.sm)
            .padding(SolvioTheme.Spacing.sm),
        verticalArrangement = Arrangement.spacedBy(2.dp),
    ) {
        Text(label.uppercase(), style = SolvioFonts.mono(10).copy(color = palette.mutedForeground))
        Text(value, style = SolvioFonts.bold(16).copy(color = palette.foreground), maxLines = 1)
    }
}

@Composable
private fun AiTipBanner(expanded: Boolean, onToggle: () -> Unit, tip: String) {
    val palette = LocalPalette.current
    val locale = LocalAppLocale.current
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .nbCard(palette, radius = SolvioTheme.Radius.md, shadow = SolvioTheme.Shadow.sm)
            .clickable { onToggle() }
            .padding(SolvioTheme.Spacing.sm),
        verticalArrangement = Arrangement.spacedBy(if (expanded) SolvioTheme.Spacing.xs else 0.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Box(
                modifier = Modifier
                    .size(24.dp)
                    .clip(RoundedCornerShape(SolvioTheme.Radius.sm))
                    .background(palette.accent)
                    .border(SolvioTheme.Border.widthThin, palette.border, RoundedCornerShape(SolvioTheme.Radius.sm)),
                contentAlignment = Alignment.Center,
            ) {
                Text("✨", style = SolvioFonts.body)
            }
            Spacer(Modifier.width(8.dp))
            Text(locale.t("savings.aiTip"), style = SolvioFonts.mono(10).copy(color = palette.mutedForeground))
            Spacer(Modifier.weight(1f))
            Text(if (expanded) "▲" else "▼", style = SolvioFonts.mono(11).copy(color = palette.mutedForeground))
        }
        if (expanded) {
            Text(tip, style = SolvioFonts.caption.copy(color = palette.foreground))
        }
    }
}

@Composable
private fun GoalCard(g: SavingsGoal, onClick: () -> Unit) {
    val palette = LocalPalette.current
    val target = g.targetAmount.toDouble()
    val current = g.currentAmount.toDouble()
    val pct = if (target > 0) (current / target).coerceIn(0.0, 1.0) else 0.0
    val pctLabel = (pct * 100).toInt()

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .nbCard(palette, radius = SolvioTheme.Radius.md, shadow = SolvioTheme.Shadow.sm)
            .clickable { onClick() }
            .padding(SolvioTheme.Spacing.sm),
        horizontalArrangement = Arrangement.spacedBy(SolvioTheme.Spacing.sm),
    ) {
        Box(
            modifier = Modifier
                .size(44.dp)
                .clip(RoundedCornerShape(SolvioTheme.Radius.sm))
                .background(palette.muted)
                .border(SolvioTheme.Border.widthThin, palette.border, RoundedCornerShape(SolvioTheme.Radius.sm)),
            contentAlignment = Alignment.Center,
        ) {
            Text(g.emoji ?: "🎯", style = SolvioFonts.bold(24))
        }
        Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Text(g.name, style = SolvioFonts.bodyMedium.copy(color = palette.foreground), modifier = Modifier.weight(1f))
                Text("$pctLabel%", style = SolvioFonts.mono(11).copy(color = palette.mutedForeground))
            }
            ProgressBar(value = pct.toFloat())
            Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Text(
                    "${Fmt.amount(current, g.currency)} / ${Fmt.amount(target, g.currency)}",
                    style = SolvioFonts.caption.copy(color = palette.mutedForeground),
                    modifier = Modifier.weight(1f),
                )
                g.deadline?.let { d ->
                    Text(Fmt.date(d), style = SolvioFonts.caption.copy(color = palette.mutedForeground))
                }
            }
        }
    }
}

@Composable
internal fun ProgressBar(value: Float, over: Boolean = false) {
    val palette = LocalPalette.current
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .height(8.dp)
            .clip(RoundedCornerShape(4.dp))
            .background(palette.muted)
            .border(SolvioTheme.Border.widthThin, palette.border, RoundedCornerShape(4.dp)),
    ) {
        Box(
            modifier = Modifier
                .fillMaxWidth(value.coerceIn(0f, 1f))
                .height(8.dp)
                .background(if (over) palette.destructive else palette.foreground),
        )
    }
}

@Composable
private fun CompletedDisclosure(expanded: Boolean, onToggle: () -> Unit, count: Int) {
    val palette = LocalPalette.current
    val locale = LocalAppLocale.current
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .nbCard(palette, radius = SolvioTheme.Radius.md, shadow = SolvioTheme.Shadow.sm)
            .clickable { onToggle() }
            .padding(SolvioTheme.Spacing.sm),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            modifier = Modifier
                .size(20.dp)
                .clip(CircleShape)
                .background(palette.success.copy(alpha = 0.2f)),
            contentAlignment = Alignment.Center,
        ) {
            Text("✓", style = SolvioFonts.mono(11).copy(color = palette.success))
        }
        Spacer(Modifier.width(8.dp))
        Text(locale.t("goals.sectionCompleted"), style = SolvioFonts.bodyMedium.copy(color = palette.foreground))
        Spacer(Modifier.width(4.dp))
        Text("($count)", style = SolvioFonts.mono(10).copy(color = palette.mutedForeground))
        Spacer(Modifier.weight(1f))
        Text(if (expanded) "▲" else "▼", style = SolvioFonts.mono(11).copy(color = palette.mutedForeground))
    }
}

@Composable
private fun CompletedRow(g: SavingsGoal) {
    val palette = LocalPalette.current
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .nbCard(palette, radius = SolvioTheme.Radius.sm, shadow = SolvioTheme.Shadow.sm)
            .padding(SolvioTheme.Spacing.sm),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(SolvioTheme.Spacing.sm),
    ) {
        Text(g.emoji ?: "🎯", style = SolvioFonts.bold(22))
        Column(modifier = Modifier.weight(1f)) {
            Text(g.name, style = SolvioFonts.bodyMedium.copy(color = palette.foreground))
            Text(Fmt.amount(g.targetAmount.toDouble(), g.currency), style = SolvioFonts.caption.copy(color = palette.mutedForeground))
        }
        Text("✓", style = SolvioFonts.bold(16).copy(color = palette.success))
    }
}
