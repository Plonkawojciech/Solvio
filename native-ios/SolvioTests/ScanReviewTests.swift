import XCTest
@testable import Solvio

/// Wynik skanu przychodzi w dowolnej chwili i nie ma prawa zdjąć otwartego weba.
@MainActor
final class ScanReviewTests: XCTestCase {
    private let router = AppRouter()
    private let queue = ScanQueueManager(store: AppDataStore())

    override func setUp() async throws {
        queue.canPresentReview = { [router] in !router.holdsReview }
    }

    private func review(_ id: String) -> ScanQueueManager.PendingReview {
        .init(
            receiptId: id, expenseId: nil, merchant: nil, total: nil, currency: nil, date: nil,
            categoryId: nil, items: [], promotions: [], totalSaved: nil
        )
    }

    func testReviewShowsAtOnceWhenNothingIsOpen() {
        queue.offer(review("a"))
        XCTAssertEqual(queue.pendingReview?.receiptId, "a")
    }

    func testReviewWaitsForTheWholeWayToTheWeb() {
        router.newDocument = .sale
        queue.offer(review("a"))
        XCTAssertNil(queue.pendingReview)

        router.pendingWeb = WebPage(path: "/finanse")
        router.newDocument = nil
        queue.presentHeldReview()
        XCTAssertNil(queue.pendingReview, "arkusz zszedł, web jeszcze nie wszedł")

        router.web = router.pendingWeb
        router.pendingWeb = nil
        queue.presentHeldReview()
        XCTAssertNil(queue.pendingReview)

        router.web = nil
        queue.presentHeldReview()
        XCTAssertEqual(queue.pendingReview?.receiptId, "a")

        queue.pendingReview = nil
        queue.presentHeldReview()
        XCTAssertNil(queue.pendingReview, "potwierdzenie pokazuje się raz")
    }

    func testHeldReviewDoesNotReachTheNextAccount() {
        router.web = WebPage(path: "/finanse")
        queue.offer(review("a"))
        router.reset()
        queue.dropReview()
        queue.presentHeldReview()
        XCTAssertNil(queue.pendingReview)
    }
}
