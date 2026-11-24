import SwiftUI

/// Karta „Firma" na Panelu — przychody, koszty i wynik miesiąca z CRM-a
/// plus MRR i zobowiązania cykliczne. Pełny obraz jest w zakładce Firma.
///
/// Pojawia się WYŁĄCZNIE, gdy konto ma wpięty CRM. Bez tego byłaby pustą
/// zachętą do integracji na ekranie, który ma pokazywać pieniądze.
struct CrmSummaryCard: View {
    @EnvironmentObject private var crm: CrmStore
    @EnvironmentObject private var locale: AppLocale
    @EnvironmentObject private var router: AppRouter

    var body: some View {
        if crm.connected == true {
            PaperCard(title: locale.t("crm.company"), label: locale.t("crm.section")) {
                VStack(alignment: .leading, spacing: Theme.Spacing.md) {
                    CrmResultFigures()
                    if crm.hasBank {
                        Divider().overlay(Theme.border)
                        CrmBankBalances()
                    }
                    if let balance = crm.latestBalance {
                        Divider().overlay(Theme.border)
                        CrmBalanceRow(balance: balance)
                    }
                    if let mrr = crm.summary?.mrr, mrr.total > 0 {
                        Divider().overlay(Theme.border)
                        CrmMrrRow(mrr: mrr)
                    }
                    if !crm.activeCommitments.isEmpty {
                        Divider().overlay(Theme.border)
                        commitmentsSection
                    }
                }
            } trailing: {
                Button {
                    router.selectedTab = .company
                } label: {
                    Text(locale.t("company.open"))
                        .font(AppFont.captionMedium)
                        .foregroundColor(Theme.primary)
                }
            }
            .task { crm.ensureLoaded() }
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

// MARK: - Klocki wspólne dla Panelu i Firmy

/// Przychody, koszty i wynik miesiąca. Bez sum z CRM-a są kreski, nie zera.
struct CrmResultFigures: View {
    @EnvironmentObject private var crm: CrmStore
    @EnvironmentObject private var locale: AppLocale
    @Environment(\.dynamicTypeSize) private var typeSize

    var body: some View {
        // Przy dużej czcionce trzy kolumny ucinałyby kwoty — wtedy jedna pod drugą.
        let layout = typeSize.isAccessibilitySize
            ? AnyLayout(VStackLayout(alignment: .leading, spacing: Theme.Spacing.sm))
            : AnyLayout(HStackLayout(alignment: .top, spacing: Theme.Spacing.sm))
        let month = crm.summary?.month
        let balanceColor = (month?.balance ?? 0) >= 0 ? Theme.foreground : Theme.destructive
        layout {
            figure(locale.t("crm.income"), month?.income, Theme.success)
            figure(locale.t("crm.costs"), month?.expense, Theme.destructive)
            figure(locale.t("crm.result"), month?.balance, balanceColor)
        }
    }

    private func figure(_ label: String, _ value: Double?, _ color: Color) -> some View {
        VStack(alignment: .leading, spacing: 3) {
            SectionLabel(text: label)
                .lineLimit(1)
                .minimumScaleFactor(0.7)
            Text(value.map { Fmt.amount($0, currency: "PLN") } ?? "—")
                .font(AppFont.semibold(15))
                .foregroundColor(value == nil ? Theme.mutedForeground : color)
                .lineLimit(1)
                .minimumScaleFactor(0.6)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

/// Ostatni ręczny odczyt stanu konta z CRM-a. Data jest tu równie ważna
/// jak kwota: odczyt sprzed miesiąca nie mówi, ile jest na koncie dziś.
struct CrmBalanceRow: View {
    let balance: CrmBalance
    @EnvironmentObject private var locale: AppLocale

    var body: some View {
        AmountLine(label: locale.t("crm.accountBalance")) {
            Text(Fmt.amount(balance.amount, currency: "PLN"))
                .font(AppFont.amount)
                .foregroundColor(Theme.foreground)
            Text(Fmt.dayMonth(balance.at))
                .font(AppFont.caption)
                .foregroundColor(Theme.mutedForeground)
        }
    }
}

/// Saldo firmowych rachunków z banku. Przy kilku rachunkach pokazujemy
/// też każdy z osobna — sama suma nie mówi, gdzie leżą pieniądze.
struct CrmBankBalances: View {
    /// Na Firmie etykietę niesie już nagłówek karty.
    var showsLabel = true

    @EnvironmentObject private var crm: CrmStore
    @EnvironmentObject private var locale: AppLocale

    var body: some View {
        let accounts = crm.activeBankAccounts
        let totals = crm.bankTotals
        let text = totals.isEmpty ? "—" : totals.map { Fmt.amount($0.amount, currency: $0.currency) }.joined(separator: " · ")
        VStack(alignment: .leading, spacing: Theme.Spacing.sm) {
            if showsLabel {
                AmountLine(label: locale.t("crm.bankOnAccount")) {
                    amount(text, font: AppFont.amount)
                    date(accounts)
                }
            } else {
                HStack(alignment: .firstTextBaseline, spacing: Theme.Spacing.sm) {
                    amount(text, font: AppFont.amountLarge)
                    date(accounts)
                }
            }
            if accounts.count > 1 {
                ForEach(accounts) { account in
                    HStack(spacing: Theme.Spacing.sm) {
                        Text(account.name)
                            .font(AppFont.captionMedium)
                            .foregroundColor(Theme.foreground)
                            .lineLimit(1)
                        Spacer(minLength: Theme.Spacing.sm)
                        Text(account.balance.map { Fmt.amount($0, currency: account.currency) } ?? "—")
                            .font(AppFont.mono(11))
                            .foregroundColor(Theme.foreground)
                            .layoutPriority(1)
                    }
                }
            }
        }
    }

    private func amount(_ text: String, font: Font) -> some View {
        Text(text)
            .font(font)
            .foregroundColor(Theme.foreground)
            .lineLimit(1)
            .minimumScaleFactor(0.6)
    }

    @ViewBuilder
    private func date(_ accounts: [CrmBankAccount]) -> some View {
        if let at = accounts.compactMap(\.balanceAt).min() {
            Text(Fmt.dayMonth(at))
                .font(AppFont.caption)
                .foregroundColor(Theme.mutedForeground)
        }
    }
}

struct CrmMrrRow: View {
    let mrr: CrmMrr
    @EnvironmentObject private var locale: AppLocale

    var body: some View {
        AmountLine(label: "MRR") {
            Text(Fmt.amount(mrr.total, currency: "PLN"))
                .font(AppFont.amount)
                .foregroundColor(Theme.foreground)
            Text(locale.pluralized("crm.clientsCount", count: mrr.clientCount))
                .font(AppFont.caption)
                .foregroundColor(Theme.mutedForeground)
        }
    }
}

/// Etykieta po lewej, kwota z dopiskiem po prawej. Przy dużej czcionce kwota
/// schodzi pod etykietę, zamiast się uciąć.
struct AmountLine<Value: View>: View {
    let label: String
    @ViewBuilder var value: () -> Value
    @Environment(\.dynamicTypeSize) private var typeSize

    var body: some View {
        if typeSize.isAccessibilitySize {
            VStack(alignment: .leading, spacing: 2) {
                SectionLabel(text: label)
                HStack(alignment: .firstTextBaseline, spacing: Theme.Spacing.sm) { value() }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        } else {
            HStack(spacing: Theme.Spacing.sm) {
                SectionLabel(text: label).layoutPriority(-1)
                Spacer(minLength: Theme.Spacing.sm)
                value()
            }
        }
    }
}
