import SwiftUI

/// Solvio ma dwa ekrany. Pasek na dole: Panel | **FAB(skan)** | Wydatki.
/// FAB nie jest zakładką — otwiera skanowanie paragonu. Zasada produktu:
/// to jedyny przycisk skanowania w apce, żaden ekran nie dokłada własnego.
enum AppTab: Hashable {
    case dashboard
    case expenses
}

/// Który zbiór pieniędzy oglądamy. Jeden stan na całą apkę: przełączenie
/// na Panelu przestawia też Wydatki, bo to ta sama decyzja („czyje to
/// pieniądze"), a nie dwa niezależne filtry na dwóch ekranach.
enum MoneyScope: String, CaseIterable, Identifiable {
    case mine, company, all
    var id: String { rawValue }

    var labelKey: String {
        switch self {
        case .mine:    return "expenses.scopeMine"
        case .company: return "expenses.scopeCompany"
        case .all:     return "expenses.scopeAll"
        }
    }
}

/// Cele wchodzące na stos nawigacji bieżącej zakładki.
enum AppRoute: Hashable {
    case expenseDetail(id: String)
}

/// Dwa sposoby na rozpoczęcie skanu z FAB-a. Wybór zamyka arkusz, a widok
/// nadrzędny podnosi właściwy picker w następnym obrocie pętli — arkusz
/// w arkuszu potrafi się w SwiftUI zaciąć.
enum ScanMode: Hashable {
    case camera
    case library
}

@MainActor
final class AppRouter: ObservableObject {
    @Published var selectedTab: AppTab = .dashboard

    /// Wspólny dla Panelu i Wydatków. Bez wpiętego CRM-a przełącznik się nie
    /// pokazuje i wartość zostaje na `.mine`.
    @Published var moneyScope: MoneyScope = .mine

    @Published var dashboardStack = NavigationPath()
    @Published var expensesStack = NavigationPath()

    /// Arkusz wyboru źródła paragonu (aparat / galeria).
    @Published var showingScanSheet = false
    /// Ustawiane w arkuszu skanu, konsumowane w `MainTabView.onDismiss`.
    @Published var pendingScanMode: ScanMode?
    /// Arkusz ustawień — jedyne miejsce poza dwoma ekranami.
    @Published var showingSettings = false
    /// Ustawiane po dodaniu wydatku ręcznie z panelu.
    @Published var showingExpenseEditor = false

    func push(_ route: AppRoute) {
        switch selectedTab {
        case .dashboard: dashboardStack.append(route)
        case .expenses: expensesStack.append(route)
        }
    }

    func popToRoot() {
        switch selectedTab {
        case .dashboard: dashboardStack = NavigationPath()
        case .expenses: expensesStack = NavigationPath()
        }
    }
}
