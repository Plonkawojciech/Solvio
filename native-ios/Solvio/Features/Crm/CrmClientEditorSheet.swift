import SwiftUI

/// Dodawanie i edycja klienta CRM-a. `client == nil` = nowy.
///
/// Abonament (`monthlyFee`) jest tu najważniejszym polem: z niego CRM liczy
/// MRR pokazywany na Panelu. Wartość projektu i dane kontaktowe to reszta
/// karty klienta — trzymamy je, żeby edycja z telefonu nie kasowała niczego,
/// czego apka nie potrafi pokazać.
struct CrmClientEditorSheet: View {
    let client: CrmClient?

    @EnvironmentObject private var crm: CrmStore
    @EnvironmentObject private var locale: AppLocale
    @EnvironmentObject private var toast: ToastCenter
    @Environment(\.dismiss) private var dismiss

    @State private var name = ""
    @State private var service = ""
    @State private var status = "ACTIVE"
    @State private var monthlyFee = ""
    @State private var projectValue = ""
    @State private var contactName = ""
    @State private var phone = ""
    @State private var email = ""
    @State private var notes = ""
    @State private var saving = false
    @State private var confirmDelete = false

    private static let statuses = ["ACTIVE", "IN_TALKS", "AGREED", "FINISHED"]

    private var canSave: Bool {
        !name.trimmingCharacters(in: .whitespaces).isEmpty && !saving
    }

    var body: some View {
        NavigationStack {
            ZStack {
                PaperBackground()
                ScrollView {
                    VStack(alignment: .leading, spacing: Theme.Spacing.md) {
                        identityCard
                        statusCard
                        moneyCard
                        contactCard
                        if client != nil { deleteButton }
                    }
                    .padding(Theme.Spacing.md)
                    .padding(.bottom, Theme.Spacing.xl)
                }
            }
            .navigationTitle(locale.t(client == nil ? "crm.newClient" : "crm.editClient"))
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
                locale.t("crm.deleteClientConfirm"),
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

    private var identityCard: some View {
        PaperCard {
            VStack(spacing: 0) {
                CrmFormField(label: locale.t("crm.clientName"), text: $name,
                             placeholder: locale.t("crm.clientNamePlaceholder"))
                Divider().overlay(Theme.border)
                CrmFormField(label: locale.t("crm.service"), text: $service, placeholder: "—")
            }
        }
    }

    private var statusCard: some View {
        PaperCard(label: locale.t("crm.status")) {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 6) {
                    ForEach(Self.statuses, id: \.self) { value in
                        PickChip(label: locale.t(statusKey(value)), active: status == value) {
                            status = value
                        }
                    }
                }
            }
        }
    }

    private func statusKey(_ value: String) -> String {
        switch value {
        case "IN_TALKS": return "crm.clientInTalks"
        case "AGREED":   return "crm.clientAgreed"
        case "FINISHED": return "crm.clientFinished"
        default:         return "crm.clientActive"
        }
    }

    private var moneyCard: some View {
        PaperCard(label: locale.t("crm.money")) {
            VStack(spacing: 0) {
                amountField(locale.t("crm.monthlyFee"), text: $monthlyFee)
                Divider().overlay(Theme.border)
                amountField(locale.t("crm.projectValue"), text: $projectValue)
            }
        }
    }

    private func amountField(_ label: String, text: Binding<String>) -> some View {
        HStack(spacing: Theme.Spacing.sm) {
            Text(label)
                .font(AppFont.captionMedium)
                .foregroundColor(Theme.mutedForeground)
                .frame(width: 92, alignment: .leading)
            TextField("0,00", text: text)
                .font(AppFont.body)
                .keyboardType(.decimalPad)
            Text("PLN")
                .font(AppFont.caption)
                .foregroundColor(Theme.mutedForeground)
        }
        .padding(.vertical, 11)
    }

    private var contactCard: some View {
        PaperCard(label: locale.t("crm.contact")) {
            VStack(spacing: 0) {
                CrmFormField(label: locale.t("crm.contactName"), text: $contactName, placeholder: "—")
                Divider().overlay(Theme.border)
                CrmFormField(label: locale.t("crm.phone"), text: $phone, placeholder: "—")
                Divider().overlay(Theme.border)
                CrmFormField(label: locale.t("crm.email"), text: $email, placeholder: "—")
                Divider().overlay(Theme.border)
                CrmFormField(label: locale.t("expenses.notes"), text: $notes, placeholder: "—")
            }
        }
    }

    private var deleteButton: some View {
        Button(locale.t("crm.deleteClient")) { confirmDelete = true }
            .font(AppFont.captionMedium)
            .foregroundColor(Theme.destructive)
            .frame(maxWidth: .infinity)
            .padding(.top, Theme.Spacing.xs)
    }

    // MARK: - Zapis

    private func prefill() {
        guard let client else { return }
        name = client.name
        service = client.service ?? ""
        status = client.status ?? "ACTIVE"
        monthlyFee = decimal(client.monthlyFee)
        projectValue = decimal(client.projectValue)
        contactName = client.contactName ?? ""
        phone = client.phone ?? ""
        email = client.email ?? ""
        notes = client.notes ?? ""
    }

    /// CRM oddaje kwoty klienta jako stringi z kropką; w polu chcemy przecinek.
    private func decimal(_ raw: String?) -> String {
        guard let raw, let value = Double(raw), value != 0 else { return "" }
        return String(format: "%.2f", value).replacingOccurrences(of: ".", with: ",")
    }

    private func save() {
        saving = true
        let input = CrmClientInput(
            name: name.trimmingCharacters(in: .whitespaces),
            service: service.trimmingCharacters(in: .whitespaces),
            status: status,
            monthlyFee: normalized(monthlyFee),
            projectValue: normalized(projectValue),
            contactName: contactName.trimmingCharacters(in: .whitespaces),
            phone: phone.trimmingCharacters(in: .whitespaces),
            email: email.trimmingCharacters(in: .whitespaces),
            notes: notes.trimmingCharacters(in: .whitespaces)
        )

        Task {
            defer { saving = false }
            do {
                try await crm.saveClient(id: client?.id, input: input)
                toast.success(locale.t("crm.saved"))
                dismiss()
            } catch {
                Log.error(.crm, "nie udało się zapisać klienta", error)
                toast.error(locale.t("crm.saveFailed"))
            }
        }
    }

    /// Puste pole to zero, nie „nie ruszaj" — CRM sam tak to interpretuje.
    private func normalized(_ raw: String) -> String {
        raw.replacingOccurrences(of: ",", with: ".").trimmingCharacters(in: .whitespaces)
    }

    private func remove() {
        guard let client else { return }
        Task {
            await crm.deleteClient(client)
            toast.info(locale.t("crm.deleted"))
            dismiss()
        }
    }
}
