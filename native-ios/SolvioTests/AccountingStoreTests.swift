import XCTest
@testable import Solvio

@MainActor
final class AccountingStoreTests: XCTestCase {
    private let api = FakeAccountingAPI()
    private let offline = ApiError.noConnection

    private func page<T>(_ items: [T], _ next: String? = nil) -> Result<AccountingPage<T>, Error> {
        .success(AccountingPage(items: items, nextCursor: next))
    }

    func testLoadsAllOpenObligationPagesAndReportsThem() async {
        api.obligationPages = [
            "": page([Fixture.obligation(id: "b", due: "2026-12-20")], "c2"),
            "c2": page([Fixture.obligation(id: "a", due: "2026-12-10"), Fixture.obligation(id: "b", due: "2026-12-20")]),
        ]
        let store = AccountingStore(api: api)
        var reported: [String] = []
        store.onObligations = { reported = $0.map(\.id) }
        await store.refresh()
        XCTAssertEqual(store.available, true)
        XCTAssertEqual(store.openObligations.map(\.id), ["a", "b"])
        XCTAssertEqual(reported, ["a", "b"])
    }

    func testMissingRoutesHideSectionsWithoutError() async {
        api.overviewResult = .failure(ApiError.notFound)
        let store = AccountingStore(api: api)
        var reported = false
        store.onObligations = { _ in reported = true }
        await store.refresh()
        XCTAssertEqual(store.available, false)
        XCTAssertFalse(store.failed)
        XCTAssertFalse(reported, "404 nie odwołuje przypomnień")
    }

    func testMissingOverviewAfterLoadKeepsTheScreenAndReminders() async {
        api.obligationPages = ["": page([Fixture.obligation(id: "a", due: "2026-12-10")])]
        let store = AccountingStore(api: api)
        var reports = 0
        store.onObligations = { _ in reports += 1 }
        await store.refresh()
        api.overviewResult = .failure(ApiError.notFound)
        await store.refresh()
        XCTAssertTrue(store.failed)
        XCTAssertEqual(store.available, true)
        XCTAssertEqual(store.openObligations.map(\.id), ["a"])
        XCTAssertEqual(reports, 1, "chwilowe 404 nie odwołuje przypomnień")
    }

    func testMissingObligationsAreAFailureNotAnEmptyList() async {
        api.obligationPages = ["": .failure(ApiError.notFound)]
        let store = AccountingStore(api: api)
        var reported = false
        store.onObligations = { _ in reported = true }
        await store.refresh()
        XCTAssertTrue(store.failed)
        XCTAssertNil(store.available)
        XCTAssertFalse(reported)

        api.obligationPages = ["": page([Fixture.obligation(id: "a", due: "2026-12-10")])]
        await store.refresh()
        api.obligationPages = ["": .failure(ApiError.notFound)]
        await store.refresh()
        XCTAssertTrue(store.failed)
        XCTAssertEqual(store.openObligations.map(\.id), ["a"])
    }

    func testReallyEmptyObligationsCancelReminders() async {
        let store = AccountingStore(api: api)
        var reported: [AccountingObligation]?
        store.onObligations = { reported = $0 }
        await store.refresh()
        XCTAssertEqual(store.available, true)
        XCTAssertEqual(reported, [])
    }

    func testMissingListRouteIsAFailureAndKeepsRows() async {
        api.documentPages = ["": page([Fixture.document(id: "1")])]
        let list = AccountingStore(api: api).documents(DocumentQuery(direction: .sale))
        await list.refresh()
        api.documentPages = ["": .failure(ApiError.notFound)]
        await list.refresh()
        XCTAssertTrue(list.failed)
        XCTAssertEqual(list.items.map(\.id), ["1"])
    }

    func testNoEntitiesHideSectionsAndCancelReminders() async {
        api.overviewResult = .success(Fixture.overview(entities: 0))
        let store = AccountingStore(api: api)
        var reported: [AccountingObligation]?
        store.onObligations = { reported = $0 }
        await store.refresh()
        XCTAssertEqual(store.available, false)
        XCTAssertEqual(reported, [])
    }

