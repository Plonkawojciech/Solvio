import SwiftUI

/// Detail + edit + delete screen for a single expense.
///
/// Pulls the row out of `AppDataStore.expenses` (no dedicated
/// `/api/data/expenses/:id` endpoint exists, but the dashboard payload
/// already contains every recent expense — refetching the full list per
/// detail screen was the single biggest offender for "loading everywhere").
/// Receipt items, when present, are fetched on demand from
/// `ReceiptsRepo.detail` since the list endpoint omits the heavy `items`
/// jsonb.
struct ExpenseDetailView: View {
    let expenseId: String

    @EnvironmentObject private var router: AppRouter
    @EnvironmentObject private var toast: ToastCenter
    @EnvironmentObject private var locale: AppLocale
    @EnvironmentObject private var store: AppDataStore

    @State private var receiptItems: [ReceiptItem] = []
    @State private var loadingReceipt = false
    @State private var lastFetchedReceiptId: String? = nil
    @State private var showEdit = false
    @State private var showDelete = false
    /// Set to `true` the moment the user confirms delete. Used to suppress the
    /// "not found" error card that would otherwise flash between the
    /// optimistic remove (which makes `expense` nil) and the navigation pop.
    @State private var isDeleting = false

    private var expense: Expense? {
        store.expenses.first(where: { $0.id == expenseId })
    }
    private var categories: [Category] { store.categories }
    private var defaultCurrency: String {
        store.dashboard?.settings?.currency ?? "PLN"
    }
    private var categoryById: [String: Category] {
        Dictionary(uniqueKeysWithValues: categories.map { ($0.id, $0) })
    }
    private var isLoading: Bool { store.dashboardLoading && store.dashboard == nil }
    private var notFound: Bool {
        // Only treat as not-found once the store has loaded at least once.
        // While `isDeleting` is true the row was just removed optimistically;
        // we're about to pop, so don't render the "not found" card.
        store.dashboardLoadedAt != nil && expense == nil && !isDeleting
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Theme.Spacing.md) {
                if isLoading {
                    NBSkeletonHero()
                    NBSkeletonList(rows: 2)
                } else if notFound {
                    NBErrorCard(message: locale.t("expenseDetail.notFound")) {
                        Task { await store.awaitDashboard(force: true) }
                    }
                } else if let e = expense {
                    hero(e)
                    metaCard(e)
                    if let notes = e.notes, !notes.isEmpty { notesCard(notes) }
                    if let tags = e.tags, !tags.isEmpty { tagsCard(tags) }
                    if e.receiptId != nil { itemsCard(e) }
                    // Virtual-receipt + currency converter — only when
                    // there's a backing receipt to link to. The QR is
                    // basically a hand-off ramp ("scan this on your
                    // laptop") and the converter is for travelers /
                    // multi-currency users who keep one expense in PLN
                    // but want a glance at EUR/USD value.
                    if let rid = e.receiptId {
                        virtualReceiptTile(receiptId: rid)
                    }
                    converterTile(e)
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
        .task {
            store.ensureDashboard()
            await maybeLoadReceiptItems()
        }
        .refreshable {
            await store.awaitDashboard(force: true)
            await maybeLoadReceiptItems(force: true)
        }
        .onChange(of: expense?.receiptId) { _ in
            Task { await maybeLoadReceiptItems() }
        }
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button {
                    showEdit = true
                } label: {
                    Image(systemName: "pencil").foregroundColor(Theme.foreground)
                }
                .disabled(expense == nil)
            }
        }
        .sheet(isPresented: $showEdit) {
            if let e = expense {
                ExpenseEditSheet(expense: e, categories: categories) { payload in
                    Task {
                        do {
                            try await ExpensesRepo.update(payload)
                            toast.success(locale.t("toast.updated"))
                            store.didMutateExpenses()
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
                // Order matters here:
                //   1. Flip `isDeleting` so `notFound` stays false even after
                //      the optimistic remove drops the row.
                //   2. Pop FIRST — the user is already gone from the detail
                //      screen by the time the network call lands, so there's
                //      no chance of a "not found" flash.
                //   3. Optimistic remove from store (list view updates).
                //   4. Network DELETE; on failure, rollback via didMutateExpenses().
                isDeleting = true
                router.popToRoot()
                Task {
                    do {
                        store.removeExpensesOptimistic(ids: [expenseId])
                        try await ExpensesRepo.delete(ids: [expenseId])
                        toast.success(locale.t("expenseDetail.deleted"))
                        store.didMutateExpenses()
                    } catch {
                        store.didMutateExpenses() // rollback optimistic
                        toast.error(locale.t("toast.error"), description: error.localizedDescription)
                    }
                }
            }
        } message: {
            Text(locale.t("expenses.deleteConfirmMsg"))
        }
    }

    // MARK: - Receipt items loader

    private func maybeLoadReceiptItems(force: Bool = false) async {
        guard let receiptId = expense?.receiptId else {
            receiptItems = []
            lastFetchedReceiptId = nil
            return
        }
        if !force, lastFetchedReceiptId == receiptId, !receiptItems.isEmpty { return }
        loadingReceipt = true
        defer { loadingReceipt = false }
        do {
            let r = try await ReceiptsRepo.detail(id: receiptId)
            receiptItems = r.items ?? []
            lastFetchedReceiptId = receiptId
        } catch ApiError.cancelled {
            // SwiftUI cancelled the .task block when the view disappeared
            // mid-fetch — totally normal, not a failure. Skip the log.
        } catch {
            // Silent — we'll show the empty state. Toast on refresh failure
            // would be noisy if the user is just opening the detail.
            #if DEBUG
            print("[ExpenseDetailView] receipt items fetch failed: \(error)")
            #endif
        }
    }

    // MARK: - Sections

    private func hero(_ e: Expense) -> some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.xs) {
            NBEyebrow(text: locale.t("expenseDetail.amount").uppercased())
            Text(Fmt.amount(e.amount, currency: e.currency ?? defaultCurrency))
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
                if !receiptItems.isEmpty {
                    Text("\(receiptItems.count)")
                        .font(AppFont.mono(11))
                        .tracking(0.5)
                        .foregroundColor(Theme.mutedForeground)
                }
            }

            if loadingReceipt && receiptItems.isEmpty {
                HStack {
                    ProgressView().scaleEffect(0.8)
                    Text(locale.t("common.loading"))
                        .font(AppFont.caption)
                        .foregroundColor(Theme.mutedForeground)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            } else if receiptItems.isEmpty {
                Text(locale.t("expenseDetail.noItems"))
                    .font(AppFont.caption)
                    .foregroundColor(Theme.mutedForeground)
                    .frame(maxWidth: .infinity, alignment: .leading)
            } else {
                VStack(spacing: 0) {
                    ForEach(Array(receiptItems.enumerated()), id: \.offset) { idx, item in
                        itemRow(item, currency: e.currency ?? defaultCurrency)
                        if idx < receiptItems.count - 1 {
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

    // MARK: - Virtual receipt + converter tiles

    /// Public-receipt URL — same shape as `ReceiptDetailView.publicUrl`.
    private func receiptUrl(for receiptId: String) -> String {
        AppConfig.apiBaseURL
            .appendingPathComponent("receipt")
            .appendingPathComponent(receiptId)
            .absoluteString
    }

    /// Compact QR + open + copy tile for the linked receipt. Lets the
    /// user pop the e-receipt open on their laptop without navigating
    /// out of the expense detail flow.
    private func virtualReceiptTile(receiptId: String) -> some View {
        let url = receiptUrl(for: receiptId)
        return VirtualReceiptTile(
            url: url,
            eyebrow: locale.t("receiptDetail.eReceiptEyebrow"),
            title: locale.t("receiptDetail.eReceiptTitle"),
            openLabel: locale.t("receiptDetail.openInBrowser"),
            copyLabel: locale.t("receiptDetail.copyLink"),
            scanHint: locale.t("receiptDetail.scanHint"),
            onCopied: { toast.success(locale.t("receiptDetail.linkCopied")) }
        )
    }

    /// PLN/EUR/USD glance card for the expense amount. The expense
    /// already carries its own `currency` field; the converter just
    /// flips it into the other two so the user doesn't have to alt-tab
    /// to xe.com.
    private func converterTile(_ e: Expense) -> some View {
        let source = e.currency ?? defaultCurrency
        // Targets always include the source so the row shows up first
        // labelled as "źródło/source" — and we never display "—" for
        // the actual expense amount.
        let baseTargets = ["PLN", "EUR", "USD"]
        let targets = baseTargets.contains(source.uppercased())
            ? baseTargets
            : [source.uppercased()] + baseTargets
        return CurrencyConverterCard(
            amount: e.amount.double,
            sourceCurrency: source,
            targets: targets,
            eyebrow: locale.t("converter.eyebrow"),
            title: locale.t("converter.title"),
            asOfFmt: locale.t("converter.asOfFmt"),
            staticFallback: locale.t("converter.staticFallback"),
            sourceBadge: locale.t("converter.source")
        )
    }

    private var actionsCard: some View {
        VStack(spacing: Theme.Spacing.xs) {
            Button { showEdit = true } label: {
                Label(locale.t("common.edit"), systemImage: "pencil")
            }
            .buttonStyle(NBSecondaryButtonStyle())
            .disabled(expense == nil)

            Button { showDelete = true } label: {
                Label(locale.t("common.delete"), systemImage: "trash")
            }
            .buttonStyle(NBDestructiveButtonStyle())
            .disabled(expense == nil)
        }
    }

    // MARK: - Helpers

    private func categoryName(for e: Expense) -> String? {
        if let n = e.categoryName, !n.isEmpty { return n }
        if let id = e.categoryId, let c = categoryById[id] { return c.name }
        return nil
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
                                                        .stroke(Theme.border, lineWidth: Theme.Border.widthThin)
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
                                    .stroke(Theme.border, lineWidth: Theme.Border.widthThin)
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
