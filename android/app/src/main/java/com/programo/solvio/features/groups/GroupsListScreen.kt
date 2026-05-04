package com.programo.solvio.features.groups

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.ArrowForward
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material.icons.filled.Bolt
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.ExpandLess
import androidx.compose.material.icons.filled.ExpandMore
import androidx.compose.material.icons.filled.Schedule
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
import androidx.navigation.NavHostController
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import com.programo.solvio.LocalAppLocale
import com.programo.solvio.LocalToast
import com.programo.solvio.core.AppLocale
import com.programo.solvio.core.Fmt
import com.programo.solvio.core.models.Group
import com.programo.solvio.core.models.GroupCreate
import com.programo.solvio.core.models.GroupMember
import com.programo.solvio.core.network.GroupsRepo
import com.programo.solvio.core.theme.LocalPalette
import com.programo.solvio.core.theme.SolvioFonts
import com.programo.solvio.core.theme.SolvioTheme
import com.programo.solvio.core.theme.nbCard
import com.programo.solvio.core.ui.NBCard
import com.programo.solvio.core.ui.NBDivider
import com.programo.solvio.core.ui.NBErrorCard
import com.programo.solvio.core.ui.NBEyebrow
import com.programo.solvio.core.ui.NBLoadingCard
import com.programo.solvio.core.ui.NBScreenHeader
import com.programo.solvio.core.ui.NBTag
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import kotlin.math.abs

/// Hex palette matching iOS `memberAvatarColors` and web `MEMBER_COLORS`.
internal val MEMBER_AVATAR_COLORS: List<String> = listOf(
    "#6366f1", "#ec4899", "#f59e0b", "#10b981",
    "#3b82f6", "#8b5cf6", "#ef4444", "#14b8a6",
)

/// Parses `#RRGGBB` (or `#AARRGGBB`) hex strings to a Compose `Color`.
/// Returns `fallback` on invalid input — mirrors iOS `Color(hex:)`.
internal fun parseHexColor(hex: String?, fallback: Color): Color {
    if (hex.isNullOrBlank()) return fallback
    val cleaned = hex.trim().removePrefix("#")
    return runCatching {
        Color(android.graphics.Color.parseColor("#$cleaned"))
    }.getOrDefault(fallback)
}

class GroupsListViewModel : ViewModel() {
    sealed class UiState {
        object Loading : UiState()
        data class Error(val message: String) : UiState()
        data class Loaded(val groups: List<Group>) : UiState()
    }

    private val _state = MutableStateFlow<UiState>(UiState.Loading)
    val state: StateFlow<UiState> = _state

    fun load() {
        viewModelScope.launch {
            _state.value = UiState.Loading
            try {
                _state.value = UiState.Loaded(GroupsRepo.list())
            } catch (e: Throwable) {
                _state.value = UiState.Error(e.message ?: "Failed to load groups")
            }
        }
    }
}

/// Top-level entry — owns its NavHost so taps push detail/receipts/settlements
/// without touching `MainTabScreen` (other agents own that file).
@Composable
fun GroupsListScreen() {
    val nav = rememberNavController()
    NavHost(navController = nav, startDestination = "groups/list") {
        composable("groups/list") { GroupsListBody(nav) }
        composable("groups/{id}") { back ->
            val id = back.arguments?.getString("id").orEmpty()
            GroupDetailScreen(
                groupId = id,
                onBack = { nav.popBackStack() },
                onOpenReceipts = { nav.navigate("groups/$id/receipts") },
                onOpenSettlements = { nav.navigate("groups/$id/settlements") },
            )
        }
        composable("groups/{id}/receipts") { back ->
            val id = back.arguments?.getString("id").orEmpty()
            GroupReceiptsScreen(groupId = id, onBack = { nav.popBackStack() })
        }
        composable("groups/{id}/settlements") { back ->
            val id = back.arguments?.getString("id").orEmpty()
            GroupSettlementsScreen(groupId = id, onBack = { nav.popBackStack() })
        }
    }
}

