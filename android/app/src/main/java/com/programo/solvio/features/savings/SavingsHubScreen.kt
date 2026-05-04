package com.programo.solvio.features.savings

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
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import com.programo.solvio.LocalAppLocale
import com.programo.solvio.core.Fmt
import com.programo.solvio.core.models.BudgetResponse
import com.programo.solvio.core.models.Challenge
import com.programo.solvio.core.models.FinancialHealthResponse
import com.programo.solvio.core.models.PromoOffer
import com.programo.solvio.core.models.PromotionsResponse
import com.programo.solvio.core.models.SavingsGoal
import com.programo.solvio.core.network.BudgetRepo
import com.programo.solvio.core.network.ChallengesRepo
import com.programo.solvio.core.network.FinancialHealthRepo
import com.programo.solvio.core.network.GoalsRepo
import com.programo.solvio.core.network.PromotionsRepo
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
import com.programo.solvio.core.ui.NBTag
import com.programo.solvio.features.goals.ProgressBar
import com.programo.solvio.features.goals.StatTile
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import java.time.LocalDate
import java.time.temporal.ChronoUnit

/// Savings hub — replaces the placeholder. KPI strip (totalSaved + circular
/// health gauge from FinancialHealth.score + active goals count + monthly needed)
/// + AI tip banner from `FinancialHealthRepo.fetch().tips` + 4-tab switcher
/// Goals/Budget/Challenges/Deals (Compose `TabRow`).
class SavingsHubViewModel : ViewModel() {
    sealed class HeaderState {
        object Loading : HeaderState()
        data class Loaded(
            val goals: List<SavingsGoal>,
            val health: FinancialHealthResponse?,
        ) : HeaderState()
        data class Error(val message: String) : HeaderState()
    }
    sealed class TabState<T> {
        class Idle<T> : TabState<T>()
        class Loading<T> : TabState<T>()
        data class Loaded<T>(val data: T) : TabState<T>()
        data class Error<T>(val message: String) : TabState<T>()
    }

    private val _header = MutableStateFlow<HeaderState>(HeaderState.Loading)
    val header: StateFlow<HeaderState> = _header

    private val _budget = MutableStateFlow<TabState<BudgetResponse>>(TabState.Idle())
    val budget: StateFlow<TabState<BudgetResponse>> = _budget

    private val _challenges = MutableStateFlow<TabState<List<Challenge>>>(TabState.Idle())
    val challenges: StateFlow<TabState<List<Challenge>>> = _challenges

    private val _promotions = MutableStateFlow<TabState<PromotionsResponse>>(TabState.Idle())
    val promotions: StateFlow<TabState<PromotionsResponse>> = _promotions

    fun loadHeader() {
        viewModelScope.launch {
            _header.value = HeaderState.Loading
            try {
                coroutineScope {
                    val goalsAsync = async { GoalsRepo.list() }
                    val healthAsync = async { runCatching { FinancialHealthRepo.fetch() }.getOrNull() }
                    _header.value = HeaderState.Loaded(goalsAsync.await(), healthAsync.await())
                }
            } catch (e: Throwable) {
                _header.value = HeaderState.Error(e.message ?: "Failed")
            }
        }
    }

    fun loadBudget() {
        if (_budget.value is TabState.Loaded || _budget.value is TabState.Loading) return
        viewModelScope.launch {
            _budget.value = TabState.Loading()
            try {
                _budget.value = TabState.Loaded(BudgetRepo.fetch())
            } catch (e: Throwable) {
                _budget.value = TabState.Error(e.message ?: "Failed")
            }
        }
    }

    fun loadChallenges() {
        if (_challenges.value is TabState.Loaded || _challenges.value is TabState.Loading) return
        viewModelScope.launch {
            _challenges.value = TabState.Loading()
            try {
                _challenges.value = TabState.Loaded(ChallengesRepo.list())
            } catch (e: Throwable) {
                _challenges.value = TabState.Error(e.message ?: "Failed")
            }
        }
    }

    fun loadPromotions() {
        if (_promotions.value is TabState.Loaded || _promotions.value is TabState.Loading) return
        viewModelScope.launch {
            _promotions.value = TabState.Loading()
            try {
                _promotions.value = TabState.Loaded(PromotionsRepo.fetch())
            } catch (e: Throwable) {
                _promotions.value = TabState.Error(e.message ?: "Failed")
            }
        }
    }
}

private enum class SavingsTab { GOALS, BUDGET, CHALLENGES, DEALS }

