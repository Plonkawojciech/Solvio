import Foundation
import SwiftUI

/// Cała arytmetyka panelu w jednym, testowalnym miejscu — bez sieci i bez
/// SwiftUI. Liczby mają się zgadzać co do grosza z `/dashboard` na webie,
/// więc wzory są przepisane stamtąd, a nie wymyślone od nowa.
struct DashboardModel {
    let expenses: [Expense]
    let categories: [Category]
    let budgets: [CategoryBudget]
    let monthlyBudget: String?
    let prevTotal: Double?
    let prevByCategory: [String: Double]?
    let currency: String

    // MARK: - Okno miesiąca

    /// Panel liczy BIEŻĄCY MIESIĄC KALENDARZOWY, nie „ostatnie 30 dni".
    /// Poprzednia wersja iOS-a sumowała wszystko i podpisywała to
    /// „30-dniowe okno kroczące" — dwa razy nieprawda naraz.
    private var monthPrefix: String {
        let f = DateFormatter()
        f.dateFormat = "yyyy-MM"
        return f.string(from: Date())
    }

    private var monthExpenses: [Expense] {
        expenses.filter { $0.date.hasPrefix(monthPrefix) }
    }

    var total: Double { monthExpenses.reduce(0) { $0 + $1.amount.double } }
    var count: Int { monthExpenses.count }

    /// Budżet miesiąca to SUMA limitów kategorii — tak liczy to web
    /// (`totalBudget` w `dashboard/page.tsx`). Pole `user_settings.monthly_budget`
    /// jest fallbackiem dla kont, które nie mają limitów per kategoria.
    var budget: Double? {
        let fromCategories = budgets.reduce(0) { $0 + $1.amount.double }
        if fromCategories > 0 { return fromCategories }
        guard let raw = monthlyBudget, let value = Double(raw), value > 0 else { return nil }
        return value
    }

    private var dayOfMonth: Int { Calendar.current.component(.day, from: Date()) }

    private var daysInMonth: Int {
        Calendar.current.range(of: .day, in: .month, for: Date())?.count ?? 30
    }

    /// Dziś liczy się jako dzień, w którym jeszcze można wydać — stąd `+1`,
    /// tak samo jak w webie. Bez tego 31 sierpnia dzienny limit byłby zerem.
    var daysLeft: Int { max(1, daysInMonth - dayOfMonth + 1) }

    /// Gdzie POWINIEN być pasek budżetu przy równym tempie wydawania.
    var idealPace: Double? {
        guard budget != nil else { return nil }
        return Double(dayOfMonth) / Double(daysInMonth)
    }

    /// Zmiana wobec poprzedniego miesiąca. `nil`, gdy nie ma z czym porównać —
    /// „+100% vs poprzedni" przy zerowej bazie to szum, nie informacja.
    var trendPercent: Double? {
        guard let prev = prevTotal, prev > 0 else { return nil }
        return (total - prev) / prev * 100
    }

    /// Ekstrapolacja bieżącego tempa na koniec miesiąca.
    var forecast: Double {
        let progress = Double(dayOfMonth) / Double(daysInMonth)
        guard progress > 0, total > 0 else { return 0 }
        return total / progress
    }

    var forecastOverBudget: Double? {
        guard let budget, forecast > budget else { return nil }
        return forecast - budget
    }

    /// Ile zostaje na dzień do końca miesiąca. Bez budżetu — średnia dzienna.
    var dailyAllowance: Double {
        guard let budget else {
            return dayOfMonth > 0 ? total / Double(dayOfMonth) : 0
        }
        return max(0, budget - total) / Double(daysLeft)
    }

    // MARK: - Kategorie

    private func category(_ id: String?) -> Category? {
        guard let id else { return nil }
        return categories.first { $0.id == id }
    }

    /// Suma per kategoria w bieżącym miesiącu, malejąco.
    private var byCategory: [(id: String?, name: String, amount: Double)] {
        var sums: [String: Double] = [:]
        var uncategorized: Double = 0
        for e in monthExpenses {
            if let id = e.categoryId {
                sums[id, default: 0] += e.amount.double
            } else {
                uncategorized += e.amount.double
            }
        }
        var rows = sums.map { (id: Optional($0.key), name: category($0.key)?.name ?? "—", amount: $0.value) }
        if uncategorized > 0 {
            rows.append((id: nil, name: "Bez kategorii", amount: uncategorized))
        }
        return rows.sorted { $0.amount > $1.amount }
    }

    /// Kolor kategorii przypisujemy wg RANGI wydatków, dokładnie jak
    /// `CAT_COLORS[i]` na webie — nie po nazwie i nie losowo, żeby ten sam
    /// wydatek miał ten sam kolor na obu platformach.
    private var colorByCategoryId: [String: Color] {
        var map: [String: Color] = [:]
        for (i, row) in byCategory.enumerated() {
            if let id = row.id { map[id] = Theme.categoryColor(i) }
        }
        return map
    }

