import SwiftUI

/// Zakładka Firma — pieniądze firmowe z CRM-a Programo. Prywatnych wydatków
/// tu nie ma i nie wolno ich tu dołożyć: od nich są Panel i Wydatki.
///
/// Sekcje księgowe znikają, gdy backend ich nie ma (404) albo klucz nie ma do
/// nich dostępu; wtedy zostają Finanse i bank, jak przed tą zakładką.
struct CompanyView: View {
    @EnvironmentObject private var crm: CrmStore
    @EnvironmentObject private var accounting: AccountingStore
    @EnvironmentObject private var locale: AppLocale
    @EnvironmentObject private var router: AppRouter

    private var showsAccounting: Bool { accounting.available == true }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Theme.Spacing.md) {
                header
                notices
                if showsAccounting {
                    DueCard()
                } else if accounting.available == nil, accounting.loading {
                    SkeletonBlock(height: 180)
                }
                shortcuts
                if crm.hasBank { bankCard }
                if showsAccounting { settlementsCard }
                resultCard
                if showsAccounting { entitiesSection }
            }
            .padding(Theme.Spacing.md)
            .padding(.bottom, 96)
        }
        .refreshable { await refresh() }
        .task {
            crm.ensureLoaded()
            accounting.ensureLoaded()
        }
    }

    private func refresh() async {
        async let finance: Void = crm.reload()
        async let books: Void = accounting.refresh()
        _ = await (finance, books)
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(locale.t("nav.company"))
                .font(AppFont.pageTitle)
                .foregroundColor(Theme.foreground)
            SectionLabel(text: locale.t("company.subtitle"))
        }
        .padding(.top, Theme.Spacing.xs)
    }

    @ViewBuilder
    private var notices: some View {
        if accounting.failed || crm.error != nil {
            ErrorBanner(message: locale.t("company.refreshFailed")) { Task { await refresh() } }
        }
    }

    // MARK: - Wejścia do list

    private struct Shortcut: Identifiable {
        let labelKey: String
        let icon: String
        let route: AppRoute
        var id: String { labelKey }
    }

    private var shortcutItems: [Shortcut] {
        var items: [Shortcut] = []
        if showsAccounting {
            items += [
                Shortcut(labelKey: "company.deadlines", icon: "calendar", route: .obligations),
                Shortcut(labelKey: "company.invoices", icon: "doc.text", route: .documents(.sale, status: nil)),
                Shortcut(labelKey: "company.costs", icon: "cart", route: .documents(.purchase, status: nil)),
                Shortcut(labelKey: "company.jpk", icon: "doc.badge.gearshape", route: .jpk),
            ]
        }
        items.append(Shortcut(labelKey: "company.entries", icon: "list.bullet.rectangle", route: .crm(.entries)))
        if crm.hasBank {
            items.append(Shortcut(labelKey: "crm.bank", icon: "building.columns", route: .crm(.bank)))
        }
        items += [
            Shortcut(labelKey: "company.commitments", icon: "arrow.triangle.2.circlepath", route: .crm(.commitments)),
            Shortcut(labelKey: "crm.clientsSection", icon: "person.2", route: .crm(.clients)),
        ]
        return items
    }

    @ScaledMetric(relativeTo: .body) private var tileWidth: CGFloat = 78

    private var shortcuts: some View {
        LazyVGrid(
            columns: [GridItem(.adaptive(minimum: tileWidth), spacing: Theme.Spacing.sm)],
            spacing: Theme.Spacing.sm
        ) {
            ForEach(shortcutItems) { item in
                Button {
                    Haptics.selection()
                    router.push(item.route)
                } label: {
                    VStack(spacing: 6) {
                        Image(systemName: item.icon)
                            .font(.system(size: 17, weight: .medium))
                            .foregroundColor(Theme.primary)
                            .frame(height: 22)
                        Text(locale.t(item.labelKey))
                            .font(AppFont.captionMedium)
                            .foregroundColor(Theme.foreground)
                            .lineLimit(1)
                            .minimumScaleFactor(0.75)
                    }
                    .padding(.horizontal, 6)
                    .padding(.vertical, 12)
                    .frame(maxWidth: .infinity)
                    .paperCard(radius: Theme.Radius.md, shadow: 0)
                }
            }
        }
    }

    // MARK: - Karty

    private var bankCard: some View {
        PaperCard(label: locale.t("crm.bankOnAccount")) {
            CrmBankBalances(showsLabel: false)
        } trailing: {
            CardLink(label: locale.t("crm.bank"), route: .crm(.bank))
        }
    }

    private var settlementsCard: some View {
        PaperCard(label: locale.t("company.settlements")) {
            VStack(spacing: 0) {
                settlement("company.receivables", accounting.receivables, .documents(.sale, status: .unpaid))
                Divider().overlay(Theme.border)
                settlement("company.payables", accounting.payables, .documents(.purchase, status: .unpaid))
            }
            // Wiersze niosą własny odstęp; bez tego karta miałaby podwójny.
            .padding(.vertical, -Theme.Spacing.sm)
        }
    }

    private func settlement(_ key: String, _ totals: AccountingTotals, _ route: AppRoute) -> some View {
        Button {
            Haptics.selection()
            router.push(route)
        } label: {
            CompanyRow(
                title: locale.t(key),
                subtitle: locale.pluralized("company.documentsCount", count: totals.count),
                value: CompanyFormat.amount(totals.gross),
                inset: 0
            )
        }
        .buttonStyle(.plain)
    }

    private var resultCard: some View {
        PaperCard(title: locale.t("company.monthResult"), label: resultPeriod) {
            VStack(alignment: .leading, spacing: Theme.Spacing.md) {
                CrmResultFigures()
                if let balance = crm.latestBalance, !crm.hasBank {
                    Divider().overlay(Theme.border)
                    CrmBalanceRow(balance: balance)
                }
                if let mrr = crm.summary?.mrr, mrr.total > 0 {
                    Divider().overlay(Theme.border)
                    CrmMrrRow(mrr: mrr)
                }
            }
        } trailing: {
            CardLink(label: locale.t("company.entries"), route: .crm(.entries))
        }
    }

    /// Miesiąc, którego dotyczą sumy — z odpowiedzi CRM-a, nie z paska.
    private var resultPeriod: String {
        if let month = crm.summary?.month {
            return CompanyFormat.period(String(format: "%04d-%02d", month.year, month.month))
        }
        return Fmt.monthYear(crm.month)
    }

    private var entitiesSection: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.md) {
            VStack(alignment: .leading, spacing: 2) {
                Text(locale.t("company.entities"))
                    .font(AppFont.sectionTitle)
                    .foregroundColor(Theme.foreground)
                if let label = accounting.overview?.periodLabel, !label.isEmpty {
                    SectionLabel(text: label)
                }
            }
            .padding(.top, Theme.Spacing.xs)
            ForEach(accounting.entities) { EntityCard(entity: $0) }
        }
    }
}