    func testNetworkErrorKeepsTheScreen() async {
        api.obligationPages = ["": page([Fixture.obligation(id: "a", due: "2026-12-10")])]
        let store = AccountingStore(api: api)
        await store.refresh()
        api.overviewResult = .failure(offline)
        await store.refresh()
        XCTAssertTrue(store.failed)
        XCTAssertEqual(store.available, true)
        XCTAssertEqual(store.openObligations.map(\.id), ["a"])
        XCTAssertEqual(store.entities.count, 1)
    }

    func testResponseInFlightDoesNotSurviveSignOut() async {
        let gate = Gate()
        api.gate = { await gate.wait() }
        let store = AccountingStore(api: api)
        var reported = false
        store.onObligations = { _ in reported = true }
        let running = Task { await store.refresh() }
        while await gate.arrived == 0 { await Task.yield() }
        XCTAssertTrue(store.loading)
        store.reset()
        await gate.release()
        await running.value
        XCTAssertNil(store.available)
        XCTAssertNil(store.overview)
        XCTAssertFalse(reported)
        XCTAssertFalse(store.loading)
    }

    func testSignOutBeforeTheRequestStarts() async {
        let store = AccountingStore(api: api)
        store.ensureLoaded()
        store.reset()
        for _ in 0..<20 { await Task.yield() }
        XCTAssertNil(store.overview)
        XCTAssertFalse(store.loading)
    }

    func testListsAreDroppedOnReset() async {
        api.documentPages = ["": page([Fixture.document(id: "1")])]
        let store = AccountingStore(api: api)
        let query = DocumentQuery(direction: .sale)
        let list = store.documents(query)
        await list.refresh()
        XCTAssertEqual(list.items.count, 1)
        XCTAssertTrue(store.documents(query) === list, "ta sama lista przy powrocie na ekran")
        store.reset()
        XCTAssertTrue(list.items.isEmpty)
        XCTAssertFalse(store.documents(query) === list)
    }

    func testPagingMergesWithoutDuplicatesAndStops() async {
        api.documentPages = [
            "": page([Fixture.document(id: "1"), Fixture.document(id: "2")], "c2"),
            "c2": page([Fixture.document(id: "2"), Fixture.document(id: "3")], "c2"),
        ]
        let list = AccountingStore(api: api).documents(DocumentQuery(direction: .sale))
        await list.refresh()
        XCTAssertTrue(list.hasMore)
        await list.loadMore()
        XCTAssertEqual(list.items.map(\.id), ["1", "2", "3"])
        XCTAssertFalse(list.hasMore, "powtórzony kursor kończy listę zamiast ją zapętlać")
    }

    func testFailedRefreshAndFailedPageKeepRows() async {
        api.documentPages = ["": page([Fixture.document(id: "1")], "c2"), "c2": .failure(offline)]
        let list = AccountingStore(api: api).documents(DocumentQuery(direction: .sale))
        await list.refresh()
        await list.loadMore()
        XCTAssertTrue(list.loadMoreFailed)
        XCTAssertTrue(list.hasMore, "można ponowić")
        api.documentPages[""] = .failure(offline)
        await list.refresh()
        XCTAssertTrue(list.failed)
        XCTAssertEqual(list.items.map(\.id), ["1"])
    }

    func testPaidGoesThroughFinanceEntryAndShowsCrmAnswer() async throws {
        let before = Fixture.document(id: "1")
        api.documentPages = ["": page([before])]
        let store = AccountingStore(api: api)
        await store.documents(DocumentQuery(direction: .sale)).refresh()

        // CRM zapisał wpis, ale dokument jeszcze się nie zmienił.
        try await store.setPaid(before, paid: true)
        XCTAssertEqual(api.paidCalls.map(\.id), ["fe1"])
        XCTAssertFalse(store.current(before).paid)

        api.documentPages = ["": page([Fixture.document(id: "1", paid: true)])]
        try await store.setPaid(before, paid: true)
        XCTAssertTrue(store.current(before).paid)
    }

    // MARK: - Wymaga uwagi

