package com.programo.solvio.features.groups

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ExpandLess
import androidx.compose.material.icons.filled.ExpandMore
import androidx.compose.material.icons.filled.Receipt
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import com.programo.solvio.LocalAppLocale
import com.programo.solvio.core.AppLocale
import com.programo.solvio.core.Fmt
import com.programo.solvio.core.models.GroupReceiptEntry
import com.programo.solvio.core.models.GroupReceiptMember
import com.programo.solvio.core.models.GroupReceiptsResponse
import com.programo.solvio.core.network.GroupsRepo
import com.programo.solvio.core.theme.LocalPalette
import com.programo.solvio.core.theme.SolvioFonts
import com.programo.solvio.core.theme.SolvioTheme
import com.programo.solvio.core.theme.nbCard
import com.programo.solvio.core.ui.NBDivider
import com.programo.solvio.core.ui.NBErrorCard
import com.programo.solvio.core.ui.NBEyebrow
import com.programo.solvio.core.ui.NBLoadingCard
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch

class GroupReceiptsViewModel : ViewModel() {
    sealed class UiState {
        object Loading : UiState()
        data class Error(val message: String) : UiState()
        data class Loaded(val data: GroupReceiptsResponse) : UiState()
    }

    private val _state = MutableStateFlow<UiState>(UiState.Loading)
    val state: StateFlow<UiState> = _state

    fun load(groupId: String) {
        viewModelScope.launch {
            _state.value = UiState.Loading
            try {
                _state.value = UiState.Loaded(GroupsRepo.receipts(groupId))
            } catch (e: Throwable) {
                _state.value = UiState.Error(e.message ?: "Failed to load receipts")
            }
        }
    }
}

@Composable
fun GroupReceiptsScreen(groupId: String, onBack: () -> Unit) {
    val palette = LocalPalette.current
    val locale = LocalAppLocale.current
    val vm: GroupReceiptsViewModel = viewModel()
    val state by vm.state.collectAsState()

    val expanded = remember { androidx.compose.runtime.mutableStateMapOf<String, Boolean>() }

    LaunchedEffect(groupId) { vm.load(groupId) }

    Column(modifier = Modifier.fillMaxSize().background(palette.background)) {
        DetailTopBar(title = locale.t("nav.receipts"), onBack = onBack)
        when (val s = state) {
            GroupReceiptsViewModel.UiState.Loading -> Box(modifier = Modifier.padding(SolvioTheme.Spacing.md)) { NBLoadingCard() }
            is GroupReceiptsViewModel.UiState.Error -> Box(modifier = Modifier.padding(SolvioTheme.Spacing.md)) {
                NBErrorCard(message = s.message) { vm.load(groupId) }
            }
            is GroupReceiptsViewModel.UiState.Loaded -> {
                val data = s.data
                LazyColumn(
                    modifier = Modifier.fillMaxSize(),
                    contentPadding = PaddingValues(SolvioTheme.Spacing.md),
                    verticalArrangement = Arrangement.spacedBy(SolvioTheme.Spacing.md),
                ) {
                    item { Header(data = data, locale = locale) }
                    if (data.receipts.isEmpty()) {
                        item { EmptyReceiptsCard(locale = locale) }
                    } else {
                        items(data.receipts, key = { it.id }) { entry ->
                            ReceiptCard(
                                entry = entry,
                                members = data.members,
                                isExpanded = expanded[entry.id] == true,
                                onToggle = { expanded[entry.id] = !(expanded[entry.id] == true) },
                                locale = locale,
                            )
                        }
                    }
                    item { Spacer(Modifier.height(SolvioTheme.Spacing.xl)) }
                }
            }
        }
    }
}

