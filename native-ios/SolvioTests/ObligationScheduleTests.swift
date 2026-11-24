import XCTest
@testable import Solvio

final class ObligationScheduleTests: XCTestCase {
    private var calendar: Calendar = {
        var c = Calendar(identifier: .gregorian)
        c.timeZone = TimeZone(identifier: "Europe/Warsaw")!
        return c
    }()

    private let now = Fixture.date("2026-11-24T14:00:00+01:00")

    func testWindowIsOverduePlusThirtyDays() {
        let items = [
            Fixture.obligation(id: "late", due: "2026-09-20"),
            Fixture.obligation(id: "today", due: "2026-11-24"),
            Fixture.obligation(id: "day30", due: "2026-12-24"),
            Fixture.obligation(id: "day31", due: "2026-12-25"),
            Fixture.obligation(id: "unclear", due: "2026-12-01", status: "UNCLEAR"),
            Fixture.obligation(id: "done", due: "2026-12-01", status: "DONE"),
            Fixture.obligation(id: "skipped", due: "2026-11-01", status: "SKIPPED"),
        ]
        let due = ObligationSchedule.due(items, now: now, calendar: calendar)
        XCTAssertEqual(due.map(\.id), ["late", "today", "unclear", "day30"])
        XCTAssertEqual(ObligationSchedule.overdue(items, now: now, calendar: calendar).map(\.id), ["late"])
    }

    func testDaysComeFromDateNotFromServerCounter() {
        // `daysLeft` w danych testowych to 500.
        XCTAssertEqual(ObligationSchedule.daysLeft(Fixture.obligation(due: "2026-11-25"), now: now, calendar: calendar), 1)
        XCTAssertEqual(ObligationSchedule.daysLeft(Fixture.obligation(due: "2026-11-23"), now: now, calendar: calendar), -1)
        XCTAssertEqual(ObligationSchedule.daysLeft(Fixture.obligation(due: ""), now: now, calendar: calendar), 500)
    }

    func testLateEveningStillCountsWholeDays() {
        let late = Fixture.date("2026-11-24T23:59:00+01:00")
        XCTAssertEqual(ObligationSchedule.daysLeft(Fixture.obligation(due: "2026-11-25"), now: late, calendar: calendar), 1)
    }

    func testTotalSkipsTasksAndCountsMissingAmounts() {
        let total = ObligationSchedule.total([
            Fixture.obligation(id: "a", due: "2026-12-01", amount: "100.50"),
            Fixture.obligation(id: "b", due: "2026-12-01", amount: "50", paid: "20"),
            Fixture.obligation(id: "c", kind: "JPK_V7", due: "2026-12-01", amount: "null"),
            Fixture.obligation(id: "d", kind: "ZUS", due: "2026-12-01", amount: "null"),
        ])
        XCTAssertEqual(total.amount, 130.5, accuracy: 0.001)
        XCTAssertEqual(total.missing, 1)
    }

    func testInvalidDates() {
        XCTAssertNil(ObligationSchedule.day("2026-02-30", calendar: calendar))
        XCTAssertNil(ObligationSchedule.day("kiedyś", calendar: calendar))
        XCTAssertNotNil(ObligationSchedule.day("2026-12-25T00:00:00.000Z", calendar: calendar))
    }

    // MARK: - Plan przypomnień

    private func plan(_ items: [AccountingObligation], at date: Date? = nil) -> [ReminderPlan.Item] {
        ReminderPlan.build(items, now: date ?? now, calendar: calendar)
    }

    func testPlansThreeDaysBeforeAndOnTheDayAtNine() {
        let items = plan([Fixture.obligation(id: "vat", due: "2026-12-28")])
        XCTAssertEqual(items.map(\.fireDate), [
            Fixture.date("2026-12-25T09:00:00+01:00"), Fixture.date("2026-12-28T09:00:00+01:00"),
        ])
        XCTAssertEqual(items.map(\.daysBefore), [3, 0])
    }

    func testPastMomentsAreNotPlanned() {
        XCTAssertEqual(plan([Fixture.obligation(due: "2026-11-25")]).map(\.daysBefore), [0])
        XCTAssertTrue(plan([Fixture.obligation(due: "2026-11-24")]).isEmpty, "9:00 dziś już minęła")
        XCTAssertEqual(
            plan([Fixture.obligation(due: "2026-11-24")], at: Fixture.date("2026-11-24T08:59:00+01:00")).count, 1
        )
        XCTAssertTrue(plan([Fixture.obligation(due: "2026-11-01")]).isEmpty)
    }

    func testNineOClockAcrossDaylightSaving() {
        let items = plan([Fixture.obligation(due: "2027-03-29")], at: Fixture.date("2027-03-01T12:00:00+01:00"))
        XCTAssertEqual(items.map(\.fireDate), [
            Fixture.date("2027-03-26T09:00:00+01:00"), Fixture.date("2027-03-29T09:00:00+02:00"),
        ])
    }

    func testClosedObligationsAreNotPlanned() {
        XCTAssertTrue(plan([
            Fixture.obligation(id: "a", due: "2026-12-28", status: "DONE"),
            Fixture.obligation(id: "b", due: "2026-12-28", status: "SKIPPED"),
        ]).isEmpty)
    }

    func testLimitKeepsTheEarliest() {
        let items = plan((1...28).map { Fixture.obligation(id: "o\($0)", due: String(format: "2027-01-%02d", $0)) })
        XCTAssertEqual(items.count, 40)
        XCTAssertEqual(items, items.sorted { $0.fireDate < $1.fireDate || ($0.fireDate == $1.fireDate && $0.identifier < $1.identifier) })
        XCTAssertFalse(items.contains { $0.obligationId == "o28" })
    }

    func testDuplicatedObligationIsPlannedOnce() {
        let item = Fixture.obligation(id: "x", due: "2026-12-28")
        XCTAssertEqual(plan([item, item]).count, 2)
    }
}
