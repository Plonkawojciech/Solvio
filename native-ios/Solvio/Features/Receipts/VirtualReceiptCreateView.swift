import SwiftUI

/// Manual-entry receipt — no OCR. Mirrors the web `/app/api/data/receipts`
/// POST contract (`ReceiptCreate`): vendor, date (YYYY-MM-DD), currency,
/// items[], optional total. If total is empty we compute sum(qty × unitPrice)
/// so users don't have to double-enter it.
struct VirtualReceiptCreateView: View {
    /// Called after a successful POST with the created receipt.
    let onCreated: (Receipt) -> Void

    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var toast: ToastCenter
    @EnvironmentObject private var locale: AppLocale

    @State private var vendor: String = ""
    @State private var date: Date = Date()
    @State private var currency: String = "PLN"
    @State private var notes: String = ""
    @State private var totalOverrideText: String = ""
    @State private var useCustomTotal: Bool = false
    @State private var items: [EditableItem] = [EditableItem()]
    @State private var isSaving = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Theme.Spacing.md) {
                NBTextField(label: locale.t("virtualReceipt.vendor"), text: $vendor, placeholder: locale.t("virtualReceipt.vendorPh"))

                VStack(alignment: .leading, spacing: Theme.Spacing.xxs) {
                    Text(locale.t("virtualReceipt.dateLabel"))
                        .font(AppFont.bodyMedium)
                        .foregroundColor(Theme.foreground)
                    DatePicker("", selection: $date, displayedComponents: .date)
                        .labelsHidden()
                        .datePickerStyle(.compact)
                }

                HStack(spacing: Theme.Spacing.sm) {
                    NBTextField(label: locale.t("virtualReceipt.currency"), text: $currency, placeholder: locale.t("virtualReceipt.currencyPh"), autocapitalization: .characters)
                        .frame(maxWidth: 140)
                    Spacer()
                }

                itemsSection

                totalSection

                VStack(alignment: .leading, spacing: Theme.Spacing.xxs) {
                    Text(locale.t("virtualReceipt.notesLabel"))
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

                Button {
                    Task { await save() }
                } label: {
                    Text(isSaving ? locale.t("virtualReceipt.saving") : locale.t("virtualReceipt.save"))
                }
                .buttonStyle(NBPrimaryButtonStyle())
                .disabled(isSaving || !canSave)

                Spacer(minLength: Theme.Spacing.xl)
            }
            .padding(Theme.Spacing.md)
        }
        .background(Theme.background)
        .navigationTitle(locale.t("virtualReceipt.title"))
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .cancellationAction) {
                Button(locale.t("common.cancel")) { dismiss() }
            }
        }
    }

    // MARK: - Items

    private var itemsSection: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.xs) {
            HStack {
                NBEyebrow(text: locale.t("virtualReceipt.itemsTitle"))
                Spacer()
                Button {
                    items.append(EditableItem())
                } label: {
                    Label(locale.t("virtualReceipt.addItem"), systemImage: "plus")
                        .font(AppFont.mono(11))
                        .foregroundColor(Theme.foreground)
                }
            }
            ForEach($items) { $item in
                itemRow($item)
            }
        }
    }

    private func itemRow(_ item: Binding<EditableItem>) -> some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.xs) {
            HStack(alignment: .top) {
                TextField(locale.t("virtualReceipt.itemName"), text: item.name)
                    .font(AppFont.bodyMedium)
                    .textInputAutocapitalization(.sentences)
                Spacer()
                Button(role: .destructive) {
                    if let idx = items.firstIndex(where: { $0.id == item.wrappedValue.id }) {
                        items.remove(at: idx)
                    }
                } label: {
                    Image(systemName: "trash")
                        .foregroundColor(Theme.destructive)
                }
                .buttonStyle(.plain)
                .disabled(items.count <= 1)
            }
            HStack(spacing: Theme.Spacing.xs) {
                labeledField(locale.t("virtualReceipt.qty"), text: item.quantityText, width: 80)
                Text("×").foregroundColor(Theme.mutedForeground)
                labeledField(locale.t("virtualReceipt.unitPrice"), text: item.priceText)
                Spacer()
                let line = lineTotal(item.wrappedValue)
                Text(Fmt.amount(line, currency: currency.isEmpty ? "PLN" : currency.uppercased()))
                    .font(AppFont.mono(12))
                    .foregroundColor(Theme.foreground)
            }
        }
        .padding(Theme.Spacing.sm)
        .nbCard(radius: Theme.Radius.sm, shadow: Theme.Shadow.sm)
    }

    private func labeledField(_ placeholder: String, text: Binding<String>, width: CGFloat? = nil) -> some View {
        TextField(placeholder, text: text)
            .keyboardType(.decimalPad)
            .font(AppFont.caption)
            .padding(.horizontal, 8).padding(.vertical, 6)
            .frame(width: width)
            .background(Theme.card)
            .overlay(
                RoundedRectangle(cornerRadius: Theme.Radius.sm)
                    .stroke(Theme.foreground, lineWidth: Theme.Border.widthThin)
            )
    }

    // MARK: - Total

    private var totalSection: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.xs) {
            HStack {
                NBEyebrow(text: locale.t("virtualReceipt.totalTitle"))
                Spacer()
                Text(Fmt.amount(effectiveTotal, currency: currency.isEmpty ? "PLN" : currency.uppercased()))
                    .font(AppFont.amount)
                    .foregroundColor(Theme.foreground)
            }
            Toggle(locale.t("virtualReceipt.overrideTotal"), isOn: $useCustomTotal)
                .font(AppFont.bodyMedium)
                .tint(Theme.foreground)
            if useCustomTotal {
                NBTextField(label: locale.t("virtualReceipt.customTotal"), text: $totalOverrideText, placeholder: "0.00", keyboardType: .decimalPad)
            } else {
                Text(locale.t("virtualReceipt.calculated"))
                    .font(AppFont.caption)
                    .foregroundColor(Theme.mutedForeground)
            }
        }
        .padding(Theme.Spacing.sm)
        .nbCard(radius: Theme.Radius.md, shadow: Theme.Shadow.sm)
    }

    // MARK: - Helpers

    private func lineTotal(_ item: EditableItem) -> Double {
        let qty = Double(item.quantityText.replacingOccurrences(of: ",", with: ".")) ?? 1
        let price = Double(item.priceText.replacingOccurrences(of: ",", with: ".")) ?? 0
        return qty * price
    }

    private var itemsTotal: Double {
        items.reduce(0) { $0 + lineTotal($1) }
    }

    private var effectiveTotal: Double {
        if useCustomTotal {
            return Double(totalOverrideText.replacingOccurrences(of: ",", with: ".")) ?? itemsTotal
        }
        return itemsTotal
    }

    private var canSave: Bool {
        guard !vendor.trimmingCharacters(in: .whitespaces).isEmpty else { return false }
        let hasItems = items.contains { $0.asReceiptItem() != nil }
        return hasItems || effectiveTotal > 0
    }

    // MARK: - Save

    private func save() async {
        guard canSave else { return }
        isSaving = true
        defer { isSaving = false }

        let df = DateFormatter()
        df.dateFormat = "yyyy-MM-dd"

        let payloadItems = items.compactMap { $0.asReceiptItem() }
        let body = ReceiptCreate(
            vendor: vendor.trimmingCharacters(in: .whitespaces),
            date: df.string(from: date),
            total: effectiveTotal > 0 ? effectiveTotal : nil,
            currency: currency.isEmpty ? "PLN" : currency.uppercased(),
            items: payloadItems,
            notes: notes.isEmpty ? nil : notes
        )

        do {
            let created = try await ReceiptsRepo.create(body)
            onCreated(created)
            dismiss()
        } catch {
            toast.error(locale.t("virtualReceipt.saveFailed"), description: error.localizedDescription)
        }
    }
}
