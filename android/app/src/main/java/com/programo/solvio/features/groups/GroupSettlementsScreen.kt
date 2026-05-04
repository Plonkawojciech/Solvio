package com.programo.solvio.features.groups

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowForward
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
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
import com.programo.solvio.core.ToastCenter
import com.programo.solvio.core.models.ExpenseSplit
import com.programo.solvio.core.models.SettlementDebt
import com.programo.solvio.core.models.SettlementPaymentRequest
import com.programo.solvio.core.models.SettlementPerPerson
import com.programo.solvio.core.models.SettlementsResponse
import com.programo.solvio.core.network.GroupsRepo
import com.programo.solvio.core.theme.LocalPalette
import com.programo.solvio.core.theme.SolvioFonts
import com.programo.solvio.core.theme.SolvioTheme
import com.programo.solvio.core.theme.nbCard
import com.programo.solvio.core.ui.NBErrorCard
import com.programo.solvio.core.ui.NBEyebrow
import com.programo.solvio.core.ui.NBLoadingCard
import com.programo.solvio.core.ui.NBTag
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import kotlin.math.abs

class GroupSettlementsViewModel : ViewModel() {
    sealed class UiState {
        object Loading : UiState()
        data class Error(val message: String) : UiState()
        data class Loaded(val data: SettlementsResponse, val splits: List<ExpenseSplit>) : UiState()
    }

    private val _state = MutableStateFlow<UiState>(UiState.Loading)
    val state: StateFlow<UiState> = _state

    private val _settlingKey = MutableStateFlow<String?>(null)
    val settlingKey: StateFlow<String?> = _settlingKey

    fun load(groupId: String) {
        viewModelScope.launch {
            _state.value = UiState.Loading
            try {
                coroutineScope {
                    val sttl = async { GroupsRepo.settlements(groupId) }
                    val det = async { GroupsRepo.detail(groupId) }
                    _state.value = UiState.Loaded(sttl.await(), det.await().splits.orEmpty())
                }
            } catch (e: Throwable) {
                _state.value = UiState.Error(e.message ?: "Failed to load settlements")
            }
        }
    }

    fun markSettled(
        debt: SettlementDebt,
        groupId: String,
        locale: AppLocale,
        toast: ToastCenter,
        debtKey: String,
    ) {
        viewModelScope.launch {
            _settlingKey.value = debtKey
            try {
                val splits = (_state.value as? UiState.Loaded)?.splits.orEmpty()
                val candidates = splits.filter { split ->
                    split.paidByMemberId == debt.toId && split.splits.any { share ->
                        share.memberId == debt.fromId && (share.settled == null || share.settled == false)
                    }
                }
                if (candidates.isEmpty()) {
                    toast.error(locale.t("groupSettlements.noOpenSplit"))
                } else {
                    candidates.forEach { GroupsRepo.settleSplit(it.id, debt.fromId) }
                    toast.success(locale.t("groupSettlements.markedSettled"))
                    load(groupId)
                }
            } catch (e: Throwable) {
                toast.error(locale.t("groupSettlements.failedSettle"), description = e.message)
            } finally {
                _settlingKey.value = null
            }
        }
    }
}

