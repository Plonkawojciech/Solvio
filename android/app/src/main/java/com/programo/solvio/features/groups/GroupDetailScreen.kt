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
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Bolt
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
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
import com.programo.solvio.core.models.ExpenseSplit
import com.programo.solvio.core.models.Group
import com.programo.solvio.core.models.GroupMember
import com.programo.solvio.core.network.GroupsRepo
import com.programo.solvio.core.theme.LocalPalette
import com.programo.solvio.core.theme.Palette
import com.programo.solvio.core.theme.SolvioFonts
import com.programo.solvio.core.theme.SolvioTheme
import com.programo.solvio.core.theme.nbCard
import com.programo.solvio.core.theme.nbShadow
import com.programo.solvio.core.ui.NBDivider
import com.programo.solvio.core.ui.NBErrorCard
import com.programo.solvio.core.ui.NBEyebrow
import com.programo.solvio.core.ui.NBLoadingCard
import com.programo.solvio.core.ui.NBSecondaryButton
import com.programo.solvio.core.ui.NBTag
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import kotlin.math.abs

class GroupDetailViewModel : ViewModel() {
    sealed class UiState {
        object Loading : UiState()
        data class Error(val message: String) : UiState()
        data class Loaded(val group: Group) : UiState()
    }

    private val _state = MutableStateFlow<UiState>(UiState.Loading)
    val state: StateFlow<UiState> = _state

    fun load(id: String) {
        viewModelScope.launch {
            _state.value = UiState.Loading
            try {
                _state.value = UiState.Loaded(GroupsRepo.detail(id))
            } catch (e: Throwable) {
                _state.value = UiState.Error(e.message ?: "Failed to load group")
            }
        }
    }
}

@Composable
fun GroupDetailScreen(
    groupId: String,
    onBack: () -> Unit,
    onOpenReceipts: () -> Unit,
    onOpenSettlements: () -> Unit,
) {
    val palette = LocalPalette.current
    val locale = LocalAppLocale.current
    val toast = LocalToast.current
    val scope = rememberCoroutineScope()
    val vm: GroupDetailViewModel = viewModel()
    val state by vm.state.collectAsState()

    var selectedTab by remember { mutableStateOf(DetailTab.Splits) }
    var showQuickSplit by remember { mutableStateOf(false) }

    LaunchedEffect(groupId) { vm.load(groupId) }

    Column(modifier = Modifier.fillMaxSize().background(palette.background)) {
        DetailTopBar(title = (state as? GroupDetailViewModel.UiState.Loaded)?.group?.name ?: "", onBack = onBack)

        when (val s = state) {
            GroupDetailViewModel.UiState.Loading -> {
                Box(modifier = Modifier.fillMaxSize().padding(SolvioTheme.Spacing.md)) { NBLoadingCard() }
            }
            is GroupDetailViewModel.UiState.Error -> {
                Box(modifier = Modifier.fillMaxSize().padding(SolvioTheme.Spacing.md)) {
                    NBErrorCard(message = s.message) { vm.load(groupId) }
                }
            }
            is GroupDetailViewModel.UiState.Loaded -> {
                val g = s.group
                LazyColumn(
                    modifier = Modifier.fillMaxSize(),
                    contentPadding = PaddingValues(SolvioTheme.Spacing.md),
                    verticalArrangement = Arrangement.spacedBy(SolvioTheme.Spacing.md),
                ) {
                    item { Hero(group = g) }
                    item { KpiStrip(group = g, locale = locale) }
                    item {
                        QuickSplitCTA(
                            title = locale.t("groupDetail.quickSplit"),
                            subtitle = locale.t("groupDetail.quickSplitSubtitle"),
                            onClick = { showQuickSplit = true },
                        )
                    }
                    item {
                        TabRow(
                            selected = selectedTab,
                            onSelect = { selectedTab = it },
                            locale = locale,
                        )
                    }
                    when (selectedTab) {
                        DetailTab.Splits -> {
                            item { MembersStrip(members = g.members.orEmpty()) }
                            val splits = g.splits.orEmpty()
                            if (splits.isEmpty()) {
                                item { EmptySplits(locale = locale, onCreate = { showQuickSplit = true }) }
                            } else {
                                items(splits, key = { it.id }) { split ->
                                    SplitCard(split = split, group = g, locale = locale)
                                }
                            }
                        }
                        DetailTab.Receipts -> item {
                            NBSecondaryButton(
                                label = locale.t("nav.receipts"),
                                onClick = onOpenReceipts,
                            )
                        }
                        DetailTab.Settlements -> item {
                            NBSecondaryButton(
                                label = locale.t("groupDetail.settlements"),
                                onClick = onOpenSettlements,
                            )
                        }
                    }
                    item { Spacer(Modifier.height(SolvioTheme.Spacing.xl)) }
                }
            }
        }
    }

    if (showQuickSplit) {
        val loaded = state as? GroupDetailViewModel.UiState.Loaded
        if (loaded != null) {
            QuickSplitSheet(
                group = loaded.group,
                onDismiss = { showQuickSplit = false },
                onSubmit = { body ->
                    showQuickSplit = false
                    scope.launch {
                        runCatching { GroupsRepo.createSplit(body) }
                            .onSuccess {
                                toast.success(locale.t("quickSplit.added"))
                                vm.load(groupId)
                            }
                            .onFailure {
                                toast.error(locale.t("quickSplit.createFailed"), description = it.message)
                            }
                    }
                },
            )
        }
    }
}

