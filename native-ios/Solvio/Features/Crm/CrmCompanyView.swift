import SwiftUI

/// Sekcje Finansów CRM-a widoczne w apce. Odpowiadają temu, czym da się
/// sterować na `/finanse`: wpisami miesiąca, seriami cyklicznymi i klientami.
enum CrmSection: String, CaseIterable, Identifiable {
    case all, income, expense, commitments, clients, bank
    var id: String { rawValue }

    var labelKey: String {
        switch self {
        case .all:         return "crm.sectionAll"
        case .income:      return "crm.income"
        case .expense:     return "crm.costs"
        case .commitments: return "crm.commitments"
        case .clients:     return "crm.clientsSection"
        case .bank:        return "crm.bank"
        }
    }

    /// Wpisy są miesięczne, rejestry nie — pasek miesiąca dotyczy tylko tych
    /// pierwszych i pokazywanie go nad listą klientów byłoby myleniem tropu.
    var isMonthly: Bool { self == .all || self == .income || self == .expense || self == .bank }

    /// Filtr typu dla list wpisów. `nil` = pokaż wszystko.
    var entryType: String? {
        switch self {
        case .income:  return "INCOME"
        case .expense: return "EXPENSE"
        default:       return nil
        }
    }
}

/// Zakładka „Firma" — wszystko, czym Solvio steruje w crm.programo.pl.
///
/// Nie trzymamy tu kopii danych: każda zmiana leci do CRM-a i wraca stamtąd,
/// więc to, co widać na ekranie, jest tym, co widać na `/finanse`.
struct CrmCompanyView: View {
    @Binding var section: CrmSection

    @EnvironmentObject private var crm: CrmStore
    @EnvironmentObject private var locale: AppLocale

    @Binding var editingEntry: CrmEntry?
    @Binding var editingCommitment: CrmCommitment?
    @Binding var editingClient: CrmClient?
    @Binding var creating: Bool

    var body: some View {
        VStack(spacing: 0) {
            if crm.connected == false {
                notConnected
            } else {
                sectionBar
                if section.isMonthly { monthBar }
                content
            }
        }
        .task { crm.ensureLoaded() }
    }

    // MARK: - Paski

    /// „Bank" pokazuje się tylko, gdy CRM oddał przynajmniej jeden rachunek.
    private var sections: [CrmSection] {
        CrmSection.allCases.filter { $0 != .bank || crm.hasBank }
    }

    private var sectionBar: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 6) {
                ForEach(sections) { item in
                    PickChip(label: locale.t(item.labelKey), active: section == item) {
                        section = item
                    }
                }
            }
            .padding(.horizontal, Theme.Spacing.md)
        }
        .padding(.vertical, Theme.Spacing.sm)
    }

    /// Strzałki po miesiącach — odpowiednik nawigacji nad tabelą w `/finanse`.
    private var monthBar: some View {
        HStack {
            arrow("chevron.left", label: locale.t("crm.prevMonth")) { crm.shiftMonth(by: -1) }
            Spacer()
            Text(Fmt.monthYear(crm.month))
                .font(AppFont.captionMedium)
                .foregroundColor(Theme.foreground)
            Spacer()
            arrow("chevron.right", label: locale.t("crm.nextMonth")) { crm.shiftMonth(by: 1) }
        }
        .padding(.horizontal, Theme.Spacing.md)
        .padding(.bottom, Theme.Spacing.sm)
    }

    private func arrow(_ icon: String, label: String, action: @escaping () -> Void) -> some View {
        Button {
            Haptics.selection()
            action()
        } label: {
            Image(systemName: icon)
                .font(.system(size: 12, weight: .semibold))
                .foregroundColor(Theme.mutedForeground)
                .frame(width: 32, height: 28)
                .paperCard(radius: Theme.Radius.md, shadow: 0)
        }
        .accessibilityLabel(label)
    }

    // MARK: - Treść

    @ViewBuilder
    private var content: some View {
        switch section {
        case .all, .income, .expense:
            CrmEntriesList(type: section.entryType, editing: $editingEntry, creating: $creating)
        case .commitments:
            CrmCommitmentsList(editing: $editingCommitment, creating: $creating)
        case .clients:
            CrmClientsList(editing: $editingClient, creating: $creating)
        case .bank:
            if crm.hasBank {
                CrmBankList()
            } else {
                CrmEntriesList(type: nil, editing: $editingEntry, creating: $creating)
            }
        }
    }

    private var notConnected: some View {
        EmptyStateView(
            icon: "link.badge.plus",
            title: locale.t("crm.notConnected"),
            subtitle: locale.t("crm.notConnectedHint")
        )
        .padding(.top, Theme.Spacing.lg)
    }
}