@Composable
fun GroupSettlementsScreen(groupId: String, onBack: () -> Unit) {
    val palette = LocalPalette.current
    val locale = LocalAppLocale.current
    val toast = LocalToast.current
    val vm: GroupSettlementsViewModel = viewModel()
    val state by vm.state.collectAsState()
    val settlingKey by vm.settlingKey.collectAsState()

    LaunchedEffect(groupId) { vm.load(groupId) }

    Column(modifier = Modifier.fillMaxSize().background(palette.background)) {
        DetailTopBar(title = locale.t("groupDetail.settlements"), onBack = onBack)

        when (val s = state) {
            GroupSettlementsViewModel.UiState.Loading -> Box(modifier = Modifier.padding(SolvioTheme.Spacing.md)) { NBLoadingCard() }
            is GroupSettlementsViewModel.UiState.Error -> Box(modifier = Modifier.padding(SolvioTheme.Spacing.md)) {
                NBErrorCard(message = s.message) { vm.load(groupId) }
            }
            is GroupSettlementsViewModel.UiState.Loaded -> {
                val data = s.data
                val currency = data.group.currency ?: "PLN"
                LazyColumn(
                    modifier = Modifier.fillMaxSize(),
                    contentPadding = PaddingValues(SolvioTheme.Spacing.md),
                    verticalArrangement = Arrangement.spacedBy(SolvioTheme.Spacing.md),
                ) {
                    item { Header(data = data, locale = locale) }
                    item { StatsGrid(data = data, currency = currency, locale = locale) }
                    item { NBEyebrow(text = locale.t("groupSettlements.whoOwes").removePrefix("// "), color = palette.mutedForeground) }
                    if (data.debts.isEmpty()) {
                        item { EmptyDebtsCard(locale = locale) }
                    } else {
                        items(data.debts, key = { it.fromId + "->" + it.toId }) { debt ->
                            val key = debt.fromId + "->" + debt.toId
                            DebtRow(
                                debt = debt,
                                currency = currency,
                                isSettling = settlingKey == key,
                                anySettling = settlingKey != null,
                                locale = locale,
                                onMarkSettled = {
                                    vm.markSettled(debt, groupId, locale, toast, key)
                                },
                            )
                        }
                    }
                    if (data.perPersonBreakdown.isNotEmpty()) {
                        item { NBEyebrow(text = locale.t("groupSettlements.perPerson").removePrefix("// "), color = palette.mutedForeground) }
                        items(data.perPersonBreakdown, key = { it.memberId }) { p ->
                            BalanceRow(person = p, currency = currency, locale = locale)
                        }
                    }
                    if (data.paymentRequests.isNotEmpty()) {
                        item { NBEyebrow(text = locale.t("groupSettlements.paymentRequests").removePrefix("// "), color = palette.mutedForeground) }
                        items(data.paymentRequests, key = { it.id }) { req ->
                            PaymentRequestRow(req = req, locale = locale)
                        }
                    }
                    item { Spacer(Modifier.height(SolvioTheme.Spacing.xl)) }
                }
            }
        }
    }
}

@Composable
private fun Header(data: SettlementsResponse, locale: AppLocale) {
    val palette = LocalPalette.current
    val g = data.group
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .nbCard(palette, radius = SolvioTheme.Radius.lg, shadow = SolvioTheme.Shadow.md)
            .padding(SolvioTheme.Spacing.md),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(SolvioTheme.Spacing.sm),
    ) {
        Box(
            modifier = Modifier
                .size(52.dp)
                .clip(RoundedCornerShape(SolvioTheme.Radius.md))
                .background(palette.muted),
            contentAlignment = Alignment.Center,
        ) {
            Text(g.emoji ?: "👥", style = SolvioFonts.regular(28))
        }
        Column(modifier = Modifier.weight(1f)) {
            NBEyebrow(text = "GROUP", color = palette.mutedForeground)
            Text(g.name, style = SolvioFonts.sectionTitle.copy(color = palette.foreground))
            g.currency?.let {
                Text(it.uppercase(), style = SolvioFonts.mono(11).copy(color = palette.mutedForeground))
            }
        }
        if (data.stats.allSettled) {
            NBTag(text = locale.t("groupSettlements.allSettled"), background = palette.muted, foreground = palette.success)
        }
    }
}

