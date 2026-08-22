import SwiftUI

/// Potwierdzenie paragonu tuż po skanie.
///
/// OCR zapisuje paragon i wydatek od razu — dzięki temu nic nie ginie, gdy
/// użytkownik zamknie apkę w trakcie. Ten ekran jest korektą tego, co maszyna
/// odczytała: sklep, data, kwota i kategoria są edytowalne, pozycje i wykryte
/// promocje pokazujemy do wglądu, a „Odrzuć" kasuje wydatek razem z paragonem.
struct ReceiptReviewSheet: View {
    let review: ScanQueueManager.PendingReview

    @EnvironmentObject private var store: AppDataStore
    @EnvironmentObject private var locale: AppLocale
    @EnvironmentObject private var toast: ToastCenter
    @Environment(\.dismiss) private var dismiss

    @State private var merchant = ""
    @State private var amount = ""
    @State private var date = Date()
    @State private var categoryId: String?
    @State private var busy = false
    @State private var confirmDiscard = false

    private var parsedAmount: Double? {
        let normalized = amount.replacingOccurrences(of: ",", with: ".").trimmingCharacters(in: .whitespaces)
        guard let value = Double(normalized), value > 0 else { return nil }
        return value
    }

    /// Suma pozycji bywa różna od kwoty z paragonu — o promocje, kaucje albo
    /// źle odczytaną linię. Pokazujemy różnicę zamiast ją ukrywać.
    private var itemsSum: Double {
        review.items.reduce(0) { $0 + ($1.price ?? 0) }
    }

    private var mismatch: Double? {
        guard let total = parsedAmount, !review.items.isEmpty else { return nil }
        let diff = total - itemsSum
        return abs(diff) >= 0.02 ? diff : nil
    }

    var body: some View {
        NavigationStack {
            ZStack {
                PaperBackground()
                ScrollView {
                    VStack(alignment: .leading, spacing: Theme.Spacing.md) {
                        summaryCard
                        if !review.promotions.isEmpty { promotionsCard }
                        if !review.items.isEmpty { itemsCard }
                        categoryCard
                        discardButton
                    }
                    .padding(Theme.Spacing.md)
                    .padding(.bottom, Theme.Spacing.xl)
                }
            }
            .navigationTitle(locale.t("receipts.review"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button(locale.t("receipts.confirm")) { confirm() }
                        .fontWeight(.semibold)
                        .foregroundColor(parsedAmount != nil ? Theme.primary : Theme.mutedForeground)
                        .disabled(parsedAmount == nil || busy)
                }
            }
            .confirmationDialog(
                locale.t("receipts.discardConfirm"),
                isPresented: $confirmDiscard,
                titleVisibility: .visible
            ) {
                Button(locale.t("receipts.discard"), role: .destructive) { discard() }
                Button(locale.t("common.cancel"), role: .cancel) {}
            }
        }
        .onAppear(perform: prefill)
        .interactiveDismissDisabled(busy)
    }

    // MARK: - Podsumowanie