@Composable
private fun Header(data: GroupReceiptsResponse, locale: AppLocale) {
    val palette = LocalPalette.current
    val currency = data.receipts.firstOrNull()?.currency ?: "PLN"
    val total = data.receipts.sumOf { it.total?.toDouble() ?: 0.0 }
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .nbCard(palette, radius = SolvioTheme.Radius.lg, shadow = SolvioTheme.Shadow.md)
            .padding(SolvioTheme.Spacing.md),
        verticalArrangement = Arrangement.spacedBy(SolvioTheme.Spacing.xs),
    ) {
        NBEyebrow(text = locale.t("groupReceipts.eyebrow").removePrefix("// "), color = palette.mutedForeground)
        Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                Text(
                    "${data.receipts.size} ${locale.t("groupReceipts.count")}",
                    style = SolvioFonts.sectionTitle.copy(color = palette.foreground),
                )
                Text(
                    "${data.members.size} ${locale.t("groups.memberCount")}",
                    style = SolvioFonts.caption.copy(color = palette.mutedForeground),
                )
            }
            Text(Fmt.amount(total, currency), style = SolvioFonts.amountLarge.copy(color = palette.foreground))
        }
    }
}

@Composable
private fun EmptyReceiptsCard(locale: AppLocale) {
    val palette = LocalPalette.current
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .nbCard(palette, radius = SolvioTheme.Radius.md, shadow = SolvioTheme.Shadow.sm)
            .padding(SolvioTheme.Spacing.md),
        verticalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        NBEyebrow(text = "EMPTY", color = palette.mutedForeground)
        Text(locale.t("groupReceipts.emptyTitle"), style = SolvioFonts.cardTitle.copy(color = palette.foreground))
        Text(locale.t("groupReceipts.emptySub"), style = SolvioFonts.caption.copy(color = palette.mutedForeground))
    }
}

@Composable
private fun ReceiptCard(
    entry: GroupReceiptEntry,
    members: List<GroupReceiptMember>,
    isExpanded: Boolean,
    onToggle: () -> Unit,
    locale: AppLocale,
) {
    val palette = LocalPalette.current
    val currency = entry.currency ?: "PLN"
    val memberById = members.associateBy { it.id }
    val assignments = entry.assignments.orEmpty()

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .nbCard(palette, radius = SolvioTheme.Radius.md, shadow = SolvioTheme.Shadow.sm)
            .padding(SolvioTheme.Spacing.md),
        verticalArrangement = Arrangement.spacedBy(SolvioTheme.Spacing.xs),
    ) {
        Row(
            modifier = Modifier.fillMaxWidth().clickable { onToggle() },
            verticalAlignment = Alignment.Top,
            horizontalArrangement = Arrangement.spacedBy(SolvioTheme.Spacing.sm),
        ) {
            Box(
                modifier = Modifier
                    .size(36.dp)
                    .clip(RoundedCornerShape(SolvioTheme.Radius.sm))
                    .background(palette.muted)
                    .border(SolvioTheme.Border.widthThin, palette.border, RoundedCornerShape(SolvioTheme.Radius.sm)),
                contentAlignment = Alignment.Center,
            ) {
                Icon(Icons.Filled.Receipt, contentDescription = null, tint = palette.foreground, modifier = Modifier.size(18.dp))
            }
            Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text(
                    entry.vendor ?: locale.t("groupReceipts.receiptFallback"),
                    style = SolvioFonts.cardTitle.copy(color = palette.foreground),
                    maxLines = 1,
                )
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    entry.date?.let {
                        Text(Fmt.date(it), style = SolvioFonts.caption.copy(color = palette.mutedForeground))
                    }
                    entry.paidByMember?.name?.let {
                        Text(
                            locale.t("groupReceipts.paidByPrefix").replace("%@", it),
                            style = SolvioFonts.caption.copy(color = palette.mutedForeground),
                            maxLines = 1,
                        )
                    }
                }
                val assignedCount = entry.assignedItemCount
                val totalCount = entry.totalItemCount
                if (assignedCount != null && totalCount != null && totalCount > 0) {
                    Text(
                        locale.t("groupReceipts.itemsAssigned")
                            .replaceFirst("%d", assignedCount.toString())
                            .replaceFirst("%d", totalCount.toString()),
                        style = SolvioFonts.mono(10).copy(color = palette.mutedForeground),
                    )
                }
            }
            Column(horizontalAlignment = Alignment.End, verticalArrangement = Arrangement.spacedBy(4.dp)) {
                entry.total?.let {
                    Text(Fmt.amount(it.toDouble(), currency), style = SolvioFonts.amount.copy(color = palette.foreground))
                }
                Icon(
                    if (isExpanded) Icons.Filled.ExpandLess else Icons.Filled.ExpandMore,
                    contentDescription = null,
                    tint = palette.mutedForeground,
                    modifier = Modifier.size(16.dp),
                )
            }
        }

        if (isExpanded) {
            NBDivider()
            ItemsList(entry = entry, memberById = memberById, currency = currency, locale = locale)
            MemberChips(entry = entry, memberById = memberById)
        }
    }
}

