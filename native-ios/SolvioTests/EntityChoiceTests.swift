import XCTest
@testable import Solvio

final class EntityChoiceTests: XCTestCase {
    private let two = Fixture.overview(entities: 2).entities

    func testFilterDecidesWithoutAsking() {
        XCTAssertEqual(EntityChoice.resolve(filter: "e1", entities: two), .entity("e1"))
    }

    func testAsksWithoutAFilterOrWhenTheEntityIsGone() {
        XCTAssertEqual(EntityChoice.resolve(filter: nil, entities: two), .ask)
        XCTAssertEqual(EntityChoice.resolve(filter: "e9", entities: two), .ask)
    }

    func testSingleEntityNeedsNoChoice() {
        XCTAssertEqual(EntityChoice.resolve(filter: nil, entities: Fixture.overview().entities), .entity("e0"))
    }

    func testLastPickedComesFirst() {
        XCTAssertEqual(EntityChoice.ordered(two, last: "e1").map(\.key), ["e1", "e0"])
        XCTAssertEqual(EntityChoice.ordered(two, last: nil).map(\.key), ["e0", "e1"])
        XCTAssertEqual(EntityChoice.ordered(two, last: "zniknął").map(\.key), ["e0", "e1"])
    }

    func testLastPickedIsKeptPerAccount() throws {
        let suite = "solvio.tests.lastEntity"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }
        let last = LastEntity(defaults: defaults)
        last.set("spolka", account: "a@example.com")
        last.set("wojtek", account: "b@example.com")
        XCTAssertEqual(LastEntity(defaults: defaults).get("a@example.com"), "spolka")
        XCTAssertEqual(last.get("b@example.com"), "wojtek")
        XCTAssertNil(last.get("c@example.com"))
        XCTAssertNil(last.get(nil))
        last.set("bartek", account: nil)
        XCTAssertNil(last.get(nil))
    }
}

@MainActor
final class AppRouterTests: XCTestCase {
    func testSignOutClosesTheWebAndThePicker() {
        let router = AppRouter()
        router.web = WebPage(path: "/finanse")
        router.newDocument = .sale
        router.pendingWeb = WebPage(path: "/finanse")
        router.reset()
        XCTAssertNil(router.web)
        XCTAssertNil(router.newDocument)
        XCTAssertNil(router.pendingWeb)
    }

    func testNewKeyClosesCompanyScreens() {
        let router = AppRouter()
        router.selectedTab = .company
        router.push(.todo)
        router.newDocument = .purchase
        router.leaveCompany()
        XCTAssertTrue(router.companyStack.isEmpty)
        XCTAssertNil(router.newDocument)
        XCTAssertEqual(router.selectedTab, .dashboard)
    }
}
