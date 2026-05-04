import SwiftUI

/// Group-less "quick split" — the UX Wojtek expects when tapping the
/// FAB → "Quick split" option. Inline participant entry, then we silently
/// create an ad-hoc group + split in one round-trip. No group pre-existing.
///
/// Also used from the OCR confirm sheet as a post-receipt splitting CTA
/// (`prefillTotal` / `prefillDescription` / `prefillCurrency` / `receiptId`).
struct QuickSplitStandaloneSheet: View {
    /// Receipt context — when set, pre-fills amount/description and links
    /// the split back to the saved receipt.
    var prefillTotal: Double?
    var prefillDescription: String?
    var prefillCurrency: String?
    var receiptId: String?
    /// Called on successful split creation; parent can dismiss + toast.
    var onCompleted: (() -> Void)?

    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var locale: AppLocale
    @EnvironmentObject private var toast: ToastCenter

    @State private var desc: String = ""
    @State private var amount: String = ""
    @State private var currency: String = "PLN"
    @State private var participants: [Participant] = [
        Participant(name: "Ja", isMe: true),
        Participant(name: ""),
    ]
    @State private var paidByIndex: Int = 0
    @State private var isSubmitting = false
    @State private var errorMessage: String?

    private static let colors: [String] = [
        "#6366f1", "#ec4899", "#f59e0b", "#10b981",
        "#3b82f6", "#8b5cf6", "#ef4444", "#14b8a6",
    ]

