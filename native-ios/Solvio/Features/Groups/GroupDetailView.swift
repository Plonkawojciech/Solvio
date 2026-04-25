import SwiftUI

/// Group detail — members + balances + splits + quick-split CTA.
/// Mirrors web `/app/(protected)/groups/[id]/page.tsx` with a simplified
/// mobile-first quick-split flow.
struct GroupDetailView: View {
    let groupId: String

    @EnvironmentObject private var router: AppRouter
    @EnvironmentObject private var toast: ToastCenter
    @EnvironmentObject private var locale: AppLocale
    @EnvironmentObject private var store: AppDataStore
    @StateObject private var vm = GroupDetailViewModel()

    @State private var showQuickSplit = false
    @State private var showEdit = false
    @State private var confirmDelete = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Theme.Spacing.md) {
                if vm.isLoading && vm.group == nil {
                    NBSkeletonHero()
                    NBSkeletonList(rows: 3)
                } else if let message = vm.errorMessage, vm.group == nil {
                    NBErrorCard(message: message) { Task { await vm.load(id: groupId) } }
                } else if let g = vm.group {
                    hero(g)
                    kpiStrip(g)
                    tabsRow(g)
                    membersSection(g)
                    quickSplitCTA
                    splitsSection(g)
                }
                Spacer(minLength: Theme.Spacing.xl)
            }
            .padding(.horizontal, Theme.Spacing.md)
            .padding(.top, Theme.Spacing.md)
        }
        .background(Theme.background)
        .navigationTitle(vm.group?.name ?? locale.t("groupDetail.groupFallback"))
        .navigationBarTitleDisplayMode(.inline)
        .task { await vm.load(id: groupId) }
        .refreshable { await vm.load(id: groupId) }
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Menu {
                    Button { showEdit = true } label: {
                        Label(locale.t("groupDetail.edit"), systemImage: "pencil")
                    }
                    Button(role: .destructive) {
                        confirmDelete = true
                    } label: {
                        Label(locale.t("groupDetail.delete"), systemImage: "trash")
                    }
                } label: {
                    Image(systemName: "ellipsis.circle")
                        .foregroundColor(Theme.foreground)
                }
                .disabled(vm.group == nil)
            }
        }
        .sheet(isPresented: $showQuickSplit) {
            if let g = vm.group {
                QuickSplitSheet(group: g) { body in
                    Task {
                        do {
                            _ = try await GroupsRepo.createSplit(body)
                            toast.success(locale.t("quickSplit.added"))
                            showQuickSplit = false
                            await vm.load(id: groupId)
                        } catch {
                            toast.error(locale.t("quickSplit.createFailed"), description: error.localizedDescription)
                        }
                    }
                }
                .environmentObject(locale)
            }
        }
        .sheet(isPresented: $showEdit) {
            if let g = vm.group {
                GroupEditSheet(group: g) { body in
                    Task {
                        do {
                            try await GroupsRepo.update(id: groupId, body: body)
                            toast.success(locale.t("groupEdit.groupUpdated"))
                            showEdit = false
                            await vm.load(id: groupId)
                        } catch {
                            toast.error(locale.t("groupEdit.updateFailed"), description: error.localizedDescription)
                        }
                    }
                }
                .environmentObject(locale)
            }
        }
        .alert(locale.t("groupDetail.deleteConfirm"), isPresented: $confirmDelete) {
            Button(locale.t("common.cancel"), role: .cancel) {}
            Button(locale.t("common.delete"), role: .destructive) {
                // Pop FIRST — same pattern as ExpenseDetailView/GoalDetailView.
                // The mutation hook below makes sure the groups list is in
                // sync once the user lands back on it; without the hook the
                // deleted group reappeared until pull-to-refresh.
                router.popToRoot()
                Task {
                    do {
                        try await GroupsRepo.delete(id: groupId)
                        toast.success(locale.t("groupEdit.deleted"))
                        store.didMutateGroups()
                    } catch {
                        toast.error(locale.t("groupEdit.deleteFailed"), description: error.localizedDescription)
                    }
                }
            }
        } message: {
            Text(locale.t("groupDetail.deleteMsg"))
        }
    }

    // MARK: - Hero

    private func hero(_ g: Group) -> some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.sm) {
            HStack(spacing: Theme.Spacing.sm) {
                Text(g.emoji ?? "👥")
                    .font(.system(size: 40))
                    .frame(width: 56, height: 56)
                    .background(Theme.muted)
                    .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.md))
                    .overlay(
                        RoundedRectangle(cornerRadius: Theme.Radius.md)
                            .stroke(Theme.foreground, lineWidth: Theme.Border.width)
                    )
                VStack(alignment: .leading, spacing: 2) {
                    NBEyebrow(text: (g.mode ?? "group").uppercased())
                    Text(g.name)
                        .font(AppFont.pageTitle)
                        .foregroundColor(Theme.foreground)
                        .multilineTextAlignment(.leading)
                }
                Spacer()
            }
            if let desc = g.description, !desc.isEmpty {
                Text(desc)
                    .font(AppFont.body)
                    .foregroundColor(Theme.mutedForeground)
                    .fixedSize(horizontal: false, vertical: true)
            }
            HStack(spacing: Theme.Spacing.md) {
                Label("\(g.members?.count ?? 0) \(locale.t("groups.memberCount"))", systemImage: "person.2")
                    .font(AppFont.caption)
                    .foregroundColor(Theme.mutedForeground)
                if let created = g.createdAt {
                    Label(Fmt.date(created), systemImage: "calendar")
                        .font(AppFont.caption)
                        .foregroundColor(Theme.mutedForeground)
                }
                Spacer()
                Text(g.currency.uppercased())
                    .font(AppFont.mono(11))
                    .tracking(1)
                    .foregroundColor(Theme.mutedForeground)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(Theme.Spacing.md)
        .nbCard(radius: Theme.Radius.lg, shadow: Theme.Shadow.lg)
    }

    // MARK: - KPI strip

    private func kpiStrip(_ g: Group) -> some View {
        let total = vm.totalSpent
        let unsettled = vm.unsettledTotal
        let balance = g.totalBalance ?? 0
        return LazyVGrid(
            columns: [
                GridItem(.flexible(), spacing: Theme.Spacing.xs),
                GridItem(.flexible(), spacing: Theme.Spacing.xs),
            ],
            spacing: Theme.Spacing.xs
        ) {
            NBStatTile(label: locale.t("groupDetail.totalSpent"), value: Fmt.amount(total, currency: g.currency))
            NBStatTile(
                label: locale.t("groupDetail.yourBalance"),
                value: "\(balance >= 0 ? "+" : "−")\(Fmt.amount(abs(balance), currency: g.currency))",
                tint: abs(balance) <= 0.01 ? Theme.foreground : (balance > 0 ? Theme.success : Theme.destructive)
            )
            NBStatTile(
                label: locale.t("groupDetail.unsettled"),
                value: Fmt.amount(unsettled, currency: g.currency),
                tint: unsettled > 0 ? Theme.destructive : Theme.foreground
            )
            NBStatTile(label: locale.t("groupDetail.splitsCount"), value: "\(vm.splits.count)")
        }
    }

    // MARK: - Tabs

    private func tabsRow(_ g: Group) -> some View {
        HStack(spacing: Theme.Spacing.xs) {
            Button { router.push(.groupReceipts(id: g.id)) } label: {
                Label(locale.t("nav.receipts"), systemImage: "doc.text.viewfinder")
            }
            .buttonStyle(NBSecondaryButtonStyle())

            Button { router.push(.groupSettlements(id: g.id)) } label: {
                Label(locale.t("groupDetail.settlements"), systemImage: "arrow.left.arrow.right")
            }
            .buttonStyle(NBSecondaryButtonStyle())
        }
    }

    // MARK: - Members

    @ViewBuilder
    private func membersSection(_ g: Group) -> some View {
        let members = g.members ?? []
        if !members.isEmpty {
            VStack(alignment: .leading, spacing: Theme.Spacing.xs) {
                NBEyebrow(text: locale.t("groupDetail.members").uppercased())
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: Theme.Spacing.sm) {
                        ForEach(members) { m in
                            memberChip(m)
                        }
                    }
                    .padding(.vertical, 2)
                }
            }
        }
    }

    private func memberChip(_ m: GroupMember) -> some View {
        let bg = Color(hex: m.color ?? "") ?? Theme.muted
        return VStack(spacing: 6) {
            ZStack {
                Circle().fill(bg)
                Text(Fmt.initials(m.label))
                    .font(AppFont.bold(14))
                    .foregroundColor(.white)
            }
            .frame(width: 46, height: 46)
            .overlay(Circle().stroke(Theme.foreground, lineWidth: Theme.Border.width))
            .nbShadow(Theme.Shadow.sm)

            Text(m.label)
                .font(AppFont.caption)
                .foregroundColor(Theme.foreground)
                .lineLimit(1)
                .frame(maxWidth: 76)
        }
        .frame(width: 80)
    }

    // MARK: - Quick split CTA

    private var quickSplitCTA: some View {
        Button { showQuickSplit = true } label: {
            HStack(spacing: Theme.Spacing.sm) {
                Image(systemName: "bolt.fill")
                    .font(.system(size: 18, weight: .bold))
                VStack(alignment: .leading, spacing: 2) {
                    Text(locale.t("groupDetail.quickSplit"))
                        .font(AppFont.cardTitle)
                    Text(locale.t("groupDetail.quickSplitSubtitle"))
                        .font(AppFont.caption)
                        .opacity(0.75)
                }
                Spacer()
                Image(systemName: "chevron.right")
                    .font(.system(size: 14, weight: .bold))
            }
            .foregroundColor(Theme.background)
            .padding(Theme.Spacing.md)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Theme.foreground)
            .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.lg))
            .overlay(
                RoundedRectangle(cornerRadius: Theme.Radius.lg)
                    .stroke(Theme.foreground, lineWidth: Theme.Border.width)
            )
            .nbShadow(Theme.Shadow.md)
        }
        .buttonStyle(.plain)
    }

    // MARK: - Splits list

    @ViewBuilder
    private func splitsSection(_ g: Group) -> some View {
        let splits = vm.splits
        VStack(alignment: .leading, spacing: Theme.Spacing.xs) {
            HStack {
                NBEyebrow(text: locale.t("groupDetail.splitsEyebrow"))
                Spacer()
                Text("\(splits.count)")
                    .font(AppFont.mono(11))
                    .foregroundColor(Theme.mutedForeground)
            }
            if splits.isEmpty {
                NBEmptyState(
                    systemImage: "square.stack.3d.up",
                    title: locale.t("groupDetail.noSplits"),
                    subtitle: locale.t("groupDetail.noSplitsSub"),
                    action: (label: locale.t("groupDetail.quickSplit"), run: { showQuickSplit = true })
                )
            } else {
                ForEach(splits) { s in
                    splitCard(s, group: g)
                }
            }
        }
    }

    private func splitCard(_ s: ExpenseSplit, group: Group) -> some View {
        let payer = group.members?.first(where: { $0.id == s.paidByMemberId })?.label ?? locale.t("common.other")
        let currency = s.currency ?? group.currency
        return VStack(alignment: .leading, spacing: Theme.Spacing.xs) {
            HStack(alignment: .firstTextBaseline) {
                Text(s.description?.isEmpty == false ? s.description! : locale.t("groupDetail.splitFallback"))
                    .font(AppFont.cardTitle)
                    .foregroundColor(Theme.foreground)
                Spacer()
                Text(Fmt.amount(s.totalAmount, currency: currency))
                    .font(AppFont.amount)
                    .foregroundColor(Theme.foreground)
            }
            HStack(spacing: 6) {
                Image(systemName: "creditcard")
                    .font(.caption2)
                    .foregroundColor(Theme.mutedForeground)
                Text(String(format: locale.t("groupDetail.paidByPrefix"), payer))
                    .font(AppFont.caption)
                    .foregroundColor(Theme.mutedForeground)
                if let created = s.createdAt {
                    Text("·")
                        .font(AppFont.caption)
                        .foregroundColor(Theme.mutedForeground)
                    Text(Fmt.date(created))
                        .font(AppFont.caption)
                        .foregroundColor(Theme.mutedForeground)
                }
            }
            if !s.splits.isEmpty {
                Rectangle()
                    .fill(Theme.foreground.opacity(0.12))
                    .frame(height: Theme.Border.widthThin)
                VStack(spacing: 4) {
                    ForEach(Array(s.splits.enumerated()), id: \.offset) { _, share in
                        let name = group.members?.first(where: { $0.id == share.memberId })?.label ?? "—"
                        HStack {
                            Text(name)
                                .font(AppFont.body)
                                .foregroundColor(Theme.foreground)
                            if share.settled == true {
                                NBTag(text: locale.t("groupDetail.settledTag"), background: Theme.muted, foreground: Theme.success)
                            }
                            Spacer()
                            Text(Fmt.amount(share.amount, currency: currency))
                                .font(AppFont.mono(12))
                                .foregroundColor(Theme.mutedForeground)
                        }
                    }
                }
            }
        }
        .padding(Theme.Spacing.md)
        .frame(maxWidth: .infinity, alignment: .leading)
        .nbCard(radius: Theme.Radius.md, shadow: Theme.Shadow.sm)
    }
}

