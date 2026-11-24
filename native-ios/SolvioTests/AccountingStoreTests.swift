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

    func testDocumentWithoutFinanceEntryIsNeverWritten() async throws {
        try await AccountingStore(api: api).setPaid(Fixture.document(id: "1", financeEntryId: nil), paid: true)
        XCTAssertTrue(api.paidCalls.isEmpty)
    }
}
