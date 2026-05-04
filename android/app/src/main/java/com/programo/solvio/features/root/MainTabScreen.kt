package com.programo.solvio.features.root

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Group
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.LocalOffer
import androidx.compose.material.icons.filled.Payments
import androidx.compose.material.icons.filled.TrendingUp
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import com.programo.solvio.LocalAppLocale
import com.programo.solvio.LocalSession
import com.programo.solvio.core.theme.LocalPalette
import com.programo.solvio.core.theme.SolvioFonts
import com.programo.solvio.core.theme.SolvioTheme
import com.programo.solvio.core.theme.nbShadow
import com.programo.solvio.features.analysis.AnalysisScreen
import com.programo.solvio.features.audit.AuditScreen
import com.programo.solvio.features.categories.CategoriesManagerScreen
import com.programo.solvio.features.challenges.ChallengesScreen
import com.programo.solvio.features.dashboard.DashboardScreen
import com.programo.solvio.features.deals.OkazjeHubScreen
import com.programo.solvio.features.expenses.ExpenseDetailScreen
import com.programo.solvio.features.expenses.ExpensesListScreen
import com.programo.solvio.features.goals.GoalDetailScreen
import com.programo.solvio.features.goals.GoalsListScreen
import com.programo.solvio.features.groups.GroupsListScreen
import com.programo.solvio.features.loyalty.LoyaltyScreen
import com.programo.solvio.features.prices.PricesScreen
import com.programo.solvio.features.receipts.ReceiptDetailScreen
import com.programo.solvio.features.receipts.ReceiptsListScreen
import com.programo.solvio.features.reports.ReportsScreen
import com.programo.solvio.features.savings.SavingsHubScreen
import com.programo.solvio.features.settings.SettingsScreen
import kotlinx.coroutines.launch

/// Main authenticated layout: sticky mobile header + per-tab navigation
/// stack + 5-slot bottom bar + floating "+" FAB. Mirrors iOS
/// `MainTabView`. Secondary routes (receipts, goals, settings, etc.)
/// live on the Dashboard tab's NavHost — when the user picks one from
/// the MoreSheet drawer we switch to the dashboard tab and navigate.
@Composable
fun MainTabScreen(router: AppRouter = viewModel()) {
    val palette = LocalPalette.current
    val session = LocalSession.current
    val scope = rememberCoroutineScope()
    val selectedTab = router.selectedTab.value

    var showMoreSheet by remember { mutableStateOf(false) }
    // Pending route requested from MoreSheet — once we switch to the
    // dashboard tab we hand this off to its NavController via LaunchedEffect.
    var pendingRoute by remember { mutableStateOf<String?>(null) }

    // Dashboard tab owns ALL secondary routes so MoreSheet can navigate
    // anywhere from a single NavController without tab-specific logic.
    val dashboardNav = rememberNavController()

    LaunchedEffect(pendingRoute, selectedTab) {
        val route = pendingRoute ?: return@LaunchedEffect
        if (selectedTab == AppRouter.Tab.Dashboard) {
            dashboardNav.navigate(route)
            pendingRoute = null
        }
    }

    Box(modifier = Modifier.fillMaxSize().background(palette.background)) {
        Column(modifier = Modifier.fillMaxSize()) {
            AppMobileHeader(onMenuClick = { showMoreSheet = true })
            Box(modifier = Modifier.weight(1f).fillMaxWidth()) {
                // Per-tab NavHost — preserves back stack per tab when
                // user swaps between bottom-bar slots.
                when (selectedTab) {
                    AppRouter.Tab.Dashboard -> {
                        NavHost(navController = dashboardNav, startDestination = AppDestination.Dashboard.route) {
                            composable(AppDestination.Dashboard.route) {
                                DashboardScreen(onOpenExpense = { id -> dashboardNav.navigate(AppDestination.ExpenseDetail.build(id)) })
                            }
                            composable(AppDestination.ExpenseDetail.route) { back ->
                                ExpenseDetailScreen(
                                    expenseId = back.arguments?.getString("id").orEmpty(),
                                    onBack = { dashboardNav.popBackStack() },
                                )
                            }
                            composable(AppDestination.Receipts.route) {
                                ReceiptsListScreen(
                                    onScanReceipt = { router.showingScanSheet.value = true },
                                    onCreateVirtual = { router.showingScanSheet.value = true },
                                    onOpenReceipt = { id -> dashboardNav.navigate(AppDestination.ReceiptDetail.build(id)) },
                                )
                            }
                            composable(AppDestination.ReceiptDetail.route) { back ->
                                ReceiptDetailScreen(
                                    receiptId = back.arguments?.getString("id").orEmpty(),
                                    onBack = { dashboardNav.popBackStack() },
                                )
                            }
                            composable(AppDestination.Goals.route) {
                                GoalsListScreen(onOpenGoal = { id -> dashboardNav.navigate("goal/$id") })
                            }
                            composable("goal/{id}") { back ->
                                GoalDetailScreen(
                                    goalId = back.arguments?.getString("id").orEmpty(),
                                    onBack = { dashboardNav.popBackStack() },
                                )
                            }
                            composable(AppDestination.Challenges.route) { ChallengesScreen() }
                            composable(AppDestination.Loyalty.route) { LoyaltyScreen() }
                            composable(AppDestination.Prices.route) { PricesScreen() }
                            composable(AppDestination.Audit.route) { AuditScreen() }
                            composable(AppDestination.Analysis.route) { AnalysisScreen() }
                            composable(AppDestination.Reports.route) { ReportsScreen() }
                            composable(AppDestination.Categories.route) { CategoriesManagerScreen() }
                            composable(AppDestination.Settings.route) { SettingsScreen() }
                        }
                    }
                    AppRouter.Tab.Expenses -> {
                        val nav = rememberNavController()
                        NavHost(navController = nav, startDestination = AppDestination.Expenses.route) {
                            composable(AppDestination.Expenses.route) { ExpensesListScreen(onOpenExpense = { id -> nav.navigate(AppDestination.ExpenseDetail.build(id)) }) }
                            composable(AppDestination.ExpenseDetail.route) { back ->
                                ExpenseDetailScreen(expenseId = back.arguments?.getString("id").orEmpty(), onBack = { nav.popBackStack() })
                            }
                        }
                    }
                    AppRouter.Tab.Deals -> OkazjeHubScreen()
                    AppRouter.Tab.Groups -> GroupsListScreen()
                    AppRouter.Tab.Savings -> SavingsHubScreen()
                }

                // Floating "+" FAB — sits in the bottom-trailing corner above
                // the tab bar. Stacks above other floating widgets via the
                // VStack ordering below.
                Column(
                    modifier = Modifier.align(Alignment.BottomEnd).padding(end = 16.dp, bottom = 76.dp)
                ) {
                    FloatingScanFab { router.showingScanSheet.value = true }
                }
            }
            NBTabBar(
                selected = selectedTab,
                onSelect = { router.selectedTab.value = it },
            )
        }

        MoreSheet(
            isVisible = showMoreSheet,
            onDismiss = { showMoreSheet = false },
            onSelect = { route ->
                when {
                    route == "signout" -> scope.launch { session.signOut() }
                    selectedTab != AppRouter.Tab.Dashboard -> {
                        // Switch tabs first, the LaunchedEffect above
                        // forwards the route to dashboardNav once the
                        // dashboard tab is active.
                        router.selectedTab.value = AppRouter.Tab.Dashboard
                        pendingRoute = route
                    }
                    else -> dashboardNav.navigate(route)
                }
            },
        )
    }
}

