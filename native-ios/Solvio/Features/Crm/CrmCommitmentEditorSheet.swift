import SwiftUI

/// Dodawanie i edycja serii cyklicznej w CRM-ie. `commitment == nil` = nowa.
///
/// Kadencja to liczba miesięcy między uderzeniami — CRM trzyma ją jako
/// `intervalMonths`, więc pokazujemy gotowe wybory (1/3/6/12) zamiast pola
/// liczbowego, w które i tak nikt nie wpisze 7.
struct CrmCommitmentEditorSheet: View {
    let commitment: CrmCommitment?

    @EnvironmentObject private var crm: CrmStore
    @EnvironmentObject private var locale: AppLocale
    @EnvironmentObject private var toast: ToastCenter
    @Environment(\.dismiss) private var dismiss

    @State private var isIncome = false
    @State private var title = ""
    @State private var amount = ""
    @State private var category = ""
    @State private var note = ""
    @State private var startDate = Date()
    @State private var intervalMonths = 1
    @State private var active = true
    @State private var clientId: String?
    @State private var saving = false
    @State private var confirmDelete = false

    private static let intervals = [1, 3, 6, 12]

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
                        cadenceCard
                        clientCard
                        if commitment != nil { deleteButton }
                    }
                    .padding(Theme.Spacing.md)
                    .padding(.bottom, Theme.Spacing.xl)
                }
            }
            .navigationTitle(locale.t(commitment == nil ? "crm.newCommitment" : "crm.editCommitment"))
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
                locale.t("crm.deleteCommitmentConfirm"),
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
                CrmFormField(label: locale.t("expenses.fieldName"), text: $title,
                             placeholder: locale.t("crm.titlePlaceholder"))
                Divider().overlay(Theme.border)
                CrmFormField(label: locale.t("expenses.category"), text: $category,
                             placeholder: locale.t("crm.categoryPlaceholder"))
                Divider().overlay(Theme.border)
                CrmFormField(label: locale.t("expenses.notes"), text: $note, placeholder: "—")
            }
        }
    }

    private var cadenceCard: some View {
        PaperCard(label: locale.t("crm.cadence")) {
            VStack(alignment: .leading, spacing: Theme.Spacing.sm) {
                HStack(spacing: 6) {
                    ForEach(Self.intervals, id: \.self) { months in
                        PickChip(label: locale.t(cadenceKey(months)), active: intervalMonths == months) {
                            intervalMonths = months
                        }
                    }
                }
                Divider().overlay(Theme.border)
                HStack {
                    Text(locale.t("crm.startDate"))
                        .font(AppFont.captionMedium)
                        .foregroundColor(Theme.mutedForeground)
                        .frame(width: 92, alignment: .leading)
                    DatePicker("", selection: $startDate, displayedComponents: .date).labelsHidden()
                    Spacer()
                }
                Divider().overlay(Theme.border)
                Toggle(isOn: $active) {
                    Text(locale.t("crm.activeSeries"))
                        .font(AppFont.captionMedium)
                        .foregroundColor(Theme.foreground)
                }
                .tint(Theme.primary)
            }
        }
    }

    private func cadenceKey(_ months: Int) -> String {
        switch months {
        case 1:  return "crm.cadenceMonthly"
        case 3:  return "crm.cadenceQuarterly"
        case 6:  return "crm.cadenceHalfYearly"
        default: return "crm.cadenceYearly"
        }
    }

    private var clientCard: some View {
        PaperCard(label: locale.t("crm.client")) {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 6) {
                    PickChip(label: locale.t("crm.noClient"), active: clientId == nil) { clientId = nil }
                    ForEach(crm.clients) { client in
                        PickChip(label: client.name, active: clientId == client.id) {
                            clientId = clientId == client.id ? nil : client.id
                        }
                    }
                }
            }
        }
    }

    private var deleteButton: some View {
        Button(locale.t("crm.deleteCommitment")) { confirmDelete = true }
            .font(AppFont.captionMedium)
            .foregroundColor(Theme.destructive)
            .frame(maxWidth: .infinity)
            .padding(.top, Theme.Spacing.xs)
    }

    // MARK: - Zapis

    private func prefill() {
        guard let commitment else { return }
        isIncome = commitment.isIncome
        title = commitment.title
        amount = String(format: "%.2f", commitment.amount).replacingOccurrences(of: ".", with: ",")
        category = commitment.category
        note = commitment.note ?? ""
        intervalMonths = commitment.intervalMonths
        active = commitment.active
        clientId = commitment.clientId
        startDate = Fmt.parseISO(commitment.startDate) ?? Date()
    }

    private func save() {
        guard let value = parsedAmount else { return }
        saving = true
        let f = DateFormatter()
        f.dateFormat = "yyyy-MM-dd"

        let input = CrmCommitmentInput(
            title: title.trimmingCharacters(in: .whitespaces),
            type: isIncome ? "INCOME" : "EXPENSE",
            amount: String(format: "%.2f", value),
            category: category.trimmingCharacters(in: .whitespaces),
            note: note.trimmingCharacters(in: .whitespaces),
            clientId: clientId,
            startDate: f.string(from: startDate),
            active: active,
            intervalMonths: intervalMonths
        )

        Task {
            defer { saving = false }
            do {
                try await crm.saveCommitment(id: commitment?.id, input: input)
                toast.success(locale.t("crm.saved"))
                dismiss()
            } catch {
                Log.error(.crm, "nie udało się zapisać zobowiązania", error)
                toast.error(locale.t("crm.saveFailed"))
            }
        }
    }

    private func remove() {
        guard let commitment else { return }
        Task {
            await crm.deleteCommitment(commitment)
            toast.info(locale.t("crm.deleted"))
            dismiss()
        }
    }
}
