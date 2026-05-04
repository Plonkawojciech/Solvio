package com.programo.solvio.features.goals

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
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
import com.programo.solvio.core.models.SavingsDeposit
import com.programo.solvio.core.models.SavingsGoal
import com.programo.solvio.core.network.GoalsRepo
import com.programo.solvio.core.theme.LocalPalette
import com.programo.solvio.core.theme.SolvioFonts
import com.programo.solvio.core.theme.SolvioTheme
import com.programo.solvio.core.theme.nbCard
import com.programo.solvio.core.ui.NBCard
import com.programo.solvio.core.ui.NBDestructiveButton
import com.programo.solvio.core.ui.NBErrorCard
import com.programo.solvio.core.ui.NBEyebrow
import com.programo.solvio.core.ui.NBLoadingCard
import com.programo.solvio.core.ui.NBPrimaryButton
import com.programo.solvio.core.ui.NBScreenHeader
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import java.time.LocalDate
import java.time.temporal.ChronoUnit

/// Goal detail — mirrors `Features/Goals/GoalDetailView.swift`. Large goal
/// hero card (emoji + name + progress bar + currentAmount/targetAmount +
/// monthly needed) + deposits history list + "Add funds" button → reuses
/// existing `DepositSheet`. Fetches goal from `GoalsRepo.list()` and finds
/// matching id (no per-goal endpoint).
class GoalDetailViewModel : ViewModel() {
    sealed class UiState {
        object Loading : UiState()
        data class Error(val message: String) : UiState()
        data class Loaded(val goal: SavingsGoal) : UiState()
        object NotFound : UiState()
    }

    private val _state = MutableStateFlow<UiState>(UiState.Loading)
    val state: StateFlow<UiState> = _state

    fun load(id: String) {
        viewModelScope.launch {
            _state.value = UiState.Loading
            try {
                val all = GoalsRepo.list()
                val g = all.firstOrNull { it.id == id }
                if (g == null) _state.value = UiState.NotFound
                else _state.value = UiState.Loaded(g)
            } catch (e: Throwable) {
                _state.value = UiState.Error(e.message ?: "Failed")
            }
        }
    }

    fun deposit(goalId: String, amount: Double, note: String?, onDone: (Boolean) -> Unit) {
        viewModelScope.launch {
            try {
                GoalsRepo.deposit(goalId = goalId, amount = amount, note = note)
                onDone(true)
                load(goalId)
            } catch (e: Throwable) {
                onDone(false)
            }
        }
    }

    fun delete(goalId: String, onDone: (Boolean) -> Unit) {
        viewModelScope.launch {
            try {
                GoalsRepo.delete(goalId)
                onDone(true)
            } catch (e: Throwable) {
                onDone(false)
            }
        }
    }
}