@Composable
private fun StatsGrid(data: SettlementsResponse, currency: String, locale: AppLocale) {
    val palette = LocalPalette.current
    val s = data.stats
    Column(
        modifier = Modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(SolvioTheme.Spacing.xs),
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(SolvioTheme.Spacing.xs),
        ) {
            StatTile(
                label = locale.t("groupSettlements.totalRequests"),
                value = "${s.pendingCount + s.settledCount}",
                sub = "${s.membersCount} ${locale.t("groupSettlements.membersSuffix")}",
                modifier = Modifier.weight(1f),
            )
            StatTile(
                label = locale.t("groupSettlements.totalSpend"),
                value = Fmt.amount(s.totalGroupSpend, currency),
                modifier = Modifier.weight(1f),
            )
        }
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(SolvioTheme.Spacing.xs),
        ) {
            StatTile(
                label = locale.t("groupSettlements.pending"),
                value = Fmt.amount(s.totalPendingAmount, currency),
                sub = "${s.pendingCount} ${locale.t("groupSettlements.requestsSuffix")}",
                tint = if (s.pendingCount > 0) palette.destructive else palette.foreground,
                modifier = Modifier.weight(1f),
            )
            StatTile(
                label = locale.t("groupSettlements.settled"),
                value = Fmt.amount(s.totalSettledAmount, currency),
                sub = "${s.settledCount} ${locale.t("groupSettlements.requestsSuffix")}",
                tint = palette.success,
                modifier = Modifier.weight(1f),
            )
        }
    }
}

@Composable
private fun EmptyDebtsCard(locale: AppLocale) {
    val palette = LocalPalette.current
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .nbCard(palette, radius = SolvioTheme.Radius.md, shadow = SolvioTheme.Shadow.sm)
            .padding(SolvioTheme.Spacing.md),
        verticalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        Text(locale.t("groupSettlements.noDebts"), style = SolvioFonts.cardTitle.copy(color = palette.foreground))
        Text(locale.t("groupSettlements.everyoneSquare"), style = SolvioFonts.caption.copy(color = palette.mutedForeground))
    }
}

@Composable
private fun DebtRow(
    debt: SettlementDebt,
    currency: String,
    isSettling: Boolean,
    anySettling: Boolean,
    locale: AppLocale,
    onMarkSettled: () -> Unit,
) {
    val palette = LocalPalette.current
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .nbCard(palette, radius = SolvioTheme.Radius.md, shadow = SolvioTheme.Shadow.sm)
            .padding(SolvioTheme.Spacing.sm),
        verticalArrangement = Arrangement.spacedBy(SolvioTheme.Spacing.xs),
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(SolvioTheme.Spacing.sm),
        ) {
            PersonAvatar(name = debt.fromName, color = debt.fromColor)
            Icon(Icons.AutoMirrored.Filled.ArrowForward, contentDescription = null, tint = palette.mutedForeground, modifier = Modifier.size(16.dp))
            PersonAvatar(name = debt.toName, color = debt.toColor)
            Spacer(modifier = Modifier.weight(1f))
            Text(Fmt.amount(debt.amount, currency), style = SolvioFonts.amount.copy(color = palette.foreground))
        }
        Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Text(
                locale.t("groupSettlements.owesPrefix")
                    .replaceFirst("%@", debt.fromName)
                    .replaceFirst("%@", debt.toName),
                style = SolvioFonts.caption.copy(color = palette.mutedForeground),
                modifier = Modifier.weight(1f),
            )
            Box(
                modifier = Modifier
                    .clip(RoundedCornerShape(SolvioTheme.Radius.sm))
                    .background(palette.surface)
                    .clickable(enabled = !anySettling) { onMarkSettled() }
                    .padding(horizontal = 12.dp, vertical = 8.dp),
                contentAlignment = Alignment.Center,
            ) {
                if (isSettling) {
                    CircularProgressIndicator(strokeWidth = 2.dp, color = palette.foreground, modifier = Modifier.size(14.dp))
                } else {
                    Text(
                        locale.t("groupSettlements.markSettled").uppercase(),
                        style = SolvioFonts.mono(11).copy(color = palette.foreground),
                    )
                }
            }
        }
    }
}

