import SwiftUI

/// Wiersz terminu: data, obowiązek, podmiot, kwota. Po terminie na czerwono.
struct ObligationRow: View {
    let item: AccountingObligation
    var inset: CGFloat = Theme.Spacing.md

    @EnvironmentObject private var locale: AppLocale

    var body: some View {
        let days = ObligationSchedule.daysLeft(item)
        let late = item.isOpen && (days ?? 0) < 0
        CompanyRow(
            lead: Fmt.dayMonth(item.dueDate.isEmpty ? nil : item.dueDate),
            leadColor: late ? Theme.destructive : Theme.mutedForeground,
            title: item.kindLabel,
            subtitle: [item.entityName, CompanyFormat.period(item.period)].filter { !$0.isEmpty }.joined(separator: " · "),
            value: locale.obligationValue(item),
            valueColor: item.isTask || !item.isOpen ? Theme.mutedForeground : (late ? Theme.destructive : Theme.foreground),
            note: item.isOpen ? locale.deadline(days) : locale.t(item.status.labelKey),
            noteColor: late ? Theme.destructive : (item.status == .done ? Theme.success : Theme.mutedForeground),
            inset: inset
        )
    }
}

/// Terminy podatkowe i sprawozdawcze. Odhaczanie zostaje na webie.
struct ObligationsView: View {
    @EnvironmentObject private var accounting: AccountingStore
    @EnvironmentObject private var locale: AppLocale

    @State private var showAll = false
    @State private var entity: String?

    var body: some View {
        ZStack {
            PaperBackground()
            VStack(spacing: Theme.Spacing.sm) {
                Picker("", selection: $showAll) {
                    Text(locale.t("company.open2")).tag(false)
                    Text(locale.t("expenses.scopeAll")).tag(true)
                }
                .pickerStyle(.segmented)
                .padding(.horizontal, Theme.Spacing.md)
                EntityChips(selection: $entity)
                if showAll {
                    AllObligationsList(list: accounting.allObligations(entity: entity)).id(entity)
                } else {
                    openList
                }
            }
            .padding(.top, Theme.Spacing.sm)
        }
        .navigationTitle(locale.t("company.deadlines"))
        .navigationBarTitleDisplayMode(.inline)
        .task { accounting.ensureLoaded() }
    }

    private struct Group: Identifiable {
        let titleKey: String
        let items: [AccountingObligation]
        var id: String { titleKey }
    }

    private var groups: [Group] {
        let mine = accounting.openObligations.filter { entity == nil || $0.entityKey == entity }
        let due = ObligationSchedule.due(mine)
        let late = ObligationSchedule.overdue(due)
        let lateIds = Set(late.map(\.id)), dueIds = Set(due.map(\.id))
        return [
            Group(titleKey: "company.overdueGroup", items: late),
            Group(titleKey: "company.next30", items: due.filter { !lateIds.contains($0.id) }),
            Group(titleKey: "company.later", items: mine.filter { !dueIds.contains($0.id) }),
        ].filter { !$0.items.isEmpty }
    }

    private var openList: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Theme.Spacing.md) {
                if accounting.failed { StaleNotice { Task { await accounting.refresh() } } }
                if groups.isEmpty {
                    EmptyStateView(icon: "calendar", title: locale.t("company.noDeadlines"))
                }
                ForEach(groups) { group in
                    VStack(alignment: .leading, spacing: Theme.Spacing.sm) {
                        SectionLabel(
                            text: locale.t(group.titleKey),
                            color: group.titleKey == "company.overdueGroup" ? Theme.destructive : Theme.mutedForeground
                        )
                        ObligationRows(items: group.items)
                    }
                }
            }
            .padding(.horizontal, Theme.Spacing.md)
            .padding(.top, Theme.Spacing.xs)
            .padding(.bottom, 96)
        }
        .refreshable { await accounting.refresh() }
    }
}

