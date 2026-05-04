package com.programo.solvio.core

import androidx.compose.runtime.compositionLocalOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue

/** Mirror of iOS [AppRouter] — top-level tabs, per-tab nav stacks, and sheet flags. */
enum class AppTab { Dashboard, Expenses, Deals, Groups, Savings }

enum class MoreRoute {
    Receipts, Goals, Challenges, Loyalty, Prices, Audit,
    Analysis, Reports, Categories, ShoppingAdvisor, NearbyStores,
    ProductSearch, Settings,
}

sealed interface AppRoute {
    data class ExpenseDetail(val id: String) : AppRoute
    data class ReceiptDetail(val id: String) : AppRoute
    data class GroupDetail(val id: String) : AppRoute
    data class GroupReceipts(val id: String) : AppRoute
    data class GroupSettlements(val id: String) : AppRoute
    data class GoalDetail(val id: String) : AppRoute
    data class More(val route: MoreRoute) : AppRoute
}

enum class ScanMode { Camera, Library, Virtual, QuickSplit }

class AppRouter {
    var selectedTab by mutableStateOf(AppTab.Dashboard)

    val dashboardStack = mutableStateListOf<AppRoute>()
    val expensesStack = mutableStateListOf<AppRoute>()
    val dealsStack = mutableStateListOf<AppRoute>()
    val groupsStack = mutableStateListOf<AppRoute>()
    val savingsStack = mutableStateListOf<AppRoute>()

    var showingMoreSheet by mutableStateOf(false)
    var pendingMoreRoute by mutableStateOf<MoreRoute?>(null)
    var showingScanSheet by mutableStateOf(false)
    var pendingScanMode by mutableStateOf<ScanMode?>(null)

    fun stackFor(tab: AppTab) = when (tab) {
        AppTab.Dashboard -> dashboardStack
        AppTab.Expenses -> expensesStack
        AppTab.Deals -> dealsStack
        AppTab.Groups -> groupsStack
        AppTab.Savings -> savingsStack
    }

    val currentStack get() = stackFor(selectedTab)

    fun push(route: AppRoute) {
        currentStack.add(route)
    }

    fun pop() {
        val s = currentStack
        if (s.isNotEmpty()) s.removeAt(s.size - 1)
    }

    fun popToRoot() {
        currentStack.clear()
    }

    fun pushFromMore(route: MoreRoute) {
        showingMoreSheet = false
        pendingMoreRoute = route
    }

    fun tabForMoreRoute(route: MoreRoute): AppTab = when (route) {
        MoreRoute.Prices, MoreRoute.Audit, MoreRoute.ShoppingAdvisor,
        MoreRoute.NearbyStores, MoreRoute.ProductSearch -> AppTab.Deals
        else -> AppTab.Savings
    }
}

val LocalAppRouter = compositionLocalOf<AppRouter> { error("AppRouter not provided") }