@Composable
private fun BalanceRow(person: SettlementPerPerson, currency: String, locale: AppLocale) {
    val palette = LocalPalette.current
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .nbCard(palette, radius = SolvioTheme.Radius.md, shadow = SolvioTheme.Shadow.sm)
            .padding(SolvioTheme.Spacing.sm),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(SolvioTheme.Spacing.sm),
    ) {
        PersonAvatar(name = person.name, color = person.color)
        Column(modifier = Modifier.weight(1f)) {
            Text(person.name, style = SolvioFonts.bodyMedium.copy(color = palette.foreground))
            Text(
                locale.t("groupSettlements.paidShare")
                    .replaceFirst("%@", Fmt.amount(person.totalPaid, currency))
                    .replaceFirst("%@", Fmt.amount(person.totalConsumed, currency)),
                style = SolvioFonts.caption.copy(color = palette.mutedForeground),
            )
        }
        Column(horizontalAlignment = Alignment.End) {
            val sign = if (person.netBalance >= 0) "+" else "−"
            Text(
                "$sign${Fmt.amount(abs(person.netBalance), currency)}",
                style = SolvioFonts.mono(14).copy(
                    color = if (person.netBalance >= 0) palette.success else palette.destructive,
                ),
            )
            Text(
                if (person.netBalance >= 0) locale.t("groupSettlements.isOwed") else locale.t("groupSettlements.owes"),
                style = SolvioFonts.mono(10).copy(color = palette.mutedForeground),
            )
        }
    }
}

@Composable
private fun PaymentRequestRow(req: SettlementPaymentRequest, locale: AppLocale) {
    val palette = LocalPalette.current
    val currency = req.currency ?: "PLN"
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .nbCard(palette, radius = SolvioTheme.Radius.md, shadow = SolvioTheme.Shadow.sm)
            .padding(SolvioTheme.Spacing.sm),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(SolvioTheme.Spacing.sm),
    ) {
        Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                Text(req.fromName, style = SolvioFonts.bodyMedium.copy(color = palette.foreground))
                Icon(Icons.AutoMirrored.Filled.ArrowForward, contentDescription = null, tint = palette.mutedForeground, modifier = Modifier.size(12.dp))
                Text(req.toName, style = SolvioFonts.bodyMedium.copy(color = palette.foreground))
            }
            req.note?.takeIf { it.isNotBlank() }?.let {
                Text(it, style = SolvioFonts.caption.copy(color = palette.mutedForeground), maxLines = 2)
            }
            req.createdAt?.let {
                Text(Fmt.date(it), style = SolvioFonts.caption.copy(color = palette.mutedForeground))
            }
        }
        Column(horizontalAlignment = Alignment.End, verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(Fmt.amount(req.amount, currency), style = SolvioFonts.amount.copy(color = palette.foreground))
            StatusPill(status = req.status, locale = locale)
        }
    }
}

@Composable
private fun StatusPill(status: String, locale: AppLocale) {
    val palette = LocalPalette.current
    val (bg, fg, label) = when (status.lowercase()) {
        "settled" -> Triple(palette.muted, palette.success, locale.t("groupSettlements.statusSettled"))
        "declined" -> Triple(palette.muted, palette.destructive, locale.t("groupSettlements.statusDeclined"))
        else -> Triple(palette.muted, palette.warning, locale.t("groupSettlements.statusPending"))
    }
    NBTag(text = label, background = bg, foreground = fg)
}

@Composable
internal fun PersonAvatar(name: String, color: String) {
    val palette = LocalPalette.current
    Box(
        modifier = Modifier
            .size(32.dp)
            .clip(CircleShape)
            .background(parseHexColor(color, palette.muted)),
        contentAlignment = Alignment.Center,
    ) {
        Text(Fmt.initials(name), style = SolvioFonts.bold(11).copy(color = Color.White))
    }
}
