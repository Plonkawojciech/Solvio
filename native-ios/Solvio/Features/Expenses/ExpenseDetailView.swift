import SwiftUI

/// Detail + edit + delete screen for a single expense. Fetches the full
/// list (no dedicated `/api/data/expenses/:id` endpoint exists) and
/// selects the matching row. Updates via `ExpensesRepo.update`, deletes
/// via `ExpensesRepo.delete(ids:)`.
struct ExpenseDetailView: View {
    let expenseId: String

    @EnvironmentObject private var router: AppRouter
    @EnvironmentObject private var toast: ToastCenter
    @EnvironmentObject private var locale: AppLocale
    @StateObject private var vm = ExpenseDetailViewModel()

    @State private var showEdit = false
    @State private var showDelete = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Theme.Spacing.md) {
                if vm.isLoading && vm.expense == nil {
                    NBLoadingCard()
                } else if let message = vm.errorMessage {
                    NBErrorCard(message: locale.t(message)) { Task { await vm.load(id: expenseId) } }
                } else if let e = vm.expense {
                    hero(e)
                    metaCard(e)
                    if let notes = e.notes, !notes.isEmpty { notesCard(notes) }
                    if let tags = e.tags, !tags.isEmpty { tagsCard(tags) }
                    if e.receiptId != nil { itemsCard(e) }
                    actionsCard
                }
                Spacer(minLength: Theme.Spacing.xl)
            }
            .padding(.horizontal, Theme.Spacing.md)
            .padding(.top, Theme.Spacing.md)
        }
        .background(Theme.background)
        .navigationTitle(locale.t("expenseDetail.eyebrow").capitalized)
        .navigationBarTitleDisplayMode(.inline)
        .task { await vm.load(id: expenseId) }
        .refreshable { await vm.load(id: expenseId) }
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button {
                    showEdit = true
                } label: {
                    Image(systemName: "pencil").foregroundColor(Theme.foreground)
                }
                .disabled(vm.expense == nil)
            }
        }
        .sheet(isPresented: $showEdit) {
            if let e = vm.expense {
                ExpenseEditSheet(expense: e, categories: vm.categories) { payload in
                    Task {
                        do {
                            try await ExpensesRepo.update(payload)
                            toast.success(locale.t("toast.updated"))
                            await vm.load(id: expenseId)
                        } catch {
                            toast.error(locale.t("toast.error"), description: error.localizedDescription)
                        }
                    }
                }
                .environmentObject(locale)
            }
        }
        .alert(locale.t("expenseDetail.deleteConfirm"), isPresented: $showDelete) {
            Button(locale.t("common.cancel"), role: .cancel) {}
            Button(locale.t("common.delete"), role: .destructive) {
                Task {
                    do {
                        try await ExpensesRepo.delete(ids: [expenseId])
                        toast.success(locale.t("expenseDetail.deleted"))
                        router.popToRoot()
                    } catch {
                        toast.error(locale.t("toast.error"), description: error.localizedDescription)
                    }
                }
            }
        } message: {
            Text(locale.t("expenses.deleteConfirmMsg"))
        }
    }

    // MARK: - Sections

    private func hero(_ e: Expense) -> some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.xs) {
            NBEyebrow(text: locale.t("expenseDetail.amount").uppercased())
            Text(Fmt.amount(e.amount, currency: e.currency ?? vm.defaultCurrency))
                .font(AppFont.black(34))
                .foregroundColor(Theme.foreground)
            Text(e.title)
                .font(AppFont.cardTitle)
                .foregroundColor(Theme.foreground)
            HStack(spacing: Theme.Spacing.xs) {
                if let name = categoryName(for: e) {
                    NBTag(text: name)
                }
                Text(Fmt.date(e.date))
                    .font(AppFont.caption)
                    .foregroundColor(Theme.mutedForeground)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(Theme.Spacing.md)
        .nbCard(radius: Theme.Radius.lg, shadow: Theme.Shadow.lg)
    }

    private func metaCard(_ e: Expense) -> some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.xs) {
            row(locale.t("expenseDetail.date"), value: Fmt.date(e.date))
            if let name = categoryName(for: e) { row(locale.t("expenseDetail.category"), value: name) }
            if let vendor = e.vendor, !vendor.isEmpty { row(locale.t("expenseDetail.vendor"), value: vendor) }
            if let currency = e.currency, !currency.isEmpty { row(locale.t("settings.currency"), value: currency) }
        }
        .padding(Theme.Spacing.md)
        .nbCard(radius: Theme.Radius.md, shadow: Theme.Shadow.sm)
    }

    private func row(_ label: String, value: String) -> some View {
        HStack {
            Text(label)
                .font(AppFont.caption)
                .foregroundColor(Theme.mutedForeground)
            Spacer()
            Text(value)
                .font(AppFont.bodyMedium)
                .foregroundColor(Theme.foreground)
        }
    }

    private func notesCard(_ notes: String) -> some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.xs) {
            NBEyebrow(text: locale.t("common.notes").uppercased())
            Text(notes)
                .font(AppFont.body)
                .foregroundColor(Theme.foreground)
                .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(Theme.Spacing.md)
        .nbCard(radius: Theme.Radius.md, shadow: Theme.Shadow.sm)
    }

    private func tagsCard(_ tags: [String]) -> some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.xs) {
            NBEyebrow(text: locale.t("expenses.tags").uppercased())
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 6) {
                    ForEach(tags, id: \.self) { NBTag(text: $0) }
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(Theme.Spacing.md)
        .nbCard(radius: Theme.Radius.md, shadow: Theme.Shadow.sm)
    }

    @ViewBuilder
    private func itemsCard(_ e: Expense) -> some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.sm) {
            HStack(spacing: Theme.Spacing.xs) {
                NBEyebrow(text: locale.t("expenseDetail.items").uppercased())
                Spacer()
                if !vm.receiptItems.isEmpty {
                    Text("\(vm.receiptItems.count)")
                        .font(AppFont.mono(11))
                        .tracking(0.5)
                        .foregroundColor(Theme.mutedForeground)
                }
            }

            if vm.isLoadingReceipt && vm.receiptItems.isEmpty {
                HStack {
                    ProgressView().scaleEffect(0.8)
                    Text(locale.t("common.loading"))
                        .font(AppFont.caption)
                        .foregroundColor(Theme.mutedForeground)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            } else if vm.receiptItems.isEmpty {
                Text(locale.t("expenseDetail.noItems"))
                    .font(AppFont.caption)
                    .foregroundColor(Theme.mutedForeground)
                    .frame(maxWidth: .infinity, alignment: .leading)
            } else {
                VStack(spacing: 0) {
                    ForEach(Array(vm.receiptItems.enumerated()), id: \.offset) { idx, item in
                        itemRow(item, currency: e.currency ?? vm.defaultCurrency)
                        if idx < vm.receiptItems.count - 1 {
                            Divider().background(Theme.foreground.opacity(0.1))
                        }
                    }
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(Theme.Spacing.md)
        .nbCard(radius: Theme.Radius.md, shadow: Theme.Shadow.sm)
    }

    private func itemRow(_ item: ReceiptItem, currency: String) -> some View {
        HStack(alignment: .top, spacing: Theme.Spacing.xs) {
            if let qty = item.quantity, qty > 0 {
                let qtyText = qty.truncatingRemainder(dividingBy: 1) == 0
                    ? String(Int(qty))
                    : String(format: "%g", qty)
                Text("\(qtyText)×")
                    .font(AppFont.mono(12))
                    .foregroundColor(Theme.mutedForeground)
                    .frame(minWidth: 30, alignment: .leading)
            }
            Text(item.nameTranslated ?? item.name)
                .font(AppFont.body)
                .foregroundColor(Theme.foreground)
                .lineLimit(2)
                .frame(maxWidth: .infinity, alignment: .leading)
            if let price = item.displayPrice?.double {
                Text(Fmt.amount(price, currency: currency))
                    .font(AppFont.mono(13))
                    .foregroundColor(Theme.foreground)
            }
        }
        .padding(.vertical, 8)
    }

    private var actionsCard: some View {
        VStack(spacing: Theme.Spacing.xs) {
            Button { showEdit = true } label: {
                Label(locale.t("common.edit"), systemImage: "pencil")
            }
            .buttonStyle(NBSecondaryButtonStyle())
            .disabled(vm.expense == nil)

            Button { showDelete = true } label: {
                Label(locale.t("common.delete"), systemImage: "trash")
            }
            .buttonStyle(NBDestructiveButtonStyle())
            .disabled(vm.expense == nil)
        }
    }

    // MARK: - Helpers

    private func categoryName(for e: Expense) -> String? {
        if let n = e.categoryName, !n.isEmpty { return n }
        if let id = e.categoryId, let c = vm.categoryById[id] { return c.name }
        return nil
    }
}

// MARK: - View model

@MainActor
final class ExpenseDetailViewModel: ObservableObject {
    @Published var expense: Expense?
    @Published var categories: [Category] = []
    @Published var defaultCurrency: String = "PLN"
    @Published var isLoading = false
    @Published var isLoadingReceipt = false
    @Published var errorMessage: String?
    @Published var receiptItems: [ReceiptItem] = []

    var categoryById: [String: Category] {
        Dictionary(uniqueKeysWithValues: categories.map { ($0.id, $0) })
    }

    func load(id: String) async {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }
        do {
            let list = try await ExpensesRepo.list()
            categories = list.categories ?? categories
            if let c = list.settings?.currency { defaultCurrency = c }
            expense = list.expenses.first(where: { $0.id == id })
            if expense == nil {
                errorMessage = "expenseDetail.notFound"
                return
            }
            if let receiptId = expense?.receiptId {
                await loadReceipt(id: receiptId)
            } else {
                receiptItems = []
            }
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func loadReceipt(id: String) async {
        isLoadingReceipt = true
        defer { isLoadingReceipt = false }
        do {
            let r = try await ReceiptsRepo.detail(id: id)
            receiptItems = r.items ?? []
        } catch {
            receiptItems = []
        }
    }
}

// MARK: - Edit sheet

struct ExpenseEditSheet: View {
    let expense: Expense
    let categories: [Category]
    let onSubmit: (ExpenseUpdate) -> Void
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var locale: AppLocale

    @State private var title: String
    @State private var amount: String
    @State private var vendor: String
    @State private var notes: String
    @State private var tagsText: String
    @State private var date: Date
    @State private var categoryId: String?

    init(expense: Expense, categories: [Category], onSubmit: @escaping (ExpenseUpdate) -> Void) {
        self.expense = expense
        self.categories = categories
        self.onSubmit = onSubmit
        _title = State(initialValue: expense.title)
        _amount = State(initialValue: expense.amount.description)
        _vendor = State(initialValue: expense.vendor ?? "")
        _notes = State(initialValue: expense.notes ?? "")
        _tagsText = State(initialValue: (expense.tags ?? []).joined(separator: ", "))
        let df = DateFormatter(); df.dateFormat = "yyyy-MM-dd"
        _date = State(initialValue: df.date(from: String(expense.date.prefix(10))) ?? Date())
        _categoryId = State(initialValue: expense.categoryId)
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: Theme.Spacing.md) {
                    NBTextField(label: locale.t("expenses.title.label"), text: $title)
                    NBTextField(label: locale.t("common.amount"), text: $amount, keyboardType: .decimalPad)

                    VStack(alignment: .leading, spacing: Theme.Spacing.xxs) {
                        Text(locale.t("common.date"))
                            .font(AppFont.bodyMedium)
                            .foregroundColor(Theme.foreground)
                        DatePicker("", selection: $date, displayedComponents: .date)
                            .labelsHidden()
                    }

                    if !categories.isEmpty {
                        VStack(alignment: .leading, spacing: Theme.Spacing.xxs) {
                            Text(locale.t("expenses.category"))
                                .font(AppFont.bodyMedium)
                                .foregroundColor(Theme.foreground)
                            ScrollView(.horizontal, showsIndicators: false) {
                                HStack(spacing: 6) {
                                    ForEach(categories) { c in
                                        Button {
                                            categoryId = categoryId == c.id ? nil : c.id
                                        } label: {
                                            Text(c.name)
                                                .font(AppFont.mono(11))
                                                .tracking(0.5)
                                                .textCase(.uppercase)
                                                .padding(.horizontal, 10)
                                                .padding(.vertical, 8)
                                                .foregroundColor(categoryId == c.id ? Theme.background : Theme.foreground)
                                                .background(categoryId == c.id ? Theme.foreground : Theme.card)
                                                .overlay(
                                                    RoundedRectangle(cornerRadius: Theme.Radius.sm)
                                                        .stroke(Theme.foreground, lineWidth: Theme.Border.widthThin)
                                                )
                                                .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.sm))
                                        }
                                        .buttonStyle(.plain)
                                    }
                                }
                            }
                        }
                    }

                    NBTextField(label: locale.t("expenses.vendor"), text: $vendor)
                    NBTextField(
                        label: locale.t("expenses.tags"),
                        text: $tagsText,
                        placeholder: "comma,separated",
                        keyboardType: .asciiCapable,
                        autocapitalization: .never
                    )

                    VStack(alignment: .leading, spacing: Theme.Spacing.xxs) {
                        Text(locale.t("common.notes"))
                            .font(AppFont.bodyMedium)
                            .foregroundColor(Theme.foreground)
                        TextEditor(text: $notes)
                            .font(AppFont.body)
                            .frame(minHeight: 72)
                            .padding(8)
                            .background(Theme.card)
                            .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.md))
                            .overlay(
                                RoundedRectangle(cornerRadius: Theme.Radius.md)
                                    .stroke(Theme.foreground, lineWidth: Theme.Border.widthThin)
                            )
                    }
                }
                .padding(Theme.Spacing.md)
            }
            .background(Theme.background)
            .navigationTitle(locale.t("common.edit"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(locale.t("common.cancel")) { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(locale.t("common.save")) {
                        let df = DateFormatter(); df.dateFormat = "yyyy-MM-dd"
                        let tags = tagsText
                            .split(separator: ",")
                            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
                            .filter { !$0.isEmpty }
                        onSubmit(ExpenseUpdate(
                            id: expense.id,
                            title: title.trimmingCharacters(in: .whitespacesAndNewlines),
                            amount: amount.replacingOccurrences(of: ",", with: "."),
                            date: df.string(from: date),
                            categoryId: categoryId,
                            vendor: vendor.isEmpty ? nil : vendor,
                            notes: notes.isEmpty ? nil : notes,
                            tags: tags.isEmpty ? nil : tags
                        ))
                        dismiss()
                    }
                    .disabled(
                        title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ||
                        Double(amount.replacingOccurrences(of: ",", with: ".")) == nil
                    )
                }
            }
        }
    }
}