internal enum class DetailTab { Splits, Receipts, Settlements }

@Composable
internal fun DetailTopBar(title: String, onBack: () -> Unit) {
    val palette = LocalPalette.current
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .height(56.dp)
            .background(palette.background)
            .border(SolvioTheme.Border.widthThin, palette.border)
            .padding(horizontal = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            modifier = Modifier
                .size(36.dp)
                .clip(RoundedCornerShape(SolvioTheme.Radius.sm))
                .clickable { onBack() },
            contentAlignment = Alignment.Center,
        ) {
            Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back", tint = palette.foreground)
        }
        Spacer(Modifier.width(8.dp))
        Text(title, style = SolvioFonts.cardTitle.copy(color = palette.foreground), maxLines = 1)
    }
}

@Composable
private fun Hero(group: Group) {
    val palette = LocalPalette.current
    val locale = LocalAppLocale.current
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .nbCard(palette, radius = SolvioTheme.Radius.lg, shadow = SolvioTheme.Shadow.lg)
            .padding(SolvioTheme.Spacing.md),
        verticalArrangement = Arrangement.spacedBy(SolvioTheme.Spacing.sm),
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(SolvioTheme.Spacing.sm),
        ) {
            Box(
                modifier = Modifier
                    .size(56.dp)
                    .clip(RoundedCornerShape(SolvioTheme.Radius.md))
                    .background(palette.muted)
                    .border(SolvioTheme.Border.width, palette.border, RoundedCornerShape(SolvioTheme.Radius.md)),
                contentAlignment = Alignment.Center,
            ) {
                Text(group.emoji ?: "👥", style = SolvioFonts.regular(34))
            }
            Column(modifier = Modifier.weight(1f)) {
                NBEyebrow(text = (group.mode ?: "GROUP").uppercase(), color = palette.mutedForeground)
                Text(group.name, style = SolvioFonts.pageTitle.copy(color = palette.foreground))
            }
        }
        if (!group.description.isNullOrBlank()) {
            Text(group.description, style = SolvioFonts.body.copy(color = palette.mutedForeground))
        }
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(SolvioTheme.Spacing.md),
        ) {
            Text(
                "${group.members?.size ?: 0} ${locale.t("groups.memberCount")}",
                style = SolvioFonts.caption.copy(color = palette.mutedForeground),
            )
            group.createdAt?.let {
                Text(Fmt.date(it), style = SolvioFonts.caption.copy(color = palette.mutedForeground))
            }
            Spacer(modifier = Modifier.weight(1f))
            Text(group.currency.uppercase(), style = SolvioFonts.mono(11).copy(color = palette.mutedForeground))
        }
    }
}

@Composable
private fun KpiStrip(group: Group, locale: AppLocale) {
    val palette = LocalPalette.current
    val splits = group.splits.orEmpty()
    val total = splits.sumOf { it.totalAmount.toDouble() }
    val unsettled = splits.sumOf { s ->
        s.splits.sumOf { share -> if (share.settled == true) 0.0 else share.amount }
    }
    val balance = group.totalBalance ?: 0.0

    Column(
        modifier = Modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(SolvioTheme.Spacing.xs),
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(SolvioTheme.Spacing.xs),
        ) {
            StatTile(
                label = locale.t("groupDetail.totalSpent"),
                value = Fmt.amount(total, group.currency),
                modifier = Modifier.weight(1f),
            )
            StatTile(
                label = locale.t("groupDetail.yourBalance"),
                value = (if (balance >= 0) "+" else "−") + Fmt.amount(abs(balance), group.currency),
                tint = when {
                    abs(balance) <= 0.01 -> palette.foreground
                    balance > 0 -> palette.success
                    else -> palette.destructive
                },
                modifier = Modifier.weight(1f),
            )
        }
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(SolvioTheme.Spacing.xs),
        ) {
            StatTile(
                label = locale.t("groupDetail.unsettled"),
                value = Fmt.amount(unsettled, group.currency),
                tint = if (unsettled > 0) palette.destructive else palette.foreground,
                modifier = Modifier.weight(1f),
            )
            StatTile(
                label = locale.t("groupDetail.splitsCount"),
                value = "${splits.size}",
                modifier = Modifier.weight(1f),
            )
        }
    }
}

