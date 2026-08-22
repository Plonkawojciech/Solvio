import SwiftUI

/// Wydatki — lista, wyszukiwarka, filtr kategorii i sortowanie. Układ
/// przepisany z `/expenses` na webie: data po lewej, kropka kategorii,
/// tytuł ze sprzedawcą pod spodem, kwota po prawej.
///
/// Zasada produktu: jedno tapnięcie prowadzi do pełnych szczegółów.
struct ExpensesListView: View {
    @EnvironmentObject private var store: AppDataStore
    @EnvironmentObject private var router: AppRouter
    @EnvironmentObject private var locale: AppLocale
    @EnvironmentObject private var toast: ToastCenter
    @EnvironmentObject private var crm: CrmStore

    @State private var query = ""
    @State private var categoryFilter: String? = nil
    @State private var sort: Sort = .newest
    @State private var pendingDelete: Expense?
    /// Sekcja wewnątrz zakładki Firma. Trzymana tutaj, nie w `CrmCompanyView`,
    /// bo od niej zależy, co robi „+" w nagłówku ekranu.
    @State private var companySection: CrmSection = .all
    @State private var editingCrmEntry: CrmEntry?
    @State private var editingCommitment: CrmCommitment?
    @State private var editingClient: CrmClient?
    @State private var creatingCrm = false

    /// Który zbiór pieniędzy oglądamy — stan wspólny z Panelem, patrz
    /// `MoneyScope`. Świadomie zakładka wewnątrz ekranu, a nie trzeci ekran:
    /// apka ma dwa.
    private var scope: MoneyScope { router.moneyScope }

    enum Sort: String, CaseIterable, Identifiable {
        case newest, oldest, highest, lowest
        var id: String { rawValue }
        var labelKey: String { "expenses.sort.\(rawValue)" }
    }

    private var model: DashboardModel {
        DashboardModel(
            expenses: store.expenses,
            categories: store.categories,
            budgets: store.budgets,
            monthlyBudget: store.settings?.monthlyBudget,
            prevTotal: store.dashboard?.prevTotal,
            prevByCategory: store.dashboard?.prevByCategory,
            currency: store.currency
        )
    }

    private var filtered: [Expense] {
        var rows = store.expenses
        if let categoryFilter { rows = rows.filter { $0.categoryId == categoryFilter } }
        let q = query.trimmingCharacters(in: .whitespaces).lowercased()
        if !q.isEmpty {
            rows = rows.filter {
                $0.title.lowercased().contains(q) || ($0.vendor?.lowercased().contains(q) ?? false)
            }
        }
        switch sort {
        case .newest:  return rows.sorted { $0.date > $1.date }
        case .oldest:  return rows.sorted { $0.date < $1.date }
        case .highest: return rows.sorted { $0.amount.double > $1.amount.double }
        case .lowest:  return rows.sorted { $0.amount.double < $1.amount.double }
        }
    }

    var body: some View {
        VStack(spacing: 0) {
            headerBar
            scopePicker

            switch scope {
            case .mine:
                mineContent
            case .company:
                CrmCompanyView(
                    section: $companySection,
                    editingEntry: $editingCrmEntry,
                    editingCommitment: $editingCommitment,
                    editingClient: $editingClient,
                    creating: $creatingCrm
                )
            case .all:
                AllMoneyList(editingCrmEntry: $editingCrmEntry)
            }
        }
        .sheet(item: $editingCrmEntry) { CrmEntryEditorSheet(entry: $0) }
        .sheet(item: $editingCommitment) { CrmCommitmentEditorSheet(commitment: $0) }
        .sheet(item: $editingClient) { CrmClientEditorSheet(client: $0) }
        .sheet(isPresented: $creatingCrm) { newCrmSheet }
        .refreshable { await store.awaitDashboard(force: true) }
        .task { store.ensureDashboard() }
        .confirmationDialog(
            locale.t("expenses.deleteConfirm"),
            isPresented: Binding(get: { pendingDelete != nil }, set: { if !$0 { pendingDelete = nil } }),
            titleVisibility: .visible
        ) {
            Button(locale.t("common.delete"), role: .destructive) {
                if let expense = pendingDelete { delete(expense) }
                pendingDelete = nil
            }
            Button(locale.t("common.cancel"), role: .cancel) { pendingDelete = nil }
        }
    }