    func testTodoLoadsWithTheOverview() async {
        api.todoResult = .success([Fixture.todo("a", "pilne"), Fixture.todo("b")])
        let store = AccountingStore(api: api)
        await store.refresh()
        XCTAssertEqual(store.todo.map(\.key), ["a", "b"])
        XCTAssertFalse(store.todoFailed)
        store.reset()
        XCTAssertTrue(store.todo.isEmpty, "wyjątki nie przechodzą na następne konto")
    }

    func testMissingTodoRouteHidesOnlyTheCard() async {
        api.todoResult = .success([Fixture.todo("a")])
        let store = AccountingStore(api: api)
        await store.refresh()
        api.todoResult = .failure(ApiError.notFound)
        await store.refresh()
        XCTAssertTrue(store.todo.isEmpty)
        XCTAssertFalse(store.todoFailed)
        XCTAssertFalse(store.failed)
        XCTAssertEqual(store.available, true)
    }

    func testTodoFailureKeepsRowsAndTheRestOfTheScreen() async {
        api.todoResult = .success([Fixture.todo("a")])
        let store = AccountingStore(api: api)
        await store.refresh()
        api.todoResult = .failure(offline)
        api.obligationPages = ["": page([Fixture.obligation(id: "o", due: "2026-12-10")])]
        await store.refresh()
        XCTAssertEqual(store.todo.map(\.key), ["a"])
        XCTAssertTrue(store.todoFailed)
        XCTAssertFalse(store.failed)
        XCTAssertEqual(store.openObligations.map(\.id), ["o"], "terminy nie czekają na wyjątki")
    }

    // MARK: - Powrót z weba

    func testClosingWebSkipsTTL() async {
        let store = AccountingStore(api: api)
        await store.refresh()
        store.ensureLoaded()
        XCTAssertEqual(api.overviewCalls, 1, "świeże dane nie pytają ponownie")
        api.todoResult = .success([Fixture.todo("a")])
        await store.webClosed()
        XCTAssertEqual(api.overviewCalls, 2)
        XCTAssertEqual(store.todo.map(\.key), ["a"])
        XCTAssertEqual(store.webVisits, 1)
    }

    func testClosingWebDoesNotJoinAnOlderRequest() async {
        let gate = Gate()
        api.gate = { await gate.wait() }
        let store = AccountingStore(api: api)
        let before = Task { await store.refresh() }
        while await gate.arrived == 0 { await Task.yield() }
        // Zmiana na webie zaszła, gdy pierwsze żądanie już było w drodze.
        api.overviewResult = .success(Fixture.overview(entities: 3))
        let after = Task { await store.webClosed() }
        while await gate.arrived < 2 { await Task.yield() }
        await gate.release()
        await before.value
        await after.value
        XCTAssertEqual(store.entities.count, 3)
        XCTAssertFalse(store.loading)
    }

    func testClosingWebRefreshesListsAtTheirDepth() async {
        api.documentPages = [
            "": page([Fixture.document(id: "1"), Fixture.document(id: "2")], "c2"),
            "c2": page([Fixture.document(id: "3")], "c3"),
            "c3": page([Fixture.document(id: "4")]),
        ]
        let store = AccountingStore(api: api)
        let list = store.documents(DocumentQuery(direction: .sale))
        await list.refresh()
        await list.loadMore()
        await list.ensureFresh()
        api.documentPages[""] = page([Fixture.document(id: "new"), Fixture.document(id: "1"), Fixture.document(id: "2")], "c2")
        await list.ensureFresh()
        XCTAssertEqual(list.items.map(\.id), ["1", "2", "3"], "bez wizyty na webie obowiązuje TTL")
        await store.webClosed()
        await list.ensureFresh()
        XCTAssertEqual(list.items.map(\.id), ["new", "1", "2"])
        XCTAssertTrue(list.hasMore)

        // Nieudane odświeżenie zostawia wiersze i ponawia przy następnym wejściu.
        await store.webClosed()
        api.documentPages[""] = .failure(offline)
        await list.ensureFresh()
        XCTAssertEqual(list.items.count, 3)
        api.documentPages[""] = page([Fixture.document(id: "9")])
        await list.ensureFresh()
        XCTAssertEqual(list.items.map(\.id), ["9"])
    }

