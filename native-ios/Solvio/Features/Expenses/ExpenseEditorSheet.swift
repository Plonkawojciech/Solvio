import SwiftUI

/// Dodawanie i edycja wydatku w jednym arkuszu — te same pola, ta sama
/// walidacja. `expense == nil` znaczy „nowy".
///
/// Kategoria jest opcjonalna świadomie: pusta oznacza „niech AI zgadnie",
/// a backend rozwiązuje ją regułą sprzedawcy albo modelem PRZED insertem.
struct ExpenseEditorSheet: View {
    let expense: Expense?

    @EnvironmentObject private var store: AppDataStore
    @EnvironmentObject private var locale: AppLocale
    @EnvironmentObject private var toast: ToastCenter
    @Environment(\.dismiss) private var dismiss

    @State private var title = ""
    @State private var amount = ""
    @State private var vendor = ""
    @State private var notes = ""
    @State private var date = Date()
    @State private var categoryId: String?
    @State private var saving = false
    @FocusState private var amountFocused: Bool

    private var isEditing: Bool { expense != nil }

    private var parsedAmount: Double? {
        let normalized = amount.replacingOccurrences(of: ",", with: ".").trimmingCharacters(in: .whitespaces)
        guard let value = Double(normalized), value > 0 else { return nil }
        return value
    }

    private var canSave: Bool {
        !title.trimmingCharacters(in: .whitespaces).isEmpty && parsedAmount != nil && !saving
    }

    var body: some View {
        NavigationStack {
            ZStack {
                PaperBackground()
                ScrollView {
                    VStack(alignment: .leading, spacing: Theme.Spacing.md) {
                        amountField
                        detailsCard
                        categoryCard
                    }
                    .padding(Theme.Spacing.md)
                }
            }
            .navigationTitle(isEditing ? locale.t("expenses.edit") : locale.t("expenses.add"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(locale.t("common.cancel")) { dismiss() }
                        .foregroundColor(Theme.mutedForeground)
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(locale.t("common.save")) { save() }
                        .fontWeight(.semibold)
                        .foregroundColor(canSave ? Theme.primary : Theme.mutedForeground)
                        .disabled(!canSave)
                }
            }
        }
        .onAppear(perform: prefill)
    }

    // MARK: - Pola

    private var amountField: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.sm) {
            SectionLabel(text: locale.t("expenses.amount"))
            HStack(alignment: .firstTextBaseline, spacing: 6) {
                TextField("0,00", text: $amount)
                    .font(AppFont.hero)
                    .keyboardType(.decimalPad)
                    .focused($amountFocused)
                Text(store.currency)
                    .font(AppFont.sectionTitle)
                    .foregroundColor(Theme.mutedForeground)
            }
        }
        .padding(Theme.Spacing.md)
        .frame(maxWidth: .infinity, alignment: .leading)
        .paperCard()
        .onAppear { if !isEditing { amountFocused = true } }
    }

    private var detailsCard: some View {
        PaperCard {
            VStack(spacing: 0) {
                field(locale.t("expenses.fieldName"), text: $title, placeholder: locale.t("expenses.fieldNamePlaceholder"))
                Divider().overlay(Theme.border)
                field(locale.t("expenses.vendor"), text: $vendor, placeholder: locale.t("expenses.fieldVendorPlaceholder"))
                Divider().overlay(Theme.border)
                HStack {
                    Text(locale.t("expenses.date"))
                        .font(AppFont.captionMedium)
                        .foregroundColor(Theme.mutedForeground)
                        .frame(width: 92, alignment: .leading)
                    DatePicker("", selection: $date, displayedComponents: .date)
                        .labelsHidden()
                    Spacer()
                }
                .padding(.vertical, 10)
                Divider().overlay(Theme.border)
                field(locale.t("expenses.notes"), text: $notes, placeholder: "—")
            }
        }
    }

    private func field(_ label: String, text: Binding<String>, placeholder: String) -> some View {
        HStack(spacing: Theme.Spacing.sm) {
            Text(label)
                .font(AppFont.captionMedium)
                .foregroundColor(Theme.mutedForeground)
                .frame(width: 92, alignment: .leading)
            TextField(placeholder, text: text)
                .font(AppFont.body)
                .foregroundColor(Theme.foreground)
        }
        .padding(.vertical, 11)
    }

    private var categoryCard: some View {
        PaperCard(label: locale.t("expenses.category")) {
            FlowChips {
                chip(locale.t("expenses.autoCategory"), active: categoryId == nil) { categoryId = nil }
                ForEach(store.categories) { category in
                    chip(category.name, active: categoryId == category.id) {
                        categoryId = categoryId == category.id ? nil : category.id
                    }
                }
            }
        }
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
                .background(active ? Theme.primary : Theme.muted)
                .clipShape(Capsule())
        }
    }

    // MARK: - Zapis

    private func prefill() {
        guard let expense else { return }
        title = expense.title
        amount = expense.amount.description.replacingOccurrences(of: ".", with: ",")
        vendor = expense.vendor ?? ""
        notes = expense.notes ?? ""
        categoryId = expense.categoryId
        let f = DateFormatter()
        f.dateFormat = "yyyy-MM-dd"
        date = f.date(from: String(expense.date.prefix(10))) ?? Date()
    }

    private func save() {
        guard let value = parsedAmount else { return }
        saving = true
        let f = DateFormatter()
        f.dateFormat = "yyyy-MM-dd"
        let ymd = f.string(from: date)
        let cleanTitle = title.trimmingCharacters(in: .whitespaces)
        let cleanVendor = vendor.trimmingCharacters(in: .whitespaces)
        let cleanNotes = notes.trimmingCharacters(in: .whitespaces)

        Task {
            defer { saving = false }
            do {
                if let existing = expense {
                    try await ExpensesRepo.update(ExpenseUpdate(
                        id: existing.id,
                        title: cleanTitle,
                        amount: String(format: "%.2f", value),
                        date: ymd,
                        categoryId: categoryId,
                        vendor: cleanVendor.isEmpty ? nil : cleanVendor,
                        notes: cleanNotes.isEmpty ? nil : cleanNotes,
                        tags: existing.tags,
                        receiptId: existing.receiptId
                    ))
                    toast.success(locale.t("expenses.saved"))
                } else {
                    let created = try await ExpensesRepo.create(ExpenseCreate(
                        title: cleanTitle,
                        amount: String(format: "%.2f", value),
                        date: ymd,
                        categoryId: categoryId,
                        vendor: cleanVendor.isEmpty ? nil : cleanVendor,
                        notes: cleanNotes.isEmpty ? nil : cleanNotes,
                        tags: nil,
                        currency: store.currency,
                        receiptId: nil
                    ))
                    store.insertExpenseOptimistic(created)
                    toast.success(locale.t("expenses.added"))
                }
                store.didMutateExpenses()
                dismiss()
            } catch {
                toast.error(locale.t("common.error"))
            }
        }
    }
}

/// Chipy zawijające się do kolejnych wierszy. `LazyVGrid` nie umie
/// zmiennych szerokości, a `Flow` jest dopiero od iOS 16.4.
struct FlowChips<Content: View>: View {
    @ViewBuilder var content: () -> Content

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 6) { content() }
        }
    }
}