@Composable
private fun GroupsListBody(nav: NavHostController) {
    val palette = LocalPalette.current
    val locale = LocalAppLocale.current
    val toast = LocalToast.current
    val scope = rememberCoroutineScope()
    val vm: GroupsListViewModel = viewModel()
    val state by vm.state.collectAsState()

    var showCreate by remember { mutableStateOf(false) }
    var tipDismissed by remember { mutableStateOf(false) }
    var showRecent by remember { mutableStateOf(false) }

    LaunchedEffect(Unit) { vm.load() }

    val groups: List<Group> = (state as? GroupsListViewModel.UiState.Loaded)?.groups.orEmpty()
    val unsettled = groups.filter { abs(it.totalBalance ?: 0.0) > 0.01 }
    val totalUnsettled = groups.sumOf { abs(it.totalBalance ?: 0.0) }

    LazyColumn(
        modifier = Modifier.fillMaxSize().background(palette.background),
        contentPadding = PaddingValues(SolvioTheme.Spacing.md),
        verticalArrangement = Arrangement.spacedBy(SolvioTheme.Spacing.sm),
    ) {
        item {
            NBScreenHeader(
                eyebrow = locale.t("groups.eyebrow"),
                title = locale.t("groups.subtitle"),
                subtitle = "${groups.size}",
            )
        }

        item {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(SolvioTheme.Spacing.sm),
            ) {
                CTAButton(
                    icon = Icons.Filled.Bolt,
                    label = locale.t("groups.quickSplit"),
                    primary = false,
                    modifier = Modifier.weight(1f),
                ) {
                    val first = groups.firstOrNull()
                    if (first != null) nav.navigate("groups/${first.id}")
                    else toast.info(locale.t("groups.quickSplitUnavailable"))
                }
                CTAButton(
                    icon = Icons.Filled.Add,
                    label = locale.t("groups.newGroup"),
                    primary = true,
                    modifier = Modifier.weight(1f),
                ) { showCreate = true }
            }
        }

        if (!tipDismissed && unsettled.isNotEmpty()) {
            item {
                UnsettledBanner(
                    count = unsettled.size,
                    total = totalUnsettled,
                    currency = groups.firstOrNull()?.currency ?: "PLN",
                    locale = locale,
                    onDismiss = { tipDismissed = true },
                )
            }
        }

        when (val s = state) {
            GroupsListViewModel.UiState.Loading -> item { NBLoadingCard() }
            is GroupsListViewModel.UiState.Error -> item { NBErrorCard(message = s.message) { vm.load() } }
            is GroupsListViewModel.UiState.Loaded -> {
                if (s.groups.isEmpty()) {
                    item {
                        NBCard(radius = SolvioTheme.Radius.md, shadow = SolvioTheme.Shadow.sm) {
                            NBEyebrow(text = "EMPTY", color = palette.mutedForeground)
                            Text(locale.t("groups.emptyTitle"), style = SolvioFonts.cardTitle.copy(color = palette.foreground))
                            Spacer(Modifier.height(4.dp))
                            Text(locale.t("groups.emptySubtitle"), style = SolvioFonts.caption.copy(color = palette.mutedForeground))
                        }
                    }
                } else {
                    items(s.groups, key = { it.id }) { g ->
                        GroupCard(group = g, onOpen = { nav.navigate("groups/${g.id}") })
                    }
                }
            }
        }

        if (groups.isNotEmpty() && unsettled.isNotEmpty()) {
            item {
                RecentActivityDisclosure(
                    expanded = showRecent,
                    onToggle = { showRecent = !showRecent },
                    items = unsettled.take(3),
                    onOpen = { id -> nav.navigate("groups/$id") },
                    locale = locale,
                )
            }
        }

        item { Spacer(Modifier.height(SolvioTheme.Spacing.xl)) }
    }

    if (showCreate) {
        GroupCreateSheet(
            onDismiss = { showCreate = false },
            onSubmit = { payload ->
                showCreate = false
                scope.launch {
                    runCatching { GroupsRepo.create(payload) }
                        .onSuccess {
                            toast.success(locale.t("toast.created"))
                            vm.load()
                        }
                        .onFailure { toast.error(locale.t("toast.error"), description = it.message) }
                }
            },
        )
    }
}

