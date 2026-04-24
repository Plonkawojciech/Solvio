import SwiftUI

/// Top-level tab destinations — mirrors PWA `mobile-bottom-nav.tsx`
/// (5 slots: Dashboard, Expenses, FAB(center), Groups, Savings).
/// The FAB is not a tab — it opens `ScanReceiptSheet`. All other
/// features live in the hamburger-drawer sheet (see `MoreView`).
enum AppTab: Hashable {
    case dashboard
    case expenses
    case groups
    case savings
}

/// Routes exposed through the hamburger drawer — features that don't
/// deserve a bottom-nav slot (everything the PWA sidebar lists).
enum MoreRoute: Hashable {
    case receipts
    case goals
    case challenges
    case loyalty
    case prices
    case audit
    case analysis
    case reports
    case categories
    case shoppingAdvisor
    case nearbyStores
    case productSearch
    case settings
}

/// Deep-link targets pushed onto the current tab's navigation stack.
enum AppRoute: Hashable {
    case expenseDetail(id: String)
    case receiptDetail(id: String)
    case groupDetail(id: String)
    case groupReceipts(id: String)
    case groupSettlements(id: String)
    case goalDetail(id: String)
    case more(MoreRoute)
}

/// The four ways to start a receipt flow from the FAB sheet. Picking one
/// dismisses the sheet and the parent view reacts by presenting the matching
/// picker / editor on the next runloop tick (sheet-in-sheet is fragile).
enum ScanMode: Hashable {
    case camera
    case library
    case virtual
    case quickSplit
}

@MainActor
final class AppRouter: ObservableObject {
    @Published var selectedTab: AppTab = .dashboard

    @Published var dashboardStack = NavigationPath()
    @Published var expensesStack = NavigationPath()
    @Published var groupsStack = NavigationPath()
    @Published var savingsStack = NavigationPath()

    /// Presented as a hamburger-triggered sheet from the mobile header.
    @Published var showingMoreSheet = false
    /// When set, on next sheet dismiss push this route onto savingsStack.
    @Published var pendingMoreRoute: MoreRoute?
    /// When true, FAB taps surface the scan sheet.
    @Published var showingScanSheet = false
    /// Set when a scan option is selected inside `ScanFabSheet`. Consumed in
    /// `MainTabView.onDismiss` to trigger the right picker/flow.
    @Published var pendingScanMode: ScanMode?

    func push(_ route: AppRoute) {
        switch selectedTab {
        case .dashboard: dashboardStack.append(route)
        case .expenses: expensesStack.append(route)
        case .groups: groupsStack.append(route)
        case .savings: savingsStack.append(route)
        }
    }

    func popToRoot() {
        switch selectedTab {
        case .dashboard: dashboardStack = NavigationPath()
        case .expenses: expensesStack = NavigationPath()
        case .groups: groupsStack = NavigationPath()
        case .savings: savingsStack = NavigationPath()
        }
    }

    /// Opens the hamburger drawer and selects the given sub-route.
    func pushFromMore(_ route: MoreRoute) {
        showingMoreSheet = false
        pendingMoreRoute = route
    }
}
