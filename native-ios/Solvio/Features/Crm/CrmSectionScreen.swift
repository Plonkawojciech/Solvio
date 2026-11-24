import SwiftUI

/// Rejestry Finansów CRM-a otwierane z zakładki Firma. Odpowiadają temu, czym
/// da się sterować na `/finanse`: wpisom miesiąca, transakcjom z banku,
/// seriom cyklicznym i klientom.
enum CrmRegistry: String, Hashable {
    case entries, bank, commitments, clients

    var titleKey: String {
        switch self {
        case .entries:     return "company.entries"
        case .bank:        return "crm.bank"
        case .commitments: return "crm.commitments"
        case .clients:     return "crm.clientsSection"
        }
    }

    /// Wpisy i transakcje są miesięczne, rejestry nie — pasek miesiąca nad
    /// listą klientów byłby myleniem tropu.
    var isMonthly: Bool { self == .entries || self == .bank }

    /// Co doda „+". Bank jest tylko do podglądu.
    var addLabelKey: String? {
        switch self {
        case .entries:     return "crm.newEntry"
        case .commitments: return "crm.newCommitment"
        case .clients:     return "crm.newClient"
        case .bank:        return nil
        }
    }
}

/// Ekran jednego rejestru. Nie trzymamy tu kopii danych: każda zmiana leci do
/// CRM-a i wraca stamtąd, więc to, co widać na ekranie, jest tym, co widać
/// na `/finanse`.
struct CrmSectionScreen: View {
    let registry: CrmRegistry

    @EnvironmentObject private var crm: CrmStore
    @EnvironmentObject private var accounting: AccountingStore
    @EnvironmentObject private var locale: AppLocale

    /// „INCOME", „EXPENSE" albo `nil` = wszystko.
    @State private var entryType: String?
    @State private var editingEntry: CrmEntry?
    @State private var editingCommitment: CrmCommitment?
    @State private var editingClient: CrmClient?
    @State private var creating = false

    var body: some View {
        ZStack {
            PaperBackground()
            VStack(spacing: 0) {
                if registry == .entries { typeBar }
                if registry.isMonthly { monthBar }
                content
                Spacer(minLength: 0)
            }
        }
        .navigationTitle(locale.t(registry.titleKey))
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                if let key = registry.addLabelKey {
                    Button { creating = true } label: { Image(systemName: "plus") }
                        .foregroundColor(Theme.primary)
                        .accessibilityLabel(locale.t(key))
                } else if accounting.available == true {
                    SolvioWebLink(path: SolvioWeb.bankPath, compact: true)
                }
            }
        }
        .sheet(item: $editingEntry) { CrmEntryEditorSheet(entry: $0) }
        .sheet(item: $editingCommitment) { CrmCommitmentEditorSheet(commitment: $0) }
        .sheet(item: $editingClient) { CrmClientEditorSheet(client: $0) }
        .sheet(isPresented: $creating) { newSheet }
        .task { crm.ensureLoaded() }
    }

    @ViewBuilder
    private var newSheet: some View {
        switch registry {
        case .commitments: CrmCommitmentEditorSheet(commitment: nil)
        case .clients:     CrmClientEditorSheet(client: nil)
        default:           CrmEntryEditorSheet(entry: nil)
        }
    }

    // MARK: - Paski

    private var typeBar: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 6) {
                PickChip(label: locale.t("crm.sectionAll"), active: entryType == nil) { entryType = nil }
                PickChip(label: locale.t("crm.income"), active: entryType == "INCOME") { entryType = "INCOME" }
                PickChip(label: locale.t("crm.costs"), active: entryType == "EXPENSE") { entryType = "EXPENSE" }
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
        .padding(.top, registry == .entries ? 0 : Theme.Spacing.sm)
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
                .frame(width: 44, height: 44)
                .contentShape(Rectangle())
        }
        .accessibilityLabel(label)
    }

    // MARK: - Treść

    @ViewBuilder
    private var content: some View {
        switch registry {
        case .entries:
            CrmEntriesList(type: entryType, editing: $editingEntry, creating: $creating)
        case .bank:
            CrmBankList()
        case .commitments:
            CrmCommitmentsList(editing: $editingCommitment, creating: $creating)
        case .clients:
            CrmClientsList(editing: $editingClient, creating: $creating)
        }
    }
}