@Composable
fun SavingsHubScreen(onOpenGoal: (String) -> Unit = {}) {
    val palette = LocalPalette.current
    val locale = LocalAppLocale.current
    val vm: SavingsHubViewModel = viewModel()
    val header by vm.header.collectAsState()
    var tab by remember { mutableStateOf(SavingsTab.GOALS) }
    var aiTipExpanded by remember { mutableStateOf(false) }

    LaunchedEffect(Unit) { vm.loadHeader() }
    LaunchedEffect(tab) {
        when (tab) {
            SavingsTab.GOALS -> Unit
            SavingsTab.BUDGET -> vm.loadBudget()
            SavingsTab.CHALLENGES -> vm.loadChallenges()
            SavingsTab.DEALS -> vm.loadPromotions()
        }
    }

    LazyColumn(
        modifier = Modifier.fillMaxSize().background(palette.background),
        contentPadding = PaddingValues(SolvioTheme.Spacing.md),
        verticalArrangement = Arrangement.spacedBy(SolvioTheme.Spacing.md),
    ) {
        item {
            NBScreenHeader(
                eyebrow = locale.t("savings.eyebrow"),
                title = locale.t("savings.title"),
                subtitle = locale.t("savings.hubSubtitle"),
            )
        }
        when (val s = header) {
            SavingsHubViewModel.HeaderState.Loading -> item { NBLoadingCard() }
            is SavingsHubViewModel.HeaderState.Error -> item {
                NBErrorCard(message = s.message) { vm.loadHeader() }
            }
            is SavingsHubViewModel.HeaderState.Loaded -> {
                val goals = s.goals
                val active = goals.filter { it.isCompleted != true }
                val totalSaved = goals.sumOf { it.currentAmount.toDouble() }
                val monthlyNeeded = active.sumOf { computeMonthlyNeeded(it) }
                val currency = goals.firstOrNull()?.currency ?: "PLN"
                item {
                    KpiStrip(
                        totalSaved = totalSaved,
                        activeCount = active.size,
                        monthlyNeeded = monthlyNeeded,
                        healthScore = s.health?.score,
                        currency = currency,
                    )
                }
                s.health?.tips?.firstOrNull()?.takeIf { it.isNotBlank() }?.let { tip ->
                    item {
                        AiTipBanner(
                            tip = tip,
                            expanded = aiTipExpanded,
                            onToggle = { aiTipExpanded = !aiTipExpanded },
                        )
                    }
                }
                item {
                    TabSwitcher(
                        current = tab,
                        onSelect = { tab = it },
                    )
                }
                when (tab) {
                    SavingsTab.GOALS -> {
                        item {
                            GoalsTabBody(goals = active, onOpenGoal = onOpenGoal)
                        }
                    }
                    SavingsTab.BUDGET -> item { BudgetTabBody(vm) }
                    SavingsTab.CHALLENGES -> item { ChallengesTabBody(vm) }
                    SavingsTab.DEALS -> item { DealsTabBody(vm) }
                }
            }
        }
        item { Spacer(Modifier.height(SolvioTheme.Spacing.xl)) }
    }
}

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
    healthScore: Int?,
    currency: String,
) {
    val locale = LocalAppLocale.current
    Column(verticalArrangement = Arrangement.spacedBy(SolvioTheme.Spacing.xs)) {
        Row(horizontalArrangement = Arrangement.spacedBy(SolvioTheme.Spacing.xs)) {
            StatTile(label = locale.t("savings.totalSaved"), value = Fmt.amount(totalSaved, currency), modifier = Modifier.weight(1f))
            StatTile(label = locale.t("savings.activeGoals"), value = activeCount.toString(), modifier = Modifier.weight(1f))
        }
        Row(horizontalArrangement = Arrangement.spacedBy(SolvioTheme.Spacing.xs)) {
            StatTile(label = locale.t("savings.monthlyNeeded"), value = Fmt.amount(monthlyNeeded, currency), modifier = Modifier.weight(1f))
            if (healthScore != null) {
                HealthGaugeTile(score = healthScore, modifier = Modifier.weight(1f))
            } else {
                StatTile(label = locale.t("savings.health"), value = "—", modifier = Modifier.weight(1f))
            }
        }
    }
}