@Composable
internal fun StatTile(
    label: String,
    value: String,
    tint: Color? = null,
    sub: String? = null,
    modifier: Modifier = Modifier,
) {
    val palette = LocalPalette.current
    Column(
        modifier = modifier
            .nbCard(palette, radius = SolvioTheme.Radius.md, shadow = SolvioTheme.Shadow.sm)
            .padding(SolvioTheme.Spacing.sm),
        verticalArrangement = Arrangement.spacedBy(2.dp),
    ) {
        Text(
            label.uppercase(),
            style = SolvioFonts.mono(10).copy(color = palette.mutedForeground),
            maxLines = 1,
        )
        Text(
            value,
            style = SolvioFonts.amount.copy(color = tint ?: palette.foreground),
            maxLines = 1,
        )
        sub?.let {
            Text(it, style = SolvioFonts.caption.copy(color = palette.mutedForeground), maxLines = 1)
        }
    }
}

@Composable
internal fun QuickSplitCTA(
    title: String,
    subtitle: String,
    onClick: () -> Unit,
) {
    val palette = LocalPalette.current
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .nbShadow(palette, offset = SolvioTheme.Shadow.md)
            .clip(RoundedCornerShape(SolvioTheme.Radius.lg))
            .background(palette.foreground)
            .border(SolvioTheme.Border.width, palette.border, RoundedCornerShape(SolvioTheme.Radius.lg))
            .clickable { onClick() }
            .padding(SolvioTheme.Spacing.md),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(SolvioTheme.Spacing.sm),
    ) {
        Icon(Icons.Filled.Bolt, contentDescription = null, tint = palette.background, modifier = Modifier.size(20.dp))
        Column(modifier = Modifier.weight(1f)) {
            Text(title, style = SolvioFonts.cardTitle.copy(color = palette.background))
            Text(subtitle, style = SolvioFonts.caption.copy(color = palette.background.copy(alpha = 0.75f)))
        }
        Icon(Icons.Filled.ChevronRight, contentDescription = null, tint = palette.background, modifier = Modifier.size(16.dp))
    }
}

@Composable
private fun TabRow(
    selected: DetailTab,
    onSelect: (DetailTab) -> Unit,
    locale: AppLocale,
) {
    val palette = LocalPalette.current
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(SolvioTheme.Radius.md))
            .background(palette.muted)
            .border(SolvioTheme.Border.widthThin, palette.border, RoundedCornerShape(SolvioTheme.Radius.md))
            .padding(2.dp),
        horizontalArrangement = Arrangement.spacedBy(2.dp),
    ) {
        TabSlot(label = locale.t("groupDetail.tabSplits"), active = selected == DetailTab.Splits, modifier = Modifier.weight(1f)) { onSelect(DetailTab.Splits) }
        TabSlot(label = locale.t("groupDetail.tabReceipts"), active = selected == DetailTab.Receipts, modifier = Modifier.weight(1f)) { onSelect(DetailTab.Receipts) }
        TabSlot(label = locale.t("groupDetail.tabSettlements"), active = selected == DetailTab.Settlements, modifier = Modifier.weight(1f)) { onSelect(DetailTab.Settlements) }
    }
}

@Composable
private fun TabSlot(label: String, active: Boolean, modifier: Modifier, onClick: () -> Unit) {
    val palette = LocalPalette.current
    Box(
        modifier = modifier
            .clip(RoundedCornerShape(SolvioTheme.Radius.sm))
            .background(if (active) palette.foreground else palette.muted)
            .clickable { onClick() }
            .padding(vertical = 10.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            label,
            style = SolvioFonts.button.copy(color = if (active) palette.background else palette.foreground),
        )
    }
}

