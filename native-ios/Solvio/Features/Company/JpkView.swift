import SwiftUI

/// Wysłane pliki JPK — tylko podgląd. Wysyłka i podpis są na webie.
struct JpkView: View {
    @EnvironmentObject private var accounting: AccountingStore
    @EnvironmentObject private var locale: AppLocale

    var body: some View {
        ZStack {
            PaperBackground()
            JpkList(list: accounting.jpk(), visit: accounting.webVisits)
        }
        .navigationTitle(locale.t("company.jpk"))
        .navigationBarTitleDisplayMode(.inline)
    }
}

private struct JpkList: View {
    @ObservedObject var list: PagedList<AccountingJpk>
    let visit: Int
    @EnvironmentObject private var locale: AppLocale
    @EnvironmentObject private var router: AppRouter

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Theme.Spacing.md) {
                if list.failed { StaleNotice { Task { await list.refresh() } } }
                if !list.items.isEmpty {
                    RowsCard(items: list.items) { item in
                        if let page = WebPage(path: SolvioWeb.entityPath(item.entityKey, tab: "jpk")) {
                            Button { router.web = page } label: { row(item) }
                                .buttonStyle(.plain)
                                .accessibilityHint(locale.t("company.openInSolvio"))
                        } else {
                            row(item)
                        }
                    }
                    Text(locale.t("company.jpkHint"))
                        .font(AppFont.caption)
                        .foregroundColor(Theme.mutedForeground)
                        .fixedSize(horizontal: false, vertical: true)
                } else if list.isLoading || (list.loadedAt == nil && !list.failed) {
                    ForEach(0..<4, id: \.self) { _ in SkeletonBlock(height: 60) }
                } else if !list.failed {
                    EmptyStateView(icon: "doc.badge.gearshape", title: locale.t("company.noJpk"))
                }
            }
            .padding(Theme.Spacing.md)
            .padding(.bottom, 96)
        }
        .refreshable { await list.refresh() }
        .task(id: visit) { await list.ensureFresh() }
    }

    private func row(_ item: AccountingJpk) -> some View {
        CompanyRow(
            lead: item.createdAt.map { Fmt.dayMonth(instant: $0) },
            title: [item.entityName, CompanyFormat.period(item.period)].filter { !$0.isEmpty }.joined(separator: " · "),
            subtitle: [item.statusLabel, item.isTest ? locale.t("company.jpkTest") : ""].filter { !$0.isEmpty }.joined(separator: " · "),
            value: item.hasUpo ? "UPO" : "—",
            valueColor: item.hasUpo ? Theme.success : Theme.mutedForeground,
            note: item.accepted ? locale.t("company.accepted") : nil,
            noteColor: Theme.success
        )
    }
}
