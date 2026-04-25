import SwiftUI

/// Expense browser with search, category + date-range filters, vendor + amount
/// filters, sort presets with direction indicators, batch selection + delete,
/// and top Scan Receipt / Add Expense CTAs. Mirrors PWA `/expenses`.
///
/// **Reads from `AppDataStore.dashboard.expenses`** — the dashboard payload is
/// the single source of truth for expenses + categories + settings, so this
/// screen no longer issues its own `/api/data/expenses` request. Tab switches
/// to this view are now instant when the dashboard is warm.
struct ExpensesListView: View {
    @EnvironmentObject private var router: AppRouter
    @EnvironmentObject private var toast: ToastCenter
    @EnvironmentObject private var locale: AppLocale
    @EnvironmentObject private var store: AppDataStore

    // MARK: - Filter / sort UI state (was on the old view-model)

    @State private var search: String = ""
    @State private var dateRange: DateRange = .all
    @State private var categoryFilter: String? = nil
    @State private var sortField: SortField = .date
    @State private var sortDir: SortDir = .desc
    @State private var amountFrom: String = ""
    @State private var amountTo: String = ""
    @State private var vendorFilter: String = ""
    @State private var selectedIds: Set<String> = []

    // MARK: - Sheet / alert state

    @State private var showCreate = false
    @State private var pendingDelete: Expense?
    @State private var showBulkDeleteConfirm = false
    @State private var activePanel: TopPanel = .none

    /// Undo-window task for delete commits. Holding it on the view lets the
    /// undo button cancel the in-flight commit; bulk + swipe-delete share the
    /// same slot so a second delete supersedes the first.
    @State private var pendingDeleteCommit: Task<Void, Never>? = nil

    enum TopPanel { case none, filters, sort }
    enum DateRange: Hashable { case all, thisMonth, last30, thisYear }
    enum SortField: Hashable { case date, amount, title, vendor }
    enum SortDir: Hashable { case asc, desc }

    // MARK: - Derived state pulled from the store

    private var expenses: [Expense] { store.expenses }
    private var categories: [Category] { store.categories }
    private var defaultCurrency: String { store.currency }
    private var isLoading: Bool { store.dashboardLoading }
    private var errorMessage: String? { store.dashboardError }

    private var categoryById: [String: Category] {
        Dictionary(uniqueKeysWithValues: categories.map { ($0.id, $0) })
    }

    var body: some View {
        List {
            Section {
                VStack(alignment: .leading, spacing: Theme.Spacing.md) {
                    header
                    bulkDeleteBar
                    searchBar
                    toolbarRow
                    expandedPanel
                }
                .padding(.horizontal, Theme.Spacing.md)
                .padding(.top, Theme.Spacing.md)
                .padding(.bottom, Theme.Spacing.xs)
            }
            .listRowBackground(Color.clear)
            .listRowSeparator(.hidden)
            .listRowInsets(EdgeInsets())

            content
        }
        .listStyle(.plain)
        .scrollContentBackground(.hidden)
        .background(Theme.background)
        .refreshable { await store.awaitDashboard(force: true) }
        .task { store.ensureDashboard() }
        .animation(.nbSpring, value: activePanel)
        .animation(.nbSpring, value: selectedIds)
        .sheet(isPresented: $showCreate) {
            ExpenseCreateSheet(categories: categories) { payload in
                Task {
                    do {
                        _ = try await ExpensesRepo.create(payload)
                        toast.success(locale.t("toast.created"))
                        store.didMutateExpenses()
                    } catch {
                        toast.error(locale.t("toast.error"), description: error.localizedDescription)
                    }
                }
            }
            .environmentObject(locale)
        }
        .alert(
            locale.t("expenses.confirmDelete"),
            isPresented: Binding(
                get: { pendingDelete != nil },
                set: { if !$0 { pendingDelete = nil } }
            ),
            presenting: pendingDelete
        ) { e in
            Button(locale.t("common.cancel"), role: .cancel) {}
            Button(locale.t("common.delete"), role: .destructive) {
                // Snapshot the row, drop it locally, schedule the commit
                // behind a 5 s undo toast — same pattern as bulk delete.
                let snapshot = [e]
                store.removeExpensesOptimistic(ids: [e.id])
                scheduleDeleteCommit(ids: [e.id], snapshot: snapshot)
            }
        } message: { _ in
            Text(locale.t("expenses.deleteConfirmMsg"))
        }
        .alert(
            locale.t("expenses.confirmBulkDelete"),
            isPresented: $showBulkDeleteConfirm
        ) {
            Button(locale.t("common.cancel"), role: .cancel) {}
            Button(locale.t("common.delete"), role: .destructive) {
                Task { await performBulkDelete() }
            }
        } message: {
            Text(locale.t("expenses.confirmBulkDeleteDesc"))
        }
    }