@Composable
private fun CTAButton(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    label: String,
    primary: Boolean,
    modifier: Modifier = Modifier,
    onClick: () -> Unit,
) {
    val palette = LocalPalette.current
    Row(
        modifier = modifier
            .heightIn(min = 44.dp)
            .clip(RoundedCornerShape(SolvioTheme.Radius.md))
            .background(if (primary) palette.foreground else palette.surface)
            .border(SolvioTheme.Border.width, palette.border, RoundedCornerShape(SolvioTheme.Radius.md))
            .clickable { onClick() }
            .padding(horizontal = SolvioTheme.Spacing.md, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(6.dp, Alignment.CenterHorizontally),
    ) {
        Icon(
            icon,
            contentDescription = label,
            tint = if (primary) palette.background else palette.foreground,
            modifier = Modifier.size(16.dp),
        )
        Text(
            label,
            style = SolvioFonts.button.copy(color = if (primary) palette.background else palette.foreground),
        )
    }
}

@Composable
private fun UnsettledBanner(
    count: Int,
    total: Double,
    currency: String,
    locale: AppLocale,
    onDismiss: () -> Unit,
) {
    val palette = LocalPalette.current
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .nbCard(palette, radius = SolvioTheme.Radius.md, shadow = SolvioTheme.Shadow.sm)
            .padding(SolvioTheme.Spacing.sm),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(SolvioTheme.Spacing.sm),
    ) {
        Box(
            modifier = Modifier
                .size(32.dp)
                .clip(RoundedCornerShape(SolvioTheme.Radius.sm))
                .background(palette.accent)
                .border(SolvioTheme.Border.widthThin, palette.border, RoundedCornerShape(SolvioTheme.Radius.sm)),
            contentAlignment = Alignment.Center,
        ) {
            Icon(Icons.Filled.AutoAwesome, contentDescription = null, tint = palette.foreground, modifier = Modifier.size(16.dp))
        }
        Column(modifier = Modifier.weight(1f)) {
            Text(locale.t("groups.unsettledDebts"), style = SolvioFonts.bodyMedium.copy(color = palette.foreground))
            Text(
                "$count · ${Fmt.amount(total, currency)}",
                style = SolvioFonts.caption.copy(color = palette.mutedForeground),
            )
        }
        Box(
            modifier = Modifier
                .size(28.dp)
                .clip(RoundedCornerShape(6.dp))
                .clickable { onDismiss() },
            contentAlignment = Alignment.Center,
        ) {
            Icon(Icons.Filled.Close, contentDescription = locale.t("groups.dismissBanner"), tint = palette.mutedForeground, modifier = Modifier.size(14.dp))
        }
    }
}

@Composable
private fun GroupCard(group: Group, onOpen: () -> Unit) {
    val palette = LocalPalette.current
    val locale = LocalAppLocale.current
    val members = group.members.orEmpty()

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .nbCard(palette, radius = SolvioTheme.Radius.md, shadow = SolvioTheme.Shadow.sm)
            .clickable { onOpen() }
            .padding(SolvioTheme.Spacing.sm),
        verticalArrangement = Arrangement.spacedBy(SolvioTheme.Spacing.sm),
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.Top,
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
                Text(group.emoji ?: "👥", style = SolvioFonts.regular(22))
            }
            Column(modifier = Modifier.weight(1f)) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    Text(
                        group.name,
                        style = SolvioFonts.bodyMedium.copy(color = palette.foreground),
                        maxLines = 1,
                    )
                    val mode = group.mode
                    if (!mode.isNullOrBlank() && mode != "default" && mode != "ongoing") {
                        NBTag(text = modeLabel(mode, locale))
                    }
                }
                val count = members.size
                val suffix = if (count == 1) locale.t("groups.member") else locale.t("groups.memberCount")
                Text(
                    "$count $suffix",
                    style = SolvioFonts.caption.copy(color = palette.mutedForeground),
                )
            }
            Row(
                modifier = Modifier
                    .clip(RoundedCornerShape(SolvioTheme.Radius.sm))
                    .background(palette.surface)
                    .border(SolvioTheme.Border.widthThin, palette.border, RoundedCornerShape(SolvioTheme.Radius.sm))
                    .clickable { onOpen() }
                    .padding(horizontal = 10.dp, vertical = 6.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(4.dp),
            ) {
                Text(locale.t("groups.open").uppercase(), style = SolvioFonts.mono(11).copy(color = palette.foreground))
                Icon(Icons.Filled.ArrowForward, contentDescription = null, tint = palette.foreground, modifier = Modifier.size(10.dp))
            }
        }

        NBDivider()

        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            MemberAvatars(members = members)
            Spacer(modifier = Modifier.weight(1f))
            BalanceLabel(group = group)
        }
    }
}

@Composable
private fun MemberAvatars(members: List<GroupMember>) {
    val palette = LocalPalette.current
    val visible = members.take(5)
    val overflow = (members.size - 5).coerceAtLeast(0)
    Row(horizontalArrangement = Arrangement.spacedBy((-8).dp)) {
        visible.forEachIndexed { idx, m ->
            val color = MEMBER_AVATAR_COLORS[idx % MEMBER_AVATAR_COLORS.size]
            Box(
                modifier = Modifier
                    .size(28.dp)
                    .clip(CircleShape)
                    .background(parseHexColor(color, palette.muted))
                    .border(2.dp, palette.background, CircleShape),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    Fmt.initials(m.name ?: m.displayName),
                    style = SolvioFonts.mono(10).copy(color = Color.White),
                )
            }
        }
        if (overflow > 0) {
            Box(
                modifier = Modifier
                    .size(28.dp)
                    .clip(CircleShape)
                    .background(palette.muted)
                    .border(2.dp, palette.background, CircleShape),
                contentAlignment = Alignment.Center,
            ) {
                Text("+$overflow", style = SolvioFonts.mono(10).copy(color = palette.mutedForeground))
            }
        }
    }
}

