import SwiftUI

/// Pasek na dole: Panel | Wydatki | **FAB(skan)** | Firma. Zakładka Firma
/// istnieje tylko przy wpiętym CRM-ie; bez niego zostają dwa ekrany z FAB-em
/// pośrodku. FAB nie jest zakładką — otwiera skanowanie paragonu. Zasada
/// produktu: to jedyny przycisk skanowania w apce, żaden ekran nie dokłada
/// własnego.
enum AppTab: Hashable {
    case dashboard
    case expenses
    case company
}

/// Który zbiór pieniędzy oglądamy. Jeden stan na całą apkę: przełączenie
/// na Panelu przestawia też Wydatki, bo to ta sama decyzja („czyje to
/// pieniądze"), a nie dwa niezależne filtry na dwóch ekranach.
///
/// Pieniądze firmowe mają własną zakładkę; tu zostają moje i wspólna oś czasu.
enum MoneyScope: String, CaseIterable, Identifiable {
    case mine, all
    var id: String { rawValue }

    var labelKey: String {
        switch self {
        case .mine: return "expenses.scopeMine"
        case .all:  return "expenses.scopeAll"
        }
    }
}

/// Cele wchodzące na stos nawigacji bieżącej zakładki.
enum AppRoute: Hashable {
    case expenseDetail(id: String)
    // Firma
    case todo
    case obligations
    case obligation(AccountingObligation)
    case documents(DocumentDirection, status: DocumentStatusFilter?)
    case document(AccountingDocument)
    case jpk
    case crm(CrmRegistry)
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
    @Published var companyStack = NavigationPath()

    /// Arkusz wyboru źródła paragonu (aparat / galeria).
    @Published var showingScanSheet = false
    /// Ustawiane w arkuszu skanu, konsumowane w `MainTabView.onDismiss`.
    @Published var pendingScanMode: ScanMode?
    /// Arkusz ustawień — jedyne miejsce poza dwoma ekranami.
    @Published var showingSettings = false
    /// Ustawiane po dodaniu wydatku ręcznie z panelu.
    @Published var showingExpenseEditor = false

    /// Web Solvio otwarty w apce.
    @Published var web: WebPage?
    /// Arkusz wyboru podmiotu dla nowej faktury albo kosztu.
    @Published var newDocument: DocumentDirection?
    /// Ustawiane w arkuszu wyboru, konsumowane po jego zamknięciu.
    var pendingWeb: WebPage?

    /// Web i droga do niego: potwierdzenie paragonu czeka, aż się zamkną.
    var holdsReview: Bool { web != nil || newDocument != nil || pendingWeb != nil }

    func push(_ route: AppRoute) {
        switch selectedTab {
        case .dashboard: dashboardStack.append(route)
        case .expenses: expensesStack.append(route)
        case .company: companyStack.append(route)
        }
    }

    func popToRoot() {
        switch selectedTab {
        case .dashboard: dashboardStack = NavigationPath()
        case .expenses: expensesStack = NavigationPath()
        case .company: companyStack = NavigationPath()
        }
    }

    /// CRM odpięty: zakładki Firma nie ma, więc nie wolno na niej zostać.
    func leaveCompany() {
        companyStack = NavigationPath()
        newDocument = nil
        pendingWeb = nil
        moneyScope = .mine
        if selectedTab == .company { selectedTab = .dashboard }
    }

    /// Wylogowanie. Stosy trzymają dane poprzedniego konta, więc czyścimy
    /// wszystko, a nie tylko bieżącą zakładkę.
    func reset() {
        selectedTab = .dashboard
        moneyScope = .mine
        dashboardStack = NavigationPath()
        expensesStack = NavigationPath()
        companyStack = NavigationPath()
        showingScanSheet = false
        pendingScanMode = nil
        showingSettings = false
        showingExpenseEditor = false
        web = nil
        newDocument = nil
        pendingWeb = nil
    }
}
