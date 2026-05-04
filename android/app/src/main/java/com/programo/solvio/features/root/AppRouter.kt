package com.programo.solvio.features.root

import androidx.compose.runtime.Stable
import androidx.compose.runtime.mutableStateOf
import androidx.lifecycle.ViewModel

/// Mirror of iOS `AppRouter`. Holds the selected tab + per-tab
/// navigation back-stacks (each as a list of route ids). MainTabScreen
/// reads `selectedTab` and uses its own NavHost per tab to manage the
/// stack natively via Compose Navigation.
class AppRouter : ViewModel() {
    enum class Tab { Dashboard, Expenses, Deals, Groups, Savings }

    val selectedTab = mutableStateOf(Tab.Dashboard)
    val showingScanSheet = mutableStateOf(false)
    val showingMoreSheet = mutableStateOf(false)
}

@Stable
sealed class AppDestination(val route: String) {
    object Dashboard : AppDestination("dashboard")
    object Expenses : AppDestination("expenses")
    object Deals : AppDestination("deals")
    object Groups : AppDestination("groups")
    object Savings : AppDestination("savings")
    // Sub-routes
    object ExpenseDetail : AppDestination("expense/{id}") {
        fun build(id: String) = "expense/$id"
    }
    object Receipts : AppDestination("receipts")
    object ReceiptDetail : AppDestination("receipt/{id}") {
        fun build(id: String) = "receipt/$id"
    }
    object Goals : AppDestination("goals")
    object Challenges : AppDestination("challenges")
    object Loyalty : AppDestination("loyalty")
    object Prices : AppDestination("prices")
    object Audit : AppDestination("audit")
    object Analysis : AppDestination("analysis")
    object Reports : AppDestination("reports")
    object Categories : AppDestination("categories")
    object Settings : AppDestination("settings")
    object Login : AppDestination("login")
}
