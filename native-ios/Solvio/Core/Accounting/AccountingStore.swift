import Foundation
import SwiftUI

/// Księgowość firmy z CRM-a: terminy, przegląd podmiotów, dokumenty, JPK.
/// Stale-while-revalidate jak `CrmStore`; dane żyją tylko w pamięci procesu.
///
/// `available == false` znaczy „nie ma czego pokazać" (backend bez tych tras
/// albo klucz bez dostępu) — wtedy sekcje znikają bez komunikatu o błędzie.
@MainActor
final class AccountingStore: ObservableObject {
    @Published private(set) var available: Bool?
    @Published private(set) var overview: AccountingOverview?
    /// Komplet otwartych terminów — z niego liczy się „Do zapłaty" i przypomnienia.
    @Published private(set) var openObligations: [AccountingObligation] = []
    @Published private(set) var loading = false
    @Published private(set) var failed = false
    @Published private(set) var loadedAt: Date?
    /// Ostatnia znana wersja dokumentu — szczegół odświeża się razem z listą.
    @Published private var documentIndex: [String: AccountingDocument] = [:]

    /// Wołane po każdym udanym odświeżeniu terminów.
    var onObligations: (([AccountingObligation]) -> Void)?

    private let api: AccountingAPI
    private let ttl: TimeInterval = 120
    private var generation = 0
    private var task: Task<Void, Never>?
    private var documentLists: [DocumentQuery: PagedList<AccountingDocument>] = [:]
    private var obligationLists: [String: PagedList<AccountingObligation>] = [:]
    private var jpkList: PagedList<AccountingJpk>?

    init(api: AccountingAPI = AccountingRepo()) {
        self.api = api
    }

    var entities: [AccountingEntity] { overview?.entities ?? [] }
    var receivables: AccountingTotals { .sum(entities.map(\.receivables)) }
    var payables: AccountingTotals { .sum(entities.map(\.payables)) }

    // MARK: - Przegląd i terminy

    func ensureLoaded() {
        if let loadedAt, Date().timeIntervalSince(loadedAt) < ttl { return }
        start()
    }

    func refresh() async { await start().value }

    @discardableResult
    private func start() -> Task<Void, Never> {
        if let task { return task }
        let mine = generation
        let work = Task { await load(mine) }
        task = work
        return work
    }

    private func load(_ mine: Int) async {
        // Wylogowanie mogło nastąpić, zanim zadanie w ogóle ruszyło.
        guard mine == generation else { return }
        loading = true
        defer {
            if mine == generation {
                loading = false
                task = nil
            }
        }
        do {
            let fresh = try await api.overview()
            guard mine == generation else { return }
            guard !fresh.entities.isEmpty else { return hide(cancelReminders: true) }
            let open = try await allOpenObligations()
            guard mine == generation else { return }
            overview = fresh
            openObligations = ObligationSchedule.sorted(open)
            available = true
            failed = false
            loadedAt = Date()
            onObligations?(openObligations)
        } catch {
            guard mine == generation else { return }
            if case ApiError.cancelled = error { return }
            if case ApiError.notFound = error { return hide(cancelReminders: false) }
            failed = true
            Log.error(.crm, "nie udało się wczytać księgowości", error)
        }
    }

    /// Terminów otwartych jest kilkanaście, ale suma z połowy listy byłaby
    /// nieprawdą, więc dociągamy do końca. Limit stron chroni przed pętlą.
    private func allOpenObligations() async throws -> [AccountingObligation] {
        var items: [AccountingObligation] = []
        var cursor: String?
        for _ in 0..<10 {
            let page = try await api.obligations(open: true, entity: nil, cursor: cursor)
            items = PagedList.merge(items, page.items)
            guard let next = page.nextCursor, next != cursor else { break }
            cursor = next
        }
        return items.filter(\.isOpen)
    }

    /// Trasa, której nie ma, nie odwołuje przypomnień: terminy nadal biegną.
    /// Pusta lista podmiotów odwołuje, bo konto nie ma już do nich dostępu.
    private func hide(cancelReminders: Bool) {
        available = false
        overview = nil
        openObligations = []
        failed = false
        loadedAt = Date()
        if cancelReminders { onObligations?([]) }
    }

    // MARK: - Listy

    func documents(_ query: DocumentQuery) -> PagedList<AccountingDocument> {
        if let list = documentLists[query] { return list }
        // Każda wpisana fraza to osobna lista — nie trzymamy ich bez końca.
        if documentLists.count > 24 {
            documentLists = documentLists.filter { $0.key.text.isEmpty }
        }
        let list = PagedList<AccountingDocument>(
            onItems: { [weak self] in self?.remember($0) },
            fetch: { [api] cursor in try await api.documents(query, cursor: cursor) }
        )
        documentLists[query] = list
        return list
    }

    func allObligations(entity: String?) -> PagedList<AccountingObligation> {
        let key = entity ?? ""
        if let list = obligationLists[key] { return list }
        let list = PagedList<AccountingObligation>(fetch: { [api] cursor in
            try await api.obligations(open: false, entity: entity, cursor: cursor)
        })
        obligationLists[key] = list
        return list
    }

    func jpk() -> PagedList<AccountingJpk> {
        if let jpkList { return jpkList }
        let list = PagedList<AccountingJpk>(fetch: { [api] _ in
            AccountingPage(items: try await api.jpk(), nextCursor: nil)
        })
        jpkList = list
        return list
    }

    func current(_ document: AccountingDocument) -> AccountingDocument {
        documentIndex[document.id] ?? document
    }

    private func remember(_ documents: [AccountingDocument]) {
        for document in documents { documentIndex[document.id] = document }
    }

    // MARK: - Zapłata

    /// Zmienia status wpisu w Finansach i pyta CRM o dokument. Wynik jest
    /// tym, co CRM odpowiedział, a nie tym, o co poprosiliśmy.
    func setPaid(_ document: AccountingDocument, paid: Bool) async throws {
        guard let entryId = document.financeEntryId else { return }
        let mine = generation
        try await api.setEntryPaid(id: entryId, paid: paid)
        guard mine == generation else { return }

        let lookup = DocumentQuery(direction: document.direction, entity: document.entityKey.isEmpty ? nil : document.entityKey, status: nil, text: document.number)
        if let page = try? await api.documents(lookup, cursor: nil), mine == generation,
           let fresh = page.items.first(where: { $0.id == document.id }) {
            remember([fresh])
            documentLists.values.forEach { $0.replace(fresh) }
        }
        guard mine == generation else { return }
        for (query, list) in documentLists where query.direction == document.direction && list.loadedAt != nil {
            Task { await list.refresh() }
        }
        Task { await refresh() }
    }

    // MARK: - Czyszczenie

    func reset() {
        generation += 1
        task?.cancel()
        task = nil
        documentLists.values.forEach { $0.invalidate() }
        obligationLists.values.forEach { $0.invalidate() }
        jpkList?.invalidate()
        documentLists = [:]
        obligationLists = [:]
        jpkList = nil
        documentIndex = [:]
        available = nil
        overview = nil
        openObligations = []
        loading = false
        failed = false
        loadedAt = nil
    }
}
