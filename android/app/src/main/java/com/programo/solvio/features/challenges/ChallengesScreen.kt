package com.programo.solvio.features.challenges

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
import com.programo.solvio.LocalToast
import com.programo.solvio.core.Fmt
import com.programo.solvio.core.models.Challenge
import com.programo.solvio.core.models.ChallengeCreate
import com.programo.solvio.core.network.ChallengesRepo
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
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import java.time.LocalDate
import java.time.temporal.ChronoUnit

/// Challenges list — mirrors `Features/Challenges/ChallengesView.swift`.
/// KPI strip (active count) + active challenge cards with emoji + type tag
/// + targetAmount progress + endDate + collapsible completed section + create sheet.
class ChallengesViewModel : ViewModel() {
    sealed class UiState {
        object Loading : UiState()
        data class Error(val message: String) : UiState()
        data class Loaded(val items: List<Challenge>) : UiState()
    }

    private val _state = MutableStateFlow<UiState>(UiState.Loading)
    val state: StateFlow<UiState> = _state

    fun load() {
        viewModelScope.launch {
            _state.value = UiState.Loading
            try {
                _state.value = UiState.Loaded(ChallengesRepo.list())
            } catch (e: Throwable) {
                _state.value = UiState.Error(e.message ?: "Failed")
            }
        }
    }

    fun create(body: ChallengeCreate, onDone: (Boolean) -> Unit) {
        viewModelScope.launch {
            try {
                ChallengesRepo.create(body)
                onDone(true)
                load()
            } catch (e: Throwable) {
                onDone(false)
            }
        }
    }
}

