import SwiftUI

/// Zobowiązania cykliczne CRM-a — serie, z których co miesiąc powstaje wpis
/// (abonamenty, ZUS, serwery). Pokazujemy je, żeby było wiadomo, skąd bierze
/// się koszt, którego nikt ręcznie nie dodawał.
///
/// Przytrzymanie włącza i wyłącza serię. Wyłączenie zatrzymuje kolejne
/// materializacje, ale nie rusza historii — inaczej niż usunięcie, które
/// kasuje samą serię (wpisy zostają, CRM odpina je przez `SetNull`).
struct CrmCommitmentsList: View {
    @EnvironmentObject private var crm: CrmStore
    @EnvironmentObject private var locale: AppLocale

    @Binding var editing: CrmCommitment?
    @Binding var creating: Bool

    var body: some View {
        Group {
            if crm.commitments.isEmpty {
                EmptyStateView(
                    icon: "arrow.triangle.2.circlepath",
                    title: locale.t("crm.emptyCommitments"),
                    subtitle: locale.t("crm.emptyCommitmentsHint"),
                    actionTitle: locale.t("crm.newCommitment"),
                    action: { creating = true }
                )
                .padding(.top, Theme.Spacing.lg)
            } else {
                list
            }
        }
    }

    private var list: some View {
        ScrollView {
            totals
            LazyVStack(spacing: 0) {
                ForEach(crm.commitments) { item in
                    Button {
                        Haptics.selection()
                        editing = item
                    } label: {
                        row(item)
                    }
                    .contextMenu {
                        Button {
                            Task { await crm.setCommitmentActive(item, active: !item.active) }
                        } label: {
                            Label(
                                item.active ? locale.t("crm.pause") : locale.t("crm.resume"),
                                systemImage: item.active ? "pause.circle" : "play.circle"
                            )
                        }
                        Button(role: .destructive) {
                            Task { await crm.deleteCommitment(item) }
                        } label: {
                            Label(locale.t("common.delete"), systemImage: "trash")
                        }
                    }
                    if item.id != crm.commitments.last?.id {
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
        .refreshable { await crm.refreshContext() }
    }

    /// Ile serie zabierają i przynoszą miesięcznie. Kwartalne i roczne
    /// dzielimy przez okres — inaczej rachunek za domenę wyglądałby jak
    /// koszt stały i zawyżał obraz miesiąca.
    private var totals: some View {
        let active = crm.activeCommitments
        let monthlyIn = active.filter(\.isIncome).reduce(0.0) { $0 + $1.amount / Double($1.intervalMonths) }
        let monthlyOut = active.filter { !$0.isIncome }.reduce(0.0) { $0 + $1.amount / Double($1.intervalMonths) }

        return HStack(spacing: Theme.Spacing.sm) {
            total(locale.t("crm.monthlyIn"), monthlyIn, Theme.success)
            total(locale.t("crm.monthlyOut"), monthlyOut, Theme.destructive)
        }
        .padding(.horizontal, Theme.Spacing.md)
        .padding(.bottom, Theme.Spacing.sm)
    }

    private func total(_ label: String, _ value: Double, _ color: Color) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            SectionLabel(text: label)
            Text(Fmt.amount(value, currency: "PLN"))
                .font(AppFont.semibold(14))
                .foregroundColor(color)
                .lineLimit(1)
                .minimumScaleFactor(0.6)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(Theme.Spacing.sm + 2)
        .paperCard(radius: Theme.Radius.md, shadow: 0)
    }

    private func row(_ item: CrmCommitment) -> some View {
        HStack(spacing: Theme.Spacing.sm) {
            Image(systemName: item.isIncome ? "arrow.down.left" : "arrow.up.right")
                .font(.system(size: 10, weight: .bold))
                .foregroundColor(item.active ? (item.isIncome ? Theme.success : Theme.destructive) : Theme.mutedForeground)
                .frame(width: 14)

            VStack(alignment: .leading, spacing: 2) {
                Text(item.title)
                    .font(AppFont.bodyMedium)
                    .foregroundColor(item.active ? Theme.foreground : Theme.mutedForeground)
                    .lineLimit(1)
                Text(subtitle(item))
                    .font(AppFont.caption)
                    .foregroundColor(Theme.mutedForeground)
                    .lineLimit(1)
            }
            Spacer(minLength: Theme.Spacing.sm)
            VStack(alignment: .trailing, spacing: 2) {
                Text(Fmt.amount(item.amount, currency: "PLN"))
                    .font(AppFont.amount)
                    .foregroundColor(item.isIncome ? Theme.success : Theme.foreground)
                if !item.active {
                    Text(locale.t("crm.paused"))
                        .font(AppFont.chip)
                        .foregroundColor(Theme.warning)
                }
            }
        }
        .padding(.horizontal, Theme.Spacing.md)
        .padding(.vertical, 11)
        .contentShape(Rectangle())
    }

    private func subtitle(_ item: CrmCommitment) -> String {
        [locale.t(item.cadenceKey), item.category.isEmpty ? nil : item.category, item.clientName]
            .compactMap { $0 }
            .joined(separator: " · ")
    }
}