    /// Co otwiera „+" w zakładce Firma — zależy od oglądanej sekcji.
    @ViewBuilder
    private var newCrmSheet: some View {
        switch companySection {
        case .commitments: CrmCommitmentEditorSheet(commitment: nil)
        case .clients:     CrmClientEditorSheet(client: nil)
        default:           CrmEntryEditorSheet(entry: nil)
        }
    }

    /// Przełącznik pojawia się TYLKO, gdy CRM jest wpięty — bez niego byłby
    /// pustą zakładką prowadzącą do zachęty na integrację.
    @ViewBuilder
    private var scopePicker: some View {
        if crm.connected == true {
            Picker("", selection: $router.moneyScope) {
                ForEach(MoneyScope.allCases) { s in
                    Text(locale.t(s.labelKey)).tag(s)
                }
            }
            .pickerStyle(.segmented)
            .padding(.horizontal, Theme.Spacing.md)
            .padding(.top, Theme.Spacing.sm)
        }
    }

    @ViewBuilder
    private var mineContent: some View {
        VStack(spacing: 0) {
            filters

            if store.dashboardLoading && store.dashboard == nil {
                VStack(spacing: Theme.Spacing.sm) {
                    ForEach(0..<6, id: \.self) { _ in SkeletonBlock(height: 56) }
                }
                .padding(Theme.Spacing.md)
                Spacer()
            } else if filtered.isEmpty {
                EmptyStateView(
                    icon: "tray",
                    title: locale.t("expenses.empty"),
                    subtitle: locale.t("expenses.emptyHint"),
                    actionTitle: locale.t("expenses.add"),
                    action: { router.showingExpenseEditor = true }
                )
                .padding(.top, Theme.Spacing.xl)
                Spacer()
            } else {
                list
            }
        }
    }

    // MARK: - Nagłówek

    private var headerBar: some View {
        HStack(alignment: .firstTextBaseline) {
            VStack(alignment: .leading, spacing: 2) {
                Text(locale.t("nav.expenses"))
                    .font(AppFont.pageTitle)
                    .foregroundColor(Theme.foreground)
                SectionLabel(text: countLabel)
            }
            Spacer()
            Button {
                Haptics.impact(.light)
                if scope == .mine { router.showingExpenseEditor = true } else { creatingCrm = true }
            } label: {
                Image(systemName: "plus")
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundColor(.white)
                    .frame(width: 36, height: 36)
                    .background(Theme.primary)
                    .clipShape(Circle())
            }
            .accessibilityLabel(locale.t("expenses.add"))
        }
        .padding(.horizontal, Theme.Spacing.md)
        .padding(.top, Theme.Spacing.md)
    }

    /// Podpis pod tytułem: liczba rzeczy, które faktycznie widać.
    private var countLabel: String {
        switch scope {
        case .mine:
            return locale.pluralized("dashboard.transactions", count: filtered.count)
        case .all:
            return locale.pluralized("dashboard.transactions", count: store.expenses.count + crm.entries.count)
        case .company:
            switch companySection {
            case .commitments: return locale.pluralized("crm.commitmentsCount", count: crm.commitments.count)
            case .clients:     return locale.pluralized("crm.clientsCount", count: crm.clients.count)
            default:           return locale.pluralized("crm.entriesCount", count: crm.entries.count)
            }
        }
    }

    // MARK: - Filtry

