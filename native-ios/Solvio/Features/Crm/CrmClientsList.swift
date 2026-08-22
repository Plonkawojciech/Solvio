import SwiftUI

/// Klienci CRM-a — źródło MRR i adresat wpisów przychodowych.
///
/// Solvio pokazuje ich, bo bez nazwy klienta wpis „Abonament, 1200 zł" nic
/// nie znaczy. Edycja idzie prosto do CRM-a: nie ma tu żadnej kopii, którą
/// trzeba by potem synchronizować.
struct CrmClientsList: View {
    @EnvironmentObject private var crm: CrmStore
    @EnvironmentObject private var locale: AppLocale

    @Binding var editing: CrmClient?
    @Binding var creating: Bool

    var body: some View {
        Group {
            if crm.clients.isEmpty {
                EmptyStateView(
                    icon: "person.2",
                    title: locale.t("crm.emptyClients"),
                    subtitle: locale.t("crm.emptyClientsHint"),
                    actionTitle: locale.t("crm.newClient"),
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
            mrrTile
            LazyVStack(spacing: 0) {
                ForEach(crm.clients) { client in
                    Button {
                        Haptics.selection()
                        editing = client
                    } label: {
                        row(client)
                    }
                    .contextMenu {
                        Button(role: .destructive) {
                            Task { await crm.deleteClient(client) }
                        } label: {
                            Label(locale.t("common.delete"), systemImage: "trash")
                        }
                    }
                    if client.id != crm.clients.last?.id {
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

    /// MRR liczy CRM (`/finance/summary`), nie my — suma abonamentów z listy
    /// klientów i tak nie zgadzałaby się z jego definicją.
    @ViewBuilder
    private var mrrTile: some View {
        if let mrr = crm.summary?.mrr {
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
            .padding(Theme.Spacing.sm + 2)
            .paperCard(radius: Theme.Radius.md, shadow: 0)
            .padding(.horizontal, Theme.Spacing.md)
            .padding(.bottom, Theme.Spacing.sm)
        }
    }

    private func row(_ client: CrmClient) -> some View {
        HStack(spacing: Theme.Spacing.sm) {
            Text(Fmt.initials(client.name))
                .font(AppFont.mono(10))
                .foregroundColor(Theme.mutedForeground)
                .frame(width: 28, height: 28)
                .background(Theme.muted)
                .clipShape(Circle())

            VStack(alignment: .leading, spacing: 2) {
                Text(client.name)
                    .font(AppFont.bodyMedium)
                    .foregroundColor(Theme.foreground)
                    .lineLimit(1)
                Text(subtitle(client))
                    .font(AppFont.caption)
                    .foregroundColor(Theme.mutedForeground)
                    .lineLimit(1)
            }
            Spacer(minLength: Theme.Spacing.sm)
            if client.monthlyFeeValue > 0 {
                Text(Fmt.amount(client.monthlyFeeValue, currency: "PLN"))
                    .font(AppFont.amount)
                    .foregroundColor(Theme.foreground)
            }
        }
        .padding(.horizontal, Theme.Spacing.md)
        .padding(.vertical, 11)
        .contentShape(Rectangle())
    }

    private func subtitle(_ client: CrmClient) -> String {
        [client.statusKey.map { locale.t($0) } ?? client.status, client.service]
            .compactMap { $0 }
            .filter { !$0.isEmpty }
            .joined(separator: " · ")
    }
}