    private var summaryCard: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.sm) {
            SectionLabel(text: locale.t("receipts.scanned"))

            HStack(alignment: .firstTextBaseline, spacing: 6) {
                TextField("0,00", text: $amount)
                    .font(AppFont.hero)
                    .keyboardType(.decimalPad)
                Text(review.currency ?? store.currency)
                    .font(AppFont.sectionTitle)
                    .foregroundColor(Theme.mutedForeground)
            }

            if let saved = review.totalSaved, saved < 0 {
                HStack(spacing: 5) {
                    Image(systemName: "tag.fill")
                        .font(.system(size: 10))
                    Text(locale.t("receipts.savedOnPromos") + " " + Fmt.amount(abs(saved), currency: review.currency ?? store.currency))
                        .font(AppFont.captionMedium)
                }
                .foregroundColor(Theme.success)
            }

            if let diff = mismatch {
                Text(diff > 0
                     ? locale.t("receipts.mismatchOver") + " " + Fmt.amount(diff, currency: review.currency ?? store.currency)
                     : locale.t("receipts.mismatchUnder") + " " + Fmt.amount(-diff, currency: review.currency ?? store.currency))
                    .font(AppFont.caption)
                    .foregroundColor(Theme.warning)
                    .fixedSize(horizontal: false, vertical: true)
            }

            Divider().overlay(Theme.border)

            HStack(spacing: Theme.Spacing.sm) {
                Text(locale.t("expenses.vendor"))
                    .font(AppFont.captionMedium)
                    .foregroundColor(Theme.mutedForeground)
                    .frame(width: 76, alignment: .leading)
                TextField("—", text: $merchant)
                    .font(AppFont.body)
            }
            .padding(.vertical, 4)

            Divider().overlay(Theme.border)

            HStack(spacing: Theme.Spacing.sm) {
                Text(locale.t("expenses.date"))
                    .font(AppFont.captionMedium)
                    .foregroundColor(Theme.mutedForeground)
                    .frame(width: 76, alignment: .leading)
                DatePicker("", selection: $date, displayedComponents: .date).labelsHidden()
                Spacer()
            }
            .padding(.vertical, 2)
        }
        .padding(Theme.Spacing.md)
        .frame(maxWidth: .infinity, alignment: .leading)
        .paperCard()
    }

    // MARK: - Promocje

    private var promotionsCard: some View {
        PaperCard(label: locale.t("receipts.promotions")) {
            VStack(spacing: 0) {
                ForEach(Array(review.promotions.enumerated()), id: \.offset) { index, promo in
                    HStack(spacing: Theme.Spacing.sm) {
                        Image(systemName: "tag")
                            .font(.system(size: 11))
                            .foregroundColor(Theme.success)
                        Text(promo.label)
                            .font(AppFont.caption)
                            .foregroundColor(Theme.foreground)
                            .lineLimit(2)
                        Spacer(minLength: Theme.Spacing.sm)
                        if let value = promo.amount {
                            Text(Fmt.amount(value, currency: review.currency ?? store.currency))
                                .font(AppFont.mono(11))
                                .foregroundColor(Theme.success)
                        }
                    }
                    .padding(.vertical, 7)
                    if index < review.promotions.count - 1 {
                        Divider().overlay(Theme.border)
                    }
                }
            }
        }
    }

    // MARK: - Pozycje

    private var itemsCard: some View {
        PaperCard(
            title: locale.pluralized("receipts.itemsCount", count: review.items.count),
            label: locale.t("receipts.items")
        ) {
            VStack(spacing: 0) {
                ForEach(Array(review.items.enumerated()), id: \.offset) { index, item in
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
                        Text(Fmt.amount(item.price ?? 0, currency: review.currency ?? store.currency))
                            .font(AppFont.mono(11))
                            .foregroundColor(Theme.foreground)
                    }
                    .padding(.vertical, 7)
                    if index < review.items.count - 1 {
                        Divider().overlay(Theme.border)
                    }
                }
                Divider().overlay(Theme.border)
                HStack {
                    Text(locale.t("receipts.itemsSum"))
                        .font(AppFont.captionMedium)
                        .foregroundColor(Theme.mutedForeground)
                    Spacer()
                    Text(Fmt.amount(itemsSum, currency: review.currency ?? store.currency))
                        .font(AppFont.mono(12))
                        .foregroundColor(Theme.foreground)
                }
                .padding(.top, 9)
            }
        }
    }

    // MARK: - Kategoria

    private var categoryCard: some View {
        PaperCard(label: locale.t("expenses.category")) {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 6) {
                    ForEach(store.categories) { category in
                        Button {
                            Haptics.selection()
                            categoryId = categoryId == category.id ? nil : category.id
                        } label: {
                            Text(category.name)
                                .font(AppFont.captionMedium)
                                .foregroundColor(categoryId == category.id ? Theme.primaryForeground : Theme.mutedForeground)
                                .padding(.horizontal, 11)
                                .padding(.vertical, 6)
                                .background(categoryId == category.id ? Theme.primary : Theme.muted)
                                .clipShape(Capsule())
                        }
                    }
                }
            }
        }
    }

    private var discardButton: some View {
        Button(locale.t("receipts.discard")) { confirmDiscard = true }
            .font(AppFont.captionMedium)
            .foregroundColor(Theme.destructive)
            .frame(maxWidth: .infinity)
            .padding(.top, Theme.Spacing.xs)
    }

    // MARK: - Dane

    private func prefill() {
        merchant = review.merchant ?? ""
        if let total = review.total {
            amount = String(format: "%.2f", total).replacingOccurrences(of: ".", with: ",")
        }
        let f = DateFormatter()
        f.dateFormat = "yyyy-MM-dd"
        if let raw = review.date, let parsed = f.date(from: String(raw.prefix(10))) {
            date = parsed
        }
        // Kategorię proponuje backend (najczęstsza wśród pozycji paragonu);
        // czytamy ją z już zapisanego wydatku, żeby chip był zaznaczony.
        categoryId = store.expenses.first { $0.id == review.expenseId }?.categoryId
    }

    private func confirm() {
        guard let value = parsedAmount, let expenseId = review.expenseId else {
            // Brak `expenseId` znaczy, że backend jest starszy niż ta wersja
            // apki. Paragon i tak jest zapisany — zamykamy bez edycji.
            Log.warn(.scan, "potwierdzenie bez expenseId — pomijam edycję")
            dismiss()
            return
        }
        busy = true
        let f = DateFormatter()
        f.dateFormat = "yyyy-MM-dd"
        let ymd = f.string(from: date)
        let cleanMerchant = merchant.trimmingCharacters(in: .whitespaces)

        Task {
            defer { busy = false }
            do {
                try await ExpensesRepo.update(ExpenseUpdate(
                    id: expenseId,
                    title: cleanMerchant.isEmpty ? locale.t("receipts.title") : cleanMerchant,
                    amount: String(format: "%.2f", value),
                    date: ymd,
                    categoryId: categoryId,
                    vendor: cleanMerchant.isEmpty ? nil : cleanMerchant,
                    notes: nil,
                    tags: nil,
                    receiptId: review.receiptId
                ))
                store.didMutateExpenses()
                toast.success(locale.t("receipts.confirmed"))
                dismiss()
            } catch {
                Log.error(.scan, "nie udało się zapisać poprawek paragonu", error)
                toast.error(locale.t("common.error"))
            }
        }
    }

    /// Odrzucenie kasuje wydatek ORAZ paragon. Zostawienie samego paragonu
    /// dawałoby sierotę, której nie widać na żadnym z dwóch ekranów.
    private func discard() {
        busy = true
        Task {
            defer { busy = false }
            if let expenseId = review.expenseId {
                try? await ExpensesRepo.delete(ids: [expenseId])
            }
            do {
                try await ReceiptsRepo.delete(id: review.receiptId)
            } catch {
                Log.error(.scan, "nie udało się usunąć paragonu \(review.receiptId)", error)
            }
            store.didMutateExpenses()
            toast.info(locale.t("receipts.discarded"))
            dismiss()
        }
    }
}
