import SwiftUI

/// Group settlements screen — mirrors web `/app/(protected)/groups/[id]/settlements/page.tsx`.
/// Reads from `GET /api/groups/[id]/settlements` which returns stats,
/// per-person balances, simplified debts, and payment requests.
struct GroupSettlementsView: View {
    let groupId: String

    @EnvironmentObject private var toast: ToastCenter
    @EnvironmentObject private var locale: AppLocale
    @StateObject private var vm = GroupSettlementsViewModel()

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Theme.Spacing.md) {
                if vm.isLoading && vm.data == nil {
                    NBSkeletonList(rows: 3)
                } else if let message = vm.errorMessage, vm.data == nil {
                    NBErrorCard(message: message) { Task { await vm.load(groupId: groupId) } }
                } else if let data = vm.data {
                    header(data)
                    statsCard(data)
                    debtsSection(data)
                    balancesSection(data)
                    paymentRequestsSection(data)
                }
                Spacer(minLength: Theme.Spacing.xl)
            }
            .padding(.horizontal, Theme.Spacing.md)
            .padding(.top, Theme.Spacing.md)
        }
        .background(Theme.background)
        .navigationTitle(locale.t("groupDetail.settlements"))
        .navigationBarTitleDisplayMode(.inline)
        .task { await vm.load(groupId: groupId) }
        .refreshable { await vm.load(groupId: groupId) }
    }

    // MARK: - Sections

    private func header(_ data: SettlementsResponse) -> some View {
        let g = data.group
        return HStack(spacing: Theme.Spacing.sm) {
            Text(g.emoji ?? "👥")
                .font(.system(size: 34))
                .frame(width: 52, height: 52)
                .background(Theme.muted)
                .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.md))
                .overlay(
                    RoundedRectangle(cornerRadius: Theme.Radius.md)
                        .stroke(Theme.border, lineWidth: Theme.Border.width)
                )
            VStack(alignment: .leading, spacing: 2) {
                NBEyebrow(text: locale.t("groupSettlements.groupEyebrow"))
                Text(g.name)
                    .font(AppFont.sectionTitle)
                    .foregroundColor(Theme.foreground)
                if let currency = g.currency {
                    Text(currency.uppercased())
                        .font(AppFont.mono(11))
                        .tracking(1)
                        .foregroundColor(Theme.mutedForeground)
                }
            }
            Spacer()
            if data.stats.allSettled {
                NBTag(text: locale.t("groupSettlements.allSettled"), background: Theme.muted, foreground: Theme.success)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(Theme.Spacing.md)
        .nbCard(radius: Theme.Radius.lg, shadow: Theme.Shadow.md)
    }

    private func statsCard(_ data: SettlementsResponse) -> some View {
        let currency = data.group.currency ?? "PLN"
        return LazyVGrid(
            columns: [
                GridItem(.flexible(), spacing: Theme.Spacing.xs),
                GridItem(.flexible(), spacing: Theme.Spacing.xs),
            ],
            spacing: Theme.Spacing.xs
        ) {
            NBStatTile(
                label: locale.t("groupSettlements.totalRequests"),
                value: "\(data.stats.pendingCount + data.stats.settledCount)",
                sub: "\(data.stats.membersCount) \(locale.t("groupSettlements.membersSuffix"))"
            )
            NBStatTile(
                label: locale.t("groupSettlements.totalSpend"),
                value: Fmt.amount(data.stats.totalGroupSpend, currency: currency)
            )
            NBStatTile(
                label: locale.t("groupSettlements.pending"),
                value: Fmt.amount(data.stats.totalPendingAmount, currency: currency),
                sub: "\(data.stats.pendingCount) \(locale.t("groupSettlements.requestsSuffix"))",
                tint: data.stats.pendingCount > 0 ? Theme.destructive : Theme.foreground
            )
            NBStatTile(
                label: locale.t("groupSettlements.settled"),
                value: Fmt.amount(data.stats.totalSettledAmount, currency: currency),
                sub: "\(data.stats.settledCount) \(locale.t("groupSettlements.requestsSuffix"))",
                tint: Theme.success
            )
        }
    }

    @ViewBuilder
    private func debtsSection(_ data: SettlementsResponse) -> some View {
        let currency = data.group.currency ?? "PLN"
        VStack(alignment: .leading, spacing: Theme.Spacing.xs) {
            NBEyebrow(text: locale.t("groupSettlements.whoOwes"))
            if data.debts.isEmpty {
                NBEmptyState(
                    systemImage: "checkmark.seal.fill",
                    title: locale.t("groupSettlements.noDebts"),
                    subtitle: locale.t("groupSettlements.everyoneSquare")
                )
            } else {
                ForEach(data.debts) { debt in
                    debtRow(debt, currency: currency)
                }
            }
        }
    }

    private func debtRow(_ debt: SettlementDebt, currency: String) -> some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.xs) {
            HStack(spacing: Theme.Spacing.sm) {
                personAvatar(name: debt.fromName, color: debt.fromColor)
                Image(systemName: "arrow.right")
                    .font(.system(size: 14, weight: .bold))
                    .foregroundColor(Theme.mutedForeground)
                personAvatar(name: debt.toName, color: debt.toColor)
                Spacer()
                Text(Fmt.amount(debt.amount, currency: currency))
                    .font(AppFont.amount)
                    .foregroundColor(Theme.foreground)
            }
            HStack {
                Text(String(format: locale.t("groupSettlements.owesPrefix"), debt.fromName, debt.toName))
                    .font(AppFont.caption)
                    .foregroundColor(Theme.mutedForeground)
                Spacer()
                Button {
                    Task { await vm.markSettled(debt: debt, groupId: groupId, locale: locale, toast: toast) }
                } label: {
                    if vm.settlingKey == debt.id {
                        ProgressView().controlSize(.small).tint(Theme.foreground)
                    } else {
                        Text(locale.t("groupSettlements.markSettled"))
                            .font(AppFont.mono(11))
                            .tracking(0.5)
                            .textCase(.uppercase)
                    }
                }
                .buttonStyle(NBSecondaryButtonStyle())
                .frame(maxWidth: 150)
                .disabled(vm.settlingKey != nil)
            }
        }
        .padding(Theme.Spacing.sm)
        .frame(maxWidth: .infinity, alignment: .leading)
        .nbCard(radius: Theme.Radius.md, shadow: Theme.Shadow.sm)
    }

    @ViewBuilder
    private func balancesSection(_ data: SettlementsResponse) -> some View {
        let currency = data.group.currency ?? "PLN"
        if !data.perPersonBreakdown.isEmpty {
            VStack(alignment: .leading, spacing: Theme.Spacing.xs) {
                NBEyebrow(text: locale.t("groupSettlements.perPerson"))
                ForEach(data.perPersonBreakdown) { p in
                    balanceRow(p, currency: currency)
                }
            }
        }
    }

    private func balanceRow(_ p: SettlementPerPerson, currency: String) -> some View {
        HStack(spacing: Theme.Spacing.sm) {
            personAvatar(name: p.name, color: p.color)
            VStack(alignment: .leading, spacing: 2) {
                Text(p.name)
                    .font(AppFont.bodyMedium)
                    .foregroundColor(Theme.foreground)
                Text(String(format: locale.t("groupSettlements.paidShare"), Fmt.amount(p.totalPaid, currency: currency), Fmt.amount(p.totalConsumed, currency: currency)))
                    .font(AppFont.caption)
                    .foregroundColor(Theme.mutedForeground)
            }
            Spacer()
            VStack(alignment: .trailing, spacing: 2) {
                Text(balanceString(p.netBalance, currency: currency))
                    .font(AppFont.mono(14))
                    .foregroundColor(p.netBalance >= 0 ? Theme.success : Theme.destructive)
                Text(p.netBalance >= 0 ? locale.t("groupSettlements.isOwed") : locale.t("groupSettlements.owes"))
                    .font(AppFont.mono(10))
                    .tracking(0.5)
                    .textCase(.uppercase)
                    .foregroundColor(Theme.mutedForeground)
            }
        }
        .padding(Theme.Spacing.sm)
        .frame(maxWidth: .infinity, alignment: .leading)
        .nbCard(radius: Theme.Radius.md, shadow: Theme.Shadow.sm)
    }

    @ViewBuilder
    private func paymentRequestsSection(_ data: SettlementsResponse) -> some View {
        if !data.paymentRequests.isEmpty {
            VStack(alignment: .leading, spacing: Theme.Spacing.xs) {
                NBEyebrow(text: locale.t("groupSettlements.paymentRequests"))
                ForEach(data.paymentRequests) { req in
                    paymentRequestRow(req)
                }
            }
        }
    }

    private func paymentRequestRow(_ req: SettlementPaymentRequest) -> some View {
        let currency = req.currency ?? "PLN"
        return HStack(spacing: Theme.Spacing.sm) {
            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 6) {
                    Text(req.fromName)
                        .font(AppFont.bodyMedium)
                        .foregroundColor(Theme.foreground)
                    Image(systemName: "arrow.right")
                        .font(.system(size: 11, weight: .bold))
                        .foregroundColor(Theme.mutedForeground)
                    Text(req.toName)
                        .font(AppFont.bodyMedium)
                        .foregroundColor(Theme.foreground)
                }
                if let note = req.note, !note.isEmpty {
                    Text(note)
                        .font(AppFont.caption)
                        .foregroundColor(Theme.mutedForeground)
                        .lineLimit(2)
                }
                if let created = req.createdAt {
                    Text(Fmt.date(created))
                        .font(AppFont.caption)
                        .foregroundColor(Theme.mutedForeground)
                }
            }
            Spacer()
            VStack(alignment: .trailing, spacing: 4) {
                Text(Fmt.amount(req.amount, currency: currency))
                    .font(AppFont.amount)
                    .foregroundColor(Theme.foreground)
                statusPill(req.status)
            }
        }
        .padding(Theme.Spacing.sm)
        .frame(maxWidth: .infinity, alignment: .leading)
        .nbCard(radius: Theme.Radius.md, shadow: Theme.Shadow.sm)
    }

    private func statusPill(_ status: String) -> some View {
        let (bg, fg, label): (Color, Color, String) = {
            switch status.lowercased() {
            case "settled":
                return (Theme.muted, Theme.success, locale.t("groupSettlements.statusSettled"))
            case "declined":
                return (Theme.muted, Theme.destructive, locale.t("groupSettlements.statusDeclined"))
            default:
                return (Theme.muted, Theme.warning, locale.t("groupSettlements.statusPending"))
            }
        }()
        return NBTag(text: label, background: bg, foreground: fg)
    }

    // MARK: - Helpers

    private func personAvatar(name: String, color: String) -> some View {
        ZStack {
            Circle().fill(Color(hex: color) ?? Theme.muted)
            Text(Fmt.initials(name))
                .font(AppFont.bold(11))
                .foregroundColor(.white)
        }
        .frame(width: 32, height: 32)
        .overlay(Circle().stroke(Theme.border, lineWidth: Theme.Border.widthThin))
    }

    private func balanceString(_ amount: Double, currency: String) -> String {
        let sign = amount >= 0 ? "+" : "−"
        return "\(sign)\(Fmt.amount(abs(amount), currency: currency))"
    }
}

