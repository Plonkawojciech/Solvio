import Foundation
import SwiftUI

/// Pamięć podręczna danych użytkownika — dziś jeden slajs: panel.
///
/// **Po co to jest:** bez tego każdy widok strzelałby do sieci przy każdym
/// pojawieniu się, a użytkownik widziałby spinner nawet przy przełączeniu
/// zakładki na dane sprzed dwóch sekund.
///
/// **Strategia: stale-while-revalidate.** Gdy widok prosi o dane:
///   1. Jest cokolwiek w cache — oddajemy natychmiast, bez spinnera.
///   2. Cache jest przestarzały (starszy niż `cacheTTL`) albo `force == true` —
///      odpalamy odświeżenie w tle, które podmieni `@Published`.
///   3. Zapis (dodanie / edycja / usunięcie) unieważnia slajs i odświeża go.
///
/// **Wyścigi.** Slajs ma licznik generacji. `ensureDashboard(force: true)`
/// anuluje zadanie w locie, podbija generację, a biegnąca implementacja
/// odrzuca swój wynik, gdy generacja zmieniła się jej pod ręką. Bez tego
/// odświeżenie odpalone PRZED optymistycznym usunięciem wracało PO nim
/// i wskrzeszało właśnie skasowany wiersz.
///
/// **Jedno źródło prawdy.** `/api/data/dashboard` zwraca kategorie, ustawienia,
/// budżety i wydatki w jednym pakiecie, więc reszta apki czyta stąd, a nie
/// z trzech osobnych endpointów.
@MainActor
final class AppDataStore: ObservableObject {

    /// 5 minut — dość długo, żeby przełączanie zakładek było natychmiastowe,
    /// dość krótko, żeby liczby nie stały nieświeże.
    private let cacheTTL: TimeInterval = 300
    /// Odświeżenie w tle odpala się przy czytaniu starszym niż to.
    private let refreshThrottle: TimeInterval = 30

    @Published private(set) var dashboard: DashboardResponse?
    @Published private(set) var dashboardLoadedAt: Date?
    @Published private(set) var dashboardLoading = false
    @Published private(set) var dashboardError: String?
    private var dashboardTask: Task<Void, Never>?
    private var dashboardGen: UInt64 = 0

    // MARK: - Widoki wyliczane

    var categories: [Category] { dashboard?.categories ?? [] }
    var settings: UserSettings? { dashboard?.settings }
    var budgets: [CategoryBudget] { dashboard?.budgets ?? [] }
    var expenses: [Expense] { dashboard?.expenses ?? [] }
    var currency: String { dashboard?.settings?.currency ?? "PLN" }

    private func isFresh(_ loadedAt: Date?, ttl: TimeInterval? = nil) -> Bool {
        guard let loadedAt else { return false }
        return Date().timeIntervalSince(loadedAt) < (ttl ?? refreshThrottle)
    }

    private func shouldRefresh(_ loadedAt: Date?) -> Bool {
        !isFresh(loadedAt)
    }

    // MARK: - Panel

    /// Pokaż, co jest, i odśwież w tle, jeśli przestarzałe.
    func ensureDashboard(force: Bool = false) {
        if !force && !shouldRefresh(dashboardLoadedAt) { return }
        if !force && dashboardTask != nil { return }
        dashboardTask?.cancel()
        dashboardGen &+= 1
        let myGen = dashboardGen
        dashboardTask = Task { [weak self] in
            await self?.refreshDashboardImpl(gen: myGen)
        }
    }

    /// Zablokuj wywołującego, dopóki panel nie zostanie pobrany choć raz.
    /// Do użycia przy starcie apki, kiedy naprawdę nie ma czego pokazać.
    func awaitDashboard(force: Bool = false) async {
        if !force, dashboard != nil, isFresh(dashboardLoadedAt, ttl: cacheTTL) { return }
        if !force, let existing = dashboardTask { await existing.value; return }
        dashboardTask?.cancel()
        dashboardGen &+= 1
        let myGen = dashboardGen
        let task: Task<Void, Never> = Task { [weak self] in
            await self?.refreshDashboardImpl(gen: myGen)
        }
        dashboardTask = task
        await task.value
    }

