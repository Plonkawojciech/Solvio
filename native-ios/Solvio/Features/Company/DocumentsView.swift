import SwiftUI

/// Faktury albo koszty: filtr podmiotu i statusu, szukanie, dociąganie stron.
struct DocumentsView: View {
    let direction: DocumentDirection

    @EnvironmentObject private var accounting: AccountingStore
    @EnvironmentObject private var locale: AppLocale

    @State private var entity: String?
    @State private var status: DocumentStatusFilter?
    @State private var text = ""
    /// Fraza, o którą naprawdę pytamy — dopiero po chwili przerwy w pisaniu.
    @State private var phrase = ""

    init(direction: DocumentDirection, status: DocumentStatusFilter?) {
        self.direction = direction
        _status = State(initialValue: status)
    }

    private var query: DocumentQuery {
        DocumentQuery(direction: direction, entity: entity, status: status, text: phrase)
    }

    var body: some View {
        ZStack {
            PaperBackground()
            VStack(spacing: Theme.Spacing.sm) {
                searchField.padding(.horizontal, Theme.Spacing.md)
                ChipBar {
                    PickChip(label: locale.t("company.filter.all"), active: status == nil) { status = nil }
                    ForEach(DocumentStatusFilter.allCases) { item in
                        PickChip(label: locale.t(item.labelKey), active: status == item) {
                            status = status == item ? nil : item
                        }
                    }
                }
                EntityChips(selection: $entity)
                DocumentsList(
                    list: accounting.documents(query),
                    filtered: status != nil || entity != nil || !phrase.isEmpty,
                    visit: accounting.webVisits
                )
                    .id(query)
            }
            .padding(.top, Theme.Spacing.sm)
        }
        .navigationTitle(locale.t(direction.titleKey))
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                NewDocumentButton(direction: direction, entity: entity) { Image(systemName: "plus") }
                    .foregroundColor(Theme.primary)
                    .accessibilityLabel(locale.t(direction.newKey))
            }
        }
        .task(id: text) {
            let next = text.trimmingCharacters(in: .whitespacesAndNewlines)
            guard next != phrase else { return }
            if !next.isEmpty { try? await Task.sleep(nanoseconds: 350_000_000) }
            if !Task.isCancelled { phrase = next }
        }
    }

    private var searchField: some View {
        HStack(spacing: Theme.Spacing.sm) {
            Image(systemName: "magnifyingglass")
                .font(.system(size: 13))
                .foregroundColor(Theme.mutedForeground)
            TextField(locale.t("company.searchDocuments"), text: $text)
                .font(AppFont.body)
                .autocorrectionDisabled()
                .submitLabel(.search)
            if !text.isEmpty {
                Button {
                    text = ""
                } label: {
                    Image(systemName: "xmark.circle.fill")
                        .font(.system(size: 14))
                        .foregroundColor(Theme.mutedForeground)
                }
                .accessibilityLabel(locale.t("company.clearSearch"))
            }
        }
        .padding(.horizontal, Theme.Spacing.sm + 2)
        .frame(minHeight: 40)
        .paperCard(radius: Theme.Radius.md, shadow: 0)
    }
}

private struct DocumentsList: View {
    @ObservedObject var list: PagedList<AccountingDocument>
    let filtered: Bool
    let visit: Int

    @EnvironmentObject private var locale: AppLocale
    @EnvironmentObject private var router: AppRouter

    var body: some View {
        ScrollView {
            VStack(spacing: Theme.Spacing.md) {
                if list.failed { StaleNotice { Task { await list.refresh() } } }
                if !list.items.isEmpty {
                    RowsCard(items: list.items, onLast: { Task { await list.loadMore() } }) { item in
                        Button {
                            Haptics.selection()
                            router.push(.document(item))
                        } label: {
                            DocumentRow(item: item)
                        }
                        .buttonStyle(.plain)
                    }
                    LoadMoreFooter(list: list)
                } else if list.isLoading || (list.loadedAt == nil && !list.failed) {
                    ForEach(0..<6, id: \.self) { _ in SkeletonBlock(height: 60) }
                } else if !list.failed {
                    EmptyStateView(
                        icon: "doc.text",
                        title: locale.t(filtered ? "company.noMatches" : "company.noDocuments")
                    )
                }
            }
            .padding(.horizontal, Theme.Spacing.md)
            .padding(.top, Theme.Spacing.xs)
            .padding(.bottom, 96)
        }
        .scrollDismissesKeyboard(.immediately)
        .refreshable { await list.refresh() }
        .task(id: visit) { await list.ensureFresh() }
    }
}

private struct DocumentRow: View {
    let item: AccountingDocument
    @EnvironmentObject private var locale: AppLocale

    var body: some View {
        CompanyRow(
            lead: Fmt.dayMonth(item.issueDate),
            title: item.partyName.isEmpty ? item.number : item.partyName,
            subtitle: [item.partyName.isEmpty ? "" : item.number, item.entityName].filter { !$0.isEmpty }.joined(separator: " · "),
            value: CompanyFormat.amount(item.gross, currency: item.currency),
            valueColor: item.isOverdue ? Theme.destructive : Theme.foreground,
            note: locale.documentStatus(item),
            noteColor: item.paid ? Theme.success : (item.isOverdue ? Theme.destructive : Theme.warning)
        )
    }
}

