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

    func testQtyNonEmpty() {
        XCTAssertFalse(Fmt.qty(1.5).isEmpty)
    }
}