    func color(for categoryId: String?) -> Color {
        guard let categoryId, let color = colorByCategoryId[categoryId] else { return Theme.chart6 }
        return color
    }

    struct Slice: Identifiable {
        let id: String
        let name: String
        let share: Double
        let color: Color
    }

    /// Cztery największe kategorie plus „inne" — tyle, ile mieści się
    /// czytelnie na telefonie.
    var split: [Slice] {
        guard total > 0 else { return [] }
        let rows = byCategory
        let head = rows.prefix(4)
        var result = head.enumerated().map { i, row in
            Slice(id: row.id ?? "none-\(i)", name: row.name, share: row.amount / total, color: Theme.categoryColor(i))
        }
        let rest = rows.dropFirst(4).reduce(0) { $0 + $1.amount }
        if rest > 0 {
            result.append(Slice(id: "rest", name: "Inne", share: rest / total, color: Theme.chart6))
        }
        return result
    }

    struct CategoryRow: Identifiable {
        let id: String
        let name: String
        let amount: Double
        let color: Color
        /// 0…1 wobec największej kategorii tego miesiąca.
        let ratio: Double
        /// 0…1 wobec tej samej skali, ale dla poprzedniego miesiąca.
        let prevRatio: Double
        let deltaPercent: Double?
    }

    var topCategories: [CategoryRow] {
        let rows = Array(byCategory.prefix(6))
        guard let max = rows.first?.amount, max > 0 else { return [] }
        return rows.enumerated().map { i, row in
            let prev = row.id.flatMap { prevByCategory?[$0] } ?? 0
            return CategoryRow(
                id: row.id ?? "none-\(i)",
                name: row.name,
                amount: row.amount,
                color: Theme.categoryColor(i),
                ratio: row.amount / max,
                prevRatio: min(1, prev / max),
                deltaPercent: prev > 0 ? (row.amount - prev) / prev * 100 : nil
            )
        }
    }

    // MARK: - Ostrzeżenia

    struct Alert: Identifiable {
        let id: String
        let title: String
        let detail: String
        let level: AlertRow.Level
    }

    /// Kategorie po przekroczeniu limitu (czerwone) i tuż przed nim (bursztyn).
    var alerts: [Alert] {
        var sums: [String: Double] = [:]
        for e in monthExpenses {
            if let id = e.categoryId { sums[id, default: 0] += e.amount.double }
        }
        return budgets.compactMap { budget -> Alert? in
            let limit = budget.amount.double
            guard limit > 0 else { return nil }
            let spent = sums[budget.categoryId] ?? 0
            let ratio = spent / limit
            guard ratio >= 0.85 else { return nil }
            let name = category(budget.categoryId)?.name ?? "—"
            let detail = "\(Fmt.amount(spent, currency: currency)) / \(Fmt.amount(limit, currency: currency))"
            if ratio >= 1 {
                let over = Fmt.amount(spent - limit, currency: currency)
                return Alert(id: budget.id, title: "\(name): przekroczono o \(over)", detail: detail, level: .danger)
            }
            return Alert(id: budget.id, title: "\(name): blisko limitu (\(Int((ratio * 100).rounded()))%)", detail: detail, level: .warning)
        }
        .sorted { $0.level == .danger && $1.level != .danger }
    }

    // MARK: - Ostatnie transakcje

    /// Malejąco po dacie, z `createdAt` jako rozstrzygaczem — import masowy
    /// stempluje całą paczkę jednym dniem.
    var sortedByDateDesc: [Expense] {
        expenses.sorted { lhs, rhs in
            let ld = String(lhs.date.prefix(10))
            let rd = String(rhs.date.prefix(10))
            if ld != rd { return ld > rd }
            return (lhs.createdAt ?? "") > (rhs.createdAt ?? "")
        }
    }

    struct Row: Identifiable {
        let id: String
        let expense: Expense
        let subtitle: String
        let color: Color
    }

    var recent: [Row] {
        // Sortujemy tutaj, a nie ufamy kolejności z API: `/api/data/dashboard`
        // nie ma `ORDER BY`, więc Postgres oddaje wiersze w kolejności fizycznej
        // i „ostatnie transakcje" pokazywały najstarsze.
        sortedByDateDesc.prefix(6).map { e in
            let name = category(e.categoryId)?.name ?? e.categoryName
            let parts = [Fmt.dayMonth(e.date), e.vendor, name].compactMap { $0 }.filter { !$0.isEmpty }
            return Row(id: e.id, expense: e, subtitle: parts.joined(separator: " · "), color: color(for: e.categoryId))
        }
    }
}