/// Lightweight placeholder for routes whose feature screen hasn't been
/// written by the parallel agent yet. Once the corresponding file lands
/// in features/{challenges,loyalty,prices,reports,categories}, swap the
/// `composable(...)` body in MainTabScreen for the real screen call.
@Composable
private fun TodoPlaceholder(labelKey: String) {
    val palette = LocalPalette.current
    val locale = LocalAppLocale.current
    Box(
        modifier = Modifier.fillMaxSize().background(palette.background),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = locale.t(labelKey),
            style = SolvioFonts.cardTitle.copy(color = palette.mutedForeground),
        )
    }
}

@Composable
private fun NBTabBar(selected: AppRouter.Tab, onSelect: (AppRouter.Tab) -> Unit) {
    val palette = LocalPalette.current
    val locale = LocalAppLocale.current

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .height(56.dp)
            .background(palette.background)
            .border(width = SolvioTheme.Border.width, color = palette.border)
            .padding(horizontal = 2.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        TabSlot(AppRouter.Tab.Dashboard, Icons.Filled.Home, locale.t("nav.dashboard"), selected, onSelect, Modifier.weight(1f))
        TabSlot(AppRouter.Tab.Expenses, Icons.Filled.Payments, locale.t("nav.expenses"), selected, onSelect, Modifier.weight(1f))
        TabSlot(AppRouter.Tab.Deals, Icons.Filled.LocalOffer, locale.t("nav.deals"), selected, onSelect, Modifier.weight(1f))
        TabSlot(AppRouter.Tab.Groups, Icons.Filled.Group, locale.t("nav.groups"), selected, onSelect, Modifier.weight(1f))
        TabSlot(AppRouter.Tab.Savings, Icons.Filled.TrendingUp, locale.t("nav.savings"), selected, onSelect, Modifier.weight(1f))
    }
}

@Composable
private fun TabSlot(
    tab: AppRouter.Tab,
    icon: ImageVector,
    label: String,
    selected: AppRouter.Tab,
    onSelect: (AppRouter.Tab) -> Unit,
    modifier: Modifier = Modifier,
) {
    val palette = LocalPalette.current
    val active = tab == selected
    Column(
        modifier = modifier
            .fillMaxHeight()
            .clickable { onSelect(tab) },
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Icon(icon, contentDescription = label, tint = if (active) palette.foreground else palette.mutedForeground, modifier = Modifier.size(20.dp))
        Spacer(Modifier.height(2.dp))
        Text(
            text = label.uppercase(),
            style = SolvioFonts.mono(10).copy(
                color = if (active) palette.foreground else palette.mutedForeground,
                letterSpacing = androidx.compose.ui.unit.TextUnit(1f, androidx.compose.ui.unit.TextUnitType.Sp),
            ),
        )
    }
}

@Composable
fun FloatingScanFab(onClick: () -> Unit) {
    val palette = LocalPalette.current
    Box(
        modifier = Modifier
            .size(56.dp)
            .nbShadow(palette, offset = SolvioTheme.Shadow.lg)
            .clip(CircleShape)
            .background(palette.foreground)
            .border(SolvioTheme.Border.width, palette.border, CircleShape)
            .clickable { onClick() },
        contentAlignment = Alignment.Center,
    ) {
        Icon(Icons.Filled.Add, contentDescription = "Add", tint = palette.background, modifier = Modifier.size(24.dp))
    }
}