private struct ObligationRows: View {
    let items: [AccountingObligation]
    var onLast: (() -> Void)?
    @EnvironmentObject private var router: AppRouter

    var body: some View {
        RowsCard(items: items, onLast: onLast) { item in
            Button {
                Haptics.selection()
                router.push(.obligation(item))
            } label: {
                ObligationRow(item: item)
            }
            .buttonStyle(.plain)
        }
    }
}

private struct AllObligationsList: View {
    @ObservedObject var list: PagedList<AccountingObligation>
    @EnvironmentObject private var locale: AppLocale

    var body: some View {
        ScrollView {
            VStack(spacing: Theme.Spacing.md) {
                if list.failed { StaleNotice { Task { await list.refresh() } } }
                if !list.items.isEmpty {
                    ObligationRows(items: list.items, onLast: { Task { await list.loadMore() } })
                    LoadMoreFooter(list: list)
                } else if list.isLoading || list.loadedAt == nil && !list.failed {
                    ForEach(0..<6, id: \.self) { _ in SkeletonBlock(height: 56) }
                } else if !list.failed {
                    EmptyStateView(icon: "calendar", title: locale.t("company.noDeadlines"))
                }
            }
            .padding(.horizontal, Theme.Spacing.md)
            .padding(.top, Theme.Spacing.xs)
            .padding(.bottom, 96)
        }
        .refreshable { await list.refresh() }
        .task { await list.ensureFresh() }
    }
}

/// Szczegół terminu — tylko podgląd i link do weba.
struct ObligationDetailView: View {
    let obligation: AccountingObligation

    @EnvironmentObject private var accounting: AccountingStore
    @EnvironmentObject private var locale: AppLocale

    private var item: AccountingObligation {
        accounting.openObligations.first { $0.id == obligation.id } ?? obligation
    }

    var body: some View {
        let days = ObligationSchedule.daysLeft(item)
        let late = item.isOpen && (days ?? 0) < 0
        ZStack {
            PaperBackground()
            ScrollView {
                VStack(alignment: .leading, spacing: Theme.Spacing.md) {
                    VStack(alignment: .leading, spacing: Theme.Spacing.sm) {
                        SectionLabel(text: item.entityName)
                        Text(locale.obligationValue(item))
                            .font(AppFont.hero)
                            .foregroundColor(late ? Theme.destructive : Theme.foreground)
                            .lineLimit(1)
                            .minimumScaleFactor(0.5)
                        Text(item.kindLabel)
                            .font(AppFont.sectionTitle)
                            .foregroundColor(Theme.foreground)
                        if item.isOpen, let text = locale.deadline(days) {
                            Text(text)
                                .font(AppFont.captionMedium)
                                .foregroundColor(late ? Theme.destructive : Theme.mutedForeground)
                        }
                    }
                    .padding(Theme.Spacing.md)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .paperCard()

                    SolvioWebLink(path: item.webPath)
                    PaperCard(label: locale.t("expenses.details")) {
                        DetailLines(entries: [
                            .init(label: locale.t("company.dueDate"), value: Fmt.date(item.dueDate)),
                            .init(label: locale.t("company.period"), value: CompanyFormat.period(item.period)),
                            .init(label: locale.t("company.status"), value: locale.t(item.status.labelKey)),
                            .init(label: locale.t("company.calculated"), value: item.amount == nil ? "" : CompanyFormat.amount(item.amount)),
                            .init(label: locale.t("company.paidAmount"), value: item.paidAmount == nil ? "" : CompanyFormat.amount(item.paidAmount)),
                            .init(label: locale.t("expenses.notes"), value: item.note),
                        ])
                    }
                    Text(locale.t("company.readOnlyHint"))
                        .font(AppFont.caption)
                        .foregroundColor(Theme.mutedForeground)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .padding(Theme.Spacing.md)
                .padding(.bottom, 96)
            }
        }
        .navigationTitle(locale.t("company.deadline"))
        .navigationBarTitleDisplayMode(.inline)
    }
}