// MARK: - ViewModel

@MainActor
final class GroupDetailViewModel: ObservableObject {
    @Published var group: Group?
    @Published var isLoading = false
    @Published var errorMessage: String?

    /// Splits come baked into `/api/groups/[id]` GET (see backend route).
    var splits: [ExpenseSplit] { group?.splits ?? [] }

    var totalSpent: Double {
        splits.reduce(0) { $0 + $1.totalAmount.double }
    }

    /// Sum of unsettled share portions across all splits.
    var unsettledTotal: Double {
        splits.reduce(0) { sum, split in
            sum + split.splits.reduce(0) { $1.settled == true ? $0 : $0 + $1.amount }
        }
    }

    func load(id: String) async {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }
        do {
            group = try await GroupsRepo.detail(id: id)
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}

// MARK: - Quick Split sheet

/// Mobile-first split creator — description, amount, payer, split mode,
/// member selection. Single submit hits `POST /api/groups/splits`.
struct QuickSplitSheet: View {
    let group: Group
    let onSubmit: (SplitCreate) -> Void
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var locale: AppLocale

    enum SplitMode: String, CaseIterable, Hashable {
        case equal, percentage, custom
    }

    private func modeLabel(_ mode: SplitMode) -> String {
        switch mode {
        case .equal: return locale.t("quickSplit.modeEqual")
        case .percentage: return locale.t("quickSplit.modePercent")
        case .custom: return locale.t("quickSplit.modeCustom")
        }
    }

