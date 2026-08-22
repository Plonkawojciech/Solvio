import SwiftUI

/// Szczegóły wydatku. Zasada produktu: jedno tapnięcie z listy i widać
/// WSZYSTKO, łącznie z pozycjami paragonu — bez schodzenia głębiej.
struct ExpenseDetailView: View {
    let expenseId: String

    @EnvironmentObject private var store: AppDataStore
    @EnvironmentObject private var locale: AppLocale
    @EnvironmentObject private var toast: ToastCenter
    @Environment(\.dismiss) private var dismiss

    @State private var receipt: Receipt?
    @State private var loadingReceipt = false
    @State private var showEditor = false
    @State private var confirmDelete = false
    @State private var pushing = false

    private var expense: Expense? { store.expenses.first { $0.id == expenseId } }

    private var category: Category? {
        guard let id = expense?.categoryId else { return nil }
        return store.categories.first { $0.id == id }
    }

    var body: some View {
        ZStack {
            PaperBackground()
            if let expense {
                content(expense)
            } else {
                EmptyStateView(icon: "questionmark.folder", title: locale.t("errors.notFound"))
            }
        }
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button(locale.t("common.edit")) { showEditor = true }
                    .font(AppFont.captionMedium)
                    .foregroundColor(Theme.primary)
            }
        }
        .sheet(isPresented: $showEditor) {
            ExpenseEditorSheet(expense: expense)
        }
        .confirmationDialog(
            locale.t("expenses.deleteConfirm"),
            isPresented: $confirmDelete,
            titleVisibility: .visible
        ) {
            Button(locale.t("common.delete"), role: .destructive) { delete() }
            Button(locale.t("common.cancel"), role: .cancel) {}
        }
        .task(id: expense?.receiptId) { await loadReceipt() }
    }

    private func content(_ expense: Expense) -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Theme.Spacing.md) {
                headerCard(expense)
                detailsCard(expense)
                receiptCard
                actions(expense)
            }
            .padding(Theme.Spacing.md)
            .padding(.bottom, Theme.Spacing.xl)
        }
    }

    private func headerCard(_ expense: Expense) -> some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.sm) {
            SectionLabel(text: Fmt.date(expense.date))
            Text(Fmt.amount(expense.amount, currency: expense.currency ?? store.currency))
                .font(AppFont.hero)
                .foregroundColor(Theme.foreground)
                .lineLimit(1)
                .minimumScaleFactor(0.5)
            Text(expense.title)
                .font(AppFont.sectionTitle)
                .foregroundColor(Theme.foreground)

            HStack(spacing: Theme.Spacing.sm) {
                if let category {
                    CategoryChip(name: category.name, color: colorFor(category.id))
                }
                if let vendor = expense.vendor, !vendor.isEmpty {
                    Text(vendor)
                        .font(AppFont.caption)
                        .foregroundColor(Theme.mutedForeground)
                }
            }
        }
        .padding(Theme.Spacing.md)
        .frame(maxWidth: .infinity, alignment: .leading)
        .paperCard()
    }

    /// Wiersze „etykieta — wartość". Pusty wydatek nie ma prawa zostawiać
    /// ekranu z jednym przyciskiem na środku pustki.
    private func detailsCard(_ expense: Expense) -> some View {
        PaperCard(label: locale.t("expenses.details")) {
            VStack(spacing: 0) {
                detailRow(locale.t("expenses.date"), Fmt.date(expense.date))
                Divider().overlay(Theme.border)
                detailRow(locale.t("expenses.category"), category?.name ?? locale.t("expenses.autoCategory"))
                Divider().overlay(Theme.border)
                detailRow(locale.t("expenses.vendor"), expense.vendor?.isEmpty == false ? expense.vendor! : "—")
                Divider().overlay(Theme.border)
                detailRow(locale.t("expenses.notes"), expense.notes?.isEmpty == false ? expense.notes! : "—")
                if expense.crmEntryId != nil {
                    Divider().overlay(Theme.border)
                    detailRow("CRM", locale.t("crm.pushed"))
                }
            }
        }
    }

    private func detailRow(_ label: String, _ value: String) -> some View {
        HStack(alignment: .top, spacing: Theme.Spacing.sm) {
            Text(label)
                .font(AppFont.captionMedium)
                .foregroundColor(Theme.mutedForeground)
                .frame(width: 92, alignment: .leading)
            Text(value)
                .font(AppFont.body)
                .foregroundColor(Theme.foreground)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(.vertical, 10)
    }

    private func colorFor(_ categoryId: String) -> Color {
        let model = DashboardModel(
            expenses: store.expenses, categories: store.categories, budgets: store.budgets,
            monthlyBudget: store.settings?.monthlyBudget, prevTotal: nil, prevByCategory: nil,
            currency: store.currency
        )
        return model.color(for: categoryId)
    }

    @ViewBuilder
    private var receiptCard: some View {
        if loadingReceipt {
            PaperCard(label: locale.t("receipts.items")) { SkeletonBlock(height: 80) }
        } else if let receipt, let items = receipt.items, !items.isEmpty {
            PaperCard(title: receipt.vendor ?? locale.t("receipts.title"), label: locale.t("receipts.items")) {
                VStack(spacing: 0) {
                    ForEach(Array(items.enumerated()), id: \.offset) { index, item in
                        HStack(spacing: Theme.Spacing.sm) {
                            Text(item.nameTranslated ?? item.name)
                                .font(AppFont.caption)
                                .foregroundColor(Theme.foreground)
                                .lineLimit(2)
                            Spacer(minLength: Theme.Spacing.sm)
                            if let qty = item.quantity, qty > 1 {
                                Text("×\(Fmt.qty(qty))")
                                    .font(AppFont.mono(10))
                                    .foregroundColor(Theme.mutedForeground)
                            }
                            Text(Fmt.amount(item.totalPrice ?? item.price, currency: receipt.currency ?? store.currency))
                                .font(AppFont.mono(12))
                                .foregroundColor(Theme.foreground)
                        }
                        .padding(.vertical, 7)
                        if index < items.count - 1 {
                            Divider().overlay(Theme.border)
                        }
                    }
                }
            }
        }
    }

    private func actions(_ expense: Expense) -> some View {
        VStack(spacing: Theme.Spacing.sm) {
            Button {
                push(expense)
            } label: {
                HStack(spacing: 6) {
                    if pushing {
                        ProgressView().controlSize(.small)
                    } else {
                        Image(systemName: "arrow.up.forward.square")
                    }
                    Text(locale.t("crm.pushExpense"))
                }
            }
            .buttonStyle(SecondaryButtonStyle())
            .disabled(pushing)

            // Usuwanie jako zwykły tekst, nie czerwona płachta: to akcja
            // rzadka, a nie główna na tym ekranie.
            Button(locale.t("expenses.delete")) { confirmDelete = true }
                .font(AppFont.captionMedium)
                .foregroundColor(Theme.destructive)
                .padding(.top, Theme.Spacing.xs)
        }
    }

    // MARK: - Dane

    private func loadReceipt() async {
        guard let receiptId = expense?.receiptId else {
            receipt = nil
            return
        }
        loadingReceipt = true
        defer { loadingReceipt = false }
        receipt = try? await ReceiptsRepo.detail(id: receiptId)
    }

    private func delete() {
        guard let expense else { return }
        store.removeExpensesOptimistic(ids: [expense.id])
        dismiss()
        Task {
            do {
                try await ExpensesRepo.delete(ids: [expense.id])
                store.didMutateExpenses()
            } catch {
                store.restoreExpensesOptimistic([expense])
                toast.error(locale.t("common.error"))
            }
        }
    }

    /// Ręczne wypchnięcie do Finansów CRM-a. Wydatek już wypchnięty serwer
    /// zaktualizuje zamiast zdublować — powiązanie trzyma `crm_entry_id`.
    private func push(_ expense: Expense) {
        pushing = true
        Task {
            defer { pushing = false }
            do {
                let result = try await CrmRepo.push(ids: [expense.id])
                if result.pushed > 0 {
                    toast.success(locale.t("crm.pushed"))
                } else {
                    toast.error(locale.t("crm.notConnected"))
                }
            } catch {
                toast.error(locale.t("crm.pushFailed"))
            }
        }
    }
}
