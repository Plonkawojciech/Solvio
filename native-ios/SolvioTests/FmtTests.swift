import XCTest
@testable import Solvio

/// Locale-independent assertions only — we avoid asserting on currency
/// symbols / localized month names which vary by device locale.
final class FmtTests: XCTestCase {

    func testInitials() {
        XCTAssertEqual(Fmt.initials("Jan Kowalski"), "JK")
        XCTAssertEqual(Fmt.initials("madonna"), "M")
        XCTAssertEqual(Fmt.initials("a b c"), "AB") // capped at 2
        XCTAssertEqual(Fmt.initials(""), "")
    }

    func testParseISOPlainDate() {
        XCTAssertNotNil(Fmt.parseISO("2026-05-29"))
    }

    func testParseISOFullDateTime() {
        XCTAssertNotNil(Fmt.parseISO("2026-05-29T10:00:00Z"))
    }

    func testParseISOFractionalSeconds() {
        XCTAssertNotNil(Fmt.parseISO("2026-05-29T10:00:00.123Z"))
    }

    func testParseISOGarbageReturnsNil() {
        XCTAssertNil(Fmt.parseISO("not-a-date"))
    }

    func testDateNilReturnsDash() {
        XCTAssertEqual(Fmt.date(nil), "—")
    }

    func testDateGarbagePassthrough() {
        XCTAssertEqual(Fmt.date("xyz"), "xyz")
    }

    func testDayMonthNilReturnsDash() {
        XCTAssertEqual(Fmt.dayMonth(nil), "—")
    }

    func testInstantUsesTheLocalDay() throws {
        // Każda strefa poza UTC ma godzinę, o której lokalny dzień jest inny niż w tekście.
        for hour in 0..<24 {
            let iso = String(format: "2026-11-24T%02d:30:00.000Z", hour)
            let date = try XCTUnwrap(Fmt.parseISO(iso))
            let local = Calendar.current.dateComponents([.year, .month, .day], from: date)
            let day = String(format: "%04d-%02d-%02d", local.year!, local.month!, local.day!)
            XCTAssertEqual(Fmt.dayMonth(instant: iso), Fmt.dayMonth(day), iso)
        }
        XCTAssertEqual(Fmt.dayMonth(instant: "2026-11-24"), Fmt.dayMonth("2026-11-24"))
        XCTAssertEqual(Fmt.dayMonth(instant: "xyz"), "xyz")
    }

    func testQtyNonEmpty() {
        XCTAssertFalse(Fmt.qty(1.5).isEmpty)
    }
}