/// Odnośnik w nagłówku karty.
struct CardLink: View {
    let label: String
    let route: AppRoute
    @EnvironmentObject private var router: AppRouter

    var body: some View {
        Button {
            Haptics.selection()
            router.push(route)
        } label: {
            Text(label)
                .font(AppFont.captionMedium)
                .foregroundColor(Theme.primary)
        }
    }
}

// MARK: - Do zapłaty

/// Otwarte terminy po czasie i w najbliższych 30 dniach.
private struct DueCard: View {
    @EnvironmentObject private var accounting: AccountingStore
    @EnvironmentObject private var locale: AppLocale
    @EnvironmentObject private var router: AppRouter

    /// Tyle wierszy bez przewijania do reszty ekranu. Po terminie widać wszystkie.
    private let minRows = 5

    var body: some View {
        let due = ObligationSchedule.due(accounting.openObligations)
        let overdue = ObligationSchedule.overdue(due)
        let shown = max(minRows, overdue.count)
        PaperCard(title: locale.t("company.toPay"), label: locale.t("company.toPayWindow")) {
            VStack(alignment: .leading, spacing: Theme.Spacing.sm) {
                if due.isEmpty {
                    Text(locale.t("company.nothingDue"))
                        .font(AppFont.caption)
                        .foregroundColor(Theme.mutedForeground)
                } else {
                    totals(due, overdue)
                    VStack(spacing: 0) {
                        ForEach(due.prefix(shown)) { item in
                            Divider().overlay(Theme.border)
                            Button {
                                Haptics.selection()
                                router.push(.obligation(item))
                            } label: {
                                ObligationRow(item: item, inset: 0)
                            }
                            .buttonStyle(.plain)
                        }
                        if due.count > shown {
                            Divider().overlay(Theme.border)
                            Button {
                                router.push(.obligations)
                            } label: {
                                Text(locale.pluralized("company.moreDeadlines", count: due.count - shown))
                                    .font(AppFont.captionMedium)
                                    .foregroundColor(Theme.primary)
                                    .frame(maxWidth: .infinity, alignment: .leading)
                                    .padding(.vertical, 11)
                            }
                        }
                    }
                }
            }
        } trailing: {
            CardLink(label: locale.t("company.deadlines"), route: .obligations)
        }
    }