    @State private var desc = ""
    @State private var amount = ""
    @State private var currency = "PLN"
    @State private var paidBy: String = ""
    @State private var mode: SplitMode = .equal
    @State private var selected: Set<String> = []
    /// User-entered share per member (percent for .percentage, currency for .custom).
    @State private var customShare: [String: String] = [:]

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: Theme.Spacing.md) {
                    NBTextField(label: locale.t("quickSplit.descriptionLabel"), text: $desc, placeholder: locale.t("quickSplit.descriptionPh"))
                    NBTextField(label: locale.t("quickSplit.amountLabel"), text: $amount, placeholder: "0.00", keyboardType: .decimalPad)
                    NBTextField(label: locale.t("quickSplit.currencyLabel"), text: $currency, placeholder: "PLN", autocapitalization: .characters)

                    paidByPicker
                    modePicker
                    membersPicker

                    if mode != .equal {
                        customSharesSection
                    } else if !selected.isEmpty, let total = Double(amount), total > 0 {
                        equalPreview(total: total)
                    }
                }
                .padding(Theme.Spacing.md)
            }
            .background(Theme.background)
            .navigationTitle(locale.t("quickSplit.title"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button(locale.t("common.cancel")) { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button(locale.t("common.save")) { submit() }
                        .disabled(!isValid)
                }
            }
        }
        .onAppear {
            currency = group.currency
            if paidBy.isEmpty { paidBy = group.members?.first?.id ?? "" }
            if selected.isEmpty {
                selected = Set((group.members ?? []).map(\.id))
            }
        }
    }

    private var paidByPicker: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.xxs) {
            Text(locale.t("quickSplit.paidBy"))
                .font(AppFont.bodyMedium)
                .foregroundColor(Theme.foreground)
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 6) {
                    ForEach(group.members ?? []) { m in
                        Button { paidBy = m.id } label: {
                            HStack(spacing: 6) {
                                Circle()
                                    .fill(Color(hex: m.color ?? "") ?? Theme.muted)
                                    .frame(width: 14, height: 14)
                                Text(m.label)
                                    .font(AppFont.mono(11))
                                    .tracking(0.5)
                                    .textCase(.uppercase)
                            }
                            .padding(.horizontal, 10)
                            .padding(.vertical, 8)
                            .foregroundColor(paidBy == m.id ? Theme.background : Theme.foreground)
                            .background(paidBy == m.id ? Theme.foreground : Theme.card)
                            .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.sm))
                            .overlay(
                                RoundedRectangle(cornerRadius: Theme.Radius.sm)
                                    .stroke(Theme.foreground, lineWidth: Theme.Border.widthThin)
                            )
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
        }
    }

    private var modePicker: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.xxs) {
            Text(locale.t("quickSplit.splitMode"))
                .font(AppFont.bodyMedium)
                .foregroundColor(Theme.foreground)
            NBSegmented(
                selection: $mode,
                options: SplitMode.allCases.map { (value: $0, label: modeLabel($0)) }
            )
        }
    }

    private var membersPicker: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.xxs) {
            HStack {
                Text(locale.t("quickSplit.splitBetween"))
                    .font(AppFont.bodyMedium)
                    .foregroundColor(Theme.foreground)
                Spacer()
                Button {
                    let all = Set((group.members ?? []).map(\.id))
                    selected = selected == all ? [] : all
                } label: {
                    Text(selected.count == group.members?.count ? locale.t("quickSplit.clearAll") : locale.t("quickSplit.selectAll"))
                        .font(AppFont.mono(10))
                        .tracking(1)
                        .textCase(.uppercase)
                        .foregroundColor(Theme.mutedForeground)
                }
                .buttonStyle(.plain)
            }
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 120), spacing: 6)], spacing: 6) {
                ForEach(group.members ?? []) { m in
                    let isOn = selected.contains(m.id)
                    Button {
                        if isOn { selected.remove(m.id) } else { selected.insert(m.id) }
                    } label: {
                        HStack(spacing: 6) {
                            Image(systemName: isOn ? "checkmark.square.fill" : "square")
                                .font(.system(size: 14, weight: .bold))
                            Text(m.label)
                                .font(AppFont.caption)
                                .lineLimit(1)
                            Spacer()
                        }
                        .padding(.horizontal, 8)
                        .padding(.vertical, 8)
                        .foregroundColor(isOn ? Theme.background : Theme.foreground)
                        .background(isOn ? Theme.foreground : Theme.card)
                        .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.sm))
                        .overlay(
                            RoundedRectangle(cornerRadius: Theme.Radius.sm)
                                .stroke(Theme.foreground, lineWidth: Theme.Border.widthThin)
                        )
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }

    @ViewBuilder
    private var customSharesSection: some View {
        let selectedMembers = (group.members ?? []).filter { selected.contains($0.id) }
        if !selectedMembers.isEmpty {
            VStack(alignment: .leading, spacing: Theme.Spacing.xxs) {
                Text(mode == .percentage ? locale.t("quickSplit.percentages") : locale.t("quickSplit.customAmounts"))
                    .font(AppFont.bodyMedium)
                    .foregroundColor(Theme.foreground)
                VStack(spacing: 4) {
                    ForEach(selectedMembers) { m in
                        HStack {
                            Circle()
                                .fill(Color(hex: m.color ?? "") ?? Theme.muted)
                                .frame(width: 14, height: 14)
                            Text(m.label)
                                .font(AppFont.body)
                                .foregroundColor(Theme.foreground)
                            Spacer()
                            TextField(mode == .percentage ? "0" : "0.00", text: binding(for: m.id))
                                .font(AppFont.mono(13))
                                .keyboardType(.decimalPad)
                                .multilineTextAlignment(.trailing)
                                .frame(width: 90, height: 36)
                                .padding(.horizontal, 8)
                                .background(Theme.card)
                                .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.sm))
                                .overlay(
                                    RoundedRectangle(cornerRadius: Theme.Radius.sm)
                                        .stroke(Theme.foreground, lineWidth: Theme.Border.widthThin)
                                )
                            Text(mode == .percentage ? "%" : currency.uppercased())
                                .font(AppFont.caption)
                                .foregroundColor(Theme.mutedForeground)
                        }
                        .padding(.vertical, 4)
                    }
                }
                if let message = customValidationMessage {
                    Text(message)
                        .font(AppFont.caption)
                        .foregroundColor(Theme.destructive)
                }
            }
            .padding(Theme.Spacing.sm)
            .nbCard(radius: Theme.Radius.sm, shadow: Theme.Shadow.sm)
        }
    }

    private func equalPreview(total: Double) -> some View {
        let count = max(selected.count, 1)
        let each = total / Double(count)
        return HStack {
            Text(locale.t("quickSplit.eachPays"))
                .font(AppFont.caption)
                .foregroundColor(Theme.mutedForeground)
            Spacer()
            Text(Fmt.amount(each, currency: currency.uppercased()))
                .font(AppFont.mono(13))
                .foregroundColor(Theme.foreground)
        }
        .padding(Theme.Spacing.sm)
        .nbCard(radius: Theme.Radius.sm, shadow: Theme.Shadow.sm)
    }

    // MARK: - Validation & submit

    private var parsedAmount: Double? {
        let raw = amount.replacingOccurrences(of: ",", with: ".")
        return Double(raw)
    }

    private var isValid: Bool {
        guard let total = parsedAmount, total > 0 else { return false }
        guard !paidBy.isEmpty, !selected.isEmpty else { return false }
        switch mode {
        case .equal:
            return true
        case .percentage:
            return percentSum != nil && abs((percentSum ?? 0) - 100) < 0.01
        case .custom:
            return customSum != nil && abs((customSum ?? 0) - total) < 0.01
        }
    }

    private var percentSum: Double? {
        guard mode == .percentage else { return nil }
        return selected.reduce(0.0) { acc, id in
            acc + (Double(customShare[id] ?? "") ?? 0)
        }
    }

    private var customSum: Double? {
        guard mode == .custom else { return nil }
        return selected.reduce(0.0) { acc, id in
            acc + (Double(customShare[id] ?? "") ?? 0)
        }
    }

    private var customValidationMessage: String? {
        switch mode {
        case .percentage:
            guard let sum = percentSum else { return nil }
            if abs(sum - 100) >= 0.01 {
                return String(format: locale.t("quickSplit.mustSum100"), sum)
            }
            return nil
        case .custom:
            guard let total = parsedAmount, let sum = customSum else { return nil }
            if abs(sum - total) >= 0.01 {
                return String(format: locale.t("quickSplit.sharesMustSum"), Fmt.amount(total, currency: currency))
            }
            return nil
        case .equal:
            return nil
        }
    }

    private func binding(for memberId: String) -> Binding<String> {
        Binding(
            get: { customShare[memberId] ?? "" },
            set: { customShare[memberId] = $0 }
        )
    }

    private func submit() {
        guard let total = parsedAmount else { return }
        let selectedMembers = (group.members ?? []).filter { selected.contains($0.id) }
        guard !selectedMembers.isEmpty else { return }

        let portions: [SplitPortionInput]
        switch mode {
        case .equal:
            let each = round((total / Double(selectedMembers.count)) * 100) / 100
            portions = selectedMembers.map {
                SplitPortionInput(
                    memberId: $0.id,
                    amount: each,
                    settled: $0.id == paidBy
                )
            }
        case .percentage:
            portions = selectedMembers.map { m in
                let pct = Double(customShare[m.id] ?? "") ?? 0
                let portion = round((total * pct / 100) * 100) / 100
                return SplitPortionInput(
                    memberId: m.id,
                    amount: portion,
                    settled: m.id == paidBy
                )
            }
        case .custom:
            portions = selectedMembers.map { m in
                let portion = Double(customShare[m.id] ?? "") ?? 0
                return SplitPortionInput(
                    memberId: m.id,
                    amount: round(portion * 100) / 100,
                    settled: m.id == paidBy
                )
            }
        }

        let body = SplitCreate(
            groupId: group.id,
            paidByMemberId: paidBy,
            totalAmount: total,
            currency: currency.uppercased(),
            description: desc.isEmpty ? nil : desc,
            splits: portions,
            expenseId: nil,
            receiptId: nil
        )
        onSubmit(body)
    }
}