@Composable
private fun ItemsList(
    entry: GroupReceiptEntry,
    memberById: Map<String, GroupReceiptMember>,
    currency: String,
    locale: AppLocale,
) {
    val palette = LocalPalette.current
    val items = entry.receiptItems.orEmpty()
    val assignments = entry.assignments.orEmpty()

    if (items.isEmpty()) {
        Text(locale.t("groupReceipts.noItems"), style = SolvioFonts.caption.copy(color = palette.mutedForeground))
        return
    }
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        items.forEach { item ->
            val itemAssignments = assignments.filter { it.receiptItemId == item.id }
            val assignedNames = itemAssignments.mapNotNull { memberById[it.memberId]?.name }.joinToString(", ")
            val price = (item.price ?: item.totalPrice)?.toDouble() ?: 0.0
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.Top,
                horizontalArrangement = Arrangement.spacedBy(SolvioTheme.Spacing.xs),
            ) {
                Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        Text(item.name, style = SolvioFonts.body.copy(color = palette.foreground), maxLines = 1)
                        item.quantity?.takeIf { it != 1.0 && it > 0 }?.let { q ->
                            Text("× ${formatQty(q)}", style = SolvioFonts.mono(11).copy(color = palette.mutedForeground))
                        }
                    }
                    if (assignedNames.isNotEmpty()) {
                        Text(assignedNames, style = SolvioFonts.caption.copy(color = palette.mutedForeground), maxLines = 2)
                    } else {
                        Text(
                            locale.t("groupReceipts.unassigned"),
                            style = SolvioFonts.mono(10).copy(color = palette.destructive),
                        )
                    }
                }
                Text(Fmt.amount(price, currency), style = SolvioFonts.mono(13).copy(color = palette.foreground))
            }
        }
    }
}

@Composable
private fun MemberChips(entry: GroupReceiptEntry, memberById: Map<String, GroupReceiptMember>) {
    val palette = LocalPalette.current
    val involvedIds = entry.assignments.orEmpty().map { it.memberId }.toSet()
    if (involvedIds.isEmpty()) return
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .horizontalScroll(rememberScrollState()),
        horizontalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        involvedIds.forEach { id ->
            val m = memberById[id] ?: return@forEach
            Row(
                modifier = Modifier
                    .clip(RoundedCornerShape(SolvioTheme.Radius.sm))
                    .background(palette.muted)
                    .border(SolvioTheme.Border.widthThin, palette.border, RoundedCornerShape(SolvioTheme.Radius.sm))
                    .padding(horizontal = 8.dp, vertical = 4.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(4.dp),
            ) {
                Box(
                    modifier = Modifier
                        .size(10.dp)
                        .clip(CircleShape)
                        .background(parseHexColor(m.color, palette.muted)),
                )
                Text(m.name, style = SolvioFonts.mono(10).copy(color = palette.foreground))
            }
        }
    }
}

private fun formatQty(q: Double): String =
    if (q % 1.0 == 0.0) q.toInt().toString() else String.format("%g", q)
