import Foundation
import SwiftUI

/// Księgowość firmy z CRM-a: terminy, przegląd podmiotów, dokumenty, JPK,
/// wyjątki „Wymaga uwagi".
/// Stale-while-revalidate jak `CrmStore`; dane żyją tylko w pamięci procesu.
///
/// `available == false` znaczy „nie ma czego pokazać" (backend albo CRM bez
/// tych tras, klucz bez dostępu) — wtedy sekcje znikają bez komunikatu o błędzie.
@MainActor
final class AccountingStore: ObservableObject {
    @Published private(set) var available: Bool?
    @Published private(set) var overview: AccountingOverview?
    /// Komplet otwartych terminów — z niego liczy się „Do zapłaty" i przypomnienia.
    @Published private(set) var openObligations: [AccountingObligation] = []
    /// Wyjątki do rozstrzygnięcia. Puste także wtedy, gdy CRM nie ma tej trasy.
    @Published private(set) var todo: [AccountingTodoItem] = []
    @Published private(set) var todoFailed = false
    @Published private(set) var loading = false
    @Published private(set) var failed = false
    @Published private(set) var loadedAt: Date?
    /// Rośnie po każdym zamknięciu weba; otwarta lista odświeża się wtedy sama.
    @Published private(set) var webVisits = 0
    /// Ostatnia znana wersja dokumentu — szczegół odświeża się razem z listą.
    @Published private var documentIndex: [String: AccountingDocument] = [:]
    @Published private var obligationIndex: [String: AccountingObligation] = [:]

    /// Wołane po każdym udanym odświeżeniu terminów.
    var onObligations: (([AccountingObligation]) -> Void)?

    private let api: AccountingAPI
    private let ttl: TimeInterval = 120
    /// Czyje to dane: rośnie przy czyszczeniu.
    private var generation = 0
    /// Które to wczytanie: wynik starszego jest odrzucany.
    private var loadId = 0
    /// Które to czytanie dokumentu ze szczegółu; zapis zapłaty też je unieważnia.
    private var documentRead = 0
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

    /// Odświeżenie po zapisie. Żądanie w locie mogło ruszyć przed nim i przyniosłoby
    /// stan sprzed zmiany, więc nie dołączamy do niego.
    func reload() async {
        task?.cancel()
        task = nil
        await start().value
    }

    /// Zamknięto web: wszystko, co firmowe, mogło się tam zmienić.
    func webClosed() async {
        documentLists.values.forEach { $0.markStale() }
        obligationLists.values.forEach { $0.markStale() }
        jpkList?.markStale()
        webVisits += 1
        await reload()
    }

    @discardableResult
    private func start() -> Task<Void, Never> {
        if let task { return task }
        loadId += 1
        let mine = loadId
        let work = Task { await load(mine) }
        task = work
        return work
    }

    private func load(_ mine: Int) async {
        // Wylogowanie mogło nastąpić, zanim zadanie w ogóle ruszyło.
        guard mine == loadId else { return }
        loading = true
        defer {
            if mine == loadId {
                loading = false
                task = nil
            }
        }
        // 404 znaczy „tu nie ma księgowości" tylko na wejściu. Gdy już raz
        // odpowiedziała, to awaria: np. CRM w trakcie wdrożenia.
        var known = available == true
        do {
            let fresh = try await api.overview()
            guard mine == loadId else { return }
            guard !fresh.entities.isEmpty else { return hide(cancelReminders: true) }
            known = true
            async let exceptions = fetchTodo()
            let open = try await allOpenObligations()
            let found = await exceptions
            guard mine == loadId else { return }
            show(found)
            overview = fresh
            openObligations = ObligationSchedule.sorted(open)
            available = true
            failed = false
            loadedAt = Date()
            onObligations?(openObligations)
        } catch {
            guard mine == loadId else { return }
            if case ApiError.cancelled = error { return }
            if case ApiError.notFound = error, !known { return hide(cancelReminders: false) }
            failed = true
            Log.error(.crm, "nie udało się wczytać księgowości", error)
        }
    }

    private func fetchTodo() async -> Result<[AccountingTodoItem], Error> {
        do { return .success(try await api.todo()) } catch { return .failure(error) }
    }

