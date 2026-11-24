import XCTest
@testable import Solvio

/// Żaden test nie oddaje sterowania między `setMonth` a `reset`, więc zadanie
/// wczytania nie zdąży wysłać żądania.
@MainActor
final class CrmStoreTests: XCTestCase {
    private var today = Fixture.date("2026-11-28T12:00:00+01:00")

    private func month(_ store: CrmStore) -> String { CrmStore.monthBounds(store.month).from }

    func testCurrentMonthFollowsTheCalendar() {
        let store = CrmStore(now: { self.today })
        XCTAssertEqual(month(store), "2026-11-01")
        today = Fixture.date("2026-12-01T12:00:00+01:00")
        store.rollMonth()
        XCTAssertEqual(month(store), "2026-12-01")
    }

    func testMonthPickedByHandStays() {
        let store = CrmStore(now: { self.today })
        store.shiftMonth(by: -1)
        today = Fixture.date("2026-12-01T12:00:00+01:00")
        store.rollMonth()
        XCTAssertEqual(month(store), "2026-10-01")
        store.reset()
    }

    func testReturningToTheCurrentMonthFollowsAgain() {
        let store = CrmStore(now: { self.today })
        store.shiftMonth(by: -1)
        store.shiftMonth(by: 1)
        today = Fixture.date("2026-12-01T12:00:00+01:00")
        store.rollMonth()
        XCTAssertEqual(month(store), "2026-12-01")
        store.reset()
    }
}