@Composable
private fun BalanceLabel(group: Group) {
    val palette = LocalPalette.current
    val locale = LocalAppLocale.current
    val balance = group.totalBalance ?: 0.0
    if (abs(balance) <= 0.01) {
        NBTag(text = locale.t("groups.settled"), background = palette.muted, foreground = palette.mutedForeground)
    } else {
        Column(horizontalAlignment = Alignment.End) {
            Text(
                locale.t("groups.balance"),
                style = SolvioFonts.mono(9).copy(color = palette.mutedForeground),
            )
            val sign = if (balance > 0) "+" else "−"
            Text(
                "$sign${Fmt.amount(abs(balance), group.currency)}",
                style = SolvioFonts.monoBold(13).copy(
                    color = if (balance > 0) palette.success else palette.destructive,
                ),
            )
        }
    }
}

@Composable
private fun RecentActivityDisclosure(
    expanded: Boolean,
    onToggle: () -> Unit,
    items: List<Group>,
    onOpen: (String) -> Unit,
    locale: AppLocale,
) {
    val palette = LocalPalette.current
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(SolvioTheme.Radius.sm))
            .background(palette.surface.copy(alpha = 0.5f))
            .border(SolvioTheme.Border.widthThin, palette.border.copy(alpha = 0.3f), RoundedCornerShape(SolvioTheme.Radius.sm))
            .padding(SolvioTheme.Spacing.sm),
    ) {
        Row(
            modifier = Modifier.fillMaxWidth().clickable { onToggle() },
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            Icon(Icons.Filled.Schedule, contentDescription = null, tint = palette.mutedForeground, modifier = Modifier.size(14.dp))
            Text(
                locale.t("groups.recentActivity").uppercase(),
                style = SolvioFonts.mono(11).copy(color = palette.mutedForeground),
            )
            Spacer(Modifier.weight(1f))
            Icon(
                if (expanded) Icons.Filled.ExpandLess else Icons.Filled.ExpandMore,
                contentDescription = null,
                tint = palette.foreground,
                modifier = Modifier.size(16.dp),
            )
        }
        if (expanded) {
            Spacer(Modifier.height(SolvioTheme.Spacing.xs))
            if (items.size >= 2) {
                Row(horizontalArrangement = Arrangement.spacedBy(SolvioTheme.Spacing.xs)) {
                    items.forEach { g ->
                        Box(modifier = Modifier.weight(1f)) {
                            RecentActivityCard(group = g, onClick = { onOpen(g.id) })
                        }
                    }
                }
            } else {
                Column(verticalArrangement = Arrangement.spacedBy(SolvioTheme.Spacing.xs)) {
                    items.forEach { g -> RecentActivityCard(group = g, onClick = { onOpen(g.id) }) }
                }
            }
        }
    }
}

@Composable
private fun RecentActivityCard(group: Group, onClick: () -> Unit) {
    val palette = LocalPalette.current
    val balance = group.totalBalance ?: 0.0
    val sign = if (balance > 0) "+" else "−"
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .nbCard(palette, radius = SolvioTheme.Radius.sm, shadow = SolvioTheme.Shadow.sm)
            .clickable { onClick() }
            .padding(SolvioTheme.Spacing.xs),
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            Text(group.emoji ?: "👥", style = SolvioFonts.regular(18))
            Text(
                group.name,
                style = SolvioFonts.semibold(12).copy(color = palette.foreground),
                maxLines = 1,
            )
        }
        Text(
            "$sign${Fmt.amount(abs(balance), group.currency)}",
            style = SolvioFonts.monoBold(13).copy(
                color = if (balance > 0) palette.success else palette.destructive,
            ),
            maxLines = 1,
        )
    }
}

internal fun modeLabel(mode: String, locale: AppLocale): String = when (mode) {
    "trip" -> locale.t("groups.modeTrip")
    "household" -> locale.t("groups.modeHousehold")
    "ongoing" -> locale.t("groups.modeOngoing")
    else -> mode.replaceFirstChar { it.uppercase() }
}