    private func refreshDashboardImpl(gen: UInt64) async {
        defer {
            // Zerujemy wskaźnik zadania tylko, jeśli nadal jestem bieżącą
            // generacją — nowsze zadanie mogło już mnie zastąpić.
            if gen == dashboardGen { dashboardTask = nil }
        }
        let hadCache = (dashboard != nil)
        if !hadCache, gen == dashboardGen { dashboardLoading = true }
        defer {
            if !hadCache, gen == dashboardGen { dashboardLoading = false }
        }

        let maxAttempts = 3
        for attempt in 1...maxAttempts {
            if gen != dashboardGen { return }
            do {
                let raw = try await DashboardRepo.fetch()
                guard gen == dashboardGen else { return }
                dashboard = raw
                dashboardLoadedAt = Date()
                dashboardError = nil
                return
            } catch ApiError.cancelled {
                return
            } catch {
                if let api = error as? ApiError, api.isRetryable, attempt < maxAttempts {
                    try? await Task.sleep(nanoseconds: UInt64(attempt) * 1_000_000_000)
                    continue
                }
                guard gen == dashboardGen else { return }
                // Błąd pokazujemy TYLKO, gdy nie mamy nic w cache. Jeśli
                // użytkownik już widzi dane, przelotna awaria nie ma prawa
                // podmienić mu ekranu na kartę błędu.
                if !hadCache { dashboardError = error.localizedDescription }
                return
            }
        }
    }

    func refreshAll(force: Bool = false) {
        ensureDashboard(force: force)
    }

    func invalidateDashboard() { dashboardLoadedAt = nil }

    // MARK: - Zapisy

    private var coalesceTask: Task<Void, Never>?
    private static let coalesceDelay: UInt64 = 500_000_000 // 500 ms

    /// Po dodaniu / edycji / usunięciu wydatku panel jest przestarzały.
    /// Sklejamy zmiany w okno 500 ms: kolejka skanów kończąca dziesięć
    /// paragonów nie ma prawa wystrzelić dziesięciu odświeżeń.
    func didMutateExpenses() {
        coalesceTask?.cancel()
        coalesceTask = Task { @MainActor [weak self] in
            try? await Task.sleep(nanoseconds: Self.coalesceDelay)
            guard let self, !Task.isCancelled else { return }
            self.invalidateDashboard()
            self.ensureDashboard(force: true)
        }
    }

    /// Paragony rodzą wydatki po stronie serwera, więc skan przenosi się
    /// dokładnie tą samą ścieżką co ręczny wydatek.
    func didMutateReceipts() { didMutateExpenses() }

    /// Kategorie, budżety i ustawienia siedzą w pakiecie panelu.
    func didMutateCategoriesOrBudgetsOrSettings() { didMutateExpenses() }

    // MARK: - Optymistyczne podmiany

    private func replacingExpenses(_ list: [Expense]) -> DashboardResponse? {
        guard let d = dashboard else { return nil }
        return DashboardResponse(
            categories: d.categories,
            settings: d.settings,
            budgets: d.budgets,
            expenses: list,
            prevExpenses: d.prevExpenses,
            receiptsCount: d.receiptsCount,
            monthIncome: d.monthIncome,
            savingsTarget: d.savingsTarget,
            prevTotal: d.prevTotal,
            prevByCategory: d.prevByCategory
        )
    }

    /// Wstaw świeżo utworzony wydatek lokalnie, żeby UI drgnął w chwili
    /// powrotu z API, jeszcze przed odświeżeniem panelu.
    func insertExpenseOptimistic(_ expense: Expense) {
        guard let updated = replacingExpenses([expense] + expenses) else { return }
        dashboard = updated
    }

    /// Zdejmij wydatki lokalnie, przed powrotem z serwera.
    func removeExpensesOptimistic(ids: Set<String>) {
        guard let updated = replacingExpenses(expenses.filter { !ids.contains($0.id) }) else { return }
        dashboard = updated
    }

    /// Wstaw z powrotem usunięte wydatki (cofnięcie). Odsiewa duplikaty na
    /// wypadek, gdyby panel zdążył je już dociągnąć, i trzyma sortowanie.
    func restoreExpensesOptimistic(_ restored: [Expense]) {
        guard dashboard != nil, !restored.isEmpty else { return }
        let existingIds = Set(expenses.map { $0.id })
        let newOnes = restored.filter { !existingIds.contains($0.id) }
        guard !newOnes.isEmpty else { return }
        let merged = (newOnes + expenses).sorted { lhs, rhs in
            let ld = String(lhs.date.prefix(10))
            let rd = String(rhs.date.prefix(10))
            if ld != rd { return ld > rd }
            return (lhs.createdAt ?? "") > (rhs.createdAt ?? "")
        }
        guard let updated = replacingExpenses(merged) else { return }
        dashboard = updated
    }

    /// Podmień jeden wydatek po edycji.
    func updateExpenseOptimistic(_ expense: Expense) {
        guard let updated = replacingExpenses(expenses.map { $0.id == expense.id ? expense : $0 }) else { return }
        dashboard = updated
    }

    func resetAll() {
        dashboardTask?.cancel()
        coalesceTask?.cancel()
        dashboardGen &+= 1
        dashboard = nil
        dashboardLoadedAt = nil
        dashboardLoading = false
        dashboardError = nil
    }
}