    private var filters: some View {
        VStack(spacing: Theme.Spacing.sm) {
            HStack(spacing: Theme.Spacing.sm) {
                Image(systemName: "magnifyingglass")
                    .font(.system(size: 13))
                    .foregroundColor(Theme.mutedForeground)
                TextField(locale.t("expenses.search"), text: $query)
                    .font(AppFont.body)
                    .autocorrectionDisabled()
                if !query.isEmpty {
                    Button {
                        query = ""
                    } label: {
                        Image(systemName: "xmark.circle.fill")
                            .font(.system(size: 14))
                            .foregroundColor(Theme.mutedForeground)
                    }
                }
            }
            .padding(.horizontal, Theme.Spacing.sm + 2)
            .frame(height: 40)
            .paperCard(radius: Theme.Radius.md, shadow: 0)

            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 6) {
                    ForEach(Sort.allCases) { option in
                        chip(locale.t(option.labelKey), active: sort == option) { sort = option }
                    }
                    Divider().frame(height: 18).overlay(Theme.border)
                    chip(locale.t("expenses.allCategories"), active: categoryFilter == nil) { categoryFilter = nil }
                    ForEach(store.categories) { category in
                        chip(category.name, active: categoryFilter == category.id) {
                            categoryFilter = categoryFilter == category.id ? nil : category.id
                        }
                    }
                }
                .padding(.horizontal, Theme.Spacing.md)
            }
            .padding(.horizontal, -Theme.Spacing.md)
        }
        .padding(.horizontal, Theme.Spacing.md)
        .padding(.vertical, Theme.Spacing.sm)
    }

    private func chip(_ label: String, active: Bool, action: @escaping () -> Void) -> some View {
        Button {
            Haptics.selection()
            action()
        } label: {
            Text(label)
                .font(AppFont.captionMedium)
                .foregroundColor(active ? Theme.primaryForeground : Theme.mutedForeground)
                .padding(.horizontal, 11)
                .padding(.vertical, 6)
                .background(active ? Theme.primary : Theme.card)
                .clipShape(Capsule())
                .overlay(Capsule().stroke(active ? Color.clear : Theme.border, lineWidth: 1))
        }
    }

    // MARK: - Lista

    private var list: some View {
        let m = model
        return ScrollView {
            LazyVStack(spacing: 0) {
                ForEach(filtered) { expense in
                    Button {
                        Haptics.selection()
                        router.push(.expenseDetail(id: expense.id))
                    } label: {
                        row(expense, model: m)
                    }
                    .swipeActionsCompat {
                        pendingDelete = expense
                    }
                    Divider().overlay(Theme.border).padding(.leading, 56)
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
    }

    private func row(_ expense: Expense, model m: DashboardModel) -> some View {
        HStack(spacing: Theme.Spacing.sm) {
            Text(Fmt.dayMonth(expense.date))
                .font(AppFont.mono(11))
                .foregroundColor(Theme.mutedForeground)
                .frame(width: 44, alignment: .leading)
            CategoryDot(color: m.color(for: expense.categoryId))
            VStack(alignment: .leading, spacing: 2) {
                Text(expense.title)
                    .font(AppFont.bodyMedium)
                    .foregroundColor(Theme.foreground)
                    .lineLimit(1)
                Text(subtitle(expense))
                    .font(AppFont.caption)
                    .foregroundColor(Theme.mutedForeground)
                    .lineLimit(1)
            }
            Spacer(minLength: Theme.Spacing.sm)
            Text(Fmt.amount(expense.amount, currency: expense.currency ?? store.currency))
                .font(AppFont.amount)
                .foregroundColor(Theme.foreground)
        }
        .padding(.horizontal, Theme.Spacing.md)
        .padding(.vertical, 11)
        .contentShape(Rectangle())
    }

    private func subtitle(_ expense: Expense) -> String {
        let name = store.categories.first { $0.id == expense.categoryId }?.name ?? expense.categoryName
        return [expense.vendor, name].compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " · ")
    }

    // MARK: - Usuwanie

    /// Usuwamy optymistycznie i dajemy „Cofnij" — czekanie na serwer przy
    /// każdym skasowanym wierszu robi z listy ekran ładowania.
    private func delete(_ expense: Expense) {
        store.removeExpensesOptimistic(ids: [expense.id])
        Task {
            do {
                try await ExpensesRepo.delete(ids: [expense.id])
                store.didMutateExpenses()
                toast.undoable(locale.t("expenses.deleted"), undoLabel: locale.t("common.undo")) {
                    restore(expense)
                }
            } catch {
                store.restoreExpensesOptimistic([expense])
                toast.error(locale.t("common.error"))
            }
        }
    }

    private func restore(_ expense: Expense) {
        Task {
            do {
                let recreated = try await ExpensesRepo.create(ExpenseCreate(
                    title: expense.title,
                    amount: expense.amount.description,
                    date: String(expense.date.prefix(10)),
                    categoryId: expense.categoryId,
                    vendor: expense.vendor,
                    notes: expense.notes,
                    tags: expense.tags,
                    currency: expense.currency,
                    receiptId: expense.receiptId
                ))
                store.insertExpenseOptimistic(recreated)
                store.didMutateExpenses()
            } catch {
                toast.error(locale.t("common.error"))
            }
        }
    }
}

private extension View {
    /// Swipe-to-delete działa na `List`, a my mamy `LazyVStack` — długie
    /// przytrzymanie jest tu uczciwszym gestem niż udawanie listy.
    func swipeActionsCompat(_ onDelete: @escaping () -> Void) -> some View {
        contextMenu {
            Button(role: .destructive, action: onDelete) {
                Label("Usuń", systemImage: "trash")
            }
        }
    }
}