    struct Participant: Identifiable, Hashable {
        let id = UUID()
        var name: String
        var isMe: Bool = false
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: Theme.Spacing.md) {
                    header
                    descField
                    amountRow
                    participantsSection
                    paidBySection
                    if let total = totalAmount, !validParticipants.isEmpty {
                        previewSection(total: total)
                    }
                    if let err = errorMessage {
                        Text(err)
                            .font(AppFont.caption)
                            .foregroundColor(Theme.destructive)
                            .padding(Theme.Spacing.sm)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .nbCard(radius: Theme.Radius.sm, shadow: Theme.Shadow.sm)
                    }
                }
                .padding(Theme.Spacing.md)
            }
            .background(Theme.background)
            .navigationTitle(locale.t("quickSplit.title"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(locale.t("common.cancel")) { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(isSubmitting ? locale.t("common.loading") : locale.t("common.save")) {
                        Task { await submit() }
                    }
                    .disabled(!isValid || isSubmitting)
                }
            }
        }
        .onAppear(perform: applyPrefill)
    }

    // MARK: - Sections

    private var header: some View {
        VStack(alignment: .leading, spacing: 4) {
            NBEyebrow(text: locale.t("quickSplit.grouplessEyebrow"))
            Text(locale.t("quickSplit.grouplessTitle"))
                .font(AppFont.bold(22))
                .foregroundColor(Theme.foreground)
            Text(locale.t("quickSplit.grouplessSubtitle"))
                .font(AppFont.caption)
                .foregroundColor(Theme.mutedForeground)
        }
    }

    private var descField: some View {
        NBTextField(
            label: locale.t("quickSplit.descriptionLabel"),
            text: $desc,
            placeholder: locale.t("quickSplit.descriptionPh")
        )
    }

    private var amountRow: some View {
        HStack(spacing: Theme.Spacing.sm) {
            NBTextField(
                label: locale.t("quickSplit.amountLabel"),
                text: $amount,
                placeholder: "0.00",
                keyboardType: .decimalPad
            )
            NBTextField(
                label: locale.t("quickSplit.currencyLabel"),
                text: $currency,
                placeholder: "PLN",
                autocapitalization: .characters
            )
            .frame(width: 90)
        }
    }

    private var participantsSection: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.xs) {
            HStack {
                Text(locale.t("quickSplit.participants"))
                    .font(AppFont.bodyMedium)
                    .foregroundColor(Theme.foreground)
                Spacer()
                Button {
                    participants.append(Participant(name: ""))
                } label: {
                    Label(locale.t("quickSplit.addParticipant"), systemImage: "plus")
                        .font(AppFont.caption)
                }
                .buttonStyle(.plain)
                .foregroundColor(Theme.foreground)
            }
            ForEach(participants.indices, id: \.self) { idx in
                participantRow(idx: idx)
            }
        }
    }

    private func participantRow(idx: Int) -> some View {
        HStack(spacing: Theme.Spacing.sm) {
            Circle()
                .fill(Color(hex: Self.colors[idx % Self.colors.count]) ?? Theme.muted)
                .frame(width: 16, height: 16)
                .overlay(
                    Circle().stroke(Theme.border, lineWidth: Theme.Border.widthThin)
                )
            TextField(locale.t("quickSplit.participantPh"), text: $participants[idx].name)
                .font(AppFont.body)
                .padding(.vertical, 8)
                .padding(.horizontal, 10)
                .background(Theme.card)
                .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.sm))
                .overlay(
                    RoundedRectangle(cornerRadius: Theme.Radius.sm)
                        .stroke(Theme.border, lineWidth: Theme.Border.widthThin)
                )
                .disabled(participants[idx].isMe)
            if !participants[idx].isMe {
                Button {
                    remove(at: idx)
                } label: {
                    Image(systemName: "minus.circle")
                        .foregroundColor(Theme.destructive)
                }
                .buttonStyle(.plain)
            }
        }
    }

    private var paidBySection: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.xxs) {
            Text(locale.t("quickSplit.paidBy"))
                .font(AppFont.bodyMedium)
                .foregroundColor(Theme.foreground)
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 6) {
                    ForEach(validParticipants.indices, id: \.self) { i in
                        let p = validParticipants[i]
                        let originalIdx = participants.firstIndex(where: { $0.id == p.id }) ?? 0
                        Button { paidByIndex = originalIdx } label: {
                            HStack(spacing: 6) {
                                Circle()
                                    .fill(Color(hex: Self.colors[originalIdx % Self.colors.count]) ?? Theme.muted)
                                    .frame(width: 10, height: 10)
                                Text(p.name)
                                    .font(AppFont.caption)
                                    .foregroundColor(paidByIndex == originalIdx ? Theme.background : Theme.foreground)
                            }
                            .padding(.horizontal, 10)
                            .padding(.vertical, 6)
                            .background(paidByIndex == originalIdx ? Theme.foreground : Theme.card)
                            .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.sm))
                            .overlay(
                                RoundedRectangle(cornerRadius: Theme.Radius.sm)
                                    .stroke(Theme.border, lineWidth: Theme.Border.widthThin)
                            )
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
        }
    }

    private func previewSection(total: Double) -> some View {
        let share = total / Double(max(1, validParticipants.count))
        return VStack(alignment: .leading, spacing: Theme.Spacing.xxs) {
            Text(locale.t("quickSplit.preview"))
                .font(AppFont.mono(10))
                .tracking(1)
                .foregroundColor(Theme.mutedForeground)
            HStack {
                Text(String(format: locale.t("quickSplit.perPersonFmt"), validParticipants.count))
                    .font(AppFont.caption)
                    .foregroundColor(Theme.mutedForeground)
                Spacer()
                Text(Fmt.amount(share, currency: currency))
                    .font(AppFont.mono(13))
                    .foregroundColor(Theme.foreground)
            }
            .padding(Theme.Spacing.sm)
            .nbCard(radius: Theme.Radius.sm, shadow: Theme.Shadow.sm)
        }
    }

    // MARK: - Helpers

    private var totalAmount: Double? {
        let normalized = amount.replacingOccurrences(of: ",", with: ".")
        return Double(normalized)
    }

    private var validParticipants: [Participant] {
        participants.filter { !$0.name.trimmingCharacters(in: .whitespaces).isEmpty }
    }

    private var isValid: Bool {
        guard let total = totalAmount, total > 0 else { return false }
        guard validParticipants.count >= 2 else { return false }
        guard !currency.isEmpty else { return false }
        return true
    }

    private func remove(at idx: Int) {
        guard idx < participants.count, !participants[idx].isMe else { return }
        participants.remove(at: idx)
        if paidByIndex >= participants.count { paidByIndex = 0 }
    }

    private func applyPrefill() {
        if let t = prefillTotal, t > 0 {
            amount = String(format: "%.2f", t)
        }
        if let d = prefillDescription, desc.isEmpty {
            desc = d
        }
        if let c = prefillCurrency, !c.isEmpty {
            currency = c
        }
    }

    // MARK: - Submission

    private func submit() async {
        guard let total = totalAmount, total > 0 else { return }
        let names = validParticipants
        guard names.count >= 2 else { return }

        isSubmitting = true
        errorMessage = nil
        defer { isSubmitting = false }

        let members = names.enumerated().map { (i, p) in
            GroupMemberInput(
                displayName: p.name.trimmingCharacters(in: .whitespaces),
                email: nil,
                color: Self.colors[i % Self.colors.count],
                userId: nil
            )
        }
        let groupName = desc.isEmpty ? locale.t("quickSplit.groupNameFallback") : desc

        do {
            let group = try await GroupsRepo.create(GroupCreate(
                name: groupName,
                description: nil,
                currency: currency.uppercased(),
                emoji: "⚡️",
                mode: "adhoc",
                startDate: nil,
                endDate: nil,
                members: members
            ))
            // Re-fetch so we get the assigned member IDs.
            let full = try await GroupsRepo.detail(id: group.id)
            let loadedMembers = full.members ?? []
            guard !loadedMembers.isEmpty else {
                throw NSError(domain: "QuickSplit", code: -1,
                              userInfo: [NSLocalizedDescriptionKey: "No members returned from server"])
            }
            let payer = loadedMembers.indices.contains(paidByIndex)
                ? loadedMembers[paidByIndex]
                : loadedMembers[0]
            let share = total / Double(loadedMembers.count)
            let splits: [SplitPortionInput] = loadedMembers.map { m in
                SplitPortionInput(memberId: m.id, amount: share, settled: nil)
            }
            _ = try await GroupsRepo.createSplit(SplitCreate(
                groupId: full.id,
                paidByMemberId: payer.id,
                totalAmount: total,
                currency: currency.uppercased(),
                description: desc.isEmpty ? nil : desc,
                splits: splits,
                expenseId: nil,
                receiptId: receiptId
            ))
            toast.success(locale.t("quickSplit.saved"))
            onCompleted?()
            dismiss()
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}