    /// Brak trasy (404) chowa kartę; awaria zostawia to, co widać, i mówi o tym,
    /// bo brak wyjątków wyglądałby jak „wszystko w porządku".
    private func show(_ result: Result<[AccountingTodoItem], Error>) {
        switch result {
        case .success(let items):
            todo = items
            todoFailed = false
        case .failure(ApiError.notFound):
            todo = []
            todoFailed = false
        case .failure(ApiError.cancelled):
            break
        case .failure(let error):
            todoFailed = true
            Log.error(.crm, "nie udało się wczytać wyjątków", error)
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

    /// Niedostępna księgowość (404) nie odwołuje przypomnień: terminy nadal biegną.
    /// Pusta lista podmiotów odwołuje, bo konto nie ma już do nich dostępu.
    private func hide(cancelReminders: Bool) {
        available = false
        overview = nil
        openObligations = []
        todo = []
        todoFailed = false
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
        let list = PagedList<AccountingObligation>(
            onItems: { [weak self] in self?.remember($0) },
            fetch: { [api] cursor in try await api.obligations(open: false, entity: entity, cursor: cursor) }
        )
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

    func current(_ obligation: AccountingObligation) -> AccountingObligation {
        openObligations.first { $0.id == obligation.id } ?? obligationIndex[obligation.id] ?? obligation
    }

    /// Termin zniknął z otwartych, czyli ktoś go odhaczył na webie. Nowy status
    /// zna tylko pełna lista, od najnowszych.
    func settleObligation(_ obligation: AccountingObligation) async {
        guard available == true, current(obligation).isOpen,
              !openObligations.contains(where: { $0.id == obligation.id })
        else { return }
        let mine = generation
        let entity = obligation.entityKey.isEmpty ? nil : obligation.entityKey
        var cursor: String?
        for _ in 0..<Self.lookupPages {
            guard let page = try? await api.obligations(open: false, entity: entity, cursor: cursor),
                  mine == generation
            else { return }
            if let fresh = page.items.first(where: { $0.id == obligation.id }) { return remember([fresh]) }
            guard let next = page.nextCursor, next != cursor else { return }
            cursor = next
        }
    }

    private func remember(_ obligations: [AccountingObligation]) {
        for obligation in obligations { obligationIndex[obligation.id] = obligation }
    }

    private func remember(_ documents: [AccountingDocument]) {
        for document in documents { documentIndex[document.id] = document }
    }

    // MARK: - Zapłata

    /// Tyle stron przeglądamy, szukając jednego wiersza.
    private static let lookupPages = 10

    /// Zmienia status wpisu w Finansach i pyta CRM o dokument. Wynik jest
    /// tym, co CRM odpowiedział, a nie tym, o co poprosiliśmy; `nil` znaczy, że
    /// zapis przeszedł, ale dokumentu nie udało się odczytać.
    @discardableResult
    func setPaid(_ document: AccountingDocument, paid: Bool) async throws -> AccountingDocument? {
        guard let entryId = document.financeEntryId else { return nil }
        let mine = generation
        try await api.setEntryPaid(id: entryId, paid: paid)
        guard mine == generation else { return nil }
        documentRead += 1

        let fresh = await find(document)
        guard mine == generation else { return nil }
        if let fresh { show(fresh) }
        for (query, list) in documentLists where query.direction == document.direction && list.loadedAt != nil {
            Task { await list.refresh(keepingDepth: true) }
        }
        Task { await reload() }
        return fresh
    }

    /// Po powrocie z weba. Lista pod szczegółem się nie odświeża, a zapłacony
    /// dokument wypada z filtra „nieopłacone", więc pytamy o niego wprost.
    /// `false` znaczy, że nie udało się go odczytać.
    func refreshDocument(_ document: AccountingDocument) async -> Bool {
        documentRead += 1
        let mine = documentRead
        let account = generation
        let fresh = await find(document)
        // Nowszy odczyt albo zapis zapłaty pokaże własny wynik.
        guard mine == documentRead, account == generation else { return true }
        if let fresh { show(fresh) }
        return fresh != nil
    }

    private func show(_ document: AccountingDocument) {
        remember([document])
        documentLists.values.forEach { $0.replace(document) }
    }

    /// Fraza to tylko zawężenie (numer bywa pusty albo wspólny dla wielu),
    /// więc dokument może leżeć na dalszej stronie.
    private func find(_ document: AccountingDocument) async -> AccountingDocument? {
        let id = document.id
        let query = DocumentQuery(
            direction: document.direction, entity: document.entityKey.isEmpty ? nil : document.entityKey,
            status: nil, text: document.number
        )
        var cursor: String?
        for _ in 0..<Self.lookupPages {
            guard let page = try? await api.documents(query, cursor: cursor) else { return nil }
            if let found = page.items.first(where: { $0.id == id }) { return found }
            guard let next = page.nextCursor, next != cursor else { return nil }
            cursor = next
        }
        return nil
    }

    // MARK: - Czyszczenie

    func reset() {
        generation += 1
        loadId += 1
        task?.cancel()
        task = nil
        documentLists.values.forEach { $0.invalidate() }
        obligationLists.values.forEach { $0.invalidate() }
        jpkList?.invalidate()
        documentLists = [:]
        obligationLists = [:]
        jpkList = nil
        documentIndex = [:]
        obligationIndex = [:]
        available = nil
        overview = nil
        openObligations = []
        todo = []
        todoFailed = false
        loading = false
        failed = false
        loadedAt = nil
    }
}
