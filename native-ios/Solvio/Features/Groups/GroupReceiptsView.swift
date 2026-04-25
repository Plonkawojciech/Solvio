import SwiftUI

/// Group receipts — mirrors web `/app/(protected)/groups/[id]/receipts/page.tsx`.
/// Shows receipts attached to the group with per-item member assignments.
struct GroupReceiptsView: View {
    let groupId: String

    @EnvironmentObject private var router: AppRouter
    @EnvironmentObject private var locale: AppLocale
    @StateObject private var vm = GroupReceiptsViewModel()

    @State private var expanded: Set<String> = []

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Theme.Spacing.md) {
                if vm.isLoading && vm.data == nil {
                    NBSkeletonList(rows: 4)
                } else if let message = vm.errorMessage, vm.data == nil {
                    NBErrorCard(message: message) { Task { await vm.load(groupId: groupId) } }
                } else if let data = vm.data {
                    header(data)
                    if data.receipts.isEmpty {
                        NBEmptyState(
                            systemImage: "doc.text.viewfinder",
                            title: locale.t("groupReceipts.emptyTitle"),
                            subtitle: locale.t("groupReceipts.emptySub")
                        )
                    } else {
                        ForEach(data.receipts) { entry in
                            receiptCard(entry, members: data.members)
                        }
                    }
                }
                Spacer(minLength: Theme.Spacing.xl)
            }
            .padding(.horizontal, Theme.Spacing.md)
            .padding(.top, Theme.Spacing.md)
        }
        .background(Theme.background)
        .navigationTitle(locale.t("nav.receipts"))
        .navigationBarTitleDisplayMode(.inline)
        .task { await vm.load(groupId: groupId) }
        .refreshable { await vm.load(groupId: groupId) }
    }

    // MARK: - Header

    private func header(_ data: GroupReceiptsResponse) -> some View {
        let currency = data.receipts.first?.currency ?? "PLN"
        let total = data.receipts.reduce(0.0) { $0 + ($1.total?.double ?? 0) }
        return VStack(alignment: .leading, spacing: Theme.Spacing.xs) {
            NBEyebrow(text: locale.t("groupReceipts.eyebrow"))
            HStack(alignment: .firstTextBaseline) {
                VStack(alignment: .leading, spacing: 2) {
                    Text("\(data.receipts.count) \(locale.t("groupReceipts.count"))")
                        .font(AppFont.sectionTitle)
                        .foregroundColor(Theme.foreground)
                    Text("\(data.members.count) \(locale.t("groups.memberCount"))")
                        .font(AppFont.caption)
                        .foregroundColor(Theme.mutedForeground)
                }
                Spacer()
                Text(Fmt.amount(total, currency: currency))
                    .font(AppFont.amountLarge)
                    .foregroundColor(Theme.foreground)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(Theme.Spacing.md)
        .nbCard(radius: Theme.Radius.lg, shadow: Theme.Shadow.md)
    }

    // MARK: - Receipt card

    private func receiptCard(_ entry: GroupReceiptEntry, members: [GroupReceiptMember]) -> some View {
        let currency = entry.currency ?? "PLN"
        let isExpanded = expanded.contains(entry.id)
        let memberById = Dictionary(uniqueKeysWithValues: members.map { ($0.id, $0) })
        let assignments = entry.assignments ?? []

        return VStack(alignment: .leading, spacing: Theme.Spacing.xs) {
            Button {
                if isExpanded { expanded.remove(entry.id) } else { expanded.insert(entry.id) }
            } label: {
                HStack(alignment: .top, spacing: Theme.Spacing.sm) {
                    NBIconBadge(systemImage: "doc.text")
                    VStack(alignment: .leading, spacing: 4) {
                        Text(entry.vendor ?? locale.t("groupReceipts.receiptFallback"))
                            .font(AppFont.cardTitle)
                            .foregroundColor(Theme.foreground)
                            .lineLimit(1)
                        HStack(spacing: 6) {
                            if let d = entry.date {
                                Text(Fmt.date(d))
                                    .font(AppFont.caption)
                                    .foregroundColor(Theme.mutedForeground)
                            }
                            if let paidBy = entry.paidByMember?.name {
                                Text(String(format: locale.t("groupReceipts.paidByPrefix"), paidBy))
                                    .font(AppFont.caption)
                                    .foregroundColor(Theme.mutedForeground)
                                    .lineLimit(1)
                            }
                        }
                        if let assignedCount = entry.assignedItemCount,
                           let totalCount = entry.totalItemCount, totalCount > 0 {
                            HStack(spacing: 4) {
                                Image(systemName: "person.fill.checkmark")
                                    .font(.caption2)
                                    .foregroundColor(Theme.mutedForeground)
                                Text(String(format: locale.t("groupReceipts.itemsAssigned"), assignedCount, totalCount))
                                    .font(AppFont.mono(10))
                                    .tracking(0.5)
                                    .foregroundColor(Theme.mutedForeground)
                            }
                        }
                    }
                    Spacer()
                    VStack(alignment: .trailing, spacing: 4) {
                        if let total = entry.total {
                            Text(Fmt.amount(total, currency: currency))
                                .font(AppFont.amount)
                                .foregroundColor(Theme.foreground)
                        }
                        Image(systemName: isExpanded ? "chevron.up" : "chevron.down")
                            .font(.caption)
                            .foregroundColor(Theme.mutedForeground)
                    }
                }
            }
            .buttonStyle(.plain)

            if isExpanded {
                Rectangle()
                    .fill(Theme.foreground.opacity(0.12))
                    .frame(height: Theme.Border.widthThin)
                itemsList(entry, assignments: assignments, memberById: memberById, currency: currency)

                HStack(spacing: 6) {
                    memberChips(for: entry, members: members, memberById: memberById)
                }
                .padding(.top, 4)
            }
        }
        .padding(Theme.Spacing.md)
        .frame(maxWidth: .infinity, alignment: .leading)
        .nbCard(radius: Theme.Radius.md, shadow: Theme.Shadow.sm)
    }

    @ViewBuilder
    private func itemsList(
        _ entry: GroupReceiptEntry,
        assignments: [GroupReceiptItemAssignment],
        memberById: [String: GroupReceiptMember],
        currency: String
    ) -> some View {
        let items = entry.receiptItems ?? []
        if items.isEmpty {
            Text(locale.t("groupReceipts.noItems"))
                .font(AppFont.caption)
                .foregroundColor(Theme.mutedForeground)
        } else {
            VStack(spacing: 6) {
                ForEach(items) { item in
                    let itemAssignments = assignments.filter { $0.receiptItemId == item.id }
                    let assignedNames = itemAssignments
                        .compactMap { memberById[$0.memberId]?.name }
                        .joined(separator: ", ")
                    HStack(alignment: .top, spacing: Theme.Spacing.xs) {
                        VStack(alignment: .leading, spacing: 2) {
                            HStack(spacing: 6) {
                                Text(item.name)
                                    .font(AppFont.body)
                                    .foregroundColor(Theme.foreground)
                                    .lineLimit(1)
                                if let q = item.quantity, q != 1 {
                                    Text("× \(formatQty(q))")
                                        .font(AppFont.mono(11))
                                        .foregroundColor(Theme.mutedForeground)
                                }
                            }
                            if !assignedNames.isEmpty {
                                Text(assignedNames)
                                    .font(AppFont.caption)
                                    .foregroundColor(Theme.mutedForeground)
                                    .lineLimit(2)
                            } else {
                                Text(locale.t("groupReceipts.unassigned"))
                                    .font(AppFont.mono(10))
                                    .tracking(0.5)
                                    .textCase(.uppercase)
                                    .foregroundColor(Theme.destructive)
                            }
                        }
                        Spacer()
                        if let price = item.displayPrice {
                            Text(Fmt.amount(price, currency: currency))
                                .font(AppFont.mono(13))
                                .foregroundColor(Theme.foreground)
                        }
                    }
                    .padding(.vertical, 4)
                }
            }
        }
    }

    @ViewBuilder
    private func memberChips(
        for entry: GroupReceiptEntry,
        members: [GroupReceiptMember],
        memberById: [String: GroupReceiptMember]
    ) -> some View {
        let involvedIds = Set((entry.assignments ?? []).map(\.memberId))
        if !involvedIds.isEmpty {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 6) {
                    ForEach(Array(involvedIds), id: \.self) { id in
                        if let m = memberById[id] {
                            HStack(spacing: 4) {
                                Circle()
                                    .fill(Color(hex: m.color ?? "") ?? Theme.muted)
                                    .frame(width: 10, height: 10)
                                Text(m.name)
                                    .font(AppFont.mono(10))
                                    .tracking(0.5)
                                    .foregroundColor(Theme.foreground)
                            }
                            .padding(.horizontal, 8)
                            .padding(.vertical, 4)
                            .background(Theme.muted)
                            .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.sm))
                            .overlay(
                                RoundedRectangle(cornerRadius: Theme.Radius.sm)
                                    .stroke(Theme.foreground, lineWidth: Theme.Border.widthThin)
                            )
                        }
                    }
                }
            }
        }
    }

    private func formatQty(_ q: Double) -> String {
        if q.truncatingRemainder(dividingBy: 1) == 0 {
            return String(Int(q))
        }
        return String(format: "%g", q)
    }
}

// MARK: - ViewModel

@MainActor
final class GroupReceiptsViewModel: ObservableObject {
    @Published var data: GroupReceiptsResponse?
    @Published var isLoading = false
    @Published var errorMessage: String?

    func load(groupId: String) async {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }
        do {
            data = try await GroupsRepo.receipts(groupId: groupId)
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}