@Composable
private fun HealthGaugeTile(score: Int, modifier: Modifier = Modifier) {
    val palette = LocalPalette.current
    val locale = LocalAppLocale.current
    val tint = when {
        score >= 70 -> palette.success
        score >= 40 -> palette.warning
        else -> palette.destructive
    }
    Row(
        modifier = modifier
            .nbCard(palette, radius = SolvioTheme.Radius.md, shadow = SolvioTheme.Shadow.sm)
            .padding(SolvioTheme.Spacing.sm),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(SolvioTheme.Spacing.sm),
    ) {
        Box(modifier = Modifier.size(40.dp), contentAlignment = Alignment.Center) {
            androidx.compose.foundation.Canvas(modifier = Modifier.fillMaxSize()) {
                drawCircle(color = palette.muted, style = Stroke(width = 4.dp.toPx()))
                drawArc(
                    color = tint,
                    startAngle = -90f,
                    sweepAngle = (score.coerceIn(0, 100) / 100f) * 360f,
                    useCenter = false,
                    style = Stroke(width = 4.dp.toPx()),
                    topLeft = Offset.Zero,
                    size = Size(size.width, size.height),
                )
            }
            Text(score.toString(), style = SolvioFonts.monoBold(10).copy(color = palette.foreground))
        }
        Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(locale.t("savings.kpiHealth"), style = SolvioFonts.mono(10).copy(color = palette.mutedForeground))
            Text("$score/100", style = SolvioFonts.bold(16).copy(color = palette.foreground))
        }
    }
}

@Composable
private fun AiTipBanner(tip: String, expanded: Boolean, onToggle: () -> Unit) {
    val palette = LocalPalette.current
    val locale = LocalAppLocale.current
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .nbCard(palette, radius = SolvioTheme.Radius.md, shadow = SolvioTheme.Shadow.sm)
            .clickable(onClick = onToggle)
            .padding(SolvioTheme.Spacing.sm),
        verticalArrangement = Arrangement.spacedBy(if (expanded) SolvioTheme.Spacing.xs else 0.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Box(
                modifier = Modifier
                    .size(24.dp)
                    .clip(RoundedCornerShape(SolvioTheme.Radius.sm))
                    .background(palette.muted)
                    .border(SolvioTheme.Border.widthThin, palette.border, RoundedCornerShape(SolvioTheme.Radius.sm)),
                contentAlignment = Alignment.Center,
            ) { Text("✨", style = SolvioFonts.body) }
            Spacer(Modifier.width(8.dp))
            Text(locale.t("savings.aiTip"), style = SolvioFonts.mono(10).copy(color = palette.mutedForeground))
            Spacer(Modifier.weight(1f))
            Text(if (expanded) "▲" else "▼", style = SolvioFonts.mono(11).copy(color = palette.mutedForeground))
        }
        if (expanded) {
            Text(tip, style = SolvioFonts.body.copy(color = palette.foreground))
        }
    }
}

@Composable
private fun TabSwitcher(current: SavingsTab, onSelect: (SavingsTab) -> Unit) {
    val palette = LocalPalette.current
    val locale = LocalAppLocale.current
    val tabs = listOf(
        SavingsTab.GOALS to locale.t("savings.segGoals"),
        SavingsTab.BUDGET to locale.t("savings.segBudget"),
        SavingsTab.CHALLENGES to locale.t("savings.segChallenges"),
        SavingsTab.DEALS to locale.t("savings.segDeals"),
    )
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(SolvioTheme.Radius.md))
            .background(palette.muted)
            .border(SolvioTheme.Border.widthThin, palette.border, RoundedCornerShape(SolvioTheme.Radius.md))
            .padding(4.dp),
        horizontalArrangement = Arrangement.spacedBy(2.dp),
    ) {
        tabs.forEach { (id, label) ->
            val selected = current == id
            Box(
                modifier = Modifier
                    .weight(1f)
                    .clip(RoundedCornerShape(SolvioTheme.Radius.sm))
                    .background(if (selected) palette.foreground else Color.Transparent)
                    .clickable { onSelect(id) }
                    .padding(vertical = 8.dp),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    label,
                    style = SolvioFonts.mono(11).copy(color = if (selected) palette.background else palette.foreground),
                )
            }
        }
    }
}

@Composable
private fun GoalsTabBody(goals: List<SavingsGoal>, onOpenGoal: (String) -> Unit) {
    val palette = LocalPalette.current
    val locale = LocalAppLocale.current
    if (goals.isEmpty()) {
        NBCard(radius = SolvioTheme.Radius.md) {
            NBEmptyState(
                title = locale.t("savings.emptyGoals"),
                subtitle = locale.t("savings.emptyGoalsSub"),
            )
        }
        return
    }
    Column(verticalArrangement = Arrangement.spacedBy(SolvioTheme.Spacing.xs)) {
        goals.take(5).forEach { g ->
            GoalRow(g = g, onClick = { onOpenGoal(g.id) })
        }
    }
}

