import SwiftUI
import UIKit

/// Loyalty card wallet with barcode display. Tapping a card enlarges
/// its barcode for scanning at checkout. Matches the new `LoyaltyCard`
/// model shape (`store`, `cardNumber`, `memberName`).
///
/// Reads from `AppDataStore.loyalty` so tab switches don't re-fetch.
struct LoyaltyView: View {
    @EnvironmentObject private var toast: ToastCenter
    @EnvironmentObject private var locale: AppLocale
    @EnvironmentObject private var store: AppDataStore
    @State private var showCreate = false
    @State private var expandedCard: LoyaltyCard?
    @State private var pendingDelete: LoyaltyCard?

    private var cards: [LoyaltyCard] { store.loyalty }
    private var isLoading: Bool { store.loyaltyLoading }
    private var errorMessage: String? { store.loyaltyError }

    var body: some View {
        ZStack(alignment: .bottomTrailing) {
            List {
                Section {
                    NBScreenHeader(
                        eyebrow: locale.t("loyalty.eyebrow"),
                        title: locale.t("loyalty.headerTitle"),
                        subtitle: "\(cards.count) \(cards.count == 1 ? locale.t("loyalty.cardSuffixSingular") : locale.t("loyalty.cardSuffixPlural"))"
                    )
                    .padding(.horizontal, Theme.Spacing.md)
                    .padding(.top, Theme.Spacing.md)
                    .padding(.bottom, Theme.Spacing.xs)
                    .accessibilityElement(children: .combine)
                    .accessibilityAddTraits(.isHeader)
                }
                .listRowBackground(Color.clear)
                .listRowSeparator(.hidden)
                .listRowInsets(EdgeInsets())

                if isLoading && cards.isEmpty {
                    Section {
                        NBSkeletonList(rows: 4)
                            .padding(.horizontal, Theme.Spacing.md)
                    }
                    .listRowBackground(Color.clear)
                    .listRowSeparator(.hidden)
                    .listRowInsets(EdgeInsets())
                } else if let message = errorMessage, cards.isEmpty {
                    Section {
                        NBErrorCard(message: message) { Task { await store.awaitLoyalty(force: true) } }
                            .padding(.horizontal, Theme.Spacing.md)
                    }
                    .listRowBackground(Color.clear)
                    .listRowSeparator(.hidden)
                    .listRowInsets(EdgeInsets())
                } else if cards.isEmpty {
                    Section {
                        NBEmptyState(
                            systemImage: "creditcard.fill",
                            title: locale.t("loyalty.emptyTitle"),
                            subtitle: locale.t("loyalty.emptySub"),
                            action: (label: locale.t("loyalty.addCard"), run: { showCreate = true })
                        )
                        .padding(.horizontal, Theme.Spacing.md)
                    }
                    .listRowBackground(Color.clear)
                    .listRowSeparator(.hidden)
                    .listRowInsets(EdgeInsets())
                } else {
                    Section {
                        ForEach(cards) { card in
                            Button {
                                Haptics.selection()
                                expandedCard = card
                            } label: {
                                cardRow(card)
                            }
                            .buttonStyle(.plain)
                            .listRowBackground(Color.clear)
                            .listRowSeparator(.hidden)
                            .listRowInsets(EdgeInsets(
                                top: Theme.Spacing.xxs,
                                leading: Theme.Spacing.md,
                                bottom: Theme.Spacing.xxs,
                                trailing: Theme.Spacing.md
                            ))
                            .swipeActions(edge: .trailing, allowsFullSwipe: false) {
                                Button(role: .destructive) {
                                    Haptics.warning()
                                    pendingDelete = card
                                } label: {
                                    Label(locale.t("common.delete"), systemImage: "trash")
                                }
                            }
                            .contextMenu {
                                Button(locale.t("common.delete"), role: .destructive) {
                                    Haptics.warning()
                                    pendingDelete = card
                                }
                            }
                        }
                    }
                }

                Section {
                    Color.clear.frame(height: 96)
                }
                .listRowBackground(Color.clear)
                .listRowSeparator(.hidden)
                .listRowInsets(EdgeInsets())
            }
            .listStyle(.plain)
            .scrollContentBackground(.hidden)
            .background(Theme.background)
            .refreshable {
                // Match Dashboard pattern: light tick on pull, success on
                // fresh data — gated by `loyaltyError == nil` so a failing
                // reload doesn't ping a celebratory haptic.
                Haptics.impact(.light)
                await store.awaitLoyalty(force: true)
                if store.loyaltyError == nil {
                    Haptics.success()
                }
            }
            .task { store.ensureLoyalty() }

            Button {
                Haptics.impact(.medium)
                showCreate = true
            } label: {
                Image(systemName: "plus")
                    .font(.system(size: 22, weight: .bold))
                    .foregroundColor(Theme.background)
                    .frame(width: 56, height: 56)
                    .background(Theme.foreground)
                    .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.md))
                    .overlay(
                        RoundedRectangle(cornerRadius: Theme.Radius.md)
                            .stroke(Theme.border, lineWidth: Theme.Border.width)
                    )
                    .nbShadow(Theme.Shadow.md)
            }
            .buttonStyle(.plain)
            .padding(.trailing, Theme.Spacing.md)
            .padding(.bottom, Theme.Spacing.md)
            .accessibilityLabel(locale.t("loyalty.addCard"))
            .accessibilityHint(locale.t("loyalty.emptySub"))
        }
        .sheet(isPresented: $showCreate) {
            LoyaltyCreateSheet { body in
                Task {
                    do {
                        _ = try await LoyaltyRepo.create(body)
                        // success toast already triggers Haptics.success() via ToastCenter
                        toast.success(locale.t("loyalty.cardAdded"))
                        store.didMutateLoyalty()
                    } catch {
                        toast.error(locale.t("loyalty.createFailed"), description: error.localizedDescription)
                    }
                }
            }
            .environmentObject(locale)
        }
        .sheet(item: $expandedCard) { card in
            BarcodeSheet(card: card)
                .environmentObject(locale)
        }
        .alert(
            locale.t("loyalty.deleteTitle"),
            isPresented: Binding(
                get: { pendingDelete != nil },
                set: { if !$0 { pendingDelete = nil } }
            ),
            presenting: pendingDelete
        ) { card in
            Button(locale.t("common.cancel"), role: .cancel) {}
            Button(locale.t("common.delete"), role: .destructive) {
                // Confirm tap → tactile commit feel before the (potentially
                // slow) network round-trip. Toast fires Haptics.success on
                // resolve via ToastCenter.
                Haptics.impact(.medium)
                Task {
                    do {
                        try await LoyaltyRepo.delete(id: card.id)
                        toast.success(locale.t("loyalty.cardDeleted"))
                        store.didMutateLoyalty()
                    } catch {
                        toast.error(locale.t("loyalty.deleteFailed"), description: error.localizedDescription)
                    }
                }
            }
        } message: { card in
            Text(String(format: locale.t("loyalty.deleteConfirmFmt"), card.store))
        }
    }

    private func cardRow(_ c: LoyaltyCard) -> some View {
        // Composed a11y label: "store, member, masked card number" — last 4
        // are read by VoiceOver as digits, not as a string of bullets.
        var components: [String] = [c.store]
        if let member = c.memberName, !member.isEmpty { components.append(member) }
        if let n = c.cardNumber, !n.isEmpty {
            // Read the last 4 digits explicitly instead of "bullet bullet bullet bullet".
            let last4 = String(n.suffix(4))
            components.append("\(locale.t("loyalty.cardNumber")) \(last4)")
        }
        let composed = components.joined(separator: ", ")
        return HStack(spacing: Theme.Spacing.sm) {
            NBIconBadge(systemImage: "creditcard.fill")
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 2) {
                Text(c.store)
                    .font(AppFont.bodyMedium)
                    .foregroundColor(Theme.foreground)
                HStack(spacing: 6) {
                    if let member = c.memberName, !member.isEmpty {
                        Text(member)
                        Text("·")
                    }
                    Text(maskedCardNumber(c.cardNumber))
                        .font(AppFont.mono(11))
                }
                .font(AppFont.caption)
                .foregroundColor(Theme.mutedForeground)
            }
            Spacer()
            Image(systemName: "barcode")
                .font(.system(size: 18))
                .foregroundColor(Theme.foreground)
                .accessibilityHidden(true)
        }
        .padding(Theme.Spacing.sm)
        .nbCard(radius: Theme.Radius.md, shadow: Theme.Shadow.sm)
        .accessibilityElement(children: .combine)
        .accessibilityLabel(composed)
        .accessibilityHint(locale.t("loyalty.openCardHint"))
        .accessibilityAddTraits(.isButton)
    }

    /// Last 4 digits masked display: "•••• 1234".
    private func maskedCardNumber(_ number: String?) -> String {
        guard let n = number, !n.isEmpty else { return "—" }
        if n.count <= 4 { return n }
        let suffix = String(n.suffix(4))
        return "•••• \(suffix)"
    }
}