@Composable
fun GoalDetailScreen(goalId: String, onClose: () -> Unit) {
    val palette = LocalPalette.current
    val locale = LocalAppLocale.current
    val toast = LocalToast.current
    val vm: GoalDetailViewModel = viewModel()
    val state by vm.state.collectAsState()
    var showDeposit by remember { mutableStateOf(false) }
    var showDelete by remember { mutableStateOf(false) }

    LaunchedEffect(goalId) { vm.load(goalId) }

    LazyColumn(
        modifier = Modifier.fillMaxSize().background(palette.background),
        contentPadding = PaddingValues(SolvioTheme.Spacing.md),
        verticalArrangement = Arrangement.spacedBy(SolvioTheme.Spacing.md),
    ) {
        item {
            NBScreenHeader(
                eyebrow = locale.t("goalDetail.goalFallback"),
                title = locale.t("goalDetail.title"),
            )
        }

        when (val s = state) {
            GoalDetailViewModel.UiState.Loading -> item { NBLoadingCard() }
            is GoalDetailViewModel.UiState.Error -> item {
                NBErrorCard(message = s.message) { vm.load(goalId) }
            }
            GoalDetailViewModel.UiState.NotFound -> item {
                NBCard(radius = SolvioTheme.Radius.md) {
                    Text(locale.t("goalDetail.notFound"), style = SolvioFonts.body.copy(color = palette.foreground))
                }
            }
            is GoalDetailViewModel.UiState.Loaded -> {
                val g = s.goal
                item { GoalHero(g) }
                item { KpiRow(g) }
                g.aiTips?.takeIf { it.isNotEmpty() }?.let { tips ->
                    item { AiTipsCard(tips) }
                }
                item {
                    Column(verticalArrangement = Arrangement.spacedBy(SolvioTheme.Spacing.xs)) {
                        if (g.isCompleted != true) {
                            NBPrimaryButton(
                                label = locale.t("goalDetail.addFunds"),
                                onClick = { showDeposit = true },
                            )
                        }
                        NBDestructiveButton(
                            label = locale.t("goalDetail.deleteGoal"),
                            onClick = { showDelete = true },
                        )
                    }
                }
                g.deposits?.takeIf { it.isNotEmpty() }?.let { deposits ->
                    item { DepositsSection(deposits, g.currency) }
                }
            }
        }

        item { Spacer(Modifier.height(SolvioTheme.Spacing.xl)) }
    }

    val loaded = state as? GoalDetailViewModel.UiState.Loaded
    if (showDeposit && loaded != null) {
        DepositSheet(
            goal = loaded.goal,
            onDismiss = { showDeposit = false },
            onSubmit = { amount, note ->
                showDeposit = false
                vm.deposit(goalId, amount, note) { ok ->
                    if (ok) toast.success(locale.t("goalDetail.fundsAdded"))
                    else toast.error(locale.t("goalDetail.failed"))
                }
            },
        )
    }

    if (showDelete) {
        AlertDialog(
            onDismissRequest = { showDelete = false },
            title = { Text(locale.t("goalDetail.deleteConfirm")) },
            text = { Text(locale.t("goalDetail.deleteMsg")) },
            confirmButton = {
                TextButton(onClick = {
                    showDelete = false
                    vm.delete(goalId) { ok ->
                        if (ok) {
                            toast.success(locale.t("goalDetail.deleted"))
                            onClose()
                        } else {
                            toast.error(locale.t("goalDetail.deleteFailed"))
                        }
                    }
                }) { Text(locale.t("common.delete")) }
            },
            dismissButton = {
                TextButton(onClick = { showDelete = false }) { Text(locale.t("common.cancel")) }
            },
            containerColor = palette.surface,
        )
    }
}

@Composable
private fun GoalHero(g: SavingsGoal) {
    val palette = LocalPalette.current
    val locale = LocalAppLocale.current
    val target = g.targetAmount.toDouble()
    val current = g.currentAmount.toDouble()
    val pct = if (target > 0) (current / target).coerceIn(0.0, 1.0) else 0.0
    val pctLabel = (pct * 100).toInt()
    val remaining = (target - current).coerceAtLeast(0.0)

    NBCard(radius = SolvioTheme.Radius.lg, shadow = SolvioTheme.Shadow.lg) {
        Row(verticalAlignment = Alignment.Top, horizontalArrangement = Arrangement.spacedBy(SolvioTheme.Spacing.sm)) {
            Box(
                modifier = Modifier
                    .size(56.dp)
                    .clip(RoundedCornerShape(SolvioTheme.Radius.md))
                    .background(palette.muted)
                    .border(SolvioTheme.Border.width, palette.border, RoundedCornerShape(SolvioTheme.Radius.md)),
                contentAlignment = Alignment.Center,
            ) { Text(g.emoji ?: "🎯", style = SolvioFonts.bold(36)) }
            Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                NBEyebrow(text = (g.category ?: locale.t("goalDetail.goalFallback")).uppercase())
                Text(g.name, style = SolvioFonts.pageTitle.copy(color = palette.foreground), maxLines = 2)
            }
            if (g.isCompleted == true) {
                Text("✓", style = SolvioFonts.bold(20).copy(color = palette.success))
            }
        }

        Spacer(Modifier.height(SolvioTheme.Spacing.sm))
        Text(Fmt.amount(current, g.currency), style = SolvioFonts.amountLarge.copy(color = palette.foreground))
        Text(
            "${Fmt.amount(target, g.currency)} · $pctLabel%",
            style = SolvioFonts.caption.copy(color = palette.mutedForeground),
        )

        Spacer(Modifier.height(SolvioTheme.Spacing.xs))
        ProgressBar(value = pct.toFloat())

        Spacer(Modifier.height(SolvioTheme.Spacing.sm))
        Row(horizontalArrangement = Arrangement.spacedBy(SolvioTheme.Spacing.md)) {
            Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                Text(locale.t("goalDetail.remaining"), style = SolvioFonts.caption.copy(color = palette.mutedForeground))
                Text(Fmt.amount(remaining, g.currency), style = SolvioFonts.cardTitle.copy(color = palette.foreground))
            }
            g.deadline?.let { d ->
                Spacer(Modifier.weight(1f))
                Column(horizontalAlignment = Alignment.End, verticalArrangement = Arrangement.spacedBy(2.dp)) {
                    Text(locale.t("goalDetail.deadlineLabel"), style = SolvioFonts.caption.copy(color = palette.mutedForeground))
                    Text(Fmt.date(d), style = SolvioFonts.cardTitle.copy(color = palette.foreground))
                }
            }
        }
    }
}

