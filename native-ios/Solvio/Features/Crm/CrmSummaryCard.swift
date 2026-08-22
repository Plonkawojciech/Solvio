import SwiftUI

/// Karta „Firma" na Panelu — przychody, koszty i wynik miesiąca z CRM-a
/// plus MRR i zobowiązania cykliczne.
///
/// Pojawia się WYŁĄCZNIE, gdy konto ma wpięty CRM. Bez tego byłaby pustą
/// zachętą do integracji na ekranie, który ma pokazywać pieniądze.
struct CrmSummaryCard: View {
    @EnvironmentObject private var crm: CrmStore
    @EnvironmentObject private var locale: AppLocale

    var body: some View {
        if crm.connected == true {
            PaperCard(title: locale.t("crm.company"), label: locale.t("crm.section")) {
                VStack(alignment: .leading, spacing: Theme.Spacing.md) {
                    figures
                    if let balance = crm.latestBalance {
                        Divider().overlay(Theme.border)
                        balanceRow(balance)
                    }
                    if let mrr = crm.summary?.mrr, mrr.total > 0 {
                        Divider().overlay(Theme.border)
                        mrrRow(mrr)
                    }
                    if !crm.activeCommitments.isEmpty {
                        Divider().overlay(Theme.border)
                        commitmentsSection
                    }
                }
            }
            .task { crm.ensureLoaded() }
        }
    }

    private var figures: some View {
        HStack(spacing: Theme.Spacing.md) {
            figure(locale.t("crm.income"), crm.monthIncome, Theme.success)
            figure(locale.t("crm.costs"), crm.monthExpense, Theme.destructive)
            figure(locale.t("crm.result"), crm.monthBalance, crm.monthBalance >= 0 ? Theme.foreground : Theme.destructive)
        }
    }

    private func figure(_ label: String, _ value: Double, _ color: Color) -> some View {
        VStack(alignment: .leading, spacing: 3) {
            SectionLabel(text: label)
            Text(Fmt.amount(value, currency: "PLN"))
                .font(AppFont.semibold(15))
                .foregroundColor(color)
                .lineLimit(1)
                .minimumScaleFactor(0.6)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    /// Ostatni ręczny odczyt stanu konta z CRM-a. Data jest tu równie ważna
    /// jak kwota: odczyt sprzed miesiąca nie mówi, ile jest na koncie dziś.
    private func balanceRow(_ balance: CrmBalance) -> some View {
        HStack(spacing: Theme.Spacing.sm) {
            SectionLabel(text: locale.t("crm.accountBalance"))
            Spacer(minLength: Theme.Spacing.sm)
            Text(Fmt.amount(balance.amount, currency: "PLN"))
                .font(AppFont.amount)
                .foregroundColor(Theme.foreground)
            Text(Fmt.dayMonth(balance.at))
                .font(AppFont.caption)
                .foregroundColor(Theme.mutedForeground)
        }
    }

    private func mrrRow(_ mrr: CrmMrr) -> some View {
        HStack(spacing: Theme.Spacing.sm) {
            SectionLabel(text: "MRR")
            Spacer(minLength: Theme.Spacing.sm)
            Text(Fmt.amount(mrr.total, currency: "PLN"))
                .font(AppFont.amount)
                .foregroundColor(Theme.foreground)
            Text(locale.pluralized("crm.clientsCount", count: mrr.clientCount))
                .font(AppFont.caption)
                .foregroundColor(Theme.mutedForeground)
        }
    }

    private var commitmentsSection: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.sm) {
            SectionLabel(text: locale.t("crm.commitments"))
            ForEach(crm.activeCommitments.prefix(5)) { c in
                HStack(spacing: Theme.Spacing.sm) {
                    Image(systemName: c.isIncome ? "arrow.down.left" : "arrow.up.right")
                        .font(.system(size: 10, weight: .bold))
                        .foregroundColor(c.isIncome ? Theme.success : Theme.mutedForeground)
                    VStack(alignment: .leading, spacing: 1) {
                        Text(c.title)
                            .font(AppFont.captionMedium)
                            .foregroundColor(Theme.foreground)
                            .lineLimit(1)
                        Text([c.clientName, locale.t(c.cadenceKey)].compactMap { $0 }.joined(separator: " · "))
                            .font(AppFont.caption)
                            .foregroundColor(Theme.mutedForeground)
                            .lineLimit(1)
                    }
                    Spacer(minLength: Theme.Spacing.sm)
                    Text(Fmt.amount(c.amount, currency: "PLN"))
                        .font(AppFont.mono(11))
                        .foregroundColor(c.isIncome ? Theme.success : Theme.foreground)
                }
            }
        }
    }
}