extension AppLocale {
    func documentStatus(_ item: AccountingDocument) -> String {
        if item.paid { return t("company.paid") }
        if item.isOverdue { return pluralized("company.overdueDays", count: item.daysOverdue) }
        return t("company.unpaid")
    }
}

// MARK: - Szczegół

/// Szczegół dokumentu. Status zapłaty zmienia się wyłącznie przez wpis
/// w Finansach; dokument bez wpisu jest tylko do podglądu.
struct DocumentDetailView: View {
    let initial: AccountingDocument

    @EnvironmentObject private var accounting: AccountingStore
    @EnvironmentObject private var crm: CrmStore
    @EnvironmentObject private var locale: AppLocale
    @EnvironmentObject private var toast: ToastCenter

    @State private var saving = false

    private var item: AccountingDocument { accounting.current(initial) }

    var body: some View {
        ZStack {
            PaperBackground()
            ScrollView {
                VStack(alignment: .leading, spacing: Theme.Spacing.md) {
                    headerCard
                    amountsCard
                    actions
                    detailsCard
                }
                .padding(Theme.Spacing.md)
                .padding(.bottom, 96)
            }
        }
        .navigationTitle(locale.t(item.direction == .sale ? "company.invoice" : "company.cost"))
        .navigationBarTitleDisplayMode(.inline)
    }

    private var headerCard: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.sm) {
            SectionLabel(text: item.entityName)
            Text(CompanyFormat.amount(item.gross, currency: item.currency))
                .font(AppFont.hero)
                .foregroundColor(item.isOverdue ? Theme.destructive : Theme.foreground)
                .lineLimit(1)
                .minimumScaleFactor(0.5)
            Text(item.partyName.isEmpty ? item.number : item.partyName)
                .font(AppFont.sectionTitle)
                .foregroundColor(Theme.foreground)
            Text(locale.documentStatus(item))
                .font(AppFont.captionMedium)
                .foregroundColor(item.paid ? Theme.success : (item.isOverdue ? Theme.destructive : Theme.warning))
        }
        .padding(Theme.Spacing.md)
        .frame(maxWidth: .infinity, alignment: .leading)
        .paperCard()
    }

    private var amountsCard: some View {
        PaperCard(label: locale.t("company.amounts")) {
            DetailLines(entries: [
                .init(label: locale.t("company.net"), value: CompanyFormat.amount(item.net, currency: item.currency)),
                .init(label: "VAT", value: CompanyFormat.amount(item.vat, currency: item.currency)),
                .init(label: locale.t("company.gross"), value: CompanyFormat.amount(item.gross, currency: item.currency), emphasized: true),
            ])
        }
    }

    private var detailsCard: some View {
        PaperCard(label: locale.t("expenses.details")) {
            DetailLines(entries: [
                .init(label: locale.t("company.number"), value: item.number),
                .init(label: locale.t("company.docType"), value: item.docType),
                .init(label: "NIP", value: item.partyNip),
                .init(label: locale.t("company.issueDate"), value: item.issueDate.isEmpty ? "" : Fmt.date(item.issueDate)),
                .init(label: locale.t("company.dueDate"), value: item.dueDate.map { Fmt.date($0) } ?? "",
                      color: item.isOverdue ? Theme.destructive : Theme.foreground),
                .init(label: locale.t("company.paidAt"), value: item.paidAt.map { Fmt.date($0) } ?? ""),
                .init(label: locale.t("company.vatPeriod"), value: CompanyFormat.period(item.vatPeriod)),
                .init(label: "KSeF", value: item.ksefNumber),
            ])
        }
    }

    private var actions: some View {
        VStack(spacing: Theme.Spacing.sm) {
            if item.financeEntryId != nil {
                // Cofnięcie zapłaty to wyjątek, a nie zachęta.
                if item.paid {
                    paidButton.buttonStyle(SecondaryButtonStyle())
                } else {
                    paidButton.buttonStyle(PrimaryButtonStyle())
                }
            }
            SolvioWebLink(path: item.webPath)
        }
    }

    private var paidButton: some View {
        Button {
            togglePaid()
        } label: {
            HStack(spacing: 6) {
                if saving {
                    ProgressView().controlSize(.small)
                } else {
                    Image(systemName: item.paid ? "circle" : "checkmark.circle")
                }
                Text(locale.t(item.paid ? "crm.markUnpaid" : "crm.markPaid"))
            }
        }
        .disabled(saving)
    }

    private func togglePaid() {
        let target = !item.paid
        saving = true
        Task {
            defer { saving = false }
            do {
                let fresh = try await accounting.setPaid(item, paid: target)
                // CRM zapisał wpis; czy dokument poszedł za nim, mówi jego odpowiedź.
                if fresh?.paid == target {
                    toast.success(locale.t("crm.saved"))
                } else {
                    toast.info(locale.t(fresh == nil ? "company.paidUnknown" : "company.paidPending"))
                }
                await crm.reload()
            } catch {
                Log.error(.crm, "nie udało się zmienić statusu zapłaty dokumentu", error)
                toast.error(locale.t("crm.saveFailed"))
            }
        }
    }
}