@Composable
private fun KpiRow(g: SavingsGoal) {
    val palette = LocalPalette.current
    val locale = LocalAppLocale.current
    val target = g.targetAmount.toDouble()
    val current = g.currentAmount.toDouble()
    val remaining = (target - current).coerceAtLeast(0.0)
    val monthsLeft = monthsRemaining(g.deadline)
    val monthlyNeeded = if (monthsLeft != null && monthsLeft > 0) remaining / monthsLeft else remaining / 12.0
    val depositCount = g.deposits?.size ?: 0

    Row(horizontalArrangement = Arrangement.spacedBy(SolvioTheme.Spacing.sm)) {
        StatTile(
            label = locale.t("goalDetail.perMonth"),
            value = Fmt.amount(monthlyNeeded, g.currency),
            modifier = Modifier.weight(1f),
        )
        StatTile(
            label = locale.t("goalDetail.deposits"),
            value = depositCount.toString(),
            modifier = Modifier.weight(1f),
        )
        g.priority?.let { p ->
            StatTile(
                label = locale.t("goalDetail.priority"),
                value = p.replaceFirstChar { it.uppercase() },
                modifier = Modifier.weight(1f),
            )
        }
    }
}

@Composable
private fun AiTipsCard(tips: List<String>) {
    val palette = LocalPalette.current
    val locale = LocalAppLocale.current
    NBCard(radius = SolvioTheme.Radius.md, shadow = SolvioTheme.Shadow.sm) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            Text("✨", style = SolvioFonts.body)
            NBEyebrow(text = locale.t("goalDetail.aiCoach"))
        }
        Spacer(Modifier.height(SolvioTheme.Spacing.xs))
        tips.forEach { tip ->
            Row(verticalAlignment = Alignment.Top, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                Text("•", style = SolvioFonts.body.copy(color = palette.mutedForeground))
                Text(tip, style = SolvioFonts.body.copy(color = palette.foreground))
            }
        }
    }
}

@Composable
private fun DepositsSection(deposits: List<SavingsDeposit>, currency: String) {
    val palette = LocalPalette.current
    val locale = LocalAppLocale.current
    Column(verticalArrangement = Arrangement.spacedBy(SolvioTheme.Spacing.xs)) {
        NBEyebrow(text = locale.t("goalDetail.depositsHistory"))
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .nbCard(palette, radius = SolvioTheme.Radius.md, shadow = SolvioTheme.Shadow.sm)
                .padding(SolvioTheme.Spacing.md),
        ) {
            deposits.forEachIndexed { idx, dep ->
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                        Text(Fmt.amount(dep.amount.toDouble(), currency), style = SolvioFonts.cardTitle.copy(color = palette.foreground))
                        dep.note?.takeIf { it.isNotBlank() }?.let {
                            Text(it, style = SolvioFonts.caption.copy(color = palette.mutedForeground))
                        }
                    }
                    dep.createdAt?.let {
                        Text(Fmt.date(it), style = SolvioFonts.caption.copy(color = palette.mutedForeground))
                    }
                }
                if (idx != deposits.lastIndex) {
                    Spacer(Modifier.height(SolvioTheme.Spacing.xs))
                    Box(modifier = Modifier.fillMaxWidth().height(1.dp).background(palette.border.copy(alpha = 0.4f)))
                    Spacer(Modifier.height(SolvioTheme.Spacing.xs))
                }
            }
        }
    }
}

private fun monthsRemaining(deadline: String?): Int? {
    val d = deadline?.take(10) ?: return null
    return runCatching {
        val target = LocalDate.parse(d)
        val days = ChronoUnit.DAYS.between(LocalDate.now(), target)
        (days / 30).toInt().coerceAtLeast(0)
    }.getOrNull()
}