@Composable
private fun MembersStrip(members: List<GroupMember>) {
    val palette = LocalPalette.current
    val locale = LocalAppLocale.current
    if (members.isEmpty()) return
    Column(verticalArrangement = Arrangement.spacedBy(SolvioTheme.Spacing.xs)) {
        NBEyebrow(text = locale.t("groupDetail.members").uppercase(), color = palette.mutedForeground)
        Row(
            modifier = Modifier.horizontalScroll(rememberScrollState()),
            horizontalArrangement = Arrangement.spacedBy(SolvioTheme.Spacing.sm),
        ) {
            members.forEach { m -> MemberChip(member = m, palette = palette) }
        }
    }
}

@Composable
private fun MemberChip(member: GroupMember, palette: Palette) {
    val bg = parseHexColor(member.color, palette.muted)
    Column(
        modifier = Modifier.width(80.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        Box(
            modifier = Modifier
                .size(46.dp)
                .nbShadow(palette, offset = SolvioTheme.Shadow.sm)
                .clip(CircleShape)
                .background(bg)
                .border(SolvioTheme.Border.width, palette.border, CircleShape),
            contentAlignment = Alignment.Center,
        ) {
            Text(
                Fmt.initials(member.name ?: member.displayName),
                style = SolvioFonts.bold(14).copy(color = Color.White),
            )
        }
        Text(
            member.name ?: member.displayName,
            style = SolvioFonts.caption.copy(color = palette.foreground),
            maxLines = 1,
        )
    }
}

@Composable
private fun EmptySplits(locale: AppLocale, onCreate: () -> Unit) {
    val palette = LocalPalette.current
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .nbCard(palette, radius = SolvioTheme.Radius.md, shadow = SolvioTheme.Shadow.sm)
            .padding(SolvioTheme.Spacing.md),
        verticalArrangement = Arrangement.spacedBy(SolvioTheme.Spacing.xs),
    ) {
        NBEyebrow(text = "EMPTY", color = palette.mutedForeground)
        Text(locale.t("groupDetail.noSplits"), style = SolvioFonts.cardTitle.copy(color = palette.foreground))
        Text(locale.t("groupDetail.noSplitsSub"), style = SolvioFonts.caption.copy(color = palette.mutedForeground))
        Spacer(Modifier.height(4.dp))
        NBSecondaryButton(label = locale.t("groupDetail.quickSplit"), onClick = onCreate)
    }
}

@Composable
private fun SplitCard(split: ExpenseSplit, group: Group, locale: AppLocale) {
    val palette = LocalPalette.current
    val payer = group.members.orEmpty().firstOrNull { it.id == split.paidByMemberId }
    val payerName = payer?.let { it.name ?: it.displayName } ?: "—"
    val currency = split.currency ?: group.currency

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .nbCard(palette, radius = SolvioTheme.Radius.md, shadow = SolvioTheme.Shadow.sm)
            .padding(SolvioTheme.Spacing.md),
        verticalArrangement = Arrangement.spacedBy(SolvioTheme.Spacing.xs),
    ) {
        Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.Top) {
            Text(
                split.description?.takeIf { it.isNotBlank() } ?: locale.t("groupDetail.splitFallback"),
                style = SolvioFonts.cardTitle.copy(color = palette.foreground),
                modifier = Modifier.weight(1f),
            )
            Text(
                Fmt.amount(split.totalAmount.toDouble(), currency),
                style = SolvioFonts.amount.copy(color = palette.foreground),
            )
        }
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            Text(
                locale.t("groupDetail.paidByPrefix").replace("%@", payerName),
                style = SolvioFonts.caption.copy(color = palette.mutedForeground),
            )
            split.createdAt?.let {
                Text("·", style = SolvioFonts.caption.copy(color = palette.mutedForeground))
                Text(Fmt.date(it), style = SolvioFonts.caption.copy(color = palette.mutedForeground))
            }
        }
        if (split.splits.isNotEmpty()) {
            NBDivider()
            split.splits.forEach { share ->
                val name = group.members.orEmpty().firstOrNull { it.id == share.memberId }?.let { it.name ?: it.displayName } ?: "—"
                Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                    Text(name, style = SolvioFonts.body.copy(color = palette.foreground), modifier = Modifier.weight(1f))
                    if (share.settled == true) {
                        NBTag(
                            text = locale.t("groupDetail.settledTag"),
                            background = palette.muted,
                            foreground = palette.success,
                        )
                        Spacer(Modifier.width(8.dp))
                    }
                    Text(
                        Fmt.amount(share.amount, currency),
                        style = SolvioFonts.mono(12).copy(color = palette.mutedForeground),
                    )
                }
            }
        }
    }
}