// MARK: - Create sheet

struct LoyaltyCreateSheet: View {
    let onSubmit: (LoyaltyCardCreate) -> Void
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var locale: AppLocale

    @State private var store = ""
    @State private var cardNumber = ""
    @State private var memberName = ""
    // FIX: removed `notes` and `selectedColor` State + UI — neither field is
    // present on `LoyaltyCardCreate` and the API endpoint never read them,
    // so the picker/text-editor were dead UI that misled the user into
    // thinking they were saving the values.

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: Theme.Spacing.md) {
                    NBTextField(label: locale.t("loyalty.store"), text: $store, placeholder: locale.t("virtualReceipt.vendorPh"))
                    NBTextField(
                        label: locale.t("loyalty.cardNumber"),
                        text: $cardNumber,
                        placeholder: locale.t("loyalty.cardNumberPh"),
                        keyboardType: .asciiCapable,
                        autocapitalization: .never
                    )
                    NBTextField(label: locale.t("loyalty.memberName"), text: $memberName, placeholder: locale.t("common.none"))
                }
                .padding(Theme.Spacing.md)
            }
            .background(Theme.background)
            .navigationTitle(locale.t("loyalty.newTitle"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button(locale.t("common.cancel")) { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button(locale.t("common.save")) {
                        let trimmedStore = store.trimmingCharacters(in: .whitespacesAndNewlines)
                        let trimmedNumber = cardNumber.trimmingCharacters(in: .whitespacesAndNewlines)
                        let trimmedMember = memberName.trimmingCharacters(in: .whitespacesAndNewlines)
                        onSubmit(LoyaltyCardCreate(
                            store: trimmedStore,
                            cardNumber: trimmedNumber.isEmpty ? nil : trimmedNumber,
                            memberName: trimmedMember.isEmpty ? nil : trimmedMember
                        ))
                        dismiss()
                    }
                    .disabled(
                        store.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ||
                        cardNumber.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                    )
                }
            }
        }
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
    }

}