// MARK: - Edit sheet

struct GroupEditSheet: View {
    let group: Group
    let onSubmit: (GroupUpdate) -> Void
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var locale: AppLocale

    @State private var name = ""
    @State private var emoji = ""
    @State private var currency = ""
    @State private var description = ""
    @State private var mode = ""

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: Theme.Spacing.md) {
                    NBTextField(label: locale.t("groups.name"), text: $name, placeholder: locale.t("groups.name"))
                    NBTextField(label: locale.t("groups.emoji"), text: $emoji, placeholder: "👥", autocapitalization: .never)
                    NBTextField(label: locale.t("settings.currency"), text: $currency, placeholder: "PLN", autocapitalization: .characters)
                    VStack(alignment: .leading, spacing: Theme.Spacing.xxs) {
                        Text(locale.t("groups.mode"))
                            .font(AppFont.bodyMedium)
                            .foregroundColor(Theme.foreground)
                        NBSegmented(
                            selection: $mode,
                            options: [
                                (value: "ongoing", label: locale.t("groups.modeOngoing")),
                                (value: "trip", label: locale.t("groups.modeTrip")),
                                (value: "household", label: locale.t("groups.modeHousehold")),
                            ]
                        )
                    }
                    VStack(alignment: .leading, spacing: Theme.Spacing.xxs) {
                        Text(locale.t("groups.description"))
                            .font(AppFont.bodyMedium)
                            .foregroundColor(Theme.foreground)
                        TextEditor(text: $description)
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
            .navigationTitle(locale.t("groupEdit.title"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button(locale.t("common.cancel")) { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button(locale.t("common.save")) {
                        onSubmit(GroupUpdate(
                            name: name.isEmpty ? nil : name,
                            description: description.isEmpty ? nil : description,
                            currency: currency.isEmpty ? nil : currency.uppercased(),
                            emoji: emoji.isEmpty ? nil : emoji,
                            mode: mode.isEmpty ? nil : mode,
                            startDate: nil,
                            endDate: nil
                        ))
                    }
                    .disabled(name.isEmpty)
                }
            }
        }
        .onAppear {
            name = group.name
            emoji = group.emoji ?? ""
            currency = group.currency
            description = group.description ?? ""
            mode = group.mode ?? "ongoing"
        }
    }
}