@Composable
private fun GoalRow(g: SavingsGoal, onClick: () -> Unit) {
    val palette = LocalPalette.current
    val target = g.targetAmount.toDouble()
    val current = g.currentAmount.toDouble()
    val pct = if (target > 0) (current / target).coerceIn(0.0, 1.0) else 0.0

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .nbCard(palette, radius = SolvioTheme.Radius.md, shadow = SolvioTheme.Shadow.sm)
            .clickable(onClick = onClick)
            .padding(SolvioTheme.Spacing.sm),
        horizontalArrangement = Arrangement.spacedBy(SolvioTheme.Spacing.sm),
    ) {
        Box(
            modifier = Modifier
                .size(40.dp)
                .clip(RoundedCornerShape(SolvioTheme.Radius.sm))
                .background(palette.muted)
                .border(SolvioTheme.Border.widthThin, palette.border, RoundedCornerShape(SolvioTheme.Radius.sm)),
            contentAlignment = Alignment.Center,
        ) { Text(g.emoji ?: "🎯", style = SolvioFonts.bold(22)) }
        Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(g.name, style = SolvioFonts.bodyMedium.copy(color = palette.foreground), modifier = Modifier.weight(1f))
                Text("${(pct * 100).toInt()}%", style = SolvioFonts.mono(11).copy(color = palette.mutedForeground))
            }
            ProgressBar(value = pct.toFloat())
            Text(
                "${Fmt.amount(current, g.currency)} / ${Fmt.amount(target, g.currency)}",
                style = SolvioFonts.caption.copy(color = palette.mutedForeground),
            )
        }
    }
}