    func testObligationSettledOnTheWebShowsItsNewStatus() async {
        let open = Fixture.obligation(id: "a", due: "2026-11-20")
        api.obligationPages = ["": page([open])]
        let store = AccountingStore(api: api)
        await store.refresh()
        await store.settleObligation(open)
        XCTAssertTrue(store.current(open).isOpen)

        api.obligationPages = ["": page([])]
        api.allObligationPages = [
            "": page([Fixture.obligation(id: "z", due: "2026-12-20")], "c2"),
            "c2": page([Fixture.obligation(id: "a", due: "2026-11-20", status: "DONE")]),
        ]
        await store.webClosed()
        await store.settleObligation(open)
        XCTAssertEqual(store.current(open).status, .done)
        store.reset()
        XCTAssertEqual(store.current(open).status, .pending, "status nie przechodzi na następne konto")
    }

    func testDocumentChangedOnTheWebIsReadDirectly() async {
        let before = Fixture.document(id: "x")
        api.documentPages = ["": page([before])]
        let store = AccountingStore(api: api)
        let unpaid = store.documents(DocumentQuery(direction: .sale, status: .unpaid))
        await unpaid.refresh()

        api.documentPages = ["": page([Fixture.document(id: "x", paid: true)])]
        await store.webClosed()
        XCTAssertFalse(store.current(before).paid, "sama lista pod szczegółem się nie odświeża")
        let read = await store.refreshDocument(before)
        XCTAssertTrue(read)
        XCTAssertTrue(store.current(before).paid)

        api.documentPages = ["": .failure(offline)]
        let failed = await store.refreshDocument(before)
        XCTAssertFalse(failed)
        XCTAssertTrue(store.current(before).paid, "awaria zostawia ostatni znany stan")
    }

    func testDocumentReadBeforeAPaymentDoesNotOverwriteIt() async throws {
        let before = Fixture.document(id: "x")
        let gate = Gate()
        api.documentPages = ["": page([before])]
        api.gate = { await gate.wait() }
        let store = AccountingStore(api: api)
        let read = Task { await store.refreshDocument(before) }
        while await gate.arrived == 0 { await Task.yield() }

        api.gate = nil
        api.documentPages = ["": page([Fixture.document(id: "x", paid: true)])]
        _ = try await store.setPaid(before, paid: true)
        XCTAssertTrue(store.current(before).paid)
        await gate.release()
        _ = await read.value
        XCTAssertTrue(store.current(before).paid)
    }

    // MARK: - Zapłata poza pierwszą stroną

    func testPaidDocumentIsFoundOnALaterPage() async throws {
        let before = Fixture.document(id: "x")
        api.documentPages = ["": page([Fixture.document(id: "1")], "c2"), "c2": page([before])]
        let store = AccountingStore(api: api)
        let list = store.documents(DocumentQuery(direction: .sale))
        await list.refresh()
        await list.loadMore()

        api.documentPages["c2"] = page([Fixture.document(id: "x", paid: true)])
        let fresh = try await store.setPaid(before, paid: true)
        XCTAssertEqual(fresh?.paid, true)
        XCTAssertTrue(store.current(before).paid)
        while list.isLoading { await Task.yield() }
        XCTAssertEqual(list.items.map(\.id), ["1", "x"], "lista nie zwija się do pierwszej strony")
    }

    func testPaidDocumentThatCannotBeReadIsUnknown() async throws {
        let before = Fixture.document(id: "x")
        let store = AccountingStore(api: api)
        api.documentPages = ["": .failure(offline)]
        let fresh = try await store.setPaid(before, paid: true)
        XCTAssertNil(fresh)
        XCTAssertEqual(api.paidCalls.map(\.id), ["fe1"])
    }

    func testDocumentWithoutFinanceEntryIsNeverWritten() async throws {
        try await AccountingStore(api: api).setPaid(Fixture.document(id: "1", financeEntryId: nil), paid: true)
        XCTAssertTrue(api.paidCalls.isEmpty)
    }
}
