import SwiftUI

/// Zakładka „Wszystkie" — jeden ciąg chronologiczny: moje wydatki z Solvio
/// i wpisy Finansów CRM-a obok siebie.
///
/// To NIE jest suma dwóch budżetów. Moje wydatki są prywatne, firmowe idą
/// przez CRM — mieszanie ich w jedną kwotę dałoby liczbę, która nic nie
/// znaczy. Dlatego wspólna jest oś czasu, a podsumowania zostają rozdzielone.
struct AllMoneyList: View {
    @EnvironmentObject private var store: AppDataStore
    @EnvironmentObject private var router: AppRouter
    @EnvironmentObject private var locale: AppLocale
    @EnvironmentObject private var crm: CrmStore

    @Binding var editingCrmEntry: CrmEntry?

    /// Wiersz feedu. Rozróżnienie źródła niesie znaczenie — bez niego nie da
    /// się powiedzieć, czyje to pieniądze ani gdzie tapnięcie ma prowadzić.
    private enum Row: Identifiable {
        case mine(Expense)
        case company(CrmEntry)

        var id: String {
            switch self {
            case .mine(let e):    return "mine:\(e.id)"
            case .company(let e): return "crm:\(e.id)"
            }
        }

        var day: String {
            switch self {
            case .mine(let e):    return String(e.date.prefix(10))
            case .company(let e): return String(e.date.prefix(10))
            }
        }
    }

    private var rows: [Row] {
        let mine = store.expenses.map(Row.mine)
        let company = crm.entries.map(Row.company)
        return (mine + company).sorted { $0.day > $1.day }
    }

    var body: some View {
        Group {
            if rows.isEmpty {
                EmptyStateView(
                    icon: "tray",
                    title: locale.t("expenses.empty"),
                    subtitle: locale.t("expenses.emptyHint")
                )
                .padding(.top, Theme.Spacing.xl)
                Spacer()
            } else {
                list
            }
        }
        .task { crm.ensureLoaded() }
    }

    private var list: some View {
        ScrollView {
            totals
            LazyVStack(spacing: 0) {
                ForEach(rows) { row in
                    Button {
                        Haptics.selection()
                        open(row)
                    } label: {
                        content(row)
                    }
                    if row.id != rows.last?.id {
                        Divider().overlay(Theme.border).padding(.leading, 56)
                    }
                }
            }
            .background(Theme.card)
            .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.lg, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: Theme.Radius.lg, style: .continuous)
                    .stroke(Theme.border, lineWidth: 1)
            )
            .padding(.horizontal, Theme.Spacing.md)
            .padding(.bottom, 96)
        }
        .refreshable {
            await store.awaitDashboard(force: true)
            await crm.reload()
        }
    }

    private var totals: some View {
        let mineTotal = store.expenses.reduce(0.0) { $0 + $1.amount.double }
        return HStack(spacing: Theme.Spacing.sm) {
            tile(locale.t("expenses.scopeMine"), mineTotal, Theme.foreground)
            tile(locale.t("crm.income"), crm.monthIncome, Theme.success)
            tile(locale.t("crm.costs"), crm.monthExpense, Theme.destructive)
        }
        .padding(.horizontal, Theme.Spacing.md)
        .padding(.bottom, Theme.Spacing.sm)
    }

    private func tile(_ label: String, _ value: Double, _ color: Color) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            SectionLabel(text: label)
            Text(Fmt.amount(value, currency: "PLN"))
                .font(AppFont.semibold(14))
                .foregroundColor(color)
                .lineLimit(1)
                .minimumScaleFactor(0.6)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(Theme.Spacing.sm + 2)
        .paperCard(radius: Theme.Radius.md, shadow: 0)
    }

    // MARK: - Wiersz

    @ViewBuilder
    private func content(_ row: Row) -> some View {
        switch row {
        case .mine(let expense):
            line(
                date: expense.date,
                title: expense.title,
                subtitle: [expense.vendor, categoryName(expense)].compactMap { $0 }
                    .filter { !$0.isEmpty }.joined(separator: " · "),
                amount: Fmt.amount(expense.amount, currency: expense.currency ?? store.currency),
                amountColor: Theme.foreground,
                badge: locale.t("expenses.scopeMine")
            )
        case .company(let entry):
            line(
                date: entry.date,
                title: entry.title,
                subtitle: [entry.category.isEmpty ? nil : entry.category, entry.client?.name]
                    .compactMap { $0 }.joined(separator: " · "),
                amount: (entry.isIncome ? "+" : "−") + Fmt.amount(entry.amount, currency: "PLN"),
                amountColor: entry.isIncome ? Theme.success : Theme.foreground,
                badge: locale.t("crm.company")
            )
        }
    }

    private func line(
        date: String, title: String, subtitle: String,
        amount: String, amountColor: Color, badge: String
    ) -> some View {
        HStack(spacing: Theme.Spacing.sm) {
            Text(Fmt.dayMonth(date))
                .font(AppFont.mono(11))
                .foregroundColor(Theme.mutedForeground)
                .frame(width: 44, alignment: .leading)
            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(AppFont.bodyMedium)
                    .foregroundColor(Theme.foreground)
                    .lineLimit(1)
                HStack(spacing: 6) {
                    Text(badge)
                        .font(AppFont.chip)
                        .foregroundColor(Theme.mutedForeground)
                        .padding(.horizontal, 6)
                        .padding(.vertical, 1)
                        .background(Theme.muted)
                        .clipShape(Capsule())
                    if !subtitle.isEmpty {
                        Text(subtitle)
                            .font(AppFont.caption)
                            .foregroundColor(Theme.mutedForeground)
                            .lineLimit(1)
                    }
                }
            }
            Spacer(minLength: Theme.Spacing.sm)
            Text(amount)
                .font(AppFont.amount)
                .foregroundColor(amountColor)
        }
        .padding(.horizontal, Theme.Spacing.md)
        .padding(.vertical, 11)
        .contentShape(Rectangle())
    }

    private func categoryName(_ expense: Expense) -> String? {
        store.categories.first { $0.id == expense.categoryId }?.name ?? expense.categoryName
    }

    private func open(_ row: Row) {
        switch row {
        case .mine(let expense):  router.push(.expenseDetail(id: expense.id))
        case .company(let entry): editingCrmEntry = entry
        }
    }
}
