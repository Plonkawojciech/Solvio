import SwiftUI

/// Transakcje z firmowych rachunków za oglądany miesiąc — TYLKO odczyt.
///
/// Rozliczenie transakcji z wpisem zatwierdza człowiek w CRM-ie; tu widać
/// tylko, jak sprawa stoi: „rozliczona", „do rozliczenia" albo nic.
/// Sekcja istnieje wyłącznie, gdy CRM oddał przynajmniej jeden rachunek.
struct CrmBankList: View {
    @EnvironmentObject private var crm: CrmStore
    @EnvironmentObject private var locale: AppLocale

    var body: some View {
        let rows = crm.monthBankTransactions
        Group {
            if crm.loading && rows.isEmpty {
                VStack(spacing: Theme.Spacing.sm) {
                    ForEach(0..<5, id: \.self) { _ in SkeletonBlock(height: 56) }
                }
                .padding(Theme.Spacing.md)
            } else if rows.isEmpty {
                EmptyStateView(
                    icon: "building.columns",
                    title: locale.t("crm.bankEmptyMonth"),
                    subtitle: locale.t("crm.bankEmptyMonthHint")
                )
                .padding(.top, Theme.Spacing.lg)
            } else {
                list(rows)
            }
        }
    }

    private func list(_ rows: [CrmBankTransaction]) -> some View {
        ScrollView {
            LazyVStack(spacing: 0) {
                ForEach(rows) { tx in
                    row(tx)
                    if tx.id != rows.last?.id {
                        Divider().overlay(Theme.border).padding(.leading, 44)
                    }
                }
            }
            .background(Theme.card)
            .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.lg, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: Theme.Radius.lg, style: .continuous)
                    .stroke(Theme.border, lineWidth: 1)
            )
            .padding(.horizontal, Theme.Spacing.md)
            .padding(.bottom, 96)
        }
        .refreshable { await crm.reload() }
    }

    private func row(_ tx: CrmBankTransaction) -> some View {
        HStack(spacing: Theme.Spacing.sm) {
            Image(systemName: tx.isIncoming ? "arrow.down.left" : "arrow.up.right")
                .font(.system(size: 10, weight: .bold))
                .foregroundColor(tx.isIncoming ? Theme.success : Theme.mutedForeground)
                .frame(width: 14)

            VStack(alignment: .leading, spacing: 2) {
                Text(tx.counterpartyName ?? tx.description ?? "—")
                    .font(AppFont.bodyMedium)
                    .foregroundColor(Theme.foreground)
                    .lineLimit(1)
                Text(subtitle(tx))
                    .font(AppFont.caption)
                    .foregroundColor(Theme.mutedForeground)
                    .lineLimit(1)
            }
            Spacer(minLength: Theme.Spacing.sm)
            VStack(alignment: .trailing, spacing: 2) {
                Text((tx.isIncoming ? "+" : "−") + Fmt.amount(abs(tx.amount), currency: tx.currency))
                    .font(AppFont.amount)
                    .foregroundColor(tx.isIncoming ? Theme.success : Theme.foreground)
                if let key = tx.statusKey {
                    Text(locale.t(key))
                        .font(AppFont.chip)
                        .foregroundColor(statusColor(tx))
                }
            }
        }
        .padding(.horizontal, Theme.Spacing.md)
        .padding(.vertical, 11)
    }

    /// Data, opis (gdy tytułem jest kontrahent) i rachunek, jeśli jest ich kilka.
    private func subtitle(_ tx: CrmBankTransaction) -> String {
        let description = tx.counterpartyName != nil ? tx.description : nil
        let account = crm.activeBankAccounts.count > 1
            ? crm.bankAccounts.first { $0.id == tx.accountId }?.name
            : nil
        return [Fmt.dayMonth(tx.bookingDate), description, account]
            .compactMap { $0 }
            .joined(separator: " · ")
    }

    private func statusColor(_ tx: CrmBankTransaction) -> Color {
        if tx.isPending { return Theme.mutedForeground }
        return tx.matchStatus == "CONFIRMED" ? Theme.success : Theme.warning
    }
}