    private func totals(_ due: [AccountingObligation], _ overdue: [AccountingObligation]) -> some View {
        let total = ObligationSchedule.total(due)
        let late = ObligationSchedule.total(overdue)
        return VStack(alignment: .leading, spacing: 3) {
            Text(Fmt.amount(total.amount, currency: "PLN"))
                .font(AppFont.hero)
                .foregroundColor(Theme.foreground)
                .lineLimit(1)
                .minimumScaleFactor(0.5)
            if late.amount > 0 {
                Text(locale.t("company.ofWhichOverdue") + " " + Fmt.amount(late.amount, currency: "PLN"))
                    .font(AppFont.captionMedium)
                    .foregroundColor(Theme.destructive)
            }
            if total.missing > 0 {
                Text(locale.pluralized("company.withoutAmount", count: total.missing))
                    .font(AppFont.caption)
                    .foregroundColor(Theme.mutedForeground)
            }
        }
    }
}

// MARK: - Podmiot

private struct EntityCard: View {
    let entity: AccountingEntity
    @EnvironmentObject private var locale: AppLocale

    var body: some View {
        PaperCard(title: entity.name, label: forms) {
            VStack(alignment: .leading, spacing: Theme.Spacing.sm) {
                DetailLines(entries: [
                    .init(label: locale.t("company.revenue"), value: CompanyFormat.amount(entity.revenue)),
                    .init(label: "ZUS", value: CompanyFormat.amount(entity.zus)),
                    .init(label: entity.incomeTaxLabel.isEmpty ? locale.t("company.incomeTax") : entity.incomeTaxLabel,
                          value: CompanyFormat.amount(entity.incomeTax)),
                    .init(label: "VAT", value: CompanyFormat.amount(entity.vat)),
                    .init(label: locale.t("company.totalToPay"), value: CompanyFormat.amount(entity.totalToPay), emphasized: true),
                ])
                if entity.overdue > 0 {
                    Text(locale.pluralized("company.overdueCount", count: entity.overdue))
                        .font(AppFont.captionMedium)
                        .foregroundColor(Theme.destructive)
                }
                ForEach(entity.warnings, id: \.self) { warning in
                    HStack(alignment: .firstTextBaseline, spacing: 6) {
                        Image(systemName: "exclamationmark.circle")
                            .font(.system(size: 11, weight: .semibold))
                            .foregroundColor(Theme.warning)
                        Text(warning)
                            .font(AppFont.caption)
                            .foregroundColor(Theme.foreground)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
            }
        } trailing: {
            SolvioWebLink(path: SolvioWeb.entityPath(entity.key), compact: true)
        }
    }

    private var forms: String? {
        let text = [entity.taxFormLabel, entity.vatLabel].filter { !$0.isEmpty }.joined(separator: " · ")
        return text.isEmpty ? nil : text
    }
}