@Composable
fun ChallengesScreen() {
    val palette = LocalPalette.current
    val locale = LocalAppLocale.current
    val toast = LocalToast.current
    val vm: ChallengesViewModel = viewModel()
    val state by vm.state.collectAsState()
    var showCreate by remember { mutableStateOf(false) }
    var showCompleted by remember { mutableStateOf(false) }
    val currency = "PLN"

    LaunchedEffect(Unit) { vm.load() }

    Box(modifier = Modifier.fillMaxSize().background(palette.background)) {
        LazyColumn(
            contentPadding = PaddingValues(SolvioTheme.Spacing.md),
            verticalArrangement = Arrangement.spacedBy(SolvioTheme.Spacing.md),
        ) {
            item {
                val active = (state as? ChallengesViewModel.UiState.Loaded)?.items?.count { (it.isActive == true) && (it.isCompleted != true) } ?: 0
                val completed = (state as? ChallengesViewModel.UiState.Loaded)?.items?.count { it.isCompleted == true } ?: 0
                NBScreenHeader(
                    eyebrow = locale.t("challenges.eyebrow"),
                    title = locale.t("challenges.headerTitle"),
                    subtitle = "$active ${locale.t("challenges.active").lowercase()} · $completed ${locale.t("challenges.completed").lowercase()}",
                )
            }

            when (val s = state) {
                ChallengesViewModel.UiState.Loading -> item { NBLoadingCard() }
                is ChallengesViewModel.UiState.Error -> item {
                    NBErrorCard(message = s.message) { vm.load() }
                }
                is ChallengesViewModel.UiState.Loaded -> {
                    val challenges = s.items
                    if (challenges.isEmpty()) {
                        item {
                            NBCard(radius = SolvioTheme.Radius.md) {
                                NBEmptyState(
                                    title = locale.t("challenges.emptyTitle"),
                                    subtitle = locale.t("challenges.emptySub"),
                                )
                            }
                        }
                    } else {
                        val active = challenges.filter { (it.isActive == true) && (it.isCompleted != true) }
                        val completed = challenges.filter { it.isCompleted == true }
                        val totalSaved = challenges.sumOf { it.currentProgress?.toDouble() ?: 0.0 }

                        item {
                            Row(horizontalArrangement = Arrangement.spacedBy(SolvioTheme.Spacing.xs)) {
                                StatTile(label = locale.t("challenges.statActive"), value = active.size.toString(), modifier = Modifier.weight(1f))
                                StatTile(label = locale.t("challenges.statCompleted"), value = completed.size.toString(), modifier = Modifier.weight(1f))
                                StatTile(label = locale.t("challenges.statSaved"), value = Fmt.amount(totalSaved, currency), modifier = Modifier.weight(1f))
                            }
                        }

                        if (active.isNotEmpty()) {
                            item {
                                Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                                    NBEyebrow(text = locale.t("challenges.sectionActive"), color = palette.mutedForeground)
                                    Spacer(Modifier.weight(1f))
                                    Text("${active.size}", style = SolvioFonts.mono(11).copy(color = palette.mutedForeground))
                                }
                            }
                            items(active, key = { it.id }) { c -> ActiveChallengeCard(c, currency) }
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
                                items(completed, key = { it.id }) { c -> CompletedRow(c, currency) }
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
        ) { Text("+", style = SolvioFonts.bold(28).copy(color = palette.background)) }
    }

    if (showCreate) {
        ChallengeCreateSheet(
            onDismiss = { showCreate = false },
            onSubmit = { body ->
                showCreate = false
                vm.create(body) { ok ->
                    if (ok) toast.success(locale.t("challenges.created"))
                    else toast.error(locale.t("challenges.createFailed"))
                }
            },
        )
    }
}

@Composable
private fun ActiveChallengeCard(c: Challenge, currency: String) {
    val palette = LocalPalette.current
    val locale = LocalAppLocale.current
    val target = c.targetAmount?.toDouble() ?: 0.0
    val progress = c.currentProgress?.toDouble() ?: 0.0
    val pct = if (target > 0) (progress / target) else 0.0
    val daysLeft = daysUntil(c.endDate)

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .nbCard(palette, radius = SolvioTheme.Radius.md, shadow = SolvioTheme.Shadow.sm)
            .padding(SolvioTheme.Spacing.sm),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Row(verticalAlignment = Alignment.Top, horizontalArrangement = Arrangement.spacedBy(SolvioTheme.Spacing.sm)) {
            Box(
                modifier = Modifier
                    .size(44.dp)
                    .clip(RoundedCornerShape(SolvioTheme.Radius.sm))
                    .background(palette.muted)
                    .border(SolvioTheme.Border.widthThin, palette.border, RoundedCornerShape(SolvioTheme.Radius.sm)),
                contentAlignment = Alignment.Center,
            ) { Text(c.emoji ?: "💪", style = SolvioFonts.bold(24)) }
            Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text(c.name, style = SolvioFonts.bodyMedium.copy(color = palette.foreground))
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    NBTag(text = c.type.uppercase())
                    c.targetCategory?.takeIf { it.isNotBlank() }?.let {
                        Text(it, style = SolvioFonts.caption.copy(color = palette.mutedForeground))
                    }
                }
            }
            daysLeft?.let { d ->
                Column(horizontalAlignment = Alignment.End, verticalArrangement = Arrangement.spacedBy(2.dp)) {
                    Text(d.toString(), style = SolvioFonts.monoBold(16).copy(color = palette.foreground))
                    Text(
                        if (d == 1) locale.t("challenges.dayLeft") else locale.t("challenges.daysLeft"),
                        style = SolvioFonts.mono(10).copy(color = palette.mutedForeground),
                    )
                }
            }
        }
        if (target > 0) {
            ProgressBar(value = pct.toFloat(), over = pct > 1)
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    "${Fmt.amount(progress, currency)} / ${Fmt.amount(target, currency)}",
                    style = SolvioFonts.caption.copy(color = palette.mutedForeground),
                    modifier = Modifier.weight(1f),
                )
                Text("${(pct * 100).toInt().coerceAtMost(100)}%", style = SolvioFonts.mono(11).copy(color = palette.mutedForeground))
            }
        }
        Text(
            "${Fmt.date(c.startDate)} – ${Fmt.date(c.endDate)}",
            style = SolvioFonts.caption.copy(color = palette.mutedForeground),
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
            .clickable(onClick = onToggle)
            .padding(SolvioTheme.Spacing.sm),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text("✓", style = SolvioFonts.bold(14).copy(color = palette.success))
        Spacer(Modifier.width(6.dp))
        Text(
            locale.format("challenges.completedCountFmt", count),
            style = SolvioFonts.bodyMedium.copy(color = palette.foreground),
        )
        Spacer(Modifier.weight(1f))
        Text(if (expanded) "▲" else "▼", style = SolvioFonts.mono(11).copy(color = palette.mutedForeground))
    }
}

@Composable
private fun CompletedRow(c: Challenge, currency: String) {
    val palette = LocalPalette.current
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .nbCard(palette, radius = SolvioTheme.Radius.sm, shadow = SolvioTheme.Shadow.sm)
            .padding(SolvioTheme.Spacing.sm),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(SolvioTheme.Spacing.sm),
    ) {
        Text(c.emoji ?: "🏆", style = SolvioFonts.bold(22))
        Column(modifier = Modifier.weight(1f)) {
            Text(c.name, style = SolvioFonts.bodyMedium.copy(color = palette.foreground))
            c.targetAmount?.let { ta ->
                Text(Fmt.amount(ta.toDouble(), currency), style = SolvioFonts.caption.copy(color = palette.mutedForeground))
            }
        }
        Text("✓", style = SolvioFonts.bold(16).copy(color = palette.success))
    }
}

private fun daysUntil(iso: String?): Int? {
    val s = iso?.take(10) ?: return null
    return runCatching {
        val target = LocalDate.parse(s)
        val days = ChronoUnit.DAYS.between(LocalDate.now(), target)
        days.toInt().coerceAtLeast(0)
    }.getOrNull()
}
