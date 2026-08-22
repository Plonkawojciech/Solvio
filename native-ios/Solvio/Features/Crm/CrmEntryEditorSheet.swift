import SwiftUI

/// Dodawanie i edycja wpisu w Finansach CRM-a. `entry == nil` znaczy „nowy".
///
/// Kategoria jest wolnym tekstem po stronie CRM-a, więc podpowiadamy te,
/// które faktycznie występują w danych — słownika do pobrania tam nie ma.
struct CrmEntryEditorSheet: View {
    let entry: CrmEntry?

    @EnvironmentObject private var crm: CrmStore
    @EnvironmentObject private var locale: AppLocale
    @EnvironmentObject private var toast: ToastCenter
    @Environment(\.dismiss) private var dismiss

    @State private var isIncome = false
    @State private var title = ""
    @State private var amount = ""
    @State private var category = ""
    @State private var note = ""
    @State private var date = Date()
    @State private var paid = true
    @State private var clientId: String?
    @State private var saving = false
    @State private var confirmDelete = false

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
                        typeAndAmount
                        detailsCard
                        categoryCard
                        clientCard
                        if entry != nil { deleteButton }
                    }
                    .padding(Theme.Spacing.md)
                    .padding(.bottom, Theme.Spacing.xl)
                }
            }
            .navigationTitle(entry == nil ? locale.t("crm.newEntry") : locale.t("crm.editEntry"))
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
            .confirmationDialog(
                locale.t("crm.deleteConfirm"),
                isPresented: $confirmDelete,
                titleVisibility: .visible
            ) {
                Button(locale.t("common.delete"), role: .destructive) { remove() }
                Button(locale.t("common.cancel"), role: .cancel) {}
            }
        }
        .onAppear(perform: prefill)
    }

    // MARK: - Pola

    private var typeAndAmount: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.sm) {
            Picker("", selection: $isIncome) {
                Text(locale.t("crm.expense")).tag(false)
                Text(locale.t("crm.income2")).tag(true)
            }
            .pickerStyle(.segmented)

            SectionLabel(text: locale.t("expenses.amount"))
            HStack(alignment: .firstTextBaseline, spacing: 6) {
                TextField("0,00", text: $amount)
                    .font(AppFont.hero)
                    .keyboardType(.decimalPad)
                Text("PLN")
                    .font(AppFont.sectionTitle)
                    .foregroundColor(Theme.mutedForeground)
            }
        }
        .padding(Theme.Spacing.md)
        .frame(maxWidth: .infinity, alignment: .leading)
        .paperCard()
    }

    private var detailsCard: some View {
        PaperCard {
            VStack(spacing: 0) {
                field(locale.t("expenses.fieldName"), text: $title, placeholder: locale.t("crm.titlePlaceholder"))
                Divider().overlay(Theme.border)
                HStack {
                    Text(locale.t("expenses.date"))
                        .font(AppFont.captionMedium)
                        .foregroundColor(Theme.mutedForeground)
                        .frame(width: 92, alignment: .leading)
                    DatePicker("", selection: $date, displayedComponents: .date).labelsHidden()
                    Spacer()
                }
                .padding(.vertical, 10)
                Divider().overlay(Theme.border)
                Toggle(isOn: $paid) {
                    Text(locale.t("crm.paid"))
                        .font(AppFont.captionMedium)
                        .foregroundColor(Theme.foreground)
                }
                .tint(Theme.primary)
                .padding(.vertical, 6)
                Divider().overlay(Theme.border)
                field(locale.t("expenses.notes"), text: $note, placeholder: "—")
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
            VStack(alignment: .leading, spacing: Theme.Spacing.sm) {
                TextField(locale.t("crm.categoryPlaceholder"), text: $category)
                    .font(AppFont.body)
                if !crm.knownCategories.isEmpty {
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 6) {
                            ForEach(crm.knownCategories, id: \.self) { name in
                                chip(name, active: category == name) { category = name }
                            }
                        }
                    }
                }
            }
        }
    }

    private var clientCard: some View {
        PaperCard(label: locale.t("crm.client")) {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 6) {
                    chip(locale.t("crm.noClient"), active: clientId == nil) { clientId = nil }
                    ForEach(crm.clients) { client in
                        chip(client.name, active: clientId == client.id) {
                            clientId = clientId == client.id ? nil : client.id
                        }
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
                .lineLimit(1)
        }
    }

    private var deleteButton: some View {
        Button(locale.t("crm.deleteEntry")) { confirmDelete = true }
            .font(AppFont.captionMedium)
            .foregroundColor(Theme.destructive)
            .frame(maxWidth: .infinity)
            .padding(.top, Theme.Spacing.xs)
    }

    // MARK: - Zapis

    private func prefill() {
        guard let entry else { return }
        isIncome = entry.isIncome
        title = entry.title
        amount = String(format: "%.2f", entry.amount).replacingOccurrences(of: ".", with: ",")
        category = entry.category
        note = entry.note
        paid = entry.paid
        clientId = entry.client?.id
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime]
        date = f.date(from: entry.date) ?? Fmt.parseISO(entry.date) ?? Date()
    }

    private func save() {
        guard let value = parsedAmount else { return }
        saving = true
        let f = DateFormatter()
        f.dateFormat = "yyyy-MM-dd"

        let input = CrmEntryInput(
            type: isIncome ? "INCOME" : "EXPENSE",
            date: f.string(from: date),
            amount: String(format: "%.2f", value),
            title: title.trimmingCharacters(in: .whitespaces),
            category: category.trimmingCharacters(in: .whitespaces),
            paid: paid,
            note: note.trimmingCharacters(in: .whitespaces),
            clientId: clientId
        )

        Task {
            defer { saving = false }
            do {
                try await crm.save(id: entry?.id, input: input)
                toast.success(locale.t("crm.saved"))
                dismiss()
            } catch {
                Log.error(.crm, "nie udało się zapisać wpisu", error)
                toast.error(locale.t("crm.saveFailed"))
            }
        }
    }

    private func remove() {
        guard let entry else { return }
        Task {
            await crm.delete(entry)
            toast.info(locale.t("crm.deleted"))
            dismiss()
        }
    }
}