// MARK: - Barcode sheet

struct BarcodeSheet: View {
    let card: LoyaltyCard
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var toast: ToastCenter
    @EnvironmentObject private var locale: AppLocale

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: Theme.Spacing.lg) {
                    VStack(spacing: Theme.Spacing.xs) {
                        Text(card.store)
                            .font(AppFont.pageTitle)
                            .foregroundColor(Theme.foreground)
                        if let member = card.memberName, !member.isEmpty {
                            Text(member)
                                .font(AppFont.caption)
                                .foregroundColor(Theme.mutedForeground)
                        }
                    }
                    .accessibilityElement(children: .combine)
                    .accessibilityAddTraits(.isHeader)

                    if let number = card.cardNumber, !number.isEmpty {
                        barcodeArea(number: number)
                        Text(number)
                            .font(AppFont.mono(16))
                            .foregroundColor(Theme.foreground)
                            .multilineTextAlignment(.center)
                            .textSelection(.enabled)
                        Button {
                            // Selection tick on tap; success toast follows
                            // and triggers Haptics.success via ToastCenter.
                            Haptics.selection()
                            UIPasteboard.general.string = number
                            toast.success(locale.t("loyalty.numberCopied"))
                        } label: {
                            Label(locale.t("loyalty.copyNumber"), systemImage: "doc.on.doc")
                        }
                        .buttonStyle(NBSecondaryButtonStyle())
                    } else {
                        Text(locale.t("loyalty.noNumber"))
                            .font(AppFont.caption)
                            .foregroundColor(Theme.mutedForeground)
                    }

                    VStack(alignment: .leading, spacing: Theme.Spacing.xs) {
                        NBEyebrow(text: locale.t("loyalty.details"))
                            .accessibilityAddTraits(.isHeader)
                        detailRow(locale.t("loyalty.store"), value: card.store)
                        if let member = card.memberName { detailRow(locale.t("loyalty.member"), value: member) }
                        if let last = card.lastUsed { detailRow(locale.t("loyalty.lastUsed"), value: Fmt.date(last)) }
                        if let created = card.createdAt { detailRow(locale.t("loyalty.added"), value: Fmt.date(created)) }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(Theme.Spacing.md)
                    .nbCard(radius: Theme.Radius.md, shadow: Theme.Shadow.sm)

                    Spacer(minLength: Theme.Spacing.md)
                }
                .padding(Theme.Spacing.md)
            }
            .background(Theme.background)
            .navigationTitle(locale.t("loyalty.cardTitle"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) { Button(locale.t("common.done")) { dismiss() } }
            }
        }
        // Barcode needs full screen for cashier scan — large only.
        .presentationDetents([.large])
        .presentationDragIndicator(.visible)
    }

    /// Auto-detect barcode format from card number. EAN13 if exactly 13
    /// digits, QR for non-numeric >20 chars, Code128 otherwise.
    private func barcodeArea(number: String) -> some View {
        let type = detectBarcodeType(number)
        return SwiftUI.Group {
            if let barcode = BarcodeImage.make(from: number, type: type) {
                Image(uiImage: barcode)
                    .resizable()
                    .interpolation(.none)
                    .scaledToFit()
                    .frame(maxWidth: .infinity)
                    .frame(minHeight: 140)
                    .padding(Theme.Spacing.md)
                    .background(Theme.card)
                    .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.md))
                    .overlay(
                        RoundedRectangle(cornerRadius: Theme.Radius.md)
                            .stroke(Theme.border, lineWidth: Theme.Border.width)
                    )
                    .nbShadow(Theme.Shadow.md)
                    // Barcode is for the cashier's scanner — VoiceOver users
                    // get the digits on the line just below.
                    .accessibilityHidden(true)
            } else {
                Text(number)
                    .font(AppFont.mono(22))
                    .foregroundColor(Theme.foreground)
                    .padding(Theme.Spacing.md)
                    .background(Theme.card)
                    .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.md))
                    .overlay(
                        RoundedRectangle(cornerRadius: Theme.Radius.md)
                            .stroke(Theme.border, lineWidth: Theme.Border.width)
                    )
            }
        }
    }

    private func detectBarcodeType(_ number: String) -> String {
        let digits = number.filter { $0.isNumber }
        let isAllDigits = digits.count == number.count
        if isAllDigits && number.count == 13 { return "ean13" }
        if !isAllDigits && number.count > 20 { return "qr" }
        return "code128"
    }

    private func detailRow(_ label: String, value: String) -> some View {
        HStack {
            Text(label)
                .font(AppFont.caption)
                .foregroundColor(Theme.mutedForeground)
            Spacer()
            Text(value)
                .font(AppFont.bodyMedium)
                .foregroundColor(Theme.foreground)
        }
        .accessibilityElement(children: .combine)
    }
}

// MARK: - Hex color helper

private extension Color {
    init?(hexString: String) {
        var hex = hexString.trimmingCharacters(in: .whitespacesAndNewlines)
        if hex.hasPrefix("#") { hex.removeFirst() }
        guard hex.count == 6, let value = UInt32(hex, radix: 16) else { return nil }
        let r = Double((value & 0xff0000) >> 16) / 255.0
        let g = Double((value & 0x00ff00) >> 8) / 255.0
        let b = Double(value & 0x0000ff) / 255.0
        self = Color(red: r, green: g, blue: b)
    }
}