@Composable
private fun BudgetTabBody(vm: SavingsHubViewModel) {
    val palette = LocalPalette.current
    val locale = LocalAppLocale.current
    val state by vm.budget.collectAsState()
    Column(verticalArrangement = Arrangement.spacedBy(SolvioTheme.Spacing.sm)) {
        when (val s = state) {
            is SavingsHubViewModel.TabState.Idle, is SavingsHubViewModel.TabState.Loading -> NBLoadingCard()
            is SavingsHubViewModel.TabState.Error -> NBErrorCard(message = s.message) { vm.loadBudget() }
            is SavingsHubViewModel.TabState.Loaded -> {
                val r = s.data
                val budget = r.budget
                if (budget == null) {
                    NBCard(radius = SolvioTheme.Radius.md) {
                        NBEmptyState(
                            title = locale.t("savings.emptyBudget"),
                            subtitle = locale.t("savings.emptyBudgetSub"),
                        )
                    }
                } else {
                    val totalBudget = budget.totalBudget?.toDoubleOrNull() ?: 0.0
                    val remaining = (totalBudget - r.totalSpent).coerceAtLeast(0.0)
                    val pct = if (totalBudget > 0) (r.totalSpent / totalBudget).coerceIn(0.0, 1.0) else 0.0
                    NBCard(radius = SolvioTheme.Radius.md, shadow = SolvioTheme.Shadow.sm) {
                        Row(horizontalArrangement = Arrangement.spacedBy(SolvioTheme.Spacing.sm)) {
                            StatTile(label = locale.t("savings.spent"), value = Fmt.amount(r.totalSpent), modifier = Modifier.weight(1f))
                            StatTile(label = locale.t("savings.budgetRemaining"), value = Fmt.amount(remaining), modifier = Modifier.weight(1f))
                        }
                        Spacer(Modifier.height(SolvioTheme.Spacing.sm))
                        ProgressBar(value = pct.toFloat(), over = pct >= 1.0)
                        Spacer(Modifier.height(SolvioTheme.Spacing.xs))
                        Text(
                            locale.format("savings.pctUsed", (pct * 100).toInt()),
                            style = SolvioFonts.caption.copy(color = palette.mutedForeground),
                        )
                    }
                    if (r.alerts.isNotEmpty()) {
                        NBCard(radius = SolvioTheme.Radius.md, shadow = SolvioTheme.Shadow.sm) {
                            NBEyebrow(text = locale.t("savings.alerts"))
                            r.alerts.forEach { a ->
                                Spacer(Modifier.height(4.dp))
                                Text(
                                    "${a.category}: ${(a.pct * 100).toInt()}%",
                                    style = SolvioFonts.body.copy(color = palette.foreground),
                                )
                            }
                        }
                    }
                    if (r.categoryBreakdown.isNotEmpty()) {
                        NBCard(radius = SolvioTheme.Radius.md, shadow = SolvioTheme.Shadow.sm) {
                            NBEyebrow(text = locale.t("savings.topCategories"))
                            r.categoryBreakdown.take(5).forEach { row ->
                                Spacer(Modifier.height(4.dp))
                                Row {
                                    Text(
                                        "${row.icon ?: "📁"} ${row.name}",
                                        style = SolvioFonts.body.copy(color = palette.foreground),
                                        modifier = Modifier.weight(1f),
                                    )
                                    Text(Fmt.amount(row.spent), style = SolvioFonts.mono(12).copy(color = palette.foreground))
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun ChallengesTabBody(vm: SavingsHubViewModel) {
    val palette = LocalPalette.current
    val locale = LocalAppLocale.current
    val state by vm.challenges.collectAsState()
    Column(verticalArrangement = Arrangement.spacedBy(SolvioTheme.Spacing.xs)) {
        when (val s = state) {
            is SavingsHubViewModel.TabState.Idle, is SavingsHubViewModel.TabState.Loading -> NBLoadingCard()
            is SavingsHubViewModel.TabState.Error -> NBErrorCard(message = s.message) { vm.loadChallenges() }
            is SavingsHubViewModel.TabState.Loaded -> {
                val items = s.data
                val active = items.filter { (it.isActive == true) && (it.isCompleted != true) }
                if (active.isEmpty()) {
                    NBCard(radius = SolvioTheme.Radius.md) {
                        NBEmptyState(
                            title = locale.t("savings.emptyChallenges"),
                            subtitle = locale.t("savings.emptyChallengesSub"),
                        )
                    }
                } else {
                    active.take(5).forEach { c ->
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .nbCard(palette, radius = SolvioTheme.Radius.md, shadow = SolvioTheme.Shadow.sm)
                                .padding(SolvioTheme.Spacing.sm),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(SolvioTheme.Spacing.sm),
                        ) {
                            Text(c.emoji ?: "💪", style = SolvioFonts.bold(22))
                            Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                                Text(c.name, style = SolvioFonts.bodyMedium.copy(color = palette.foreground))
                                Text(c.type.uppercase(), style = SolvioFonts.mono(10).copy(color = palette.mutedForeground))
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun DealsTabBody(vm: SavingsHubViewModel) {
    val palette = LocalPalette.current
    val locale = LocalAppLocale.current
    val state by vm.promotions.collectAsState()
    Column(verticalArrangement = Arrangement.spacedBy(SolvioTheme.Spacing.xs)) {
        when (val s = state) {
            is SavingsHubViewModel.TabState.Idle, is SavingsHubViewModel.TabState.Loading -> NBLoadingCard()
            is SavingsHubViewModel.TabState.Error -> NBErrorCard(message = s.message) { vm.loadPromotions() }
            is SavingsHubViewModel.TabState.Loaded -> {
                val r = s.data
                val combined = (r.personalizedDeals + r.promotions).take(5)
                if (combined.isEmpty()) {
                    NBCard(radius = SolvioTheme.Radius.md) {
                        NBEmptyState(
                            title = locale.t("savings.emptyDeals"),
                            subtitle = locale.t("savings.emptyDealsSub"),
                        )
                    }
                } else {
                    combined.forEach { offer -> DealRow(offer) }
                }
            }
        }
    }
}

@Composable
private fun DealRow(offer: PromoOffer) {
    val palette = LocalPalette.current
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .nbCard(palette, radius = SolvioTheme.Radius.md, shadow = SolvioTheme.Shadow.sm)
            .padding(SolvioTheme.Spacing.sm),
        verticalArrangement = Arrangement.spacedBy(2.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(
                offer.productName ?: offer.store ?: "—",
                style = SolvioFonts.bodyMedium.copy(color = palette.foreground),
                modifier = Modifier.weight(1f),
            )
            offer.discount?.takeIf { it.isNotBlank() }?.let { d ->
                NBTag(text = d, background = palette.success.copy(alpha = 0.15f), foreground = palette.success)
            }
        }
        offer.store?.takeIf { it.isNotBlank() && offer.productName != null }?.let { s ->
            Text(s, style = SolvioFonts.caption.copy(color = palette.mutedForeground))
        }
    }
}