// MARK: - ViewModel

@MainActor
final class GroupSettlementsViewModel: ObservableObject {
    @Published var data: SettlementsResponse?
    @Published var splits: [ExpenseSplit] = []
    @Published var isLoading = false
    @Published var errorMessage: String?
    @Published var settlingKey: String?

    func load(groupId: String) async {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }
        do {
            async let settlements = GroupsRepo.settlements(groupId: groupId)
            async let detail = GroupsRepo.detail(id: groupId)
            self.data = try await settlements
            let resolvedDetail = try await detail
            self.splits = resolvedDetail.splits ?? []
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    /// Resolve the split(s) that contain the debtor's unsettled portion
    /// and flip them to settled via the `/api/groups/splits/[splitId]/settle`
    /// endpoint. The settlement response doesn't expose splitId directly,
    /// so we resolve via the cached detail splits.
    func markSettled(debt: SettlementDebt, groupId: String, locale: AppLocale, toast: ToastCenter) async {
        settlingKey = debt.id
        defer { settlingKey = nil }

        let candidates = splits.filter { split in
            split.paidByMemberId == debt.toId && split.splits.contains { share in
                share.memberId == debt.fromId && (share.settled == nil || share.settled == false)
            }
        }
        guard !candidates.isEmpty else {
            toast.error(locale.t("groupSettlements.noOpenSplit"))
            return
        }
        do {
            for split in candidates {
                try await GroupsRepo.settle(splitId: split.id, memberId: debt.fromId)
            }
            toast.success(locale.t("groupSettlements.markedSettled"))
            await load(groupId: groupId)
        } catch {
            toast.error(locale.t("groupSettlements.failedSettle"), description: error.localizedDescription)
        }
    }
}