    private var header: some View {
        NBScreenHeader(
            eyebrow: locale.t("expenses.eyebrow"),
            title: locale.t("expenses.title"),
            subtitle: "\(visible.count) \(locale.t("dashboard.transactions"))"
        )
    }

    // MARK: - Bulk selection bar

    @ViewBuilder
    private var bulkDeleteBar: some View {
        if !selectedIds.isEmpty {
            HStack(spacing: Theme.Spacing.xs) {
                Text("\(selectedIds.count) \(locale.t("expenses.selectionMode"))")
                    .font(AppFont.mono(11))
                    .tracking(0.5)
                    .textCase(.uppercase)
                    .foregroundColor(Theme.mutedForeground)
                Spacer()
                Button(locale.t("expenses.deselectAll")) {
                    selectedIds.removeAll()
                }
                .buttonStyle(.plain)
                .font(AppFont.mono(11))
                .tracking(0.5)
                .textCase(.uppercase)
                .foregroundColor(Theme.foreground)
                .padding(.horizontal, 10)
                .padding(.vertical, 8)
                .background(Theme.card)
                .overlay(
                    RoundedRectangle(cornerRadius: Theme.Radius.sm)
                        .stroke(Theme.foreground, lineWidth: Theme.Border.widthThin)
                )
                .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.sm))

                Button {
                    showBulkDeleteConfirm = true
                } label: {
                    HStack(spacing: 4) {
                        Image(systemName: "trash")
                        Text("\(locale.t("expenses.deleteSelected")) (\(selectedIds.count))")
                    }
                    .font(AppFont.mono(11))
                    .tracking(0.5)
                    .textCase(.uppercase)
                    .foregroundColor(Theme.background)
                    .padding(.horizontal, 10)
                    .padding(.vertical, 8)
                    .background(Theme.destructive)
                    .overlay(
                        RoundedRectangle(cornerRadius: Theme.Radius.sm)
                            .stroke(Theme.destructive, lineWidth: Theme.Border.widthThin)
                    )
                    .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.sm))
                }
                .buttonStyle(.plain)
            }
            .padding(Theme.Spacing.sm)
            .nbCard(radius: Theme.Radius.md, shadow: Theme.Shadow.sm)
        }
    }

    private var searchBar: some View {
        HStack(spacing: Theme.Spacing.xs) {
            Image(systemName: "magnifyingglass")
                .foregroundColor(Theme.mutedForeground)
            TextField(locale.t("expenses.searchPlaceholder"), text: $search)
                .font(AppFont.body)
                .autocorrectionDisabled()
                .textInputAutocapitalization(.never)
            if !search.isEmpty {
                Button { search = "" } label: {
                    Image(systemName: "xmark.circle.fill")
                        .foregroundColor(Theme.mutedForeground)
                }
            }
        }
        .padding(.horizontal, Theme.Spacing.md)
        .frame(height: 44)
        .background(Theme.card)
        .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.md))
        .overlay(
            RoundedRectangle(cornerRadius: Theme.Radius.md)
                .stroke(Theme.foreground, lineWidth: Theme.Border.widthThin)
        )
    }

    // MARK: - Collapsible Filter + Sort toolbar

    private var toolbarRow: some View {
        HStack(spacing: Theme.Spacing.xs) {
            toolbarButton(
                icon: "line.3.horizontal.decrease.circle",
                label: locale.t("expenses.filters"),
                isActive: activePanel == .filters,
                hasIndicator: hasActiveFilters
            ) {
                activePanel = (activePanel == .filters) ? .none : .filters
            }
            toolbarButton(
                icon: "arrow.up.arrow.down",
                label: locale.t("expenses.sortBy"),
                isActive: activePanel == .sort,
                hasIndicator: false
            ) {
                activePanel = (activePanel == .sort) ? .none : .sort
            }
        }
    }

    private func toolbarButton(
        icon: String,
        label: String,
        isActive: Bool,
        hasIndicator: Bool,
        action: @escaping () -> Void
    ) -> some View {
        Button(action: action) {
            HStack(spacing: 6) {
                Image(systemName: icon)
                    .font(.system(size: 13, weight: .medium))
                Text(label)
                    .font(AppFont.mono(11))
                    .tracking(0.5)
                    .textCase(.uppercase)
                if hasIndicator {
                    Circle()
                        .fill(Theme.accent)
                        .frame(width: 6, height: 6)
                        .overlay(Circle().stroke(Theme.foreground, lineWidth: Theme.Border.widthThin))
                }
                Image(systemName: isActive ? "chevron.up" : "chevron.down")
                    .font(.system(size: 9, weight: .bold))
            }
            .frame(maxWidth: .infinity)
            .foregroundColor(isActive ? Theme.background : Theme.foreground)
            .padding(.horizontal, Theme.Spacing.sm)
            .frame(height: 38)
            .background(isActive ? Theme.foreground : Theme.card)
            .overlay(
                RoundedRectangle(cornerRadius: Theme.Radius.md)
                    .stroke(Theme.foreground, lineWidth: Theme.Border.widthThin)
            )
            .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.md))
        }
        .buttonStyle(.plain)
    }

    private var hasActiveFilters: Bool {
        dateRange != .all
            || categoryFilter != nil
            || !amountFrom.isEmpty
            || !amountTo.isEmpty
            || !vendorFilter.isEmpty
    }

    @ViewBuilder
    private var expandedPanel: some View {
        switch activePanel {
        case .filters: filtersPanel
        case .sort: sortPanel
        case .none: EmptyView()
        }
    }

    private var filtersPanel: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.sm) {
            panelSectionLabel(locale.t("expenses.sortDate").uppercased())
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 6) {
                    dateChip(.all, label: locale.t("expenses.allTime"))
                    dateChip(.thisMonth, label: locale.t("expenses.thisMonth"))
                    dateChip(.last30, label: locale.t("expenses.last30"))
                    dateChip(.thisYear, label: locale.t("expenses.thisYear"))
                }
            }

            if !categories.isEmpty {
                panelSectionLabel(locale.t("expenses.category").uppercased())
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 6) {
                        categoryChip(id: nil, label: locale.t("expenses.allCategories"))
                        ForEach(categories) { c in
                            categoryChip(id: c.id, label: c.name)
                        }
                    }
                }
            }

            panelSectionLabel(locale.t("common.amount").uppercased())
            amountRangeRow

            panelSectionLabel(locale.t("expenses.vendor").uppercased())
            vendorFilterRow

            if hasActiveFilters {
                Button {
                    dateRange = .all
                    categoryFilter = nil
                    amountFrom = ""
                    amountTo = ""
                    vendorFilter = ""
                } label: {
                    HStack(spacing: 4) {
                        Image(systemName: "xmark.circle")
                        Text(locale.t("expenses.clearFilters"))
                    }
                    .font(AppFont.mono(10))
                    .tracking(0.5)
                    .textCase(.uppercase)
                    .foregroundColor(Theme.mutedForeground)
                    .padding(.top, Theme.Spacing.xxs)
                }
                .buttonStyle(.plain)
            }
        }
        .padding(Theme.Spacing.sm)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Theme.card)
        .overlay(
            RoundedRectangle(cornerRadius: Theme.Radius.md)
                .stroke(Theme.foreground, lineWidth: Theme.Border.widthThin)
        )
        .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.md))
        .transition(.opacity.combined(with: .move(edge: .top)))
    }

    private var sortPanel: some View {
        VStack(spacing: 0) {
            sortOptionRow(.date, label: locale.t("expenses.sortDate"))
            Divider().background(Theme.foreground.opacity(0.15))
            sortOptionRow(.amount, label: locale.t("expenses.sortAmount"))
            Divider().background(Theme.foreground.opacity(0.15))
            sortOptionRow(.title, label: locale.t("expenses.sortTitle"))
            Divider().background(Theme.foreground.opacity(0.15))
            sortOptionRow(.vendor, label: locale.t("expenses.sortVendor"))
        }
        .background(Theme.card)
        .overlay(
            RoundedRectangle(cornerRadius: Theme.Radius.md)
                .stroke(Theme.foreground, lineWidth: Theme.Border.widthThin)
        )
        .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.md))
        .transition(.opacity.combined(with: .move(edge: .top)))
    }

    private func sortOptionRow(
        _ field: SortField,
        label: String
    ) -> some View {
        let active = sortField == field
        let arrow = active ? (sortDir == .asc ? "chevron.up" : "chevron.down") : ""
        return Button {
            toggleSort(field)
        } label: {
            HStack(spacing: 8) {
                Text(label)
                    .font(AppFont.bodyMedium)
                    .foregroundColor(Theme.foreground)
                Spacer()
                if active {
                    Text(sortDir == .asc ? locale.t("expenses.sortAsc") : locale.t("expenses.sortDesc"))
                        .font(AppFont.mono(10))
                        .tracking(0.5)
                        .textCase(.uppercase)
                        .foregroundColor(Theme.mutedForeground)
                    Image(systemName: arrow)
                        .font(.system(size: 12, weight: .bold))
                        .foregroundColor(Theme.foreground)
                }
            }
            .padding(.horizontal, Theme.Spacing.md)
            .frame(height: 44)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(active ? Theme.accent.opacity(0.3) : Color.clear)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    private func panelSectionLabel(_ text: String) -> some View {
        Text(text)
            .font(AppFont.mono(10))
            .tracking(1)
            .foregroundColor(Theme.mutedForeground)
    }

    // MARK: - Amount range filter

    /// True when both bounds parse and `from > to` — a never-matching range.
    private var amountRangeInverted: Bool {
        let fromV = Double(amountFrom.replacingOccurrences(of: ",", with: "."))
        let toV   = Double(amountTo.replacingOccurrences(of: ",", with: "."))
        guard let f = fromV, let t = toV else { return false }
        return f > t
    }

    private var amountRangeRow: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(spacing: Theme.Spacing.xs) {
                TextField(locale.t("expenses.amountFrom"), text: $amountFrom)
                    .keyboardType(.decimalPad)
                    .font(AppFont.body)
                    .padding(.horizontal, Theme.Spacing.sm)
                    .frame(height: 40)
                    .background(Theme.card)
                    .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.md))
                    .overlay(
                        RoundedRectangle(cornerRadius: Theme.Radius.md)
                            .stroke(amountRangeInverted ? Theme.destructive : Theme.foreground, lineWidth: Theme.Border.widthThin)
                    )
                Text("–")
                    .font(AppFont.body)
                    .foregroundColor(Theme.mutedForeground)
                TextField(locale.t("expenses.amountTo"), text: $amountTo)
                    .keyboardType(.decimalPad)
                    .font(AppFont.body)
                    .padding(.horizontal, Theme.Spacing.sm)
                    .frame(height: 40)
                    .background(Theme.card)
                    .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.md))
                    .overlay(
                        RoundedRectangle(cornerRadius: Theme.Radius.md)
                            .stroke(amountRangeInverted ? Theme.destructive : Theme.foreground, lineWidth: Theme.Border.widthThin)
                    )
                if !amountFrom.isEmpty || !amountTo.isEmpty {
                    Button {
                        amountFrom = ""
                        amountTo = ""
                    } label: {
                        Image(systemName: "xmark.circle.fill")
                            .foregroundColor(Theme.mutedForeground)
                    }
                    .buttonStyle(.plain)
                }
            }
            if amountRangeInverted {
                HStack(spacing: 4) {
                    Image(systemName: "exclamationmark.circle.fill")
                        .font(.system(size: 11))
                        .foregroundColor(Theme.destructive)
                    Text(locale.t("validation.amountRange"))
                        .font(AppFont.caption)
                        .foregroundColor(Theme.destructive)
                }
            }
        }
    }

    // MARK: - Vendor filter

    private var vendorFilterRow: some View {
        HStack(spacing: Theme.Spacing.xs) {
            Image(systemName: "building.2")
                .foregroundColor(Theme.mutedForeground)
            TextField(locale.t("expenses.vendorPlaceholder"), text: $vendorFilter)
                .font(AppFont.body)
                .autocorrectionDisabled()
                .textInputAutocapitalization(.never)
            if !vendorFilter.isEmpty {
                Button { vendorFilter = "" } label: {
                    Image(systemName: "xmark.circle.fill")
                        .foregroundColor(Theme.mutedForeground)
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.horizontal, Theme.Spacing.md)
        .frame(height: 40)
        .background(Theme.card)
        .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.md))
        .overlay(
            RoundedRectangle(cornerRadius: Theme.Radius.md)
                .stroke(Theme.foreground, lineWidth: Theme.Border.widthThin)
        )
    }

    private func dateChip(_ range: DateRange, label: String) -> some View {
        Button { dateRange = range } label: {
            chipStyled(label, active: dateRange == range)
        }
        .buttonStyle(.plain)
    }

    private func categoryChip(id: String?, label: String) -> some View {
        Button { categoryFilter = id } label: {
            chipStyled(label, active: categoryFilter == id)
        }
        .buttonStyle(.plain)
    }

    private func chipStyled(_ label: String, active: Bool) -> some View {
        Text(label)
            .font(AppFont.mono(11))
            .tracking(0.5)
            .textCase(.uppercase)
            .padding(.horizontal, 10)
            .padding(.vertical, 8)
            .foregroundColor(active ? Theme.background : Theme.foreground)
            .background(active ? Theme.foreground : Theme.card)
            .overlay(
                RoundedRectangle(cornerRadius: Theme.Radius.sm)
                    .stroke(Theme.foreground, lineWidth: Theme.Border.widthThin)
            )
            .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.sm))
    }

    @ViewBuilder
    private var content: some View {
        if isLoading && expenses.isEmpty {
            Section {
                NBSkeletonList(rows: 6)
                    .padding(.horizontal, Theme.Spacing.md)
            }
            .listRowBackground(Color.clear)
            .listRowSeparator(.hidden)
            .listRowInsets(EdgeInsets())
        } else if let message = errorMessage, expenses.isEmpty {
            Section {
                NBErrorCard(message: message) {
                    Task { await store.awaitDashboard(force: true) }
                }
                .padding(.horizontal, Theme.Spacing.md)
            }
            .listRowBackground(Color.clear)
            .listRowSeparator(.hidden)
            .listRowInsets(EdgeInsets())
        } else if visible.isEmpty {
            Section {
                NBEmptyState(
                    systemImage: "tray",
                    title: search.isEmpty ? locale.t("expenses.noExpensesUpper") : locale.t("common.empty"),
                    subtitle: search.isEmpty ? locale.t("expenses.addFirst") : locale.t("expenses.clearFilters"),
                    action: search.isEmpty ? (label: locale.t("expenses.newExpense"), run: { showCreate = true }) : nil
                )
                .padding(.horizontal, Theme.Spacing.md)
            }
            .listRowBackground(Color.clear)
            .listRowSeparator(.hidden)
            .listRowInsets(EdgeInsets())
        } else {
            Section {
                ForEach(visible) { e in
                    row(e)
                        .listRowBackground(Color.clear)
                        .listRowSeparator(.hidden)
                        .listRowInsets(EdgeInsets(
                            top: Theme.Spacing.xxs,
                            leading: Theme.Spacing.md,
                            bottom: Theme.Spacing.xxs,
                            trailing: Theme.Spacing.md
                        ))
                        .swipeActions(edge: .trailing, allowsFullSwipe: true) {
                            Button(role: .destructive) {
                                pendingDelete = e
                            } label: {
                                Label(locale.t("common.delete"), systemImage: "trash")
                            }
                        }
                }
            }
            Section {
                Color.clear.frame(height: 32)
            }
            .listRowBackground(Color.clear)
            .listRowSeparator(.hidden)
            .listRowInsets(EdgeInsets())
        }
    }

    private func row(_ e: Expense) -> some View {
        let isSelected = selectedIds.contains(e.id)
        let selectionActive = !selectedIds.isEmpty
        return Button {
            if selectionActive {
                toggleSelection(e.id)
            } else {
                router.push(.expenseDetail(id: e.id))
            }
        } label: {
            HStack(spacing: Theme.Spacing.sm) {
                if selectionActive {
                    Image(systemName: isSelected ? "checkmark.square.fill" : "square")
                        .font(.system(size: 20))
                        .foregroundColor(isSelected ? Theme.foreground : Theme.mutedForeground)
                } else {
                    NBIconBadge(systemImage: iconName(for: e))
                }
                VStack(alignment: .leading, spacing: 2) {
                    HStack(spacing: 6) {
                        Text(e.title)
                            .font(AppFont.bodyMedium)
                            .foregroundColor(Theme.foreground)
                            .lineLimit(1)
                        if e.isRecurring == true {
                            Text(locale.t("expenses.recurring").uppercased())
                                .font(AppFont.mono(9))
                                .tracking(0.5)
                                .padding(.horizontal, 5)
                                .padding(.vertical, 2)
                                .background(Theme.info.opacity(0.15))
                                .foregroundColor(Theme.info)
                                .overlay(
                                    RoundedRectangle(cornerRadius: Theme.Radius.sm)
                                        .stroke(Theme.info, lineWidth: 1)
                                )
                                .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.sm))
                        }
                    }
                    HStack(spacing: 6) {
                        if let name = categoryName(for: e) {
                            Text(name)
                            Text("·")
                        }
                        Text(Fmt.dayMonth(e.date))
                    }
                    .font(AppFont.caption)
                    .foregroundColor(Theme.mutedForeground)
                }
                Spacer()
                Text(Fmt.amount(e.amount, currency: e.currency ?? defaultCurrency))
                    .font(AppFont.bodyMedium)
                    .foregroundColor(Theme.foreground)
            }
            .padding(Theme.Spacing.sm)
            .nbCard(radius: Theme.Radius.md, shadow: Theme.Shadow.sm)
            .overlay(
                RoundedRectangle(cornerRadius: Theme.Radius.md)
                    .stroke(isSelected ? Theme.foreground : Color.clear, lineWidth: 2)
            )
        }
        .buttonStyle(.plain)
        .simultaneousGesture(
            LongPressGesture(minimumDuration: 0.4).onEnded { _ in
                toggleSelection(e.id)
            }
        )
        .contextMenu {
            Button {
                toggleSelection(e.id)
            } label: {
                Label(
                    isSelected ? locale.t("expenses.deselectAll") : locale.t("expenses.selectionMode"),
                    systemImage: isSelected ? "checkmark.square" : "square"
                )
            }
            Button(role: .destructive) {
                pendingDelete = e
            } label: {
                Label(locale.t("common.delete"), systemImage: "trash")
            }
        }
    }

    // MARK: - Selection helpers

    private func toggleSelection(_ id: String) {
        if selectedIds.contains(id) { selectedIds.remove(id) } else { selectedIds.insert(id) }
    }

    private func toggleSort(_ field: SortField) {
        if sortField == field {
            sortDir = (sortDir == .asc) ? .desc : .asc
        } else {
            sortField = field
            sortDir = (field == .date) ? .desc : .asc
        }
    }

    private func performBulkDelete() async {
        let ids = Array(selectedIds)
        guard !ids.isEmpty else { return }
        let idSet = Set(ids)
        // Snapshot for the undo window — we don't want to recreate via API,
        // we just defer the destructive call until the toast expires.
        let snapshot = expenses.filter { idSet.contains($0.id) }
        selectedIds.removeAll()
        store.removeExpensesOptimistic(ids: idSet)
        scheduleDeleteCommit(ids: ids, snapshot: snapshot)
    }

    /// Show a 5 s undo toast and defer the destructive `ExpensesRepo.delete`
    /// to the end of the window. Tapping undo cancels the task and restores
    /// the snapshot. Used by both bulk-delete and swipe-delete.
    private func scheduleDeleteCommit(ids: [String], snapshot: [Expense]) {
        // Cancel any earlier commit so a rapid second delete supersedes
        // the first one (the first batch becomes permanent immediately).
        pendingDeleteCommit?.cancel()

        let label = snapshot.count == 1
            ? locale.t("common.itemDeleted")
            : "\(snapshot.count) \(locale.t("common.itemsDeleted"))"

        toast.undoable(label, undoLabel: locale.t("common.undo")) {
            pendingDeleteCommit?.cancel()
            pendingDeleteCommit = nil
            store.restoreExpensesOptimistic(snapshot)
        }

        pendingDeleteCommit = Task {
            // Sleep matches the toast's 5 s undo window. If the user taps
            // undo, the task is cancelled before this returns.
            try? await Task.sleep(nanoseconds: 5_000_000_000)
            if Task.isCancelled { return }
            do {
                try await ExpensesRepo.delete(ids: ids)
                store.didMutateExpenses()
            } catch {
                // Server-side delete failed AFTER the user passed up undo.
                // Put the rows back and tell them.
                await MainActor.run {
                    store.restoreExpensesOptimistic(snapshot)
                    toast.error(locale.t("toast.error"), description: error.localizedDescription)
                }
            }
            pendingDeleteCommit = nil
        }
    }

    private func iconName(for e: Expense) -> String {
        if let icon = e.categoryIcon, !icon.isEmpty { return icon }
        if let id = e.categoryId, let c = categoryById[id], let icon = c.icon, !icon.isEmpty { return icon }
        return e.receiptId != nil ? "doc.text" : "creditcard"
    }

    private func categoryName(for e: Expense) -> String? {
        if let n = e.categoryName, !n.isEmpty { return n }
        if let id = e.categoryId, let c = categoryById[id] { return c.name }
        return nil
    }

    // MARK: - Filtered + sorted view of the expenses

    /// Mirrors the old `ExpensesListViewModel.visible` but pulls from
    /// `store.expenses` so updates propagate the moment the store
    /// publishes a new dashboard payload.
    private var visible: [Expense] {
        let q = search.lowercased().trimmingCharacters(in: .whitespacesAndNewlines)
        let vq = vendorFilter.lowercased().trimmingCharacters(in: .whitespacesAndNewlines)
        let minAmt = Double(amountFrom.replacingOccurrences(of: ",", with: "."))
        let maxAmt = Double(amountTo.replacingOccurrences(of: ",", with: "."))
        let filtered = expenses.filter { e in
            if let cf = categoryFilter, e.categoryId != cf { return false }
            if !isWithinRange(e.date) { return false }
            if let minV = minAmt, e.amount.double < minV { return false }
            if let maxV = maxAmt, e.amount.double > maxV { return false }
            if !vq.isEmpty {
                let v = (e.vendor ?? "").lowercased()
                if !v.contains(vq) { return false }
            }
            if q.isEmpty { return true }
            if e.title.lowercased().contains(q) { return true }
            if let v = e.vendor?.lowercased(), v.contains(q) { return true }
            if let n = e.notes?.lowercased(), n.contains(q) { return true }
            if let cn = e.categoryName?.lowercased(), cn.contains(q) { return true }
            if let tags = e.tags, tags.contains(where: { $0.lowercased().contains(q) }) { return true }
            return false
        }
        return filtered.sorted { lhs, rhs in
            let cmp: Int
            switch sortField {
            case .date:
                let ld = String(lhs.date.prefix(10))
                let rd = String(rhs.date.prefix(10))
                if ld != rd {
                    cmp = ld < rd ? -1 : 1
                } else {
                    let lc = lhs.createdAt ?? ""
                    let rc = rhs.createdAt ?? ""
                    cmp = lc == rc ? 0 : (lc < rc ? -1 : 1)
                }
            case .amount:
                let ld = lhs.amount.double
                let rd = rhs.amount.double
                cmp = ld == rd ? 0 : (ld < rd ? -1 : 1)
            case .title:
                cmp = lhs.title.localizedCaseInsensitiveCompare(rhs.title).rawValue
            case .vendor:
                let lv = lhs.vendor ?? ""
                let rv = rhs.vendor ?? ""
                cmp = lv.localizedCaseInsensitiveCompare(rv).rawValue
            }
            return sortDir == .asc ? cmp < 0 : cmp > 0
        }
    }

    private func isWithinRange(_ iso: String) -> Bool {
        switch dateRange {
        case .all:
            return true
        case .thisMonth:
            let prefix = String(iso.prefix(7)) // yyyy-MM
            let currentMonth = Self.monthFormatter.string(from: Date())
            return prefix == currentMonth
        case .last30:
            guard let d = Self.dateFromIso(iso) else { return false }
            return d >= Date().addingTimeInterval(-30 * 24 * 60 * 60)
        case .thisYear:
            let prefix = String(iso.prefix(4))
            let currentYear = Self.yearFormatter.string(from: Date())
            return prefix == currentYear
        }
    }

    private static let monthFormatter: DateFormatter = {
        let f = DateFormatter()
        f.dateFormat = "yyyy-MM"
        return f
    }()

    private static let yearFormatter: DateFormatter = {
        let f = DateFormatter()
        f.dateFormat = "yyyy"
        return f
    }()

    private static func dateFromIso(_ iso: String) -> Date? {
        let df = DateFormatter()
        df.dateFormat = "yyyy-MM-dd"
        return df.date(from: String(iso.prefix(10)))
    }
}

// MARK: - Create sheet

struct ExpenseCreateSheet: View {
    let categories: [Category]
    let onSubmit: (ExpenseCreate) -> Void
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var locale: AppLocale

    @State private var title = ""
    @State private var amount = ""
    @State private var vendor = ""
    @State private var notes = ""
    @State private var tagsText = ""
    @State private var date = Date()
    @State private var selectedCategoryId: String? = nil
    @StateObject private var fallback = CategoryPickerVM()

    private var availableCategories: [Category] {
        categories.isEmpty ? fallback.categories : categories
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: Theme.Spacing.md) {
                    NBTextField(label: locale.t("expenses.title.label"), text: $title, placeholder: locale.t("expenses.titlePlaceholder"))
                    NBTextField(label: locale.t("common.amount"), text: $amount, placeholder: "0.00", keyboardType: .decimalPad)

                    VStack(alignment: .leading, spacing: Theme.Spacing.xxs) {
                        Text(locale.t("common.date"))
                            .font(AppFont.bodyMedium)
                            .foregroundColor(Theme.foreground)
                        DatePicker("", selection: $date, displayedComponents: .date)
                            .labelsHidden()
                            .datePickerStyle(.compact)
                    }

                    categoryPicker

                    NBTextField(label: locale.t("expenses.vendor"), text: $vendor, placeholder: locale.t("common.none"))
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
            .navigationTitle(locale.t("expenses.newExpense"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(locale.t("common.cancel")) { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(locale.t("common.save")) {
                        let df = DateFormatter(); df.dateFormat = "yyyy-MM-dd"
                        let tags = parseTags(tagsText)
                        onSubmit(ExpenseCreate(
                            title: title.trimmingCharacters(in: .whitespacesAndNewlines),
                            amount: amount.replacingOccurrences(of: ",", with: "."),
                            date: df.string(from: date),
                            categoryId: selectedCategoryId,
                            vendor: vendor.isEmpty ? nil : vendor,
                            notes: notes.isEmpty ? nil : notes,
                            tags: tags.isEmpty ? nil : tags,
                            currency: nil,
                            receiptId: nil
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
        .task { if categories.isEmpty { await fallback.load() } }
    }

    private var categoryPicker: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.xxs) {
            Text(locale.t("expenses.category"))
                .font(AppFont.bodyMedium)
                .foregroundColor(Theme.foreground)
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 6) {
                    ForEach(availableCategories) { c in
                        Button {
                            selectedCategoryId = selectedCategoryId == c.id ? nil : c.id
                        } label: {
                            Text(c.name)
                                .font(AppFont.mono(11))
                                .tracking(0.5)
                                .textCase(.uppercase)
                                .padding(.horizontal, 10)
                                .padding(.vertical, 8)
                                .foregroundColor(selectedCategoryId == c.id ? Theme.background : Theme.foreground)
                                .background(selectedCategoryId == c.id ? Theme.foreground : Theme.card)
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

    private func parseTags(_ raw: String) -> [String] {
        raw.split(separator: ",")
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
    }
}

@MainActor
final class CategoryPickerVM: ObservableObject {
    @Published var categories: [Category] = []
    func load() async {
        do {
            let bundle = try await SettingsRepo.fetch()
            self.categories = bundle.categories
        } catch {
            #if DEBUG
            print("[CategoryPicker] Failed to load categories: \(error)")
            #endif
        }
    }
}
